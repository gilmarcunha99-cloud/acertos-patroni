const SHELL = 'shell-v2';
const API = 'api';
const ARQUIVOS = ['/', '/style.css', '/manifest.webmanifest', '/js/app.mjs', '/js/api.mjs', '/js/ui.mjs', '/js/money.mjs', '/js/cobranca.mjs'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ns) => Promise.all(ns.filter((n) => n !== SHELL && n !== API).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (!/^\/api\/(meses|socios)/.test(url.pathname)) return;
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const c = r.clone(); e.waitUntil(caches.open(API).then((ca) => ca.put(req, c))); }
      return r;
    }).catch(() => caches.match(req, { cacheName: API }).then((r) => r || Response.error())));
    return;
  }
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const c = r.clone(); e.waitUntil(caches.open(SHELL).then((ca) => ca.put(req, c))); }
    return r;
  }).catch(() => caches.match(req).then((r) => r || Response.error())));
});
