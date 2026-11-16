import { deserializeCode, type IrisCode } from "@/lib/iris/encode";
import { compareIris, irisBand, type IrisBand, type IrisComparison } from "@/lib/iris/match";
import { IRIS_MODEL_ID, type EyeSide, type IrisSample, type Person } from "@/lib/types";

export interface ProbeEye {
  eye: EyeSide;
  code: IrisCode;
}

export interface EyeResult {
  eye: EyeSide;
  comparison: IrisComparison | null;
  band: IrisBand;
  /** Amostra da ficha que ficou mais parecida. */
  sample: IrisSample | null;
}

export interface IrisVerdict {
  person: Person;
  eyes: EyeResult[];
  /** Média das distâncias normalizadas dos olhos comparados (null = nada comparável). */
  hd: number | null;
  band: IrisBand;
}

const decoded = new WeakMap<IrisSample, IrisCode>();
function codeOf(s: IrisSample): IrisCode {
  let c = decoded.get(s);
  if (!c) {
    c = deserializeCode(s.code);
    decoded.set(s, c);
  }
  return c;
}

/** Compara cada olho capturado com as amostras do MESMO olho na ficha (olho direito nunca é comparado com o esquerdo). */
export function verifyIris(probe: ProbeEye[], person: Person): IrisVerdict {
  const eyes: EyeResult[] = probe.map(({ eye, code }) => {
    let bestCmp: IrisComparison | null = null;
    let bestSample: IrisSample | null = null;
    for (const s of person.iris ?? []) {
      if (s.eye !== eye || s.model !== IRIS_MODEL_ID) continue;
      const c = compareIris(code, codeOf(s));
      if (c && (!bestCmp || c.hdNorm < bestCmp.hdNorm)) {
        bestCmp = c;
        bestSample = s;
      }
    }
    return { eye, comparison: bestCmp, band: irisBand(bestCmp), sample: bestSample };
  });
  const valid = eyes.filter((e) => e.comparison);
  if (!valid.length) return { person, eyes, hd: null, band: "inconclusiva" };
  const hd = valid.reduce((s, e) => s + e.comparison!.hdNorm, 0) / valid.length;
  const bits = valid.reduce((s, e) => s + e.comparison!.bits, 0);
  // `hd` já é média de distâncias normalizadas; dois olhos reduzem a variação, mantendo o mesmo limiar.
  const band = irisBand({ hd, hdNorm: hd, shift: 0, bits });
  return { person, eyes, hd, band };
}

/** Busca 1:N: compara com todas as fichas que têm íris cadastrada; menor distância primeiro. */
export function searchIris(probe: ProbeEye[], persons: Person[], limit = 5): IrisVerdict[] {
  return persons
    .filter((p) => (p.iris ?? []).some((s) => s.model === IRIS_MODEL_ID))
    .map((p) => verifyIris(probe, p))
    .filter((v) => v.hd != null)
    .sort((a, b) => a.hd! - b.hd!)
    .slice(0, limit);
}

export const IRIS_BAND_LABEL: Record<IrisBand, string> = {
  forte: "Íris compatível (forte)",
  moderada: "Íris compatível (moderada)",
  fraca: "Íris não confere",
  inconclusiva: "Íris inconclusiva",
};

export function formatHd(hd: number): string {
  return hd.toFixed(3).replace(".", ",");
}
