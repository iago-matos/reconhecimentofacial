import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, RotateCcw, UserPlus } from "lucide-react";
import { CompareSheet, EvidenceRuler, StrengthPill } from "@/components/Evidence";
import AnalyzedImage from "@/components/AnalyzedImage";
import CameraPanel from "@/components/CameraPanel";
import PersonForm from "@/components/PersonForm";
import { Button, Card, Notice, SectionTitle, Spinner } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { formatMark } from "@/lib/marks";
import { detectFaces, type DetectedFace } from "@/lib/recognition/engine";
import { FACE_CAPTION, FACE_TICKS, faceRulerPosition } from "@/lib/recognition/evidence";
import { BAND_LABEL, expectedChanceMatches, formatSimilarity, rankCandidates, splitCandidates, type Candidate, type MatchMode } from "@/lib/recognition/match";
import { LIVENESS_TEXT, type LivenessStatus } from "@/lib/recognition/liveness";
import { GRADE_LABEL } from "@/lib/recognition/quality";
import { displayName, newId, today, type FacePhoto } from "@/lib/types";

interface Analysis {
  src: string;
  width: number;
  height: number;
  faces: DetectedFace[];
  liveness: LivenessStatus;
}

function toPhoto(face: DetectedFace): FacePhoto {
  return { id: newId(), image: face.crop, takenAt: today(), face: face.face, periocular: face.periocular, quality: face.quality, aligned: face.aligned };
}

