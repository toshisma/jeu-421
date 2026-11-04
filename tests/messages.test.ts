/** Messages privés entre amis : envoi, refus, stockage hors ligne, non-lus, temps réel, push. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { cleanMessage } from '../server/messages';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => { srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 } }); base = `http://localhost:${srv.port}`; });
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string, method?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: method ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
const reg = async (u: string) => (await api('/register', { username: u, password: 'motdepasse1' })).token as string;
const live = (token: string) => new Promise<Socket>((ok) => { const s = connect(`${base}/messages`, { auth: { token } }); s.on('connect', () => ok(s)); });

describe('messages privés', () => {
  let a = '', b = '', c = '';
  it('seulement entre amis acceptés', async () => {
    a = await reg('Paul'); b = await reg('Lea'); c = await reg('Zoe');
    expect((await api('/messages/Lea', { text: 'Salut' }, a)).code).toBe(403); // pas amis
    await api('/friends', { username: 'Lea' }, a);
    expect((await api('/messages/Lea', { text: 'Salut' }, a)).code).toBe(403); // demande pas encore acceptée
    await api('/friends/accept', { username: 'Paul' }, b);
    expect((await api('/messages/Zoe', { text: 'Coucou' }, a)).code).toBe(403);
    expect((await api('/messages/Inconnu', { text: 'Coucou' }, a)).code).toBe(404);
    expect((await api('/messages/Lea', { text: '   ' }, a)).code).toBe(400);
    expect((await api('/messages/Lea', { text: 'x' }, '')).code).toBe(401); // invité
  });

  it('hors ligne : stocké, compté non lu, notification push, lu à l’ouverture', async () => {
    const r = await api('/messages/Lea', { text: 'Une partie ce soir ? <b>gras</b> https://pub.example' }, a);
    expect(r.ok).toBe(true);
    expect(r.message.text).toBe('Une partie ce soir ? <b>gras</b> [lien]'); // texte brut, lien retiré
    await api('/messages/Lea', { text: 'Je serai là vers 21 h.' }, a);
    expect(srv.accounts.social.sent.filter((x) => x.userId && x.title === 'Nouveau message de Paul')).toHaveLength(2);
    expect((await api('/messages-unread', undefined, b)).unread).toBe(2);
    const list = await api('/messages', undefined, b);
    expect(list.conversations).toEqual([expect.objectContaining({ username: 'Paul', unread: 2, friend: true, last: expect.objectContaining({ text: 'Je serai là vers 21 h.', mine: false }) })]);
    const t = await api('/messages/Paul', undefined, b);
    expect(t.messages.map((m: { text: string }) => m.text)).toHaveLength(2);
    expect(t.messages[0]).toMatchObject({ from: 'Paul', mine: false });
    expect((await api('/messages-unread', undefined, b)).unread).toBe(0);
    expect((await api('/messages/Lea', undefined, a)).messages.every((m: { read: boolean; mine: boolean }) => m.mine && m.read)).toBe(true);
  });

  it('en ligne : reçu en direct, sans notification push en double', async () => {
    const sb = await live(b);
    const pushes = srv.accounts.social.sent.length;
    const got = new Promise<{ with: string; message: { text: string }; unread: number }>((ok) => sb.on('pm:message', ok));
    await api('/messages/Lea', { text: 'Tu es là ?' }, a);
    const m = await got;
    expect(m).toMatchObject({ with: 'Paul', message: { text: 'Tu es là ?' }, unread: 1 });
    expect(srv.accounts.social.sent.length).toBe(pushes);
    const sa = await live(a);
    const read = new Promise((ok) => sa.on('pm:read', ok));
    await api('/messages/Paul/read', {}, b);
    expect(await read).toEqual({ by: 'Lea' });
    sa.close(); sb.close();
  });

  it('limite de débit et longueur', async () => {
    let refused = 0;
    for (let i = 0; i < 10; i++) if ((await api('/messages/Paul', { text: `m${i}` }, b)).code === 429) refused++;
    expect(refused).toBe(2);
    expect(cleanMessage('a'.repeat(900))).toHaveLength(500);
    expect(cleanMessage('a\u0000b‮c')).toBe('a b c');
  });

  it('plus de messages après suppression de l’ami', async () => {
    await api('/friends/Lea', undefined, a, 'DELETE');
    expect((await api('/messages/Lea', { text: 'Encore ?' }, a)).code).toBe(403);
    expect((await api('/messages/Paul', { text: 'Encore ?' }, b)).code).toBe(403);
    const t = await api('/messages/Lea', undefined, a);
    expect(t.friend).toBe(false); // l'historique reste lisible, mais plus d'envoi
    expect((await api('/messages', undefined, a)).conversations[0]).toMatchObject({ username: 'Lea', friend: false });
    expect((await api('/messages/Paul', undefined, c)).messages).toEqual([]);
  });
});
