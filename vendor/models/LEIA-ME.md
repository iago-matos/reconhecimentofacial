# Modelos de terceiros

`insightface-efficientnet-b0.json/.bin` — ArcFace (InsightFace) convertido para TensorFlow.js.

- Conversão: [vladmandic/insightface](https://github.com/vladmandic/insightface) — licença MIT.
- Treino: [leondgarse/Keras_insightface](https://github.com/leondgarse/Keras_insightface) sobre dados do InsightFace,
  disponibilizados para **pesquisa/uso não comercial**. Adequado a este projeto acadêmico; para uso institucional
  real, verificar o licenciamento ou trocar por um modelo com licença comercial.
- Escolhido entre 5 variantes pela avaliação no LFW descrita em [BIOMETRIA.md](../../BIOMETRIA.md).

`scripts/copy-models.mjs` copia estes arquivos para `public/models` no `npm install`.
