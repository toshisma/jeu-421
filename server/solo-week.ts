/**
 * Classement solo de la semaine (comptes) : victoires contre l'ordinateur des quatre jeux.
 * Barème : shared/soloweek.ts. Le serveur fait foi : `record` n'est appelé qu'après une partie rejouée
 * ou arbitrée par le serveur (fins de partie solo de server/accounts.ts, Coups Fourrés contre l'ordinateur).
 *
 * Tables (créées ici, additives) : solo_week (points de la semaine), solo_week_day (plafond du jour),
 * solo_week_podium (récompenses du lundi, clé semaine + rang : versées une seule fois, même si le serveur
 * redémarre au milieu de la clôture).
 */
import type { Store, UserRow } from './db';
import { adjustCoins } from '../shared/progress/profile';
import { today } from '../shared/progress/quests';
import { weekKey } from '../shared/progress/boss';
import { themeBonus, weeklyTheme, type WeeklyThemeId } from '../shared/weekly-theme';
import {
  SW_DAILY_CAP, SW_MIN_PLAYERS, SW_PRIZES, SW_TOP, swPoints, swSort,
  type SoloWeekBoard, type SoloWeekGame, type SoloWeekRow,
} from '../shared/soloweek';

export interface SoloWeekDeps {
  store: Store;
  now: () => number;
  push: (userId: string, title: string, body: string, url?: string) => void;
  /** Clôture des semaines : vérifiée régulièrement (0 = jamais, pour les tests). */
  rollEveryMs?: number;
}

interface Row { user_id: string; username: string; points: number; wins: number; last_at: number }

