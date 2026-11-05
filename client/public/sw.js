/*
 * Service worker : rend le jeu installable et jouable hors ligne en solo.
 * - À l'installation : met en cache la page et tous les fichiers qu'elle référence.
 * - Page (navigation) : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
 * - Fichiers /assets/ (noms uniques par version) : cache d'abord.
 * - Polices : servies par le jeu lui-même (/assets/), donc mises en cache comme le reste.
 * - Le multijoueur (/socket.io) n'est jamais mis en cache.
 */
const VERSION = 'v5';
const CACHE = `421-${VERSION}`;
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // Récupère les fichiers JS/CSS référencés par la page (leurs noms changent à chaque version).
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const assets = new Set(html.match(/\/assets\/[^"')\s]+/g) || []);
    // Le jeu est découpé en morceaux chargés à la demande : on suit les références des fichiers JS
    // (« assets/xxx.js ») pour garder aussi l'écran de partie et la 3D, nécessaires hors ligne.
    const todo = [...assets].filter((a) => a.endsWith('.js'));
    while (todo.length) {
      const js = todo.pop();
      const txt = await (await fetch(js)).text().catch(() => '');
      for (const m of txt.match(/(?:assets\/|["'`]\.\/)[\w.-]+\.(?:js|css)/g) || []) {
        const a = '/assets/' + m.replace(/^(?:assets\/|["'`]\.\/)/, '');
        if (!assets.has(a)) { assets.add(a); if (a.endsWith('.js')) todo.push(a); }
      }
    }
    await cache.addAll([...assets]);
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
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api/') || url.pathname === '/health') return;

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Seule la page du jeu est gardée pour jouer hors ligne (pas les pages de règles).
        if (url.pathname === '/' && res.ok) (await caches.open(CACHE)).put('/', res.clone());
        return res;
      } catch {
        return (await caches.match(url.pathname === '/' ? '/' : req)) || (await caches.match('/')) || Response.error();
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

// Notifications (défis, demandes d'amis, happy hour, série en danger).
self.addEventListener('push', (event) => {
  let d = { title: '421', body: '', url: '/' };
  try { d = { ...d, ...event.data.json() }; } catch { /* message vide */ }
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url }, lang: 'fr',
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Alerte « À vous de jouer » : on remet simplement le jeu au premier plan, sans recharger la partie.
  if (event.notification.data && event.notification.data.focus) {
    event.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const c = all.find((x) => 'focus' in x);
      if (c) await c.focus(); else await self.clients.openWindow('/');
    })());
    return;
  }
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url).catch(() => {}); return; } }
    await self.clients.openWindow(url);
  })());
});
