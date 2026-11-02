/** Ligues hebdomadaires, parrainage et rivalités (vrai serveur, base en mémoire). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { LEAGUE_PRIZES, REFERRAL_BONUS } from '../shared/progress/profile';
import { startServer } from '../server/app';

let clock = Date.parse('2026-11-04T12:00:00Z'); // un mercredi
let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, minSoloMs: 0, soloDailyCap: 1000, now: () => clock },
    turnTimeoutMs: 60_000, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, disconnectGraceMs: 50 });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const call = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, ...(await r.json()) };
};
async function solo(token: string, won: boolean) {
  const s = await call('/solo/start', {}, token);
  return call('/solo/end', { gameToken: s.gameToken, won, rounds: 10, opponents: 3, difficulty: 'difficile', count421: 0 }, token);
}

describe('ligues', () => {
  it('groupe de la semaine, montée des 3 premiers, récompenses et titre', async () => {
    const users = [];
    for (let i = 0; i < 10; i++) users.push(await call('/register', { username: `Lig${i}`, password: 'motdepasse1' }));
    // Les 3 premiers gagnent (beaucoup d'XP), les autres perdent.
    for (let i = 0; i < 10; i++) { await solo(users[i].token, i < 3); if (i === 0) await solo(users[i].token, true); }
    const l = await call('/league', undefined, users[0].token);
    expect(l.name).toBe('Bronze');
    expect(l.group.length).toBe(10);
    expect(l.group[0]).toMatchObject({ rank: 1, username: 'Lig0', me: true });
    const coinsBefore = (await call('/me', undefined, users[0].token)).profile.coins;
    // Semaine suivante : la semaine passée est clôturée.
    clock += 7 * 86400_000;
    const l2 = await call('/league', undefined, users[0].token);
    expect(l2.name).toBe('Argent');
    expect(l2.group).toEqual([]);
    const me = (await call('/me', undefined, users[0].token)).profile;
    expect(me.coins).toBe(coinsBefore + LEAGUE_PRIZES[0]);
    expect(me.titles).toContain('ligue:Argent');
    expect((await call('/league', undefined, users[5].token)).name).toBe('Bronze');
    // Profil public : la ligue s'affiche.
    expect((await call('/players/Lig1')).player.league).toBe('Argent');
  });
});

describe('parrainage', () => {
  it('bonus pour les deux après 3 parties du filleul', async () => {
    const p = await call('/register', { username: 'Parrain', password: 'motdepasse1' });
    const f = await call('/register', { username: 'Filleul', password: 'motdepasse1', referrer: 'Parrain' });
    expect((await call('/referral', undefined, p.token))).toMatchObject({ code: 'Parrain', invited: 1, paid: 0 });
    const before = (await call('/me', undefined, p.token)).profile.coins;
    for (let i = 0; i < 3; i++) await solo(f.token, false);
    expect((await call('/me', undefined, p.token)).profile.coins).toBe(before + REFERRAL_BONUS);
    expect((await call('/referral', undefined, p.token)).paid).toBe(1);
    const fc = (await call('/me', undefined, f.token)).profile.coins;
    await solo(f.token, false);
    expect((await call('/me', undefined, p.token)).profile.coins).toBe(before + REFERRAL_BONUS); // une seule fois
    expect((await call('/me', undefined, f.token)).profile.coins).toBeLessThan(fc + REFERRAL_BONUS);
  });
});

describe('rivalités', () => {
  it('le bilan entre deux comptes se met à jour après une partie en ligne', async () => {
    const a = await call('/register', { username: 'RivalA', password: 'motdepasse1' });
    const b = await call('/register', { username: 'RivalB', password: 'motdepasse1' });
    const ca = connect(base, { transports: ['websocket'], forceNew: true });
    const cb = connect(base, { transports: ['websocket'], forceNew: true });
    const emit = (s: ReturnType<typeof connect>, ev: string, p: object = {}) => new Promise<any>((r) => s.emit(ev, p, r));
    await new Promise<void>((r) => ca.on('connect', () => r())); await new Promise<void>((r) => (cb.connected ? r() : cb.on('connect', () => r())));
    const room = await emit(ca, 'room:create', { name: 'A', auth: a.token, config: { variant: 'manches', rounds: 1, turnSeconds: 0 } });
    await emit(cb, 'room:join', { code: room.code, name: 'B', auth: b.token });
    await emit(cb, 'room:ready', { ready: true });
    await emit(ca, 'room:start');
    ca.disconnect(); cb.disconnect();
    const t = Date.now();
    while (srv.rooms.get(room.code)?.game?.phase !== 'fini' && Date.now() - t < 20000) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 50));
    const v = (await call('/players/RivalB', undefined, a.token)).player.rivalry;
    expect(v.mine + v.theirs).toBe(1);
    expect((await call('/players/RivalB')).player.rivalry).toBeNull();
  });
});
