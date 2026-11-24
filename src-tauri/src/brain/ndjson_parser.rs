//! Parser incremental NDJSON com reparo de escapes LaTeX.
//!
//! O LLM emite uma `SceneOp` por linha terminada em `\n`. Modelos pequenos
//! costumam escrever `\frac`, `\tan`, `\beta` com uma única barra invertida,
//! que o JSON estrito interpreta como `\f`, `\t`, `\b` ou rejeita. Aqui
//! reparamos a linha antes de desserializar, sem perder nenhuma letra.

use crate::scene::SceneOp;

const LATEX_COMMANDS: &[&str] = &[
    "frac", "sqrt", "tan", "theta", "tau", "times", "text", "textbf", "textit", "textrm",
    "textcolor", "to", "top", "triangle", "rho", "right", "rightarrow", "leftarrow", "left",
    "nu", "neq", "ne", "nabla", "not", "sum", "sin", "sec", "int", "iint", "iiint", "oint",
    "infty", "alpha", "beta", "gamma", "delta", "Delta", "Gamma", "Theta", "Lambda", "Omega",
    "Sigma", "Phi", "Psi", "Pi", "epsilon", "varepsilon", "zeta", "eta", "iota", "kappa",
    "lambda", "mu", "xi", "omicron", "pi", "sigma", "upsilon", "phi", "chi", "psi", "omega",
    "lim", "cdot", "cdots", "ldots", "dots", "cos", "cot", "csc", "exp", "log", "ln", "vec",
    "partial", "binom", "boxed", "bar", "overline", "underline", "hat", "tilde", "bf", "it",
    "rm", "begin", "end", "mathcal", "mathbb", "mathbf", "mathrm", "mathsf", "mathtt",
    "operatorname", "over", "under", "approx", "leq", "geq", "pm", "mp", "quad", "qquad",
    "space", "hspace", "color", "htmlClass", "bbox", "displaystyle", "langle", "rangle",
    "lvert", "rvert", "Big", "big", "Bigg", "bigg", "brace", "brack", "angle", "degree",
    "circ", "bullet", "star", "ast", "oplus", "otimes", "cup", "cap", "subset", "supset",
    "in", "notin", "forall", "exists", "emptyset", "varnothing", "therefore", "because",
    "implies", "iff", "equiv", "sim", "propto", "qquad", "cfrac", "dfrac", "tfrac",
    "mathrm", "ce", "pu", "qty", "eval", "bra", "ket", "braket", "ketbra", "dag", "dagger",
    "ldots", "times", "div", "bmod", "mod", "pmod", "pod", "mp", "ll", "gg", "prec", "succ",
];

pub struct NdjsonStreamParser {
    buffer: String,
}

impl Default for NdjsonStreamParser {
    fn default() -> Self {
        Self::new()
    }
}

impl NdjsonStreamParser {
    pub fn new() -> Self {
        Self {
            buffer: String::with_capacity(4096),
        }
    }

    /// Alimenta um chunk de texto SSE e retorna todas as operações completas.
    pub fn push_chunk(&mut self, chunk: &str) -> Vec<SceneOp> {
        self.buffer.push_str(chunk);
        let mut ops = Vec::new();
        loop {
            let Some(index) = self.buffer.find('\n') else {
                break;
            };
            let line: String = self.buffer.drain(..=index).collect();
            let line = line.trim_end_matches(['\r', '\n']);
            if let Some(op) = parse_scene_op_line(line) {
                ops.push(op);
            }
        }
        ops
    }

    /// Processa o resto do buffer no fim da stream.
    pub fn flush(&mut self) -> Vec<SceneOp> {
        let rest = self.buffer.trim().to_string();
        self.buffer.clear();
        parse_scene_op_line(&rest).into_iter().collect()
    }
}

/// Sanitiza uma linha NDJSON crua. Retorna `None` para envelopes markdown,
/// `[DONE]`, comentários e linhas vazias.
pub fn sanitize_ndjson_line(raw_line: &str) -> Option<String> {
    let trimmed = raw_line.trim();
    if trimmed.is_empty()
        || trimmed == "[DONE]"
        || trimmed.starts_with("```")
        || trimmed.starts_with("//")
        || trimmed.starts_with('#')
    {
        return None;
    }

    // Remove prefixos de lista ("- {...}", "1. {...}") e qualquer preâmbulo.
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end < start {
        return None;
    }
    let mut json = trimmed[start..=end].to_string();

    // Vírgula solta após o último fechamento de chave.
    json = json.trim_end().trim_end_matches(',').trim_end().to_string();

    // Duplica as barras invertidas de comandos LaTeX dentro de strings JSON.
    let json = repair_latex_escapes(&json);
    let json = strip_trailing_commas(&json);
    Some(json)
}

/// Converte uma linha NDJSON em `SceneOp`, com uma segunda tentativa de reparo.
pub fn parse_scene_op_line(raw_line: &str) -> Option<SceneOp> {
    let sanitized = sanitize_ndjson_line(raw_line)?;
    match serde_json::from_str::<SceneOp>(&sanitized) {
        Ok(op) => Some(op),
        Err(first_error) => {
            // Modelos locais às vezes escapam aspas extras ou deixam vírgulas
            // antes de fechar objetos. Tentamos uma última normalização leve.
            let second = sanitized.replace(",}", "}").replace(",]", "]");
            match serde_json::from_str::<SceneOp>(&second) {
                Ok(op) => Some(op),
                Err(_) => {
                    tracing::debug!(
                        "linha NDJSON descartada ({first_error}): {}",
                        sanitized.chars().take(240).collect::<String>()
                    );
                    None
                }
            }
        }
    }
}

