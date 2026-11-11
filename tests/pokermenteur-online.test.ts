/**
 * Poker menteur en ligne : vrai serveur Socket.IO (espace « /poker »), plusieurs vrais clients.
 * Secret du gobelet (un autre joueur et un spectateur n'en voient jamais les dés), partie complète
 * avec un ordinateur, actions refusées, temps écoulé, départ puis retour, récompenses des comptes,
 * solo déclaré (jeton, durée minimale, plafond).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { currentPlayer, type PmState } from '../shared/pokermenteur/engine';
import { decide } from '../shared/pokermenteur/ai';
import type { PmPublicTable, PmUpdate } from '../shared/pokermenteur/protocol';
import { pokerReward } from '../shared/pokermenteur/reward';
import { rewardFor } from '../shared/progress/profile';

let srv: Awaited<ReturnType<typeof startServer>>;
let url = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', turnTimeoutMs: 60_000, accounts: { minSoloMs: 150, soloDailyCap: 4, authAttempts: 1000 },
    pm: { decisionMs: 60_000, autoplayMs: 5, animMs: 0, disconnectMs: 150, quickFillMs: 100, quickStartMs: 100 },
  });
  url = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

interface Msg { ev: string; state: PmState | null; raw: unknown }
interface C { s: Socket; table: PmPublicTable | null; state: PmState | null; version: number; id: string; token: string; notices: string[]; log: Msg[]; reward: any }
function client(path = '/poker'): Promise<C> {
  return new Promise((resolve) => {
    const c: C = { s: connect(`${url}${path}`, { transports: ['websocket'], forceNew: true }), table: null, state: null, version: 0, id: '', token: '', notices: [], log: [], reward: null };
    c.s.on('table:state', (t: PmPublicTable) => (c.table = t));
    c.s.on('game:state', (m: { version: number; state: PmState } | null) => { c.state = m?.state ?? null; c.version = m?.version ?? 0; c.log.push({ ev: 'game:state', state: c.state, raw: m }); });
    c.s.on('game:update', (u: PmUpdate) => { c.state = u.state; c.version = u.version; c.log.push({ ev: 'game:update', state: u.state, raw: u }); });
    c.s.on('table:notice', (n: { text: string }) => c.notices.push(n.text));
    c.s.on('profile:reward', (r: unknown) => (c.reward = r));
    c.s.on('connect', () => resolve(c));
  });
}
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => {
  const t = setTimeout(() => res({ ok: false, error: 'sans réponse' }), 2000);
  c.s.emit(ev, p, (r: unknown) => { clearTimeout(t); res(r); });
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 5000) {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(5); }
}
async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${url}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
let nameSeq = 0;
async function account() {
  const username = `Menteur${++nameSeq}${Math.floor(Math.random() * 1000)}`;
  const r = await api('/register', { username, password: 'motdepasse1' });
  return { username, token: r.token as string };
}

/** Joue jusqu'au bout : chaque client joue son tour avec SA vue (décision d'un Habitué). */
async function playOut(all: C[], ms = 50_000) {
  const t0 = Date.now();
  while (true) {
    const ref = all.find((c) => c.state)!;
    await until(() => all.every((c) => c.version === ref.version), 3000).catch(() => {});
    const s = ref.state!;
    if (s.phase === 'fini') return s;
    if (Date.now() - t0 > ms) throw new Error('partie trop longue');
    const me = all.find((c) => c.id === currentPlayer(s).id);
    if (!me) { await wait(10); continue; }
    const v = me.version;
    const r = await emit(me, 'game:act', { version: v, action: decide(me.state!, 'habitue') });
    // Le serveur limite chaque connexion à 25 messages par seconde : un vrai joueur ne va pas plus vite.
    await wait(45);
    if (!r.ok) await wait(10);
    else await until(() => me.version > v, 3000);
  }
}

/** Aucun message reçu par `c` ne montre les dés à quelqu'un qui ne tient pas le gobelet. */
function checkSecret(c: C, viewerId: string | null) {
  let seen = 0;
  for (const m of c.log) {
    if (!m.state) continue;
    const s = m.state;
    expect(s.seed).toBe(0);
    const holder = s.players[s.holder]?.id;
    if (viewerId === null || holder !== viewerId || s.phase === 'fini') expect(s.dice).toBeNull();
    else if (s.dice) seen++;
    // Les événements ne portent des dés qu'à la révélation (et ces dés sont alors publics).
    const evs = (m.raw as PmUpdate).events ?? [];
    for (const e of evs) if (e.kind !== 'revelation') expect(JSON.stringify(e)).not.toMatch(/"dice"/);
  }
  return seen;
}

