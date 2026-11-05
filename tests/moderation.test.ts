/** Modération : signalements (joueurs et messages figés par le serveur), droits, sanctions, avis. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { THANKS_TEXT } from '../shared/moderation';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
let shift = 0;
const clock = () => Date.now() + shift;
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 1000, now: clock }, stats: { adminUsers: ['Patron'] }, admin: { now: clock }, turnTimeoutMs: 60_000 });
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
const call = (s: Socket, ev: string, p: object) => new Promise<any>((res) => s.emit(ev, p, res));
const tok: Record<string, string> = {};
const notices = async (who: string) => (await api('/notifications', undefined, tok[who])).notices as { id: number; kind: string; text: string }[];
const reports = async (who: string, status = 'ouvert') => (await api(`/moderation/reports?status=${status}`, undefined, tok[who]));

describe('modération', () => {
  let pmId = 0;
  let tableMsg = '';
  let a: Socket, b: Socket;

  it('prépare les comptes', async () => {
    for (const u of ['Patron', 'Modo', 'Modo2', 'Alice', 'Bob', 'Carl']) tok[u] = (await api('/register', { username: u, password: 'motdepasse1' })).token;
    expect(Object.values(tok).every(Boolean)).toBe(true);
  });

  it('refuse les invités, soi-même, une raison inconnue, un joueur inconnu', async () => {
    expect((await api('/moderation/report', { username: 'Bob', reason: 'insultes' })).status).toBe(401);
    expect((await api('/moderation/report', { username: 'Alice', reason: 'insultes' }, tok.Alice)).status).toBe(400);
    expect((await api('/moderation/report', { username: 'Bob', reason: 'nimporte' }, tok.Alice)).status).toBe(400);
    expect((await api('/moderation/report', { username: 'Personne', reason: 'spam' }, tok.Alice)).status).toBe(404);
  });

  it('signale un joueur, sans doublon', async () => {
    expect((await api('/moderation/report', { username: 'Bob', reason: 'insultes', comment: 'Il m’insulte en partie' }, tok.Alice)).ok).toBe(true);
    expect((await api('/moderation/report', { username: 'Bob', reason: 'spam' }, tok.Alice)).status).toBe(409);
  });

  it('signale un message privé : texte, auteur, lieu et contexte figés par le serveur', async () => {
    await api('/friends', { username: 'Bob' }, tok.Alice);
    await api('/friends', { username: 'Alice' }, tok.Bob);
    await api('/messages/Bob', { text: 'Salut Bob' }, tok.Alice);
    await api('/messages/Alice', { text: 'Bonsoir' }, tok.Bob);
    const m = await api('/messages/Alice', { text: 'Tu joues comme un pied, abruti' }, tok.Bob);
    pmId = m.message.id;
    expect((await api('/moderation/report', { message: { place: 'prive', id: pmId }, reason: 'insultes' }, tok.Bob)).status).toBe(400); // son propre message
    expect((await api('/moderation/report', { message: { place: 'prive', id: pmId }, reason: 'insultes' }, tok.Carl)).status).toBe(400); // pas sa conversation
    // Le texte envoyé par le client est ignoré.
    expect((await api('/moderation/report', { message: { place: 'prive', id: pmId, text: 'faux texte' }, text: 'faux', reason: 'insultes', comment: 'x'.repeat(400) }, tok.Alice)).ok).toBe(true);
    expect((await api('/moderation/report', { message: { place: 'prive', id: pmId }, reason: 'insultes' }, tok.Alice)).status).toBe(409);
    const r = (await reports('Patron')).reports.find((x: any) => x.kind === 'message');
    expect(r).toMatchObject({ reporter: 'Alice', target: 'Bob', reason: 'insultes', status: 'ouvert' });
    expect(r.comment.length).toBe(300);
    expect(r.message.text).toBe('Tu joues comme un pied, abruti');
    expect(r.message.place).toBe('prive');
    expect(r.message.where).toContain('Bob');
    expect(r.message.context.map((x: any) => x.text)).toEqual(['Salut Bob', 'Bonsoir']);
  });

  it('signale un message du tchat de table (gardé en mémoire par le serveur)', async () => {
    a = connect(base); b = connect(base);
    const r = await call(a, 'room:create', { name: 'Alice', auth: tok.Alice, table: { visibility: 'private', maxPlayers: 4, stake: 0 } });
    await call(b, 'room:join', { code: r.code, name: 'Bob', auth: tok.Bob });
    const got = new Promise<any>((ok) => a.on('room:chat', (m: any) => { if (m.name === 'Bob') ok(m); }));
    expect(await call(b, 'room:chat', { text: 'Vous êtes tous des nuls' })).toEqual({ ok: true });
    const msg = await got;
    expect(msg.id).toBeTruthy();
    tableMsg = msg.id;
    expect((await api('/moderation/report', { message: { place: 'table', id: tableMsg }, reason: 'insultes' }, tok.Carl)).status).toBe(400); // pas à la table
    expect((await api('/moderation/report', { message: { place: 'table', id: 'inconnu' }, reason: 'insultes' }, tok.Alice)).status).toBe(400);
    expect((await api('/moderation/report', { message: { place: 'table', id: tableMsg }, reason: 'haine' }, tok.Alice)).ok).toBe(true);
    const rep = (await reports('Patron')).reports.find((x: any) => x.message?.place === 'table');
    expect(rep.message).toMatchObject({ text: 'Vous êtes tous des nuls' });
    expect(rep.message.where).toContain(r.code);
  });

  it('signale un message du tchat de club', async () => {
    const alice = (await api('/admin/players/Alice', undefined, tok.Patron)).player;
    await api(`/admin/players/${alice.id}/coins`, { delta: 200 }, tok.Patron);
    const club = (await api('/clubs', { name: 'Les Dés Pipés', emblem: '🍺' }, tok.Alice)).club;
    await api('/clubs/join', { id: club.id }, tok.Bob);
    const c = (await api('/clubs/chat', { phrase: 'Tu paies ta tournée !' }, tok.Bob)).club;
    const line = c.chat.find((x: any) => x.username === 'Bob');
    expect(line.id).toBeGreaterThan(0);
    expect((await api('/moderation/report', { message: { place: 'club', id: line.id }, reason: 'spam' }, tok.Carl)).status).toBe(400);
    expect((await api('/moderation/report', { message: { place: 'club', id: line.id }, reason: 'spam' }, tok.Alice)).ok).toBe(true);
  });

  it('droits : joueurs refusés, modérateur nommé par l’admin, sans accès aux autres outils', async () => {
    expect((await reports('Alice')).status).toBe(403);
    expect((await api('/moderation/whoami', undefined, tok.Alice))).toMatchObject({ admin: false, moderator: false, pending: 0 });
    expect((await api('/moderation/moderators', { username: 'Modo' }, tok.Alice)).status).toBe(403);
    expect((await api('/moderation/moderators', { username: 'Modo' }, tok.Patron)).ok).toBe(true);
    expect((await api('/moderation/moderators', { username: 'Modo2' }, tok.Patron)).ok).toBe(true);
    expect((await api('/moderation/whoami', undefined, tok.Modo))).toMatchObject({ admin: false, moderator: true, pending: 4 });
    expect((await reports('Modo')).reports.length).toBe(4);
    expect((await api('/admin/players', undefined, tok.Modo)).status).toBe(403);
    expect((await api('/admin/overview', undefined, tok.Modo)).status).toBe(403);
    expect((await api('/moderation/moderators', undefined, tok.Modo)).status).toBe(403);
    expect((await api('/moderation/moderators', { username: 'Carl' }, tok.Modo)).status).toBe(403);
    expect((await api('/moderation/moderators', undefined, tok.Patron)).moderators.map((m: any) => m.username)).toEqual(['Modo', 'Modo2']);
  });

  it('personne ne sanctionne un admin ; un modérateur ne sanctionne pas un modérateur ; classer ne notifie pas', async () => {
    await api('/moderation/report', { username: 'Patron', reason: 'autre' }, tok.Carl);
    await api('/moderation/report', { username: 'Modo2', reason: 'autre' }, tok.Carl);
    const list = (await reports('Modo')).reports;
    const onAdmin = list.find((x: any) => x.target === 'Patron'), onModo = list.find((x: any) => x.target === 'Modo2');
    expect((await api(`/moderation/reports/${onAdmin.id}/decide`, { decision: 'avertissement' }, tok.Modo)).status).toBe(403);
    expect((await api(`/moderation/reports/${onAdmin.id}/decide`, { decision: 'muet', duration: '1h' }, tok.Patron)).status).toBe(403);
    expect((await api(`/moderation/reports/${onModo.id}/decide`, { decision: 'avertissement' }, tok.Modo)).status).toBe(403);
    expect((await api(`/moderation/reports/${onAdmin.id}/decide`, { decision: 'classer', note: 'rien à redire' }, tok.Modo)).ok).toBe(true);
    expect((await api(`/moderation/reports/${onModo.id}/decide`, { decision: 'classer' }, tok.Patron)).ok).toBe(true);
    expect(await notices('Carl')).toEqual([]);
    const done = (await reports('Patron', 'traite')).reports.find((x: any) => x.id === onAdmin.id);
    expect(done).toMatchObject({ status: 'traite', decision: 'classer', decidedBy: 'Modo', note: 'rien à redire' });
    expect(done.decidedAt).toBeGreaterThan(0);
    expect((await api(`/moderation/reports/${onAdmin.id}/decide`, { decision: 'classer' }, tok.Patron)).status).toBe(409);
  });

  it('muet : bloque tchat de table, messages privés et club, avec l’échéance ; levé tout seul', async () => {
    const r = (await reports('Modo')).reports.find((x: any) => x.target === 'Bob');
    expect((await api(`/moderation/reports/${r.id}/decide`, { decision: 'muet' }, tok.Modo)).status).toBe(400); // durée manquante
    const d = await api(`/moderation/reports/${r.id}/decide`, { decision: 'muet', duration: '1h', note: 'insultes répétées' }, tok.Modo);
    expect(d).toMatchObject({ ok: true, decided: 4, pending: 0 }); // tous les signalements en attente sur Bob
    // Remerciement au signaleur, sans détail ; avis au joueur sanctionné.
    const na = await notices('Alice');
    expect(na.map((n) => n.text)).toEqual([THANKS_TEXT]);
    expect((await notices('Bob'))[0].text).toMatch(/ne pouvez plus écrire.*jusqu’au/);
    expect((await notices('Carl'))).toEqual([]);
    await api('/notifications/seen', { notices: na.map((n) => n.id) }, tok.Alice);
    expect(await notices('Alice')).toEqual([]);
    const pm = await api('/messages/Alice', { text: 'coucou' }, tok.Bob);
    expect(pm.status).toBe(403);
    expect(pm.error).toMatch(/jusqu’au/);
    expect((await api('/clubs/chat', { phrase: 'Santé !' }, tok.Bob)).status).toBe(403);
    const t = await call(b, 'room:chat', { text: 'encore' });
    expect(t.ok).toBe(false);
    expect(t.error).toMatch(/jusqu’au/);
    const sheet = (await api('/moderation/players/Bob', undefined, tok.Modo)).player;
    expect(sheet.mute).toBeTruthy();
    expect(sheet.sanctions[0]).toMatchObject({ kind: 'muet', by: 'Modo', note: 'insultes répétées' });
    expect(sheet.reports.length).toBe(4);
    shift += 2 * 3600_000;
    expect((await api('/messages/Alice', { text: 'pardon' }, tok.Bob)).ok).toBe(true);
    await new Promise((ok) => setTimeout(ok, 1100)); // débit du tchat : un message par seconde
    expect((await call(b, 'room:chat', { text: 'désolé' })).ok).toBe(true);
    a.close(); b.close();
  });

  it('suspension temporaire : compte bloqué puis rétabli à l’échéance ; avertissement', async () => {
    await api('/moderation/report', { username: 'Bob', reason: 'triche' }, tok.Carl);
    let r = (await reports('Patron')).reports.find((x: any) => x.target === 'Bob');
    expect((await api(`/moderation/reports/${r.id}/decide`, { decision: 'suspension', duration: '1j' }, tok.Modo)).ok).toBe(true);
    const me = await api('/me', undefined, tok.Bob);
    expect(me.status).toBe(403);
    expect(me.banned).toBe(true);
    expect(me.error).toMatch(/Triche ou anti-jeu/);
    expect((await notices('Carl')).map((n) => n.text)).toEqual([THANKS_TEXT]);
    shift += 25 * 3600_000;
    expect((await api('/me', undefined, tok.Bob)).ok).toBe(true);
    await api('/moderation/report', { username: 'Bob', reason: 'autre' }, tok.Carl);
    r = (await reports('Patron')).reports.find((x: any) => x.target === 'Bob');
    expect((await api(`/moderation/reports/${r.id}/decide`, { decision: 'avertissement' }, tok.Modo)).ok).toBe(true);
    expect((await notices('Bob')).some((n) => n.kind === 'avertissement')).toBe(true);
  });

  it('bannissement définitif : seul un admin le lève ; l’admin peut sanctionner un modérateur', async () => {
    await api('/moderation/report', { username: 'Carl', reason: 'spam' }, tok.Alice);
    const r = (await reports('Patron')).reports.find((x: any) => x.target === 'Carl');
    expect((await api(`/moderation/reports/${r.id}/decide`, { decision: 'bannissement' }, tok.Modo)).ok).toBe(true);
    expect((await api('/me', undefined, tok.Carl)).status).toBe(403);
    const s = (await api('/moderation/players/Carl', undefined, tok.Modo)).player.sanctions[0];
    expect((await api(`/moderation/sanctions/${s.id}/lift`, {}, tok.Modo)).status).toBe(403);
    expect((await api(`/moderation/sanctions/${s.id}/lift`, {}, tok.Patron)).ok).toBe(true);
    expect((await api('/me', undefined, tok.Carl)).ok).toBe(true);
    await api('/moderation/report', { username: 'Modo2', reason: 'autre' }, tok.Alice);
    const m = (await reports('Patron')).reports.find((x: any) => x.target === 'Modo2');
    expect((await api(`/moderation/reports/${m.id}/decide`, { decision: 'avertissement', all: false }, tok.Patron)).ok).toBe(true);
    expect((await api('/moderation/moderators/Modo2', undefined, tok.Patron, 'DELETE')).ok).toBe(true);
    expect((await api('/moderation/whoami', undefined, tok.Modo2)).moderator).toBe(false);
    const log = (await api('/admin/log', undefined, tok.Patron)).log.map((l: any) => l.action);
    expect(log).toContain('mod-muet');
  });

  it('le signalement de photo historique fonctionne toujours', async () => {
    expect((await api('/report', { username: 'Bob', reason: 'photo' }, tok.Alice)).ok).toBe(true);
  });
});
