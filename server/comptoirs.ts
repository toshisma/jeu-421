/**
 * Tournée des comptoirs, côté serveur (comptes) : branchée sur /solo/start et /solo/end (server/accounts.ts).
 *  - au départ : le bistrot demandé doit être ouvert pour ce compte ; il est noté dans le jeton de partie
 *    (« tdc:<bistrot> »), le client ne peut plus en changer ;
 *  - à la fin : faits bornés (durée mesurée ici, manches, gros coups plafonnés), vraisemblance vérifiée
 *    (shared/progress/comptoirs.ts : tdcPlausible), étoiles nouvelles seulement, pièces et récompense de quartier.
 * Le jeton est à usage unique (supprimé par /solo/end avant d'arriver ici) : pas de double récompense.
 */
import type { Store, UserRow } from './db';
import type { Profile } from '../shared/progress/profile';
import { applyTdc, bistroUnlocked, tdcBistro, tdcFactsFrom, TDC_ROUND_MS, type TdcResult } from '../shared/progress/comptoirs';

/** Bistrot de la partie qui commence (« tdc:<id> ») s'il est ouvert pour ce profil, sinon null. */
export function tdcSoloStart(p: Profile, requested: unknown): string | null {
  const b = tdcBistro(requested);
  return b && bistroUnlocked(p.tdc, b.id) ? `tdc:${b.id}` : null;
}

const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));

/** Étoiles d'une partie de la Tournée terminée (null si ce n'était pas une partie de la Tournée). */
export function tdcSoloEnd(store: Store, u: UserRow, tag: string | null, body: Record<string, any>, elapsedMs: number, roundMs = TDC_ROUND_MS): TdcResult | null {
  if (!tag?.startsWith('tdc:')) return null;
  const b = tdcBistro(tag.slice(4));
  if (!b) return null;
  const rounds = int(body.rounds, 0, 1000);
  const facts = tdcFactsFrom({
    won: body.won === true,
    place: int(body.place, 1, 6),
    rounds,
    roundsLost: body.roundsLost === undefined || body.roundsLost === null ? undefined : int(body.roundsLost, 0, 1000),
    count421: int(body.count421, 0, 1000),
    combos: { '111': int(body.combos?.['111'], 0, 1000), brelan: int(body.combos?.brelan, 0, 1000) },
    elapsedMs,
  });
  const row = store.userById(u.id) ?? u;
  const { profile, result } = applyTdc(store.profileOf(row), b.id, facts, roundMs);
  if (result.newStars.length || result.title || result.felt) store.saveProfile(u.id, profile);
  return result;
}