fn repair_latex_escapes(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len() + 32);
    let mut in_string = false;
    let mut i = 0usize;

    while i < chars.len() {
        let c = chars[i];
        if !in_string {
            out.push(c);
            if c == '"' {
                in_string = true;
            }
            i += 1;
            continue;
        }

        if c == '"' {
            out.push(c);
            in_string = false;
            i += 1;
            continue;
        }

        if c != '\\' {
            out.push(c);
            i += 1;
            continue;
        }

        if i + 1 >= chars.len() {
            out.push('\\');
            i += 1;
            continue;
        }

        let next = chars[i + 1];

        // Escape unicode legítimo: \uXXXX.
        if next == 'u' {
            let has_hex = i + 5 < chars.len()
                && (2..=5).all(|offset| chars[i + offset].is_ascii_hexdigit());
            if has_hex {
                out.push('\\');
                out.push('u');
                i += 2;
                continue;
            }
            // \u inválido: pode ser LaTeX (\underbrace); duplica.
            out.push('\\');
            out.push('\\');
            i += 1;
            continue;
        }

        // Escapes JSON legítimos que nunca são comandos LaTeX de uma letra.
        if matches!(next, '"' | '\\' | '/') {
            out.push('\\');
            out.push(next);
            i += 2;
            continue;
        }

        let mut j = i + 1;
        while j < chars.len() && chars[j].is_ascii_alphabetic() {
            j += 1;
        }
        let command: String = chars[i + 1..j].iter().collect();
        let is_known_latex = LATEX_COMMANDS.contains(&command.as_str());
        let valid_json_escape = matches!(next, 'b' | 'f' | 'n' | 'r' | 't');
        let should_double = is_known_latex || !valid_json_escape;

        if should_double {
            out.push('\\');
            out.push('\\');
        } else {
            out.push('\\');
        }
        i += 1;
    }

    out
}

fn strip_trailing_commas(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;
    let mut i = 0usize;

    while i < chars.len() {
        let c = chars[i];
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                i += 1;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene::{NodeKind, SceneOp};

    #[test]
    fn test_latex_single_backslash_repair() {
        let raw = r#"{"op":"upsert","id":"m1","kind":"math","zone":"center","data":{"latex":"\frac{\sqrt{a^2+b^2}}{\tan(\theta)} = \beta"}}"#;
        let op = parse_scene_op_line(raw).expect("parse");
        match op {
            SceneOp::Upsert { kind, data, .. } => {
                assert_eq!(kind, NodeKind::Math);
                assert_eq!(
                    data.get("latex").and_then(|v| v.as_str()),
                    Some(r"\frac{\sqrt{a^2+b^2}}{\tan(\theta)} = \beta")
                );
            }
            _ => panic!("esperava upsert"),
        }
    }

    #[test]
    fn test_markdown_fence_and_trailing_comma_ignored() {
        assert!(sanitize_ndjson_line("```json").is_none());
        assert!(sanitize_ndjson_line("[DONE]").is_none());
        assert!(sanitize_ndjson_line("").is_none());
        let op = parse_scene_op_line(r#"{"op":"clear"},"#).expect("clear");
        assert!(matches!(op, SceneOp::Clear { .. }));
    }

    #[test]
    fn test_multiple_ops_across_chunks() {
        let mut parser = NdjsonStreamParser::new();
        let first = parser.push_chunk("{\"op\":\"theme\",\"style\":\"3b1b\"}\n{\"op\":\"title\",\"te");
        assert_eq!(first.len(), 1);
        let ops = parser.push_chunk("xt\":\"Derivada\",\"subtitle\":\"Taxa instantânea\"}\n");
        assert_eq!(ops.len(), 1);
        assert!(matches!(first[0], SceneOp::Theme { .. }));
        assert!(matches!(ops[0], SceneOp::Title { .. }));
    }

    #[test]
    fn test_nested_latex_and_escaped_quotes() {
        let raw = r#"{"op":"upsert","id":"m2","kind":"math","zone":"right","data":{"latex":"\int_{0}^{2} x^2 \, dx = \frac{8}{3}","caption":"Área \"exata\""}}"#;
        let op = parse_scene_op_line(raw).expect("parse");
        match op {
            SceneOp::Upsert { data, .. } => {
                assert_eq!(
                    data.get("latex").and_then(|v| v.as_str()),
                    Some(r"\int_{0}^{2} x^2 \, dx = \frac{8}{3}")
                );
                assert_eq!(
                    data.get("caption").and_then(|v| v.as_str()),
                    Some("Área \"exata\"")
                );
            }
            _ => panic!("esperava upsert"),
        }
    }

    #[test]
    fn test_already_double_escaped_is_not_quadrupled() {
        let raw = r#"{"op":"upsert","id":"m3","kind":"math","zone":"left","data":{"latex":"\\frac{1}{2}"}}"#;
        let op = parse_scene_op_line(raw).expect("parse");
        match op {
            SceneOp::Upsert { data, .. } => {
                assert_eq!(data.get("latex").and_then(|v| v.as_str()), Some(r"\frac{1}{2}"));
            }
            _ => panic!("esperava upsert"),
        }
    }
}
