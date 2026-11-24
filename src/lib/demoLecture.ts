import type { SceneOp } from '../types/scene';

export interface LocalDemoHandlers {
  applyOp: (op: SceneOp) => void;
  onAct: (act: number, title: string, theme: string) => void;
  onTranscript: (text: string) => void;
  onBeat: (label: string) => void;
  onStatus: (state: 'streaming' | 'idle') => void;
  shouldStop: () => boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runLocalDemo(handlers: LocalDemoHandlers): Promise<void> {
  const { applyOp, onAct, onTranscript, onBeat, onStatus, shouldStop } = handlers;
  onStatus('streaming');

  const step = async (op: SceneOp, pause = 420) => {
    if (shouldStop()) return;
    applyOp(op);
    await sleep(pause);
  };

  onAct(1, 'Cálculo', '3b1b');
  onTranscript('Vamos entender a derivada como uma taxa de variação instantânea.');
  await sleep(380);
  await step({ op: 'theme', style: '3b1b', locked: true });
  await step({ op: 'title', text: 'Derivada como Taxa Instantânea', subtitle: 'A reta secante vira tangente quando h tende a zero' });
  await step({
    op: 'upsert',
    id: 'plot_f',
    kind: 'plot_2d',
    zone: 'left',
    title: 'f(x) = x² e a tangente em x = 1',
    pinned: true,
    data: {
      domain: [-2.5, 3.5],
      range: [-1.5, 9.5],
      x_label: 'x',
      y_label: 'f(x)',
      functions: [
        { expr: 'x^2', label: 'f(x) = x²', color: 'primary' },
        { expr: '2*x - 1', label: 'Tangente em x = 1', color: 'accent', dashed: true },
      ],
      points: [{ x: 1, y: 1, label: 'P(1, 1)', color: 'accent' }],
    },
  }, 650);
  onTranscript('Repare no ponto P: a inclinação da tangente é exatamente a derivada naquele ponto.');
  await step({
    op: 'upsert',
    id: 'eq_derivada',
    kind: 'math',
    zone: 'right',
    title: 'Definição de derivada',
    pinned: true,
    data: {
      latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}",
      steps: ["f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}", "f'(1) = 2 \\cdot 1 = 2"],
      highlight_terms: ["f'(1) = 2"],
      caption: 'a taxa instantânea de variação',
    },
  }, 520);
  await step({
    op: 'upsert',
    id: 'triangulo',
    kind: 'geometry_2d',
    zone: 'bottom',
    title: 'O triângulo retângulo por trás da fórmula',
    pinned: true,
    data: {
      view_box: [0, 0, 200, 200],
      shapes: [
        { type: 'polygon', points: [[30, 160], [150, 160], [30, 70]], label: 'ABC', color: 'primary', fill: true },
        { type: 'right_angle', at: [30, 160], size: 16 },
        { type: 'segment_label', from: [30, 160], to: [150, 160], text: 'b = 4' },
        { type: 'segment_label', from: [30, 160], to: [30, 70], text: 'a = 3' },
        { type: 'segment_label', from: [150, 160], to: [30, 70], text: 'c = 5', color: 'accent' },
        { type: 'vector', from: [30, 160], to: [110, 100], label: 'v', color: 'secondary' },
      ],
    },
  }, 520);
  await step({ op: 'highlight', id: 'plot_f', style: 'pulse', ttl_ms: 2600 });
  onBeat('Ato 1 · Derivada');
  await sleep(900);

