import { dist, mean, mid, type Pt } from "@/lib/recognition/geometry";

/**
 * Índices da malha facial de 478 pontos (MediaPipe Face Mesh + modelo de íris),
 * a mesma usada pela biblioteca Human.
 *
 * "OD" = olho direito DA PESSOA; numa foto não espelhada ele aparece do lado esquerdo da imagem.
 * "OE" = olho esquerdo da pessoa.
 */
export const MESH = {
  od: {
    outer: 33,
    inner: 133,
    upper: [246, 161, 160, 159, 158, 157, 173],
    lower: [7, 163, 144, 145, 153, 154, 155],
    brow: [70, 63, 105, 66, 107],
  },
  oe: {
    outer: 263,
    inner: 362,
    upper: [466, 388, 387, 386, 385, 384, 398],
    lower: [249, 390, 373, 374, 380, 381, 382],
    brow: [300, 293, 334, 296, 336],
  },
  /**
   * Os dois grupos de 5 pontos da íris (centro + 4 na borda). No Human, 473–477 fica no olho dos
   * cantos 33/133 e 468–472 no outro — o contrário do que parece pelo nome. Por isso cada grupo é
   * associado ao olho mais próximo, em vez de confiar na ordem.
   */
  irisGroups: [
    [468, 469, 470, 471, 472],
    [473, 474, 475, 476, 477],
  ],
  noseTip: 4,
  mouthOD: 61,
  mouthOE: 291,
} as const;

export type EyeSide = "od" | "oe";

export interface EyeGeometry {
  side: EyeSide;
  outer: Pt;
  inner: Pt;
  /** Contorno da abertura do olho (pálpebras), em ordem: canto externo → pálpebra superior → canto interno → pálpebra inferior. */
  contour: Pt[];
  /** Centro e raio da íris estimados pela malha (podem ser refinados depois). */
  irisCenter: Pt | null;
  irisRadius: number | null;
  center: Pt;
  width: number;
}

export interface FaceLandmarks {
  od: EyeGeometry;
  oe: EyeGeometry;
  noseTip: Pt;
  mouthOD: Pt;
  mouthOE: Pt;
}

type Mesh = ArrayLike<ArrayLike<number | undefined>>;
const P = (mesh: Mesh, i: number): Pt => [mesh[i][0] ?? 0, mesh[i][1] ?? 0];

interface Iris {
  center: Pt;
  radius: number;
}

function irisGroup(mesh: Mesh, idx: readonly number[]): Iris {
  const pts = idx.map((i) => P(mesh, i));
  // Pontos 1..4 ficam na borda da íris, em lados opostos dois a dois.
  return { center: pts[0], radius: (dist(pts[1], pts[3]) + dist(pts[2], pts[4])) / 4 };
}

function eye(mesh: Mesh, side: EyeSide, iris: Iris | null): EyeGeometry {
  const m = MESH[side];
  const outer = P(mesh, m.outer);
  const inner = P(mesh, m.inner);
  const contour = [outer, ...m.upper.map((i) => P(mesh, i)), inner, ...[...m.lower].reverse().map((i) => P(mesh, i))];
  return {
    side,
    outer,
    inner,
    contour,
    irisCenter: iris?.center ?? null,
    irisRadius: iris?.radius ?? null,
    center: iris?.center ?? mid(outer, inner),
    width: dist(outer, inner),
  };
}

export function landmarksFromMesh(mesh: Mesh): FaceLandmarks | null {
  if (!mesh || mesh.length < 468) return null;
  let od: Iris | null = null;
  let oe: Iris | null = null;
  if (mesh.length >= 478) {
    const [a, b] = MESH.irisGroups.map((g) => irisGroup(mesh, g));
    const odCenter = mid(P(mesh, MESH.od.outer), P(mesh, MESH.od.inner));
    // Cada grupo vai para o olho cujo centro está mais perto.
    [od, oe] = dist(a.center, odCenter) <= dist(b.center, odCenter) ? [a, b] : [b, a];
  }
  return {
    od: eye(mesh, "od", od),
    oe: eye(mesh, "oe", oe),
    noseTip: P(mesh, MESH.noseTip),
    mouthOD: P(mesh, MESH.mouthOD),
    mouthOE: P(mesh, MESH.mouthOE),
  };
}

/** Centro do olho usado no alinhamento (centro do contorno; mais estável que o centro da íris quando a pessoa olha de lado). */
export function eyeAnchor(e: EyeGeometry): Pt {
  return mean(e.contour);
}

/**
 * Os 5 pontos usados pelo ArcFace, na ordem do modelo:
 * olho à esquerda da imagem, olho à direita, ponta do nariz, canto da boca à esquerda, canto à direita.
 */
export function fivePoints(l: FaceLandmarks): Pt[] {
  return [eyeAnchor(l.od), eyeAnchor(l.oe), l.noseTip, l.mouthOD, l.mouthOE];
}

export function interEyeDistance(l: FaceLandmarks): number {
  return dist(eyeAnchor(l.od), eyeAnchor(l.oe));
}

/** Transforma todos os pontos (ex.: de coordenadas da imagem reduzida para a original). */
export function mapLandmarks(l: FaceLandmarks, f: (p: Pt) => Pt, scale: number): FaceLandmarks {
  const e = (g: EyeGeometry): EyeGeometry => ({
    ...g,
    outer: f(g.outer),
    inner: f(g.inner),
    contour: g.contour.map(f),
    irisCenter: g.irisCenter ? f(g.irisCenter) : null,
    irisRadius: g.irisRadius != null ? g.irisRadius * scale : null,
    center: f(g.center),
    width: g.width * scale,
  });
  return { od: e(l.od), oe: e(l.oe), noseTip: f(l.noseTip), mouthOD: f(l.mouthOD), mouthOE: f(l.mouthOE) };
}
