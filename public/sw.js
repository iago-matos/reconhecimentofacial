/*
 * Service worker: guarda o app e os modelos de IA no aparelho.
 *   - Modelos (/models/*, ~18 MB): baixados uma vez e servidos do aparelho (cache-first).
 *     Para forçar novo download quando um modelo mudar, aumente MODELS_VERSION.
 *   - Arquivos do app (/assets/*, nomes com hash): cache-first; cada build gera nomes novos.
 *   - Página (index.html): rede primeiro, cópia guardada se estiver sem internet.
 * A versão do app vem do parâmetro ?v= no endereço deste arquivo (muda a cada build).
 */
const MODELS_VERSION = "models-v1";
/** Modelos baixados já na instalação (a página começa a carregá-los antes de o service worker assumir). */
const MODEL_FILES = ["blazeface", "facemesh", "iris", "insightface-efficientnet-b0"].flatMap((m) => [`models/${m}.json`, `models/${m}.bin`]);
const APP_VERSION = "app-" + (new URL(self.location.href).searchParams.get("v") || "dev");
const KEEP = [MODELS_VERSION, APP_VERSION];
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  // Guarda a página inicial e os modelos já na instalação.
  event.waitUntil(
    Promise.all([
      caches.open(APP_VERSION).then((c) => c.add(SCOPE)),
      caches.open(MODELS_VERSION).then(async (c) => {
        const missing = [];
        for (const f of MODEL_FILES) if (!(await c.match(SCOPE + f))) missing.push(SCOPE + f);
        await c.addAll(missing);
      }),
    ]).then(() => self.skipWaiting()),
  );
});

// A página manda a lista de arquivos do app que já carregou antes de o service worker assumir.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "guardar" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(APP_VERSION).then(async (c) => {
      for (const u of data.urls) {
        const url = new URL(u, self.location.href);
        if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE + "assets/")) continue;
        if (!(await c.match(url.href))) await c.add(url.href).catch(() => undefined);
      }
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(APP_VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(SCOPE, res.clone());
    return res;
  } catch {
    return (await cache.match(SCOPE)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const path = url.pathname.slice(SCOPE.length);
  if (request.mode === "navigate") return event.respondWith(networkFirst(request));
  if (path.startsWith("models/")) return event.respondWith(cacheFirst(request, MODELS_VERSION));
  if (path.startsWith("assets/") || path === "favicon.ico") return event.respondWith(cacheFirst(request, APP_VERSION));
});
