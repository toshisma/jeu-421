/**
 * Administration : statistiques des 4 jeux (server/games-stats.ts, GET /api/admin/games).
 * Base vide sans plantage, accès refusé aux joueurs, et chaque partie terminée (solo et en ligne, comptes
 * et invités) apparaît dans les chiffres du jour du bon jeu. Vrais échanges avec le serveur.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { brusselsDay } from '../server/stats';
import { gamesReport, kind421, variant421 } from '../server/games-stats';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', accounts: { minSoloMs: 100, authAttempts: 1000 }, stats: { adminUsers: ['Gerant'] },
    turnTimeoutMs: 60_000, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, disconnectGraceMs: 100,
    dm: { decisionMs: 30, autoplayMs: 5, animMs: 0, disconnectMs: 100 },
    pm: { decisionMs: 30, autoplayMs: 5, animMs: 0, disconnectMs: 100 },
  });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

const api = async (path: string, body?: object, token?: string, method?: string) => {
  const r = await fetch(`${base}/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, ...(await r.json()) };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 30_000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(20); } }
let admin = '';
const report = async () => api('/admin/games?fresh=1', undefined, admin);

describe('statistiques de tous les jeux (administration)', () => {
  it('base vide : rapport complet, sans plantage ; accès réservé', async () => {
    const empty = gamesReport(srv.store);
    expect(empty.days).toHaveLength(30);
    for (const g of ['421', 'courtisan', 'cf', 'poker'] as const) expect(empty.per[g]).toMatchObject({ today: 0, d30: 0, players7: 0, medianS: null, onlineShare: null });
    expect(empty.who.accounts).toBe(0);
    expect((await api('/admin/games')).status).toBe(403);
    const j = await api('/register', { username: 'Joueuse', password: 'motdepasse1' });
    expect((await api('/admin/games', undefined, j.token)).status).toBe(403);
    const a = await api('/register', { username: 'Gerant', password: 'motdepasse1' });
    admin = a.token;
    const r = await report();
    expect(r.ok).toBe(true);
    expect(r.per.poker.since.all).toBe(brusselsDay(Date.now()));
    expect(r.details.courtisan.groschen.circulation).toBeGreaterThanOrEqual(0);
  });

  it('variantes et genres du 421', () => {
    expect(variant421({ variant: 'manches', rounds: 1 })).toBe('mort-subite');
    expect(variant421({ variant: 'classique', turnSeconds: 10 })).toBe('blitz');
    expect(variant421({ variant: 'decharge' })).toBe('decharge');
    expect(variant421(null)).toBeNull();
    expect(kind421(null)).toBe('libre');
    expect(kind421('tdc:petit-zinc')).toBe('tdc:petit-zinc');
    expect(kind421('baron')).toBe('patron');
  });

  it('parties solo terminées (comptes et invités) : comptées dans le bon jeu', async () => {
    const u = await api('/register', { username: 'Soliste', password: 'motdepasse1' });
    // 421 compte + invité
    const g1 = await api('/solo/start', {}, u.token);
    const s1 = await api('/stats/solo/start', {});
    // Courtisan et Poker menteur : compte
    const d = await api('/dixmille/start', {}, u.token);
    const p = await api('/poker/start', {}, u.token);
    // Courtisan et Poker menteur : invités (jeton anonyme)
    const gd = await api('/stats/guest/start', { game: 'courtisan', setup: { level: 'fouine', target: 4000, bots: ['gege'] } });
    const gp = await api('/stats/guest/start', { game: 'poker' });
    expect((await api('/stats/guest/start', { game: 'echecs' })).status).toBe(400);
    expect((await api('/stats/guest/end', { token: gd.token, won: true })).status).toBe(400); // trop tôt
    // Partie commencée mais jamais finie : comptée comme commencée seulement (un compte n'a que 3 parties ouvertes).
    await api('/stats/guest/start', { game: 'poker' });
    await wait(150);
    const e1 = await api('/solo/end', { gameToken: g1.gameToken, won: false, rounds: 4, opponents: 2 }, u.token);
    expect(e1, JSON.stringify(e1).slice(0, 300)).toMatchObject({ ok: true });
    expect((await api('/stats/solo/end', { token: s1.token, won: true, opponents: 1, device: 'appareil-ZZZZ' })).ok).toBe(true);
    expect((await api('/dixmille/end', { gameToken: d.gameToken, won: true, place: 1, opponents: 2, level: 'fouine' }, u.token)).ok).toBe(true);
    expect((await api('/poker/end', { gameToken: p.gameToken, won: false, place: 2, opponents: 1, level: 'habitue' }, u.token)).ok).toBe(true);
    expect((await api('/stats/guest/end', { token: gd.token, won: true, device: 'appareil-YYYY' })).ok).toBe(true);
    expect((await api('/stats/guest/end', { token: gp.token, won: false, device: 'appareil-YYYY' })).ok).toBe(true);
    expect((await api('/stats/guest/end', { token: gp.token, won: false })).status).toBe(400); // pas deux fois
    const r = await report();
    expect(r.per['421']).toMatchObject({ today: 2, solo30: 2, online30: 0, players7: 2, accounts7: 1 });
    expect(r.per.courtisan).toMatchObject({ today: 2, solo30: 2, players7: 2, accounts7: 1 });
    expect(r.per.poker).toMatchObject({ today: 2, solo30: 2, players7: 2, accounts7: 1 });
    expect(r.per.courtisan.medianS).not.toBeNull();
    const today = r.days[29];
    expect(today).toMatchObject({ day: brusselsDay(Date.now()), '421_solo': 2, courtisan_solo: 2, poker_solo: 2, cf_solo: 0 });
    expect(r.details.courtisan.targets).toEqual(expect.arrayContaining([{ k: '4000', n: 1 }]));
    expect(r.details.poker.starts).toEqual({ compte: 1, invite: 2 });
    expect(r.details['421'].kinds).toEqual([{ k: 'libre', n: 1 }]);
    // Qui joue à quoi : le compte a joué aux trois jeux.
    expect(r.who.perGame).toMatchObject({ '421': 1, courtisan: 1, poker: 1, cf: 0 });
    expect(r.who.gamesPerAccount.find((x: { n: number }) => x.n === 3).accounts).toBe(1);
  }, 20_000);

  it('Coups Fourrés : partie notée par ses statistiques existantes, reprise par jeu', async () => {
    const u = srv.store.userByName('Soliste')!;
    srv.cfStats.recordGame({ mode: 'bot', level: 'habitue', players: 2, rounds: 3, durationMs: 300_000, firstLeaderWon: null, humans: [{ userId: u.id, won: true, deck: {}, plays: {} }] });
    srv.cfStats.recordGame({ mode: 'classee', players: 2, rounds: 4, durationMs: 400_000, firstLeaderWon: true, humans: [{ userId: u.id, won: false, deck: {}, plays: {} }] });
    const r = await report();
    expect(r.per.cf).toMatchObject({ today: 2, solo30: 1, online30: 1, accounts7: 1, medianS: 350 });
    expect(r.who.perGame.cf).toBe(1);
  });

  it('parties en ligne terminées : 421, Courtisan, Poker menteur', async () => {
    type C = { s: Socket };
    const mk = (ns = '') => new Promise<C>((res) => { const c = { s: connect(`${base}${ns}`, { transports: ['websocket'], forceNew: true }) }; c.s.on('connect', () => res(c)); });
    const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const before = (await report()).per;
    const v = await api('/register', { username: 'Enligne', password: 'motdepasse1' });

    // 421 : deux joueurs partent, le serveur finit la partie.
    const a = await mk(), b = await mk();
    const r = await emit(a, 'room:create', { name: 'Alice', auth: v.token, config: { variant: 'manches', rounds: 2, turnSeconds: 0 }, table: { stake: 0 } });
    expect((await emit(b, 'room:join', { code: r.code, name: 'Bob' })).ok).toBe(true);
    await emit(b, 'room:ready', { ready: true });
    expect((await emit(a, 'room:start')).ok).toBe(true);
    await until(() => !!srv.rooms.get(r.code)?.game);
    a.s.disconnect(); b.s.disconnect();
    await until(() => srv.rooms.get(r.code)?.game?.phase === 'fini');

    // Courtisan et Poker menteur : deux joueurs lancent la partie, l'un quitte, le serveur la finit.
    const stay: C[] = [];
    for (const ns of ['/dixmille', '/poker']) {
      const x = await mk(ns), y = await mk(ns);
      const cr = await emit(x, 'table:create', { name: 'Hôte', auth: v.token, target: 2000, options: { lives: 3 } });
      expect(cr, JSON.stringify(cr)).toMatchObject({ ok: true });
      expect((await emit(y, 'table:join', { code: cr.code, name: 'Invité' })).ok).toBe(true);
      await emit(y, 'table:ready', { ready: true });
      const st = await emit(x, 'table:start');
      expect(st, ns + JSON.stringify(st)).toMatchObject({ ok: true });
      // L'hôte part (abandon) ; l'autre reste mais ne joue pas : le serveur joue pour tous à l'expiration du temps.
      await emit(x, 'table:leave');
      x.s.disconnect();
      stay.push(y);
    }
    let rep = await report();
    const t0 = Date.now();
    while ((rep.per.courtisan.online30 < before.courtisan.online30 + 1 || rep.per.poker.online30 < before.poker.online30 + 1) && Date.now() - t0 < 90_000) { await wait(200); rep = await report(); }
    expect(rep.per['421'].online30).toBe(before['421'].online30 + 1);
    expect(rep.per.courtisan.online30).toBe(before.courtisan.online30 + 1);
    expect(rep.per.poker.online30).toBe(before.poker.online30 + 1);
    expect(rep.days[29].courtisan_online).toBe(1);
    expect(rep.days[29].poker_online).toBe(1);
    expect(rep.details.poker.lives).toEqual(expect.arrayContaining([{ k: '3 vies', n: 1 }]));
    expect(rep.details.poker.abandoned).toBe(1);
    for (const y of stay) y.s.disconnect();
    expect(rep.details['421'].variants).toEqual(expect.arrayContaining([{ k: 'manches', n: 1 }]));
    expect(rep.details['421'].kinds).toEqual(expect.arrayContaining([{ k: 'salon', n: 1 }]));
    expect(rep.who.perGame.courtisan).toBe(2); // Soliste (solo) + Enligne (en ligne)
  }, 120_000);

  it('compte supprimé : ses parties restent comptées, sans lien avec lui', async () => {
    const u = srv.store.userByName('Soliste')!;
    const login = await api('/login', { username: 'Soliste', password: 'motdepasse1' });
    expect((await api('/me', { password: 'motdepasse1' }, login.token, 'DELETE')).ok).toBe(true);
    const n = (srv.store.sqlite.prepare('SELECT COUNT(*) AS n FROM game_run_players WHERE user_id = ?').get(u.id) as { n: number }).n;
    expect(n).toBe(0);
    const r = await report();
    expect(r.per.courtisan.d30).toBeGreaterThanOrEqual(3);
  });
});
