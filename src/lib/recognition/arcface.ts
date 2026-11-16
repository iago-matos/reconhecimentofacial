import type { Human } from "@vladmandic/human";

/**
 * Etapa 1 — vetor facial ArcFace (InsightFace).
 *
 * ArcFace (Deng et al., CVPR 2019) é a família de modelos usada pelos algoritmos que lideram
 * o NIST FRTE. Aqui usamos a conversão para navegador (TFJS) de vladmandic/insightface,
 * treinada por leondgarse/Keras_insightface. Entrada: rosto alinhado 112×112.
 *
 * Melhorias sobre o modelo anterior (faceres, 1024 números, recorte sem alinhamento):
 *   - alinhamento por 5 pontos no gabarito exato do treino do ArcFace;
 *   - média do vetor da imagem e da imagem espelhada ("flip test"), prática padrão de avaliação.
 */
export const ARCFACE_MODELS = [
  "insightface-efficientnet-b0",
  "insightface-ghostnet-strides1",
  "insightface-ghostnet-strides2",
  "insightface-mobilenet-emore",
  "insightface-mobilenet-swish",
] as const;
export type ArcfaceModelName = (typeof ARCFACE_MODELS)[number];

/** Modelo escolhido pela avaliação no LFW (ver BIOMETRIA.md). Os pesos ficam em vendor/models. */
export const ARCFACE_MODEL: ArcfaceModelName = "insightface-efficientnet-b0";

export type InputNorm = "unit" | "symmetric";
/** Faixa de entrada esperada pelo modelo: [0,1] ("unit") ou [−1,1] ("symmetric"). */
export const ARCFACE_INPUT: InputNorm = "unit";

type GraphModel = Awaited<ReturnType<Human["tf"]["loadGraphModel"]>>;
const cache = new Map<string, Promise<GraphModel>>();

export function loadArcface(human: Human, name: string = ARCFACE_MODEL): Promise<GraphModel> {
  const url = `${import.meta.env.BASE_URL}models/${name}.json`;
  const cached = cache.get(url);
  if (cached) return cached;
  const p: Promise<GraphModel> = human.tf.loadGraphModel(url).catch((e: unknown) => {
    cache.delete(url);
    throw e;
  });
  cache.set(url, p);
  return p;
}

/** Vetor (normalizado, norma 1) de um rosto já alinhado 112×112. Com `flip`, soma o vetor do espelho. */
export async function embedAligned(
  human: Human,
  model: GraphModel,
  aligned: HTMLCanvasElement,
  opts: { flip?: boolean; norm?: InputNorm } = {},
): Promise<number[]> {
  const tf = human.tf;
  const norm = opts.norm ?? ARCFACE_INPUT;
  // O tfjs embutido no Human só tem a API funcional (tf.div(x, …)), não a encadeada (x.div(…)).
  const out = tf.tidy(() => {
    const img = tf.cast(tf.browser.fromPixels(aligned), "float32");
    const x = norm === "unit" ? tf.div(img, 255) : tf.div(tf.sub(img, 127.5), 127.5);
    const batch = opts.flip ?? true ? tf.stack([x, tf.reverse(x, 1)]) : tf.expandDims(x, 0);
    const y = model.execute(batch) as ReturnType<typeof tf.tensor>;
    return tf.sum(y, 0);
  });
  const data = Array.from(await out.data()) as number[];
  out.dispose();
  let n = 0;
  for (const v of data) n += v * v;
  n = Math.sqrt(n) || 1;
  return data.map((v) => v / n);
}
