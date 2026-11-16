import { useRef, useState } from "react";
import { Eye, ImagePlus, Pencil, Trash2, UserPlus } from "lucide-react";
import IrisCapture, { IrisCaptureReport } from "@/components/IrisCapture";
import MarkEditor from "@/components/MarkEditor";
import { Button, Card, Field, Notice, SectionTitle, inputClass } from "@/components/ui";
import { useApp } from "@/state/AppState";
import { formatMark } from "@/lib/marks";
import { detectMainFace } from "@/lib/recognition/engine";
import { fileToCanvas, validateImageFile } from "@/lib/image";
import { toIrisSamples, usableEyes } from "@/lib/iris/samples";
import type { IrisCaptureResult } from "@/lib/recognition/engine";
import { EYE_LABEL, newId, today, type BodyMark, type EyeSide, type FacePhoto, type IrisSample, type Person } from "@/lib/types";

interface Props {
  /** Pessoa a editar; sem ela, é um cadastro novo. */
  person?: Person;
  /** Rosto vindo de uma consulta (cadastro direto a partir da foto). */
  initialPhoto?: FacePhoto;
  onDone: (person: Person) => void;
  onCancel: () => void;
}

export default function PersonForm({ person, initialPhoto, onDone, onCancel }: Props) {
  const { savePerson, engine } = useApp();
  const [name, setName] = useState(person?.name ?? "");
  const [alias, setAlias] = useState(person?.alias ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [photos, setPhotos] = useState<FacePhoto[]>(person?.photos ?? (initialPhoto ? [initialPhoto] : []));
  const [marks, setMarks] = useState<BodyMark[]>(person?.marks ?? []);
  const [iris, setIris] = useState<IrisSample[]>(person?.iris ?? []);
  /** Captura de íris aberta: null = fechada; "camera" = câmera; resultado = escolhendo olhos. */
  const [irisStep, setIrisStep] = useState<null | "camera" | IrisCaptureResult>(null);
  const [irisPick, setIrisPick] = useState<Record<string, boolean>>({});
  const [editingMark, setEditingMark] = useState<string | "new" | null>(null);
  const [photoMsg, setPhotoMsg] = useState<{ tone: "warn" | "error"; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setProcessing(true);
    setPhotoMsg(null);
    const problems: string[] = [];
    const added: FacePhoto[] = [];
    for (const file of files) {
      const invalid = validateImageFile(file);
      if (invalid) {
        problems.push(`${file.name}: ${invalid}`);
        continue;
      }
      try {
        const { face, count } = await detectMainFace(await fileToCanvas(file));
        if (!face) {
          problems.push(`${file.name}: nenhum rosto encontrado.`);
          continue;
        }
        if (count > 1) problems.push(`${file.name}: ${count} rostos; foi usado o maior.`);
        if (face.quality.grade === "ruim") problems.push(`${file.name}: qualidade ruim (${face.quality.reasons.join(" ")}).`);
        added.push({ id: newId(), image: face.crop, takenAt: today(), face: face.face, periocular: face.periocular, quality: face.quality });
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setPhotos((prev) => [...prev, ...added]);
    if (problems.length) setPhotoMsg({ tone: added.length ? "warn" : "error", text: problems.join(" ") });
    setProcessing(false);
  };

  const submit = async () => {
    if (!name.trim() && !alias.trim()) return setError("Informe o nome ou o apelido.");
    if (photos.length === 0 && marks.length === 0 && iris.length === 0)
      return setError("Adicione pelo menos uma foto do rosto, uma íris ou uma marca.");
    setError("");
    setSaving(true);
    const now = new Date().toISOString();
    const saved: Person = {
      id: person?.id ?? newId(),
      name: name.trim(),
      alias: alias.trim(),
      notes: notes.trim(),
      photos,
      marks,
      iris,
      createdAt: person?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await savePerson(saved, !person);
      onDone(saved);
    } catch (err) {
      setError(`Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  };

  if (irisStep === "camera") {
    return (
      <IrisCapture
        title={`Cadastrar íris${name || alias ? ` de ${name || alias}` : ""}`}
        onCancel={() => setIrisStep(null)}
        onResult={(r) => {
          setIrisPick(Object.fromEntries(usableEyes(r).map((s) => [s, true])));
          setIrisStep(r);
        }}
      />
    );
  }
  if (irisStep) {
    const chosen = Object.entries(irisPick)
      .filter(([, v]) => v)
      .map(([k]) => k as EyeSide);
    return (
      <div className="space-y-4">
        <SectionTitle>Íris capturada</SectionTitle>
        <IrisCaptureReport
          result={irisStep}
          selected={irisPick}
          onToggle={(side) => setIrisPick((prev) => ({ ...prev, [side]: !prev[side] }))}
          onRetry={() => setIrisStep("camera")}
        />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setIrisStep(null)}>
            Descartar
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            disabled={chosen.length === 0}
            onClick={() => {
              setIris((prev) => [...prev, ...toIrisSamples(irisStep, chosen)]);
              setIrisStep(null);
            }}
          >
            <Eye className="h-5 w-5" /> Usar {chosen.length} olho(s)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle>{person ? "Editar ficha" : "Nova pessoa"}</SectionTitle>

      <Card className="space-y-3">
        <Field label="Nome completo">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Apelido / vulgo">
          <input value={alias} onChange={(e) => setAlias(e.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Observações">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Fotos do rosto</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Fotos de épocas diferentes (com/sem barba, mais novo, mais velho) ajudam a reconhecer quem mudou de aparência.
        </p>
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <li key={p.id} className="space-y-1">
                <img src={p.image} alt="Rosto" className="aspect-square w-full rounded-md border border-border object-cover" />
                <input
                  type="date"
                  value={p.takenAt}
                  aria-label="Data aproximada da foto"
                  onChange={(e) => setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, takenAt: e.target.value } : x)))}
                  className={`${inputClass} py-1 text-sm`}
                />
                <Button variant="ghost" className="w-full min-h-9 py-1 text-xs" onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}>
                  <Trash2 className="h-4 w-4" /> Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        {photoMsg && <Notice tone={photoMsg.tone}>{photoMsg.text}</Notice>}
        <Button className="w-full" onClick={() => fileRef.current?.click()} busy={processing} disabled={engine !== "pronto"}>
          <ImagePlus className="h-5 w-5" /> {engine === "pronto" ? "Adicionar fotos" : "Aguardando modelos…"}
        </Button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void addPhotos(e)} />
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Íris (experimental)</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Foto bem de perto com a câmera traseira. Capture 2 ou 3 vezes em momentos diferentes: mais amostras deixam a
          conferência mais estável.
        </p>
        {iris.length > 0 && (
          <ul className="grid grid-cols-2 gap-3">
            {iris.map((s) => (
              <li key={s.id} className="space-y-1">
                <img src={s.image} alt={EYE_LABEL[s.eye]} className="w-full rounded-md border border-border" />
                <p className="text-xs text-muted-foreground">
                  {EYE_LABEL[s.eye]} · {s.capturedAt.split("-").reverse().join("/")} · {Math.round(s.quality.diameterPx)} px
                </p>
                <Button variant="ghost" className="w-full min-h-9 py-1 text-xs" onClick={() => setIris((prev) => prev.filter((x) => x.id !== s.id))}>
                  <Trash2 className="h-4 w-4" /> Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="w-full" onClick={() => setIrisStep("camera")} disabled={engine !== "pronto"}>
          <Eye className="h-5 w-5" /> {engine === "pronto" ? "Capturar íris" : "Aguardando modelos…"}
        </Button>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Tatuagens, cicatrizes e sinais</SectionTitle>
        {marks.length > 0 && (
          <ul className="space-y-2">
            {marks.map((m) =>
              editingMark === m.id ? (
                <li key={m.id}>
                  <MarkEditor
                    initial={m}
                    onSave={(mark) => {
                      setMarks((prev) => prev.map((x) => (x.id === mark.id ? mark : x)));
                      setEditingMark(null);
                    }}
                    onCancel={() => setEditingMark(null)}
                  />
                </li>
              ) : (
                <li key={m.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-2">
                  {m.photo && <img src={m.photo} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />}
                  <span className="min-w-0 flex-1 text-sm">{formatMark(m)}</span>
                  <button className="p-2 text-muted-foreground hover:text-foreground" onClick={() => setEditingMark(m.id)} aria-label="Editar marca">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="p-2 text-muted-foreground hover:text-destructive"
                    onClick={() => setMarks((prev) => prev.filter((x) => x.id !== m.id))}
                    aria-label="Remover marca"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
        {editingMark === "new" ? (
          <MarkEditor
            onSave={(mark) => {
              setMarks((prev) => [...prev, mark]);
              setEditingMark(null);
            }}
            onCancel={() => setEditingMark(null)}
          />
        ) : (
          <Button className="w-full" onClick={() => setEditingMark("new")}>
            + Adicionar marca
          </Button>
        )}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="accent" className="flex-1" onClick={() => void submit()} busy={saving} disabled={processing || editingMark !== null}>
          <UserPlus className="h-5 w-5" /> Salvar ficha
        </Button>
      </div>
    </div>
  );
}
