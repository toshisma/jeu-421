/**
 * Barre du bas, présente partout : ce que les écrans lui disent.
 *  - « partie en cours » : la barre passe en version compacte (icônes seules) pour laisser le plateau entier ;
 *  - « avant de partir » : la même confirmation que le bouton Quitter de l'écran (ask), puis le même
 *    rangement (leave : le serveur joue à votre place, place gardée pour « Reprendre », etc.).
 * Changer d'écran par la barre passe toujours par `confirmLeave()`.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

export interface NavGuard {
  /** Partie en cours (plateau) : barre compacte. */
  game?: boolean;
  /** Confirmation avant de partir (false = on reste). Reprend celle du bouton Quitter de l'écran. */
  ask?: () => Promise<boolean> | boolean;
  /** Rangement quand on part par la barre (comme le bouton Quitter, sans la navigation). */
  leave?: () => void;
}

type Holder = { get: () => NavGuard | null };
const holders = new Set<Holder>();
const listeners = new Set<() => void>();
let gameCount = 0;
const emit = () => {
  gameCount = [...holders].filter((h) => h.get()?.game).length;
  listeners.forEach((l) => l());
};

/** Un écran déclare sa partie en cours et/ou sa règle de départ (tant qu'il est affiché et `guard` non nul). */
export function useNavGuard(guard: NavGuard | null) {
  const ref = useRef(guard);
  ref.current = guard;
  const active = !!guard;
  const game = !!guard?.game;
  useEffect(() => {
    if (!active) return;
    const h: Holder = { get: () => ref.current };
    holders.add(h);
    emit();
    return () => { holders.delete(h); emit(); };
  }, [active, game]);
}

/** Vrai pendant une partie (barre compacte). */
export function useInGame(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => gameCount > 0);
}

let asking = false;
/** Avant de changer d'écran par la barre : confirmations des écrans affichés, puis leur rangement. */
export async function confirmLeave(): Promise<boolean> {
  if (asking) return false;
  asking = true;
  try {
    const list = [...holders].map((h) => h.get()).filter((g): g is NavGuard => !!g);
    for (const g of list) if (g.ask && !(await g.ask())) return false;
    for (const g of list) { try { g.leave?.(); } catch { /* rangement au mieux */ } }
    return true;
  } finally { asking = false; }
}

/** Zone d'affichage des écrans (au-dessus de la barre). */
export function appView(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.app-view');
}
/** Bas de la zone d'affichage, en pixels depuis le haut de l'écran (= hauteur de la fenêtre sans la barre). */
export function appBottom(): number {
  return appView()?.getBoundingClientRect().bottom ?? (typeof window !== 'undefined' ? window.innerHeight : 740);
}
/** Hauteur disponible pour un écran (fenêtre moins la barre du bas). */
export function appHeight(): number {
  const v = appView();
  return v ? v.getBoundingClientRect().height : typeof window !== 'undefined' ? window.innerHeight : 740;
}
