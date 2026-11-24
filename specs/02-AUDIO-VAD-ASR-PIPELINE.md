# 02 — Pipeline Local de Áudio, Silero VAD v5 e ASR Multilíngue (`sherpa-onnx`)

## 1. Visão Geral dos "Ouvidos" do Gizmo

O subsistema de áudio e transcrição roda **100% localmente na máquina do usuário**, sem chave de API paga, sem nuvem e sem instalar Python. Toda a inferência usa **ONNX Runtime** estaticamente/nativamente empacotado via crate oficial **`sherpa-onnx`**.

### Catálogo Oficial de Modelos Suportados no App

O usuário pode baixar qualquer um dos modelos abaixo com **1 clique** dentro do próprio app (armazenados em `{app_data_dir}/models/`):

| ID Interno (`AsrModelId`) | Nome na Interface | Arquitetura `sherpa-onnx` | Tamanho Disco | Idiomas | Velocidade CPU (`RTF`) | Quando Recomendar |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **`parakeet-tdt-0.6b-v3-int8`** *(Padrão)* | **NVIDIA Parakeet TDT 0.6B v3 (Rápido · Multilíngue)** | `nemo_transducer` (INT8) | `~640 MB` | **25 idiomas com auto-detecção** (`pt`, `en`, `es`, `fr`, `de`, `it`, `nl`, `pl`, `ru`, `uk`, `sv`, `da`, `fi`, `el`, `cs`, `ro`, `hu`, `bg`, `hr`, `sk`, `sl`, `et`, `lv`, `lt`, `mt`) | **`~0.015`** (~45ms p/ 3s de fala!) | **Escolha padrão ideal** para aulas em Português, Inglês, Espanhol e idiomas europeus. |
| **`whisper-turbo-int8`** | **Whisper Large-v3 Turbo (99 Idiomas)** | `whisper` (INT8) | `~540 MB` | **99 idiomas** (inclui `pt`, `en`, `ja`, `zh`, `ko`, `ar`, `hi`, `he`, `tr`, etc.) | `~0.085` (~250ms p/ 3s de fala) | Quando o usuário der aulas em idiomas fora dos 25 do Parakeet (ex.: Árabe, Hindi, Hebraico) ou sotaques técnicos raros. |
| **`sense-voice-small-int8`** | **SenseVoice Small (Ultra-Leve EN/Ásia)** | `sense_voice` (INT8) | `~230 MB` | `en`, `zh`, `ja`, `ko`, `yue` | **`~0.010`** (~30ms p/ 3s de fala) | Máquinas antigas com pouca RAM para aulas em Inglês, Mandarim, Japonês ou Coreano. |

> **Modelo Obrigatório Auxiliar (Sempre Baixado Primeiro):**  
> **`silero-vad-v5`** (`silero_vad.onnx`, apenas **`~2.2 MB`**) — baixado automaticamente junto com qualquer modelo ASR.

---

## 2. URLs Exatas de Download e Estrutura de Arquivos Extraídos

Use estas URLs oficiais dos releases `asr-models` do projeto `k2-fsa/sherpa-onnx` (com suporte a espelho configurável em `AppConfig` caso o usuário esteja numa rede corporativa fechada):

### 2.1. Manifesto Estático (`src-tauri/src/audio/model_manifest.rs`)

