/**
 * Exploits d'une partie du Courtisan, relevés par le SERVEUR pendant qu'il joue la partie (succès du
 * Courtisan). Seules les décisions prises par le joueur lui-même comptent (pas celles que le serveur
 * prend pour un absent ou un temps écoulé).
 */
import { inPlay, scoreParts, type DmAction, type DmState } from './engine';

export interface DmFeat { /** Mains pleines du tour en cours. */ hot: number; hotMax: number; six: number; straight: number; sixKind: number }
export type DmFeats = Record<string, DmFeat>;
export const newFeat = (): DmFeat => ({ hot: 0, hotMax: 0, six: 0, straight: 0, sixKind: 0 });

/** Note ce qu'une action (déjà acceptée : `prev` → `next`) a produit pour le joueur qui l'a jouée. */
export function trackFeats(f: DmFeats, prev: DmState, a: DmAction, next: DmState, own = true): void {
  const pid = prev.players[prev.current]?.id;
  if (!pid) return;
  const me = (f[pid] ??= newFeat());
  if (own && a.type !== 'lancer' && a.pick.length === 6 && inPlay(prev).length === 6) {
    // Les 6 dés d'un même lancer mis de côté d'un coup.
    me.six++;
    const parts = scoreParts(a.pick.map((i) => prev.dice[i]))?.parts ?? [];
    if (parts.some((p) => p.kind === 'suite' && p.dice.length === 6)) me.straight++;
    if (parts.some((p) => p.kind === 'identiques' && p.dice.length === 6)) me.sixKind++;
  }
  for (const e of next.events) {
    if (e.playerId !== pid) continue;
    if (e.kind === 'main-pleine' && own) { me.hot++; me.hotMax = Math.max(me.hotMax, me.hot); }
    if (e.kind === 'rate' || e.kind === 'encaisse') me.hot = 0;
  }
}
