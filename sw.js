// Guarda o jogo no celular para funcionar sem internet.
// Com internet, busca sempre a versão mais nova (com limite de espera); sem internet, usa a cópia guardada.
const CACHE = "palavra-chave-v2";
const ARQUIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/estilo.css",
  "js/app.js",
  "js/jogo.js",
  "js/palavras.js",
  "js/sala.js",
  "icons/chave.svg",
  "icons/icone-32.png",
  "icons/icone-180.png",
  "icons/icone-192.png",
  "icons/icone-512.png",
  "icons/icone-maskable-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const daRede = fetch(req).then(resp => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    });
    const limite = new Promise(ok => setTimeout(ok, 2500));
    try {
      const resp = await Promise.race([daRede, limite.then(() => null)]);
      if (resp) return resp;
    } catch { /* sem rede */ }
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    return daRede;
  })());
});
