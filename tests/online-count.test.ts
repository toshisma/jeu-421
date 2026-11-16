/**
 * Accueil : nombre de personnes sur le site et dans chaque jeu (GET /api/online).
 * Nombres seulement (aucune information individuelle), robots exclus, un appareil = 1, la table où
 * le serveur voit un compte assis fait foi. Vrais échanges avec le serveur + cas unitaires.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { cachedOnline, countOnline, screenGame, type OnlineGame } from '../server/online-count';
import { cleanTabInfo, type PresenceEntry } from '../server/live';
import { enligneFr } from '../shared/i18n/zones/enligne.fr';
import { enligneEn } from '../shared/i18n/zones/enligne.en';
import { enligneDe } from '../shared/i18n/zones/enligne.de';
import { enligneNl } from '../shared/i18n/zones/enligne.nl';

const MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', turnTimeoutMs: 60_000, accounts: { minSoloMs: 100, authAttempts: 1000 } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean | Promise<boolean>, ms = 10000) { const t = Date.now(); while (!(await fn())) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(50); } }
const api = async (path: string, body?: object) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json' } });
  return { status: r.status, ...(await r.json()) };
};
const presence = (device: string, ua = MOBILE, token?: string) => new Promise<Socket>((res) => {
  const s = connect(`${base}/presence`, { transports: ['websocket'], forceNew: true, auth: { device, token }, extraHeaders: { 'User-Agent': ua } });
  s.on('connect', () => res(s));
});
const sock = (path = '') => new Promise<Socket>((res) => { const s = connect(`${base}${path}`, { transports: ['websocket'], forceNew: true }); s.on('connect', () => res(s)); });
const emit = <T = Record<string, unknown>>(s: Socket, ev: string, data: object) => new Promise<T>((res) => s.emit(ev, data, res));
type Online = { status: number; ok: boolean; site: number; games: Record<OnlineGame, number>; at: number };
/** La réponse est gardée 5 s en cache : on attend la valeur voulue. */
const online = async () => (await api('/online')) as Online;
const expectOnline = async (site: number, games: Record<OnlineGame, number>) => {
  await until(async () => { const o = await online(); return o.site === site && JSON.stringify(o.games) === JSON.stringify(games); }, 12_000);
};

