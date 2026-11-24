use crate::brain::prompts::{ChatMessage, SYSTEM_PROMPT_V1};
use crate::config::LlmConfig;
use crate::error::{AppError, AppResult};
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProbeResult {
    pub ttft_ms: u64,
    pub first_op_ms: u64,
    pub model: String,
    pub sample: String,
}

pub fn build_chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") || trimmed.ends_with("/openai") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

pub fn build_http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .tcp_nodelay(true)
        .pool_max_idle_per_host(4)
        .pool_idle_timeout(Duration::from_secs(90))
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(AppError::Http)
}

fn is_local_endpoint(base_url: &str) -> bool {
    let lower = base_url.to_ascii_lowercase();
    lower.contains("127.0.0.1")
        || lower.contains("localhost")
        || lower.contains("11434")
        || lower.contains("8080")
        || lower.contains("1234")
        || lower.contains("ollama")
        || lower.contains("vllm")
        || lower.contains("llama")
}

pub fn build_request_body(
    config: &LlmConfig,
    messages: &[ChatMessage],
    include_extra_body: bool,
) -> Value {
    let mut body = json!({
        "model": config.model,
        "messages": messages,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "stream": true,
    });
    if include_extra_body && config.disable_thinking {
        if let Some(object) = body.as_object_mut() {
            if is_local_endpoint(&config.base_url) {
                object.insert(
                    "chat_template_kwargs".into(),
                    json!({"enable_thinking": false}),
                );
            }
            object.insert("reasoning_effort".into(), json!("none"));
        }
    }
    body
}

fn request_builder(
    client: &reqwest::Client,
    config: &LlmConfig,
    body: &Value,
) -> reqwest::RequestBuilder {
    let mut request = client
        .post(build_chat_completions_url(&config.base_url))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(body);
    if !config.api_key.trim().is_empty() {
        request = request.bearer_auth(config.api_key.trim());
    }
    request
}

/// Filtro incremental de blocos ` thinking...</think>`, inclusive quando as
/// tags chegam partidas entre chunks SSE.
#[derive(Debug, Default)]
pub struct ThinkFilter {
    inside: bool,
    buffer: String,
}

impl ThinkFilter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn feed(&mut self, input: &str) -> String {
        self.buffer.push_str(input);
        let mut output = String::new();
        loop {
            if self.inside {
                if let Some(index) = self.buffer.find("</think>") {
                    self.buffer.drain(..index + "</think>".len());
                    self.inside = false;
                    continue;
                }
                let keep = partial_suffix_len(&self.buffer, "</think>");
                let cut = self.buffer.len() - keep;
                self.buffer.drain(..cut);
                break;
            }
            if let Some(index) = self.buffer.find("</think") {
                let end = if self.buffer[index..].starts_with("</think>") {
                    index + "</think>".len()
                } else {
                    index + "</think".len()
                };
                self.buffer.drain(..end);
                continue;
            }
            if let Some(index) = self.buffer.find(" thinking") {
                output.push_str(&self.buffer[..index]);
                self.buffer.drain(..index + " thinking".len());
                self.inside = true;
                continue;
            }
            let keep = partial_suffix_len(&self.buffer, " thinking")
                .max(partial_suffix_len(&self.buffer, "</think"));
            let cut = self.buffer.len() - keep;
            output.push_str(&self.buffer[..cut]);
            self.buffer.drain(..cut);
            break;
        }
        output
    }

    /// Libera qualquer resto fora de um bloco de raciocínio.
    pub fn finish(&mut self) -> String {
        if self.inside {
            self.buffer.clear();
            self.inside = false;
            String::new()
        } else {
            std::mem::take(&mut self.buffer)
        }
    }
}

fn partial_suffix_len(buffer: &str, tag: &str) -> usize {
    let max = tag.len().min(buffer.len());
    for len in (1..=max).rev() {
        let start = buffer.len() - len;
        if buffer.is_char_boundary(start) && tag.starts_with(&buffer[start..]) {
            return len;
        }
    }
    0
}

async fn send_stream_request(
    client: &reqwest::Client,
    config: &LlmConfig,
    messages: &[ChatMessage],
) -> AppResult<reqwest::Response> {
    let response = request_builder(client, config, &build_request_body(config, messages, true))
        .send()
        .await
        .map_err(|e| AppError::Message(format!("falha ao conectar ao cérebro LLM: {e}")))?;

    if response.status().is_success() {
        return Ok(response);
    }

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();
    let extra_body_rejected = status == reqwest::StatusCode::BAD_REQUEST
        && (body_text.contains("unknown field")
            || body_text.contains("extra_forbidden")
            || body_text.contains("unrecognized")
            || body_text.contains("unexpected")
            || body_text.contains("invalid_request_error")
            || body_text.contains("chat_template_kwargs")
            || body_text.contains("reasoning_effort"));

    if extra_body_rejected {
        tracing::warn!("provider rejeitou campos extras; repetindo payload estrito");
        let retry = request_builder(client, config, &build_request_body(config, messages, false))
            .send()
            .await
            .map_err(|e| AppError::Message(format!("falha na segunda tentativa: {e}")))?;
        if retry.status().is_success() {
            return Ok(retry);
        }
        let retry_status = retry.status();
        let retry_text = retry.text().await.unwrap_or_default();
        return Err(AppError::Message(format!(
            "LLM respondeu {retry_status}: {}",
            truncate(&retry_text, 400)
        )));
    }

    Err(AppError::Message(format!(
        "LLM respondeu {status}: {}",
        truncate(&body_text, 400)
    )))
}

