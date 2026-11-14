/* AstroGuardian service worker: keeps the dashboard usable when the server is unreachable.
 *
 *  - App shell (HTML, JS, CSS, icons): cache-first after the first visit.
 *  - GET /api/* (including /api/auth/state, so an offline reload still knows
 *    the role): network-first; on failure, the last saved
 *    response is returned with an `X-AG-Cached-At` header so the UI can say
 *    "offline: showing data from <time>".
 *  - Writes (POST) are never cached or queued: a reading that can't be saved
 *    must fail visibly rather than silently disappear.
 */
const SHELL = "ag-shell-v2";
const API = "ag-api-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/index.html", "/icon.svg", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, API].includes(k)).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstApi(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith("/assets/")) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

async function networkFirstApi(req) {
  const cache = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const body = await res.clone().blob();
      const headers = new Headers(res.headers);
      headers.set("X-AG-Saved-At", new Date().toISOString());
      await cache.put(req, new Response(body, { status: 200, headers }));
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (!hit) throw err;
    const headers = new Headers(hit.headers);
    headers.set("X-AG-Cached-At", hit.headers.get("X-AG-Saved-At") || new Date().toISOString());
    return new Response(await hit.blob(), { status: 200, headers });
  }
}
