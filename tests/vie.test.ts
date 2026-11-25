/**
 * La vie du jeu : « mis à jour il y a N jours », champions de la semaine, mot du patron (admin seulement,
 * date de fin), sources supplémentaires, et la route publique GET /api/vie (vrais échanges avec le serveur).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../server/db';
import { createVie } from '../server/vie';
import { createSoloWeek } from '../server/solo-week';
import { startServer } from '../server/app';
import { CHANGELOG, type ChangelogEntry } from '../shared/changelog';
import { CHANGELOG_I18N } from '../shared/i18n/zones/changelog';
import { translate } from '../shared/i18n';
import { PATRON_MAX, championsItem, cleanPatron, daysSince, updateItem, vieParam, type VieItem } from '../shared/vie';

const text = (it: VieItem, lang: 'fr' | 'en' | 'de' | 'nl' = 'fr') =>
  it.text ?? translate(lang, it.key!, Object.fromEntries(Object.entries(it.params ?? {}).map(([k, v]) => [k, vieParam(v, lang)])));

describe('mis à jour il y a N jours', () => {
  const log: ChangelogEntry[] = [{ version: '9.9', date: '2026-11-17T23:22:00+01:00', title: 'Le titre', items: [] }];
  it('jours de Bruxelles', () => {
    expect(daysSince(log[0], '2026-11-17')).toBe(0);
    expect(daysSince({ date: '2026-11-17T23:59:00Z' }, '2026-11-18')).toBe(0); // 0 h 59 le 18 à Bruxelles
    expect(daysSince(log[0], '2026-11-25')).toBe(8);
  });
  it('aujourd’hui, hier, il y a N jours ; trop vieux : rien', () => {
    expect(text(updateItem('2026-11-17', log)!)).toBe('Mis à jour aujourd’hui : Le titre');
    expect(text(updateItem('2026-11-18', log)!)).toBe('Mis à jour hier : Le titre');
    const it8 = updateItem('2026-11-25', log)!;
    expect(text(it8)).toBe('Mis à jour il y a 8 jours : Le titre');
    expect(it8.action).toBe('news');
    expect(updateItem('2026-12-30', log)).toBeNull();
    expect(updateItem('2026-11-25', [])).toBeNull();
  });
  it('titre traduit (dernière version réelle)', () => {
    const e = CHANGELOG[0];
    const day = new Date(Date.parse(e.date) + 3 * 86400_000).toISOString().slice(0, 10);
    const it = updateItem(day, CHANGELOG, CHANGELOG_I18N)!;
    expect(text(it, 'fr')).toContain(e.title);
    const en = CHANGELOG_I18N.en?.[e.version]?.title;
    if (en) expect(text(it, 'en')).toBe(`Updated 3 days ago: ${en}`);
  });
});

describe('textes', () => {
  it('mot du patron nettoyé et coupé', () => {
    expect(cleanPatron('  Bonjour\n<b>à tous</b>  ')).toBe('Bonjour b à tous /b');
    expect(cleanPatron('x'.repeat(300))).toHaveLength(PATRON_MAX);
    expect(cleanPatron(42)).toBe('');
  });
  it('champions dans les 4 langues ; rien sans champion', () => {
    const lab = (l: 'fr' | 'en' | 'de' | 'nl', w: 'solo' | 'bistrot' | 'tournoi') => translate(l, `vie.ch.${w}`);
    expect(championsItem({}, lab)).toBeNull();
    const it = championsItem({ solo: 'Julie', bistrot: 'Marc', tournoi: { name: 'Paul', wins: 2 } }, lab)!;
    expect(text(it)).toBe('Champions de la semaine : Julie (solo), Marc (bistrot), Paul (tournoi)');
    expect(text(it, 'en')).toBe('Champions of the week: Julie (solo), Marc (bistro), Paul (tournament)');
    expect(it.action).toBe('ranking');
    expect(text(championsItem({ bistrot: 'Marc' }, lab)!, 'nl')).toBe('Kampioenen van de week: Marc (café)');
  });
});

describe('module', () => {
  const setup = () => {
    const store = new Store(':memory:');
    let clock = Date.parse('2026-11-25T10:00:00Z'); // mercredi ; semaine passée : 16 → 22 novembre
    createSoloWeek({ store, now: () => clock, push: () => {}, rollEveryMs: 0 });
    const logs: string[] = [];
    const vie = createVie({ store, isAdmin: () => true, userFromToken: () => undefined, log: (by, a, _t, d) => logs.push(`${by}|${a}|${d}`), now: () => clock, cacheMs: 0 });
    const users = ['Julie', 'Marc', 'Paul', 'Zoe'].map((n, i) => store.createUser({ id: `u${i}`, username: n, passHash: 'x', recoveryHash: 'x' }));
    return { store, vie, users, logs, at: (iso: string) => { clock = Date.parse(iso); } };
  };
  it('champions de la semaine passée (solo, bistrot, tournois), comptes suspendus écartés', () => {
    const { store, vie } = setup();
    const db = store.sqlite;
    db.prepare('INSERT INTO solo_week_podium (week, rank, user_id, name, points, coins, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('2026-11-16', 1, 'u0', 'Julie', 42, 20, 1);
    db.prepare('INSERT INTO solo_week_podium (week, rank, user_id, name, points, coins, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('2026-11-09', 1, 'u3', 'Zoe', 50, 20, 1);
    db.exec(`CREATE TABLE IF NOT EXISTS bistrot_champions (bistrot_id TEXT NOT NULL, week TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, points INTEGER NOT NULL, coins INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (bistrot_id, week))`);
    db.prepare('INSERT INTO bistrot_champions VALUES (?, ?, ?, ?, ?, ?, ?)').run('b1', '2026-11-16', 'u1', 'Marc', 30, 10, 1);
    db.prepare('INSERT INTO bistrot_champions VALUES (?, ?, ?, ?, ?, ?, ?)').run('b2', '2026-11-16', 'u3', 'Zoe', 12, 10, 1);
    for (const [slot, uid] of [['2026-11-18-21h', 'u2'], ['2026-11-20-11h', 'u2'], ['2026-11-21-21h', 'u3'], ['2026-11-24-21h', 'u3']] as const) {
      store.schedEnsureSlot(slot, 1);
      store.schedAddReg(slot, uid, 10, 1);
      store.schedSetReg(slot, uid, { status: 'fini', place: 0 });
    }
    expect(vie.champions('2026-11-25')).toMatchObject({ week: '2026-11-16', solo: 'Julie', soloPoints: 42, bistrot: 'Marc', tournoi: { name: 'Paul', wins: 2 } });
    expect(text(vie.compute().find((i) => i.id === 'champions')!)).toBe('Champions de la semaine : Julie (solo), Marc (bistrot), Paul (tournoi)');
    // Paul suspendu : Zoé (une victoire la semaine passée) prend sa place pour les tournois.
    db.exec('CREATE TABLE IF NOT EXISTS admin_bans (user_id TEXT PRIMARY KEY, reason TEXT, until INTEGER, by_admin TEXT, at INTEGER)');
    db.prepare('INSERT INTO admin_bans VALUES (?, ?, ?, ?, ?)').run('u2', 'x', null, 'a', 1);
    expect(vie.champions('2026-11-25').tournoi).toEqual({ name: 'Zoe', wins: 1 });
  });
  it('mot du patron : en tête, date de fin, effacement', () => {
    const { vie, at } = setup();
    expect(vie.compute().some((i) => i.id === 'patron')).toBe(false);
    vie.setPatron('Sam', 'Merci à tous !', 3);
    const first = vie.compute()[0];
    expect(first).toMatchObject({ id: 'patron', text: 'Merci à tous !', action: 'none' });
    at('2026-11-28T09:59:00Z');
    expect(vie.patron()?.text).toBe('Merci à tous !');
    at('2026-11-28T10:00:01Z');
    expect(vie.patron()).toBeNull();
    expect(vie.compute().some((i) => i.id === 'patron')).toBe(false);
    vie.setPatron('Sam', 'Encore', undefined); // 7 jours par défaut
    expect(vie.patron()!.until).toBe(Date.parse('2026-11-28T10:00:01Z') + 7 * 86400_000);
    vie.setPatron('Sam', '   ', 7);
    expect(vie.patron()).toBeNull();
  });
  it('sources supplémentaires (une ligne chacune) ; une source en erreur est écartée', () => {
    const { vie } = setup();
    vie.addSource(() => { throw new Error('boum'); });
    vie.addSource((day) => ({ id: 'theme', icon: '🎨', text: `Thème du ${day}`, action: 'shop' }));
    vie.addSource(() => null);
    const items = vie.compute();
    expect(items.at(-1)).toEqual({ id: 'theme', icon: '🎨', text: 'Thème du 2026-11-25', action: 'shop' });
  });
});

describe('serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 100, authAttempts: 1000 }, stats: { adminUsers: ['Gerante'] } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const api = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, {
      method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: r.status, ...(await r.json()) };
  };

  it('GET /api/vie pour un invité ; mot du patron réservé aux admins et journalisé', async () => {
    const pub = await api('/vie');
    expect(pub.status).toBe(200);
    expect(Array.isArray(pub.items)).toBe(true);
    expect(pub.items.some((i: VieItem) => i.id === 'patron')).toBe(false);

    const joueur = (await api('/register', { username: 'Lambda', password: 'motdepasse1' })).token;
    const admin = (await api('/register', { username: 'Gerante', password: 'motdepasse1' })).token;
    expect((await api('/admin/vie/patron', { text: 'Pirate !' })).status).toBe(403);
    expect((await api('/admin/vie/patron', { text: 'Pirate !' }, joueur)).status).toBe(403);
    expect((await api('/admin/vie', undefined, joueur)).status).toBe(403);

    const r = await api('/admin/vie/patron', { text: 'Tournoi spécial samedi à 21 h !', days: 2 }, admin);
    expect(r.status).toBe(200);
    expect(r.patron.text).toBe('Tournoi spécial samedi à 21 h !');
    const after = await api('/vie');
    expect(after.items[0]).toMatchObject({ id: 'patron', icon: '📣', text: 'Tournoi spécial samedi à 21 h !', action: 'none' });

    const adm = await api('/admin/vie', undefined, admin);
    expect(adm.status).toBe(200);
    expect(adm.patron.text).toBe('Tournoi spécial samedi à 21 h !');
    expect(adm.champions.week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof adm.games7).toBe('object');
    const log = await api('/admin/log', undefined, admin);
    expect(log.log.some((l: { action: string; details: string }) => l.action === 'vie-patron' && l.details.includes('Tournoi spécial'))).toBe(true);

    await api('/admin/vie/patron', { text: '' }, admin);
    expect((await api('/vie')).items.some((i: VieItem) => i.id === 'patron')).toBe(false);
  });
});
