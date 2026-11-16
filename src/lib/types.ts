import { ARCFACE_MODEL } from "@/lib/recognition/arcface";
import type { SerializedIrisCode } from "@/lib/iris/encode";
import type { IrisQuality } from "@/lib/iris/pipeline";
import type { FaceQuality } from "@/lib/recognition/quality";

/**
 * Identificam o modelo/receita que gerou cada vetor. Vetores de receitas diferentes não são comparáveis;
 * ao mudar a receita, a base é recalculada a partir das fotos guardadas (ver lib/migrate.ts).
 */
export const FACE_MODEL_ID = `${ARCFACE_MODEL}/align5+flip/v1`;
export const PERIOCULAR_MODEL_ID = `${ARCFACE_MODEL}/periocular-mask66+flip/v1`;
export const IRIS_MODEL_ID = "iris-vis/red/loggabor16-32/256x32/v1";
/** Modelo antigo (Human faceres). Mantido só para reconhecer fichas que precisam ser atualizadas. */
export const LEGACY_FACE_MODEL_ID = "human-3.3.6/faceres";

/** Vetor biométrico com a identificação de quem o gerou. */
export interface Template {
  model: string;
  vector: number[];
}

export type MarkType =
  | "tatuagem"
  | "cicatriz"
  | "queimadura"
  | "sinal"
  | "marca_nascenca"
  | "piercing"
  | "outro";

export type BodyRegion =
  | "cabeca"
  | "rosto"
  | "pescoco"
  | "ombro"
  | "braco"
  | "antebraco"
  | "mao"
  | "torax"
  | "abdomen"
  | "costas"
  | "quadril"
  | "coxa"
  | "perna"
  | "pe";

export type BodySide = "esquerdo" | "direito" | "centro";

/** Cicatriz, tatuagem ou outro sinal particular (padrão "SMT" usado por polícias: scars, marks, tattoos). */
export interface BodyMark {
  id: string;
  type: MarkType;
  region?: BodyRegion;
  side?: BodySide;
  /** Descrição livre: desenho, cores, palavras escritas, tamanho aproximado. */
  description: string;
  /** Foto da marca (JPEG em data URL), opcional. */
  photo?: string;
}

/** Foto do rosto. Guardamos só o recorte do rosto (minimização de dados). */
export interface FacePhoto {
  id: string;
  /** Recorte do rosto em JPEG (data URL). */
  image: string;
  /** Data aproximada em que a foto foi tirada (AAAA-MM-DD). Ajuda a lidar com envelhecimento. */
  takenAt: string;
  /** Etapa 1: vetor ArcFace do rosto alinhado; null se não foi possível calcular. */
  face: Template | null;
  /** Etapa 2: vetor da região dos olhos (periocular). */
  periocular: Template | null;
  /** Laudo de qualidade da foto (fotos antigas podem não ter). */
  quality?: FaceQuality;
  /** Campos do formato antigo (faceres); só existem em fichas ainda não atualizadas. */
  embedding?: number[] | null;
  model?: string;
}

export type EyeSide = "od" | "oe";

/** Etapa 3: amostra de íris (experimental, luz visível). */
export interface IrisSample {
  id: string;
  /** od = olho direito da pessoa; oe = olho esquerdo. */
  eye: EyeSide;
  capturedAt: string;
  model: string;
  code: SerializedIrisCode;
  quality: IrisQuality;
  /** Recorte do olho com os círculos encontrados (JPEG), para conferência visual. */
  image: string;
}

export interface Person {
  id: string;
  name: string;
  alias: string;
  notes: string;
  photos: FacePhoto[];
  marks: BodyMark[];
  /** Amostras de íris (podem faltar em fichas antigas). */
  iris?: IrisSample[];
  createdAt: string;
  updatedAt: string;
}

export const EYE_LABEL: Record<EyeSide, string> = { od: "Olho direito", oe: "Olho esquerdo" };

export type LogAction =
  | "consulta_rosto"
  | "consulta_marca"
  | "consulta_iris"
  | "confirmacao"
  | "cadastro"
  | "edicao"
  | "exclusao"
  | "exportacao"
  | "importacao"
  | "apagar_tudo";

export interface LogEntry {
  id?: number;
  at: string;
  action: LogAction;
  detail: string;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function displayName(person: Pick<Person, "name" | "alias">): string {
  if (person.name && person.alias) return `${person.name} ("${person.alias}")`;
  return person.name || (person.alias ? `"${person.alias}"` : "Sem nome");
}
