import type { Person } from "@/lib/types";

/**
 * Cópia de segurança criptografada da base.
 * AES-256-GCM com chave derivada da senha por PBKDF2-SHA256 (310 mil iterações, sal aleatório).
 * Sem a senha o arquivo é ilegível; o GCM também detecta qualquer alteração no arquivo.
 */
const FORMAT = "pm-palhoca-backup";
const VERSION = 1;
const ITERATIONS = 310_000;
export const MIN_PASSWORD = 8;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  data: string;
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackup(persons: Person[], password: string): Promise<string> {
  if (password.length < MIN_PASSWORD) throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(persons));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: toB64(salt) },
    cipher: { name: "AES-GCM", iv: toB64(iv) },
    data: toB64(cipher),
  };
  return JSON.stringify(file);
}

export async function decryptBackup(content: string, password: string): Promise<Person[]> {
  let file: BackupFile;
  try {
    file = JSON.parse(content);
  } catch {
    throw new Error("Arquivo inválido.");
  }
  if (file?.format !== FORMAT || file.version !== VERSION) throw new Error("Este arquivo não é uma cópia de segurança deste sistema.");
  const key = await deriveKey(password, fromB64(file.kdf.salt), file.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(file.cipher.iv) }, key, fromB64(file.data));
  } catch {
    throw new Error("Senha incorreta ou arquivo corrompido.");
  }
  const persons = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(persons) || !persons.every(isPerson)) throw new Error("Conteúdo da cópia de segurança inválido.");
  return persons;
}

function isPerson(p: unknown): p is Person {
  const o = p as Person;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.alias === "string" &&
    Array.isArray(o.photos) &&
    Array.isArray(o.marks) &&
    o.photos.every((f) => typeof f.image === "string" && f.image.startsWith("data:image/")) &&
    o.marks.every((m) => typeof m.type === "string" && typeof m.description === "string") &&
    // Íris é opcional (cópias antigas não têm).
    (o.iris === undefined ||
      (Array.isArray(o.iris) &&
        o.iris.every((s) => (s.eye === "od" || s.eye === "oe") && typeof s.code?.bits === "string" && typeof s.code?.mask === "string")))
  );
}
