import { useMemo, useState } from "react";
import { Check, Eye, RotateCcw, UserPlus } from "lucide-react";
import AnalyzedImage from "@/components/AnalyzedImage";
import CameraPanel from "@/components/CameraPanel";
import PersonForm from "@/components/PersonForm";
import { Button, Card, Notice, SectionTitle, Spinner } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { formatMark } from "@/lib/marks";
import { detectFaces, type DetectedFace } from "@/lib/recognition/engine";
import { BAND_LABEL, formatSimilarity, rankCandidates, type Band, type Candidate, type MatchMode } from "@/lib/recognition/match";
import { GRADE_LABEL } from "@/lib/recognition/quality";
import { displayName, newId, today, type FacePhoto } from "@/lib/types";

interface Analysis {
  src: string;
  width: number;
  height: number;
  faces: DetectedFace[];
}

const BAND_STYLE: Record<Band, string> = {
  alta: "bg-accent text-accent-foreground",
  media: "bg-primary/80 text-primary-foreground",
  baixa: "bg-secondary text-secondary-foreground",
};

function toPhoto(face: DetectedFace): FacePhoto {
  return { id: newId(), image: face.crop, takenAt: today(), face: face.face, periocular: face.periocular, quality: face.quality };
}

const QUALITY_STYLE = { boa: "text-success", aceitavel: "text-accent", ruim: "text-destructive" } as const;

