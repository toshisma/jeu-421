/**
 * La Route des Auberges (campagne solo du Courtisan), côté serveur (comptes) : branchée sur /dixmille/start
 * et /dixmille/end (server/accounts.ts).
 *  - au départ : l'étape demandée doit être ouverte pour ce compte ET la table envoyée doit être exactement
 *    celle de l'étape (adversaires, niveaux, objectif, seuil d'ouverture) : sinon la partie est refusée.
 *    L'étape est notée dans le jeton de partie (« cdm:<étape> ») et la graine délivrée (rejeu à la fin) ;
 *  - à la fin : seulement pour une partie REJOUÉE par le serveur (faits de replayDm), étoiles nouvelles,
 *    5 pièces par étoile, titre de chapitre, et CDM_CHAPTER_GROSCHEN Groschen par chapitre terminé, une
 *    seule fois par compte (table dm_once, clé « camp:<chapitre> »). Le jeton est à usage unique.
 */
import type { Store } from './db';
import type { FactsDm, SetupDm } from '../shared/rejeu/dixmille';
import { stableJson } from '../shared/rejeu/common';
import { applyCdm, cdmSetup, cdmStage, chapterDone, stageUnlocked, CDM_CHAPTERS, CDM_CHAPTER_GROSCHEN, type CdmResult } from '../shared/campaigns/dm';

/** Messages de refus (français, traduits chez le joueur : shared/i18n/zones/campdm-server.ts). */
export const CDM_ERRORS = {
  locked: 'Cette auberge n’est pas encore ouverte pour vous.',
  table: 'Cette table n’est pas celle de l’auberge.',
} as const;

/**
 * Début d'une partie : null si ce n'est pas une partie de campagne ; sinon l'étiquette et la table imposée,
 * ou une erreur (étape fermée, table différente de celle de l'étape).
 */
export function cdmDmStart(store: Store, userId: string, requested: unknown, setup: SetupDm | null): null | { error: string } | { tag: string; setup: SetupDm } {
  if (requested === undefined || requested === null) return null;
  const st = cdmStage(requested);
  const row = store.userById(userId);
  if (!st || !row || !stageUnlocked(store.profileOf(row).campDm, st.id)) return { error: CDM_ERRORS.locked };
  const want = cdmSetup(st);
  if (!setup || stableJson(setup) !== stableJson(want)) return { error: CDM_ERRORS.table };
  return { tag: `cdm:${st.id}`, setup: want };
}

/** Fin d'une partie de campagne rejouée : étoiles, pièces, titre et Groschen de chapitre (une fois). */
export function cdmDmEnd(store: Store, userId: string, tag: string | null | undefined, facts: FactsDm, now = Date.now()): CdmResult | null {
  if (!tag?.startsWith('cdm:')) return null;
  const st = cdmStage(tag.slice(4));
  const row = store.userById(userId);
  if (!st || !row) return null;
  const { profile, result } = applyCdm(store.profileOf(row), st.id, facts);
  if (result.newStars.length || result.title) store.saveProfile(userId, profile);
  // Groschen de fin de chapitre : une seule fois par compte et par chapitre (insertion indivisible).
  store.dmBalance(''); // tables des Groschen
  store.sqlite.exec(`CREATE TABLE IF NOT EXISTS dm_once (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, key)
  )`);
  let groschen = 0;
  for (const c of CDM_CHAPTERS) {
    if (!chapterDone(profile.campDm, c.id)) continue;
    const fresh = Number(store.sqlite.prepare('INSERT OR IGNORE INTO dm_once (user_id, key, at) VALUES (?, ?, ?)').run(userId, `camp:${c.id}`, now).changes) === 1;
    if (!fresh) continue;
    store.dmMove(userId, CDM_CHAPTER_GROSCHEN, 'campagne', `cdm:${c.id}`, now);
    groschen += CDM_CHAPTER_GROSCHEN;
    if (!result.chapter) result.chapter = c.id;
  }
  if (groschen) result.groschen = groschen;
  return result;
}