```rust
pub struct ModelManifestEntry {
    pub id: &'static str,
    pub display_name: &'static str,
    pub url: &'static str,
    pub archive_type: ArchiveType, // RawFile | TarBz2
    pub expected_subdir: &'static str,
    pub approx_bytes: u64,
}

pub const SILERO_VAD_MANIFEST: ModelManifestEntry = ModelManifestEntry {
    id: "silero-vad-v5",
    display_name: "Silero VAD v5",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    archive_type: ArchiveType::RawFile,
    expected_subdir: "silero-vad",
    approx_bytes: 2_300_000,
};

pub const ASR_MODELS_MANIFEST: &[ModelManifestEntry] = &[
    ModelManifestEntry {
        id: "parakeet-tdt-0.6b-v3-int8",
        display_name: "NVIDIA Parakeet TDT 0.6B v3 (INT8 · 25 Idiomas)",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
        archive_type: ArchiveType::TarBz2,
        expected_subdir: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
        approx_bytes: 665_000_000,
    },
    ModelManifestEntry {
        id: "whisper-turbo-int8",
        display_name: "Whisper Large-v3 Turbo (INT8 · 99 Idiomas)",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2",
        archive_type: ArchiveType::TarBz2,
        expected_subdir: "sherpa-onnx-whisper-turbo",
        approx_bytes: 565_000_000,
    },
    ModelManifestEntry {
        id: "sense-voice-small-int8",
        display_name: "SenseVoice Small (INT8 · EN/ZH/JA/KO)",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
        archive_type: ArchiveType::TarBz2,
        expected_subdir: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
        approx_bytes: 240_000_000,
    },
];
```

### 2.2. Descoberta Resiliente de Arquivos ONNX dentro da Pasta Extraída

> **DICA VITAL PARA EVITAR BUGS DE CAMINHO:**  
> Em pacotes `.tar.bz2` do `sherpa-onnx`, alguns arquivos podem se chamar `encoder.int8.onnx` ou `turbo-encoder.int8.onnx`. Nunca faça hardcode cego sem fallback! Implemente uma função utilitária `find_file_ending_with(dir: &Path, suffixes: &[&str]) -> Result<PathBuf>`:

- Para **`parakeet-tdt-0.6b-v3-int8`**:
  - `encoder`: busca `["encoder.int8.onnx", "encoder.onnx"]`
  - `decoder`: busca `["decoder.int8.onnx", "decoder.onnx"]`
  - `joiner`: busca `["joiner.int8.onnx", "joiner.onnx"]`
  - `tokens`: busca `["tokens.txt"]`
  - `model_type`: `"nemo_transducer"`
- Para **`whisper-turbo-int8`**:
  - `encoder`: busca `["turbo-encoder.int8.onnx", "encoder.int8.onnx", "turbo-encoder.onnx"]`
  - `decoder`: busca `["turbo-decoder.int8.onnx", "decoder.int8.onnx", "turbo-decoder.onnx"]`
  - `tokens`: busca `["turbo-tokens.txt", "tokens.txt"]`
- Para **`sense-voice-small-int8`**:
  - `model`: busca `["model.int8.onnx", "model.onnx"]`
  - `tokens`: busca `["tokens.txt"]`

### 2.3. Extração Atômica e Segura de `.tar.bz2`
1. Baixe via stream HTTP (`reqwest`) para `{models_dir}/.staging/{id}.download` emitindo `models:progress` a cada `100ms`.
2. Descompacte com `bzip2::read::BzDecoder` + `tar::Archive` em `tokio::task::spawn_blocking` para `{models_dir}/.staging/{id}_extracted/`.
3. Verifique que os arquivos `.onnx` e `tokens.txt` existem e têm tamanho `> 1024 bytes`.
4. Mova atomicamente (`std::fs::rename`) a pasta final para `{models_dir}/{expected_subdir}` e apague `.staging/{id}.download`. Assim, se a energia cair no meio do download, o app nunca carrega um `.onnx` corrompido na próxima abertura!

---

## 3. Captura de Microfone Lock-Free (`cpal` + `rtrb` + `rubato`)

### 3.1. Seleção e Conversão de Formato no `cpal`
- Liste dispositivos de entrada com `cpal::default_host().input_devices()`. Permita selecionar um dispositivo específico por nome ou `"default"`.
- Consulte `device.default_input_config()`:
  - `channels`: pode ser `1` (mono), `2` (estéreo) ou mais (interfaces de áudio USB de professores!).
  - `sample_rate`: geralmente `48_000` ou `44_100` Hz.
  - `sample_format`: trate explicitamente `SampleFormat::F32`, `SampleFormat::I16` e `SampleFormat::U16`:
    - `I16`: `(s as f32) / 32768.0`
    - `U16`: `((s as f32) - 32768.0) / 32768.0`
