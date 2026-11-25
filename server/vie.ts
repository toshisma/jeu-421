/**
 * « La vie du jeu » (types et mode d'emploi des sources : shared/vie.ts).
 *
 * - GET  /api/vie : éléments de la ligne d'actualité de l'accueil (publique, invités compris, cache 10 s) :
 *   le mot du patron, les champions de la semaine passée, la dernière mise à jour, puis les sources ajoutées.
 * - Administration (ADMIN_USERS, vérifié à chaque appel, journalisé dans admin_log) :
 *   GET  /api/admin/vie                 → mot du patron en cours + données de la « Publication de la semaine » ;
 *   POST /api/admin/vie/patron { text, days } → publie (text vide : efface) le mot du patron.
 *
 * Le mot du patron est gardé dans meta (`vie_patron`, JSON { text, until, by, at }) ; montré tel quel à tous.
 * Champions : lus dans les tables des modules qui les désignent (solo_week_podium, bistrot_champions,
 * sched_regs/sched_slots) ; une table absente ne fait que retirer sa part. Comptes suspendus écartés.
 */
import express, { type Request, type Response } from 'express';
import type { Store, UserRow } from './db';
import { today } from '../shared/progress/quests';
import { weekKey } from '../shared/progress/boss';
import { translate } from '../shared/i18n';
import { CHANGELOG_I18N } from '../shared/i18n/zones/changelog';
import {
  PATRON_DAYS, PATRON_MAX_DAYS, VIE_MAX_ITEMS, championsItem, cleanPatron, updateItem,
  type VieChampions, type VieItem, type VieSource,
} from '../shared/vie';
import { gamesReport } from './games-stats';

export interface VieDeps {
  store: Store;
  isAdmin: (u: UserRow | undefined) => boolean;
  userFromToken: (t: unknown) => UserRow | undefined;
  log: (by: string, action: string, target: UserRow | null, details: string) => void;
  now?: () => number;
  /** Sources supplémentaires (shared/vie.ts) ; d'autres s'ajoutent avec `addSource`. */
  sources?: VieSource[];
  cacheMs?: number;
}

export interface PatronMessage { text: string; until: number; by: string; at: number }

