import type { Config, FaceResult, Human } from "@vladmandic/human";
import { cropFace, type Box } from "@/lib/image";
import { laplacianVariance, percentile, type GrayImage } from "@/lib/iris/image";
import { eyeCropRect, extractIris, type IrisExtraction } from "@/lib/iris/pipeline";
import { ARCFACE_SIZE, alignedPreview, arcfaceTransform, warpSimilarity } from "@/lib/recognition/align";
import { ARCFACE_MODEL, embedAligned, loadArcface, type InputNorm } from "@/lib/recognition/arcface";
import type { Pt } from "@/lib/recognition/geometry";
import { eyeAnchor, interEyeDistance, landmarksFromMesh, mapLandmarks, type EyeSide, type FaceLandmarks } from "@/lib/recognition/landmarks";
import { maskBelow, PERIOCULAR_MASK_ROW, STRIP_H, STRIP_W, stripTransform, textureDescriptor } from "@/lib/recognition/periocular";
import { gradeFace, type FaceQuality } from "@/lib/recognition/quality";
import { FACE_MODEL_ID, PERIOCULAR_MODEL_ID, type Template } from "@/lib/types";

/**
 * Motor de reconhecimento (roda no aparelho; nada é enviado para fora).
 *   Human/blazeface → encontra rostos
 *   Human/facemesh + iris → 478 pontos (olhos, pálpebras, íris, nariz, boca)
 *   ArcFace (InsightFace) → vetor do rosto alinhado (Etapa 1) e da região dos olhos (Etapa 2)
 *   módulo de íris próprio → código de íris em luz visível (Etapa 3, experimental)
 */
const config: Partial<Config> = {
  modelBasePath: `${import.meta.env.BASE_URL}models/`,
  cacheSensitivity: 0,
  warmup: "none",
  debug: false,
  filter: { enabled: false } as Config["filter"],
  face: {
    enabled: true,
    detector: { enabled: true, rotation: true, maxDetected: 10, minConfidence: 0.4, return: false },
    mesh: { enabled: true },
    iris: { enabled: true },
    emotion: { enabled: false },
    description: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    attention: { enabled: false },
  } as Config["face"],
  body: { enabled: false } as Config["body"],
  hand: { enabled: false } as Config["hand"],
  object: { enabled: false } as Config["object"],
  gesture: { enabled: false },
  segmentation: { enabled: false } as Config["segmentation"],
};

export interface DetectedFace {
  box: Box;
  score: number;
  /** Recorte do rosto (JPEG data URL) para mostrar e guardar na ficha. */
  crop: string;
  /** Rosto alinhado (olhos e boca em altura fixa) para a folha de comparação. */
  aligned: string;
  landmarks: FaceLandmarks;
  face: Template | null;
  periocular: Template | null;
  quality: FaceQuality;
}

let enginePromise: Promise<Human> | null = null;

async function create(backend: "webgl" | "cpu"): Promise<Human> {
  const { Human } = await import("@vladmandic/human");
  const human = new Human({ ...config, backend });
  await human.load();
  await human.tf.ready();
  await loadArcface(human);
  return human;
}

/** Carrega os modelos uma única vez. Usa GPU (WebGL) e, se não houver, CPU. */
export function loadEngine(): Promise<Human> {
  if (!enginePromise) {
    enginePromise = create("webgl")
      .catch((e) => {
        console.warn("WebGL indisponível, usando CPU:", e);
        return create("cpu");
      })
      .catch((e) => {
        enginePromise = null;
        throw e;
      });
  }
  return enginePromise;
}

// ---------------------------------------------------------------- utilidades de imagem

function grayOf(canvas: HTMLCanvasElement): GrayImage {
  const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  const out = new Float32Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
  return { width: canvas.width, height: canvas.height, data: out };
}