  onAct(2, 'Produto & Negócios', 'flipchart');
  onTranscript('Agora mudando de assunto: como decidir no que investir primeiro no produto?');
  await sleep(360);
  await step({ op: 'theme', style: 'flipchart', locked: true });
  await step({ op: 'clear' });
  await step({ op: 'title', text: 'Priorização de Produto', subtitle: 'Esforço versus impacto no trimestre' });
  await step({
    op: 'upsert',
    id: 'matriz',
    kind: 'matrix_2x2',
    zone: 'left',
    title: 'Matriz Esforço × Impacto',
    pinned: true,
    data: {
      x_axis: ['Baixo Esforço', 'Alto Esforço'],
      y_axis: ['Baixo Impacto', 'Alto Impacto'],
      quadrants: {
        tl: { title: 'Ganhos Rápidos', items: ['Automação do onboarding', 'Novo checkout'], highlight: true },
        tr: { title: 'Projetos Estratégicos', items: ['Expansão internacional'] },
        bl: { title: 'Tarefas Menores', items: ['Ajustes visuais'] },
        br: { title: 'Evitar', items: ['Reescrita legada'] },
      },
    },
  }, 640);
  onTranscript('Olhem o funil: de cada dez mil visitantes, apenas cento e oitenta viram clientes.');
  await step({
    op: 'upsert',
    id: 'funil',
    kind: 'funnel',
    zone: 'right',
    title: 'Funil de conversão',
    pinned: true,
    data: {
      stages: [
        { label: 'Visitantes', value: '10.000', rate: '100%' },
        { label: 'Leads', value: '1.200', rate: '12%' },
        { label: 'Clientes', value: '180', rate: '1,8%', highlight: true },
      ],
    },
  }, 520);
  await step({
    op: 'upsert',
    id: 'insight',
    kind: 'callout',
    zone: 'footer',
    pinned: true,
    data: {
      variant: 'insight',
      title: 'Onde está a alavanca?',
      body: 'Dobrar a conversão de leads para clientes vale mais do que dobrar o tráfego.',
    },
  });
  onBeat('Ato 2 · Priorização');
  await sleep(900);

  onAct(3, 'Método de estudo', 'whiteboard');
  onTranscript('Como fazer o conteúdo ficar na memória? Não é relendo: é recuperando ativamente.');
  await sleep(360);
  await step({ op: 'theme', style: 'whiteboard', locked: true });
  await step({ op: 'clear' });
  await step({ op: 'title', text: 'Estudo que funciona', subtitle: 'Três princípios com evidência para a sala de aula' });
  await step({
    op: 'upsert',
    id: 'metodo',
    kind: 'bullets',
    zone: 'left',
    title: 'O que a ciência da aprendizagem mostra',
    pinned: true,
    data: {
      ordered: false,
      items: [
        { id: 'b1', text: 'Recuperação ativa', subtext: 'Feche o material e explique em voz alta', icon: 'idea', emphasis: true },
        { id: 'b2', text: 'Espaçamento', subtext: 'Revise em 1, 3 e 7 dias', icon: 'star' },
        { id: 'b3', text: 'Sono e pausas', subtext: 'A consolidação acontece fora da aula', icon: 'sun' },
      ],
    },
  }, 520);
  await step({
    op: 'upsert',
    id: 'comparacao',
    kind: 'comparison',
    zone: 'right',
    title: 'Reler não é estudar',
    pinned: true,
    data: {
      left_title: 'Reler',
      right_title: 'Recuperar',
      rows: [
        { aspect: 'Esforço', left: 'Passivo e confortável', right: 'Ativo e desconfortável', winner: 'right' },
        { aspect: 'Retenção', left: 'Baixa após 7 dias', right: 'Até 3× maior', winner: 'right' },
        { aspect: 'Diagnóstico', left: 'Ilusão de fluência', right: 'Mostra o que falta', winner: 'right' },
      ],
    },
  }, 520);
  onTranscript('Olhem os dados: a prática de recuperação vence a leitura repetida depois de uma semana.');
  await step({
    op: 'upsert',
    id: 'retencao',
    kind: 'chart',
    zone: 'bottom',
    title: 'Retenção após 7 dias',
    pinned: true,
    data: {
      chart_type: 'bar',
      x_label: 'Método',
      y_label: 'Retenção',
      unit: '%',
      series: [
        { name: 'Retenção', color: 'primary', points: [
          { x: 'Aula', y: 20 },
          { x: 'Reler', y: 28 },
          { x: 'Praticar', y: 75 },
        ] },
      ],
    },
  }, 460);
  await step({
    op: 'upsert',
    id: 'lembrete',
    kind: 'freehand_note',
    zone: 'footer',
    pinned: true,
    data: { text: 'Lembrar: revisar amanhã!', color: 'yellow', rotation_deg: -2 },
  });
  onBeat('Ato 3 · Método');
  await sleep(700);