describe('Poker menteur en ligne', () => {
  it('partie complète à 2 joueurs + 1 ordinateur ; un autre joueur et un spectateur ne voient jamais les dés', async () => {
    const a = await client(), b = await client(), spec = await client();
    const cr = await emit(a, 'table:create', { name: 'Alice', avatar: '🦊', options: { lives: 3, noStraights: true }, visibility: 'public' });
    expect(cr.ok).toBe(true);
    a.id = cr.playerId;
    const jr = await emit(b, 'table:join', { code: cr.code.toLowerCase(), name: 'Bob' });
    expect(jr.ok).toBe(true);
    b.id = jr.playerId;
    expect((await emit(b, 'table:addBot', { level: 'fouine' })).ok).toBe(false); // pas l'hôte
    expect((await emit(a, 'table:addBot', { level: 'fouine' })).ok).toBe(true);
    expect((await emit(a, 'table:start')).error).toMatch(/prêts/);
    expect((await emit(b, 'table:ready', { ready: true })).ok).toBe(true);
    expect((await emit(a, 'table:start')).ok).toBe(true);
    await until(() => !!a.state && !!b.state);
    expect(a.state!.options).toEqual({ lives: 3, noStraights: true });
    expect((await emit(spec, 'spectate:join', { code: cr.code, name: 'Curieux' })).ok).toBe(true);
    await until(() => !!spec.state);
    // Hors de son tour, ou action trafiquée : refusé.
    const s0 = a.state!;
    const notMe = [a, b].find((c) => c.id !== currentPlayer(s0).id)!;
    expect((await emit(notMe, 'game:act', { version: notMe.version, action: { type: 'menteur' } })).ok).toBe(false);
    expect((await emit(spec, 'game:act', { version: spec.version, action: { type: 'menteur' } })).error).toMatch(/spectateurs/);
    const end = await playOut([a, b]);
    expect(end.phase).toBe('fini');
    expect(end.winner).toBeTruthy();
    await until(() => spec.state?.phase === 'fini');
    // Chaque joueur a vu SES dés (au moins une fois), jamais ceux des autres ; le spectateur, jamais.
    expect(checkSecret(a, a.id)).toBeGreaterThan(0);
    expect(checkSecret(b, b.id)).toBeGreaterThan(0);
    expect(checkSecret(spec, null)).toBe(0);
    // Les révélations, elles, sont publiques et identiques pour tous.
    const reveals = (c: C) => c.log.flatMap((m) => ((m.raw as PmUpdate).events ?? []).filter((e) => e.kind === 'revelation'));
    expect(reveals(spec).length).toBeGreaterThan(0);
    const bSeen = new Set(reveals(b).map((e) => JSON.stringify(e)));
    for (const e of reveals(spec)) expect(bSeen.has(JSON.stringify(e))).toBe(true);
    for (const c of [a, b, spec]) c.s.disconnect();
  });

  it('annonce trop basse, relance trafiquée, croire après un Poker d’As : refusés', async () => {
    const a = await client(), b = await client();
    const cr = await emit(a, 'table:create', { name: 'Ana' });
    a.id = cr.playerId;
    const jr = await emit(b, 'table:join', { code: cr.code, name: 'Ben' });
    b.id = jr.playerId;
    await emit(b, 'table:ready', { ready: true });
    await emit(a, 'table:start');
    await until(() => !!a.state && !!b.state);
    const first = [a, b].find((c) => c.id === currentPlayer(c.state!).id)!;
    const other = first === a ? b : a;
    expect((await emit(first, 'game:act', { version: first.version, action: { type: 'annoncer', hand: [5, 5, 5, 5] } })).ok).toBe(false);
    expect((await emit(first, 'game:act', { version: first.version, action: { type: 'relancer', pick: [0] } })).ok).toBe(false);
    expect((await emit(first, 'game:act', { version: first.version + 3, action: { type: 'annoncer', hand: [5, 5, 5, 5, 5] } })).ok).toBe(false);
    const v = first.version;
    expect((await emit(first, 'game:act', { version: v, action: { type: 'annoncer', hand: [5, 5, 5, 5, 5] } })).ok).toBe(true);
    await until(() => other.version > v);
    expect((await emit(other, 'game:act', { version: other.version, action: { type: 'croire' } })).error).toMatch(/Poker/);
    expect((await emit(other, 'game:act', { version: other.version, action: { type: 'relancer', pick: [7, 7] } })).ok).toBe(false);
    const v2 = other.version;
    expect((await emit(other, 'game:act', { version: v2, action: { type: 'menteur' } })).ok).toBe(true);
    await until(() => first.version > v2);
    const rv = first.state!.lastReveal!;
    expect(rv.claim).toEqual([5, 5, 5, 5, 5]);
    expect(rv.dice).toHaveLength(5);
    a.s.disconnect(); b.s.disconnect();
  });

  it('départ en pleine partie : le serveur joue à sa place, retour possible avec le jeton', async () => {
    const a = await client(), b = await client();
    const cr = await emit(a, 'table:create', { name: 'Paul' });
    a.id = cr.playerId; a.token = cr.token;
    const jr = await emit(b, 'table:join', { code: cr.code, name: 'Lise' });
    b.id = jr.playerId;
    await emit(b, 'table:ready', { ready: true });
    await emit(a, 'table:start');
    await until(() => !!a.state);
    await emit(a, 'table:leave');
    await until(() => b.notices.some((n) => /quitté la partie/.test(n)));
    const a2 = await client();
    const back = await emit(a2, 'table:join', { code: cr.code, token: cr.token });
    expect(back.ok).toBe(true);
    expect(back.playerId).toBe(a.id);
    a2.id = back.playerId;
    await until(() => !!a2.state);
    const end = await playOut([a2, b]);
    expect(end.phase).toBe('fini');
    a.s.disconnect(); a2.s.disconnect(); b.s.disconnect();
  });

  it('comptes : récompense du serveur, statistiques vérifiées, succès', async () => {
    const u1 = await account(), u2 = await account();
    const a = await client(), b = await client();
    const cr = await emit(a, 'table:create', { name: 'x', auth: u1.token, options: { lives: 3 } });
    a.id = cr.playerId;
    const jr = await emit(b, 'table:join', { code: cr.code, name: 'y', auth: u2.token });
    b.id = jr.playerId;
    await until(() => !!b.table?.members.some((m) => m.id === b.id));
    expect(b.table!.members.find((m) => m.id === b.id)!.name).toBe(u2.username);
    await emit(b, 'table:ready', { ready: true });
    await emit(a, 'table:start');
    await until(() => !!a.state && !!b.state);
    await playOut([a, b]);
    await until(() => !!a.reward && !!b.reward);
    const me1 = (await api('/me', undefined, u1.token)).profile;
    expect(me1.pm.games).toBe(1);
    expect(me1.pm.vGames).toBe(1);
    expect(me1.stats.played).toBe(0); // pas une partie de 421
    const won = me1.pm.wins === 1 ? u1 : u2;
    const meW = (await api('/me', undefined, won.token)).profile;
    expect(meW.pm.onlineWins).toBe(1);
    expect(Object.keys(meW.achievements)).toEqual(expect.arrayContaining(['pm-premiere', 'pm-en-ligne']));
    a.s.disconnect(); b.s.disconnect();
  });

  it('partie rapide : des ordinateurs complètent la table, puis la partie part toute seule', async () => {
    const a = await client();
    const q = await emit(a, 'table:quick', { name: 'Pressé' });
    expect(q.ok).toBe(true);
    a.id = q.playerId;
    await until(() => !!a.state, 3000);
    expect(a.state!.players.length).toBe(3);
    expect(a.table!.members.filter((m) => m.bot).length).toBe(2);
    const end = await playOut([a]);
    expect(end.phase).toBe('fini');
    a.s.disconnect();
  });

  it('présence chez les amis et code reconnu', async () => {
    const u = await account();
    const a = await client();
    const cr = await emit(a, 'table:create', { name: 'z', auth: u.token });
    const r = await api(`/code/${cr.code}`);
    expect(r.kind).toBe('poker');
    const fr = await api('/friends', undefined, u.token);
    expect(fr.friends[0].room).toMatchObject({ code: cr.code, game: 'poker', status: 'salon' });
    a.s.disconnect();
  });
});

