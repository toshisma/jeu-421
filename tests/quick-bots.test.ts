/** Partie rapide : table trouvée ou créée, ordinateurs de complément, remplacement, équité. */
import { describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import type { GameState } from '../shared/engine';
import { currentPlayerId } from '../shared/engine';
import type { PublicRoom } from '../shared/protocol';
import { botTableRules, rewardFor } from '../shared/progress/profile';

const opts = {
  port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 }, turnTimeoutMs: 60_000, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0,
  disconnectGraceMs: 100, quickFillMs: 250, quickStartMs: 250,
};

interface C { s: Socket; room: PublicRoom | null; game: GameState | null; notices: string[]; reward: any; playerId?: string }
const client = (base: string) => new Promise<C>((resolve) => {
  const c: C = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null, game: null, notices: [], reward: null };
  c.s.on('room:state', (r: PublicRoom) => (c.room = r));
  c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('game:roll', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('room:notice', (n: { text: string }) => c.notices.push(n.text));
  c.s.on('profile:reward', (r: unknown) => (c.reward = r));
  c.s.on('connect', () => resolve(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 20000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(20); } }
const register = async (base: string, username: string) => {
  const r = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'motdepasse1', guestProfile: { coins: 100 } }) });
  return (await r.json()) as { token: string };
};
/** Le joueur humain joue « vite » : un lancer puis il s'arrête, jusqu'à la fin de la partie. */
async function playOut(c: C) {
  while (c.game?.phase !== 'fini') {
    const g = c.game;
    if (g && currentPlayerId(g) === c.playerId) {
      await emit(c, g.throwsUsed === 0 ? 'game:roll' : 'game:stop', { version: g.version, keep: [false, false, false] });
    }
    await wait(15);
  }
}