const QUALITY_STYLE = { boa: "text-success-text", aceitavel: "text-accent", ruim: "text-alert" } as const;

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

  const analyze = async (canvas: HTMLCanvasElement, liveness: LivenessStatus) => {
    const src = canvas.toDataURL("image/jpeg", 0.9);
    setAnalysis({ src, width: canvas.width, height: canvas.height, faces: [], liveness });
    setConfirmed({});
    setError("");
    setAnalyzing(true);
    try {
      const faces = await detectFaces(canvas);
      setAnalysis({ src, width: canvas.width, height: canvas.height, faces, liveness });
      const best = faces
        .map((f) => rankCandidates(f, persons, { mode, limit: 1 })[0])
        .filter(Boolean)
        .map((c) => `${displayName(c.person)} (${BAND_LABEL[c.band].toLowerCase()})`);
      log(
        "consulta_rosto",
        `${faces.length} rosto(s), modo ${mode}, prova de vida: ${liveness.kind}${best.length ? `; mais parecido: ${best.join(", ")}` : "; sem candidatos"}`,
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
        <p className="font-heading text-alert">Não foi possível carregar os modelos de reconhecimento.</p>
        <p className="text-sm text-muted-foreground">{engineError}</p>
        <Button variant="primary" onClick={retryEngine}>
          Tentar novamente
        </Button>
      </Card>
    );
  }
  if (engine === "carregando") return <Spinner label="Carregando modelos de reconhecimento. Na primeira vez são cerca de 18 MB; depois ficam guardados no aparelho." />;

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
        {active && <CameraPanel onImage={(c, l) => void analyze(c, l)} disabled={analyzing} />}
        <ModeToggle mode={mode} onChange={setMode} />
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

      {analysis.faces.length > 0 && (
        <>
          <LivenessNotice status={analysis.liveness} />
          <ModeToggle mode={mode} onChange={setMode} />
          <Notice tone="warn">
            <b>Resultado indicativo, não é prova de identidade.</b> Compare as fotos e confirme por outros meios (documento,
            tatuagens, cicatrizes) antes de qualquer ação.
          </Notice>
        </>
      )}

      {analysis.faces.map((face, i) => (
        <section key={i} className="space-y-3" aria-label={`Rosto ${i + 1}`}>
          <header className="flex items-baseline justify-between gap-3 border-b border-border pb-1">
            <h3 className="text-xl">Rosto {i + 1}</h3>
            <p className={`text-sm ${QUALITY_STYLE[face.quality.grade]}`}>{GRADE_LABEL[face.quality.grade]}</p>
          </header>
          {face.quality.reasons.length > 0 && (
            <Notice tone={face.quality.grade === "ruim" ? "error" : "warn"}>
              {face.quality.reasons.join(" ")}
              {face.quality.grade === "ruim" && " Resultado pouco confiável."}
            </Notice>
          )}

          {confirmed[i] ? (
            <Notice tone="ok">
              Foto registrada na ficha de <b>{confirmed[i]}</b>.
            </Notice>
          ) : (
            <>
              <CandidateList
                candidates={candidates[i]}
                baseSize={persons.length}
                render={(c, k, defaultOpen) => (
                  <CandidateSheet
                    key={c.person.id}
                    c={c}
                    rank={k + 1}
                    mode={mode}
                    face={face}
                    defaultOpen={defaultOpen}
                    onOpen={() => go("pessoas", c.person.id)}
                    onConfirm={() => void confirm(i, c)}
                    onIris={() => go("iris", c.person.id)}
                  />
                )}
              />
              <Button className="w-full" onClick={() => setRegisterFace(i)}>
                <UserPlus className="h-4 w-4" /> {candidates[i].length ? "Não é nenhum destes: cadastrar" : "Cadastrar nova pessoa"}
              </Button>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

const br = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Um candidato como folha de comparação: fotos alinhadas lado a lado, régua de evidência e ações.
 * O primeiro vem aberto; os outros, recolhidos numa linha (toque para comparar).
 */
function CandidateSheet({
  c,
  rank,
  mode,
  face,
  defaultOpen,
  onOpen,
  onConfirm,
  onIris,
}: {
  c: Candidate;
  rank: number;
  mode: MatchMode;
  face: DetectedFace;
  defaultOpen: boolean;
  onOpen: () => void;
  onConfirm: () => void;
  onIris: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const photo = c.person.photos.find((p) => p.id === c.bestPhotoId);
  const irisCount = (c.person.iris ?? []).length;
  const recordAligned = !!photo?.aligned;
  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        className="flex w-full items-center gap-3 p-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="w-5 shrink-0 text-center font-heading text-lg text-muted-foreground">{rank}</span>
        {!open && <img src={photo?.aligned || photo?.image} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="block break-words font-heading text-xl leading-tight">{displayName(c.person)}</span>
        </span>
        <StrengthPill strength={c.band}>{BAND_LABEL[c.band]}</StrengthPill>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="space-y-3 pb-3">
          <CompareSheet
            label={`Comparação entre o rosto consultado e a ficha de ${displayName(c.person)}`}
            left={{ src: face.aligned || face.crop, caption: "Consulta", aligned: !!face.aligned }}
            right={{ src: (recordAligned ? photo?.aligned : photo?.image) ?? "", caption: photo ? `Ficha, foto de ${br(photo.takenAt)}` : "Ficha", aligned: recordAligned }}
          />
          <div className="space-y-2 px-3">
            <EvidenceRuler position={faceRulerPosition(c.score, mode)} ticks={FACE_TICKS} label="Força da semelhança" />
            <p className="text-sm">{FACE_CAPTION[c.band]}</p>
            <p className="text-sm text-muted-foreground">
              Similaridade: rosto {c.face != null ? formatSimilarity(c.face) : "não comparado"}, olhos{" "}
              {c.periocular != null ? formatSimilarity(c.periocular) : "não comparados"}
              {mode === "coberto" && " (só os olhos contam neste modo)"}.
            </p>
            {c.person.marks.length > 0 && (
              <div className="text-sm">
                <p className="text-muted-foreground">Marcas na ficha, para conferir:</p>
                <ul className="list-inside list-disc">
                  {c.person.marks.slice(0, 3).map((m) => (
                    <li key={m.id}>{formatMark(m)}</li>
                  ))}
                  {c.person.marks.length > 3 && <li>e mais {c.person.marks.length - 3}</li>}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="ghost" onClick={onOpen}>
                Ver ficha
              </Button>
              <Button variant="confirm" onClick={onConfirm}>
                <Check className="h-4 w-4" /> É esta pessoa
              </Button>
            </div>
            {irisCount > 0 && (
              <Button className="w-full" onClick={onIris}>
                <Eye className="h-4 w-4" /> Conferir íris ({irisCount} amostra{irisCount > 1 ? "s" : ""})
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function ModeToggle({ mode, onChange }: { mode: MatchMode; onChange: (m: MatchMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1" role="radiogroup" aria-label="Tipo de comparação">
      {(
        [
          ["completo", "Rosto inteiro"],
          ["coberto", "Rosto coberto, só olhos"],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`min-h-11 rounded-md px-2 py-2 font-heading text-base font-semibold ${
            mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LivenessNotice({ status }: { status: LivenessStatus }) {
  if (status.kind === "comprovada")
    return (
      <Notice tone="ok">
        {LIVENESS_TEXT.comprovada}: a pessoa {status.method === "piscada" ? "piscou" : "virou o rosto"} diante da câmera.
      </Notice>
    );
  return <Notice tone={status.kind === "nao_comprovada" ? "warn" : "info"}>{LIVENESS_TEXT[status.kind]}</Notice>;
}

/**
 * Candidatos fortes (alta/média) aparecem direto; pistas fracas (baixa) ficam recolhidas,
 * com o aviso de quantas coincidências são esperadas para o tamanho da base.
 */
function CandidateList({
  candidates,
  baseSize,
  render,
}: {
  candidates: Candidate[];
  baseSize: number;
  render: (c: Candidate, index: number, defaultOpen: boolean) => React.ReactNode;
}) {
  const [showWeak, setShowWeak] = useState(false);
  const { strong, weak } = splitCandidates(candidates);
  const chance = expectedChanceMatches(baseSize);
  const chanceText =
    chance < 1
      ? `Numa base de ${baseSize} fichas, menos de 1 pessoa errada chega a esse nível por acaso em cada consulta.`
      : `Numa base de ${baseSize} fichas, cerca de ${Math.round(chance)} pessoa${Math.round(chance) > 1 ? "s erradas chegam" : " errada chega"} a esse nível por acaso em cada consulta.`;
  return (
    <div className="space-y-3">
      {candidates.length === 0 && <p className="text-muted-foreground">Ninguém parecido na base deste aparelho.</p>}
      {strong.length === 0 && weak.length > 0 && <p className="text-muted-foreground">Ninguém com semelhança média ou alta.</p>}
      {strong.length > 0 && <ol className="space-y-3">{strong.map((c, k) => render(c, k, k === 0))}</ol>}
      {weak.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-dashed border-muted-foreground/40 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowWeak((v) => !v)}
            aria-expanded={showWeak}
          >
            <span>
              {showWeak ? "Esconder" : "Mostrar"} {weak.length === 1 ? "1 pista fraca" : `${weak.length} pistas fracas`}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showWeak ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {showWeak && (
            <>
              <p className="text-sm text-muted-foreground">{chanceText} Use só para investigar, nunca para abordar.</p>
              <ol className="space-y-3">{weak.map((c, k) => render(c, strong.length + k, false))}</ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