/** `active`: a aba está visível. Fora dela a câmera é desligada, mas o resultado é mantido. */
export default function FaceSearch({ active }: { active: boolean }) {
  const { engine, engineError, retryEngine, persons, savePerson, log, go, upgrade } = useApp();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [registerFace, setRegisterFace] = useState<number | null>(null);
  /** rosto -> nome da pessoa confirmada */
  const [confirmed, setConfirmed] = useState<Record<number, string>>({});
  /** "coberto": máscara/balaclava — compara só a região dos olhos. */
  const [mode, setMode] = useState<MatchMode>("completo");

  const candidates = useMemo(
    () => analysis?.faces.map((f) => rankCandidates(f, persons, { mode })) ?? [],
    [analysis, persons, mode],
  );

  const analyze = async (canvas: HTMLCanvasElement) => {
    const src = canvas.toDataURL("image/jpeg", 0.9);
    setAnalysis({ src, width: canvas.width, height: canvas.height, faces: [] });
    setConfirmed({});
    setError("");
    setAnalyzing(true);
    try {
      const faces = await detectFaces(canvas);
      setAnalysis({ src, width: canvas.width, height: canvas.height, faces });
      const best = faces
        .map((f) => rankCandidates(f, persons, { mode, limit: 1 })[0])
        .filter(Boolean)
        .map((c) => `${displayName(c.person)} (${BAND_LABEL[c.band].toLowerCase()})`);
      log(
        "consulta_rosto",
        `${faces.length} rosto(s), modo ${mode}${best.length ? `; mais parecido: ${best.join(", ")}` : "; sem candidatos"}`,
      );
    } catch (e) {
      setError(`Falha na análise: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const confirm = async (faceIndex: number, c: Candidate) => {
    const face = analysis?.faces[faceIndex];
    if (!face) return;
    const ok = window.confirm(
      `Confirmar que o rosto ${faceIndex + 1} é ${displayName(c.person)}?\n\nA foto será adicionada à ficha com a data de hoje (ajuda a reconhecer mudanças de aparência).`,
    );
    if (!ok) return;
    try {
      await savePerson({ ...c.person, photos: [...c.person.photos, toPhoto(face)] }, false);
      log("confirmacao", `Rosto ${faceIndex + 1} confirmado como ${displayName(c.person)} (${BAND_LABEL[c.band].toLowerCase()})`);
      setConfirmed((prev) => ({ ...prev, [faceIndex]: displayName(c.person) }));
    } catch (e) {
      setError(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setError("");
    setConfirmed({});
  };

  if (engine === "erro") {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-heading text-destructive">Não foi possível carregar os modelos de reconhecimento.</p>
        <p className="text-sm text-muted-foreground">{engineError}</p>
        <Button variant="primary" onClick={retryEngine}>
          Tentar novamente
        </Button>
      </Card>
    );
  }
  if (engine === "carregando") return <Spinner label="Carregando modelos de reconhecimento…" />;

  if (registerFace !== null && analysis?.faces[registerFace]) {
    const face = analysis.faces[registerFace];
    return (
      <PersonForm
        initialPhoto={toPhoto(face)}
        onCancel={() => setRegisterFace(null)}
        onDone={(p) => {
          setConfirmed((prev) => ({ ...prev, [registerFace]: displayName(p) }));
          setRegisterFace(null);
        }}
      />
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-3">
        <SectionTitle>Consulta por rosto</SectionTitle>
        {persons.length === 0 && (
          <Notice tone="info">
            A base deste aparelho está vazia. Cadastre pessoas na aba <b>Pessoas</b> ou importe uma cópia de segurança.
          </Notice>
        )}
        {upgrade && (
          <Notice tone="info">
            Atualizando a base para o novo modelo de reconhecimento ({upgrade.done}/{upgrade.total} fichas)…
          </Notice>
        )}
        <ModeToggle mode={mode} onChange={setMode} />
        {active && <CameraPanel onImage={(c) => void analyze(c)} disabled={analyzing} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <Button variant="primary" onClick={reset} disabled={analyzing}>
            <RotateCcw className="h-4 w-4" /> Nova consulta
          </Button>
        }
      >
        Resultado
      </SectionTitle>

      <AnalyzedImage
        src={analysis.src}
        width={analysis.width}
        height={analysis.height}
        scanning={analyzing}
        boxes={analysis.faces.map((f, i) => ({ box: f.box, label: String(i + 1), highlight: (candidates[i]?.length ?? 0) > 0 }))}
      />

      {analyzing && <Spinner label="Analisando…" />}
      {error && <Notice tone="error">{error}</Notice>}
      {!analyzing && !error && analysis.faces.length === 0 && (
        <Notice tone="warn">Nenhum rosto encontrado. Tente de novo com o rosto de frente, mais perto e com boa luz.</Notice>
      )}

      {analysis.faces.length > 0 && <ModeToggle mode={mode} onChange={setMode} />}

      {analysis.faces.length > 0 && (
        <Notice tone="warn">
          <b>Resultado indicativo, não é prova de identidade.</b> Compare as fotos e confirme por outros meios (documento,
          tatuagens, cicatrizes) antes de qualquer ação.
        </Notice>
      )}

      {analysis.faces.map((face, i) => (
        <Card key={i} className="space-y-3">
          <div className="flex items-center gap-3">
            <img src={face.crop} alt={`Rosto ${i + 1}`} className="h-16 w-16 rounded-md border border-border object-cover" />
            <div>
              <h3 className="text-base">Rosto {i + 1}</h3>
              <p className="text-sm text-muted-foreground">
                {candidates[i].length ? `${candidates[i].length} candidato(s) parecido(s)` : "Nenhum candidato parecido na base"}
              </p>
              <p className={`text-xs font-semibold ${QUALITY_STYLE[face.quality.grade]}`}>{GRADE_LABEL[face.quality.grade]}</p>
            </div>
          </div>
          {face.quality.reasons.length > 0 && (
            <Notice tone={face.quality.grade === "ruim" ? "error" : "warn"}>
              {face.quality.reasons.join(" ")}
              {face.quality.grade === "ruim" && " Resultado pouco confiável."}
            </Notice>
          )}

          {confirmed[i] ? (
            <Notice tone="ok">
              <Check className="mr-1 inline h-4 w-4" /> Foto registrada na ficha de <b>{confirmed[i]}</b>.
            </Notice>
          ) : (
            <>
              <ul className="space-y-2">
                {candidates[i].map((c) => (
                  <CandidateRow
                    key={c.person.id}
                    c={c}
                    crop={face.crop}
                    onOpen={() => go("pessoas", c.person.id)}
                    onConfirm={() => void confirm(i, c)}
                    onIris={() => go("iris", c.person.id)}
                  />
                ))}
              </ul>
              <Button className="w-full" onClick={() => setRegisterFace(i)}>
                <UserPlus className="h-4 w-4" /> {candidates[i].length ? "Nenhum destes — cadastrar" : "Cadastrar nova pessoa"}
              </Button>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function CandidateRow({
  c,
  crop,
  onOpen,
  onConfirm,
  onIris,
}: {
  c: Candidate;
  crop: string;
  onOpen: () => void;
  onConfirm: () => void;
  onIris: () => void;
}) {
  const photo = c.person.photos.find((p) => p.id === c.bestPhotoId);
  const irisCount = (c.person.iris ?? []).length;
  return (
    <li className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 gap-1" aria-label="Comparação: rosto consultado e foto da ficha">
          <img src={crop} alt="Consultado" className="h-16 w-16 rounded-l-md object-cover" />
          <img src={photo?.image} alt="Foto da ficha" className="h-16 w-16 rounded-r-md object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words font-heading text-base leading-tight">{displayName(c.person)}</p>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[c.band]}`}>{BAND_LABEL[c.band]}</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Rosto {c.face != null ? formatSimilarity(c.face) : "—"} · Olhos {c.periocular != null ? formatSimilarity(c.periocular) : "—"}
          </p>
          {photo && <p className="text-xs text-muted-foreground">Foto da ficha de {photo.takenAt.split("-").reverse().join("/")}</p>}
        </div>
      </div>
      {c.person.marks.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {c.person.marks.slice(0, 3).map((m) => (
            <li key={m.id}>• {formatMark(m)}</li>
          ))}
          {c.person.marks.length > 3 && <li>+ {c.person.marks.length - 3} marca(s)</li>}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onOpen}>
          Ver ficha
        </Button>
        <Button variant="secondary" onClick={onConfirm}>
          <Check className="h-4 w-4" /> É esta pessoa
        </Button>
      </div>
      {irisCount > 0 && (
        <Button className="w-full" onClick={onIris}>
          <Eye className="h-4 w-4" /> Conferir íris ({irisCount} amostra{irisCount > 1 ? "s" : ""})
        </Button>
      )}
    </li>
  );
}

function ModeToggle({ mode, onChange }: { mode: MatchMode; onChange: (m: MatchMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1" role="radiogroup" aria-label="Tipo de comparação">
      {(
        [
          ["completo", "Rosto inteiro"],
          ["coberto", "Rosto coberto (só olhos)"],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`rounded-md px-2 py-2 font-heading text-xs font-semibold uppercase tracking-wider ${
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
