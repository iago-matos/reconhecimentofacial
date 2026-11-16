import { useEffect, useMemo, useState } from "react";
import { count } from "@/lib/text";
import { Eraser } from "lucide-react";
import { Button, Card, Field, Notice, SectionTitle, Select, inputClass } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { BODY_REGIONS, BODY_SIDES, MARK_TYPES, formatMark, isEmptyQuery, searchByMarks, type MarkQuery } from "@/lib/marks";
import { displayName, type BodyRegion, type BodySide, type MarkType } from "@/lib/types";

/** Busca por tatuagem/cicatriz: funciona mesmo quando o rosto mudou ou não aparece. */
export default function MarkSearch() {
  const { persons, go, log } = useApp();
  const [type, setType] = useState<MarkType | "">("");
  const [region, setRegion] = useState<BodyRegion | "">("");
  const [side, setSide] = useState<BodySide | "">("");
  const [text, setText] = useState("");

  const query: MarkQuery = { type: type || undefined, region: region || undefined, side: side || undefined, text };
  const empty = isEmptyQuery(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hits = useMemo(() => searchByMarks(persons, query), [persons, type, region, side, text]);

  // Registra a consulta depois que o policial para de digitar.
  const summary = [type, region, side, text.trim()].filter(Boolean).join(" / ");
  useEffect(() => {
    if (empty) return;
    const t = setTimeout(() => log("consulta_marca", `${summary} → ${hits.length} resultado(s)`), 1500);
    return () => clearTimeout(t);
  }, [summary, empty, hits.length, log]);

  const clear = () => {
    setType("");
    setRegion("");
    setSide("");
    setText("");
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          !empty && (
            <Button variant="ghost" onClick={clear}>
              <Eraser className="h-4 w-4" /> Limpar
            </Button>
          )
        }
      >
        Busca por marcas
      </SectionTitle>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tipo">
            <Select value={type} onChange={setType} options={MARK_TYPES} />
          </Field>
          <Field label="Lado">
            <Select value={side} onChange={setSide} options={BODY_SIDES} />
          </Field>
        </div>
        <Field label="Local do corpo">
          <Select value={region} onChange={setRegion} options={BODY_REGIONS} />
        </Field>
        <Field label="Palavras-chave" hint="Ex.: carpa, palhaço, nome Ana, terço, estrela">
          <input value={text} onChange={(e) => setText(e.target.value)} className={inputClass} placeholder="O que tem na marca?" />
        </Field>
      </Card>

      {empty ? (
        <Notice tone="info">Preencha pelo menos um campo. Locais vizinhos (ex.: braço e antebraço) também aparecem, com menos pontos.</Notice>
      ) : hits.length === 0 ? (
        <Notice tone="warn">Nenhuma pessoa com marca parecida.</Notice>
      ) : (
        <ul className="space-y-2">
          <p className="text-sm text-muted-foreground">{count(hits.length, "pessoa", "pessoas")}, da mais compatível para a menos:</p>
          {hits.map((h) => {
            const face = h.person.photos.at(-1)?.image;
            return (
              <li key={h.person.id}>
                <button
                  onClick={() => go("pessoas", h.person.id)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/60"
                >
                  {face ? (
                    <img src={face} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">sem foto</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-base">{displayName(h.person)}</p>
                    <ul className="mt-1 space-y-1">
                      {h.marks.map(({ mark }) => (
                        <li key={mark.id} className="flex items-center gap-2 text-sm">
                          {mark.photo && <img src={mark.photo} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
                          <span>{formatMark(mark)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