function faceStats(aligned: HTMLCanvasElement): { brightness: number; sharpness: number } {
  const g = grayOf(aligned);
  // Região central do rosto (evita fundo e cabelo).
  const inside = (x: number, y: number) => x > 24 && x < 88 && y > 36 && y < 100;
  const vals: number[] = [];
  for (let y = 36; y < 100; y++) for (let x = 24; x < 88; x++) vals.push(g.data[y * g.width + x]);
  const brightness = vals.reduce((s, v) => s + v, 0) / vals.length;
  const contrast = percentile(vals, 95) - percentile(vals, 5);
  const sharpness = contrast > 0 ? Math.sqrt(laplacianVariance(g, inside)) / contrast : 0;
  return { brightness, sharpness };
}

const DEG = 180 / Math.PI;

// ---------------------------------------------------------------- etapas 1 e 2

export interface TemplateOptions {
  model?: string;
  norm?: InputNorm;
  flip?: boolean;
  /** Linha a partir da qual o rosto alinhado é apagado para o vetor periocular. */
  maskRow?: number;
  /** Também calcula o descritor de textura (LBP+HOG) — usado na avaliação. */
  texture?: boolean;
}

export interface FaceTemplates {
  face: number[];
  periocular: number[];
  texture?: number[];
  aligned: HTMLCanvasElement;
  stats: { brightness: number; sharpness: number };
}

/** Calcula os vetores de rosto e periocular de um rosto já localizado. */
export async function computeTemplates(
  human: Human,
  canvas: HTMLCanvasElement,
  lm: FaceLandmarks,
  o: TemplateOptions = {},
): Promise<FaceTemplates> {
  const model = await loadArcface(human, o.model ?? ARCFACE_MODEL);
  const pts: Pt[] = [eyeAnchor(lm.od), eyeAnchor(lm.oe), lm.noseTip, lm.mouthOD, lm.mouthOE];
  const aligned = warpSimilarity(canvas, arcfaceTransform(pts), ARCFACE_SIZE, ARCFACE_SIZE);
  const face = await embedAligned(human, model, aligned, { flip: o.flip, norm: o.norm });
  const periocular = await embedAligned(human, model, maskBelow(aligned, o.maskRow ?? PERIOCULAR_MASK_ROW), { flip: o.flip, norm: o.norm });
  let texture: number[] | undefined;
  if (o.texture) {
    const strip = warpSimilarity(canvas, stripTransform(eyeAnchor(lm.od), eyeAnchor(lm.oe)), STRIP_W, STRIP_H);
    texture = textureDescriptor(grayOf(strip));
  }
  return { face, periocular, texture, aligned, stats: faceStats(aligned) };
}

function boxOf(f: FaceResult): Box {
  return [f.box[0], f.box[1], f.box[2], f.box[3]];
}

/** Encontra todos os rostos da imagem e calcula os vetores de cada um. Ordena da esquerda para a direita. */
export async function detectFaces(canvas: HTMLCanvasElement): Promise<DetectedFace[]> {
  const human = await loadEngine();
  const result = await human.detect(canvas);
  const out: DetectedFace[] = [];
  for (const f of result.face) {
    const lm = landmarksFromMesh(f.mesh);
    if (!lm) continue;
    const t = await computeTemplates(human, canvas, lm);
    const angle = f.rotation?.angle ?? { yaw: 0, pitch: 0, roll: 0 };
    out.push({
      box: boxOf(f),
      score: f.score,
      crop: cropFace(canvas, boxOf(f), 0.45, 640),
      aligned: alignedPreview(canvas, [eyeAnchor(lm.od), eyeAnchor(lm.oe), lm.noseTip, lm.mouthOD, lm.mouthOE]),
      landmarks: lm,
      face: { model: FACE_MODEL_ID, vector: t.face },
      periocular: { model: PERIOCULAR_MODEL_ID, vector: t.periocular },
      quality: gradeFace({
        interEyePx: interEyeDistance(lm),
        yaw: angle.yaw * DEG,
        pitch: angle.pitch * DEG,
        brightness: t.stats.brightness,
        sharpness: t.stats.sharpness,
      }),
    });
  }
  return out.sort((a, b) => a.box[0] - b.box[0]);
}

