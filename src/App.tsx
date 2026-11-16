import { Eye, ScanFace, Tags, Users } from "lucide-react";
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
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <FlagBand />
        <div className="mx-auto max-w-lg px-4 pb-2 pt-2.5">
          <h1 className="text-[1.45rem] font-bold leading-none">PMSC Palhoça</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Apoio à identificação. Os dados ficam só neste aparelho.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-4">{content}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]" aria-label="Seções">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 font-heading text-[0.95rem] font-semibold transition ${
                tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === id && <span className="absolute inset-x-4 top-0 h-[3px] rounded-b bg-primary" aria-hidden />}
              <Icon className="h-6 w-6" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Faixa institucional: listras vermelho-branco-vermelho e losango verde da bandeira de Santa Catarina. */
function FlagBand() {
  return (
    <div className="relative" aria-hidden>
      <div className="h-[3px] bg-flag-red" />
      <div className="h-[3px] bg-flag-white" />
      <div className="h-[3px] bg-flag-red" />
      <div
        className="absolute left-1/2 top-1/2 h-[15px] w-[30px] -translate-x-1/2 -translate-y-1/2 bg-flag-green"
        style={{ clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" }}
      />
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
