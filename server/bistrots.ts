/**
 * Les bistrots entre amis : petits clubs privés (comptes seulement), classement de la semaine,
 * champion du lundi, mur d'annonces automatiques (pas de tchat libre : rien de plus à modérer).
 * Règles et barème : shared/bistrots.ts. Le serveur fait foi : les points viennent uniquement des
 * parties qu'il a lui-même arbitrées (recordGame / tournamentWin, appelés par les serveurs de jeu).
 *
 * Tables (créées ici, additives) : bistrots, bistrot_members, bistrot_kicked, bistrot_invites,
 * bistrot_points, bistrot_pairs, bistrot_tourneys, bistrot_wall, bistrot_reacts, bistrot_champions.
 *
 * Champion du lundi : une ligne par (bistrot, semaine) dans bistrot_champions (clé primaire) ; la
 * récompense et l'annonce ne partent que si l'insertion a réellement eu lieu, donc une seule fois même
 * si le serveur redémarre au milieu.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import type { Store, UserRow } from './db';
import { adjustCoins } from '../shared/progress/profile';
import { today } from '../shared/progress/quests';
import { weekKey } from '../shared/progress/boss';
import {
  BISTROT_CODE_ALPHABET, BISTROT_CODE_LEN, BISTROT_CREATES_PER_DAY, BISTROT_MAX_MEMBERS, BISTROTS_PER_PLAYER, CHAMPION_COINS, CHAMPION_MIN_ACTIVE,
  PAIR_DAILY_CAP, POINTS_TOURNEY, TOURNEY_DAILY_CAP, bistrotNameProblem, cleanBistrotCode, gamePoints, isBistrotReaction, rankRows, tidyBistrotName,
  type BistrotGame, type WallKind,
} from '../shared/bistrots';

export interface BistrotsDeps {
  store: Store;
  userFromToken: (t: unknown) => UserRow | undefined;
  /** Équipe de modération (admins et modérateurs). */
  isStaff: (u: UserRow | undefined) => boolean;
  push: (userId: string, title: string, body: string, url?: string) => void;
  log?: (by: string, action: string, target: UserRow | null, details: string) => void;
  now?: () => number;
  /** Clôture des semaines : vérifiée régulièrement (0 = jamais, pour les tests). */
  rollEveryMs?: number;
}

/** Une partie arbitrée par le serveur : les comptes humains assis à la table. */
export interface VerifiedGame {
  game: BistrotGame;
  players: { userId: string; won: boolean; abandoned?: boolean }[];
  /** Gros coup (gagné avec un 4-2-1…) : annoncé sur le mur. */
  feat?: { userId: string; kind: '421' };
}

interface BistrotRow { id: string; code: string; name: string; owner_id: string; created_at: number; closed_at: number | null; closed_by: string | null }
interface WallRow { id: number; bistrot_id: string; kind: WallKind; user_id: string | null; name: string; data: string; at: number }

const WALL_KEEP = 60;

