import { useEffect, useMemo, useState } from "react";
import { count } from "@/lib/text";
import { Check, Plus, RotateCcw } from "lucide-react";
import { CompareSheet, EvidenceRuler, StrengthPill, type Strength } from "@/components/Evidence";
import IrisCapture, { IrisCaptureReport } from "@/components/IrisCapture";
import { IRIS_CAPTION, IRIS_TICKS, irisRulerPosition } from "@/lib/recognition/evidence";
import { Button, Card, Notice, SectionTitle, Spinner } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { IRIS_BAND_LABEL, formatHd, searchIris, verifyIris, type IrisVerdict } from "@/lib/iris/verify";
import { probeEyes, toIrisSamples, usableEyes } from "@/lib/iris/samples";
import { BAND_LABEL, formatSimilarity, rankCandidates } from "@/lib/recognition/match";
import type { IrisCaptureResult } from "@/lib/recognition/engine";
import type { IrisBand } from "@/lib/iris/match";
import { EYE_LABEL, IRIS_MODEL_ID, displayName, type Person } from "@/lib/types";

/** Mesma escala neutra do rosto: a força da evidência vai do cáqui ao branco, nunca ao verde. */
const IRIS_STRENGTH: Record<IrisBand, Strength> = { forte: "alta", moderada: "media", fraca: "baixa", inconclusiva: "baixa" };

/**
 * Etapa 3 — conferência (1:1, quando vem de uma ficha) ou busca (1:N) por íris.
 * A foto de perto também gera rosto + periocular em alta resolução, mostrados junto.
 */
