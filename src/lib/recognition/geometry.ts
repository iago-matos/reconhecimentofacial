/** Geometria 2D: transformação de similaridade (rotação + escala + translação) usada para alinhar rostos e olhos. */

export type Pt = [x: number, y: number];

/** x' = a·x − b·y + tx ;  y' = b·x + a·y + ty */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/**
 * Melhor similaridade (mínimos quadrados) que leva `src` em `dst`.
 * Solução fechada de Umeyama (1991) restrita a 2D sem reflexão.
 */
export function estimateSimilarity(src: Pt[], dst: Pt[]): Similarity {
  const n = Math.min(src.length, dst.length);
  if (n < 2) throw new Error("São necessários pelo menos 2 pontos.");
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1];
  }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx, py = src[i][1] - sy;
    const qx = dst[i][0] - dx, qy = dst[i][1] - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  if (den === 0) throw new Error("Pontos coincidentes.");
  const a = num1 / den;
  const b = num2 / den;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

export function applySimilarity(t: Similarity, p: Pt): Pt {
  return [t.a * p[0] - t.b * p[1] + t.tx, t.b * p[0] + t.a * p[1] + t.ty];
}

export function invertSimilarity(t: Similarity): Similarity {
  const d = t.a * t.a + t.b * t.b;
  const a = t.a / d;
  const b = -t.b / d;
  return { a, b, tx: -(a * t.tx - b * t.ty), ty: -(b * t.tx + a * t.ty) };
}

export function similarityScale(t: Similarity): number {
  return Math.hypot(t.a, t.b);
}

/** Similaridade que leva dois pontos exatamente em outros dois (ex.: centros dos olhos). */
export function similarityFromTwoPoints(p1: Pt, p2: Pt, q1: Pt, q2: Pt): Similarity {
  return estimateSimilarity([p1, p2], [q1, q2]);
}

export const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
export const mean = (pts: Pt[]): Pt => {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
};

/** Ponto dentro de polígono (regra par-ímpar). */
export function insidePolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