describe('partie rapide et ordinateurs de complément', () => {
  it('crée une table, la complète avec des ordinateurs après l’attente, et la partie va au bout', async () => {
    const srv = await startServer(opts);
    const base = `http://localhost:${srv.port}`;
    const acc = await register(base, 'Rapide');
    const a = await client(base);
    const ra = await emit(a, 'room:quick', { name: 'Alice', auth: acc.token });
    expect(ra.ok && ra.created).toBe(true);
    a.playerId = ra.playerId;
    // Partie courte pour le test (l'hôte peut changer les règles).
    expect((await emit(a, 'room:config', { config: { variant: 'manches', rounds: 1, turnSeconds: 0 } })).ok).toBe(true);
    await until(() => !!a.room?.quick?.fillAt);
    expect(a.room!.members).toHaveLength(1);
    // Personne ne vient : des ordinateurs complètent la table, puis départ automatique.
    await until(() => (a.room?.members.length ?? 0) === 3);
    expect(a.room!.members.filter((m) => m.bot && m.filler)).toHaveLength(2);
    expect(a.notices.some((t) => /ordinateurs complètent/.test(t))).toBe(true);
    await until(() => a.room?.status === 'playing');
    expect(a.room!.pot).toBe(0);
    expect(a.notices.some((t) => /hors classement/.test(t))).toBe(true);
    await playOut(a);
    await until(() => !!a.reward);
    // Hors classement : aucune partie en ligne comptée ; plafond du solo entamé.
    const u = srv.store.userByName('Rapide')!;
    expect(u.online_games).toBe(0);
    expect(u.solo_count).toBe(1);
    expect(a.reward.reward.xp).toBeGreaterThan(0);
    a.s.disconnect();
    await srv.close();
  });

  it('un vrai joueur qui arrive avant le départ prend la place d’un ordinateur', async () => {
    const srv = await startServer({ ...opts, quickStartMs: 60_000 });
    const base = `http://localhost:${srv.port}`;
    const a = await client(base), b = await client(base);
    const ra = await emit(a, 'room:quick', { name: 'Alice' });
    await until(() => a.room?.members.filter((m) => m.filler).length === 2);
    expect(a.room!.quick!.startAt).toBeGreaterThan(Date.now());
    // La table reste visible et rejoignable : les ordinateurs cèdent leur place.
    const lobbies = await (await fetch(`${base}/api/lobbies`)).json();
    expect(lobbies.lobbies.find((l: any) => l.code === ra.code).players).toBe(1);
    const rb = await emit(b, 'room:quick', { name: 'Bob' });
    expect(rb.ok).toBe(true);
    expect(rb.code).toBe(ra.code);
    await until(() => a.room?.members.some((m) => m.name === 'Bob') ?? false);
    expect(a.room!.members).toHaveLength(3);
    expect(a.room!.members.filter((m) => m.filler)).toHaveLength(1);
    expect(a.room!.members.find((m) => m.name === 'Bob')!.ready).toBe(true);
    expect(a.notices.some((t) => /Bob prend la place de .* \(ordinateur\)/.test(t))).toBe(true);
    // Lancement par l'hôte sans attendre le compte à rebours.
    expect((await emit(a, 'room:start')).ok).toBe(true);
    await until(() => a.room?.status === 'playing');
    a.s.disconnect(); b.s.disconnect();
    await srv.close();
  });

  it('assez de vrais joueurs : départ automatique sans ordinateur', async () => {
    const srv = await startServer({ ...opts, quickFillMs: 60_000 });
    const base = `http://localhost:${srv.port}`;
    const cs = await Promise.all([client(base), client(base), client(base)]);
    const codes = [];
    for (const [i, c] of cs.entries()) codes.push((await emit(c, 'room:quick', { name: `J${i}` })).code);
    expect(new Set(codes).size).toBe(1);
    await until(() => cs[0].room?.status === 'playing');
    expect(cs[0].room!.members.some((m) => m.bot)).toBe(false);
    for (const c of cs) c.s.disconnect();
    await srv.close();
  });

  it('tables entre amis et tables publiques classiques : jamais d’ordinateur sans l’hôte ; jamais avec mise', async () => {
    const srv = await startServer(opts);
    const base = `http://localhost:${srv.port}`;
    const acc = await register(base, 'Miseur');
    const priv = await client(base), pub = await client(base), staked = await client(base), guest = await client(base);
    await emit(priv, 'room:create', { name: 'Ami', table: { visibility: 'private' } });
    await emit(pub, 'room:create', { name: 'Public', table: { visibility: 'public' } });
    const rs = await emit(staked, 'room:create', { name: 'Mise', auth: acc.token, table: { visibility: 'public', stake: 10 } });
    await wait(700);
    expect(priv.room!.members).toHaveLength(1);
    expect(pub.room!.members).toHaveLength(1);
    expect(staked.room!.members).toHaveLength(1);
    // La partie rapide ne va pas à une table avec mise.
    const q = await emit(guest, 'room:quick', { name: 'Invité' });
    expect(q.code).not.toBe(rs.code);
    // Avec mise : ni complément ni ajout.
    expect((await emit(staked, 'room:fill')).ok).toBe(false);
    expect((await emit(staked, 'room:addBot')).ok).toBe(false);
    // Entre amis : l'hôte le demande explicitement.
    expect((await emit(priv, 'room:fill')).ok).toBe(true);
    await until(() => priv.room?.members.length === 3);
    // Puis une mise devient impossible tant que des ordinateurs sont là.
    expect((await emit(priv, 'room:config', { table: { visibility: 'private', stake: 10 } })).ok).toBe(false);
    // Pas de départ automatique hors partie rapide.
    await wait(600);
    expect(priv.room!.status).toBe('lobby');
    for (const c of [priv, pub, staked, guest]) c.s.disconnect();
    await srv.close();
  });
});

describe('récompenses avec des ordinateurs', () => {
  it('barème du solo, hors bonus en ligne ; « en ligne » seulement avec un autre humain', () => {
    expect(botTableRules(2, [])).toEqual({ mode: 'online' });
    expect(botTableRules(1, ['difficile', 'normal'])).toEqual({ mode: 'solo', botLevel: 'normal' });
    expect(botTableRules(2, ['facile', 'difficile'])).toEqual({ mode: 'online', botLevel: 'facile' });
    const base = { opponents: 2, count421: 0, place: 1, minutes: 15, day: '2026-11-04' };
    const online = rewardFor(true, 10, { ...base, mode: 'online' });
    const withBots = rewardFor(true, 10, { ...base, mode: 'online', botLevel: 'normal' });
    const solo = rewardFor(true, 10, { ...base, mode: 'solo', difficulty: 'normal' });
    expect(withBots.coins).toBe(solo.coins);
    expect(withBots.coins).toBeLessThan(online.coins);
  });
});
