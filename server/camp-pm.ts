/**
 * Campagne du Poker menteur « Les Arrière-salles », côté serveur (comptes) : branchée sur /poker/start
 * et /poker/end (server/accounts.ts).
 *  - au départ : l'étape demandée doit être ouverte pour ce compte ; le serveur IMPOSE la table de l'étape
 *    (adversaires, niveaux, styles, vies, suites : cpmSetup), la note dans le jeton (« cpm:<étape> ») et
 *    dans le ticket de rejeu ; le téléphone ne choisit que qui commence ;
 *  - à la fin : étoiles calculées avec les seuls faits du rejeu (shared/rejeu/poker.ts), nouvelles
 *    seulement, 5 pièces chacune, titre du chapitre terminé.
 * Le jeton est à usage unique (supprimé par /poker/end) : pas de double récompense.
 */
import type { Store, UserRow } from './db';
import type { Profile } from '../shared/progress/profile';
import type { FactsPm, SetupPm } from '../shared/rejeu/poker';
import { stableJson } from '../shared/rejeu/common';
import { applyCpm, cpmSetup, cpmStage, stageUnlocked, type CpmResult } from '../shared/campaigns/pm';

/** Étape et table imposée d'une partie qui commence, si l'étape est ouverte pour ce profil (sinon null). */
export function cpmPokerStart(p: Profile, requested: unknown, start: unknown): { tag: string; setup: SetupPm } | null {
  const st = cpmStage(requested);
  if (!st || !stageUnlocked(p.cpm, st.id)) return null;
  return { tag: `cpm:${st.id}`, setup: cpmSetup(st, typeof start === 'number' ? start : 0) };
}

/**
 * Étoiles d'une partie de campagne rejouée (null si ce n'était pas une partie de campagne, ou si la table
 * rejouée n'est pas exactement celle de l'étape).
 */
export function cpmPokerEnd(store: Store, u: UserRow, tag: string | null, setup: SetupPm, facts: FactsPm): CpmResult | null {
  if (!tag?.startsWith('cpm:')) return null;
  const st = cpmStage(tag.slice(4));
  if (!st || stableJson(setup) !== stableJson(cpmSetup(st, setup.start))) return null;
  const row = store.userById(u.id) ?? u;
  const { profile, result } = applyCpm(store.profileOf(row), st.id, facts);
  if (result.newStars.length || result.title) store.saveProfile(u.id, profile);
  return result;
}
