import { FACE_MODEL_ID, PERIOCULAR_MODEL_ID, type FacePhoto, type Person, type Template } from "@/lib/types";

/**
 * Atualização da base quando o modelo muda (ex.: faceres → ArcFace + periocular).
 * As fotos do rosto ficam guardadas na ficha, então os vetores novos são recalculados
 * a partir delas, no próprio aparelho, sem precisar cadastrar ninguém de novo.
 */

/** Garante os campos novos em fichas gravadas por versões antigas (nada é recalculado aqui). */
export function normalizePerson(p: Person): Person {
  return {
    ...p,
    iris: p.iris ?? [],
    photos: p.photos.map((ph) => ({ ...ph, face: ph.face ?? null, periocular: ph.periocular ?? null })),
  };
}

export function photoNeedsUpgrade(ph: FacePhoto): boolean {
  return ph.face?.model !== FACE_MODEL_ID || ph.periocular?.model !== PERIOCULAR_MODEL_ID;
}

export function personNeedsUpgrade(p: Person): boolean {
  return p.photos.some(photoNeedsUpgrade);
}

export interface Recomputed {
  face: Template | null;
  periocular: Template | null;
  quality?: FacePhoto["quality"];
}

/**
 * Recalcula as fotos desatualizadas. `compute` recebe a foto guardada (data URL);
 * se não achar rosto, a foto fica sem vetor (continua visível na ficha).
 */
export async function upgradePerson(p: Person, compute: (image: string) => Promise<Recomputed | null>): Promise<Person> {
  const photos: FacePhoto[] = [];
  for (const ph of p.photos) {
    if (!photoNeedsUpgrade(ph)) {
      photos.push(ph);
      continue;
    }
    const r = await compute(ph.image).catch(() => null);
    const { embedding: _e, model: _m, ...rest } = ph;
    photos.push({
      ...rest,
      // Marca a receita mesmo sem rosto, para não tentar de novo a cada abertura.
      face: r?.face ?? { model: FACE_MODEL_ID, vector: [] },
      periocular: r?.periocular ?? { model: PERIOCULAR_MODEL_ID, vector: [] },
      quality: r?.quality ?? ph.quality,
    });
  }
  return { ...p, photos };
}
