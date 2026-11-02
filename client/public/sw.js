/*
 * Service worker : rend le jeu installable et jouable hors ligne en solo.
 * - À l'installation : met en cache la page et tous les fichiers qu'elle référence.
 * - Page (navigation) : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
 * - Fichiers /assets/ (noms uniques par version) : cache d'abord.
 * - Polices : servies par le jeu lui-même (/assets/), donc mises en cache comme le reste.
 * - Le multijoueur (/socket.io) n'est jamais mis en cache.
 */
const VERSION = 'v2';
const CACHE = `421-${VERSION}`;
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // Récupère les fichiers JS/CSS référencés par la page (leurs noms changent à chaque version).
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const assets = [...new Set(html.match(/\/assets\/[^"')\s]+/g) || [])];
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/socket.io') || url.pathname === '/health') return;

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
      (await caches.open(CACHE)).put(req, res.clone());
    }
    return res;
  })());
});
