/** Administration : « En ligne maintenant » (qui est connecté, où, depuis quand). Vrais échanges avec le serveur. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { cleanTabInfo, describeTab } from '../server/live';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', accounts: { minSoloMs: 100, authAttempts: 1000 }, stats: { adminUsers: ['Patron'] },
    turnTimeoutMs: 60_000, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, disconnectGraceMs: 100,
  });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

const api = async (path: string, body?: object, token?: string, headers: Record<string, string> = {}) => {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: r.status, ...(await r.json()) };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean | Promise<boolean>, ms = 10000) { const t = Date.now(); while (!(await fn())) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(30); } }
const presence = (device: string, token?: string, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148') => new Promise<Socket>((res) => {
  const s = connect(`${base}/presence`, { transports: ['websocket'], forceNew: true, auth: { device, token }, extraHeaders: { 'User-Agent': ua } });
  s.on('connect', () => res(s));
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

describe('En ligne maintenant (administration)', () => {
  let admin = '', joueur = '';
  const live = async () => (await api('/admin/live', undefined, admin)) as { status: number; rows: Row[]; summary: Row };
  const rowOf = async (pred: (r: Row) => boolean) => (await live()).rows.find(pred);

  it('réservé aux administrateurs', async () => {
    admin = (await api('/register', { username: 'Patron', password: 'motdepasse1' })).token;
    joueur = (await api('/register', { username: 'Lucie', password: 'motdepasse1' })).token;
    expect((await api('/admin/live')).status).toBe(403);
    expect((await api('/admin/live', undefined, joueur)).status).toBe(403);
    expect((await api('/admin/live', undefined, 'jeton-inventé')).status).toBe(403);
    expect((await live()).status).toBe(200);
  });

  it('invités et comptes, avec leur activité ; déconnexion = disparaît', async () => {
    // Visite d'un invité (pays d'après l'en-tête de l'hébergeur), puis présence au nouveau format.
    await api('/visit', { device: 'invite-cf-0001', tz: 'Europe/Paris', lang: 'fr-FR', landing: '/' }, undefined, { 'cf-ipcountry': 'BE' });
    const g = await presence('invite-cf-0001');
    g.emit('presence', { state: 'menu', screen: 'cf', view: 'collection', name: 'Lulu', avatar: '🦊' });
    await until(async () => (await rowOf((r) => r.displayName === 'Lulu'))?.activity.where === 'Collection de cartes');
    const gr = await rowOf((r) => r.displayName === 'Lulu');
    expect(gr.kind).toBe('invite');
    expect(gr.label).toMatch(/^Visiteur #[0-9a-f]{4}$/);
    expect(gr.activity.game).toBe('cf');
    expect(gr.activity.status).toBe('menu');
    expect(gr.country).toBe('BE');
    expect(gr.newcomer).toBe(true);
    expect(gr.device).toBe('mobile');
    expect(gr.avatar).toBe('🦊');

    // Invité au Courtisan, partie contre l'ordinateur.
    const c = await presence('invite-court-02', undefined, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    c.emit('presence', { state: 'solo', screen: 'dixmille', view: 'partie-solo' });
    await until(async () => (await rowOf((r) => r.activity.game === 'courtisan'))?.activity.status === 'partie');
    const cr = await rowOf((r) => r.activity.game === 'courtisan');
    expect(cr.activity.mode).toBe('solo');
    expect(cr.device).toBe('ordinateur');
    expect(cr.displayName).toBeNull();

    // Compte au menu du 421 : pseudo, niveau, pas de nom choisi exposé à la place du compte.
    const a = await presence('compte-lucie-01', joueur);
    a.emit('presence', { state: 'menu', screen: 'classic', name: 'Autre nom' });
    await until(async () => (await rowOf((r) => r.username === 'Lucie'))?.activity.where === 'Menu du 421');
    const ar = await rowOf((r) => r.username === 'Lucie');
    expect(ar.kind).toBe('compte');
    expect(ar.level).toBeGreaterThanOrEqual(1);
    expect(ar.activity.game).toBe('421');

    const l = await live();
    expect(l.summary.accounts).toBe(1);
    expect(l.summary.guests).toBe(2);
    expect(l.summary.playing).toBe(1);
    expect(l.summary.byGame.courtisan).toBe(1);
    expect(l.summary.byGame.cf).toBe(1);
    // Vie privée : ni identifiant brut d'appareil, ni adresse IP, ni email.
    const raw = JSON.stringify(l);
    for (const x of ['invite-cf-0001', 'compte-lucie-01', '127.0.0.1', '::1', '@']) expect(raw).not.toContain(x);

    g.disconnect(); c.disconnect(); a.disconnect();
    await until(async () => (await live()).rows.length === 0);
  });

  it('compte assis à une table du 421 : le serveur fait foi (code de la table)', async () => {
    const p = await presence('compte-lucie-01', joueur);
    p.emit('presence', { state: 'menu', screen: 'home' });
    const s = connect(base, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((r) => s.on('connect', () => r()));
    const r = await new Promise<{ code: string }>((res) => s.emit('room:create', { name: 'Lucie', auth: joueur, config: { variant: 'manches', rounds: 2, turnSeconds: 0 }, table: { stake: 0 } }, res));
    expect(r.code).toBeTruthy();
    await until(async () => (await rowOf((x) => x.username === 'Lucie'))?.activity.code === r.code);
    const row = await rowOf((x) => x.username === 'Lucie');
    expect(row.activity.game).toBe('421');
    expect(row.activity.status).toBe('salon');
    s.disconnect(); p.disconnect();
    await until(async () => (await live()).rows.length === 0);
  });

  it('plusieurs onglets regroupés par appareil ; ancien client sans les nouveaux champs', async () => {
    const t1 = await presence('appareil-onglets'), t2 = await presence('appareil-onglets');
    t1.emit('presence', { state: 'menu', screen: 'shop' });
    t2.emit('presence', { state: 'online', screen: 'online', view: 'partie', code: 'ZZZZZ' }); // table inconnue : code ignoré
    await until(async () => (await live()).rows.find((r) => r.tabs === 2)?.activity.status === 'partie');
    const l = await live();
    expect(l.rows.length).toBe(1);
    const row = l.rows[0];
    expect(row.activity.code).toBeNull();
    expect(row.activity.where).toBe('Partie en ligne');
    expect(row.otherTabs).toEqual(['Boutique']);
    t1.disconnect();
    await until(async () => (await live()).rows[0]?.tabs === 1);
    t2.disconnect();

    // Onglet resté sur une ancienne version : état en simple texte.
    const old = await presence('ancien-client-01');
    old.emit('presence', 'solo');
    await until(async () => (await live()).rows[0]?.activity.status === 'partie');
    const o = (await live()).rows[0];
    expect(o.oldClient).toBe(true);
    expect(o.activity.where).toBe('Partie solo');
    // Les statistiques publiques comptent toujours la partie solo.
    expect((await api('/stats')).live.gamesInProgress).toBe(1);
    old.disconnect();
    await until(async () => (await live()).rows.length === 0);
  });
});

describe('états de présence (nettoyage, description)', () => {
  it('rejette ce qui n’est pas attendu', () => {
    const i = cleanTabInfo({ state: 'pirate', screen: '<script>', view: 'DROP TABLE', code: 'a b', name: 'x'.repeat(50), extra: 1 });
    expect(i).toEqual({ state: 'menu', screen: undefined, view: undefined, code: undefined, name: 'x'.repeat(20), avatar: undefined, detailed: true });
    expect(cleanTabInfo(42)).toEqual({ state: 'menu', detailed: false });
    expect(cleanTabInfo('online')).toEqual({ state: 'online', detailed: false });
  });
  it('décrit les menus des trois jeux, les tables et le mode spectateur', () => {
    const d = (o: object, known = false) => describeTab(cleanTabInfo(o), null, () => known);
    expect(d({ state: 'menu', screen: 'dixmille', view: 'menu' }).where).toBe('Menu du Courtisan');
    expect(d({ state: 'menu', screen: 'cf', view: 'menu' }).where).toBe('Menu de Coups Fourrés');
    expect(d({ state: 'menu', screen: 'home' })).toMatchObject({ where: 'Menu principal', game: null, status: 'menu' });
    expect(d({ state: 'online', screen: 'cf' })).toMatchObject({ where: 'Partie en ligne', status: 'partie', mode: 'en ligne' });
    expect(d({ state: 'solo', screen: 'solo' })).toMatchObject({ game: '421', status: 'partie', mode: 'solo' });
    expect(d({ state: 'online', screen: 'tournament', view: 'partie', code: 'ABCDE' }, true)).toMatchObject({ mode: 'tournoi', where: 'Partie de tournoi', code: 'ABCDE' });
    expect(d({ state: 'menu', screen: 'watch', view: 'spectateur', code: 'ABCDE' }, true)).toMatchObject({ mode: 'spectateur', status: 'menu', code: 'ABCDE' });
    const seat = describeTab(cleanTabInfo('menu'), { game: 'courtisan', code: 'QWERT', status: 'partie' }, () => true);
    expect(seat).toMatchObject({ game: 'courtisan', code: 'QWERT', status: 'partie', mode: 'en ligne' });
  });
});
