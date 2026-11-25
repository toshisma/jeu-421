/** Boîte à idées / signaler un souci : envoi (invité, compte), validation, débit, administration, notifications. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { cleanFbContext, cleanFbText } from '../shared/feedback';
import { translate, LANGS } from '../shared/i18n';
import { fbFr } from '../shared/i18n/zones/feedback.fr';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 }, stats: { adminUsers: ['Gerant'] }, feedback: { account: 3, ip: 1000 } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { ...(await r.json()), http: r.status };
};
const reg = async (u: string) => (await api('/register', { username: u, password: 'motdepasse1' })).token as string;
const ctx = { version: '0.60', lang: 'en', viewport: '360×640', screen: 'home' };

describe('boîte à idées', () => {
  let admin = '', alice = '', bob = '';
  let aliceId = 0;
  beforeAll(async () => { admin = await reg('Gerant'); alice = await reg('Alicefb'); bob = await reg('Bobfb'); });

  it('nettoyage du texte et du contexte', () => {
    expect(cleanFbText('  Bonjour\u0000\u0007 le​ monde  ')).toBe('Bonjour le monde');
    expect(cleanFbText('a\n\n\n\nb')).toBe('a\n\nb');
    expect(cleanFbContext({ version: '0.60', lang: 'xx', viewport: '360×640', screen: '<script>' })).toEqual({ version: '0.60', lang: '', viewport: '360×640', screen: '' });
  });

  it('validation : type, longueur', async () => {
    expect((await api('/feedback', { kind: 'bof', text: 'Un texte assez long' })).http).toBe(400);
    const short = await api('/feedback', { kind: 'idee', text: 'court' });
    expect(short).toMatchObject({ http: 400, code: 'fb.err.short' });
    expect((await api('/feedback', { kind: 'idee', text: 'x'.repeat(1001) })).http).toBe(400);
    expect((await api('/feedback', { kind: 'idee', text: '\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008abc' })).http).toBe(400);
  });

  it('un invité peut envoyer (sans suivi possible)', async () => {
    const r = await api('/feedback', { kind: 'souci', text: 'Le bouton Jouer ne répond pas sur mon téléphone.', context: ctx });
    expect(r).toMatchObject({ ok: true, account: false });
    expect((await api('/feedback/mine')).http).toBe(401);
  });

  it('un compte envoie, voit seulement ses envois', async () => {
    const r = await api('/feedback', { kind: 'idee', text: 'Un mode à deux contre deux serait génial !', notify: true, context: ctx }, alice);
    expect(r).toMatchObject({ ok: true, account: true });
    aliceId = r.id;
    await api('/feedback', { kind: 'autre', text: 'Merci pour ce jeu, on y joue tous les soirs.' }, bob);
    const mine = await api('/feedback/mine', undefined, alice);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ id: aliceId, kind: 'idee', status: 'recue', reply: null, fresh: false });
    expect((await api('/feedback/mine', undefined, bob)).items.map((x: { text: string }) => x.text)).toEqual(['Merci pour ce jeu, on y joue tous les soirs.']);
  });

  it('débit : 3 par compte et par jour dans ce test', async () => {
    const t = await reg('Spamfb');
    for (let i = 0; i < 3; i++) expect((await api('/feedback', { kind: 'idee', text: `Idée numéro ${i} pour le jeu` }, t)).ok).toBe(true);
    const r = await api('/feedback', { kind: 'idee', text: 'Encore une idée de plus' }, t);
    expect(r).toMatchObject({ http: 429, code: 'fb.err.rate' });
  });

  it('débit par adresse (invités compris)', async () => {
    const s2 = await startServer({ port: 0, dbPath: ':memory:', feedback: { ip: 2 } });
    const post = async () => (await fetch(`http://localhost:${s2.port}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'idee', text: 'Une idée pour le jeu' }) })).status;
    expect(await post()).toBe(200);
    expect(await post()).toBe(200);
    expect(await post()).toBe(429);
    await s2.close();
  });

  it('administration réservée aux admins', async () => {
    expect((await api('/admin/feedback', undefined, alice)).http).toBe(403);
    expect((await api('/admin/feedback')).http).toBe(403);
    expect((await api(`/admin/feedback/${aliceId}`, { status: 'faite' }, alice)).http).toBe(403);
    expect((await api('/admin/feedback/unread', undefined, bob)).http).toBe(403);
    const list = await api('/admin/feedback', undefined, admin);
    expect(list.ok).toBe(true);
    expect(list.unread).toBeGreaterThanOrEqual(3);
    const item = list.items.find((x: { id: number }) => x.id === aliceId);
    expect(item).toMatchObject({ username: 'Alicefb', guest: false, notify: true, context: ctx });
    expect(JSON.stringify(list)).not.toMatch(/127\.0\.0\.1|::1|ffff/);
    const guest = list.items.find((x: { guest: boolean }) => x.guest);
    expect(guest.username).toBeNull();
    expect((await api(`/admin/feedback?kind=souci`, undefined, admin)).items.every((x: { kind: string }) => x.kind === 'souci')).toBe(true);
    // Pas de réponse à un invité ; statut inconnu refusé ; réponse trop longue refusée.
    expect((await api(`/admin/feedback/${guest.id}`, { reply: 'Merci !' }, admin)).http).toBe(400);
    expect((await api(`/admin/feedback/${aliceId}`, { status: 'bof' }, admin)).http).toBe(400);
    expect((await api(`/admin/feedback/${aliceId}`, { reply: 'x'.repeat(301) }, admin)).http).toBe(400);
  });

  it('Lue : pas de notification ; Faite : notification traduite, panneau du jeu, journal admin', async () => {
    const before = srv.accounts.social.sent.length;
    const r1 = await api(`/admin/feedback/${aliceId}`, { status: 'lue' }, admin);
    expect(r1).toMatchObject({ ok: true, notified: false, item: { status: 'lue' } });
    expect(srv.accounts.social.sent.length).toBe(before);
    const r2 = await api(`/admin/feedback/${aliceId}`, { status: 'faite' }, admin);
    expect(r2).toMatchObject({ ok: true, notified: true, item: { status: 'faite' } });
    const sent = srv.accounts.social.sent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('Votre idée a été réalisée, merci !');
    const n = await api('/notifications', undefined, alice);
    expect(n.ideas).toEqual([expect.objectContaining({ id: aliceId, status: 'faite' })]);
    expect(n.count).toBeGreaterThanOrEqual(1);
    const mine = await api('/feedback/mine', undefined, alice);
    expect(mine.items[0]).toMatchObject({ status: 'faite', fresh: true });
    await api('/feedback/seen', { ids: [aliceId] }, alice);
    expect((await api('/notifications', undefined, alice)).ideas).toEqual([]);
    // Bob ne peut pas marquer comme vu le message d'Alice (sans effet) ni le voir.
    expect((await api('/feedback/mine', undefined, bob)).items.some((x: { id: number }) => x.id === aliceId)).toBe(false);
    const log = await api('/admin/log', undefined, admin);
    expect(log.log.some((l: { details: string; target: string }) => l.target === 'Alicefb' && /Boîte à idées/.test(l.details) && /faite/.test(l.details))).toBe(true);
  });

  it('réponse : notification « Réponse à votre message » avec le texte de Sam', async () => {
    const before = srv.accounts.social.sent.length;
    const r = await api(`/admin/feedback/${aliceId}`, { reply: 'Bonne idée, c’est prévu pour décembre.' }, admin);
    expect(r).toMatchObject({ notified: true, item: { reply: 'Bonne idée, c’est prévu pour décembre.' } });
    const sent = srv.accounts.social.sent.slice(before);
    expect(sent).toEqual([expect.objectContaining({ title: 'Réponse à votre message', body: 'Bonne idée, c’est prévu pour décembre.' })]);
    expect((await api('/feedback/mine', undefined, alice)).items[0]).toMatchObject({ reply: 'Bonne idée, c’est prévu pour décembre.', fresh: true });
  });

  it('sans « me prévenir » : pas de push, mais le statut apparaît dans « Mes envois »', async () => {
    const c = await reg('Calmefb');
    const id = (await api('/feedback', { kind: 'souci', text: 'Le son coupe parfois en partie.', notify: false }, c)).id;
    const before = srv.accounts.social.sent.length;
    expect((await api(`/admin/feedback/${id}`, { status: 'faite' }, admin)).notified).toBe(false);
    expect(srv.accounts.social.sent.length).toBe(before);
    expect((await api('/notifications', undefined, c)).ideas).toEqual([]);
    expect((await api('/feedback/mine', undefined, c)).items[0]).toMatchObject({ status: 'faite', fresh: true });
  });

  it('titres des notifications traduits dans les 4 langues', () => {
    for (const l of LANGS) for (const k of ['fb.n.doneT', 'fb.n.replyT', 'fb.n.doneB'] as const) expect(translate(l, k)).toBeTruthy();
    expect(translate('en', 'fb.n.doneT')).not.toBe(fbFr['fb.n.doneT']);
    expect(translate('de', 'fb.n.replyT')).not.toBe(fbFr['fb.n.replyT']);
  });
});
