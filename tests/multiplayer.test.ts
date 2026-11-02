/**
 * Test d'intégration réel : un vrai serveur Socket.IO et plusieurs vrais clients réseau.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import type { GameState } from '../shared/engine';
import type { PublicRoom, RollMessage } from '../shared/protocol';
import { currentPlayerId } from '../shared/engine';

let server: Awaited<ReturnType<typeof startServer>>;
let url = '';

beforeAll(async () => {
  server = await startServer({ port: 0, turnTimeoutMs: 60_000, disconnectGraceMs: 400, autoPlayDelayMs: 50, hostGraceMs: 300 });
  url = `http://localhost:${server.port}`;
});
afterAll(async () => { await server.close(); });

interface Client {
  s: Socket;
  room: PublicRoom | null;
  game: GameState | null;
  rolls: RollMessage[];
  notices: string[];
  id: string;
  token: string;
}
function client(): Promise<Client> {
  return new Promise((resolve) => {
    const c: Client = { s: connect(url, { transports: ['websocket'], forceNew: true }), room: null, game: null, rolls: [], notices: [], id: '', token: '' };
    c.s.on('room:state', (r: PublicRoom) => (c.room = r));
    c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
    c.s.on('game:roll', (m: RollMessage) => { c.rolls.push(m); c.game = m.state; });
    c.s.on('room:notice', (n: { text: string }) => c.notices.push(n.text));
    c.s.on('connect', () => resolve(c));
  });
}
const emit = (c: Client, ev: string, payload: object = {}) => new Promise<any>((res) => c.s.emit(ev, payload, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 3000) {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(10); }
}

describe('multijoueur', () => {
  it('salon, prêt, lancement, tours synchronisés, protections', async () => {
    const host = await client();
    const created = await emit(host, 'room:create', { name: 'Alice', avatar: '🦊' });
    expect(created.ok).toBe(true);
    host.id = created.playerId;

    const guests = await Promise.all([client(), client()]);
    for (const [i, g] of guests.entries()) {
      const r = await emit(g, 'room:join', { code: created.code.toLowerCase(), name: `Invité${i}`, avatar: '🐻' });
      expect(r.ok).toBe(true);
      g.id = r.playerId;
      g.token = r.token;
    }
    expect((await emit(host, 'room:join', { code: 'ZZZZZ', name: 'x' })).ok).toBe(false);

    // Non-hôte : ne peut ni modifier les règles ni lancer.
    expect((await emit(guests[0], 'room:config', { config: { maxThrows: 2 } })).ok).toBe(false);
    expect((await emit(guests[0], 'room:start')).ok).toBe(false);
    // Hôte : lancement refusé tant que tout le monde n'est pas prêt.
    expect((await emit(host, 'room:config', { config: { variant: 'decharge', maxThrows: 2 } })).ok).toBe(true);
    expect((await emit(host, 'room:start')).error).toMatch(/prêts/);
    for (const g of guests) await emit(g, 'room:ready', { ready: true });
    expect((await emit(host, 'room:start')).ok).toBe(true);

    const all = [host, ...guests];
    await until(() => all.every((c) => c.game != null));
    const byId = (id: string) => all.find((c) => c.id === id)!;

    // Action hors tour et version périmée refusées.
    const g0 = host.game!;
    const active = byId(currentPlayerId(g0)!);
    const other = all.find((c) => c !== active)!;
    expect((await emit(other, 'game:roll', { keep: [false, false, false], version: g0.version })).ok).toBe(false);

    // Double clic : deux envois avec la même version → un seul accepté.
    const [a, b] = await Promise.all([
      emit(active, 'game:roll', { keep: [false, false, false], version: g0.version }),
      emit(active, 'game:roll', { keep: [false, false, false], version: g0.version }),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    await until(() => all.every((c) => c.rolls.length === 1));
    // Tous les navigateurs reçoivent le même résultat officiel et la même graine d'animation.
    const r0 = host.rolls[0];
    for (const c of all) { expect(c.rolls[0].roll.dice).toEqual(r0.roll.dice); expect(c.rolls[0].seed).toBe(r0.seed); }

    // Entrées frauduleuses refusées.
    const v = host.game!.version;
    expect((await emit(active, 'game:roll', { keep: 'tout', version: v })).ok).toBe(false);
    expect((await emit(active, 'game:roll', { keep: [true, true, true], version: v })).ok).toBe(false);

    // On joue quelques tours complets.
    for (let turn = 0; turn < 6; turn++) {
      const g = host.game!;
      const p = byId(currentPlayerId(g)!);
      const before = host.rolls.length;
      const ev = g.throwsUsed === 0 ? 'game:roll' : 'game:stop';
      const res = await emit(p, ev, { keep: [false, false, false], version: g.version });
      expect(res.ok).toBe(true);
      await until(() => all.every((c) => c.game!.version === g.version + 1));
      if (ev === 'game:roll') expect(host.rolls.length).toBe(before + 1);
    }
    const states = all.map((c) => JSON.stringify(c.game));
    expect(new Set(states).size).toBe(1);

    // Déconnexion puis reconnexion avec le jeton secret.
    const g1 = guests[1];
    g1.s.disconnect();
    await until(() => host.room!.members.find((m) => m.id === g1.id)!.connected === false);
    const back = await client();
    const rj = await emit(back, 'room:join', { code: created.code, token: g1.token });
    expect(rj.ok).toBe(true);
    expect(rj.playerId).toBe(g1.id);
    back.id = rj.playerId;
    await until(() => back.game != null && host.room!.members.find((m) => m.id === g1.id)!.connected);

    // L'hôte part : message à tous et nouvel hôte désigné.
    await emit(host, 'room:leave');
    await until(() => guests[0].notices.some((n) => n.includes("L'hôte Alice a quitté")));
    expect(guests[0].room!.hostId).not.toBe(host.id);

    // Le serveur joue pour le joueur parti, la partie continue.
    const leftAt = guests[0].rolls.length;
    const present = [guests[0], back];
    const t0 = Date.now();
    while (guests[0].game!.phase !== 'fini' && Date.now() - t0 < 8000) {
      const g = guests[0].game!;
      const pid = currentPlayerId(g)!;
      const p = present.find((c) => c.id === pid);
      if (p) await emit(p, g.throwsUsed === 0 ? 'game:roll' : 'game:stop', { keep: [false, false, false], version: g.version });
      await wait(20);
      if (guests[0].rolls.slice(leftAt).some((m) => m.roll.playerId === host.id) && guests[0].rolls.length > leftAt + 6) break;
    }
    expect(guests[0].rolls.slice(leftAt).some((m) => m.roll.playerId === host.id) || guests[0].game!.phase === 'fini').toBe(true);
    for (const c of [guests[0], back]) c.s.disconnect();
    host.s.disconnect();
  });
});

describe('temps de jeu', () => {
  it('temps écoulé : le tour est joué puis validé automatiquement, et tout le monde est prévenu', async () => {
    const srv = await startServer({ port: 0, turnTimeoutMs: 250, rollGraceMs: 50, stopGraceMs: 50, disconnectGraceMs: 5000 });
    const u = `http://localhost:${srv.port}`;
    const mk = () => new Promise<Client>((resolve) => {
      const c: Client = { s: connect(u, { transports: ['websocket'], forceNew: true }), room: null, game: null, rolls: [], notices: [], id: '', token: '' };
      c.s.on('room:state', (r: PublicRoom) => (c.room = r));
      c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
      c.s.on('game:roll', (m: RollMessage) => { c.rolls.push(m); c.game = m.state; });
      c.s.on('room:notice', (n: { text: string }) => c.notices.push(n.text));
      c.s.on('connect', () => resolve(c));
    });
    const a = await mk(), b = await mk();
    const cr = await emit(a, 'room:create', { name: 'Lent', avatar: '🦊', config: { variant: 'decharge', maxThrows: 3 } });
    await emit(b, 'room:join', { code: cr.code, name: 'Lente', avatar: '🐻' });
    await emit(b, 'room:ready', { ready: true });
    expect((await emit(a, 'room:start')).ok).toBe(true);
    await until(() => a.game != null);
    expect(a.room!.turnDeadline).not.toBeNull();
    // Personne ne joue : le premier tour est lancé puis validé tout seul.
    await until(() => a.game!.turnIdx >= 1 || a.game!.round > 1, 4000);
    expect(a.rolls.length).toBeGreaterThanOrEqual(1);
    expect(a.notices.some((n) => n.startsWith('Temps écoulé'))).toBe(true);
    expect(b.notices.some((n) => n.startsWith('Temps écoulé'))).toBe(true);
    a.s.disconnect(); b.s.disconnect();
    await srv.close();
  });
});

describe('réactions', () => {
  it('relayées à toute la table, liste fermée et limitées', async () => {
    const srv = await startServer({ port: 0 });
    const u = `http://localhost:${srv.port}`;
    const mk = () => new Promise<{ s: Socket; got: string[] }>((resolve) => {
      const c = { s: connect(u, { transports: ['websocket'], forceNew: true }), got: [] as string[] };
      c.s.on('game:emote', (m: { emote: string }) => c.got.push(m.emote));
      c.s.on('connect', () => resolve(c));
    });
    const a = await mk(), b = await mk();
    const send = (c: { s: Socket }, ev: string, p: object) => new Promise<any>((r) => c.s.emit(ev, p, r));
    const cr = await send(a, 'room:create', { name: 'A' });
    await send(b, 'room:join', { code: cr.code, name: 'B' });
    expect((await send(a, 'game:emote', { emote: '🍺' })).ok).toBe(true);
    expect((await send(a, 'game:emote', { emote: '🍺' })).ok).toBe(false); // trop rapide
    expect((await send(b, 'game:emote', { emote: '<script>' })).ok).toBe(false); // inconnue
    await until(() => b.got.length === 1 && a.got.length === 1);
    expect(b.got).toEqual(['🍺']);
    a.s.disconnect(); b.s.disconnect();
    await srv.close();
  });
});
