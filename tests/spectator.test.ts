/**
 * Mode spectateur : un vrai serveur, deux joueurs et des spectateurs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { currentPlayerId, type GameState } from '../shared/engine';
import type { PublicRoom, RollMessage } from '../shared/protocol';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', turnTimeoutMs: 60_000, autoPlayDelayMs: 30, rollGraceMs: 0, stopGraceMs: 0 });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

interface C { s: Socket; room: PublicRoom | null; game: GameState | null; rolls: number; id: string; closed: string | null }
const client = () => new Promise<C>((ok) => {
  const c: C = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null, game: null, rolls: 0, id: '', closed: null };
  c.s.on('room:state', (r: PublicRoom) => (c.room = r));
  c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('game:roll', (m: RollMessage) => { c.rolls++; c.game = m.state; });
  c.s.on('spectate:closed', ({ text }: { text: string }) => (c.closed = text));
  c.s.on('connect', () => ok(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((ok) => c.s.emit(ev, p, ok));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(10); }
}
const api = async (path: string, body?: object, token?: string) => (await fetch(`${base}/api${path}`, {
  method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
})).json();

/** Deux joueurs à une table, partie lancée. */
async function table(visibility: 'public' | 'private', auth: [string?, string?] = [], config?: object) {
  const a = await client(), b = await client();
  const r = await emit(a, 'room:create', { name: 'Alice', auth: auth[0], table: { visibility, maxPlayers: 2, stake: 0 } });
  a.id = r.playerId;
  if (config) await emit(a, 'room:config', { config });
  const j = await emit(b, 'room:join', { code: r.code, name: 'Bob', auth: auth[1] });
  b.id = j.playerId;
  await emit(b, 'room:ready', { ready: true });
  expect((await emit(a, 'room:start')).ok).toBe(true);
  await until(() => !!a.game && !!b.game);
  return { a, b, code: r.code as string };
}

