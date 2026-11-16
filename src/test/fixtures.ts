import { FACE_MODEL_ID, PERIOCULAR_MODEL_ID, type BodyMark, type Person } from "@/lib/types";

/** Pessoa de teste. `embeddings` vira o vetor do rosto e também o periocular (salvo se `periocular` for dado). */
export function person(
  id: string,
  embeddings: number[][],
  marks: Omit<BodyMark, "id">[] = [],
  name = id,
  periocular?: number[][],
): Person {
  return {
    id,
    name,
    alias: "",
    notes: "",
    photos: embeddings.map((embedding, i) => ({
      id: `${id}-f${i}`,
      image: "data:image/jpeg;base64,AAAA",
      takenAt: "2026-01-01",
      face: { model: FACE_MODEL_ID, vector: embedding },
      periocular: { model: PERIOCULAR_MODEL_ID, vector: periocular?.[i] ?? embedding },
    })),
    marks: marks.map((m, i) => ({ id: `${id}-m${i}`, ...m })),
    iris: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export const probeOf = (v: number[], peri: number[] = v) => ({
  face: { model: FACE_MODEL_ID, vector: v },
  periocular: { model: PERIOCULAR_MODEL_ID, vector: peri },
});