describe('Poker menteur : temps écoulé', () => {
  let srv2: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => { srv2 = await startServer({ port: 0, dbPath: ':memory:', turnTimeoutMs: 60_000, pm: { decisionMs: 120, autoplayMs: 5, animMs: 0 } }); });
  afterAll(async () => { await srv2.close(); });
  it('30 s sans décision (ici 120 ms) : le serveur croit, ne relance rien et annonce juste au-dessus', async () => {
    const mk = () => new Promise<C>((resolve) => {
      const c: C = { s: connect(`http://localhost:${srv2.port}/poker`, { transports: ['websocket'], forceNew: true }), table: null, state: null, version: 0, id: '', token: '', notices: [], log: [], reward: null };
      c.s.on('game:state', (m: { version: number; state: PmState } | null) => { c.state = m?.state ?? null; c.version = m?.version ?? 0; });
      c.s.on('game:update', (u: PmUpdate) => { c.state = u.state; c.version = u.version; c.log.push({ ev: 'u', state: u.state, raw: u }); });
      c.s.on('table:notice', (n: { text: string }) => c.notices.push(n.text));
      c.s.on('connect', () => resolve(c));
    });
    const a = await mk(), b = await mk();
    const cr = await emit(a, 'table:create', { name: 'Lent' });
    await emit(b, 'table:join', { code: cr.code, name: 'Lente' });
    await emit(b, 'table:ready', { ready: true });
    await emit(a, 'table:start');
    await until(() => a.log.length >= 4, 4000);
    expect(a.notices.some((n) => /Temps écoulé/.test(n))).toBe(true);
    const kinds = a.log.map((m) => (m.raw as PmUpdate).action);
    expect(kinds.slice(0, 4)).toEqual(['annoncer', 'croire', 'relancer', 'annoncer']);
    a.s.disconnect(); b.s.disconnect();
  });
});

