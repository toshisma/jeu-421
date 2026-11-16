/**
 * Messages privés : protection des joueurs (lecture tracée par l'équipe, signalement de conversation figé,
 * alertes automatiques discrètes, fermeture d'un échange, purge à 12 mois) et textes en/de/nl.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { conversationScore, scanMessage, ALERT_THRESHOLD, PM_REPORT_REASONS, READ_MOTIVES } from '../shared/pm-safety';
import { DICTS } from '../shared/i18n';
import { mpmodFr } from '../shared/i18n/zones/mpmod.fr';
import { MPM_RULES } from '../shared/i18n/zones/mpmod-server';
import { translateServerText } from '../shared/i18n/server-texts';
import { reasonLabel } from '../shared/moderation';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 1000 }, stats: { adminUsers: ['Patron'] }, turnTimeoutMs: 60_000 });
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
const tok: Record<string, string> = {};
const id: Record<string, string> = {};
const befriend = async (x: string, y: string) => { await api('/friends', { username: y }, tok[x]); await api('/friends', { username: x }, tok[y]); };
const say = (from: string, to: string, text: string) => api(`/messages/${to}`, { text }, tok[from]);
const logRows = async () => (await api('/admin/log?limit=200', undefined, tok.Patron)).log as { admin: string; action: string; details: string }[];

/** Messages de jeu ordinaires (4 langues) : aucun ne doit alerter. */
const ANODINS = [
  'bien joué', 'rejoue', 't’as eu un 421 ?', 'On se refait une partie ?', 'gg !', 'Tu joues ce soir au tournoi de 21 h ?', 'ajoute-moi en ami pour le bistrot',
  'trop fort ton dé doré', 'quelle classe ce coup !', 'je t’envoie une invitation', 'photo de profil sympa', 'on se voit au tournoi ce soir', 'Ton score : 10 000 !',
  'c’est quoi ton code de table ?', 'rdv à 21h pour la partie', 'je te dis rien, surprise', 'well played', 'rematch?', 'nice roll, you got 421!', 'see you at the tournament',
  'gut gespielt', 'noch eine Runde?', 'wie viele Punkte hast du?', 'goed gespeeld', 'nog een potje?', 'hoeveel punten heb je?',
];

describe('repérage des signaux à risque (shared/pm-safety)', () => {
  it('les messages anodins de jeu ne déclenchent rien', () => {
    for (const t of ANODINS) expect(scanMessage(t), t).toEqual([]);
    expect(conversationScore(ANODINS.map(scanMessage)).score).toBe(0);
  });
  it('repère les catégories dans les 4 langues', () => {
    expect(scanMessage('T’as quel âge ?')).toEqual(['age']);
    expect(scanMessage('how old are u')).toEqual(['age']);
    expect(scanMessage('Wie alt bist du?')).toEqual(['age']);
    expect(scanMessage('hoe oud ben je')).toEqual(['age']);
    expect(scanMessage('envoie moi une photo de toi')).toContain('photo');
    expect(scanMessage('schick mir ein Foto')).toContain('photo');
    expect(scanMessage('stuur me een foto')).toContain('photo');
    expect(scanMessage('send me a pic')).toContain('photo');
    expect(scanMessage('t’as snap ?')).toEqual(['ailleurs']);
    expect(scanMessage('add me on insta')).toContain('ailleurs');
    expect(scanMessage('tu habites où ?')).toEqual(['coordonnees']);
    expect(scanMessage('c’est quoi ton numéro')).toEqual(['coordonnees']);
    expect(scanMessage('06 12 34 56 78')).toEqual(['coordonnees']);
    expect(scanMessage('where do you live')).toEqual(['coordonnees']);
    expect(scanMessage('on se voit en vrai ?')).toEqual(['rencontre']);
    expect(scanMessage('wollen wir uns treffen')).toEqual(['rencontre']);
    expect(scanMessage('zullen we afspreken')).toEqual(['rencontre']);
    expect(scanMessage('ne dis rien à tes parents')).toEqual(['secret']);
    expect(scanMessage('c’est notre secret')).toEqual(['secret']);
    expect(scanMessage("don't tell your mom")).toEqual(['secret']);
    expect(scanMessage('sag es niemandem')).toEqual(['secret']);
    expect(scanMessage('vertel het aan niemand')).toEqual(['secret']);
  });
  it('une seule catégorie n’alerte jamais ; un faisceau, si', () => {
    for (const c of [['age'], ['photo'], ['ailleurs'], ['secret'], ['rencontre'], ['coordonnees']] as const) expect(conversationScore([[...c]]).score).toBeLessThan(ALERT_THRESHOLD);
    expect(conversationScore([['age'], ['age']]).score).toBeLessThan(ALERT_THRESHOLD);
    expect(conversationScore([['age'], ['photo']]).score).toBeGreaterThanOrEqual(ALERT_THRESHOLD);
    expect(conversationScore([['photo'], ['photo'], ['photo']]).score).toBeGreaterThanOrEqual(ALERT_THRESHOLD); // insistance
  });
});

