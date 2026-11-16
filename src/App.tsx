import { Eye, ScanFace, Shield, Tags, Users } from "lucide-react";
import { Notice, Spinner } from "@/components/ui";
import FaceSearch from "@/pages/FaceSearch";
import IrisCheck from "@/pages/IrisCheck";
import MarkSearch from "@/pages/MarkSearch";
import Persons from "@/pages/Persons";
import { AppStateProvider, useApp, type Tab } from "@/state/AppState";

const TABS: { id: Tab; label: string; icon: typeof ScanFace }[] = [
  { id: "rosto", label: "Rosto", icon: ScanFace },
  { id: "iris", label: "Íris", icon: Eye },
  { id: "marcas", label: "Marcas", icon: Tags },
  { id: "pessoas", label: "Pessoas", icon: Users },
];

function Shell() {
  const { tab, go, dataReady, dataError } = useApp();

  let content;
  if (dataError) content = <Notice tone="error">Não foi possível abrir a base local: {dataError}</Notice>;
  else if (!dataReady) content = <Spinner label="Abrindo base local…" />;
  else
    content = (
      <>
        {/* As abas ficam montadas para não perder a consulta ao trocar de aba. */}
        <div hidden={tab !== "rosto"}>
          <FaceSearch active={tab === "rosto"} />
        </div>
        <div hidden={tab !== "iris"}>
          <IrisCheck active={tab === "iris"} />
        </div>
        <div hidden={tab !== "marcas"}>
          <MarkSearch />
        </div>
        <div hidden={tab !== "pessoas"}>
          <Persons />
        </div>
      </>
    );

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-2.5">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base leading-tight">PMSC · Palhoça</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Apoio à identificação · protótipo</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-4">{content}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 font-heading text-xs font-semibold uppercase tracking-wider transition ${
                tab === id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </button>
          ))}
        </div>
        <p className="pb-1 text-center text-[10px] text-muted-foreground">
          Projeto acadêmico · Faculdade Municipal de Palhoça · dados só neste aparelho
        </p>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
