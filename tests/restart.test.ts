/** Requêtes volumineuses (photo) et partie solo qui survit à un redémarrage du serveur. */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/app';

const dir = mkdtempSync(join(tmpdir(), '421-redem-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const dbPath = join(dir, 'base.sqlite');
const opts = { port: 0, dbPath, accounts: { minSoloMs: 100, authAttempts: 1000 } };
const call = (base: string) => async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

describe('mise à jour du serveur pendant une partie', () => {
  it('photo de profil de 60 ko acceptée', async () => {
    const srv = await startServer(opts);
    const api = call(`http://localhost:${srv.port}`);
    const reg = await api('/register', { username: 'Photo1', password: 'motdepasse1' });
    // JPEG minimal valide (signature) complété jusqu'à 60 ko.
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60_000, 7)]);
    const r = await api('/me/photo', { dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` }, reg.token);
    expect(r.ok).toBe(true);
    await srv.close();
  });

  it('la partie solo commencée avant un redémarrage est récompensée après', async () => {
    let srv = await startServer(opts);
    let api = call(`http://localhost:${srv.port}`);
    const reg = await api('/register', { username: 'Patience', password: 'motdepasse1' });
    const g = await api('/solo/start', {}, reg.token);
    await srv.close();
    srv = await startServer(opts); // mise à jour déployée pendant la partie
    api = call(`http://localhost:${srv.port}`);
    await new Promise((r) => setTimeout(r, 150));
    const end = await api('/solo/end', { gameToken: g.gameToken, won: true, rounds: 45, opponents: 1, difficulty: 'difficile' }, reg.token);
    expect(end.ok).toBe(true);
    expect(end.reward.coins).toBeGreaterThan(0);
    expect((await api('/solo/end', { gameToken: g.gameToken, won: true, rounds: 45, opponents: 1 }, reg.token)).status).toBe(400); // une seule fois
    await srv.close();
  });
});
