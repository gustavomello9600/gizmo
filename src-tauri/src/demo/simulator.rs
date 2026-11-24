use crate::audio::AsrTranscriptEvent;
use crate::brain::engine::{BrainEngine, BrainStatus};
use crate::scene::{SceneGraph, SceneOp};
use crate::storage::SqliteStore;
use parking_lot::Mutex;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

async fn speak(app: &AppHandle, utterance: &str, text: &str, final_: bool, duration_ms: u32) {
    let event = AsrTranscriptEvent {
        utterance_id: utterance.into(),
        text: text.into(),
        is_final: final_,
        duration_ms,
        latency_ms: 38,
        language: Some("pt".into()),
        mean_rms: 0.09,
    };
    let _ = app.emit(if final_ { "asr:final" } else { "asr:partial" }, &event);
}

async fn say(app: &AppHandle, utterance: &str, text: &str, pause_ms: u64) {
    say_long(app, utterance, text, pause_ms, 900).await;
}

async fn say_long(app: &AppHandle, utterance: &str, text: &str, pause_ms: u64, duration_ms: u32) {
    speak(app, utterance, text, false, duration_ms).await;
    tokio::time::sleep(Duration::from_millis(pause_ms.min(1400))).await;
    speak(app, utterance, text, true, duration_ms).await;
    tokio::time::sleep(Duration::from_millis(pause_ms.saturating_sub(500).max(120))).await;
}

fn emit_act(app: &AppHandle, act: u8, title: &str, theme: &str) {
    let _ = app.emit(
        "demo:progress",
        json!({ "act": act, "title": title, "theme": theme }),
    );
}

