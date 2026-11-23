import { describe, expect, it } from "vitest";
import { CALIBRATION, SCORE_BANDS, bandFor, cosineSimilarity, expectedChanceMatches, formatSimilarity, fuseScores, rankCandidates, splitCandidates } from "@/lib/recognition/match";
import { LEGACY_FACE_MODEL_ID } from "@/lib/types";
import { person, probeOf } from "./fixtures";

describe("cosineSimilarity", () => {
  it("vale 1 para vetores na mesma direção e 0 para ortogonais", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("devolve 0 para tamanhos diferentes ou vetor nulo", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("fusão rosto + olhos", () => {
  it("modo coberto usa só a região dos olhos", () => {
    expect(fuseScores(0.9, 0.2, "coberto")).toBeCloseTo((0.2 - CALIBRATION.periocular.mean) / CALIBRATION.periocular.std);
  });
  it("sem periocular usa só o rosto; sem nada devolve null", () => {
    expect(fuseScores(0.5, null, "completo")).toBeCloseTo((0.5 - CALIBRATION.face.mean) / CALIBRATION.face.std);
    expect(fuseScores(null, null, "completo")).toBeNull();
  });
  it("cresce com qualquer uma das duas similaridades", () => {
    expect(fuseScores(0.6, 0.5, "completo")!).toBeGreaterThan(fuseScores(0.5, 0.5, "completo")!);
    expect(fuseScores(0.5, 0.6, "completo")!).toBeGreaterThan(fuseScores(0.5, 0.5, "completo")!);
  });
});

describe("rankCandidates", () => {
  const probe = probeOf([1, 0, 0]);
  const a = person("a", [[0.9, 0.1, 0]]); // ~0,99
  const b = person("b", [[0.6, 0.6, 0]]); // ~0,71
  const c = person("c", [[0, 1, 0]]); // 0 -> abaixo do mínimo
  const d = person("d", [[0, 0, 1], [0.7, 0.3, 0.1]]); // usa a foto mais parecida (~0,91)

  it("ordena do mais parecido para o menos e descarta abaixo do mínimo", () => {
    const r = rankCandidates(probe, [c, b, a, d]);
    expect(r.map((x) => x.person.id)).toEqual(["a", "d", "b"]);
  });
  it("usa a foto mais parecida de cada pessoa", () => {
    expect(rankCandidates(probe, [d])[0].bestPhotoId).toBe("d-f1");
  });
  it("respeita o limite de candidatos", () => {
    expect(rankCandidates(probe, [a, b, d], { limit: 2 })).toHaveLength(2);
  });
  it("ignora fotos sem vetor ou de outro modelo", () => {
    const old = person("old", [[1, 0, 0]]);
    old.photos[0].face!.model = LEGACY_FACE_MODEL_ID;
    old.photos[0].periocular = null;
    const none = person("none", [[1, 0, 0]]);
    none.photos[0].face = null;
    none.photos[0].periocular = null;
    expect(rankCandidates(probe, [old, none])).toEqual([]);
  });
  it("rosto coberto: acha pelo periocular mesmo com o rosto inteiro diferente", () => {
    const masked = probeOf([0, 1, 0], [1, 0, 0]); // rosto (coberto) não bate; olhos batem
    const p = person("p", [[1, 0, 0]]);
    expect(rankCandidates(masked, [p], { mode: "coberto" })[0]?.person.id).toBe("p");
  });
});

describe("faixas", () => {
  it("classifica pelos limiares de cada modo", () => {
    for (const mode of ["completo", "coberto"] as const) {
      const t = SCORE_BANDS[mode];
      expect(bandFor(t.alta, mode)).toBe("alta");
      expect(bandFor(t.media, mode)).toBe("media");
      expect(bandFor(t.media - 0.01, mode)).toBe("baixa");
    }
    expect(formatSimilarity(0.7234)).toBe("0,72");
  });
});

describe("pistas fracas em base grande", () => {
  it("coincidências esperadas crescem com o tamanho da base (1 em 100 no mínimo)", () => {
    expect(expectedChanceMatches(50)).toBeCloseTo(0.5);
    expect(expectedChanceMatches(1000)).toBeCloseTo(10);
    expect(expectedChanceMatches(-3)).toBe(0);
  });
  it("separa candidatos fortes (alta/média) das pistas fracas (baixa)", () => {
    const probe = probeOf([1, 0, 0]);
    // Similaridades escolhidas para cair em cada faixa do modo completo.
    const sim = (z: number) => CALIBRATION.face.mean + z * CALIBRATION.face.std;
    const vec = (s: number) => [s, Math.sqrt(1 - s * s), 0];
    const strong = person("forte", [vec(sim(6))], [], "forte", [vec(CALIBRATION.periocular.mean + 6 * CALIBRATION.periocular.std)]);
    const weak = person("fraca", [vec(sim(2.6))], [], "fraca", [vec(CALIBRATION.periocular.mean + 2.6 * CALIBRATION.periocular.std)]);
    const r = rankCandidates(probe, [weak, strong]);
    const { strong: s, weak: w } = splitCandidates(r);
    expect(s.map((c) => c.person.id)).toEqual(["forte"]);
    expect(w.map((c) => c.person.id)).toEqual(["fraca"]);
  });
});
