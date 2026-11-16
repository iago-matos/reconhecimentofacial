import { downscale, gaussianBlur, percentile, toGray, type GrayImage, type RgbaRegion } from "@/lib/iris/image";
import { localizeIris, type Circle, type Localization } from "@/lib/iris/localize";
import { rubberSheet, validFraction, type NormalizedIris } from "@/lib/iris/normalize";
import { encodeIris, type IrisCode } from "@/lib/iris/encode";
import { insidePolygon, mean, type Pt } from "@/lib/recognition/geometry";
import type { EyeGeometry } from "@/lib/recognition/landmarks";

/**
 * Etapa 3 — íris em luz visível (EXPERIMENTAL).
 *
 * recorte do olho (RGBA, resolução máxima da câmera)
 *   → localização (malha facial + operador integro-diferencial)
 *   → máscara (pálpebras, cílios, reflexos)
 *   → normalização de Daugman (256 × 32)
 *   → código log-Gabor de 2 escalas (32 768 bits) + máscara
 *
 * Em luz visível a melanina esconde a textura de íris castanhas/escuras (NIST IREX IX),
 * por isso cada captura sai com um laudo de qualidade e o resultado só vale como apoio.
 */

/** Raio da íris (px) em que a localização trabalha; olhos maiores são reduzidos (média de blocos). */
const WORK_RADIUS = 90;

export type QualityGrade = "boa" | "aceitavel" | "ruim";

export interface IrisQuality {
  grade: QualityGrade;
  /** Diâmetro da íris na foto original (px). ISO/IEC 19794-6: ≥150 autenticação, ≥210 cadastro. */
  diameterPx: number;
  /** Fração da íris visível e aproveitável (0..1). */
  usableArea: number;
  /** Raio da pupila / raio da íris. */
  pupilRatio: number;
  pupilEstimated: boolean;
  /** Nitidez relativa ao contraste da própria íris. */
  sharpness: number;
  /** Contraste íris × esclera (0..1). */
  scleraContrast: number;
  /** Afastamento do olhar em relação ao centro do olho (fração da largura do olho). */
  gaze: number;
  reasons: string[];
}

export interface IrisExtraction {
  code: IrisCode;
  quality: IrisQuality;
  /** Círculos em coordenadas da imagem ORIGINAL. */
  iris: Circle;
  pupil: Circle;
  normalized: NormalizedIris;
  localization: Localization;
}

export const MIN_DIAMETER = 100;
export const ISO_AUTH_DIAMETER = 150;
export const ISO_ENROL_DIAMETER = 210;
const MIN_USABLE = 0.4;
const GOOD_USABLE = 0.6;
/** Nitidez (passa-banda ÷ contraste). Medido com olhos sintéticos: o código degrada abaixo de ~0,10. Provisório. */
const MIN_SHARPNESS = 0.08;
const WARN_SHARPNESS = 0.13;
const MIN_LIMBUS = 0.04;

/** Recorte (em coordenadas da imagem original) que cobre o olho com folga. */
export function eyeCropRect(eye: EyeGeometry): { x: number; y: number; width: number; height: number } {
  const w = eye.width * 1.6;
  const h = eye.width * 1.2;
  const c = eye.irisCenter ?? mean(eye.contour);
  return { x: Math.round(c[0] - w / 2), y: Math.round(c[1] - h / 2), width: Math.round(w), height: Math.round(h) };
}

/** Encolhe o contorno das pálpebras na vertical (as marcações da malha costumam ficar um pouco para fora). */
function shrink(poly: Pt[], fy: number): Pt[] {
  const c = mean(poly);
  return poly.map(([x, y]) => [x, c[1] + (y - c[1]) * fy]);
}

