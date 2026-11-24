use crate::error::AppResult;
use serde_json::Value;
use std::path::Path;

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn node_lines(snapshot: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(snapshot) else {
        return vec![];
    };
    value
        .get("nodes")
        .and_then(Value::as_object)
        .map(|nodes| {
            nodes
                .values()
                .map(|node| {
                    let title = node
                        .get("title")
                        .and_then(Value::as_str)
                        .or_else(|| node.get("id").and_then(Value::as_str))
                        .unwrap_or("elemento");
                    let kind = node
                        .get("kind")
                        .and_then(Value::as_str)
                        .unwrap_or("visual");
                    format!("{title} ({kind})")
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Gera um HTML autocontido com todos os beats e transcrições da aula.
pub fn render_session_html(
    session_title: &str,
    beats: &[(String, String)],
    transcript: &[(String, i64)],
) -> String {
    let mut cards = String::new();
    for (index, (label, snapshot)) in beats.iter().enumerate() {
        let value: Value = serde_json::from_str(snapshot).unwrap_or(Value::Null);
        let theme = value
            .get("theme")
            .and_then(Value::as_str)
            .unwrap_or("whiteboard");
        let title = value
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or(label.as_str());
        let subtitle = value
            .get("subtitle")
            .and_then(Value::as_str)
            .unwrap_or("");
        let nodes = node_lines(snapshot);
        let node_items = nodes
            .iter()
            .map(|node| format!("<li>{}</li>", escape_html(node)))
            .collect::<String>();
        cards.push_str(&format!(
            r#"<section class="beat"><div class="meta"><span class="index">Beat {index}</span><span class="theme">{theme}</span></div><h2>{title}</h2><p class="sub">{subtitle}</p><ul>{node_items}</ul><details><summary>Ver snapshot da cena</summary><pre>{snapshot}</pre></details></section>"#,
            index = index + 1,
            theme = escape_html(theme),
            title = escape_html(title),
            subtitle = escape_html(subtitle),
            node_items = node_items,
            snapshot = escape_html(snapshot),
        ));
    }
    if cards.is_empty() {
        cards.push_str("<p class=\"empty\">Nenhum beat registrado nesta aula.</p>");
    }
    let transcript_html = if transcript.is_empty() {
        String::new()
    } else {
        let lines = transcript
            .iter()
            .map(|(text, at)| {
                let clock = {
                    let seconds = (*at / 1000) % 86_400;
                    format!("{:02}:{:02}:{:02}", seconds / 3600, (seconds / 60) % 60, seconds % 60)
                };
                format!(
                    "<li><time>{clock}</time><span>{text}</span></li>",
                    clock = clock,
                    text = escape_html(text)
                )
            })
            .collect::<String>();
        format!("<section class=\"transcript\"><h2>Transcrição da aula</h2><ol>{lines}</ol></section>")
    };
    format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — Gizmo</title><style>
:root{{color-scheme:light;--ink:#0f172a;--muted:#64748b;--paper:#f8fafc;--card:#ffffff;--line:#e2e8f0;--cyan:#0891b2}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.55}}
header{{padding:56px 24px 32px;max-width:980px;margin:0 auto}}header h1{{font-size:clamp(28px,5vw,52px);letter-spacing:-.03em;margin:0 0 8px}}header p{{color:var(--muted);margin:0}}
main{{max-width:980px;margin:0 auto;padding:0 24px 64px;display:grid;gap:18px}}
.beat{{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 1px 2px #0f172a0a}}
.transcript{{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px}}
.transcript h2{{margin:0 0 12px;font-size:22px}}.transcript ol{{margin:0;padding-left:22px}}.transcript li{{margin:8px 0}}.transcript time{{font-family:ui-monospace,monospace;color:var(--muted);font-size:12px;margin-right:10px}}
.meta{{display:flex;gap:10px;align-items:center;margin-bottom:10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}}
.theme{{background:#ecfeff;color:#155e75;padding:3px 8px;border-radius:999px}}
.beat h2{{margin:0 0 4px;font-size:24px}}.sub{{color:var(--muted);margin:0 0 12px}}
ul{{margin:0 0 14px;padding-left:20px}}li{{margin:4px 0}}
details{{border-top:1px solid var(--line);padding-top:10px}}summary{{cursor:pointer;color:var(--cyan);font-weight:600}}
pre{{overflow:auto;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:10px;font-size:12px}}
footer{{max-width:980px;margin:0 auto;padding:0 24px 48px;color:var(--muted);font-size:13px}}
@media print{{body{{background:#fff}}.beat{{break-inside:avoid;box-shadow:none}}details{{display:none}}}}
</style></head><body><header><h1>{title}</h1><p>{count} momentos visuais capturados pelo Gizmo.</p></header><main>{cards}{transcript_html}</main><footer>Gerado localmente por Gizmo — nenhum dado saiu deste computador.</footer></body></html>"#,
        title = escape_html(session_title),
        count = beats.len(),
        cards = cards,
        transcript_html = transcript_html,
    )
}

pub fn write_session_html(
    path: &Path,
    session_title: &str,
    beats: &[(String, String)],
    transcript: &[(String, i64)],
) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, render_session_html(session_title, beats, transcript))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_self_contained_html() {
        let snapshot = r#"{"theme":"ted","title":"Uma ideia","nodes":{"k":{"title":"87%","kind":"kpi"}}}"#;
        let html = render_session_html(
            "Aula <Teste>",
            &[("Beat 1".into(), snapshot.into())],
            &[("fala <teste>".into(), 1_700_000_000_000)],
        );
        assert!(html.contains("Aula &lt;Teste&gt;"));
        assert!(html.contains("87%"));
        assert!(html.contains("fala &lt;teste&gt;"));
        assert!(html.contains("<!doctype html>"));
    }
}