/** Para fotos de cadastro: usa o maior rosto da imagem. */
export async function detectMainFace(canvas: HTMLCanvasElement): Promise<{ face: DetectedFace | null; count: number }> {
  const faces = await detectFaces(canvas);
  const face = faces.reduce<DetectedFace | null>((big, f) => (!big || f.box[2] * f.box[3] > big.box[2] * big.box[3] ? f : big), null);
  return { face, count: faces.length };
}

/** Recalcula os vetores a partir de uma foto já guardada (atualização da base para um modelo novo). */
export async function templatesFromImage(dataUrl: string): Promise<DetectedFace | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Foto da ficha ilegível."));
    i.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return (await detectMainFace(c)).face;
}

// ---------------------------------------------------------------- etapa 3: íris

/**
 * Leitura rápida para orientar a captura ao vivo: só detector + malha, sem ArcFace.
 * Devolve o diâmetro estimado da íris (px) já na escala da foto final (`photoWidth`).
 */
export async function quickIrisEstimate(
  video: HTMLVideoElement,
  photoWidth: number,
): Promise<{ diameterPx: number; eyesOpen: boolean; centered: boolean } | null> {
  const human = await loadEngine();
  if (!video.videoWidth) return null;
  const side = 640;
  const k = Math.min(1, side / video.videoWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(video.videoWidth * k);
  c.height = Math.round(video.videoHeight * k);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  const r = await human.detect(c);
  const f = r.face.reduce<FaceResult | null>((big, x) => (!big || x.box[2] * x.box[3] > big.box[2] * big.box[3] ? x : big), null);
  const lm = f ? landmarksFromMesh(f.mesh) : null;
  if (!f || !lm || lm.od.irisRadius == null || lm.oe.irisRadius == null) return null;
  const toPhoto = photoWidth / c.width;
  const diameterPx = (lm.od.irisRadius + lm.oe.irisRadius) * toPhoto;
  // Abertura: altura do contorno do olho em relação ao diâmetro da íris.
  const openness = (e: typeof lm.od) => {
    const ys = e.contour.map((p) => p[1]);
    return (Math.max(...ys) - Math.min(...ys)) / (2 * (e.irisRadius ?? 1));
  };
  const cx = f.box[0] + f.box[2] / 2;
  const cy = f.box[1] + f.box[3] / 2;
  return {
    diameterPx,
    eyesOpen: openness(lm.od) > 0.7 && openness(lm.oe) > 0.7,
    centered: Math.abs(cx / c.width - 0.5) < 0.2 && Math.abs(cy / c.height - 0.5) < 0.25,
  };
}

/** Lado maior da imagem entregue ao detector na captura de íris (a íris em si usa a resolução total). */
const IRIS_DETECT_SIDE = 1920;

export interface EyeCapture {
  side: EyeSide;
  extraction: IrisExtraction | null;
  /** Recorte do olho (JPEG) com os círculos encontrados desenhados. */
  preview: string;
  /** Faixa normalizada (PNG), útil para conferência visual. */
  normalizedPreview: string | null;
  error?: string;
}

export interface IrisCaptureResult {
  /** Rosto encontrado (também serve para conferir rosto + periocular em alta resolução). */
  face: DetectedFace | null;
  eyes: EyeCapture[];
  /** Resolução da foto usada. */
  width: number;
  height: number;
}

/**
 * Analisa uma foto de perto (rosto ocupando a tela, câmera traseira em resolução máxima).
 * Os pontos são achados numa cópia reduzida e transportados para a foto original,
 * onde cada íris é recortada sem perda de resolução.
 */
export async function analyzeIrisPhoto(full: HTMLCanvasElement): Promise<IrisCaptureResult> {
  const human = await loadEngine();
  const k = Math.min(1, IRIS_DETECT_SIDE / Math.max(full.width, full.height));
  const small = document.createElement("canvas");
  small.width = Math.round(full.width * k);
  small.height = Math.round(full.height * k);
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(full, 0, 0, small.width, small.height);

  const faces = await detectFaces(small);
  const face = faces.reduce<DetectedFace | null>((big, f) => (!big || f.box[2] * f.box[3] > big.box[2] * big.box[3] ? f : big), null);
  if (!face) return { face: null, eyes: [], width: full.width, height: full.height };

  const up = (p: Pt): Pt => [p[0] / k, p[1] / k];
  const lm = mapLandmarks(face.landmarks, up, 1 / k);
  // Vetores de rosto e periocular recalculados na foto em resolução total.
  const t = await computeTemplates(human, full, lm);
  const hiFace: DetectedFace = {
    ...face,
    box: [face.box[0] / k, face.box[1] / k, face.box[2] / k, face.box[3] / k],
    landmarks: lm,
    aligned: alignedPreview(full, [eyeAnchor(lm.od), eyeAnchor(lm.oe), lm.noseTip, lm.mouthOD, lm.mouthOE]),
    face: { model: FACE_MODEL_ID, vector: t.face },
    periocular: { model: PERIOCULAR_MODEL_ID, vector: t.periocular },
  };

  const ctx = full.getContext("2d", { willReadFrequently: true })!;
  const eyes: EyeCapture[] = [];
  for (const side of ["od", "oe"] as const) {
    const eye = lm[side];
    const r = eyeCropRect(eye);
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    const w = Math.min(full.width - x, r.width);
    const h = Math.min(full.height - y, r.height);
    if (w < 20 || h < 20) {
      eyes.push({ side, extraction: null, preview: "", normalizedPreview: null, error: "Olho fora da foto." });
      continue;
    }
    const img = ctx.getImageData(x, y, w, h);
    let extraction: IrisExtraction | null = null;
    let error: string | undefined;
    try {
      extraction = extractIris({ width: w, height: h, data: img.data, offsetX: x, offsetY: y }, eye);
      if (!extraction) error = "Não foi possível localizar a íris.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    eyes.push({
      side,
      extraction,
      preview: eyePreview(full, { x, y, w, h }, extraction),
      normalizedPreview: extraction ? normalizedToDataUrl(extraction) : null,
      error,
    });
  }
  return { face: hiFace, eyes, width: full.width, height: full.height };
}

