/** Tournois, tables publiques et mises : logique pure, puis vrai serveur avec de vrais clients. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import type { GameState } from '../shared/engine';
import type { PublicRoom } from '../shared/protocol';
import { prizes, qualifiersOf, roundsFor, sanitizeTable, sanitizeTournament, splitPot, splitTables, type PublicTournament } from '../shared/tournament';

describe('tournois : logique', () => {
  it('répartit en tables équilibrées', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i);
    const t = splitTables(ids, 4);
    expect(t.map((x) => x.length).sort()).toEqual([3, 3, 4]);
    expect(t.flat().sort((a, b) => a - b)).toEqual(ids);
    expect(splitTables([1, 2, 3], 4)).toEqual([[1, 2, 3]]);
    // Jamais de table d'un seul joueur.
    for (let n = 4; n <= 32; n++) for (const ts of [3, 4, 5, 6]) if (n > ts) expect(Math.min(...splitTables(Array.from({ length: n }), ts).map((x) => x.length))).toBeGreaterThanOrEqual(2);
  });
  it('compte les tours et les qualifiés', () => {
    expect(qualifiersOf(4)).toBe(2);
    expect(qualifiersOf(3)).toBe(2);
    expect(roundsFor(4, 4)).toBe(1);
    expect(roundsFor(8, 4)).toBe(2);
    expect(roundsFor(32, 4)).toBe(4);
  });
  it('partage les gains sans perdre une pièce', () => {
    expect(prizes(0, 8, 'podium')).toEqual([]);
    expect(prizes(800, 8, 'winner')).toEqual([800]);
    const p = prizes(250, 10, 'podium');
    expect(p.reduce((a, b) => a + b)).toBe(250);
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(splitPot(101, 2)).toEqual([51, 50]);
  });
  it('borne les réglages venant du client', () => {
    const s = sanitizeTournament({ maxPlayers: 1000, tableSize: 9, stake: 77, payout: 'tout', title: '<b>x</b>'.repeat(20) }, 'T');
    expect(s.maxPlayers).toBe(8);
    expect(s.tableSize).toBe(4);
    expect(s.stake).toBe(0);
    expect(s.payout).toBe('podium');
    expect(s.title.length).toBeLessThanOrEqual(32);
    expect(sanitizeTable({ maxPlayers: 9, visibility: 'public', stake: 50 })).toEqual({ maxPlayers: 6, visibility: 'public', stake: 50 });
  });
});

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 }, turnTimeoutMs: 60_000, disconnectGraceMs: 100,
    autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, tournamentPauseMs: 100, tournamentFullStartMs: 100,
  });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

interface C { s: Socket; room: PublicRoom | null; game: GameState | null; t: PublicTournament | null; profile: any; notices: string[] }
const client = () => new Promise<C>((resolve) => {
  const c: C = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null, game: null, t: null, profile: null, notices: [] };
  c.s.on('room:state', (r: PublicRoom) => (c.room = r));
  c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('game:roll', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('tournament:state', (t: PublicTournament) => (c.t = t));
  c.s.on('profile:update', ({ profile }: { profile: any }) => (c.profile = profile));
  c.s.on('room:notice', (n: { text: string }) => c.notices.push(n.text));
  c.s.on('connect', () => resolve(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 20000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(20); } }
async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return r.json();
}
const quick = { variant: 'manches', rounds: 1, turnSeconds: 0 };

describe('salons publics et mises', () => {
  it('liste les salons publics, refuse les mises sans compte, verse la cagnotte', async () => {
    const a = await api('/register', { username: 'Mise1', password: 'motdepasse1', guestProfile: { coins: 90 } });
    const b = await api('/register', { username: 'Mise2', password: 'motdepasse1', guestProfile: { coins: 90 } });
    expect(a.profile.coins).toBe(90);
    const host = await client(), guest = await client(), anon = await client();
    // Sans compte : pas de mise.
    expect((await emit(anon, 'room:create', { name: 'Anon', table: { stake: 50 } })).ok).toBe(false);
    const created = await emit(host, 'room:create', { name: 'Hôte', auth: a.token, config: quick, table: { visibility: 'public', maxPlayers: 2, stake: 50 } });
    expect(created.ok).toBe(true);
    const list = await api('/lobbies');
    expect(list.lobbies.find((l: any) => l.code === created.code)).toMatchObject({ players: 1, max: 2, stake: 50 });
    expect((await emit(anon, 'room:join', { code: created.code, name: 'Anon' })).ok).toBe(false);
    expect((await emit(guest, 'room:join', { code: created.code, name: 'Invité', auth: b.token })).ok).toBe(true);
    // Complet : il disparaît de la liste.
    expect((await api('/lobbies')).lobbies.some((l: any) => l.code === created.code)).toBe(false);
    await emit(guest, 'room:ready', { ready: true });
    expect((await emit(host, 'room:start')).ok).toBe(true);
    await until(() => host.room?.pot === 100);
    expect(host.profile.coins).toBe(40);
    // Les deux joueurs s'en vont : le serveur termine la partie.
    host.s.disconnect(); guest.s.disconnect();
    await until(() => srv.rooms.get(created.code)?.game?.phase === 'fini');
    await wait(50);
    const ma = await api('/me', undefined, a.token), mb = await api('/me', undefined, b.token);
    // Cagnotte remportée (ou partagée en cas d'égalité aux points).
    expect(ma.profile.stats.potsWon + mb.profile.stats.potsWon).toBeGreaterThanOrEqual(1);
    expect(srv.rooms.get(created.code)!.pot).toBe(0);
    anon.s.disconnect();
  });
});

describe('tournoi', () => {
  it('inscriptions, départ, tables, qualifications, finale et gains', async () => {
    const accts = await Promise.all([0, 1, 2, 3, 4].map((i) => api('/register', { username: `Tour${i}`, password: 'motdepasse1', guestProfile: { coins: 60 } })));
    const cs = await Promise.all(accts.map(() => client()));
    const created = await emit(cs[0], 'tournament:create', {
      name: 'Orga', auth: accts[0].token, settings: { title: 'Coupe du comptoir', maxPlayers: 6, tableSize: 3, stake: 25, payout: 'podium', visibility: 'public', config: quick },
    });
    expect(created.ok).toBe(true);
    expect((await api('/lobbies')).tournaments[0]).toMatchObject({ code: created.code, title: 'Coupe du comptoir', stake: 25 });
    for (let i = 1; i < 5; i++) expect((await emit(cs[i], 'tournament:join', { code: created.code, name: `J${i}`, auth: accts[i].token })).ok).toBe(true);
    await until(() => cs[0].t?.players.length === 5);
    // Pas l'organisateur : refus ; puis départ par l'organisateur.
    expect((await emit(cs[1], 'tournament:start')).ok).toBe(false);
    expect((await emit(cs[0], 'tournament:start')).ok).toBe(true);
    await until(() => cs[0].t?.status === 'en-cours');
    const t0 = cs[0].t!;
    expect(t0.pot).toBe(125);
    expect(t0.rounds[0].tables.map((x) => x.ids.length).sort()).toEqual([2, 3]);
    // Chaque joueur a été installé à sa table.
    await until(() => cs.every((c) => c.room?.tournament === created.code && c.game != null));
    expect(cs[2].profile.coins).toBe(35);
    // Tchat de table pendant le tournoi : reçu par les joueurs de la même table.
    const tb = t0.rounds[0].tables.find((x) => x.ids.length === 3)!;
    const atTable = cs.filter((c) => c.room?.code === tb.code);
    const heard: string[] = [];
    atTable[1].s.on('room:chat', (m: { text: string }) => heard.push(m.text));
    expect((await emit(atTable[0], 'room:chat', { text: 'Bonne chance à tous' })).ok).toBe(true);
    await until(() => heard.includes('Bonne chance à tous'));
    // Tout le monde abandonne : le serveur joue les parties jusqu'au bout.
    for (const c of cs) await emit(c, 'tournament:leave');
    await until(() => srv.tournaments.get(created.code)?.status === 'termine', 30000);
    const t = srv.tournaments.get(created.code)!;
    expect(t.rounds.length).toBe(2);
    expect(t.standings!.length).toBe(5);
    expect(new Set(t.standings).size).toBe(5);
    // Gains : 60/30/10 % de 125 pièces, versés aux trois premiers.
    const balances = await Promise.all(accts.map((a) => api('/me', undefined, a.token)));
    const total = balances.reduce((s, b) => s + b.profile.stats.tournaments, 0);
    expect(total).toBe(5);
    expect(balances.filter((b) => b.profile.stats.tournamentWins === 1).length).toBe(1);
    for (const c of cs) c.s.disconnect();
  }, 40000);
});