/** Lundi suivant la semaine `week`, 0 h à Bruxelles (heure d'hiver ou d'été), en millisecondes. */
export function weekEndsAt(week: string): number {
  const next = new Date(Date.parse(`${week}T12:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  for (const offset of [3600_000, 7200_000]) {
    const t = Date.parse(`${next}T00:00:00Z`) - offset;
    if (today(new Date(t)) === next && today(new Date(t - 1)) !== next) return t;
  }
  return Date.parse(`${next}T00:00:00Z`) - 3600_000;
}

export function createSoloWeek(d: SoloWeekDeps) {
  const db = d.store.sqlite;
  db.exec(`
    CREATE TABLE IF NOT EXISTS solo_week (
      week TEXT NOT NULL, user_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
      last_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (week, user_id)
    );
    CREATE TABLE IF NOT EXISTS solo_week_day (day TEXT NOT NULL, user_id TEXT NOT NULL, points INTEGER NOT NULL, PRIMARY KEY (day, user_id));
    CREATE TABLE IF NOT EXISTS solo_week_podium (
      week TEXT NOT NULL, rank INTEGER NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, points INTEGER NOT NULL, coins INTEGER NOT NULL,
      at INTEGER NOT NULL, PRIMARY KEY (week, rank)
    );
  `);
  const dayOf = (t = d.now()) => today(new Date(t));
  const weekOf = (t = d.now()) => weekKey(dayOf(t));
  const tx = <T>(f: () => T): T => {
    db.exec('BEGIN');
    try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  /** Comptes suspendus par l'administration (table de server/admin.ts, absente dans certains tests) : hors classement et hors podium. */
  const banned = (): Set<string> => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'admin_bans'").get()) return new Set();
    return new Set((db.prepare('SELECT user_id FROM admin_bans WHERE until IS NULL OR until > ?').all(d.now()) as { user_id: string }[]).map((r) => r.user_id));
  };
  /** Classement complet d'une semaine (comptes encore existants et non suspendus, au moins un point). */
  const standings = (week: string) => {
    const out = banned();
    return swSort((db.prepare(`SELECT s.user_id, u.username, s.points, s.wins, s.last_at FROM solo_week s JOIN users u ON u.id = s.user_id
      WHERE s.week = ? AND s.points > 0`).all(week) as unknown as Row[]).filter((r) => !out.has(r.user_id)).map((r) => ({ ...r, lastAt: r.last_at })));
  };

  /**
   * Victoire contre l'ordinateur vérifiée par le serveur. Renvoie les points gagnés (0 au-delà du plafond
   * du jour) et le total de la semaine ; null pour une défaite ou une erreur.
   */
  function record(userId: string, o: { game: SoloWeekGame; won: boolean; level: string | null | undefined; opponents: number; big?: boolean }): { gained: number; points: number; theme?: WeeklyThemeId } | null {
    if (!o.won) return null;
    try {
      rollWeeks();
      const t = d.now();
      const day = dayOf(t), week = weekOf(t);
      return tx(() => {
        const used = (db.prepare('SELECT points FROM solo_week_day WHERE day = ? AND user_id = ?').get(day, userId) as { points: number } | undefined)?.points ?? 0;
        // Thème de la semaine (shared/weekly-theme.ts) : points en plus, AVANT le plafond du jour.
        const base = swPoints(o.level, o.opponents);
        const theme = themeBonus(day, { game: o.game, level: o.level, opponents: o.opponents, big: o.big });
        const gained = Math.max(0, Math.min(base + (theme?.bonus ?? 0), SW_DAILY_CAP - used));
        if (gained) db.prepare(`INSERT INTO solo_week_day (day, user_id, points) VALUES (?, ?, ?)
          ON CONFLICT(day, user_id) DO UPDATE SET points = points + excluded.points`).run(day, userId, gained);
        // Une victoire au-delà du plafond compte quand même comme victoire (départage), sans points.
        db.prepare(`INSERT INTO solo_week (week, user_id, points, wins, last_at) VALUES (?, ?, ?, 1, ?)
          ON CONFLICT(week, user_id) DO UPDATE SET points = points + excluded.points, wins = wins + 1, last_at = CASE WHEN excluded.points > 0 THEN excluded.last_at ELSE last_at END`)
          .run(week, userId, gained, t);
        const points = (db.prepare('SELECT points FROM solo_week WHERE week = ? AND user_id = ?').get(week, userId) as { points: number }).points;
        // Le bonus n'est annoncé que s'il a vraiment rapporté quelque chose (plafond du jour compris).
        return { gained, points, ...(theme && gained > base ? { theme: theme.id } : {}) };
      });
    } catch (e) { console.warn('[solo-week]', e); return null; }
  }

  /** Clôture des semaines passées : podium récompensé une seule fois (sûr au redémarrage). */
  function rollWeeks(): { week: string; userId: string; rank: number; coins: number }[] {
    const cur = weekOf();
    if (d.store.getMeta('solo_week_rolled') === cur) return [];
    const done: { week: string; userId: string; rank: number; coins: number }[] = [];
    const weeks = (db.prepare('SELECT DISTINCT week FROM solo_week WHERE week < ? ORDER BY week').all(cur) as { week: string }[]).map((r) => r.week);
    const last = d.store.getMeta('solo_week_rolled');
    for (const week of weeks) {
      if (last && week < last) continue;
      const rows = standings(week);
      const paid = rows.length >= SW_MIN_PLAYERS;
      rows.slice(0, SW_PRIZES.length).forEach((r, i) => {
        const coins = paid ? SW_PRIZES[i] : 0;
        const fresh = tx(() => {
          const ins = db.prepare('INSERT OR IGNORE INTO solo_week_podium (week, rank, user_id, name, points, coins, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(week, i + 1, r.user_id, r.username, r.points, coins, d.now());
          if (!Number(ins.changes)) return false;
          const u = d.store.userById(r.user_id);
          if (u && coins) { const p = adjustCoins(d.store.profileOf(u), coins); if (p) d.store.saveProfile(u.id, p); }
          return true;
        });
        if (fresh) {
          done.push({ week, userId: r.user_id, rank: i + 1, coins });
          // Textes traduits pour le joueur par shared/i18n/zones/clubs-server.ts.
          const place = i === 0 ? '1re' : `${i + 1}e`;
          const pts = `${r.points} point${r.points > 1 ? 's' : ''}`;
          d.push(r.user_id, 'Classement solo de la semaine', coins ? `Podium : ${place} place avec ${pts}, ${coins} pièces pour vous.` : `Podium : ${place} place avec ${pts}.`, '/?classement-solo=1');
        }
      });
    }
    // Vieilles semaines et vieux jours : plus utiles.
    const old = dayOf(d.now() - 56 * 86400_000);
    db.prepare('DELETE FROM solo_week WHERE week < ?').run(weekKey(old));
    db.prepare('DELETE FROM solo_week_day WHERE day < ?').run(dayOf(d.now() - 3 * 86400_000));
    d.store.setMeta('solo_week_rolled', cur);
    return done;
  }
  const timer = d.rollEveryMs === 0 ? null : setInterval(() => { try { rollWeeks(); } catch (e) { console.warn('[solo-week] clôture', e); } }, d.rollEveryMs ?? 10 * 60_000);
  timer?.unref?.();

  /** Tableau vu par `u` (ou par un invité si `u` est absent). */
  function board(u: UserRow | undefined): SoloWeekBoard {
    rollWeeks();
    const week = weekOf();
    const rows = standings(week);
    const friendIds = new Set(u ? d.store.friendsOf(u.id).map((f) => f.id) : []);
    const view = (r: (typeof rows)[number], i: number): SoloWeekRow => ({
      rank: i + 1, username: r.username, points: r.points, wins: r.wins,
      ...(u && r.user_id === u.id ? { me: true } : {}), ...(friendIds.has(r.user_id) ? { friend: true } : {}),
    });
    const ranked = rows.map(view);
    const myIdx = u ? rows.findIndex((r) => r.user_id === u.id) : -1;
    const mine = u ? db.prepare('SELECT points, wins FROM solo_week WHERE week = ? AND user_id = ?').get(week, u.id) as { points: number; wins: number } | undefined : undefined;
    const todayPts = u ? (db.prepare('SELECT points FROM solo_week_day WHERE day = ? AND user_id = ?').get(dayOf(), u.id) as { points: number } | undefined)?.points ?? 0 : 0;
    const prev = weekKey(dayOf(Date.parse(`${week}T12:00:00Z`) - 3 * 86400_000));
    const last = (db.prepare('SELECT rank, name, points, coins FROM solo_week_podium WHERE week = ? ORDER BY rank').all(prev) as { rank: number; name: string; points: number; coins: number }[])
      .map((r) => ({ rank: r.rank, username: r.name, points: r.points, coins: r.coins }));
    return {
      week, endsAt: weekEndsAt(week), theme: weeklyTheme(dayOf())?.id ?? null,
      top: ranked.slice(0, SW_TOP),
      friends: u && friendIds.size ? ranked.filter((r) => r.me || r.friend) : [],
      me: u ? { rank: myIdx >= 0 ? myIdx + 1 : null, points: mine?.points ?? 0, wins: mine?.wins ?? 0, today: todayPts } : null,
      players: rows.length,
      last,
    };
  }

  return { record, rollWeeks, board };
}