pub async fn run_demo(
    app: AppHandle,
    scene: Arc<Mutex<SceneGraph>>,
    store: SqliteStore,
    brain: Arc<BrainEngine>,
    session_id: String,
) -> Result<(), String> {
    let _ = app.emit(
        "brain:status",
        BrainStatus {
            state: "streaming".into(),
            model: "demo lecture".into(),
            ttft_ms: Some(120),
            first_op_ms: Some(180),
            error: None,
        },
    );

    // Ato 1 — Cálculo (3b1b)
    emit_act(&app, 1, "Cálculo", "3b1b");
    say(
        &app,
        "u_demo_1",
        "Vamos entender a derivada como uma taxa de variação instantânea.",
        600,
    )
    .await;
    brain.apply_op(
        &SceneOp::Theme {
            style: crate::scene::ThemeId::ThreeBlueOneBrown,
            locked: Some(true),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Title {
            text: "Derivada como Taxa Instantânea".into(),
            subtitle: Some("A reta secante vira tangente quando h tende a zero".into()),
        },
        true,
    );
    tokio::time::sleep(Duration::from_millis(500)).await;
    brain.apply_op(
        &SceneOp::Upsert {
            id: "plot_f".into(),
            kind: crate::scene::NodeKind::Plot2d,
            zone: crate::scene::SemanticZone::Left,
            title: Some("f(x) = x² e a tangente em x = 1".into()),
            pinned: Some(true),
            data: json!({
                "domain": [-2.5, 3.5],
                "range": [-1.5, 9.5],
                "x_label": "x",
                "y_label": "f(x)",
                "functions": [
                    {"expr": "x^2", "label": "f(x) = x²", "color": "primary"},
                    {"expr": "2*x - 1", "label": "Tangente em x = 1", "color": "accent", "dashed": true}
                ],
                "points": [{"x": 1, "y": 1, "label": "P(1, 1)", "color": "accent"}]
            }),
        },
        true,
    );
    say(
        &app,
        "u_demo_2",
        "Repare no ponto P: a inclinação da tangente é exatamente a derivada naquele ponto.",
        700,
    )
    .await;
    brain.apply_op(
        &SceneOp::Upsert {
            id: "eq_derivada".into(),
            kind: crate::scene::NodeKind::Math,
            zone: crate::scene::SemanticZone::Right,
            title: Some("Definição de derivada".into()),
            pinned: Some(true),
            data: json!({
                "latex": "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}",
                "steps": [
                    "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}",
                    "f'(1) = 2 \\cdot 1 = 2"
                ],
                "highlight_terms": ["f'(1) = 2"],
                "caption": "a taxa instantânea de variação"
            }),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "triangulo".into(),
            kind: crate::scene::NodeKind::Geometry2d,
            zone: crate::scene::SemanticZone::Bottom,
            title: Some("O triângulo retângulo por trás da fórmula".into()),
            pinned: Some(true),
            data: json!({
                "view_box": [0, 0, 200, 200],
                "shapes": [
                    {"type": "polygon", "points": [[30,160],[150,160],[30,70]], "label": "ABC", "color": "primary", "fill": true},
                    {"type": "right_angle", "at": [30,160], "size": 16},
                    {"type": "segment_label", "from": [30,160], "to": [150,160], "text": "b = 4"},
                    {"type": "segment_label", "from": [30,160], "to": [30,70], "text": "a = 3"},
                    {"type": "segment_label", "from": [150,160], "to": [30,70], "text": "c = 5", "color": "accent"},
                    {"type": "vector", "from": [30,160], "to": [110,100], "label": "v", "color": "secondary"}
                ]
            }),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Highlight {
            id: "plot_f".into(),
            target: None,
            style: Some(crate::scene::HighlightStyle::Pulse),
            ttl_ms: Some(2600),
        },
        true,
    );
    brain.save_beat("Ato 1 · Derivada");
    tokio::time::sleep(Duration::from_millis(1800)).await;

    // Ato 2 — Negócios (flipchart)
    emit_act(&app, 2, "Produto & Negócios", "flipchart");
    say(
        &app,
        "u_demo_3",
        "Agora mudando de assunto: como decidir no que investir primeiro no produto?",
        600,
    )
    .await;
    brain.apply_op(
        &SceneOp::Theme {
            style: crate::scene::ThemeId::Flipchart,
            locked: Some(true),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Clear { keep_title: None },
        true,
    );
    brain.apply_op(
        &SceneOp::Title {
            text: "Priorização de Produto".into(),
            subtitle: Some("Esforço versus impacto no trimestre".into()),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "matriz".into(),
            kind: crate::scene::NodeKind::Matrix2x2,
            zone: crate::scene::SemanticZone::Left,
            title: Some("Matriz Esforço × Impacto".into()),
            pinned: Some(true),
            data: json!({
                "x_axis": ["Baixo Esforço", "Alto Esforço"],
                "y_axis": ["Baixo Impacto", "Alto Impacto"],
                "quadrants": {
                    "tl": {"title": "Ganhos Rápidos", "items": ["Automação do onboarding", "Novo checkout"], "highlight": true},
                    "tr": {"title": "Projetos Estratégicos", "items": ["Expansão internacional"]},
                    "bl": {"title": "Tarefas Menores", "items": ["Ajustes visuais"]},
                    "br": {"title": "Evitar", "items": ["Reescrita legada"]}
                }
            }),
        },
        true,
    );
    tokio::time::sleep(Duration::from_millis(800)).await;
    say(
        &app,
        "u_demo_4",
        "Olhem o funil: de cada dez mil visitantes, apenas cento e oitenta viram clientes.",
        750,
    )
    .await;
    brain.apply_op(
        &SceneOp::Upsert {
            id: "funil".into(),
            kind: crate::scene::NodeKind::Funnel,
            zone: crate::scene::SemanticZone::Right,
            title: Some("Funil de conversão".into()),
            pinned: Some(true),
            data: json!({
                "stages": [
                    {"label": "Visitantes", "value": "10.000", "rate": "100%"},
                    {"label": "Leads", "value": "1.200", "rate": "12%"},
                    {"label": "Clientes", "value": "180", "rate": "1,8%", "highlight": true}
                ]
            }),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "insight".into(),
            kind: crate::scene::NodeKind::Callout,
            zone: crate::scene::SemanticZone::Footer,
            title: None,
            pinned: Some(true),
            data: json!({
                "variant": "insight",
                "title": "Onde está a alavanca?",
                "body": "Dobrar a conversão de leads para clientes vale mais do que dobrar o tráfego."
            }),
        },
        true,
    );
    brain.save_beat("Ato 2 · Priorização");
    tokio::time::sleep(Duration::from_millis(1800)).await;

    // Ato 3 — Método de estudo (whiteboard)
    emit_act(&app, 3, "Método de estudo", "whiteboard");
    say(
        &app,
        "u_demo_7",
        "Como fazer o conteúdo ficar na memória? Não é relendo: é recuperando ativamente.",
        600,
    ).await;
    brain.apply_op(
        &SceneOp::Theme {
            style: crate::scene::ThemeId::Whiteboard,
            locked: Some(true),
        },
        true,
    );
    brain.apply_op(&SceneOp::Clear { keep_title: None }, true);
    brain.apply_op(
        &SceneOp::Title {
            text: "Estudo que funciona".into(),
            subtitle: Some("Três princípios com evidência para a sala de aula".into()),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "metodo".into(),
            kind: crate::scene::NodeKind::Bullets,
            zone: crate::scene::SemanticZone::Left,
            title: Some("O que a ciência da aprendizagem mostra".into()),
            pinned: Some(true),
            data: json!({
                "ordered": false,
                "items": [
                    {"id": "b1", "text": "Recuperação ativa", "subtext": "Feche o material e explique em voz alta", "icon": "idea", "emphasis": true},
                    {"id": "b2", "text": "Espaçamento", "subtext": "Revise em 1, 3 e 7 dias", "icon": "star"},
                    {"id": "b3", "text": "Sono e pausas", "subtext": "A consolidação acontece fora da aula", "icon": "sun"}
                ]
            }),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "comparacao".into(),
            kind: crate::scene::NodeKind::Comparison,
            zone: crate::scene::SemanticZone::Right,
            title: Some("Reler não é estudar".into()),
            pinned: Some(true),
            data: json!({
                "left_title": "Reler",
                "right_title": "Recuperar",
                "rows": [
                    {"aspect": "Esforço", "left": "Passivo e confortável", "right": "Ativo e desconfortável", "winner": "right"},
                    {"aspect": "Retenção", "left": "Baixa após 7 dias", "right": "Até 3× maior", "winner": "right"},
                    {"aspect": "Diagnóstico", "left": "Ilusão de fluência", "right": "Mostra o que falta", "winner": "right"}
                ]
            }),
        },
        true,
    );
    say(
        &app,
        "u_demo_8",
        "Olhem os dados: a prática de recuperação vence a leitura repetida depois de uma semana.",
        700,
    ).await;
    brain.apply_op(
        &SceneOp::Upsert {
            id: "retencao".into(),
            kind: crate::scene::NodeKind::Chart,
            zone: crate::scene::SemanticZone::Bottom,
            title: Some("Retenção após 7 dias".into()),
            pinned: Some(true),
            data: json!({
                "chart_type": "bar",
                "x_label": "Método",
                "y_label": "Retenção",
                "unit": "%",
                "series": [
                    {"name": "Retenção", "color": "primary", "points": [
                        {"x": "Aula", "y": 20},
                        {"x": "Reler", "y": 28},
                        {"x": "Praticar", "y": 75}
                    ]}
                ]
            }),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "lembrete".into(),
            kind: crate::scene::NodeKind::FreehandNote,
            zone: crate::scene::SemanticZone::Footer,
            title: None,
            pinned: Some(true),
            data: json!({
                "text": "Lembrar: revisar amanhã!",
                "color": "yellow",
                "rotation_deg": -2
            }),
        },
        true,
    );
    brain.save_beat("Ato 3 · Método");
    tokio::time::sleep(Duration::from_millis(1800)).await;

    // Ato 4 — Engenharia (blueprint)
    emit_act(&app, 4, "Engenharia", "blueprint");
    say(
        &app,
        "u_demo_5",
        "Vamos desenhar o pipeline: áudio entra lock-free, o VAD detecta a fala e o ASR transcreve.",
        600,
    )
    .await;
    brain.apply_op(
        &SceneOp::Theme {
            style: crate::scene::ThemeId::Blueprint,
            locked: Some(true),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Clear { keep_title: None },
        true,
    );
    brain.apply_op(
        &SceneOp::Title {
            text: "Pipeline de Baixa Latência".into(),
            subtitle: Some("Do microfone à primeira ilustração em menos de meio segundo".into()),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "pipeline".into(),
            kind: crate::scene::NodeKind::Diagram,
            zone: crate::scene::SemanticZone::Top,
            title: Some("Arquitetura em 3 threads".into()),
            pinned: Some(true),
            data: json!({
                "direction": "LR",
                "nodes": [
                    {"id": "mic", "label": "Microfone", "shape": "pill", "color": "primary"},
                    {"id": "vad", "label": "Silero VAD", "shape": "box", "color": "secondary"},
                    {"id": "asr", "label": "Parakeet ASR", "shape": "box", "color": "accent"},
                    {"id": "brain", "label": "LLM NDJSON", "shape": "diamond", "color": "warning"},
                    {"id": "canvas", "label": "Canvas", "shape": "pill", "color": "primary"}
                ],
                "edges": [
                    {"from": "mic", "to": "vad", "label": "32 ms", "animated": true},
                    {"from": "vad", "to": "asr", "label": "280 ms", "animated": true},
                    {"from": "asr", "to": "brain", "label": "texto", "animated": true},
                    {"from": "brain", "to": "canvas", "label": "1 linha", "animated": true}
                ]
            }),
        },
        true,
    );
    say(
        &app,
        "u_demo_6",
        "Cada linha NDJSON é aplicada na hora: sem esperar a resposta inteira do modelo.",
        700,
    )
    .await;
    brain.apply_op(
        &SceneOp::Upsert {
            id: "codigo".into(),
            kind: crate::scene::NodeKind::Code,
            zone: crate::scene::SemanticZone::Bottom,
            title: Some("Operação atômica".into()),
            pinned: Some(true),
            data: json!({
                "language": "rust",
                "code": "for line in sse_lines {\n    if let Some(op) = parse_op(line) {\n        scene.apply(op);\n        app.emit(\"scene:op\", op)?;\n    }\n}",
                "highlight_lines": [4],
                "caption": "latência de parse < 0,5 ms por linha"
            }),
        },
        true,
    );
    brain.save_beat("Ato 4 · Pipeline");
    tokio::time::sleep(Duration::from_millis(1800)).await;

    // Ato 5 — Humanas (chalkboard)
    emit_act(&app, 5, "Humanas", "chalkboard");
    say(
        &app,
        "u_demo_9",
        "Agora uma linha do tempo para situar as ideias que estavam soltas.",
        600,
    ).await;
    brain.apply_op(
        &SceneOp::Theme {
            style: crate::scene::ThemeId::Chalkboard,
            locked: Some(true),
        },
        true,
    );
    brain.apply_op(&SceneOp::Clear { keep_title: None }, true);
    brain.apply_op(
        &SceneOp::Title {
            text: "A linha do tempo das ideias".into(),
            subtitle: Some("Do Iluminismo à inteligência artificial".into()),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "tempo".into(),
            kind: crate::scene::NodeKind::Timeline,
            zone: crate::scene::SemanticZone::Center,
            title: Some("Quatro viradas históricas".into()),
            pinned: Some(true),
            data: json!({
                "orientation": "vertical",
                "events": [
                    {"date": "1789", "title": "Revolução Francesa", "detail": "Direitos universais"},
                    {"date": "1859", "title": "Origem das Espécies", "detail": "Tempo profundo"},
                    {"date": "1969", "title": "ARPANET", "detail": "Redes globais"},
                    {"date": "2026", "title": "IA local", "detail": "Conhecimento no dispositivo", "highlight": true}
                ]
            }),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "definicao".into(),
            kind: crate::scene::NodeKind::Callout,
            zone: crate::scene::SemanticZone::Footer,
            title: None,
            pinned: Some(true),
            data: json!({
                "variant": "definition",
                "title": "Iluminismo",
                "body": "Movimento intelectual que colocou a razão e a experiência no centro da autoridade."
            }),
        },
        true,
    );
    brain.save_beat("Ato 5 · Linha do tempo");
    tokio::time::sleep(Duration::from_millis(1800)).await;

    // Ato 6 — Keynote (ted)
    emit_act(&app, 6, "Encerramento", "ted");
    say(
        &app,
        "u_demo_7",
        "E é isso: quando a ilustração acompanha a fala, a atenção da turma muda.",
        600,
    )
    .await;
    brain.apply_op(
        &SceneOp::Theme {
            style: crate::scene::ThemeId::Ted,
            locked: Some(true),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Clear { keep_title: None },
        true,
    );
    brain.apply_op(
        &SceneOp::Title {
            text: "Ver para entender".into(),
            subtitle: Some("A memória visual muda a sala de aula".into()),
        },
        true,
    );
    brain.apply_op(
        &SceneOp::Upsert {
            id: "impacto".into(),
            kind: crate::scene::NodeKind::Kpi,
            zone: crate::scene::SemanticZone::Hero,
            title: None,
            pinned: Some(true),
            data: json!({
                "value": "87%",
                "label": "de retenção com apoio visual",
                "delta": "+24% vs. áudio puro",
                "trend": "up"
            }),
        },
        true,
    );
    tokio::time::sleep(Duration::from_millis(900)).await;
    brain.apply_op(
        &SceneOp::Upsert {
            id: "fecho".into(),
            kind: crate::scene::NodeKind::Callout,
            zone: crate::scene::SemanticZone::Footer,
            title: None,
            pinned: Some(true),
            data: json!({
                "variant": "quote",
                "body": "Ensinar é desenhar ideias no tempo certo.",
                "author": "Gizmo"
            }),
        },
        true,
    );
    brain.save_beat("Ato 6 · Encerramento");
    tokio::time::sleep(Duration::from_millis(1200)).await;

    let _ = store.update_snapshot(&session_id, &scene.lock().snapshot_json());
    let _ = app.emit(
        "brain:status",
        BrainStatus {
            state: "idle".into(),
            model: "demo lecture".into(),
            ttft_ms: Some(120),
            first_op_ms: Some(180),
            error: None,
        },
    );
    Ok(())
}