export function extractIris(region: RgbaRegion, eye: EyeGeometry): IrisExtraction | null {
  // Tudo passa para coordenadas do recorte.
  const toLocal = (p: Pt): Pt => [p[0] - region.offsetX, p[1] - region.offsetY];
  const center = toLocal(eye.irisCenter ?? mean(eye.contour));
  const r0 = eye.irisRadius ?? eye.width * 0.21;

  const factor = Math.max(1, Math.floor(r0 / WORK_RADIUS));
  const scale = (p: Pt): Pt => [(p[0] - (factor - 1) / 2) / factor, (p[1] - (factor - 1) / 2) / factor];
  const luma = gaussianBlur(downscale(toGray(region, "luma"), factor), 1.5);
  // Canal vermelho: o mais próximo do infravermelho; mostra mais textura em íris escuras.
  const red = gaussianBlur(downscale(toGray(region, "red"), factor), 0.6);
  const lumaSharp = downscale(toGray(region, "luma"), factor);

  const guessC = scale(center);
  const loc = localizeIris(luma, { x: guessC[0], y: guessC[1], r: r0 / factor });
  if (!loc) return null;

  const lids = shrink(eye.contour.map(toLocal).map(scale), 0.9);
  const inLids = (x: number, y: number) => insidePolygon([x, y], lids);

  // Brilho típico da íris visível, para achar reflexos (muito claros) e cílios (muito escuros).
  const irisVals: number[] = [];
  for (let y = Math.floor(loc.iris.y - loc.iris.r); y <= loc.iris.y + loc.iris.r; y += 2)
    for (let x = Math.floor(loc.iris.x - loc.iris.r); x <= loc.iris.x + loc.iris.r; x += 2) {
      const d = Math.hypot(x - loc.iris.x, y - loc.iris.y);
      if (d > loc.pupil.r * 1.2 && d < loc.iris.r * 0.9 && inLids(x, y) && x >= 0 && y >= 0 && x < luma.width && y < luma.height)
        irisVals.push(lumaSharp.data[y * luma.width + x]);
    }
  const med = percentile(irisVals, 50);
  const spread = percentile(irisVals, 90) - percentile(irisVals, 10);
  const specular = Math.min(0.97, med + Math.max(0.3, 3 * spread));
  const lash = med * 0.45;
  const reject = (x: number, y: number) => {
    if (!inLids(x, y)) return true;
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= lumaSharp.width || yi >= lumaSharp.height) return true;
    const v = lumaSharp.data[yi * lumaSharp.width + xi];
    return v > specular || v < lash;
  };

  // Coluna 0 aponta do canto interno para o externo: compensa a inclinação da cabeça.
  const angle0 = Math.atan2(eye.outer[1] - eye.inner[1], eye.outer[0] - eye.inner[0]);
  const normalized = rubberSheet(red, loc.pupil, loc.iris, { angle0, reject });
  const code = encodeIris(normalized);

  const back = (c: Circle): Circle => ({
    x: c.x * factor + (factor - 1) / 2 + region.offsetX,
    y: c.y * factor + (factor - 1) / 2 + region.offsetY,
    r: c.r * factor,
  });
  const iris = back(loc.iris);
  const pupil = back(loc.pupil);

  const quality = assessQuality({
    loc,
    iris,
    usableArea: validFraction(normalized),
    sharpness: relativeSharpness(lumaSharp, loc, inLids),
    scleraContrast: scleraContrast(luma, loc.iris),
    gaze: Math.hypot(iris.x - mean(eye.contour)[0], iris.y - mean(eye.contour)[1]) / eye.width,
  });
  return { code, quality, iris, pupil, normalized, localization: loc };
}

/**
 * Nitidez = energia passa-banda (diferença de gaussianas σ 0,8 e 2,4 px, na escala de trabalho)
 * dividida pelo contraste da íris. O passa-banda ignora o ruído fino do sensor e mede a textura
 * na faixa de frequência que o código usa — ideia semelhante ao núcleo de foco de Daugman (2004).
 */
function relativeSharpness(img: GrayImage, loc: Localization, inLids: (x: number, y: number) => boolean): number {
  const inside = (x: number, y: number) => {
    const d = Math.hypot(x - loc.iris.x, y - loc.iris.y);
    return d > loc.pupil.r * 1.15 && d < loc.iris.r * 0.9 && inLids(x, y);
  };
  const fine = gaussianBlur(img, 0.8);
  const coarse = gaussianBlur(img, 2.4);
  const vals: number[] = [];
  let s2 = 0;
  for (let y = 0; y < img.height; y += 2)
    for (let x = 0; x < img.width; x += 2) {
      if (!inside(x, y)) continue;
      const i = y * img.width + x;
      vals.push(coarse.data[i]);
      const d = fine.data[i] - coarse.data[i];
      s2 += d * d;
    }
  const contrast = percentile(vals, 90) - percentile(vals, 10);
  if (!(contrast > 0) || vals.length < 20) return 0;
  return Math.sqrt(s2 / vals.length) / contrast;
}

