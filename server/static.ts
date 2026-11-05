/**
 * Fichiers du jeu (dist/client) : compression et mise en cache.
 *  - /assets/* : noms uniques à chaque version (empreinte dans le nom) → cache d'un an, « immutable ».
 *  - index.html, pages, sw.js, manifeste : jamais gardés sans revalidation (sinon les mises à jour
 *    n'arrivent pas).
 *  - Textes (JS, CSS, HTML, SVG, JSON…) : envoyés compressés (brotli, sinon gzip). La compression
 *    est faite une fois par fichier, en tâche de fond au démarrage, puis gardée en mémoire.
 */
import express, { type Express, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompress, gzip, gzipSync, constants as Z } from 'node:zlib';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

export function cacheControlFor(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (urlPath === '/' || urlPath.endsWith('.html') || !extname(urlPath) || urlPath.endsWith('sw.js') || urlPath.endsWith('.webmanifest')) return 'no-cache';
  return 'public, max-age=86400';
}

interface Entry { mtime: number; raw: Buffer; br?: Buffer; gz?: Buffer; etag: string; busy?: boolean }

export function serveClient(app: Express, clientDir: string) {
  const root = normalize(clientDir + sep);
  const cache = new Map<string, Entry>();

  const resolve = (urlPath: string): string | null => {
    let p: string;
    try { p = decodeURIComponent(urlPath); } catch { return null; }
    if (p.endsWith('/')) p += 'index.html';
    let file = normalize(join(clientDir, p));
    if (!file.startsWith(root)) return null;
    if (!extname(file) && existsSync(file + '.html')) file += '.html'; // /regles-du-421 → regles-du-421.html
    try { return statSync(file).isFile() ? file : null; } catch { return null; }
  };

  const entry = (file: string): Entry => {
    const mtime = statSync(file).mtimeMs;
    let e = cache.get(file);
    if (!e || e.mtime !== mtime) {
      const raw = readFileSync(file);
      e = { mtime, raw, etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"` };
      cache.set(file, e);
    }
    return e;
  };
  /** Compression maximale, en tâche de fond (sans bloquer le serveur de jeu). */
  const warm = (e: Entry) => {
    if (e.busy || e.br || e.raw.length <= 1024) return;
    e.busy = true;
    brotliCompress(e.raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_SIZE_HINT]: e.raw.length } }, (err, br) => { if (!err) e.br = br; });
    gzip(e.raw, { level: 9 }, (err, gz) => { if (!err) e.gz = gz; });
  };
  // Au démarrage : tous les fichiers texte du jeu sont préparés d'avance.
  const walk = (dir: string) => {
    try {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const f = join(dir, d.name);
        if (d.isDirectory()) walk(f); else if (TYPES[extname(f)]) warm(entry(f));
      }
    } catch { /* dossier illisible : compression à la demande */ }
  };
  walk(clientDir);

  /** Envoie un fichier texte compressé (ou tel quel si le navigateur ne sait pas décompresser). */
  const sendText = (req: Request, res: Response, file: string, urlPath: string) => {
    const e = entry(file);
    res.setHeader('Content-Type', TYPES[extname(file)]);
    res.setHeader('Cache-Control', cacheControlFor(urlPath));
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', e.etag);
    if (req.headers['if-none-match'] === e.etag) { res.status(304).end(); return; }
    const ae = String(req.headers['accept-encoding'] ?? '');
    let body = e.raw;
    warm(e);
    if (e.br && /\bbr\b/.test(ae)) {
      body = e.br; res.setHeader('Content-Encoding', 'br');
    } else if (e.raw.length > 1024 && /\bgzip\b/.test(ae)) {
      // Pas encore prêt (juste après un déploiement) : gzip rapide en attendant.
      body = e.gz ?? gzipSync(e.raw, { level: 6 }); res.setHeader('Content-Encoding', 'gzip');
    }
    res.setHeader('Content-Length', body.length);
    if (req.method === 'HEAD') res.end(); else res.end(body);
  };

  // Une seule adresse par page (référencement) : /regles-du-421.html et /regles-du-421/ → /regles-du-421
  // (redirection permanente), /index.html → /. La requête (?…) est conservée.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const target = canonicalPath(req.path, (name) => existsSync(join(clientDir, name)));
    if (!target) return next();
    const q = req.originalUrl.indexOf('?');
    res.redirect(301, target + (q >= 0 ? req.originalUrl.slice(q) : ''));
  });

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const file = resolve(req.path);
    if (!file || !TYPES[extname(file)]) return next();
    sendText(req, res, file, req.path);
  });
  // Images, polices… : envoyées telles quelles (déjà compressées), avec le bon cache.
  app.use(express.static(clientDir, {
    extensions: ['html'],
    setHeaders: (res, path) => { res.setHeader('Cache-Control', cacheControlFor(path.slice(clientDir.length).split(sep).join('/'))); },
  }));
  // Ancien fichier d'une version précédente : vraie erreur 404 (et non la page du jeu), pour que
  // le navigateur recharge la nouvelle version au lieu d'exécuter du HTML comme du JavaScript.
  app.get('/assets/*', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.status(404).end(); });
  // Autres adresses : la page du jeu (le jeu s'ouvre quand même), mais avec le statut 404 pour les
  // adresses inconnues, afin que les moteurs de recherche n'indexent pas des doublons de l'accueil.
  app.get('*', (req, res) => {
    if (!isAppPath(req.path)) res.status(404);
    sendText(req, res, join(clientDir, 'index.html'), '/');
  });
}

/** Adresses servies par le jeu lui-même (application d'une seule page). */
export const isAppPath = (p: string) => p === '/' || p === '/confidentialite' || p.startsWith('/confidentialite/');

/**
 * Adresse canonique d'une page statique, ou null si l'adresse demandée l'est déjà.
 * `exists(nom)` dit si un fichier existe dans le dossier du jeu.
 */
export function canonicalPath(p: string, exists: (name: string) => boolean): string | null {
  if (p === '/index.html') return '/';
  const m = /^\/([a-z0-9-]+)(\.html|\/)$/.exec(p);
  if (m && m[1] !== 'index' && exists(`${m[1]}.html`)) return `/${m[1]}`;
  return null;
}

/**
 * Domaine unique : l'adresse technique de l'hébergeur (ex. jeu-421.onrender.com) et le « www »
 * renvoient vers https://421online.com, pour éviter un site en double dans Google. Actif seulement
 * sur Render (variable RENDER) ; l'API, Socket.IO, les photos et /health ne sont jamais redirigés
 * (application mobile, contrôle de santé de l'hébergeur).
 */
export function canonicalHostRedirect(app: Express, host = process.env.PUBLIC_HOST || '421online.com') {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const h = String(req.headers.host ?? '').toLowerCase().split(':')[0];
    if (!h || h === host || !(h.endsWith('.onrender.com') || h === `www.${host}`)) return next();
    if (/^\/(api|socket\.io|photos|health)(\/|$)/.test(req.path)) return next();
    res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}