/** Sources ajoutées ici seront branchées sur tous les serveurs (une ligne chacune). */
export const VIE_SOURCES: VieSource[] = [];

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export function createVie(d: VieDeps) {
  const db = d.store.sqlite;
  const now = d.now ?? Date.now;
  const sources: VieSource[] = [...VIE_SOURCES, ...(d.sources ?? [])];
  const has = (table: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  const banned = (): Set<string> => (has('admin_bans')
    ? new Set((db.prepare('SELECT user_id FROM admin_bans WHERE until IS NULL OR until > ?').all(now()) as { user_id: string }[]).map((r) => r.user_id))
    : new Set());

  // --- Mot du patron -------------------------------------------------------------------------------
  function patron(): PatronMessage | null {
    const raw = d.store.getMeta('vie_patron');
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as PatronMessage;
      return p && typeof p.text === 'string' && p.text && p.until > now() ? p : null;
    } catch { return null; }
  }
  function setPatron(by: string, text: unknown, days: unknown): PatronMessage | null {
    const t = cleanPatron(text);
    if (!t) { d.store.setMeta('vie_patron', ''); cache = null; return null; }
    const n = Math.min(PATRON_MAX_DAYS, Math.max(1, Math.round(Number(days)) || PATRON_DAYS));
    const p: PatronMessage = { text: t, until: now() + n * 86400_000, by, at: now() };
    d.store.setMeta('vie_patron', JSON.stringify(p));
    cache = null;
    return p;
  }

  // --- Champions de la semaine passée ---------------------------------------------------------------
  /** Semaine passée (lundi « AAAA-MM-JJ ») vue depuis `day`. */
  const lastWeek = (day: string) => weekKey(addDays(weekKey(day), -3));
  function champions(day: string): VieChampions & { week: string; soloPoints?: number } {
    const week = lastWeek(day);
    const out = banned();
    const c: VieChampions & { week: string; soloPoints?: number } = { week };
    try {
      if (has('solo_week_podium')) {
        const r = db.prepare('SELECT user_id, name, points FROM solo_week_podium WHERE week = ? ORDER BY rank').all(week) as { user_id: string; name: string; points: number }[];
        const first = r.find((x) => !out.has(x.user_id));
        if (first) { c.solo = first.name; c.soloPoints = first.points; }
      }
    } catch { /* */ }
    try {
      if (has('bistrot_champions')) {
        const r = db.prepare('SELECT user_id, name FROM bistrot_champions WHERE week = ? ORDER BY points DESC, at ASC').all(week) as { user_id: string; name: string }[];
        c.bistrot = r.find((x) => !out.has(x.user_id))?.name ?? null;
      }
    } catch { /* */ }
    try {
      if (has('sched_regs') && has('sched_slots')) {
        // Identifiant d'un créneau : « AAAA-MM-JJ… » (jour de Bruxelles du tournoi).
        const r = db.prepare(`SELECT r.user_id, u.username AS name, COUNT(*) AS wins, MAX(s.starts_at) AS last FROM sched_regs r
          JOIN sched_slots s ON s.id = r.slot_id JOIN users u ON u.id = r.user_id
          WHERE r.status = 'fini' AND r.place = 0 AND substr(r.slot_id, 1, 10) >= ? AND substr(r.slot_id, 1, 10) <= ?
          GROUP BY r.user_id ORDER BY wins DESC, last DESC`).all(week, addDays(week, 6)) as { user_id: string; name: string; wins: number }[];
        const w = r.find((x) => !out.has(x.user_id));
        c.tournoi = w ? { name: w.name, wins: w.wins } : null;
      }
    } catch { /* */ }
    return c;
  }

  // --- Éléments -------------------------------------------------------------------------------------
  function compute(t = now()): VieItem[] {
    const day = today(new Date(t));
    const items: VieItem[] = [];
    const p = patron();
    if (p) items.push({ id: 'patron', icon: '📣', text: p.text, action: 'none' });
    const ch = championsItem(champions(day), (lang, w) => translate(lang, `vie.ch.${w}`));
    if (ch) items.push(ch);
    const maj = updateItem(day, undefined, CHANGELOG_I18N);
    if (maj) items.push(maj);
    for (const s of sources) {
      try { const it = s(day, t); if (it) items.push(it); } catch (e) { console.warn('[vie] source', e); }
    }
    return items.slice(0, VIE_MAX_ITEMS);
  }
  let cache: { at: number; items: VieItem[] } | null = null;
  function items(): { items: VieItem[]; at: number } {
    const t = now();
    if (!cache || t - cache.at >= (d.cacheMs ?? 10_000) || t < cache.at) cache = { at: t, items: compute(t) };
    return cache;
  }

  // --- Routes ---------------------------------------------------------------------------------------
  const router = express.Router();
  const json = express.json({ limit: '4kb' });
  router.get('/vie', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const c = items();
    res.json({ ok: true, items: c.items, at: c.at });
  });
  const adminOf = (req: Request) => {
    const h = req.headers.authorization ?? '';
    const u = d.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    return d.isAdmin(u) ? u : undefined;
  };
  const deny = (res: Response) => res.status(403).json({ ok: false, error: 'Accès réservé à l’administration.' });
  router.get('/admin/vie', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!adminOf(req)) return deny(res);
    const t = now();
    const day = today(new Date(t));
    let games: Record<string, number> = {};
    try {
      const rep = gamesReport(d.store, t) as { per: Record<string, { d7: number }> };
      games = Object.fromEntries(Object.entries(rep.per).map(([g, v]) => [g, v.d7 ?? 0]));
    } catch (e) { console.warn('[vie] parties', e); }
    res.json({ ok: true, patron: patron(), champions: champions(day), games7: games, items: compute(t) });
  });
  router.post('/admin/vie/patron', json, (req, res) => {
    const u = adminOf(req);
    if (!u) return deny(res);
    const p = setPatron(u.username, req.body?.text, req.body?.days);
    if (p) d.log(u.username, 'vie-patron', null, `Mot du patron jusqu’au ${new Date(p.until).toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels' })} : ${p.text}`);
    else d.log(u.username, 'vie-patron-efface', null, 'Mot du patron effacé');
    res.json({ ok: true, patron: p });
  });

  return {
    router, items, compute, champions, patron, setPatron,
    /** Branche une source supplémentaire (shared/vie.ts). */
    addSource: (s: VieSource) => { sources.push(s); cache = null; },
  };
}