- **Mixdown para Mono no Callback:**
  ```rust
  for frame in data.chunks_exact(channels) {
      let mut sum = 0.0f32;
      for &ch_sample in frame {
          sum += ch_sample;
      }
      let mono = sum / (channels as f32);
      let _ = ring_producer.push(mono); // NUNCA bloqueia!
  }
  ```

### 3.2. Reamostragem de Baixa Latência para `16_000 Hz` (`rubato`)
- Se `native_rate == 16_000`: bypass direto sem reamostrador.
- Se `native_rate != 16_000`: instancie na `Thread 2` (`gizmo-vad`) um `rubato::FastFixedIn::<f32>::new`:
  - `resample_ratio = 16_000.0 / (native_rate as f64)`
  - `max_resample_ratio_relative = 1.1`
  - `pol_deg = rubato::PolynomialDegree::Septic`
  - `chunk_size = (native_rate as usize) / 50` (blocos de `20ms` de entrada, ex.: `960` amostras a `48kHz`, gerando `320` amostras a `16kHz` em `< 0.08ms`!).
- Acumule a saída de `16_000 Hz` num `VecDeque<f32>` local e retire fatias exatas de **`512` amostras (`32 ms`)**.

---

## 4. Máquina de Estados Silero VAD v5 + Janela Deslizante Especulativa

Aqui mora o segredo da responsividade imediata do Gizmo.

### 4.1. Parâmetros Exatos do `SileroVadModelConfig`
```rust
let vad_config = VadModelConfig {
    silero_vad: SileroVadModelConfig {
        model: silero_onnx_path.to_string_lossy().into_owned(),
        threshold: config.vad_threshold, // Padrão: 0.45
        min_speech_duration: 0.20,       // 200ms filtra cliques de teclado/tosse curta
        min_silence_duration: 0.28,      // 280ms! Fecha cláusulas na respiração natural
        window_size: 512,                // Obrigatório p/ 16kHz no Silero VAD v5
        max_speech_duration: 8.0,        // Evita buffers infinitos em fala rápida
    },
    sample_rate: 16_000,
    num_threads: 1,
    provider: Some("cpu".into()),
    debug: false,
};
```

### 4.2. Buffer paralela de Pré-Roll + Parciais Especulativos (`RollingUtteranceTracker`)

Enquanto `VoiceActivityDetector` detecta segmentos finais precisos, mantemos um rastreador leve em paralelo na `Thread 2` para emitir **transcrições parciais a cada `400ms`** sem esperar o `VoiceActivityDetector` fechar o segmento:

1. **Ring de Pré-Roll (`pre_roll: VecDeque<f32>`, tamanho máximo `4_800` amostras = `300ms`):**  
   Enquanto em silêncio, guarda sempre os últimos `300ms` de áudio para nunca cortar a primeira consoante explosiva (*"P"*, *"T"*, *"C"*) quando a fala começa!
2. **Início da Fala (`vad.is_speech() == true`):**
   - Gera novo `utterance_id = format!("u_{:05}", counter)`.
   - Inicializa `live_pcm` copiando o `pre_roll` + o frame atual.
   - Registra `last_partial_at = Instant::now()`.
3. **Durante a Fala Ativa (a cada frame de `32ms`):**
   - Anexa as `512` amostras em `live_pcm`.
   - Se `last_partial_at.elapsed() >= Duration::from_millis(400)` **E** `live_pcm.len() >= 9_600` (`>= 600ms` de áudio):
     - Extrai uma fatia limitada aos últimos `96_000` samples (`6.0 segundos` máx. — garante que o tempo de inferência parcial nunca cresça além de `~65ms`!).
     - Faz `asr_partial_tx.try_send(AsrJob::Partial { utterance_id, samples: tail_slice })`.
     - Atualiza `last_partial_at = Instant::now()`.