describe('messages privés : modération', () => {
  it('prépare les comptes', async () => {
    for (const u of ['Patron', 'Modo', 'Alice', 'Bob', 'Carl', 'Dan', 'Eve', 'Fred']) {
      const r = await api('/register', { username: u, password: 'motdepasse1' });
      tok[u] = r.token; id[u] = r.user.id;
    }
    expect(Object.values(tok).every(Boolean)).toBe(true);
    expect((await api('/moderation/moderators', { username: 'Modo' }, tok.Patron)).ok).toBe(true);
    await befriend('Alice', 'Bob'); await befriend('Carl', 'Dan'); await befriend('Eve', 'Fred');
  });

  it('messages anodins : aucune alerte', async () => {
    // Les 10 premiers par l'API (débit : 8 messages en 10 s par compte), les autres par le même chemin serveur.
    for (let i = 0; i < ANODINS.length; i++) {
      const [from, to] = i % 2 ? ['Alice', 'Bob'] : ['Bob', 'Alice'];
      if (i < 10) expect((await say(from, to, ANODINS[i])).ok, ANODINS[i]).toBe(true);
      else srv.pmMod.afterSend(srv.store.pmAdd(id[from], id[to], ANODINS[i], Date.now()));
    }
    const q = await api('/pm-mod/queue', undefined, tok.Patron);
    expect(q.alerts).toEqual([]);
  }, 30_000);

  it('un non-membre de l’équipe ne peut rien lire ni faire', async () => {
    const body = { a: 'Alice', b: 'Bob', motive: 'securite' };
    for (const t of [undefined, tok.Alice, tok.Carl]) {
      expect((await api('/pm-mod/queue', undefined, t)).status).toBe(403);
      expect((await api('/pm-mod/search?q=Al', undefined, t)).status).toBe(403);
      expect((await api('/pm-mod/user/Alice', undefined, t)).status).toBe(403);
      expect((await api('/pm-mod/conversation', body, t)).status).toBe(403);
      expect((await api('/pm-mod/messages/1/delete', {}, t)).status).toBe(403);
      expect((await api('/pm-mod/pair/block', body, t)).status).toBe(403);
      expect((await api('/pm-mod/suspend', { ...body, user: 'Bob', duration: '1j' }, t)).status).toBe(403);
      expect((await api('/pm-mod/handled', body, t)).status).toBe(403);
    }
    // Modérateur : file oui ; recherche, liste d'un compte et conversation non suivie : non.
    expect((await api('/pm-mod/queue', undefined, tok.Modo)).ok).toBe(true);
    expect((await api('/pm-mod/search?q=Al', undefined, tok.Modo)).status).toBe(403);
    expect((await api('/pm-mod/user/Alice', undefined, tok.Modo)).status).toBe(403);
    expect((await api('/pm-mod/conversation', body, tok.Modo)).status).toBe(403);
    expect((await logRows()).some((l) => l.action === 'mp-lecture')).toBe(false);
  });

  it('alerte automatique : faisceau âge + photo, une seule par conversation et par jour', async () => {
    await say('Carl', 'Dan', 'salut, bien joué');
    await say('Carl', 'Dan', 't’as quel âge ?');
    expect((await api('/pm-mod/queue', undefined, tok.Patron)).alerts).toEqual([]);
    const r = await say('Carl', 'Dan', 'envoie moi une photo de toi');
    expect(r.ok).toBe(true); // jamais bloqué
    await say('Carl', 'Dan', 'on se voit en vrai ? ne dis rien à tes parents');
    const q = await api('/pm-mod/queue', undefined, tok.Patron);
    expect(q.alerts).toHaveLength(1);
    expect(q.alerts[0]).toMatchObject({ a: expect.any(String), b: expect.any(String) });
    expect(q.alerts[0].cats.map((c: any) => c.id)).toEqual(expect.arrayContaining(['age', 'photo', 'rencontre', 'secret']));
  });

  it('lecture : motif obligatoire, journal écrit à chaque ouverture', async () => {
    expect((await api('/pm-mod/conversation', { a: 'Carl', b: 'Dan' }, tok.Patron)).status).toBe(400);
    expect((await api('/pm-mod/conversation', { a: 'Carl', b: 'Dan', motive: 'autre' }, tok.Patron)).status).toBe(400);
    const before = (await logRows()).filter((l) => l.action === 'mp-lecture').length;
    const c = await api('/pm-mod/conversation', { a: 'Carl', b: 'Dan', motive: 'alerte' }, tok.Patron);
    expect(c.ok).toBe(true);
    expect(c.messages.map((m: any) => m.text)).toContain('envoie moi une photo de toi');
    expect(c.messages.find((m: any) => m.text === 'envoie moi une photo de toi').cats.map((x: any) => x.id)).toEqual(['photo']);
    // Le modérateur peut lire une conversation alertée.
    expect((await api('/pm-mod/conversation', { a: 'Dan', b: 'Carl', motive: 'autre', detail: 'contrôle' }, tok.Modo)).ok).toBe(true);
    const log = (await logRows()).filter((l) => l.action === 'mp-lecture');
    expect(log.length).toBe(before + 2);
    expect(log[0]).toMatchObject({ admin: 'Modo' });
    expect(log[0].details).toContain('Dan ↔ Carl');
    expect(log[0].details).toContain('Autre (contrôle)');
    expect(log[1].details).toContain('Alerte automatique');
    // La liste des conversations d'un compte est tracée aussi.
    const u = await api('/pm-mod/user/Carl', undefined, tok.Patron);
    expect(u.conversations[0]).toMatchObject({ username: 'Dan', alerts: 1 });
    expect((await logRows())[0].action).toBe('mp-liste');
    expect((await api('/pm-mod/search?q=ca', undefined, tok.Patron)).users.map((x: any) => x.username)).toContain('Carl');
  });

  let reportId = 0;
  it('signalement de conversation : copie figée, blocage en un geste, alerte dans la file', async () => {
    expect((await api('/pm-mod/report', { username: 'Alice', reason: 'mineur' })).status).toBe(401);
    expect((await api('/pm-mod/report', { username: 'Alice', reason: 'insultes' }, tok.Bob)).status).toBe(400);
    expect((await api('/pm-mod/report', { username: 'Carl', reason: 'mineur' }, tok.Bob)).status).toBe(400); // aucune conversation
    await say('Alice', 'Bob', 'Message gênant numéro 1');
    const r = await api('/pm-mod/report', { username: 'Alice', reason: 'mineur', comment: 'Elle insiste', block: true }, tok.Bob);
    expect(r.ok).toBe(true);
    reportId = r.id;
    expect((await api('/pm-mod/report', { username: 'Alice', reason: 'autre_mp' }, tok.Bob)).status).toBe(409);
    // Bloquée : Alice ne peut plus écrire à Bob.
    expect((await say('Alice', 'Bob', 'coucou')).status).toBe(403);
    const reps = (await api('/moderation/reports', undefined, tok.Patron)).reports;
    const rep = reps.find((x: any) => x.id === reportId);
    expect(rep).toMatchObject({ reporter: 'Bob', target: 'Alice', reason: 'mineur', reasonLabel: 'Comportement inquiétant envers un mineur' });
    expect(rep.message.context.length + 1).toBe(Math.min(50, ANODINS.length + 1));
    expect(rep.message.text).toBe('Message gênant numéro 1');
    const q = await api('/pm-mod/queue', undefined, tok.Modo);
    expect(q.reports.find((x: any) => x.id === reportId)).toMatchObject({ whole: true, reporter: 'Bob', target: 'Alice' });
  });

  it('suppression d’un message par l’équipe : retiré chez les joueurs, la copie du signalement survit', async () => {
    const c = await api('/pm-mod/conversation', { a: 'Alice', b: 'Bob', motive: 'signalement' }, tok.Modo);
    const m = c.messages.find((x: any) => x.text === 'Message gênant numéro 1');
    expect((await api(`/pm-mod/messages/${m.id}/delete`, {}, tok.Modo)).ok).toBe(true);
    const c2 = await api('/pm-mod/conversation', { a: 'Alice', b: 'Bob', motive: 'signalement' }, tok.Patron);
    expect(c2.messages.find((x: any) => x.id === m.id).removed).toMatchObject({ by: 'Modo' });
    expect(srv.store.pmById(m.id)).toBeUndefined();
    const rep = (await api('/moderation/reports', undefined, tok.Patron)).reports.find((x: any) => x.id === reportId);
    expect(rep.message.text).toBe('Message gênant numéro 1');
    expect((await logRows())[1]).toMatchObject({ action: 'mp-suppression', admin: 'Modo' });
  });

  it('fermer l’échange entre deux comptes, puis le rouvrir', async () => {
    expect((await api('/pm-mod/pair/block', { a: 'Carl', b: 'Dan' }, tok.Patron)).closed).toBe(true);
    const s = await say('Dan', 'Carl', 'hé ?');
    expect(s.status).toBe(403);
    expect(s.error).toBe('La modération a fermé cette conversation.');
    const t = await api('/messages/Carl', undefined, tok.Dan);
    expect(t).toMatchObject({ friend: false, modClosed: true });
    expect((await api('/pm-mod/pair/block', { a: 'Carl', b: 'Dan', block: false }, tok.Patron)).closed).toBe(false);
    expect((await say('Dan', 'Carl', 'ok')).ok).toBe(true);
  });

  it('suspendre depuis la conversation (jamais un admin)', async () => {
    expect((await api('/pm-mod/suspend', { a: 'Carl', b: 'Dan', user: 'Alice', duration: '1j' }, tok.Patron)).status).toBe(400);
    expect((await api('/pm-mod/suspend', { a: 'Carl', b: 'Dan', user: 'Carl', duration: '3j' }, tok.Patron)).status).toBe(400);
    expect((await api('/pm-mod/suspend', { a: 'Carl', b: 'Dan', user: 'Carl', duration: '7j', reason: 'Demandes inquiétantes' }, tok.Modo)).ok).toBe(true);
    const r = await api('/messages', undefined, tok.Carl);
    expect(r.status).toBe(403);
    expect(r.banned).toBe(true);
    expect((await api('/pm-mod/suspend', { a: 'Patron', b: 'Eve', user: 'Patron', duration: '1j' }, tok.Patron)).status).toBe(403); // compte administrateur
  });

  it('marquer traité : alertes et signalements clos, le modérateur n’y a plus accès', async () => {
    const h = await api('/pm-mod/handled', { a: 'Carl', b: 'Dan', note: 'vu' }, tok.Patron);
    expect(h).toMatchObject({ ok: true, alerts: 1 });
    expect((await api('/pm-mod/queue', undefined, tok.Patron)).alerts).toEqual([]);
    expect((await api('/pm-mod/conversation', { a: 'Carl', b: 'Dan', motive: 'alerte' }, tok.Modo)).status).toBe(403);
    expect((await api('/pm-mod/conversation', { a: 'Carl', b: 'Dan', motive: 'securite' }, tok.Patron)).ok).toBe(true);
  });

  it('purge à 12 mois, sauf les conversations au signalement non traité', async () => {
    const db = srv.store.sqlite;
    const old = Date.now() - 400 * 86400_000;
    const ins = db.prepare('INSERT INTO private_messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)');
    ins.run(id.Eve, id.Fred, 'vieux message Eve', old);
    ins.run(id.Alice, id.Bob, 'vieux message Alice', old);
    await say('Eve', 'Fred', 'message récent');
    const p = srv.pmMod.purge();
    expect(p.removed).toBe(1);
    expect(p.kept).toBe(1);
    const texts = (a: string, b: string) => srv.store.pmThread(id[a], id[b], 500).map((m) => m.text);
    expect(texts('Eve', 'Fred')).toEqual(['message récent']);
    expect(texts('Alice', 'Bob')).toContain('vieux message Alice'); // signalement ouvert : gardé
    // Signalement traité depuis plus de 12 mois : copie figée effacée.
    db.prepare(`UPDATE mod_reports SET status = 'traite', decided_at = ? WHERE id = ?`).run(old, reportId);
    expect(srv.pmMod.purge().wiped).toBe(1);
    expect(srv.store.modReport(reportId)!.msg_context).toBeNull();
    expect(texts('Alice', 'Bob')).not.toContain('vieux message Alice');
  });
});

