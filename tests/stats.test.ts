/** Statistiques publiques et tableau d'administration : vrais échanges avec le serveur. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import type { GameState } from '../shared/engine';
import type { PublicRoom } from '../shared/protocol';
import { brusselsDay, brusselsMidnight } from '../server/stats';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', accounts: { minSoloMs: 100, authAttempts: 1000 }, stats: { adminUsers: ['Patron'] },
    turnTimeoutMs: 60_000, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, disconnectGraceMs: 100,
  });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

const api = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, ...(await r.json()) };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean | Promise<boolean>, ms = 20000) { const t = Date.now(); while (!(await fn())) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(30); } }
const presence = (device: string) => new Promise<Socket>((res) => {
  const s = connect(`${base}/presence`, { transports: ['websocket'], forceNew: true, auth: { device } });
  s.on('connect', () => res(s));
});
// Les totaux sont mis en cache 5 s : on lit la partie « en direct » (jamais en cache) ou on attend.
const stats = () => api('/stats');

describe('statistiques', () => {
  it('fuseau de Bruxelles : minuit local', () => {
    expect(brusselsDay(Date.parse('2026-11-02T23:30:00Z'))).toBe('2026-11-03'); // 0 h 30 à Bruxelles (UTC+1)
    expect(new Date(brusselsMidnight('2026-11-03')).toISOString()).toBe('2026-11-02T23:00:00.000Z');
    expect(new Date(brusselsMidnight('2026-07-01')).toISOString()).toBe('2026-06-30T22:00:00.000Z'); // heure d'été
  });

  it('en ligne : un appareil compte une fois, et plus du tout une fois déconnecté', async () => {
    const before = (await stats()).live.online;
    const a1 = await presence('appareil-AAAA'), a2 = await presence('appareil-AAAA'), b = await presence('appareil-BBBB');
    await until(async () => (await stats()).live.online === before + 2);
    b.emit('presence', 'solo');
    await until(async () => (await stats()).live.gamesInProgress === 1);
    b.disconnect();
    await until(async () => (await stats()).live.online === before + 1);
    expect((await stats()).live.gamesInProgress).toBe(0);
    expect((await stats()).peak.n).toBeGreaterThanOrEqual(before + 2);
    a1.disconnect(); a2.disconnect();
    await until(async () => (await stats()).live.online === before);
  });

  it('parties solo : comptées une seule fois, et seulement terminées', async () => {
    // Invité
    const t = await api('/stats/solo/start', {});
    expect((await api('/stats/solo/end', { token: t.token, won: true, opponents: 2 })).status).toBe(400); // trop tôt
    await wait(150);
    expect((await api('/stats/solo/end', { token: t.token, won: true, opponents: 2, device: 'appareil-CCCC' })).ok).toBe(true);
    expect((await api('/stats/solo/end', { token: t.token, won: true, opponents: 2 })).status).toBe(400); // pas deux fois
    expect((await api('/stats/solo/end', { token: 'inventé', won: true })).status).toBe(400);
    // Compte
    const reg = await api('/register', { username: 'Joueur1', password: 'motdepasse1' });
    const g = await api('/solo/start', {}, reg.token);
    await wait(150);
    expect((await api('/solo/end', { gameToken: g.gameToken, won: false, rounds: 5, opponents: 1 }, reg.token)).ok).toBe(true);
    await wait(5100); // cache des totaux
    const s = await stats();
    expect(s.today.games).toBe(2);
    expect(s.today.players).toBe(2);
    expect(s.today.wins).toBe(1);
    expect(s.today.signups).toBe(1);
    expect(s.totals).toMatchObject({ users: 1, games: 2, vsAi: 2, multiplayer: 0 });
    expect(s.days).toHaveLength(30);
    expect(s.days[29]).toMatchObject({ day: brusselsDay(Date.now()), games: 2 });
    // Rien de personnel dans les statistiques publiques.
    expect(JSON.stringify(s)).not.toContain('Joueur1');
  }, 15000);

  it('partie en ligne terminée : comptée une fois, partie à plusieurs', async () => {
    const mk = () => new Promise<{ s: Socket; room: PublicRoom | null; game: GameState | null }>((res) => {
      const c = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null as PublicRoom | null, game: null as GameState | null };
      c.s.on('room:state', (r: PublicRoom) => (c.room = r));
      c.s.on('connect', () => res(c));
    });
    const emit = (c: { s: Socket }, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const a = await mk(), b = await mk();
    const r = await emit(a, 'room:create', { name: 'Alice', config: { variant: 'manches', rounds: 2, turnSeconds: 0 }, table: { stake: 0 } });
    expect((await emit(b, 'room:join', { code: r.code, name: 'Bob' })).ok).toBe(true);
    await until(() => a.room?.members.length === 2);
    await emit(b, 'room:ready', { ready: true });
    expect((await emit(a, 'room:start')).ok).toBe(true);
    await until(() => !!srv.rooms.get(r.code)?.game);
    const before = (await stats()).totals.games;
    // Les deux joueurs partent : le serveur finit la partie à leur place.
    a.s.disconnect(); b.s.disconnect();
    await until(() => srv.rooms.get(r.code)?.game?.phase === 'fini');
    await wait(5100);
    const s = await stats();
    expect(s.totals.games).toBe(before + 1);
    expect(s.totals.multiplayer).toBe(1);
  }, 30000);

  it('administration : refusée aux joueurs, accordée au compte autorisé', async () => {
    const j = await api('/login', { username: 'Joueur1', password: 'motdepasse1' });
    expect((await api('/admin/stats', undefined, j.token)).status).toBe(403);
    expect((await api('/admin/stats')).status).toBe(403);
    expect((await api('/admin/whoami', undefined, j.token)).admin).toBe(false);
    const p = await api('/register', { username: 'Patron', password: 'motdepasse1' });
    expect((await api('/admin/whoami', undefined, p.token)).admin).toBe(true);
    const adm = await api('/admin/stats', undefined, p.token);
    expect(adm.ok).toBe(true);
    expect(adm.signups.map((u: { username: string }) => u.username)).toEqual(expect.arrayContaining(['Joueur1', 'Patron']));
    expect(adm.mostActiveAll[0]).toMatchObject({ username: 'Joueur1', games: 1 });
    expect(adm.longest.length).toBeGreaterThan(0);
  });
});
