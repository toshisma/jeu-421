/** Comptes : vrai serveur HTTP + Socket.IO, base SQLite en mémoire. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { currentPlayerId, type GameState } from '../shared/engine';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 150, soloDailyCap: 3, authAttempts: 1000 }, turnTimeoutMs: 60_000 });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

async function api(path: string, body?: object, token?: string, method?: string) {
  const r = await fetch(`${base}/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('comptes', () => {
  let token = '';
  let recovery = '';

  it('inscription : validations, pseudo unique, reprise de la progression invité', async () => {
    expect((await api('/register', { username: 'a', password: 'motdepasse' })).status).toBe(400);
    expect((await api('/register', { username: 'Sam', password: 'court' })).status).toBe(400);
    const r = await api('/register', { username: 'Sam', password: 'motdepasse1', guestProfile: { xp: 250, coins: 90, owned: ['felt-bordeaux'] } });
    expect(r.ok).toBe(true);
    expect(r.profile.coins).toBe(90);
    expect(r.profile.owned).toContain('felt-bordeaux');
    expect(r.recoveryCode).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    token = r.token;
    recovery = r.recoveryCode;
    expect((await api('/register', { username: 'sam', password: 'autre12345' })).status).toBe(409); // insensible à la casse
  });

  it('connexion, session, mauvais mot de passe', async () => {
    expect((await api('/login', { username: 'Sam', password: 'faux-faux' })).status).toBe(401);
    const r = await api('/login', { username: 'SAM', password: 'motdepasse1' });
    expect(r.ok).toBe(true);
    const me = await api('/me', undefined, r.token);
    expect(me.user.username).toBe('Sam');
    expect((await api('/me', undefined, 'jeton-bidon-jeton-bidon')).status).toBe(401);
  });

  it('boutique côté serveur : niveau et pièces vérifiés', async () => {
    expect((await api('/shop/buy', { id: 'dice-or' }, token)).status).toBe(400); // niveau 10 requis
    const ok = await api('/shop/buy', { id: 'dice-noir' }, token); // 200 pièces, en a 90
    expect(ok.status).toBe(400);
    const eq = await api('/shop/equip', { id: 'felt-bordeaux' }, token);
    expect(eq.profile.equipped.felt).toBe('felt-bordeaux');
  });

  it('partie solo : jeton obligatoire, durée minimale, plafond quotidien', async () => {
    expect((await api('/solo/end', { gameToken: 'x', won: true }, token)).status).toBe(400);
    const { gameToken } = await api('/solo/start', {}, token);
    expect((await api('/solo/end', { gameToken, won: true, rounds: 10, opponents: 3 }, token)).status).toBe(400); // trop tôt
    await wait(200);
    const end = await api('/solo/end', { gameToken, won: true, rounds: 10, opponents: 3, difficulty: 'normal', count421: 99, combos: { '421': 1 } }, token);
    expect(end.ok).toBe(true);
    expect(end.reward.won).toBe(true);
    expect(end.applied.profile.coins).toBeGreaterThan(0);
    expect(end.reward.lines.find((l: { label: string }) => l.label.startsWith('4-2-1')).coins).toBe(1); // 99 ramené à 1 (combos) × 1 pièce
    expect((await api('/solo/end', { gameToken, won: true }, token)).status).toBe(400); // jeton à usage unique
    for (let i = 0; i < 2; i++) { const g = await api('/solo/start', {}, token); await wait(160); await api('/solo/end', { gameToken: g.gameToken, won: false, rounds: 3 }, token); }
    const g4 = await api('/solo/start', {}, token); await wait(160);
    expect((await api('/solo/end', { gameToken: g4.gameToken, won: true, rounds: 9 }, token)).status).toBe(429);
  });

  it('partie en ligne entre deux comptes : récompense et classement calculés par le serveur', async () => {
    const lea = await api('/register', { username: 'Léa', password: 'motdepasse2' });
    const mk = (auth: string) => new Promise<{ s: Socket; game: GameState | null; reward: any; id: string }>((resolve) => {
      const c = { s: connect(base, { transports: ['websocket'], forceNew: true }), game: null as GameState | null, reward: null as any, id: '' };
      c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
      c.s.on('game:roll', (m: { state: GameState }) => (c.game = m.state));
      c.s.on('profile:reward', (r: unknown) => (c.reward = r));
      c.s.on('connect', () => resolve(c));
      void auth;
    });
    const a = await mk(token), b = await mk(lea.token);
    const send = (c: { s: Socket }, ev: string, p: object) => new Promise<any>((r) => c.s.emit(ev, p, r));
    const cr = await send(a, 'room:create', { name: 'Sam', auth: token, config: { variant: 'manches', rounds: 2, maxThrows: 1 } });
    a.id = cr.playerId;
    b.id = (await send(b, 'room:join', { code: cr.code, name: 'Léa', auth: lea.token })).playerId;
    await send(b, 'room:ready', { ready: true });
    expect((await send(a, 'room:start', {})).ok).toBe(true);
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && !(a.reward && b.reward)) {
      const g = a.game;
      if (g && g.phase !== 'fini') {
        const pid = currentPlayerId(g)!;
        const c = pid === a.id ? a : b;
        await send(c, g.throwsUsed === 0 ? 'game:roll' : 'game:stop', { keep: [false, false, false], version: g.version });
      }
      await wait(30);
    }
    expect(a.reward && b.reward).toBeTruthy();
    const lb = await api('/leaderboard', undefined, token);
    expect(lb.top.length).toBe(2);
    expect(lb.top.reduce((n: number, r: { onlineGames: number }) => n + r.onlineGames, 0)).toBe(2);
    expect(lb.me.rank).toBeGreaterThanOrEqual(1);
    // Amis
    expect((await api('/friends', { username: 'inconnu' }, token)).status).toBe(404);
    expect((await api('/friends', { username: 'léa' }, token)).ok).toBe(true);
    const fr = await api('/friends', undefined, token);
    expect(fr.friends.map((f: { username: string }) => f.username).sort()).toEqual(['Léa', 'Sam']);
    a.s.disconnect(); b.s.disconnect();
  });

  it('récupération par code, puis suppression du compte', async () => {
    expect((await api('/recover', { username: 'Sam', recoveryCode: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'nouveau123' })).status).toBe(401);
    const r = await api('/recover', { username: 'Sam', recoveryCode: recovery.toLowerCase(), newPassword: 'nouveau123' });
    expect(r.ok).toBe(true);
    expect(r.recoveryCode).not.toBe(recovery); // nouveau code
    expect((await api('/me', undefined, token)).status).toBe(401); // anciennes sessions fermées
    expect((await api('/login', { username: 'Sam', password: 'nouveau123' })).ok).toBe(true);
    expect((await api('/me', { password: 'faux' }, r.token, 'DELETE')).status).toBe(401);
    expect((await api('/me', { password: 'nouveau123' }, r.token, 'DELETE')).ok).toBe(true);
    expect((await api('/login', { username: 'Sam', password: 'nouveau123' })).status).toBe(401);
    // Le classement ne contient plus Sam
    const lea = await api('/login', { username: 'Léa', password: 'motdepasse2' });
    const lb = await api('/leaderboard', undefined, lea.token);
    expect(lb.top.map((u: { username: string }) => u.username)).toEqual(['Léa']);
  });
});

describe('profils et photos', () => {
  // Plus petit JPEG valide (1×1), et un faux fichier déguisé en image.
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const FAKE = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
  it('photo : format vérifié, servie avec le bon type, visible dans le profil public', async () => {
    const a = await api('/register', { username: 'Photo1', password: 'motdepasse1' });
    expect((await api('/me/photo', { dataUrl: FAKE }, a.token)).status).toBe(400);
    const up = await api('/me/photo', { dataUrl: JPEG }, a.token);
    expect(up.ok).toBe(true);
    const img = await fetch(`${base}${up.photo}`);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(img.headers.get('x-content-type-options')).toBe('nosniff');
    const pub = await api('/players/photo1');
    expect(pub.player.username).toBe('Photo1');
    expect(pub.player.photo).toBe(up.photo);
    expect(pub.player).not.toHaveProperty('coins'); // l'argent reste privé
    // Trois signalements de joueurs différents masquent la photo.
    for (let i = 0; i < 3; i++) {
      const r = await api('/register', { username: `Temoin${i}`, password: 'motdepasse1' });
      expect((await api('/report', { username: 'Photo1' }, r.token)).ok).toBe(true);
    }
    expect((await api('/players/Photo1')).player.photo).toBeNull();
    expect((await fetch(`${base}${up.photo}`)).status).toBe(404);
    // Supprimer sa photo
    await api('/me/photo', undefined, a.token, 'DELETE');
    expect((await api('/players/Photo1')).player.photo).toBeNull();
    expect((await api('/players/inconnu')).status).toBe(404);
  });
});
