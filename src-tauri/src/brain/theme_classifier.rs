use crate::scene::ThemeId;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

static WORD_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\p{L}][\p{L}-]+").unwrap());

/// Classificador léxico local de fallback. Só entra em ação se o LLM não
/// emitir `theme` nos primeiros turnos e o tema não estiver travado.
pub struct LocalThemeClassifier {
    scores: HashMap<ThemeId, i32>,
    accumulated_words: usize,
    turns: u32,
    emitted: bool,
}

impl Default for LocalThemeClassifier {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalThemeClassifier {
    pub fn new() -> Self {
        Self {
            scores: HashMap::new(),
            accumulated_words: 0,
            turns: 0,
            emitted: false,
        }
    }

    pub fn reset(&mut self) {
        self.scores.clear();
        self.accumulated_words = 0;
        self.turns = 0;
        self.emitted = false;
    }

    pub fn observe(&mut self, text: &str) -> Option<ThemeId> {
        self.turns += 1;
        let normalized = crate::brain::reflex::normalize(text);
        for word in WORD_RE.find_iter(&normalized) {
            let word = word.as_str();
            self.accumulated_words += 1;
            let theme = match word {
                "derivada" | "derivadas" | "integral" | "integrais" | "matriz" | "matrizes"
                | "teorema" | "hipotenusa" | "seno" | "cosseno" | "tangente" | "vetor"
                | "vetores" | "equacao" | "equacoes" | "funcao" | "funcoes" | "probabilidade"
                | "estatistica" | "algebra" | "geometria" | "calculo" | "limite" | "grafico"
                | "parabola" | "triangulo" | "angulo" | "fisica" | "energia" | "forca" => {
                    Some(ThemeId::ThreeBlueOneBrown)
                }
                "receita" | "funil" | "cac" | "ltv" | "mrr" | "cliente" | "clientes" | "mercado"
                | "vendas" | "produto" | "okr" | "trimestre" | "margem" | "roi" | "marketing"
                | "estrategia" | "negocio" | "negocios" | "lucro" | "preco" | "conversao"
                | "churn" | "pipeline" | "stakeholder" => Some(ThemeId::Flipchart),
                "api" | "servidor" | "banco" | "latencia" | "docker" | "kubernetes" | "algoritmo"
                | "array" | "microservico" | "microservicos" | "rust" | "python" | "codigo"
                | "software" | "arquitetura" | "rede" | "redes" | "database" | "cache" | "thread"
                | "threads" | "gpu" | "cpu" | "deploy" | "backend" | "frontend" => {
                    Some(ThemeId::Blueprint)
                }
                "seculo" | "revolucao" | "imperio" | "filosofia" | "constituicao" | "literatura"
                | "guerra" | "medieval" | "iluminismo" | "historia" | "sociologia" | "direito"
                | "filosofo" | "romance" | "poesia" | "renascimento" | "antiguidade" => {
                    Some(ThemeId::Chalkboard)
                }
                "jornada" | "proposito" | "inspiracao" | "futuro" | "sonho" | "impacto"
                | "transformacao" | "lideranca" | "coragem" => Some(ThemeId::Ted),
                _ => None,
            };
            if let Some(theme) = theme {
                *self.scores.entry(theme).or_insert(0) += 1;
            }
        }

        if self.emitted || self.turns < 2 || self.accumulated_words < 8 {
            return None;
        }
        let best = self
            .scores
            .iter()
            .max_by_key(|(_, score)| **score)
            .map(|(theme, score)| (*theme, *score));
        match best {
            Some((theme, score)) if score >= 2 => {
                self.emitted = true;
                Some(theme)
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_math_and_business() {
        let mut classifier = LocalThemeClassifier::new();
        assert_eq!(
            classifier.observe("vamos calcular a derivada da funcao e olhar o grafico da parabola"),
            None
        );
        assert_eq!(
            classifier.observe("a integral da funcao e a area sob a curva, veja o teorema"),
            Some(ThemeId::ThreeBlueOneBrown)
        );

        let mut classifier = LocalThemeClassifier::new();
        let _ = classifier.observe("a receita e o funil de vendas com o cac e o ltv do cliente");
        assert_eq!(
            classifier.observe("o mercado e o produto precisam melhorar a conversao e o mrr"),
            Some(ThemeId::Flipchart)
        );
    }
}