describe('textes de la zone mpmod', () => {
  it('toutes les clés existent en en, de et nl (et diffèrent du français quand c’est du texte)', () => {
    for (const lang of ['en', 'de', 'nl'] as const) {
      for (const k of Object.keys(mpmodFr) as (keyof typeof mpmodFr)[]) {
        const v = DICTS[lang][k];
        expect(v, `${lang} ${k}`).toBeTruthy();
        expect((v!.match(/\{\w+\}/g) ?? []).sort(), `${lang} ${k}`).toEqual((mpmodFr[k].match(/\{\w+\}/g) ?? []).sort());
      }
    }
    for (const r of PM_REPORT_REASONS) {
      expect(mpmodFr[`mpm.reason.${r.id}` as keyof typeof mpmodFr]).toBe(r.label);
      expect(reasonLabel(r.id)).toBe(r.label);
    }
    expect(READ_MOTIVES.map((m) => m.id)).toEqual(['signalement', 'alerte', 'securite', 'autre']);
  });
  it('les messages du serveur sont traduits', () => {
    for (const fr of ['La modération a fermé cette conversation.', 'Vous avez déjà signalé cette conversation : l’équipe de modération va l’examiner.', 'Aucun message dans cette conversation.', '16 novembre 2026']) {
      for (const l of ['en', 'de', 'nl'] as const) expect(translateServerText(l, fr), `${l} ${fr}`).not.toBe(fr);
    }
    expect(MPM_RULES.length).toBe(4);
  });
});