describe('GET /api/online (accueil)', () => {
  it('nombres seulement : ni nom, ni appareil, ni code de table', async () => {
    const o = await online();
    expect(o.status).toBe(200);
    expect(Object.keys(o).sort()).toEqual(['at', 'games', 'ok', 'site', 'status']);
    expect(Object.keys(o.games).sort()).toEqual(['421', 'courtisan', 'cf', 'poker'].sort());
    for (const v of [o.site, ...Object.values(o.games)]) expect(Number.isInteger(v)).toBe(true);
  });

  it('un invité dans chaque jeu, un robot exclu, deux onglets = un appareil, un compte assis à une table compté dans son jeu', async () => {
    const u1 = await api('/register', { username: 'Comptine', password: 'motdepasse1' });
    const u2 = await api('/register', { username: 'Pokerine', password: 'motdepasse1' });
    const u3 = await api('/register', { username: 'Courtine', password: 'motdepasse1' });
    const opened: Socket[] = [];
    const tab = async (device: string, info: object, ua = MOBILE, token?: string) => { const s = await presence(device, ua, token); opened.push(s); s.emit('presence', info); return s; };

    await tab('invite-421-0001', { state: 'online', screen: 'online', view: 'partie', name: 'Ludo' });
    await tab('invite-cf-00001', { state: 'menu', screen: 'cf', view: 'decks' });
    await tab('invite-dm-00001', { state: 'solo', screen: 'dixmille', view: 'partie-solo' });
    await tab('invite-pm-00001', { state: 'menu', screen: 'poker', view: 'menu' });
    await tab('invite-home-001', { state: 'menu', screen: 'home' });
    // Deux onglets du même appareil : boutique et menu de Coups Fourrés (le plus récent) → 1 sur le site, 1 dans CF.
    await tab('invite-2tabs-01', { state: 'menu', screen: 'shop' });
    await wait(20);
    await tab('invite-2tabs-01', { state: 'menu', screen: 'cf', view: 'menu' });
    // Robots : Googlebot et navigateur sans écran, même s'ils annoncent une partie.
    await tab('robot-google-01', { state: 'online', screen: 'online', view: 'partie' }, GOOGLEBOT);
    await tab('robot-headless1', { state: 'menu', screen: 'poker' }, 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/130.0 Safari/537.36');

    await expectOnline(6, { '421': 1, cf: 2, courtisan: 1, poker: 1 });

    // Comptes assis à de vraies tables (421, Poker menteur, Courtisan) alors que leur onglet dit « accueil » :
    // la table fait foi. Les ordinateurs éventuels des tables ne comptent jamais.
    await tab('compte-421-0001', { state: 'menu', screen: 'home' }, MOBILE, u1.token);
    await tab('compte-pm-00001', { state: 'menu', screen: 'home' }, MOBILE, u2.token);
    await tab('compte-dm-00001', { state: 'menu', screen: 'shop' }, MOBILE, u3.token);
    const s421 = await sock(); opened.push(s421);
    const r421 = await emit<{ code: string }>(s421, 'room:create', { name: 'Comptine', auth: u1.token, config: { variant: 'manches', rounds: 2, turnSeconds: 0 }, table: { stake: 0 } });
    expect(r421.code).toBeTruthy();
    const spm = await sock('/poker'); opened.push(spm);
    const rpm = await emit<{ code?: string; error?: string }>(spm, 'table:create', { name: 'Pokerine', auth: u2.token, options: { lives: 3 } });
    expect(rpm.code).toBeTruthy();
    const sdm = await sock('/dixmille'); opened.push(sdm);
    const rdm = await emit<{ code?: string; error?: string }>(sdm, 'table:create', { name: 'Courtine', auth: u3.token, target: 2000 });
    expect(rdm.code).toBeTruthy();

    await expectOnline(9, { '421': 2, cf: 2, courtisan: 2, poker: 2 });

    // Vie privée : rien d'individuel dans la réponse.
    const raw = JSON.stringify(await online());
    for (const x of ['invite-421-0001', 'Ludo', 'Comptine', 'Pokerine', 'Courtine', r421.code, rpm.code!, rdm.code!, '127.0.0.1']) expect(raw).not.toContain(x);

    for (const s of opened) s.disconnect();
    await expectOnline(0, { '421': 0, cf: 0, courtisan: 0, poker: 0 });
  }, 40_000);
});

describe('comptage (cas unitaires)', () => {
  let t = 1000;
  const e = (device: string, info: object | string, extra: Partial<PresenceEntry> = {}): PresenceEntry =>
    ({ device, since: 0, changedAt: t++, kind: 'mobile', info: cleanTabInfo(info), ...extra });

  it('robots exclus, onglets regroupés, l’onglet qui joue avant le plus récent', () => {
    const c = countOnline([
      e('a', { state: 'menu', screen: 'home' }),
      e('b', { state: 'solo', screen: 'solo' }), e('b', { state: 'menu', screen: 'poker' }), // b joue au 421 (onglet en partie)
      e('c', { state: 'menu', screen: 'cf' }), e('c', { state: 'menu', screen: 'dixmille' }), // c : le plus récent (Courtisan)
      e('r', { state: 'online', screen: 'online' }, { robot: true }),
      e('o', 'online'), // ancienne version : sur le site, jeu inconnu
    ], () => null);
    expect(c).toEqual({ site: 4, games: { '421': 1, cf: 0, courtisan: 1, poker: 0 } });
  });

  it('la table où le serveur voit le compte assis fait foi', () => {
    const seats: Record<string, OnlineGame> = { u1: 'cf', u2: 'poker' };
    const c = countOnline([
      e('a', { state: 'menu', screen: 'home' }, { userId: 'u1' }),
      e('b', { state: 'menu', screen: 'classic' }, { userId: 'u2' }),
      e('c', { state: 'menu', screen: 'classic' }, { userId: 'u3' }),
    ], (id) => seats[id] ?? null);
    expect(c.games).toEqual({ '421': 1, cf: 1, courtisan: 0, poker: 1 });
  });

  it('écrans rattachés aux jeux (Tournée des comptoirs = 421) ; accueil, boutique… : aucun', () => {
    expect(screenGame('tdc-game')).toBe('421');
    expect(screenGame('watch')).toBe('421');
    expect(screenGame('poker')).toBe('poker');
    expect(screenGame('dixmille')).toBe('courtisan');
    for (const s of ['home', 'shop', 'friends', 'collection', 'settings', undefined]) expect(screenGame(s)).toBeNull();
  });

  it('cache de quelques secondes', () => {
    let now = 0, calls = 0;
    const get = cachedOnline(() => { calls++; return { site: calls, games: { '421': 0, cf: 0, courtisan: 0, poker: 0 } }; }, () => now, 5000);
    expect(get().site).toBe(1);
    now = 4999; expect(get().site).toBe(1);
    now = 5000; expect(get().site).toBe(2);
    expect(calls).toBe(2);
  });
});

describe('textes de la zone « enligne »', () => {
  it('clés en/de/nl complètes, non vides, mêmes variables', () => {
    for (const d of [enligneEn, enligneDe, enligneNl] as Record<string, string>[]) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(enligneFr).sort());
      for (const [k, v] of Object.entries(enligneFr)) {
        expect(d[k]?.trim()).toBeTruthy();
        expect((d[k].match(/\{\w+\}/g) ?? []).sort()).toEqual((v.match(/\{\w+\}/g) ?? []).sort());
      }
    }
  });
});
