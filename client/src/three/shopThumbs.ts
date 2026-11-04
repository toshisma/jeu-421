/**
 * Vignettes de la boutique tirées du vrai rendu 3D du bac.
 *
 * Une seule scène hors écran (un seul contexte WebGL) sert toute la boutique : chaque vignette
 * demandée est rendue à son tour (une par image, pour ne pas bloquer l'interface), copiée en
 * image puis gardée en cache. Les cartes n'affichent que des <img>, jamais un canvas WebGL.
 */
import { useEffect, useState } from 'react';
import type { Appearance } from '../../../shared/progress/catalog';
import { TrayScene } from './TrayScene';

export interface ThumbSpec { look: Appearance; w: number; h: number; elev?: number; /** Recul de la caméra (1 = bac cadré au plus juste). */ fit?: number }

const cache = new Map<string, string>();
const waiting = new Map<string, { spec: ThumbSpec; subs: Set<(url: string) => void> }>();
let scene: TrayScene | null = null;
let host: HTMLDivElement | null = null;
let users = 0;
let busy = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (s: ThumbSpec) => `${s.look.decor}|${s.look.felt}|${s.look.rim}|${s.look.shape}|${s.look.dice}|${s.w}x${s.h}|${s.elev ?? ''}|${s.fit ?? ''}`;

function ensureScene(look: Appearance): TrayScene {
  if (scene) return scene;
  host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:200px;pointer-events:none;opacity:0';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  scene = new TrayScene(host, { appearance: look, quality: 'normale', thumbnail: true });
  return scene;
}

/** Rend les vignettes en attente, une par image affichée. */
async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (waiting.size) {
      const [key, job] = waiting.entries().next().value!;
      const sc = ensureScene(job.spec.look);
      let url = '';
      try { url = sc.capture(job.spec.look, job.spec.w, job.spec.h, job.spec.elev, job.spec.fit); } catch { url = ''; }
      waiting.delete(key);
      if (url) cache.set(key, url);
      for (const f of job.subs) f(url);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  } finally {
    busy = false;
  }
  if (users === 0) scheduleRelease();
}

function scheduleRelease() {
  if (idleTimer) clearTimeout(idleTimer);
  // Boutique fermée : on libère le contexte WebGL (les images restent en cache).
  idleTimer = setTimeout(() => {
    if (users > 0 || busy) return;
    scene?.dispose(); scene = null;
    host?.remove(); host = null;
  }, 4000);
}

function request(spec: ThumbSpec, cb: (url: string) => void): () => void {
  const key = keyOf(spec);
  const hit = cache.get(key);
  if (hit) { cb(hit); return () => {}; }
  let job = waiting.get(key);
  if (!job) { job = { spec, subs: new Set() }; waiting.set(key, job); }
  job.subs.add(cb);
  void pump();
  return () => {
    const j = waiting.get(key);
    if (!j) return;
    j.subs.delete(cb);
    if (!j.subs.size) waiting.delete(key); // plus personne ne l'attend (onglet changé)
  };
}

/** Déclare un écran qui utilise les vignettes (la scène hors écran vit tant qu'il en reste un). */
export function useThumbHost() {
  useEffect(() => {
    users++;
    if (idleTimer) clearTimeout(idleTimer);
    return () => { users--; if (users === 0 && !busy) scheduleRelease(); };
  }, []);
}

/** Image d'aperçu d'une apparence (null tant qu'elle n'est pas prête ; '' si le rendu a échoué). */
export function useThumb(spec: ThumbSpec | null): string | null {
  const key = spec ? keyOf(spec) : '';
  const [url, setUrl] = useState<string | null>(() => (spec ? cache.get(key) ?? null : null));
  useEffect(() => {
    if (!spec) return;
    setUrl(cache.get(key) ?? null);
    return request(spec, setUrl);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}