export default function IrisCheck({ active }: { active: boolean }) {
  const { engine, engineError, retryEngine, persons, openPersonId, savePerson, log, go } = useApp();
  const target = persons.find((p) => p.id === openPersonId) ?? null;
  const [result, setResult] = useState<IrisCaptureResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Trocar a pessoa conferida descarta a captura anterior (não compara a foto de uma pessoa com a ficha de outra).
  useEffect(() => {
    setResult(null);
    setSaved(null);
  }, [openPersonId]);

  const enrolledCount = persons.filter((p) => (p.iris ?? []).some((s) => s.model === IRIS_MODEL_ID)).length;

  const verdicts = useMemo<IrisVerdict[]>(() => {
    if (!result) return [];
    const probe = probeEyes(result);
    if (!probe.length) return [];
    return target ? [verifyIris(probe, target)] : searchIris(probe, persons);
  }, [result, target, persons]);

  const faceCandidates = useMemo(() => {
    if (!result?.face) return [];
    const probe = { face: result.face.face, periocular: result.face.periocular };
    return rankCandidates(probe, target ? [target] : persons, { minimum: target ? -Infinity : undefined });
  }, [result, target, persons]);

  const onResult = (r: IrisCaptureResult) => {
    setResult(r);
    setSaved(null);
    const probe = probeEyes(r);
    const v = probe.length ? (target ? [verifyIris(probe, target)] : searchIris(probe, persons)) : [];
    const best = v[0];
    log(
      "consulta_iris",
      `${target ? `Conferência com ${displayName(target)}` : "Busca 1:N"}; olhos usáveis: ${usableEyes(r).length}` +
        (best?.hd != null ? `; mais parecido: ${displayName(best.person)} HD ${formatHd(best.hd)} (${best.band})` : "; sem comparação"),
    );
  };

  const addToPerson = async (p: Person) => {
    if (!result) return;
    const samples = toIrisSamples(result, usableEyes(result));
    if (!samples.length) return;
    if (!window.confirm(`Adicionar ${count(samples.length, "amostra", "amostras")} de íris à ficha de ${displayName(p)}?\n\nSó faça isso se a identidade foi confirmada por outros meios.`)) return;
    await savePerson({ ...p, iris: [...(p.iris ?? []), ...samples] }, false);
    log("confirmacao", `Íris adicionada à ficha de ${displayName(p)} (${samples.length} amostra(s))`);
    setSaved(displayName(p));
  };

  if (engine === "erro") {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-heading text-alert">Não foi possível carregar os modelos.</p>
        <p className="text-sm text-muted-foreground">{engineError}</p>
        <Button variant="primary" onClick={retryEngine}>
          Tentar novamente
        </Button>
      </Card>
    );
  }
  if (engine === "carregando") return <Spinner label="Carregando modelos…" />;

  if (!result) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">
          <b>Experimental.</b> Íris com câmera comum (luz visível) funciona pior que leitores infravermelhos, principalmente em
          olhos castanhos/escuros. Use só como <b>confirmação</b> junto com rosto e outros meios.
        </Notice>
        {target ? (
          <Notice tone="info">
            Conferindo com a ficha de <b>{displayName(target)}</b> ({count((target.iris ?? []).length, "amostra de íris", "amostras de íris", "sem íris cadastrada")}).{" "}
            <button className="underline" onClick={() => go("iris")}>
              Buscar em todas as fichas
            </button>
          </Notice>
        ) : (
          <Notice tone="info">Busca em todas as fichas com íris cadastrada ({enrolledCount}).</Notice>
        )}
        {target && !(target.iris ?? []).length && (
          <Notice tone="warn">Esta ficha ainda não tem íris. A captura ainda compara rosto e olhos em alta resolução.</Notice>
        )}
        {active && <IrisCapture title={target ? "Conferir íris" : "Buscar por íris"} onResult={onResult} />}
      </div>
    );
  }

  const usable = usableEyes(result).length;

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <Button variant="primary" onClick={() => setResult(null)}>
            <RotateCcw className="h-4 w-4" /> Nova captura
          </Button>
        }
      >
        {target ? `Conferência: ${displayName(target)}` : "Resultado da íris"}
      </SectionTitle>

      <Notice tone="warn">
        <b>Resultado indicativo, não é prova de identidade.</b> Os limiares de íris em luz visível ainda não foram calibrados com
        olhos reais desta população.
      </Notice>

      {usable === 0 && <Notice tone="error">Nenhum olho com qualidade suficiente. Veja os motivos abaixo e capture de novo.</Notice>}
      {saved && (
        <Notice tone="ok">
          <Check className="mr-1 inline h-4 w-4" /> Íris adicionada à ficha de <b>{saved}</b>.
        </Notice>
      )}

      {usable > 0 && (
        <Card className="space-y-3">
          <h3 className="text-base">Comparação por íris</h3>
          {verdicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {target ? "A ficha não tem íris do mesmo olho para comparar." : "Nenhuma ficha com íris cadastrada."}
            </p>
          ) : (
            <ul className="space-y-3">
              {verdicts.map((v) => (
                <li key={v.person.id} className="overflow-hidden rounded-xl border border-border bg-background/40">
                  <div className="flex items-center gap-3 p-3">
                    <p className="min-w-0 flex-1 break-words font-heading text-xl leading-tight">{displayName(v.person)}</p>
                    <StrengthPill strength={IRIS_STRENGTH[v.band]}>{IRIS_BAND_LABEL[v.band]}</StrengthPill>
                  </div>
                  {v.eyes.map((e) => {
                    const probe = result.eyes.find((x) => x.side === e.eye);
                    return (
                      <div key={e.eye} className="space-y-1 pb-2">
                        {e.sample && probe?.preview && (
                          <CompareSheet
                            aspect="aspect-[4/3]"
                            label={`${EYE_LABEL[e.eye]}: olho capturado e olho da ficha`}
                            left={{ src: probe.preview, caption: `${EYE_LABEL[e.eye]}, agora`, aligned: false }}
                            right={{ src: e.sample.image, caption: `Ficha, ${e.sample.capturedAt.split("-").reverse().join("/")}`, aligned: false }}
                          />
                        )}
                        <p className="px-3 text-sm text-muted-foreground">
                          {e.comparison
                            ? `${EYE_LABEL[e.eye]}: distância ${formatHd(e.comparison.hdNorm)}, ${e.comparison.bits.toLocaleString("pt-BR")} pontos comparados, giro de ${Math.round((e.comparison.shift * 360) / 256)}°.`
                            : `${EYE_LABEL[e.eye]}: a ficha não tem amostra deste olho.`}
                        </p>
                      </div>
                    );
                  })}
                  <div className="space-y-2 px-3 pb-3">
                    {v.hd != null && <EvidenceRuler position={irisRulerPosition(v.hd)} ticks={IRIS_TICKS} label="Compatibilidade da íris" />}
                    <p className="text-sm">{IRIS_CAPTION[v.band]}</p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="ghost" onClick={() => go("pessoas", v.person.id)}>
                        Ver ficha
                      </Button>
                      <Button variant="confirm" onClick={() => void addToPerson(v.person)}>
                        <Plus className="h-4 w-4" /> Somar à ficha
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            A distância vai de 0 (padrões idênticos) a cerca de 0,5 (olhos diferentes). Leitores infravermelhos usam 0,32 como limite.
          </p>
        </Card>
      )}

      {result.face && (
        <Card className="space-y-2">
          <h3 className="text-base">Rosto e olhos (mesma foto, alta resolução)</h3>
          {faceCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum candidato parecido pelo rosto.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {faceCandidates.map((c) => (
                <li key={c.person.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-heading">{displayName(c.person)}</span>
                  <span className="text-xs text-muted-foreground">
                    {BAND_LABEL[c.band]}: rosto {c.face != null ? formatSimilarity(c.face) : "não comparado"}, olhos{" "}
                    {c.periocular != null ? formatSimilarity(c.periocular) : "não comparados"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <IrisCaptureReport result={result} />

      {target && usable > 0 && verdicts.length === 0 && (
        <Button className="w-full" onClick={() => void addToPerson(target)}>
          <Plus className="h-4 w-4" /> Adicionar esta íris à ficha de {displayName(target)}
        </Button>
      )}
    </div>
  );
}