describe('mode spectateur', () => {
  it('le spectateur reçoit l’état, ne peut pas jouer, ne compte pas comme joueur, et peut quitter', async () => {
    // Pas de spectateur dans un salon qui n'a pas commencé.
    const lobbyHost = await client();
    const lr = await emit(lobbyHost, 'room:create', { name: 'Zoé', table: { visibility: 'public', maxPlayers: 4, stake: 0 } });
    const early = await client();
    expect((await emit(early, 'spectate:join', { code: lr.code, name: 'Tôt' }))).toMatchObject({ ok: false });

    const { a, b, code } = await table('public');
    const live = await api('/live');
    expect(live.games.some((g: { code: string }) => g.code === code)).toBe(true);
    expect((await api(`/code/${code}`)).playing).toBe(true);

    const v = await client();
    expect(await emit(v, 'spectate:join', { code, name: 'Victor' })).toEqual({ ok: true, code });
    // Il reçoit l'état actuel en arrivant, et les joueurs voient le compteur.
    await until(() => v.game != null && v.room != null);
    expect(v.game!.version).toBe(a.game!.version);
    await until(() => a.room!.spectators === 1 && b.room!.spectators === 1);
    // Il n'occupe pas de place : la table reste à deux membres.
    expect(a.room!.members.length).toBe(2);

    // Actions de jeu refusées, même s'il essaie au nom du joueur actif.
    const g = a.game!;
    const before = g.version;
    for (const ev of ['game:roll', 'game:stop']) expect((await emit(v, ev, { keep: [false, false, false], version: g.version })).ok).toBe(false);
    for (const ev of ['room:start', 'room:rematch', 'room:ready', 'room:config', 'room:addBot', 'game:emote'])
      expect((await emit(v, ev, { emote: '👏', ready: true, config: { maxThrows: 1 } })).ok).toBe(false);
    await wait(50);
    expect(a.game!.version).toBe(before);

    // Tchat : autorisé, signalé « spectateur ».
    const got = new Promise<any>((ok) => a.s.once('room:chat', ok));
    expect(await emit(v, 'room:chat', { text: 'Allez Alice !' })).toEqual({ ok: true });
    expect(await got).toMatchObject({ name: 'Victor', text: 'Allez Alice !', spectator: true });

    // La partie continue : il voit les lancers en direct.
    const pid = currentPlayerId(a.game!)!;
    const active = pid === a.id ? a : b;
    expect((await emit(active, 'game:roll', { keep: [false, false, false], version: a.game!.version })).ok).toBe(true);
    await until(() => v.rolls === 1 && v.game!.version === a.game!.version);

    // Rejoindre comme joueur est impossible : la partie a commencé.
    expect((await emit(v, 'room:join', { code, name: 'Victor' })).ok).toBe(false);

    // Quitter : le compteur redescend.
    expect(await emit(v, 'spectate:leave')).toEqual({ ok: true });
    await until(() => a.room!.spectators === 0);
    // Une déconnexion aussi.
    const w = await client();
    await emit(w, 'spectate:join', { code, name: 'Wanda' });
    await until(() => a.room!.spectators === 1);
    w.s.disconnect();
    await until(() => a.room!.spectators === 0);
    for (const c of [a, b, v, lobbyHost, early]) c.s.disconnect();
  });

  it('ne bloque pas la fin de partie ; les spectateurs voient le résultat ; table fermée = prévenus', async () => {
    const { a, b, code } = await table('public', [], { variant: 'manches', rounds: 1 });
    const v = await client();
    let rewarded = false;
    v.s.on('profile:reward', () => (rewarded = true));
    await emit(v, 'spectate:join', { code, name: 'Victor' });
    await until(() => v.game != null);
    // Les joueurs jouent jusqu'au bout : le spectateur ne bloque rien.
    for (let i = 0; i < 20 && a.game!.phase !== 'fini'; i++) {
      const g = a.game!;
      const p = currentPlayerId(g) === a.id ? a : b;
      await emit(p, g.throwsUsed === 0 ? 'game:roll' : 'game:stop', { keep: [false, false, false], version: g.version });
      await until(() => a.game!.version > g.version);
    }
    expect(a.game!.phase).toBe('fini');
    await until(() => v.game!.phase === 'fini');
    expect(v.game!.ranking).toEqual(a.game!.ranking);
    expect(v.game!.players.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(rewarded).toBe(false);
    // Les deux joueurs partent : la table est rangée et le spectateur prévenu.
    await emit(a, 'room:leave');
    await emit(b, 'room:leave');
    await until(() => v.closed != null);
    expect(srv.rooms.has(code)).toBe(false);
    for (const c of [a, b, v]) c.s.disconnect();
  });

  it('partie privée : seuls les amis des joueurs peuvent regarder ; limite de spectateurs', async () => {
    const reg = async (u: string) => (await api('/register', { username: u, password: 'motdepasse1' })).token as string;
    const ta = await reg('Priv1'), tb = await reg('Priv2'), tf = await reg('Amie'), tx = await reg('Inconnu');
    await api('/friends', { username: 'Priv1' }, tf);
    await api('/friends/accept', { username: 'Amie' }, ta);
    const { a, b, code } = await table('private', [ta, tb]);
    expect((await api('/live')).games.some((g: { code: string }) => g.code === code)).toBe(false);
    const guest = await client(), stranger = await client(), friend = await client(), player = await client();
    expect((await emit(guest, 'spectate:join', { code, name: 'Anonyme' })).error).toMatch(/amis/);
    expect((await emit(stranger, 'spectate:join', { code, auth: tx })).error).toMatch(/amis/);
    expect(await emit(friend, 'spectate:join', { code, auth: tf })).toEqual({ ok: true, code });
    // Un joueur de la table ne peut pas se mettre spectateur de sa propre table.
    expect((await emit(player, 'spectate:join', { code, auth: ta })).ok).toBe(false);
    // Limite : 30 spectateurs au maximum.
    const r = srv.rooms.get(code)!;
    r.table.visibility = 'public';
    for (let i = r.spectators.size; i < 30; i++) r.spectators.set(`faux-${i}`, { name: 'x' });
    expect((await emit(guest, 'spectate:join', { code, name: 'Anonyme' })).error).toMatch(/spectateurs/);
    for (let i = 0; i < 30; i++) r.spectators.delete(`faux-${i}`);
    for (const c of [a, b, guest, stranger, friend, player]) c.s.disconnect();
  });
});