function scleraContrast(img: GrayImage, iris: Circle): number {
  const ring = (r0: number, r1: number) => {
    const v: number[] = [];
    for (const deg of [-20, -10, 0, 10, 20, 160, 170, 180, 190, 200]) {
      const t = (deg * Math.PI) / 180;
      for (let r = r0; r <= r1; r += 1) {
        const x = Math.round(iris.x + r * Math.cos(t));
        const y = Math.round(iris.y + r * Math.sin(t));
        if (x >= 0 && y >= 0 && x < img.width && y < img.height) v.push(img.data[y * img.width + x]);
      }
    }
    return percentile(v, 50);
  };
  const c = ring(iris.r * 1.12, iris.r * 1.35) - ring(iris.r * 0.7, iris.r * 0.88);
  return Number.isFinite(c) ? Math.max(0, c) : 0;
}

function assessQuality(m: {
  loc: Localization;
  iris: Circle;
  usableArea: number;
  sharpness: number;
  scleraContrast: number;
  gaze: number;
}): IrisQuality {
  const reasons: string[] = [];
  let grade: QualityGrade = "boa";
  const worse = (g: QualityGrade) => {
    if (g === "ruim" || (g === "aceitavel" && grade === "boa")) grade = g;
  };
  const diameterPx = m.iris.r * 2;
  const pupilRatio = m.loc.pupil.r / m.loc.iris.r;

  if (diameterPx < MIN_DIAMETER) {
    worse("ruim");
    reasons.push(`Íris pequena demais na foto (${Math.round(diameterPx)} px; mínimo ${MIN_DIAMETER}, ideal ≥ ${ISO_ENROL_DIAMETER}). Aproxime a câmera.`);
  } else if (diameterPx < ISO_AUTH_DIAMETER) {
    worse("aceitavel");
    reasons.push(`Íris com ${Math.round(diameterPx)} px; a norma ISO pede ≥ ${ISO_AUTH_DIAMETER} px.`);
  }
  if (m.loc.irisStrength < MIN_LIMBUS) {
    worse("ruim");
    reasons.push("Borda da íris pouco nítida (foco, luz ou olho fechado).");
  }
  if (m.usableArea < MIN_USABLE) {
    worse("ruim");
    reasons.push(`Só ${Math.round(m.usableArea * 100)}% da íris aproveitável (pálpebra, cílios ou reflexo). Peça para abrir bem os olhos.`);
  } else if (m.usableArea < GOOD_USABLE) {
    worse("aceitavel");
    reasons.push(`${Math.round(m.usableArea * 100)}% da íris aproveitável.`);
  }
  if (pupilRatio < 0.15 || pupilRatio > 0.7) {
    worse("ruim");
    reasons.push("Tamanho de pupila fora do normal (verifique a localização).");
  }
  if (m.loc.pupilEstimated) {
    worse("aceitavel");
    reasons.push("Borda da pupila não ficou visível (comum em íris escura sob luz comum); foi estimada.");
  }
  if (m.sharpness < MIN_SHARPNESS) {
    worse("ruim");
    reasons.push("Imagem tremida ou fora de foco. Segure firme e espere a câmera focar no olho.");
  } else if (m.sharpness < WARN_SHARPNESS) {
    worse("aceitavel");
    reasons.push("Imagem um pouco desfocada.");
  }
  if (m.gaze > 0.3) {
    worse("ruim");
    reasons.push("Olhar muito desviado. Peça para olhar direto para a câmera.");
  } else if (m.gaze > 0.18) {
    worse("aceitavel");
    reasons.push("Olhar levemente desviado.");
  }
  if (m.scleraContrast < 0.05) {
    worse("aceitavel");
    reasons.push("Pouco contraste entre íris e parte branca do olho.");
  }
  return {
    grade,
    diameterPx,
    usableArea: m.usableArea,
    pupilRatio,
    pupilEstimated: m.loc.pupilEstimated,
    sharpness: m.sharpness,
    scleraContrast: m.scleraContrast,
    gaze: m.gaze,
    reasons,
  };
}