export function createBistrots(d: BistrotsDeps) {
  const db = d.store.sqlite;
  const now = d.now ?? Date.now;
  const router = express.Router();
  db.exec(`
    CREATE TABLE IF NOT EXISTS bistrots (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, closed_at INTEGER, closed_by TEXT
    );
    CREATE TABLE IF NOT EXISTS bistrot_members (
      bistrot_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (bistrot_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_bistrot_members_user ON bistrot_members(user_id);
    CREATE TABLE IF NOT EXISTS bistrot_kicked (bistrot_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (bistrot_id, user_id));
    CREATE TABLE IF NOT EXISTS bistrot_invites (
      bistrot_id TEXT NOT NULL, user_id TEXT NOT NULL, from_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (bistrot_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS bistrot_points (
      week TEXT NOT NULL, user_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (week, user_id)
    );
    CREATE TABLE IF NOT EXISTS bistrot_pairs (day TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, a, b));
    CREATE TABLE IF NOT EXISTS bistrot_tourneys (day TEXT NOT NULL, user_id TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, user_id));
    CREATE TABLE IF NOT EXISTS bistrot_wall (
      id INTEGER PRIMARY KEY AUTOINCREMENT, bistrot_id TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT, name TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bistrot_wall ON bistrot_wall(bistrot_id, id);
    CREATE TABLE IF NOT EXISTS bistrot_reacts (wall_id INTEGER NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY (wall_id, user_id));
    CREATE TABLE IF NOT EXISTS bistrot_champions (
      bistrot_id TEXT NOT NULL, week TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, points INTEGER NOT NULL, coins INTEGER NOT NULL,
      at INTEGER NOT NULL, PRIMARY KEY (bistrot_id, week)
    );
  `);

  const dayOf = (t = now()) => today(new Date(t));
  const weekOf = (t = now()) => weekKey(dayOf(t));
  const tx = <T>(f: () => T): T => {
    db.exec('BEGIN');
    try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  // --- Requêtes ----------------------------------------------------------------------------------
  const byId = (id: unknown) => (typeof id === 'string' && id.length <= 40
    ? db.prepare('SELECT * FROM bistrots WHERE id = ? AND closed_at IS NULL').get(id) as BistrotRow | undefined : undefined);
  const byCode = (code: string) => db.prepare('SELECT * FROM bistrots WHERE code = ? AND closed_at IS NULL').get(code) as BistrotRow | undefined;
  /** Membres dont le compte existe encore (un compte supprimé disparaît de lui-même). */
  const members = (bid: string) => db.prepare(`SELECT m.user_id AS id, u.username, m.joined_at FROM bistrot_members m JOIN users u ON u.id = m.user_id
    WHERE m.bistrot_id = ? ORDER BY m.joined_at`).all(bid) as { id: string; username: string; joined_at: number }[];
  const isMember = (bid: string, uid: string) => !!db.prepare('SELECT 1 FROM bistrot_members WHERE bistrot_id = ? AND user_id = ?').get(bid, uid);
  const mine = (uid: string) => db.prepare(`SELECT b.* FROM bistrot_members m JOIN bistrots b ON b.id = m.bistrot_id
    WHERE m.user_id = ? AND b.closed_at IS NULL ORDER BY m.joined_at`).all(uid) as unknown as BistrotRow[];
  const bistrotsOf = (uid: string) => db.prepare(`SELECT b.id FROM bistrot_members m JOIN bistrots b ON b.id = m.bistrot_id
    WHERE m.user_id = ? AND b.closed_at IS NULL`).all(uid) as { id: string }[];
  const pointsOf = (week: string, ids: string[]) => {
    const out = new Map<string, { points: number; games: number; wins: number }>();
    if (!ids.length) return out;
    const rows = db.prepare(`SELECT user_id, points, games, wins FROM bistrot_points WHERE week = ? AND user_id IN (${ids.map(() => '?').join(',')})`)
      .all(week, ...ids) as { user_id: string; points: number; games: number; wins: number }[];
    for (const r of rows) out.set(r.user_id, r);
    return out;
  };
  const standings = (bid: string, week: string) => {
    const ms = members(bid);
    const pts = pointsOf(week, ms.map((m) => m.id));
    return rankRows(ms.map((m) => ({ id: m.id, username: m.username, ...(pts.get(m.id) ?? { points: 0, games: 0, wins: 0 }) })));
  };
  const lastChampion = (bid: string) => db.prepare('SELECT * FROM bistrot_champions WHERE bistrot_id = ? ORDER BY week DESC LIMIT 1').get(bid) as
    { user_id: string; name: string; week: string; points: number } | undefined;

  function wall(bid: string, kind: WallKind, user: { id: string; username: string } | null, data: Record<string, unknown> = {}) {
    db.prepare('INSERT INTO bistrot_wall (bistrot_id, kind, user_id, name, data, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(bid, kind, user?.id ?? null, user?.username ?? '', JSON.stringify(data), now());
    const old = db.prepare('SELECT id FROM bistrot_wall WHERE bistrot_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(bid, WALL_KEEP) as { id: number }[];
    for (const o of old) { db.prepare('DELETE FROM bistrot_reacts WHERE wall_id = ?').run(o.id); db.prepare('DELETE FROM bistrot_wall WHERE id = ?').run(o.id); }
  }
  const newCode = () => {
    for (;;) {
      const c = Array.from({ length: BISTROT_CODE_LEN }, () => BISTROT_CODE_ALPHABET[randomInt(BISTROT_CODE_ALPHABET.length)]).join('');
      if (!db.prepare('SELECT 1 FROM bistrots WHERE code = ?').get(c)) return c;
    }
  };
  function close(b: BistrotRow, by: string) {
    db.prepare('UPDATE bistrots SET closed_at = ?, closed_by = ? WHERE id = ?').run(now(), by, b.id);
    db.prepare('DELETE FROM bistrot_members WHERE bistrot_id = ?').run(b.id);
    db.prepare('DELETE FROM bistrot_invites WHERE bistrot_id = ?').run(b.id);
  }
  /** Départ d'un membre : le patron passe au plus ancien ; plus personne : le bistrot ferme. */
  function removeMember(b: BistrotRow, uid: string) {
    db.prepare('DELETE FROM bistrot_members WHERE bistrot_id = ? AND user_id = ?').run(b.id, uid);
    repairOwner(b);
  }
  function repairOwner(b: BistrotRow) {
    const rest = members(b.id);
    if (!rest.length) { close(b, 'vide'); return; }
    if (!rest.some((m) => m.id === b.owner_id)) {
      db.prepare('UPDATE bistrots SET owner_id = ? WHERE id = ?').run(rest[0].id, b.id);
      wall(b.id, 'patron', rest[0]);
    }
  }
  const join = (b: BistrotRow, u: UserRow) => {
    db.prepare('INSERT OR IGNORE INTO bistrot_members (bistrot_id, user_id, joined_at) VALUES (?, ?, ?)').run(b.id, u.id, now());
    db.prepare('DELETE FROM bistrot_invites WHERE bistrot_id = ? AND user_id = ?').run(b.id, u.id);
    db.prepare('DELETE FROM bistrot_kicked WHERE bistrot_id = ? AND user_id = ?').run(b.id, u.id);
  };

  // --- Points (appelé par les serveurs de jeu) ----------------------------------------------------
  function addPoints(uid: string, points: number, won: boolean, game: boolean) {
    db.prepare(`INSERT INTO bistrot_points (week, user_id, points, games, wins) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(week, user_id) DO UPDATE SET points = points + excluded.points, games = games + excluded.games, wins = wins + excluded.wins`)
      .run(weekOf(), uid, points, game ? 1 : 0, won ? 1 : 0);
  }
  const pairKey = (a: string, b: string) => (a < b ? [a, b] : [b, a]);
  const pairCount = (day: string, a: string, b: string) =>
    (db.prepare('SELECT n FROM bistrot_pairs WHERE day = ? AND a = ? AND b = ?').get(day, ...pairKey(a, b)) as { n: number } | undefined)?.n ?? 0;

  /**
   * Partie vérifiée : 1 point par joueur allé au bout, +2 au gagnant. Au moins deux comptes différents.
   * Une partie compte pour un joueur s'il lui reste au moins un adversaire avec qui le plafond du jour
   * (PAIR_DAILY_CAP parties) n'est pas atteint. Renvoie les points donnés (tests).
   */
  function recordGame(g: VerifiedGame): Map<string, number> {
    const given = new Map<string, number>();
    try {
      const seen = new Set<string>();
      const ps = g.players.filter((p) => p.userId && !seen.has(p.userId) && seen.add(p.userId));
      if (ps.length < 2) return given;
      rollWeeks();
      const day = dayOf();
      tx(() => {
        const counts = ps.map((p) => ps.some((o) => o.userId !== p.userId && pairCount(day, p.userId, o.userId) < PAIR_DAILY_CAP));
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
          db.prepare(`INSERT INTO bistrot_pairs (day, a, b, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, a, b) DO UPDATE SET n = n + 1`)
            .run(day, ...pairKey(ps[i].userId, ps[j].userId));
        }
        ps.forEach((p, i) => {
          if (p.abandoned || !counts[i]) return;
          const pts = gamePoints(p.won);
          addPoints(p.userId, pts, p.won, true);
          given.set(p.userId, pts);
        });
        // Mur : les victoires (et les gros coups) des membres.
        for (const p of ps) {
          if (!p.won || p.abandoned || !given.has(p.userId)) continue;
          const u = d.store.userById(p.userId);
          if (!u) continue;
          const feat = g.feat?.userId === p.userId;
          for (const b of bistrotsOf(p.userId)) wall(b.id, feat ? 'coup' : 'victoire', u, { game: g.game, players: ps.length, points: given.get(p.userId) });
        }
        // Vieux compteurs : seulement ceux du jour servent.
        db.prepare('DELETE FROM bistrot_pairs WHERE day < ?').run(day);
      });
    } catch (e) { console.warn('[bistrots] partie', e); }
    return given;
  }
  /** Tournoi gagné (au moins deux comptes inscrits) : bonus, au plus TOURNEY_DAILY_CAP par jour. */
  function tournamentWin(userId: string, humans: number, game: '421' | 'cf') {
    try {
      if (humans < 2) return 0;
      const day = dayOf();
      const n = (db.prepare('SELECT n FROM bistrot_tourneys WHERE day = ? AND user_id = ?').get(day, userId) as { n: number } | undefined)?.n ?? 0;
      if (n >= TOURNEY_DAILY_CAP) return 0;
      const u = d.store.userById(userId);
      if (!u) return 0;
      rollWeeks();
      tx(() => {
        db.prepare('INSERT INTO bistrot_tourneys (day, user_id, n) VALUES (?, ?, 1) ON CONFLICT(day, user_id) DO UPDATE SET n = n + 1').run(day, userId);
        db.prepare('DELETE FROM bistrot_tourneys WHERE day < ?').run(day);
        addPoints(userId, POINTS_TOURNEY, false, false);
        for (const b of bistrotsOf(userId)) wall(b.id, 'tournoi', u, { game, players: humans, points: POINTS_TOURNEY });
      });
      return POINTS_TOURNEY;
    } catch (e) { console.warn('[bistrots] tournoi', e); return 0; }
  }

  // --- Champion du lundi ------------------------------------------------------------------------
  /** Clôture des semaines passées (une fois ; sûr au redémarrage). Renvoie les champions désignés maintenant. */
  function rollWeeks(): { bistrotId: string; userId: string; week: string }[] {
    const cur = weekOf();
    if (d.store.getMeta('bistrots_rolled') === cur) return [];
    const done: { bistrotId: string; userId: string; week: string }[] = [];
    const weeks = (db.prepare('SELECT DISTINCT week FROM bistrot_points WHERE week < ? ORDER BY week').all(cur) as { week: string }[]).map((r) => r.week);
    const last = d.store.getMeta('bistrots_rolled');
    const open = db.prepare('SELECT * FROM bistrots WHERE closed_at IS NULL').all() as unknown as BistrotRow[];
    for (const week of weeks) {
      if (last && week < last) continue;
      for (const b of open) {
        const rows = standings(b.id, week).filter((r) => r.points > 0);
        if (!rows.length) continue;
        const top = rows[0];
        const coins = rows.length >= CHAMPION_MIN_ACTIVE ? CHAMPION_COINS : 0;
        const fresh = tx(() => {
          const ins = db.prepare(`INSERT OR IGNORE INTO bistrot_champions (bistrot_id, week, user_id, name, points, coins, at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(b.id, week, top.id, top.username, top.points, coins, now());
          if (!Number(ins.changes)) return false;
          const u = d.store.userById(top.id);
          if (u && coins) { const p = adjustCoins(d.store.profileOf(u), coins); if (p) d.store.saveProfile(u.id, p); }
          wall(b.id, 'champion', { id: top.id, username: top.username }, { points: top.points, week, coins });
          return true;
        });
        if (fresh) {
          done.push({ bistrotId: b.id, userId: top.id, week });
          d.push(top.id, 'Champion de la semaine !', `Vous êtes le champion du bistrot « ${b.name} » avec ${top.points} points.`, '/?bistrot-ouvrir=1');
        }
      }
    }
    // Points de plus de 8 semaines : plus utiles.
    db.prepare('DELETE FROM bistrot_points WHERE week < ?').run(weekKey(dayOf(now() - 56 * 86400_000)));
    d.store.setMeta('bistrots_rolled', cur);
    return done;
  }
  const timer = d.rollEveryMs === 0 ? null : setInterval(() => { try { rollWeeks(); } catch (e) { console.warn('[bistrots] clôture', e); } }, d.rollEveryMs ?? 10 * 60_000);
  timer?.unref?.();

  // --- Routes -------------------------------------------------------------------------------------
  // Application mobile (autre origine) : mêmes en-têtes CORS que les comptes (jeton dans Authorization, pas de cookie).
  router.use(['/bistrots', '/bistrots-apercu'], (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Day');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    next();
  });
  const json = express.json({ limit: '8kb' });
  const fail = (res: Response, status: number, error: string) => { res.status(status).json({ ok: false, error }); };
  const viewer = (req: Request) => { const h = req.headers.authorization ?? ''; return d.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : ''); };
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const u = viewer(req);
    if (!u) return fail(res, 401, 'Créez un compte (gratuit) pour ouvrir ou rejoindre un bistrot.');
    (req as Request & { user: UserRow }).user = u;
    next();
  };
  const me = (req: Request) => (req as Request & { user: UserRow }).user;
  const friends = (a: string, b: string) => d.store.isFriend(a, b) || d.store.isFriend(b, a);
  /** Bistrot dont on est membre (sinon erreur envoyée). */
  const memberOf = (req: Request, res: Response) => {
    const b = byId(req.params.id);
    if (!b || !isMember(b.id, me(req).id)) { fail(res, 404, 'Bistrot introuvable.'); return null; }
    return b;
  };
  const ownerOf = (req: Request, res: Response) => {
    const b = memberOf(req, res);
    if (!b) return null;
    if (b.owner_id !== me(req).id) { fail(res, 403, 'Seul le patron du bistrot peut le faire.'); return null; }
    return b;
  };
  const target = (req: Request, b: BistrotRow) => {
    const name = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const u = name ? d.store.userByName(name) : undefined;
    return u && isMember(b.id, u.id) ? u : undefined;
  };

  function summary(b: BistrotRow, uid: string) {
    const st = standings(b.id, weekOf());
    const i = st.findIndex((r) => r.id === uid);
    const owner = st.find((r) => r.id === b.owner_id);
    return { id: b.id, name: b.name, members: st.length, owner: owner?.username ?? '', rank: i + 1, points: st[i]?.points ?? 0, leader: st[0]?.points ? st[0].username : null };
  }
  function invitesOf(uid: string) {
    return (db.prepare(`SELECT b.id, b.name, u.username AS from_name, i.at FROM bistrot_invites i JOIN bistrots b ON b.id = i.bistrot_id
      LEFT JOIN users u ON u.id = i.from_id WHERE i.user_id = ? AND b.closed_at IS NULL ORDER BY i.at DESC LIMIT 10`).all(uid) as { id: string; name: string; from_name: string | null; at: number }[])
      .map((r) => ({ id: r.id, name: r.name, from: r.from_name ?? '', members: members(r.id).length, at: r.at }));
  }
  function full(b: BistrotRow, u: UserRow) {
    repairOwner(b);
    const fresh = byId(b.id);
    if (!fresh) return null;
    const week = weekOf();
    const champ = lastChampion(b.id);
    // L'insigne de champion vaut pour la semaine qui suit sa victoire.
    const prevWeek = weekKey(dayOf(Date.parse(`${week}T12:00:00Z`) - 3 * 86400_000));
    const badge = champ && champ.week === prevWeek ? champ.user_id : null;
    const st = standings(b.id, week).map((r, i) => ({ rank: i + 1, username: r.username, points: r.points, games: r.games, wins: r.wins,
      owner: r.id === fresh.owner_id, me: r.id === u.id, champion: r.id === badge }));
    const wallRows = db.prepare('SELECT * FROM bistrot_wall WHERE bistrot_id = ? ORDER BY id DESC LIMIT 30').all(b.id) as unknown as WallRow[];
    const reacts = wallRows.length
      ? db.prepare(`SELECT wall_id, user_id, emoji FROM bistrot_reacts WHERE wall_id IN (${wallRows.map(() => '?').join(',')})`).all(...wallRows.map((w) => w.id)) as { wall_id: number; user_id: string; emoji: string }[]
      : [];
    return {
      id: fresh.id, name: fresh.name, code: fresh.code, owner: st.find((r) => r.owner)?.username ?? '', isOwner: fresh.owner_id === u.id,
      week, endsAt: new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10), max: BISTROT_MAX_MEMBERS,
      standings: st,
      champions: (db.prepare('SELECT week, name, points FROM bistrot_champions WHERE bistrot_id = ? ORDER BY week DESC LIMIT 12').all(b.id) as { week: string; name: string; points: number }[]),
      wall: wallRows.map((w) => {
        const mineR = reacts.find((r) => r.wall_id === w.id && r.user_id === u.id)?.emoji ?? null;
        const counts: Record<string, number> = {};
        for (const r of reacts) if (r.wall_id === w.id) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
        return { id: w.id, kind: w.kind, name: w.name, data: JSON.parse(w.data) as Record<string, unknown>, at: w.at, reactions: counts, mine: mineR };
      }),
      staff: d.isStaff(u),
    };
  }

  router.get('/bistrots', auth, (req, res) => {
    rollWeeks();
    const u = me(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, mine: mine(u.id).map((b) => summary(b, u.id)), invites: invitesOf(u.id), max: BISTROTS_PER_PLAYER, maxMembers: BISTROT_MAX_MEMBERS });
  });
  router.post('/bistrots', auth, json, (req, res) => {
    const u = me(req);
    const name = tidyBistrotName(req.body?.name);
    const problem = bistrotNameProblem(name);
    if (problem) return fail(res, 400, problem);
    if (mine(u.id).length >= BISTROTS_PER_PLAYER) return fail(res, 400, `Vous êtes déjà dans ${BISTROTS_PER_PLAYER} bistrots : quittez-en un d’abord.`);
    const recent = (db.prepare('SELECT COUNT(*) AS n FROM bistrots WHERE owner_id = ? AND created_at > ?').get(u.id, now() - 86400_000) as { n: number }).n;
    if (recent >= BISTROT_CREATES_PER_DAY) return fail(res, 429, 'Vous avez ouvert beaucoup de bistrots aujourd’hui : réessayez demain.');
    const b: BistrotRow = { id: randomUUID(), code: newCode(), name, owner_id: u.id, created_at: now(), closed_at: null, closed_by: null };
    tx(() => {
      db.prepare('INSERT INTO bistrots (id, code, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(b.id, b.code, b.name, b.owner_id, b.created_at);
      join(b, u);
      wall(b.id, 'ouvert', u);
    });
    res.json({ ok: true, bistrot: full(b, u) });
  });
  /** Aperçu d'une invitation (lien partagé) : visible aussi sans compte. */
  router.get('/bistrots/apercu/:code', (req, res) => {
    const code = cleanBistrotCode(req.params.code);
    const b = code ? byCode(code) : undefined;
    if (!b) return fail(res, 404, 'Ce bistrot n’existe plus ou le lien a changé.');
    const v = viewer(req);
    const ms = members(b.id);
    res.json({ ok: true, bistrot: { id: b.id, name: b.name, owner: ms.find((m) => m.id === b.owner_id)?.username ?? '', members: ms.length, max: BISTROT_MAX_MEMBERS,
      member: !!v && ms.some((m) => m.id === v.id), staff: d.isStaff(v) } });
  });
  router.post('/bistrots/rejoindre', auth, json, (req, res) => {
    const u = me(req);
    const code = cleanBistrotCode(req.body?.code);
    const b = code ? byCode(code) : typeof req.body?.id === 'string' ? byId(req.body.id) : undefined;
    // Sans code : seulement sur invitation d'un membre.
    if (!b || (!code && !db.prepare('SELECT 1 FROM bistrot_invites WHERE bistrot_id = ? AND user_id = ?').get(b.id, u.id))) return fail(res, 404, 'Ce bistrot n’existe plus ou le lien a changé.');
    if (isMember(b.id, u.id)) return res.json({ ok: true, bistrot: full(b, u) });
    const invited = !!db.prepare('SELECT 1 FROM bistrot_invites WHERE bistrot_id = ? AND user_id = ?').get(b.id, u.id);
    if (!invited && db.prepare('SELECT 1 FROM bistrot_kicked WHERE bistrot_id = ? AND user_id = ?').get(b.id, u.id)) return fail(res, 403, 'Le patron vous a retiré de ce bistrot.');
    if (d.store.isBlocked(b.owner_id, u.id) || d.store.isBlocked(u.id, b.owner_id)) return fail(res, 403, 'Impossible de rejoindre ce bistrot.');
    if (mine(u.id).length >= BISTROTS_PER_PLAYER) return fail(res, 400, `Vous êtes déjà dans ${BISTROTS_PER_PLAYER} bistrots : quittez-en un d’abord.`);
    if (members(b.id).length >= BISTROT_MAX_MEMBERS) return fail(res, 400, `Ce bistrot est complet (${BISTROT_MAX_MEMBERS} membres).`);
    tx(() => { join(b, u); wall(b.id, 'recrue', u); });
    res.json({ ok: true, bistrot: full(b, u) });
  });
  router.post('/bistrots/invitations/:id/refuser', auth, (req, res) => {
    db.prepare('DELETE FROM bistrot_invites WHERE bistrot_id = ? AND user_id = ?').run(String(req.params.id), me(req).id);
    res.json({ ok: true });
  });
  router.get('/bistrots/:id', auth, (req, res) => {
    rollWeeks();
    const b = memberOf(req, res);
    if (!b) return;
    const out = full(b, me(req));
    if (!out) return fail(res, 404, 'Bistrot introuvable.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, bistrot: out });
  });
  router.post('/bistrots/:id/quitter', auth, (req, res) => {
    const b = memberOf(req, res);
    if (!b) return;
    const u = me(req);
    tx(() => { wall(b.id, 'depart', u); removeMember(b, u.id); });
    res.json({ ok: true });
  });
  router.post('/bistrots/:id/inviter', auth, json, (req, res) => {
    const b = memberOf(req, res);
    if (!b) return;
    const u = me(req);
    const t = typeof req.body?.username === 'string' ? d.store.userByName(req.body.username.trim()) : undefined;
    if (!t || !friends(u.id, t.id)) return fail(res, 403, 'Vous ne pouvez inviter que vos amis.');
    if (isMember(b.id, t.id)) return fail(res, 409, 'Cet ami est déjà dans le bistrot.');
    if (d.store.isBlocked(t.id, u.id)) return fail(res, 403, 'Vous ne pouvez inviter que vos amis.');
    if (members(b.id).length >= BISTROT_MAX_MEMBERS) return fail(res, 400, `Ce bistrot est complet (${BISTROT_MAX_MEMBERS} membres).`);
    // Un joueur retiré par le patron ne revient que si le patron lui-même l'invite.
    if (b.owner_id !== u.id && db.prepare('SELECT 1 FROM bistrot_kicked WHERE bistrot_id = ? AND user_id = ?').get(b.id, t.id)) return fail(res, 403, 'Le patron a retiré ce joueur : lui seul peut le réinviter.');
    const already = db.prepare('SELECT 1 FROM bistrot_invites WHERE bistrot_id = ? AND user_id = ?').get(b.id, t.id);
    db.prepare('INSERT OR REPLACE INTO bistrot_invites (bistrot_id, user_id, from_id, at) VALUES (?, ?, ?, ?)').run(b.id, t.id, u.id, now());
    if (!already) d.push(t.id, 'Invitation au bistrot', `${u.username} vous invite au bistrot « ${b.name} ».`, '/?bistrot-ouvrir=1');
    res.json({ ok: true });
  });
  router.post('/bistrots/:id/retirer', auth, json, (req, res) => {
    const b = ownerOf(req, res);
    if (!b) return;
    const t = target(req, b);
    if (!t) return fail(res, 404, 'Ce joueur n’est pas dans le bistrot.');
    if (t.id === b.owner_id) return fail(res, 400, 'Le patron ne peut pas se retirer lui-même : quittez le bistrot ou transmettez-le.');
    tx(() => {
      removeMember(b, t.id);
      db.prepare('INSERT OR REPLACE INTO bistrot_kicked (bistrot_id, user_id, at) VALUES (?, ?, ?)').run(b.id, t.id, now());
      wall(b.id, 'retire', t);
    });
    res.json({ ok: true, bistrot: full(byId(b.id)!, me(req)) });
  });
  router.post('/bistrots/:id/transmettre', auth, json, (req, res) => {
    const b = ownerOf(req, res);
    if (!b) return;
    const t = target(req, b);
    if (!t || t.id === b.owner_id) return fail(res, 404, 'Ce joueur n’est pas dans le bistrot.');
    tx(() => { db.prepare('UPDATE bistrots SET owner_id = ? WHERE id = ?').run(t.id, b.id); wall(b.id, 'patron', t); });
    d.push(t.id, 'Vous êtes le patron !', `Le bistrot « ${b.name} » vous a été transmis.`, '/?bistrot-ouvrir=1');
    res.json({ ok: true, bistrot: full(byId(b.id)!, me(req)) });
  });
  router.post('/bistrots/:id/fermer', auth, (req, res) => {
    const b = ownerOf(req, res);
    if (!b) return;
    close(b, 'patron');
    res.json({ ok: true });
  });
  router.post('/bistrots/:id/nouveau-lien', auth, (req, res) => {
    const b = ownerOf(req, res);
    if (!b) return;
    db.prepare('UPDATE bistrots SET code = ? WHERE id = ?').run(newCode(), b.id);
    res.json({ ok: true, bistrot: full(byId(b.id)!, me(req)) });
  });
  router.post('/bistrots/:id/reaction', auth, json, (req, res) => {
    const b = memberOf(req, res);
    if (!b) return;
    const wid = Number(req.body?.wall);
    const w = Number.isInteger(wid) ? db.prepare('SELECT id FROM bistrot_wall WHERE id = ? AND bistrot_id = ?').get(wid, b.id) : undefined;
    if (!w) return fail(res, 404, 'Annonce introuvable.');
    const emoji = req.body?.emoji;
    const cur = db.prepare('SELECT emoji FROM bistrot_reacts WHERE wall_id = ? AND user_id = ?').get(wid, me(req).id) as { emoji: string } | undefined;
    if (emoji == null || cur?.emoji === emoji) db.prepare('DELETE FROM bistrot_reacts WHERE wall_id = ? AND user_id = ?').run(wid, me(req).id);
    else if (isBistrotReaction(emoji)) db.prepare('INSERT OR REPLACE INTO bistrot_reacts (wall_id, user_id, emoji) VALUES (?, ?, ?)').run(wid, me(req).id, emoji);
    else return fail(res, 400, 'Réaction inconnue');
    res.json({ ok: true, bistrot: full(b, me(req)) });
  });
  /** Signaler le nom d'un bistrot : arrive dans le panel de modération (contre le patron, qui l'a choisi). */
  router.post('/bistrots/:id/signaler', auth, (req, res) => {
    const u = me(req);
    const b = byId(req.params.id);
    if (!b || (!isMember(b.id, u.id) && !d.isStaff(u))) return fail(res, 404, 'Bistrot introuvable.');
    const owner = d.store.userById(b.owner_id);
    if (!owner || owner.id === u.id) return fail(res, 400, 'Signalement impossible.');
    if (!d.store.modDuplicate(u.id, owner.id, `bistrot:${b.id}`)) {
      d.store.modAddReport({ reporter_id: u.id, reporter_name: u.username, target_id: owner.id, target_name: owner.username, kind: 'message', reason: 'profil',
        comment: `Nom de bistrot signalé (fermeture : ouvrir /?bistrot=${b.code})`, created_at: now(),
        msg_ref: `bistrot:${b.id}`, msg_place: 'bistrot', msg_where: `Bistrot « ${b.name} » (code ${b.code})`, msg_text: b.name, msg_at: b.created_at, msg_context: '[]' });
    }
    res.json({ ok: true });
  });
  /** Modération : fermeture d'un bistrot (admins et modérateurs). */
  router.post('/bistrots/:id/fermer-moderation', auth, (req, res) => {
    const u = me(req);
    if (!d.isStaff(u)) return fail(res, 403, 'Accès réservé à l’équipe de modération.');
    const b = byId(req.params.id);
    if (!b) return fail(res, 404, 'Bistrot introuvable.');
    const ids = members(b.id).map((m) => m.id);
    close(b, `moderation:${u.username}`);
    for (const id of ids) d.store.modNotify(id, 'bistrot', `Le bistrot « ${b.name} » a été fermé par la modération.`, now());
    d.log?.(u.username, 'bistrot-ferme', d.store.userById(b.owner_id) ?? null, `Bistrot « ${b.name} » fermé (${ids.length} membres)`);
    res.json({ ok: true });
  });
  /** Accueil : le premier bistrot du joueur (mention discrète). */
  router.get('/bistrots-apercu', auth, (req, res) => {
    const u = me(req);
    const list = mine(u.id).map((b) => summary(b, u.id));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, first: list[0] ?? null, count: list.length, invites: invitesOf(u.id).length });
  });

  return {
    router, recordGame, tournamentWin, rollWeeks,
    close: () => { if (timer) clearInterval(timer); },
  };
}
export type BistrotsApi = ReturnType<typeof createBistrots>;
