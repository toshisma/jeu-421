/**
 * Exploits d'une partie du Poker menteur, relevés par le SERVEUR pendant qu'il joue la partie
 * (succès du mode). Seules les décisions prises par le joueur lui-même comptent (pas celles que le
 * serveur prend pour un absent ou un temps écoulé).
 */
import { rankOf, isTop } from './hands';
import { lastClaim, type PmAction, type PmState } from './engine';

export interface PmFeat { callsRight: number; bluffsPassed: number; pokerAs: number; livesLost: number }
export type PmFeats = Record<string, PmFeat>;
export const newPmFeat = (): PmFeat => ({ callsRight: 0, bluffsPassed: 0, pokerAs: 0, livesLost: 0 });

/** Note ce qu'une action (déjà acceptée : `prev` → `next`) a produit. `own` : décision du joueur lui-même. */
export function trackPmFeats(f: PmFeats, prev: PmState, a: PmAction, next: PmState, own = true): void {
  const me = prev.players[prev.current]?.id;
  if (!me) return;
  const of = (id: string) => (f[id] ??= newPmFeat());
  const claim = lastClaim(prev);
  if (a.type === 'croire' && claim && prev.dice && rankOf(prev.dice, prev.options.noStraights) < rankOf(claim.hand, prev.options.noStraights)) {
    // Le bluff de l'annonceur est passé (c'est SA décision d'annoncer qui compte : toujours la sienne, sauf coup automatique noté à l'annonce).
    if (!claim.auto) of(claim.by).bluffsPassed++;
  }
  if (a.type === 'menteur' && next.lastReveal) {
    const r = next.lastReveal;
    if (own && !r.truth) of(me).callsRight++;
    if (r.truth && isTop(r.dice) && !claim?.auto) of(r.by).pokerAs++;
    of(r.loser).livesLost++;
  }
}