  onAct(4, 'Engenharia', 'blueprint');
  onTranscript('Vamos desenhar o pipeline: áudio entra lock-free, o VAD detecta a fala e o ASR transcreve.');
  await sleep(360);
  await step({ op: 'theme', style: 'blueprint', locked: true });
  await step({ op: 'clear' });
  await step({ op: 'title', text: 'Pipeline de Baixa Latência', subtitle: 'Do microfone à primeira ilustração em menos de meio segundo' });
  await step({
    op: 'upsert',
    id: 'pipeline',
    kind: 'diagram',
    zone: 'top',
    title: 'Arquitetura em 3 threads',
    pinned: true,
    data: {
      direction: 'LR',
      nodes: [
        { id: 'mic', label: 'Microfone', shape: 'pill', color: 'primary' },
        { id: 'vad', label: 'Silero VAD', shape: 'box', color: 'secondary' },
        { id: 'asr', label: 'Parakeet ASR', shape: 'box', color: 'accent' },
        { id: 'brain', label: 'LLM NDJSON', shape: 'diamond', color: 'warning' },
        { id: 'canvas', label: 'Canvas', shape: 'pill', color: 'primary' },
      ],
      edges: [
        { from: 'mic', to: 'vad', label: '32 ms', animated: true },
        { from: 'vad', to: 'asr', label: '280 ms', animated: true },
        { from: 'asr', to: 'brain', label: 'texto', animated: true },
        { from: 'brain', to: 'canvas', label: '1 linha', animated: true },
      ],
    },
  }, 680);
  onTranscript('Cada linha NDJSON é aplicada na hora: sem esperar a resposta inteira do modelo.');
  await step({
    op: 'upsert',
    id: 'codigo',
    kind: 'code',
    zone: 'bottom',
    title: 'Operação atômica',
    pinned: true,
    data: {
      language: 'rust',
      code: 'for line in sse_lines {\n    if let Some(op) = parse_op(line) {\n        scene.apply(op);\n        app.emit("scene:op", op)?;\n    }\n}',
      highlight_lines: [4],
      caption: 'latência de parse < 0,5 ms por linha',
    },
  }, 520);
  onBeat('Ato 4 · Pipeline');
  await sleep(900);

  onAct(5, 'Humanas', 'chalkboard');
  onTranscript('Agora uma linha do tempo para situar as ideias que estavam soltas.');
  await sleep(360);
  await step({ op: 'theme', style: 'chalkboard', locked: true });
  await step({ op: 'clear' });
  await step({ op: 'title', text: 'A linha do tempo das ideias', subtitle: 'Do Iluminismo à inteligência artificial' });
  await step({
    op: 'upsert',
    id: 'tempo',
    kind: 'timeline',
    zone: 'center',
    title: 'Quatro viradas históricas',
    pinned: true,
    data: {
      orientation: 'vertical',
      events: [
        { date: '1789', title: 'Revolução Francesa', detail: 'Direitos universais' },
        { date: '1859', title: 'Origem das Espécies', detail: 'Tempo profundo' },
        { date: '1969', title: 'ARPANET', detail: 'Redes globais' },
        { date: '2026', title: 'IA local', detail: 'Conhecimento no dispositivo', highlight: true },
      ],
    },
  }, 620);
  await step({
    op: 'upsert',
    id: 'definicao',
    kind: 'callout',
    zone: 'footer',
    pinned: true,
    data: {
      variant: 'definition',
      title: 'Iluminismo',
      body: 'Movimento intelectual que colocou a razão e a experiência no centro da autoridade.',
    },
  });
  onBeat('Ato 5 · Linha do tempo');
  await sleep(700);

  onAct(6, 'Encerramento', 'ted');
  onTranscript('E é isso: quando a ilustração acompanha a fala, a atenção da turma muda.');
  await sleep(360);
  await step({ op: 'theme', style: 'ted', locked: true });
  await step({ op: 'clear' });
  await step({ op: 'title', text: 'Ver para entender', subtitle: 'A memória visual muda a sala de aula' });
  await step({
    op: 'upsert',
    id: 'impacto',
    kind: 'kpi',
    zone: 'hero',
    pinned: true,
    data: {
      value: '87%',
      label: 'de retenção com apoio visual',
      delta: '+24% vs. áudio puro',
      trend: 'up',
    },
  }, 720);
  await step({
    op: 'upsert',
    id: 'fecho',
    kind: 'callout',
    zone: 'footer',
    pinned: true,
    data: {
      variant: 'quote',
      body: 'Ensinar é desenhar ideias no tempo certo.',
      author: 'Gizmo',
    },
  });
  onBeat('Ato 6 · Encerramento');
  await sleep(600);
  onStatus('idle');
}