function eyePreview(full: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }, ex: IrisExtraction | null): string {
  const maxSide = 360;
  const s = Math.min(1, maxSide / Math.max(r.w, r.h));
  const c = document.createElement("canvas");
  c.width = Math.round(r.w * s);
  c.height = Math.round(r.h * s);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  if (ex) {
    ctx.lineWidth = 2;
    for (const [circle, color] of [
      // Branco SC = borda da íris; cáqui = pupila encontrada; dourado = pupila estimada.
      [ex.iris, "rgba(243,241,236,0.95)"],
      [ex.pupil, ex.quality.pupilEstimated ? "rgba(251,237,33,0.95)" : "rgba(178,169,152,0.95)"],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc((circle.x - r.x) * s, (circle.y - r.y) * s, circle.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return c.toDataURL("image/jpeg", 0.88);
}

/** Faixa normalizada em PNG; pixels mascarados aparecem em vermelho. */
export function normalizedToDataUrl(ex: IrisExtraction): string {
  const n = ex.normalized;
  const c = document.createElement("canvas");
  c.width = n.width;
  c.height = n.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(n.width, n.height);
  let lo = 1, hi = 0;
  for (let i = 0; i < n.data.length; i++) if (n.mask[i]) { lo = Math.min(lo, n.data[i]); hi = Math.max(hi, n.data[i]); }
  const span = hi - lo || 1;
  for (let i = 0; i < n.data.length; i++) {
    const v = Math.round(((n.data[i] - lo) / span) * 255);
    img.data[i * 4] = n.mask[i] ? v : 160;
    img.data[i * 4 + 1] = n.mask[i] ? v : 30;
    img.data[i * 4 + 2] = n.mask[i] ? v : 30;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
