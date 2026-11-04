/**
 * Écrans chargés à la demande : chaque écran secondaire est un fichier JS à part, téléchargé
 * seulement quand on l'ouvre (ou en avance, en arrière-plan, via `preload`). L'accueil s'affiche
 * ainsi sans attendre la 3D, la boutique, l'administration, etc.
 *
 * Après une mise à jour du site, un onglet resté ouvert peut réclamer un ancien fichier qui
 * n'existe plus : on recharge alors la page une fois (la nouvelle version prend le relais).
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_KEY = '421.rechargement';
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { return; }
  location.reload();
}

export type Preloadable<C extends ComponentType<any>> = LazyExoticComponent<C> & { preload: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<M extends Record<K, ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, name: K): Preloadable<M[K]> {
  let p: Promise<M> | null = null;
  const get = () => (p ??= load().catch((err) => { p = null; reloadOnce(); throw err; }));
  const C = lazy(() => get().then((m) => ({ default: m[name] })));
  return Object.assign(C, { preload: () => { get().catch(() => {}); } });
}

/** Exécute `fn` quand le navigateur est au repos (sans gêner l'affichage en cours). */
export function whenIdle(fn: () => void, timeout = 3000) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout }); else setTimeout(fn, 300);
}

/** Économiseur de données ou réseau très lent : on ne télécharge rien en avance. */
export function saveData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (!!c.saveData || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
}
