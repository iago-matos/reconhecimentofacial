import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as db from "@/lib/db";
import { loadEngine, templatesFromImage } from "@/lib/recognition/engine";
import { personNeedsUpgrade, upgradePerson } from "@/lib/migrate";
import { displayName, type LogAction, type Person } from "@/lib/types";

export type Tab = "rosto" | "iris" | "marcas" | "pessoas";

export type EngineStatus = "carregando" | "pronto" | "erro";

interface AppState {
  persons: Person[];
  dataReady: boolean;
  dataError: string | null;
  engine: EngineStatus;
  engineError: string | null;
  retryEngine: () => void;
  /** Atualização da base para o modelo novo em andamento (null = nada a fazer). */
  upgrade: { done: number; total: number } | null;
  savePerson: (person: Person, isNew: boolean) => Promise<void>;
  removePerson: (person: Person) => Promise<void>;
  importPersons: (persons: Person[]) => Promise<number>;
  wipeAll: () => Promise<void>;
  log: (action: LogAction, detail: string) => void;
  tab: Tab;
  /** Ficha aberta na aba Pessoas (null = lista). */
  openPersonId: string | null;
  go: (tab: Tab, personId?: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineStatus>("carregando");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("rosto");
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ done: number; total: number } | null>(null);

  const reload = useCallback(async () => {
    setPersons(await db.getAllPersons());
  }, []);

  useEffect(() => {
    db.requestPersistentStorage();
    reload()
      .then(() => setDataReady(true))
      .catch((e) => setDataError(e instanceof Error ? e.message : String(e)));
  }, [reload]);

  const startEngine = useCallback(() => {
    setEngine("carregando");
    setEngineError(null);
    loadEngine()
      .then(() => setEngine("pronto"))
      .catch((e) => {
        console.error(e);
        setEngine("erro");
        setEngineError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(startEngine, [startEngine]);

  // Fichas gravadas com um modelo antigo (ou importadas de uma cópia antiga):
  // recalcula os vetores a partir das fotos guardadas.
  const hasStale = useMemo(() => persons.some(personNeedsUpgrade), [persons]);
  useEffect(() => {
    if (engine !== "pronto" || !dataReady || !hasStale) return;
    const stale = persons.filter(personNeedsUpgrade);
    if (!stale.length) return;
    let cancelled = false;
    (async () => {
      setUpgrade({ done: 0, total: stale.length });
      for (let i = 0; i < stale.length && !cancelled; i++) {
        const updated = await upgradePerson(stale[i], async (image) => {
          const f = await templatesFromImage(image);
          return f ? { face: f.face, periocular: f.periocular, quality: f.quality, aligned: f.aligned } : null;
        });
        await db.putPersons([updated]);
        setUpgrade({ done: i + 1, total: stale.length });
      }
      if (!cancelled) {
        await reload();
        setUpgrade(null);
      }
    })().catch((e) => {
      console.error("Falha ao atualizar a base:", e);
      setUpgrade(null);
    });
    return () => {
      cancelled = true;
    };
    // `persons` fica de fora de propósito: a lista só é recarregada no fim da atualização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, dataReady, hasStale]);

  const log = useCallback((action: LogAction, detail: string) => {
    db.addLog(action, detail).catch((e) => console.warn("Falha ao registrar uso:", e));
  }, []);

  const savePerson = useCallback(
    async (person: Person, isNew: boolean) => {
      const stamped = { ...person, updatedAt: new Date().toISOString() };
      await db.putPersons([stamped]);
      log(isNew ? "cadastro" : "edicao", displayName(stamped));
      await reload();
    },
    [log, reload],
  );

  const removePerson = useCallback(
    async (person: Person) => {
      await db.deletePerson(person.id);
      log("exclusao", displayName(person));
      await reload();
    },
    [log, reload],
  );

  const importPersons = useCallback(
    async (incoming: Person[]) => {
      await db.putPersons(incoming);
      log("importacao", `${incoming.length} pessoa(s)`);
      await reload();
      return incoming.length;
    },
    [log, reload],
  );

  const wipeAll = useCallback(async () => {
    await db.clearAll();
    log("apagar_tudo", "Base e registros apagados neste aparelho");
    setOpenPersonId(null);
    await reload();
  }, [log, reload]);

  const go = useCallback((next: Tab, personId: string | null = null) => {
    setTab(next);
    setOpenPersonId(personId);
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<AppState>(
    () => ({
      persons,
      dataReady,
      dataError,
      engine,
      engineError,
      retryEngine: startEngine,
      upgrade,
      savePerson,
      removePerson,
      importPersons,
      wipeAll,
      log,
      tab,
      openPersonId,
      go,
    }),
    [persons, dataReady, dataError, engine, engineError, startEngine, upgrade, savePerson, removePerson, importPersons, wipeAll, log, tab, openPersonId, go],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp precisa estar dentro de AppStateProvider");
  return v;
}
