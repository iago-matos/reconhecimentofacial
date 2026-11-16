import { normalizePerson } from "@/lib/migrate";
import type { LogAction, LogEntry, Person } from "@/lib/types";

/**
 * Armazenamento local (IndexedDB) no próprio aparelho.
 * Nada é enviado para servidores: a base existe só neste navegador.
 */
const DB_NAME = "pm-palhoca-reconhecimento";
const DB_VERSION = 1;
const PERSONS = "persons";
const LOG = "log";
/** Mantém só os registros de uso mais recentes. */
export const LOG_LIMIT = 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PERSONS)) db.createObjectStore(PERSONS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(LOG)) db.createObjectStore(LOG, { keyPath: "id", autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error("Não foi possível abrir o banco local"));
      };
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Operação cancelada"));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPersons(): Promise<Person[]> {
  const db = await openDb();
  const persons = (await request(db.transaction(PERSONS).objectStore(PERSONS).getAll() as IDBRequest<Person[]>)).map(normalizePerson);
  return persons.sort((a, b) => (a.name || a.alias).localeCompare(b.name || b.alias, "pt-BR"));
}

export async function putPersons(persons: Person[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PERSONS, "readwrite");
  for (const p of persons) tx.objectStore(PERSONS).put(p);
  await done(tx);
}

export async function deletePerson(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PERSONS, "readwrite");
  tx.objectStore(PERSONS).delete(id);
  await done(tx);
}

export async function addLog(action: LogAction, detail: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(LOG, "readwrite");
  const store = tx.objectStore(LOG);
  store.add({ at: new Date().toISOString(), action, detail } satisfies LogEntry);
  // Retenção: apaga os registros mais antigos acima do limite.
  const countReq = store.count();
  countReq.onsuccess = () => {
    let excess = countReq.result - LOG_LIMIT;
    if (excess <= 0) return;
    store.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor && excess > 0) {
        cursor.delete();
        excess--;
        cursor.continue();
      }
    };
  };
  await done(tx);
}

export async function getLog(limit = 200): Promise<LogEntry[]> {
  const db = await openDb();
  const all = await request(db.transaction(LOG).objectStore(LOG).getAll() as IDBRequest<LogEntry[]>);
  return all.reverse().slice(0, limit);
}

/** Apaga pessoas e registros de uso deste aparelho. */
export async function clearAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([PERSONS, LOG], "readwrite");
  tx.objectStore(PERSONS).clear();
  tx.objectStore(LOG).clear();
  await done(tx);
}

/** Pede ao navegador para não apagar os dados sozinho quando faltar espaço. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* opcional */
  }
}