4. **Fechamento de Segmento (`!vad.is_empty()` / `vad.front()`):**
   - Drena o `SpeechSegment` completo entregue pelo Silero VAD (`segment.samples()`), limpa `live_pcm` e envia **garantidamente** `AsrJob::Final { utterance_id, samples }`.

---

## 5. Configuração Exata do `OfflineRecognizer` (`sherpa-onnx`) e Aquecimento (*Warm-up*)

### 5.1. Inicialização por Tipo de Modelo
- **Parakeet TDT 0.6B v3 INT8 (`nemo_transducer`):**
  ```rust
  OfflineModelConfig {
      transducer: OfflineTransducerModelConfig {
          encoder: Some(encoder_path),
          decoder: Some(decoder_path),
          joiner: Some(joiner_path),
      },
      tokens: Some(tokens_path),
      num_threads: onnx_threads, // 2..=4
      provider: Some("cpu".into()),
      model_type: Some("nemo_transducer".into()),
      debug: false,
      ..Default::default()
  }
  ```
- **Whisper Turbo INT8 (`whisper`):**
  ```rust
  OfflineModelConfig {
      whisper: OfflineWhisperModelConfig {
          encoder: Some(encoder_path),
          decoder: Some(decoder_path),
          language: config.forced_language.clone().unwrap_or_default(), // "" = auto-detect!
          task: Some("transcribe".into()),
          tail_paddings: Some(800),
      },
      tokens: Some(tokens_path),
      num_threads: onnx_threads,
      provider: Some("cpu".into()),
      ..Default::default()
  }
  ```
- **SenseVoice Small INT8 (`sense_voice`):**
  ```rust
  OfflineModelConfig {
      sense_voice: OfflineSenseVoiceModelConfig {
          model: Some(model_path),
          language: Some("auto".into()),
          use_itn: true, // Inverse Text Normalization: formata números ("25%") automaticamente!
      },
      tokens: Some(tokens_path),
      num_threads: onnx_threads,
      provider: Some("cpu".into()),
      ..Default::default()
  }
  ```

### 5.2. Warm-up Obrigatório no Carregamento (Elimina Lag na 1ª Frase!)
Logo após criar o `OfflineRecognizer` na `Thread 3`, rode **imediatamente** uma inferência descartável com `vec![0.0f32; 8_000]` (`0.5s` de silêncio). Isso força o ONNX Runtime a alocar todas as arenas internas de memória e compilar kernels SIMD da CPU **antes** de o professor começar a falar, evitando um pico de `400ms` na primeira palavra da aula!

---

## 6. Filtro Anti-Alucinação de Silêncio / Ruído de Ventilador

Modelos ASR (especialmente Whisper, e raramente transducers sob ruído estacionário de ar-condicionado) podem emitir frases fantasmas curtas. Aplique esta função pura `sanitize_transcript(raw: &str, mean_rms: f32) -> Option<String>` antes de publicar qualquer evento:

1. Faça `.trim()` e remova tokens especiais residuais (`<|nospeech|>`, `<|emo:...|>` do SenseVoice, etc.).
2. Se `text.is_empty()` ou `mean_rms < 0.0025`: retorne `None`.
3. Lista negra exata (*case-insensitive*, apenas quando a frase **inteira** coincide com o item e `duration_ms < 1600`):
   - `"thank you."`, `"thanks for watching."`, `"subtitles by"`, `"legendas pela comunidade"`, `"amara.org"`, `"obrigado por assistir"`, `"you"`, `"."`, `"..."`, `"-"`.
4. Se passar, retorne `Some(clean_text)`.
