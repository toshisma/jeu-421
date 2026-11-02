/** Ordinateurs en ligne, partie rapide, blocages, mises remboursées après un redémarrage. */
import { afterAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/app';
import type { GameState } from '../shared/engine';
import type { PublicRoom } from '../shared/protocol';

const dir = mkdtempSync(join(tmpdir(), '421-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const opts = { port: 0, accounts: { authAttempts: 1000 }, turnTimeoutMs: 60_000, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, disconnectGraceMs: 100 };

interface C { s: Socket; room: PublicRoom | null; game: GameState | null }
const client = (base: string) => new Promise<C>((resolve) => {
  const c: C = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null, game: null };
  c.s.on('room:state', (r: PublicRoom) => (c.room = r));
  c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('game:roll', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('connect', () => resolve(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 20000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(20); } }
const api = (base: string) => async (path: string, body?: object, token?: string, method?: string) => {
  const r = await fetch(`${base}/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, ...(await r.json()) };
};

describe('en ligne : ordinateurs, partie rapide, blocages', () => {
  it('une table avec des ordinateurs se joue jusqu’au bout', async () => {
    const srv = await startServer({ ...opts, dbPath: ':memory:' });
    const base = `http://localhost:${srv.port}`;
    const host = await client(base);
    const r = await emit(host, 'room:create', { name: 'Sam', config: { variant: 'manches', rounds: 1, turnSeconds: 0 }, table: { stake: 0 } });
    expect((await emit(host, 'room:addBot', { difficulty: 'difficile' })).ok).toBe(true);
    expect((await emit(host, 'room:addBot', { difficulty: 'facile' })).ok).toBe(true);
    await until(() => host.room?.members.length === 3);
    expect(host.room!.members.filter((m) => m.bot).map((m) => m.bot).sort()).toEqual(['difficile', 'facile']);
    // Pas de mise tant qu'il y a des ordinateurs.
    expect((await emit(host, 'room:config', { table: { stake: 10 } })).ok).toBe(false);
    expect((await emit(host, 'room:start')).ok).toBe(true);
    // Le joueur humain part : le serveur joue pour lui, les ordinateurs jouent seuls.
    host.s.disconnect();
    await until(() => srv.rooms.get(r.code)?.game?.phase === 'fini');
    await srv.close();
  });

  it('partie rapide : rejoint une table publique, sinon en crée une', async () => {
    const srv = await startServer({ ...opts, dbPath: ':memory:' });
    const base = `http://localhost:${srv.port}`;
    const a = await client(base), b = await client(base);
    const ra = await emit(a, 'room:quick', { name: 'Alice' });
    expect(ra.ok && ra.created).toBe(true);
    const rb = await emit(b, 'room:quick', { name: 'Bob' });
    expect(rb.ok).toBe(true);
    expect(rb.code).toBe(ra.code);
    expect(rb.created).toBeUndefined();
    a.s.disconnect(); b.s.disconnect();
    await srv.close();
  });

  it('un joueur bloqué ne rejoint pas la table, ne peut pas être ajouté en ami', async () => {
    const srv = await startServer({ ...opts, dbPath: ':memory:' });
    const base = `http://localhost:${srv.port}`;
    const call = api(base);
    const a = await call('/register', { username: 'Bloqueur', password: 'motdepasse1' });
    const b = await call('/register', { username: 'Bloque', password: 'motdepasse1' });
    expect((await call('/blocks', { username: 'Bloque' }, a.token)).blocked).toEqual(['Bloque']);
    expect((await call('/blocks', { username: 'Bloqueur' }, a.token)).status).toBe(400);
    expect((await call('/friends', { username: 'Bloqueur' }, b.token)).status).toBe(403);
    const host = await client(base), guest = await client(base), other = await client(base);
    const r = await emit(host, 'room:create', { name: 'H', auth: a.token, table: { visibility: 'public' } });
    expect((await emit(guest, 'room:join', { code: r.code, name: 'G', auth: b.token })).ok).toBe(false);
    // La partie rapide ne l'y envoie pas non plus.
    const q = await emit(guest, 'room:quick', { name: 'G', auth: b.token });
    expect(q.code).not.toBe(r.code);
    expect((await emit(other, 'room:join', { code: r.code, name: 'Autre' })).ok).toBe(true);
    // Déblocage.
    expect((await call('/blocks/Bloque', undefined, a.token, 'DELETE')).blocked).toEqual([]);
    for (const c of [host, guest, other]) c.s.disconnect();
    await srv.close();
  });
});

describe('mises en séquestre', () => {
  it('rembourse les mises d’une partie interrompue par un redémarrage', async () => {
    const dbPath = join(dir, 'db.sqlite');
    let srv = await startServer({ ...opts, dbPath, turnTimeoutMs: 600_000, disconnectGraceMs: 600_000 });
    let base = `http://localhost:${srv.port}`;
    let call = api(base);
    const a = await call('/register', { username: 'Seq1', password: 'motdepasse1', guestProfile: { coins: 100 } });
    const b = await call('/register', { username: 'Seq2', password: 'motdepasse1', guestProfile: { coins: 100 } });
    const host = await client(base), guest = await client(base);
    const r = await emit(host, 'room:create', { name: 'A', auth: a.token, table: { stake: 50 } });
    await emit(guest, 'room:join', { code: r.code, name: 'B', auth: b.token });
    await emit(guest, 'room:ready', { ready: true });
    expect((await emit(host, 'room:start')).ok).toBe(true);
    await until(() => host.room?.pot === 100);
    expect((await call('/me', undefined, a.token)).profile.coins).toBe(50);
    host.s.disconnect(); guest.s.disconnect();
    await srv.close();
    // Redémarrage : la partie est perdue, les mises reviennent à leurs propriétaires.
    srv = await startServer({ ...opts, dbPath });
    base = `http://localhost:${srv.port}`;
    call = api(base);
    expect((await call('/me', undefined, a.token)).profile.coins).toBe(100);
    expect((await call('/me', undefined, b.token)).profile.coins).toBe(100);
    await srv.close();
  });
});
