/**
 * Réputation de la Tournée des comptoirs, montrée aux autres joueurs pendant les parties EN LIGNE
 * (421, Le Courtisan, Coups Fourrés, Poker menteur) et dans les salons d'attente.
 *  - La valeur vient TOUJOURS du profil serveur du compte (accounts.publicInfo, cards-online) ; un invité
 *    n'en a pas, un compte sans étoile non plus (rien d'affiché).
 *  - Sur le fil : `rep: { s, q }` = étoiles (somme, shared/progress/comptoirs.ts : reputation) et quartiers terminés.
 *  - Paliers nommés (textes : clés `rep.` de shared/i18n/zones/repu.*.ts).
 */
import { cleanTdc, quarterDone, reputation, TDC_MAX_STARS, TDC_QUARTERS } from './comptoirs';

export interface RepInfo {
  /** Étoiles de réputation (1 à TDC_MAX_STARS). */
  s: number;
  /** Quartiers terminés (0 à TDC_QUARTERS.length). */
  q: number;
}

/** Paliers : étoiles minimales (le palier 0 = pas de réputation, rien d'affiché). */
export const REP_TIERS = [1, 8, 18, 30] as const;
export type RepTier = 0 | 1 | 2 | 3 | 4;
/** Palier à partir duquel une table devient « Table de connaisseurs ». */
export const REP_CONNOISSEURS: RepTier = 3;

export function repTier(stars: number): RepTier {
  let t = 0;
  REP_TIERS.forEach((min, i) => { if (stars >= min) t = i + 1; });
  return t as RepTier;
}

/** Réputation d'un profil (progression de la Tournée telle que le serveur la garde) ; undefined si aucune étoile. */
export function repOf(tdc: unknown): RepInfo | undefined {
  const p = cleanTdc(tdc);
  const s = Math.min(TDC_MAX_STARS, reputation(p));
  if (s <= 0) return undefined;
  return { s, q: TDC_QUARTERS.filter((q) => quarterDone(p, q.id)).length };
}

/** Lecture prudente côté client (valeur reçue du serveur) : bornée, sinon undefined. */
export function readRep(raw: unknown): RepInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { s, q } = raw as Record<string, unknown>;
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 1 || s > TDC_MAX_STARS) return undefined;
  const qq = typeof q === 'number' && Number.isInteger(q) ? Math.max(0, Math.min(TDC_QUARTERS.length, q)) : 0;
  return { s, q: qq };
}

/** Meilleure réputation d'une table (pour « Table de connaisseurs »). */
export function bestRep(list: (RepInfo | undefined | null)[]): RepInfo | undefined {
  let best: RepInfo | undefined;
  for (const r of list) if (r && (!best || r.s > best.s)) best = r;
  return best;
}
