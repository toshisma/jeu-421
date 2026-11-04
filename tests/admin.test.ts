/** Outils d'administration : vrais échanges avec le serveur (base en mémoire). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 1000 }, stats: { adminUsers: ['Patron'] }, turnTimeoutMs: 60_000 });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

async function api(path: string, body?: object, token?: string, method?: string, headers: Record<string, string> = {}) {
  const r = await fetch(`${base}/api${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
}
const call = (s: Socket, ev: string, p: object) => new Promise<any>((res) => s.emit(ev, p, res));

describe('administration', () => {
  let adminTok = '', joeTok = '', joeId = '';

  it('prépare un administrateur et un joueur', async () => {
    adminTok = (await api('/register', { username: 'Patron', password: 'motdepasse1' })).token;
    const j = await api('/register', { username: 'Joe', password: 'motdepasse1' });
    joeTok = j.token; joeId = j.user.id;
    expect(adminTok && joeTok).toBeTruthy();
  });

  it('refuse toutes les commandes à un non-administrateur', async () => {
    for (const [path, body] of [
      ['/admin/players', undefined], [`/admin/players/${joeId}`, undefined], ['/admin/overview', undefined], ['/admin/log', undefined],
      ['/admin/visitors', undefined], ['/admin/retention', undefined], ['/admin/activity', undefined], ['/admin/economy', undefined],
      [`/admin/players/${joeId}/coins`, { delta: 1000 }], [`/admin/players/${joeId}/ban`, {}], [`/admin/players/${joeId}/items`, { id: 'felt-bordeaux' }],
    ] as [string, object | undefined][]) {
      expect((await api(path, body, joeTok)).status).toBe(403);
      expect((await api(path, body)).status).toBe(403);
    }
    expect((await api('/me', undefined, joeTok)).profile.coins).toBe(0);
  });

  it('recherche et fiche d’un joueur', async () => {
    const l = await api('/admin/players?q=jo', undefined, adminTok);
    expect(l.players.map((p: { username: string }) => p.username)).toContain('Joe');
    const f = await api('/admin/players/Joe', undefined, adminTok);
    expect(f.player).toMatchObject({ username: 'Joe', coins: 0, level: 1, ban: null, bags: 0 });
    expect(f.player.createdAt).toBeGreaterThan(0);
    expect((await api('/admin/players/Personne', undefined, adminTok)).status).toBe(404);
  });

  it('donne et retire des pièces, côté serveur, sans passer sous zéro', async () => {
    expect((await api(`/admin/players/${joeId}/coins`, { delta: 500 }, adminTok)).player.coins).toBe(500);
    expect((await api(`/admin/players/${joeId}/coins`, { delta: -200 }, adminTok)).player.coins).toBe(300);
    expect((await api(`/admin/players/${joeId}/coins`, { delta: -1000 }, adminTok)).status).toBe(400);
    expect((await api(`/admin/players/${joeId}/coins`, { delta: 'abc' }, adminTok)).status).toBe(400);
    expect((await api('/me', undefined, joeTok)).profile.coins).toBe(300);
    const eco = await api('/admin/economy', undefined, adminTok);
    expect(eco.bySource.find((s: { source: string }) => s.source === 'admin')).toMatchObject({ earned: 500, spent: 200 });
  });

  it('donne et retire des objets et des sacs ; l’objet retiré est déséquipé', async () => {
    const g = await api(`/admin/players/${joeId}/items`, { id: 'felt-bordeaux', action: 'give' }, adminTok);
    expect(g.player.items.map((i: { id: string }) => i.id)).toContain('felt-bordeaux');
    expect((await api(`/admin/players/${joeId}/items`, { id: 'felt-bordeaux', action: 'give' }, adminTok)).status).toBe(400);
    expect((await api(`/admin/players/${joeId}/items`, { id: 'objet-inconnu' }, adminTok)).status).toBe(400);
    expect((await api(`/admin/players/${joeId}/items`, { id: 'dc-craie', action: 'give' }, adminTok)).status).toBe(200); // dé de collection
    expect((await api('/shop/equip', { id: 'felt-bordeaux' }, joeTok)).profile.equipped.felt).toBe('felt-bordeaux');
    const r = await api(`/admin/players/${joeId}/items`, { id: 'felt-bordeaux', action: 'remove' }, adminTok);
    expect(r.player.items.map((i: { id: string }) => i.id)).not.toContain('felt-bordeaux');
    const me = (await api('/me', undefined, joeTok)).profile;
    expect(me.owned).not.toContain('felt-bordeaux');
    expect(me.equipped.felt).not.toBe('felt-bordeaux');
    expect((await api(`/admin/players/${joeId}/bags`, { delta: 3 }, adminTok)).player.bags).toBe(3);
    expect((await api(`/admin/players/${joeId}/bags`, { delta: -5 }, adminTok)).status).toBe(400);
    expect((await api(`/admin/players/${joeId}/bags`, { delta: -1 }, adminTok)).player.bags).toBe(2);
    // Le joueur ouvre un sac : noté dans son activité.
    expect((await api('/bags/open', {}, joeTok)).ok).toBe(true);
    const act = await api('/admin/activity?user=Joe', undefined, adminTok);
    expect(act.activity.some((a: { kind: string }) => a.kind === 'sac')).toBe(true);
    expect(act.activity.some((a: { kind: string }) => a.kind === 'admin')).toBe(true);
  });

  it('suspend : connexion, API et jeu en ligne refusés ; session en cours coupée ; puis rétablit', async () => {
    // Joe a une connexion de présence ouverte.
    const pres = connect(`${base}/presence`, { transports: ['websocket'], forceNew: true, auth: { device: 'appareil-JOE1', token: joeTok } });
    await new Promise<void>((r) => pres.on('connect', () => r()));
    const banned = new Promise<string>((r) => pres.on('account:banned', (m: { text: string }) => r(m.text)));
    await new Promise((r) => setTimeout(r, 50));
    expect((await api(`/admin/players/Patron/ban`, {}, adminTok)).status).toBe(400); // pas un admin
    const b = await api(`/admin/players/${joeId}/ban`, { reason: 'Triche', days: 3 }, adminTok);
    expect(b.player.ban).toMatchObject({ reason: 'Triche', by: 'Patron' });
    expect(await banned).toContain('Votre compte est suspendu');
    const me = await api('/me', undefined, joeTok);
    expect(me.status).toBe(403);
    expect(me.banned).toBe(true);
    expect(me.error).toContain('Votre compte est suspendu');
    expect(me.error).toContain('Triche');
    const login = await api('/login', { username: 'joe', password: 'motdepasse1' });
    expect(login.status).toBe(403);
    expect(login.error).toContain('Votre compte est suspendu');
    const s = connect(base, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((r) => s.on('connect', () => r()));
    const a = await call(s, 'room:create', { name: 'Joe', auth: joeTok });
    expect(a.ok).toBe(false);
    expect(a.error).toContain('Votre compte est suspendu');
    // Un invité, lui, joue toujours.
    expect((await call(s, 'room:create', { name: 'Invité' })).ok).toBe(true);
    s.disconnect(); pres.disconnect();

    const u = await api(`/admin/players/${joeId}/unban`, {}, adminTok);
    expect(u.player.ban).toBeNull();
    expect((await api('/me', undefined, joeTok)).status).toBe(200);
    expect((await api('/login', { username: 'Joe', password: 'motdepasse1' })).ok).toBe(true);
    expect((await api(`/admin/players/${joeId}/unban`, {}, adminTok)).status).toBe(400);
  });

  it('suspension définitive par défaut ; journal des commandes', async () => {
    const b = await api(`/admin/players/${joeId}/ban`, {}, adminTok);
    expect(b.player.ban.until).toBeNull();
    expect((await api(`/admin/players/${joeId}/ban`, { days: 0 }, adminTok)).status).toBe(400);
    await api(`/admin/players/${joeId}/unban`, {}, adminTok);
    const log = (await api('/admin/log', undefined, adminTok)).log as { admin: string; action: string; target: string; details: string }[];
    expect(log.every((l) => l.admin === 'Patron' && l.target === 'Joe')).toBe(true);
    const actions = log.map((l) => l.action);
    for (const a of ['coins+', 'coins-', 'item+', 'item-', 'bags+', 'bags-', 'ban', 'unban']) expect(actions).toContain(a);
  });

  it('visites anonymes, conversion et tableaux de bord', async () => {
    const ua = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile', 'cf-ipcountry': 'BE' };
    expect((await api('/visit', { device: 'visiteur-0001', ref: 'https://www.google.com/search?q=421', utm: { utm_source: 'test' }, lang: 'fr-BE', landing: '/' }, undefined, 'POST', ua)).ok).toBe(true);
    expect((await api('/visit', { device: 'visiteur-0001', ref: '', landing: '/' }, undefined, 'POST', ua)).skipped).toBe(true); // même demi-heure
    await api('/visit', { device: 'visiteur-0002', ref: '', landing: '/regles-du-421.html' }, undefined, 'POST', { 'User-Agent': 'Mozilla/5.0 (X11; Linux)' });
    const reg = await api('/register', { username: 'Nouveau', password: 'motdepasse1' });
    await api('/visit', { device: 'visiteur-0001', link: true }, reg.token);
    const v = await api('/admin/visitors', undefined, adminTok);
    expect(v.totals).toMatchObject({ visits: 2, visitors: 2 });
    expect(v.referrers.map((r: { k: string }) => r.k)).toContain('google.com');
    expect(v.countries[0]).toMatchObject({ k: 'BE' });
    expect(v.devices.map((r: { k: string }) => r.k).sort()).toEqual(['mobile', 'ordinateur']);
    expect(v.conversion).toEqual({ newVisitors: 2, converted: 1 });
    const o = await api('/admin/overview', undefined, adminTok);
    expect(o.users).toBe(3);
    expect(o.days).toHaveLength(30);
    expect(o.active.today).toBeGreaterThanOrEqual(2);
    const ret = await api('/admin/retention?by=day', undefined, adminTok);
    expect(ret.rows[0].size).toBe(3);
    expect(ret.rows[0].d1).toBeNull(); // trop tôt
  });
});
