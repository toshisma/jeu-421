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
});
