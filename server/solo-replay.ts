/**
 * Parties solo rejouées par le serveur (421, Le Courtisan, Poker menteur) : voir shared/rejeu/common.ts.
 *  - au début (/solo/start, /dixmille/start, /poker/start), si le téléphone envoie sa table (`setup`),
 *    le serveur la vérifie, tire une graine cryptographique et garde (jeton, jeu, graine, table) ici ;
 *  - à la fin, avec la liste des décisions (`moves`), il rejoue la partie et calcule lui-même le résultat.
 * Partie non vérifiée (ancienne version en cache, pas de table, liste refusée) : récompense de base
 * plafonnée seulement (pièces, XP, sac compté comme une défaite), sans étoiles, succès, patron,
 * adversaire de fête ni défi, avec une ligne « Mettez à jour la page… » dans les gains.
 */
import { randomBytes } from 'node:crypto';
import type { Store } from './db';
import { applyPlainReward, type Profile, type Reward } from '../shared/progress/profile';
import { dixMilleBagRoll } from '../shared/dixmille/reward';

export type RejeuGame = '421' | 'dm' | 'pm';
export interface RejeuTicket { game: RejeuGame; seed: number; setup: unknown }

/** Ligne ajoutée aux gains d'une partie non vérifiée (visible aussi par les anciennes versions du jeu). */
export const UNVERIFIED_LINE = 'Mettez à jour la page pour que cette partie compte entièrement';

export function createRejeu(store: Store) {
  const db = store.sqlite;
  db.exec('CREATE TABLE IF NOT EXISTS solo_rejeu (token TEXT PRIMARY KEY, game TEXT NOT NULL, seed INTEGER NOT NULL, setup TEXT NOT NULL, created INTEGER NOT NULL)');
  const ins = db.prepare('INSERT OR REPLACE INTO solo_rejeu (token, game, seed, setup, created) VALUES (?, ?, ?, ?, ?)');
  const get = db.prepare('SELECT game, seed, setup FROM solo_rejeu WHERE token = ?');
  const del = db.prepare('DELETE FROM solo_rejeu WHERE token = ?');
  const prune = db.prepare('DELETE FROM solo_rejeu WHERE created < ?');
  return {
    /** Nouvelle graine (32 bits, cryptographique) pour cette partie. */
    issue(token: string, game: RejeuGame, setup: unknown, now = Date.now()): number {
      const seed = randomBytes(4).readUInt32BE(0);
      ins.run(token, game, seed, JSON.stringify(setup), now);
      prune.run(now - 12 * 3600_000);
      return seed;
    },
    /** Graine et table d'une partie (à usage unique : effacées à la lecture). */
    take(token: string, game: RejeuGame): RejeuTicket | null {
      const r = get.get(token) as { game: string; seed: number; setup: string } | undefined;
      if (!r) return null;
      del.run(token);
      if (r.game !== game) return null;
      try { return { game, seed: Number(r.seed) >>> 0, setup: JSON.parse(r.setup) }; } catch { return null; }
    },
  };
}

/**
 * Partie non vérifiée : seulement la récompense de base (déjà plafonnée par l'appelant), XP et pass,
 * et la chance de sac d'une défaite (résultat annoncé). Ni défis du jour, ni succès, ni statistiques.
 */
export function applyUnverified(p: Profile, reward: Reward, day: string, o: { minutes: number; players: number }) {
  const lines = [...reward.lines, { label: UNVERIFIED_LINE, xp: 0, coins: 0 }];
  const r: Reward = { ...reward, lines };
  const a = applyPlainReward(p, r, day);
  const bag = dixMilleBagRoll(a.profile, { won: false, players: o.players, minutes: o.minutes, mode: 'solo', declared: true });
  return { reward: r, applied: { ...a, profile: bag.profile, bagsFound: bag.found, questsDone: [], achievementsDone: [] } };
}
