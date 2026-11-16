import type { BodyMark, BodyRegion, BodySide, MarkType, Person } from "@/lib/types";

export const MARK_TYPES: { value: MarkType; label: string }[] = [
  { value: "tatuagem", label: "Tatuagem" },
  { value: "cicatriz", label: "Cicatriz" },
  { value: "queimadura", label: "Queimadura" },
  { value: "sinal", label: "Sinal / pinta" },
  { value: "marca_nascenca", label: "Marca de nascença" },
  { value: "piercing", label: "Piercing" },
  { value: "outro", label: "Outro" },
];

export const BODY_REGIONS: { value: BodyRegion; label: string; group: RegionGroup }[] = [
  { value: "cabeca", label: "Cabeça / couro cabeludo", group: "cabeca" },
  { value: "rosto", label: "Rosto", group: "cabeca" },
  { value: "pescoco", label: "Pescoço", group: "cabeca" },
  { value: "ombro", label: "Ombro", group: "superior" },
  { value: "braco", label: "Braço", group: "superior" },
  { value: "antebraco", label: "Antebraço", group: "superior" },
  { value: "mao", label: "Mão / dedos", group: "superior" },
  { value: "torax", label: "Peito / tórax", group: "tronco" },
  { value: "abdomen", label: "Abdômen", group: "tronco" },
  { value: "costas", label: "Costas", group: "tronco" },
  { value: "quadril", label: "Quadril / glúteo", group: "inferior" },
  { value: "coxa", label: "Coxa", group: "inferior" },
  { value: "perna", label: "Perna / canela / panturrilha", group: "inferior" },
  { value: "pe", label: "Pé", group: "inferior" },
];

type RegionGroup = "cabeca" | "superior" | "tronco" | "inferior";

export const BODY_SIDES: { value: BodySide; label: string }[] = [
  { value: "esquerdo", label: "Esquerdo" },
  { value: "direito", label: "Direito" },
  { value: "centro", label: "Centro" },
];

const label = <T extends string>(list: { value: T; label: string }[], v?: T) =>
  v ? list.find((o) => o.value === v)?.label : undefined;

export function markTypeLabel(t: MarkType) {
  return label(MARK_TYPES, t) ?? t;
}

/** "Tatuagem · Antebraço esquerdo · carpa colorida" */
export function formatMark(mark: BodyMark): string {
  const where = [label(BODY_REGIONS, mark.region), label(BODY_SIDES, mark.side)?.toLowerCase()]
    .filter(Boolean)
    .join(" ");
  return [markTypeLabel(mark.type), where, mark.description.trim()].filter(Boolean).join(" · ");
}

/** Minúsculas e sem acento, para comparar textos digitados de formas diferentes. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "com", "no", "na", "um", "uma", "o", "a", "em"]);

function keywords(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

export interface MarkQuery {
  type?: MarkType;
  region?: BodyRegion;
  side?: BodySide;
  text?: string;
}

export interface MarkHit {
  person: Person;
  score: number;
  /** Marcas da pessoa que bateram com a busca, da mais relevante para a menos. */
  marks: { mark: BodyMark; score: number }[];
}

export function isEmptyQuery(q: MarkQuery): boolean {
  return !q.type && !q.region && !q.side && keywords(q.text ?? "").length === 0;
}

const regionGroup = (r: BodyRegion) => BODY_REGIONS.find((o) => o.value === r)?.group;

/**
 * Pontua uma marca:
 *  - tipo diferente do pedido: descarta;
 *  - região igual +3; região vizinha (mesmo grupo, ex. braço/antebraço) +1;
 *  - lado igual +1 (lado diferente não descarta: testemunhas confundem lados);
 *  - cada palavra da descrição encontrada +2 (aceita início de palavra: "carp" acha "carpa").
 */
export function scoreMark(mark: BodyMark, q: MarkQuery): number {
  if (q.type && mark.type !== q.type) return 0;
  let score = q.type ? 2 : 0;
  if (q.region) {
    if (mark.region === q.region) score += 3;
    else if (mark.region && regionGroup(mark.region) === regionGroup(q.region)) score += 1;
    else if (mark.region) return 0;
  }
  if (q.side && mark.side === q.side) score += 1;
  const words = keywords(q.text ?? "");
  if (words.length) {
    const hay = keywords(mark.description);
    const found = words.filter((w) => hay.some((h) => h.startsWith(w) || (w.length >= 4 && h.includes(w))));
    if (found.length === 0) return 0;
    score += found.length * 2;
  }
  return score;
}

/** Busca pessoas pelas marcas, sem depender do rosto. */
export function searchByMarks(persons: Person[], q: MarkQuery): MarkHit[] {
  if (isEmptyQuery(q)) return [];
  const hits: MarkHit[] = [];
  for (const person of persons) {
    const marks = person.marks
      .map((mark) => ({ mark, score: scoreMark(mark, q) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
    if (marks.length === 0) continue;
    // Melhor marca vale inteira; as demais somam pouco (desempate).
    const score = marks[0].score + marks.slice(1).reduce((s, m) => s + m.score * 0.25, 0);
    hits.push({ person, score, marks });
  }
  return hits.sort((a, b) => b.score - a.score);
}
