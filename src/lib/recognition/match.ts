import { FACE_MODEL_ID, PERIOCULAR_MODEL_ID, type Person, type Template } from "@/lib/types";

/**
 * Comparação e fusão rosto + periocular.
 *
 * Cada modalidade dá uma similaridade do cosseno (−1..1). Para somar modalidades com escalas
 * diferentes, cada uma é padronizada pela distribuição de IMPOSTORES (pares de pessoas diferentes)
 * medida na calibração: z = (s − média_impostor) / desvio_impostor ("z-norm", Jain et al., 2005).
 * A pontuação combinada é a soma ponderada dos z. As faixas são definidas pela taxa de falso
 * positivo (FMR) observada na calibração com o LFW — ver DOCUMENTACAO.txt.
 */
export const CALIBRATION = {
  // Medido no LFW (1 288 fotos, 828 360 pares de pessoas diferentes), nov/2026 — ver BIOMETRIA.md.
  face: { mean: 0.0035, std: 0.0616 },
  periocular: { mean: 0.0244, std: 0.0785 },
  /** Peso do periocular na fusão (rosto = 1). No LFW: neutro com rosto limpo, ajuda um pouco com máscara. */
  periocularWeight: 0.35,
} as const;

/** "completo": rosto + olhos. "coberto": só olhos (máscara, balaclava, gola, mão na boca). */
export type MatchMode = "completo" | "coberto";

/**
 * Limiares por modo, na escala da pontuação de cada modo (z combinado), medidos no LFW:
 *   alta   → FMR 0,01% (1 em 10 000 pares de pessoas diferentes). Acerto: 97,9% (completo) / 78,2% (coberto)
 *   media  → FMR 0,1%. Acerto: 98,5% / 85,8%
 *   minima → FMR 1%; abaixo disso o candidato não é mostrado. Acerto: 98,9% / 91,6%
 * Numa base de N pessoas, espere ~N/100 impostores acima da mínima por consulta: por isso só os 5 primeiros aparecem
 * e "baixa" quer dizer "pista fraca", nunca identificação.
 */
export const SCORE_BANDS: Record<MatchMode, { alta: number; media: number; minima: number }> = {
  completo: { alta: 4.38, media: 3.37, minima: 2.31 },
  coberto: { alta: 4.67, media: 3.67, minima: 2.53 },
};

export const MAX_CANDIDATES = 5;

export type Band = "alta" | "media" | "baixa";

export function bandFor(score: number, mode: MatchMode = "completo"): Band {
  const b = SCORE_BANDS[mode];
  if (score >= b.alta) return "alta";
  if (score >= b.media) return "media";
  return "baixa";
}

export const BAND_LABEL: Record<Band, string> = {
  alta: "Semelhança alta",
  media: "Semelhança média",
  baixa: "Semelhança baixa",
};

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export interface ProbeTemplates {
  face: Template | null;
  periocular: Template | null;
}

const zFace = (s: number) => (s - CALIBRATION.face.mean) / CALIBRATION.face.std;
const zPeri = (s: number) => (s - CALIBRATION.periocular.mean) / CALIBRATION.periocular.std;

/** Pontuação de um par (em desvios-padrão acima do típico de pessoas diferentes). */
export function fuseScores(face: number | null, periocular: number | null, mode: MatchMode): number | null {
  if (mode === "coberto" || face == null) return periocular == null ? null : zPeri(periocular);
  if (periocular == null) return zFace(face);
  const w = CALIBRATION.periocularWeight;
  return (zFace(face) + w * zPeri(periocular)) / (1 + w);
}

export interface Candidate {
  person: Person;
  /** Pontuação usada para ordenar e classificar (ver fuseScores). */
  score: number;
  band: Band;
  /** Melhor similaridade do rosto inteiro (Etapa 1). */
  face: number | null;
  /** Melhor similaridade da região dos olhos (Etapa 2). */
  periocular: number | null;
  /** Foto da ficha que ficou mais parecida com o rosto consultado. */
  bestPhotoId: string;
}

function best(probe: Template | null, person: Person, key: "face" | "periocular", modelId: string): { s: number; photoId: string } | null {
  if (!probe || probe.model !== modelId) return null;
  let r: { s: number; photoId: string } | null = null;
  for (const photo of person.photos) {
    const t = photo[key];
    if (!t || t.model !== modelId || t.vector.length === 0) continue;
    const s = cosineSimilarity(probe.vector, t.vector);
    if (!r || s > r.s) r = { s, photoId: photo.id };
  }
  return r;
}

/**
 * Compara um rosto com todas as fotos de todas as pessoas.
 * Cada pessoa entra com a sua foto mais parecida, então várias fotos de épocas
 * diferentes aumentam a chance de reconhecer quem mudou de aparência.
 * Retorna os N mais parecidos, nunca uma "identificação" única.
 */
export function rankCandidates(
  probe: ProbeTemplates,
  persons: Person[],
  opts: { mode?: MatchMode; limit?: number; minimum?: number } = {},
): Candidate[] {
  const mode = opts.mode ?? "completo";
  const minimum = opts.minimum ?? SCORE_BANDS[mode].minima;
  const result: Candidate[] = [];
  for (const person of persons) {
    const f = best(probe.face, person, "face", FACE_MODEL_ID);
    const p = best(probe.periocular, person, "periocular", PERIOCULAR_MODEL_ID);
    const score = fuseScores(f?.s ?? null, p?.s ?? null, mode);
    if (score == null || score < minimum) continue;
    const photoId = mode === "coberto" ? p?.photoId ?? f?.photoId : f?.photoId ?? p?.photoId;
    result.push({ person, score, band: bandFor(score, mode), face: f?.s ?? null, periocular: p?.s ?? null, bestPhotoId: photoId ?? "" });
  }
  return result.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? MAX_CANDIDATES);
}

/** Formata 0,7234 como "0,72". */
export function formatSimilarity(s: number): string {
  return s.toFixed(2).replace(".", ",");
}