/// Executa um turno SSE e entrega os deltas já filtrados de ` thinking`.
/// Retorna quando a stream termina, o callback pede parada ou há cancelamento.
pub async fn stream_chat<F>(
    client: &reqwest::Client,
    config: &LlmConfig,
    messages: &[ChatMessage],
    cancel: CancellationToken,
    mut on_delta: F,
) -> AppResult<()>
where
    F: FnMut(&str),
{
    let response = send_stream_request(client, config, messages).await?;
    let mut stream = response.bytes_stream().eventsource();
    let mut think = ThinkFilter::new();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                return Ok(());
            }
            next = stream.next() => {
                match next {
                    None => break,
                    Some(Err(err)) => {
                        return Err(AppError::Message(format!("stream SSE interrompida: {err}")));
                    }
                    Some(Ok(event)) => {
                        if event.data.trim() == "[DONE]" {
                            break;
                        }
                        let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
                            continue;
                        };
                        let delta = value
                            .pointer("/choices/0/delta/content")
                            .and_then(Value::as_str)
                            .or_else(|| value.pointer("/choices/0/message/content").and_then(Value::as_str));
                        if let Some(delta) = delta {
                            let filtered = think.feed(delta);
                            if !filtered.is_empty() {
                                on_delta(&filtered);
                            }
                        }
                    }
                }
            }
        }
    }
    let tail = think.finish();
    if !tail.is_empty() {
        on_delta(&tail);
    }
    Ok(())
}

pub async fn test_llm_connection(
    client: &reqwest::Client,
    config: &LlmConfig,
) -> AppResult<LlmProbeResult> {
    let messages = vec![
        ChatMessage::system(SYSTEM_PROMPT_V1),
        ChatMessage::user("Responda apenas com a linha {\"op\":\"noop\"} e nada mais."),
    ];
    let started = Instant::now();
    let response = send_stream_request(client, config, &messages).await?;
    let mut stream = response.bytes_stream().eventsource();
    let mut think = ThinkFilter::new();
    let mut first_ttft = None;
    let mut first_op = None;
    let mut sample = String::new();

    while let Some(event) = stream.next().await {
        let event = event.map_err(|e| AppError::Message(format!("probe SSE: {e}")))?;
        if event.data.trim() == "[DONE]" {
            break;
        }
        let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
            continue;
        };
        if let Some(delta) = value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
        {
            if first_ttft.is_none() {
                first_ttft = Some(started.elapsed().as_millis() as u64);
            }
            let filtered = think.feed(delta);
            sample.push_str(&filtered);
            if first_op.is_none() && sample.contains('\n') {
                first_op = Some(started.elapsed().as_millis() as u64);
                break;
            }
            if sample.len() > 4096 {
                break;
            }
        }
    }

    let ttft_ms = first_ttft.unwrap_or_else(|| started.elapsed().as_millis() as u64);
    let first_op_ms = first_op.unwrap_or(ttft_ms);
    let sample = sample.trim().chars().take(300).collect::<String>();
    if sample.is_empty() {
        return Err(AppError::Message(
            "o modelo respondeu sem conteúdo legível".into(),
        ));
    }
    Ok(LlmProbeResult {
        ttft_ms,
        first_op_ms,
        model: config.model.clone(),
        sample,
    })
}

fn truncate(text: &str, max: usize) -> String {
    let clean = text.trim();
    if clean.chars().count() <= max {
        clean.to_string()
    } else {
        clean.chars().take(max).collect::<String>() + "…"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_normalization() {
        assert_eq!(
            build_chat_completions_url("http://127.0.0.1:11434/v1"),
            "http://127.0.0.1:11434/v1/chat/completions"
        );
        assert_eq!(
            build_chat_completions_url("https://api.groq.com/openai/v1"),
            "https://api.groq.com/openai/v1/chat/completions"
        );
        assert_eq!(
            build_chat_completions_url("http://localhost:1234/v1/chat/completions/"),
            "http://localhost:1234/v1/chat/completions"
        );
        assert_eq!(
            build_chat_completions_url("http://localhost:8080"),
            "http://localhost:8080/v1/chat/completions"
        );
    }

    #[test]
    fn test_think_block_stripping_in_sse() {
        let mut filter = ThinkFilter::new();
        let text = filter.feed("</think>\nraciocinando...\n</think>\n{\"op\":\"clear\"}\n");
        assert_eq!(text, "\n{\"op\":\"clear\"}\n");
    }

    #[test]
    fn test_think_block_split_across_chunks() {
        let mut filter = ThinkFilter::new();
        assert_eq!(filter.feed("{\"op\":\"ti"), "{\"op\":\"ti");
        assert_eq!(filter.feed("tle\""), "tle\"");
        assert_eq!(filter.feed(",\"text\":\"a\"}\n</thi"), ",\"text\":\"a\"}\n");
        assert_eq!(filter.feed("nk>segredo</think>{\"op\":\"noop\"}"), "{\"op\":\"noop\"}");
    }
}