describe('Poker menteur contre l’ordinateur (sur le téléphone)', () => {
  it('barème : jamais plus que le solo du 421', () => {
    const day = '2026-03-10', now = new Date('2026-03-10T10:00:00Z').getTime();
    for (const level of ['debutant', 'habitue', 'fouine'] as const) for (const opponents of [1, 3, 5]) for (const minutes of [2, 8, 30]) {
      const r = pokerReward({ won: true, place: 1, opponents, level, minutes, day, now });
      const solo = rewardFor(true, 10, { mode: 'solo', opponents: Math.min(3, opponents), difficulty: { debutant: 'facile', habitue: 'normal', fouine: 'difficile' }[level] as 'normal', count421: 0, minutes, day, now });
      expect(r.coins).toBeLessThanOrEqual(solo.coins);
      expect(r.xp).toBeLessThanOrEqual(solo.xp);
    }
  });
  it('jeton, durée minimale, usage unique, plafond quotidien, succès vérifiés non débloqués', async () => {
    const u = await account();
    expect((await api('/poker/end', { gameToken: 'x', won: true }, u.token)).status).toBe(400);
    const g = await api('/poker/start', {}, u.token);
    expect((await api('/poker/end', { gameToken: g.gameToken, won: true, opponents: 2, level: 'fouine' }, u.token)).status).toBe(400); // trop tôt
    const g2 = await api('/poker/start', {}, u.token);
    await wait(200);
    const end = await api('/poker/end', { gameToken: g2.gameToken, won: true, place: 1, opponents: 99, level: 'triche' }, u.token);
    expect(end.ok).toBe(true);
    expect(end.reward.coins).toBeLessThanOrEqual(15);
    expect(end.applied.achievementsDone.map((x: { id: string }) => x.id)).toEqual(['pm-premiere']);
    expect(end.applied.profile.pm).toMatchObject({ games: 1, wins: 1, vGames: 0, onlineWins: 0 });
    expect((await api('/poker/end', { gameToken: g2.gameToken, won: true }, u.token)).status).toBe(400);
    // Plafond quotidien des parties contre l'ordinateur (4 dans ce test) partagé avec le solo.
    let capped = false;
    for (let i = 0; i < 5; i++) {
      const t = await api('/poker/start', {}, u.token);
      await wait(160);
      const e = await api('/poker/end', { gameToken: t.gameToken, won: false, place: 2, opponents: 1, level: 'habitue' }, u.token);
      if (e.status === 429) capped = true;
    }
    expect(capped).toBe(true);
  });
});
