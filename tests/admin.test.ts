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

  it('parcours des visiteurs : étapes comptées une fois, par page d’arrivée', async () => {
    const ua = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Mobile' };
    await api('/visit', { device: 'parcours-0003', ref: 'https://www.google.com/', landing: '/strategie-421' }, undefined, 'POST', ua);
    expect((await api('/visit/event', { device: 'parcours-0003', kind: 'guide_play', page: '/strategie-421' }, undefined, 'POST', ua)).first).toBe(true);
    expect((await api('/visit/event', { device: 'parcours-0003', kind: 'solo' }, undefined, 'POST', ua)).first).toBe(true);
    expect((await api('/visit/event', { device: 'parcours-0003', kind: 'solo' }, undefined, 'POST', ua)).first).toBe(false); // une seule fois
    await api('/visit/event', { device: 'parcours-0003', kind: 'online' }, undefined, 'POST', ua);
    await api('/visit/event', { device: 'parcours-0003', kind: 'invite' }, undefined, 'POST', ua);
    await api('/visit/event', { device: 'visiteur-0002', kind: 'invited' }, undefined, 'POST', ua);
    expect((await api('/visit/event', { device: 'parcours-0003', kind: 'achat' }, undefined, 'POST', ua)).status).toBe(400);
    expect((await api('/visit/event', { device: 'x', kind: 'solo' }, undefined, 'POST', ua)).status).toBe(400);
    expect((await api('/visit/event', { device: 'robot-00001', kind: 'solo' }, undefined, 'POST', { 'User-Agent': 'Googlebot/2.1' })).skipped).toBe(true);
    const f = (await api('/admin/visitors', undefined, adminTok)).funnel;
    expect(f).toMatchObject({ visitors: 3, guidePlay: 1, solo: 1, online: 1, played: 1, invite: 1, invited: 1, returned: 0 });
    expect(f.byLanding.find((r: { landing: string }) => r.landing === '/strategie-421')).toMatchObject({ visitors: 1, guidePlay: 1, played: 1 });
  });
});

import { creditBeat, BEAT_MAX_S, DAY_MAX_S } from '../server/admin';
import { countryName, flag, guessCountry } from '../shared/geo';

describe('pays d’après le fuseau horaire', () => {
  it('fuseau → pays, repli sur la région de la langue, puis inconnu', () => {
    expect(guessCountry('Europe/Brussels', 'fr-FR')).toEqual({ country: 'BE', source: 'fuseau' });
    expect(guessCountry('America/Montreal', 'fr')).toEqual({ country: 'CA', source: 'fuseau' });
    expect(guessCountry('America/Toronto', 'fr-CA').country).toBe('CA');
    expect(guessCountry('Africa/Casablanca', 'ar').country).toBe('MA');
    expect(guessCountry('Africa/Abidjan', 'fr').country).toBe('CI');
    expect(guessCountry('Africa/Kinshasa', 'fr').country).toBe('CD');
    expect(guessCountry('America/Martinique', 'fr').country).toBe('MQ');
    expect(guessCountry('Indian/Reunion', 'fr').country).toBe('RE');
    expect(guessCountry('Europe/Zurich', 'de-CH').country).toBe('CH');
    expect(guessCountry('Europe/Luxembourg', 'fr').country).toBe('LU');
    expect(guessCountry('UTC', 'fr-BE')).toEqual({ country: 'BE', source: 'langue' });
    expect(guessCountry('', 'fr')).toEqual({ country: null, source: null });
    expect(countryName('BE')).toBe('Belgique');
    expect(countryName('CI')).toBe('Côte d’Ivoire');
    expect(countryName(null)).toBe('Inconnu');
    expect(flag('BE')).toBe('🇧🇪');
  });
});

describe('temps passé : cumul plafonné', () => {
  it('jamais plus que le temps écoulé, que le plafond par envoi et par jour', () => {
    expect(creditBeat(30, 30, 0)).toBe(30);
    expect(creditBeat(30, null, 0)).toBe(30); // premier battement
    expect(creditBeat(3600, 3600, 0)).toBe(BEAT_MAX_S);
    expect(creditBeat(60, 2, 0)).toBe(7); // envois en rafale
    expect(creditBeat(-5, 30, 0)).toBe(0);
    expect(creditBeat('x', 30, 0)).toBe(0);
    expect(creditBeat(30, 30, DAY_MAX_S - 10)).toBe(10);
    expect(creditBeat(30, 30, DAY_MAX_S)).toBe(0);
  });
});

