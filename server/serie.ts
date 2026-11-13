/**
 * Série de jours joués, côté serveur (comptes) : le serveur fait foi.
 *
 * Appelé à chaque partie terminée et récompensée par le serveur (fin de partie des quatre jeux,
 * défi du jour, défi entre amis). Le jour est celui du serveur (Bruxelles) : rien ne vient du téléphone.
 * Une seule récompense par jour, garantie par la table `serie_days` (clé compte + jour, INSERT OR
 * IGNORE) : deux fins de partie simultanées, ou un profil modifié, ne donnent jamais deux récompenses.
 */
import type { Store } from './db';
import { applySerieDay } from '../shared/progress/profile';
import { today } from '../shared/progress/quests';
import type { SerieReward } from '../shared/progress/serie';

export interface SerieDeps { store: Store; now: () => number }

export function createSerie(d: SerieDeps) {
  const db = d.store.sqlite;
  db.exec(`CREATE TABLE IF NOT EXISTS serie_days (user_id TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))`);
  const dayNow = () => today(new Date(d.now()));

  /** Partie terminée par ce compte : compte le jour (une fois) et verse la récompense de série. */
  function played(userId: string): { n: number; reward: SerieReward; joker: boolean } | null {
    try {
      const day = dayNow();
      const u = d.store.userById(userId);
      if (!u) return null;
      const ins = db.prepare('INSERT OR IGNORE INTO serie_days (user_id, day, at) VALUES (?, ?, ?)').run(userId, day, d.now());
      if (!Number(ins.changes)) return null; // jour déjà compté
      const r = applySerieDay(d.store.profileOf(u), day);
      if (!r) return null; // profil déjà à jour (reprise d'invité du même jour)
      d.store.saveProfile(userId, r.profile);
      // Vieux jours : seuls les deux derniers mois servent (vérification « déjà joué aujourd'hui »).
      if (Math.random() < 0.01) db.prepare('DELETE FROM serie_days WHERE at < ?').run(d.now() - 60 * 86400_000);
      return { n: r.n, reward: r.reward, joker: r.joker };
    } catch (e) { console.warn('[serie]', e); return null; }
  }
  /** A joué aujourd'hui (jour du serveur) ? */
  const playedToday = (userId: string) => !!db.prepare('SELECT 1 FROM serie_days WHERE user_id = ? AND day = ?').get(userId, dayNow());

  return { played, playedToday };
}
export type SerieApi = ReturnType<typeof createSerie>;
