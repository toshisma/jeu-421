/**
 * Coups Fourrés : statistiques réelles des cartes, pour l'administration (Sam seulement).
 *
 * Chaque partie réelle terminée (en ligne : classée, défi entre amis, table à code, tournoi ;
 * contre l'ordinateur : seulement les parties rejouées et vérifiées par le serveur) est notée :
 *   cf_stat_games    une ligne par partie (mode, niveau de l'ordinateur, joueurs, manches, durée,
 *                    victoire du premier meneur en duel) ;
 *   cf_stat_players  une ligne par joueur humain (deck, cartes jouées, victoire).
 * Les invités ne sont pas comptés (aucune partie vérifiée). Une partie abandonnée avant la fin de
 * la première manche n'apprend rien sur les cartes : elle n'est pas notée.
 *
 * Route : GET /api/admin/cf/cards?days=7|30|0&mode=tout|classee|amis|bot|tournoi (administrateurs).
 */
import express, { type Request, type Response } from 'express';
import type { Store, UserRow } from './db';
import { cfCardReport, filterModes, type CfStatFilter, type CfStatGame, type CfStatMode, type CfStatRow } from '../shared/cards/stats';

export interface CfStatPlayerInput { userId: string; won: boolean; deck: Record<string, number>; plays: Record<string, number>; firstLeader?: boolean }
export interface CfStatGameInput {
  mode: CfStatMode;
  level?: string | null;
  players: number;
  rounds: number;
  durationMs: number;
  firstLeaderWon: boolean | null;
  humans: CfStatPlayerInput[];
}

const parse = (s: string): Record<string, number> => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const MODES: CfStatMode[] = ['classee', 'ami', 'table', 'bot', 'tournoi'];

export function createCfStats(c: { store: Store; now: () => number; isAdmin?: (u: UserRow | undefined) => boolean; userFromToken?: (t: unknown) => UserRow | undefined }) {
  const db = c.store.sqlite;
  db.exec(`
    CREATE TABLE IF NOT EXISTS cf_stat_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, mode TEXT NOT NULL, level TEXT,
      players INTEGER NOT NULL, rounds INTEGER NOT NULL, duration_ms INTEGER NOT NULL, first_leader_won INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cf_stat_games_at ON cf_stat_games(at);
    CREATE TABLE IF NOT EXISTS cf_stat_players (
      game_id INTEGER NOT NULL, user_id TEXT NOT NULL, won INTEGER NOT NULL, first_leader INTEGER NOT NULL DEFAULT 0,
      deck TEXT NOT NULL, plays TEXT NOT NULL, PRIMARY KEY (game_id, user_id)
    );
  `);
  const insGame = db.prepare('INSERT INTO cf_stat_games (at, mode, level, players, rounds, duration_ms, first_leader_won) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insPlayer = db.prepare('INSERT OR REPLACE INTO cf_stat_players (game_id, user_id, won, first_leader, deck, plays) VALUES (?, ?, ?, ?, ?, ?)');

  /** Note une partie terminée. Renvoie son numéro, ou null si elle n'est pas retenue. */
  function recordGame(g: CfStatGameInput): number | null {
    if (!MODES.includes(g.mode) || !g.humans.length || g.rounds < 1) return null;
    try {
      const r = insGame.run(c.now(), g.mode, g.level ?? null, g.players, g.rounds, Math.max(0, Math.round(g.durationMs)), g.firstLeaderWon === null ? null : g.firstLeaderWon ? 1 : 0);
      const id = Number(r.lastInsertRowid);
      for (const h of g.humans) insPlayer.run(id, h.userId, h.won ? 1 : 0, h.firstLeader ? 1 : 0, JSON.stringify(h.deck), JSON.stringify(h.plays));
      return id;
    } catch (e) {
      console.warn('[cf-stats] partie non notée', e);
      return null;
    }
  }

  /** Rapport pour le tableau de bord : période (jours, 0 = tout) et mode. */
  function report(days: number, filter: CfStatFilter) {
    const since = days > 0 ? c.now() - days * 86_400_000 : 0;
    const modes = filterModes(filter);
    const where = `at >= ?${modes ? ` AND mode IN (${modes.map(() => '?').join(',')})` : ''}`;
    const args = [since, ...(modes ?? [])];
    const games = (db.prepare(`SELECT * FROM cf_stat_games WHERE ${where}`).all(...args) as unknown as
      { id: number; mode: CfStatMode; level: string | null; players: number; rounds: number; duration_ms: number; first_leader_won: number | null }[])
      .map((g): CfStatGame => ({ id: g.id, mode: g.mode, level: g.level, players: g.players, rounds: g.rounds, durationMs: g.duration_ms, firstLeaderWon: g.first_leader_won === null ? null : !!g.first_leader_won }));
    const rows = (db.prepare(`SELECT p.game_id, p.won, p.deck, p.plays, g.mode FROM cf_stat_players p JOIN cf_stat_games g ON g.id = p.game_id WHERE ${where.replace(/\bat\b/, 'g.at').replace(/\bmode\b/, 'g.mode')}`).all(...args) as unknown as
      { game_id: number; won: number; deck: string; plays: string; mode: CfStatMode }[])
      .map((r): CfStatRow => ({ gameId: r.game_id, mode: r.mode, won: !!r.won, deck: parse(r.deck), plays: parse(r.plays) }));
    return { days, mode: filter, ...cfCardReport(games, rows) };
  }

  const router = express.Router();
  if (c.isAdmin && c.userFromToken) {
    const { isAdmin, userFromToken } = c;
    router.get('/admin/cf/cards', (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      const h = req.headers.authorization ?? '';
      const u = userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (!isAdmin(u)) return res.status(403).json({ ok: false, error: 'Accès réservé à l’administration.' });
      const d = Number(req.query.days);
      const days = [7, 30, 90].includes(d) ? d : 0;
      const m = String(req.query.mode ?? 'tout') as CfStatFilter;
      res.json({ ok: true, ...report(days, ['tout', 'classee', 'amis', 'bot', 'tournoi'].includes(m) ? m : 'tout') });
    });
  }
  return { recordGame, report, router };
}
export type CfStatsApi = ReturnType<typeof createCfStats>;
