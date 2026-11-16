import { describe, expect, it } from "vitest";
import { normalizePerson, personNeedsUpgrade, upgradePerson } from "@/lib/migrate";
import { FACE_MODEL_ID, LEGACY_FACE_MODEL_ID, PERIOCULAR_MODEL_ID, type Person } from "@/lib/types";
import { person } from "./fixtures";

/** Ficha gravada pela versão anterior (faceres, sem periocular nem íris). */
function legacy(): Person {
  const p = person("old", [[1, 2, 3]]);
  const { face: _f, periocular: _p, ...photo } = p.photos[0];
  const { iris: _i, ...rest } = p;
  return { ...rest, photos: [{ ...photo, embedding: [9, 9, 9], model: LEGACY_FACE_MODEL_ID } as never] };
}

describe("atualização da base", () => {
  it("normaliza fichas antigas sem perder dados", () => {
    const n = normalizePerson(legacy());
    expect(n.iris).toEqual([]);
    expect(n.photos[0].face).toBeNull();
    expect(n.photos[0].image).toBe("data:image/jpeg;base64,AAAA");
    expect(personNeedsUpgrade(n)).toBe(true);
  });

  it("recalcula a partir da foto guardada e remove o vetor antigo", async () => {
    const up = await upgradePerson(normalizePerson(legacy()), async () => ({
      face: { model: FACE_MODEL_ID, vector: [1] },
      periocular: { model: PERIOCULAR_MODEL_ID, vector: [2] },
    }));
    expect(up.photos[0].face?.vector).toEqual([1]);
    expect(up.photos[0].periocular?.vector).toEqual([2]);
    expect(up.photos[0].embedding).toBeUndefined();
    expect(personNeedsUpgrade(up)).toBe(false);
  });

  it("foto sem rosto fica marcada (sem vetor) para não recalcular a cada abertura", async () => {
    const up = await upgradePerson(normalizePerson(legacy()), async () => null);
    expect(up.photos[0].face).toEqual({ model: FACE_MODEL_ID, vector: [] });
    expect(personNeedsUpgrade(up)).toBe(false);
  });

  it("ficha com vetores atuais mas sem recorte alinhado é completada", async () => {
    const p = person("semrecorte", [[1, 0]]);
    delete p.photos[0].aligned;
    expect(personNeedsUpgrade(p)).toBe(true);
    const up = await upgradePerson(p, async () => ({
      face: { model: FACE_MODEL_ID, vector: [1, 0] },
      periocular: { model: PERIOCULAR_MODEL_ID, vector: [1, 0] },
      aligned: "data:image/jpeg;base64,BB",
    }));
    expect(up.photos[0].aligned).toBe("data:image/jpeg;base64,BB");
    expect(personNeedsUpgrade(up)).toBe(false);
  });

  it("fichas já atualizadas não são tocadas", async () => {
    const p = person("ok", [[1, 0]]);
    expect(personNeedsUpgrade(p)).toBe(false);
    let calls = 0;
    await upgradePerson(p, async () => {
      calls++;
      return null;
    });
    expect(calls).toBe(0);
  });
});