describe('liste des visiteurs', () => {
  let srv2: Awaited<ReturnType<typeof startServer>>;
  let b2 = '';
  let clock = Date.parse('2026-10-01T10:00:00Z');
  const req = async (path: string, body?: object, token?: string, headers: Record<string, string> = {}) => {
    const r = await fetch(`${b2}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone) Mobile', ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, ...(await r.json()) };
  };
  beforeAll(async () => {
    srv2 = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 1000 }, stats: { adminUsers: ['Chef'] }, admin: { now: () => clock } });
    b2 = `http://localhost:${srv2.port}`;
  });
  afterAll(async () => { await srv2.close(); });

  it('une ligne par visiteur : pays, temps, retour J1 / J7, compte lié ; données effacées avec le compte', async () => {
    const chef = (await req('/register', { username: 'Chef', password: 'motdepasse1' })).token;
    // A : Belgique, revient le lendemain et 8 jours plus tard. B : Québec, une seule visite. C : pas de fuseau, langue fr-CH.
    await req('/visit', { device: 'visiteur-AAAA', tz: 'Europe/Brussels', lang: 'fr-FR', ref: 'https://www.google.com/' });
    await req('/visit', { device: 'visiteur-BBBB', tz: 'America/Montreal', lang: 'fr-CA', utm: { utm_source: 'facebook' } });
    await req('/visit', { device: 'visiteur-CCCC', lang: 'fr-CH' }, undefined, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' });
    // Temps : battements de 30 s ; une rafale ne compte pas plus que le temps écoulé.
    for (let i = 0; i < 4; i++) { clock += 30_000; expect((await req('/visit/beat', { device: 'visiteur-AAAA', seconds: 30 })).credited).toBe(30); }
    expect((await req('/visit/beat', { device: 'visiteur-AAAA', seconds: 9999 })).credited).toBe(5); // 0 s écoulée : 5 s de marge au plus
    clock += 30_000; await req('/visit/beat', { device: 'visiteur-BBBB', seconds: 30 });
    expect((await req('/visit/beat', { device: 'inconnu-0000', seconds: 30 })).credited).toBe(0);
    clock += 86400_000;
    await req('/visit', { device: 'visiteur-AAAA', tz: 'Europe/Brussels', lang: 'fr-FR' });
    clock += 8 * 86400_000;
    await req('/visit', { device: 'visiteur-AAAA', tz: 'Europe/Brussels', lang: 'fr-FR' });
    const reg = await req('/register', { username: 'Alice', password: 'motdepasse1' });
    await req('/visit', { device: 'visiteur-AAAA', link: true }, reg.token);

    const list = await req('/admin/people?sort=time', undefined, chef);
    expect(list.status).toBe(200);
    const a = list.people.find((p: { username: string }) => p.username === 'Alice');
    expect(a).toMatchObject({ country: 'BE', countryName: 'Belgique', visits: 3, seconds: 125, device: 'mobile', source: 'google.com' });
    expect(a.countrySrc).toBe('d’après le fuseau horaire');
    expect(a.back).toEqual({ d1: true, d7: true, d30: null });
    expect(list.people[0].username).toBe('Alice'); // tri par temps passé
    const bq = list.people.find((p: { country: string }) => p.country === 'CA');
    expect(bq).toMatchObject({ username: null, visits: 1, seconds: 30, back: { d1: false, d7: false, d30: null } });
    expect(bq.label).toMatch(/^Visiteur #[0-9a-f]{4}$/);
    expect(bq.source).toContain('facebook');
    expect(list.people.find((p: { country: string }) => p.country === 'CH')).toMatchObject({ device: 'ordinateur', countrySrc: 'd’après la langue du navigateur' });
    // Filtres et pagination
    expect((await req('/admin/people?kind=comptes', undefined, chef)).people.every((p: { userId: string }) => p.userId)).toBe(true);
    expect((await req('/admin/people?kind=visiteurs&country=CA', undefined, chef)).total).toBe(1);
    expect((await req('/admin/people?device=ordinateur', undefined, chef)).total).toBe(1);
    expect((await req(`/admin/people?q=${encodeURIComponent(bq.label.slice(-5))}`, undefined, chef)).total).toBe(1);
    const p1 = await req('/admin/people?size=5&page=0', undefined, chef);
    expect(p1.people.length).toBeLessThanOrEqual(5);
    // Synthèses
    const au = await req('/admin/audience?days=30', undefined, chef);
    expect(au.totals.seconds).toBe(155);
    expect(au.countries.find((c: { code: string }) => c.code === 'BE')).toMatchObject({ visitors: 1, accounts: 1, d1: 1 });
    const ret = await req('/admin/retention?by=day&who=visiteurs', undefined, chef);
    expect(ret.rows.at(-1)).toMatchObject({ size: 3, d1: 1, d7: 1 });
    // Refusé aux autres
    expect((await req('/admin/people', undefined, reg.token)).status).toBe(403);
    expect((await req('/admin/audience', undefined, reg.token)).status).toBe(403);
    // Suppression du compte : ses visites et son temps disparaissent.
    expect((await fetch(`${b2}/api/me`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` }, body: JSON.stringify({ password: 'motdepasse1' }) })).status).toBe(200);
    const after = await req('/admin/people', undefined, chef);
    expect(after.people.some((p: { country: string }) => p.country === 'BE')).toBe(false);
    expect((await req('/admin/audience?days=30', undefined, chef)).totals.seconds).toBe(30);
  });
});
