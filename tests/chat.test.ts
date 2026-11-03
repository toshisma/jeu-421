import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { startServer } from '../server/app';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => { srv = await startServer({ port: 0, dbPath: ':memory:' }); base = `http://localhost:${srv.port}`; });
afterAll(async () => { await srv.close(); });

describe('tchat de table', () => {
  it('relaie les messages à toute la table, retire les liens, limite le débit', async () => {
    const a = connect(base), b = connect(base);
    const r = await new Promise<{ code: string }>((ok) => a.emit('room:create', { name: 'Alice', table: { visibility: 'private', maxPlayers: 4, stake: 0 } }, ok));
    await new Promise((ok) => b.emit('room:join', { code: r.code, name: 'Bob' }, ok));
    const got = new Promise<{ name: string; text: string }>((ok) => b.on('room:chat', ok));
    expect(await new Promise((ok) => a.emit('room:chat', { text: 'Salut https://exemple.com' }, ok))).toEqual({ ok: true });
    expect(await got).toMatchObject({ name: 'Alice', text: 'Salut [lien]' });
    expect(await new Promise((ok) => a.emit('room:chat', { text: 'encore' }, ok))).toMatchObject({ ok: false });
    a.close(); b.close();
  });
  it('un compte ne peut pas s’asseoir deux fois ; l’hôte peut exclure un joueur', async () => {
    const reg = async (u: string) => (await (await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'motdepasse1' }) })).json()).token;
    const ta = await reg('Hote'), tb = await reg('Invite');
    const a = connect(base), b1 = connect(base), b2 = connect(base);
    const r = await new Promise<{ code: string }>((ok) => a.emit('room:create', { name: 'Hote', auth: ta, table: { visibility: 'private', maxPlayers: 4, stake: 0 } }, ok));
    const j1 = await new Promise<{ playerId: string }>((ok) => b1.emit('room:join', { code: r.code, name: 'Invite', auth: tb }, ok));
    const j2 = await new Promise<{ playerId: string }>((ok) => b2.emit('room:join', { code: r.code, name: 'Invite', auth: tb }, ok));
    expect(j2.playerId).toBe(j1.playerId);
    const kicked = new Promise((ok) => b2.on('room:kicked', ok));
    expect(await new Promise((ok) => b2.emit('room:kick', { playerId: j1.playerId }, ok))).toMatchObject({ ok: false });
    expect(await new Promise((ok) => a.emit('room:kick', { playerId: j1.playerId }, ok))).toEqual({ ok: true });
    await kicked;
    expect(await new Promise((ok) => b2.emit('room:join', { code: r.code, name: 'Invite', auth: tb }, ok))).toMatchObject({ ok: false });
    a.close(); b1.close(); b2.close();
  });
});
