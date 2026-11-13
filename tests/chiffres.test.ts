/** « Le 421 en chiffres » : probabilités exactes, compteurs anonymes, seuils, page générée sans aucune donnée personnelle. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Store } from '../server/db';
import { computeChiffres, fillTemplate, mountChiffres, noteAction, noteOnlineGame } from '../server/chiffres';
import { CHIFFRES_MIN, CHIFFRES_SLUGS, ROLL_KINDS, theoreticalKinds } from '../shared/chiffres';
import { evaluate } from '../shared/combos';
import { DEFAULT_CONFIG } from '../shared/config';
import type { GameState, RollRecord, RoundSummary } from '../shared/engine';
// @ts-expect-error script Node sans déclaration de types
import { CHIFFRES_SLUGS as SCRIPT_SLUGS } from '../scripts/seo-chiffres-pages.mjs';

const pub = join(process.cwd(), 'client', 'public');
const template = (lang: keyof typeof CHIFFRES_SLUGS) => readFileSync(join(pub, `${CHIFFRES_SLUGS[lang]}.html`), 'utf8');

describe('probabilités exactes (216 tirages)', () => {
  it('nombre de tirages par famille', () => {
    const t = theoreticalKinds();
    expect(Object.fromEntries(ROLL_KINDS.map((k) => [k, t[k].ways]))).toEqual({ '421': 6, '111': 1, '11x': 15, brelan: 5, suite: 24, autre: 162, nenette: 3 });
    expect(ROLL_KINDS.reduce((s, k) => s + t[k].p, 0)).toBeCloseTo(1, 12);
    expect(t['421'].p).toBeCloseTo(1 / 36, 12);
  });
  it('adresses identiques côté serveur et côté pages', () => { expect(SCRIPT_SLUGS).toEqual(CHIFFRES_SLUGS); });
});

const fakeGame = (sm: Partial<RoundSummary> | null, phase: GameState['phase'] = 'decharge') =>
  ({ lastSummary: sm ? { seq: 0, round: 1, phase, winnerId: null, loserId: null, amount: 0, text: '', barrage: false, ...sm } : null, phase }) as unknown as GameState;
const rollOf = (dice: number[], kept = [false, false, false]): RollRecord =>
  ({ seq: 1, round: 1, playerId: 'p', dice, kept, throwIndex: 1, throwLimit: 3, combo: evaluate(dice, DEFAULT_CONFIG.values), rolloff: false });

describe('compteurs et calcul', () => {
  it('base vide : rien d’inventé, seuils respectés', () => {
    const store = new Store(':memory:');
    const d = computeChiffres(store);
    expect(d.games.k421.total).toBe(0);
    expect(d.rolls.total).toBe(0);
    expect(d.hours).toBeNull();
    expect(d.countries).toBeNull();
    const html = fillTemplate(template('fr'), d, 'fr');
    expect(html).toContain('moins de 10');
    expect(html).toContain('Pas encore assez');
    expect(html).toContain('2,78');
  });

  it('lancers complets seulement, barrages enchaînés, parties en ligne des autres jeux', () => {
    const store = new Store(':memory:');
    let x = 7;
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return 1 + (x % 6); };
    for (let i = 0; i < 1500; i++) noteAction(store, 'T1', rollOf([rnd(), rnd(), rnd()]), fakeGame(null));
    noteAction(store, 'T1', rollOf([4, 2, 1], [true, false, false]), fakeGame(null)); // dé gardé : pas un tirage complet
    // Manche 3 : deux barrages d'affilée ; manche 4 : un seul.
    noteAction(store, 'T2', undefined, fakeGame({ seq: 10, round: 3, barrage: true }));
    noteAction(store, 'T2', undefined, fakeGame({ seq: 10, round: 3, barrage: true })); // même résumé : compté une fois
    noteAction(store, 'T2', undefined, fakeGame({ seq: 11, round: 3, barrage: true }));
    noteAction(store, 'T2', undefined, fakeGame({ seq: 12, round: 3, barrage: false }));
    noteAction(store, 'T2', undefined, fakeGame({ seq: 13, round: 4, barrage: true }));
    noteOnlineGame(store, 'courtisan'); noteOnlineGame(store, 'poker'); noteOnlineGame(store, 'poker');
    const d = computeChiffres(store);
    expect(d.rolls.total).toBe(1500);
    expect(d.barrage.total).toBe(3);
    expect(d.barrage.longest).toBe(2);
    expect(d.games.courtisan.total).toBe(1);
    expect(d.games.poker.total).toBe(2);
    const html = fillTemplate(template('fr'), d, 'fr');
    expect(html).toContain('Fréquence réelle');
    expect(html).toContain('2 barrages d’affilée');
  });

  it('pays au-delà du seuil seulement, heures, durées ; aucun pseudo, identifiant ni adresse dans la page', () => {
    const store = new Store(':memory:');
    const db = store.sqlite;
    db.exec(`CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, day TEXT NOT NULL, visitor TEXT NOT NULL,
      referrer TEXT NOT NULL, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, country TEXT, lang TEXT, device TEXT NOT NULL, landing TEXT NOT NULL, user_id TEXT);
      CREATE TABLE IF NOT EXISTS visit_events (visitor TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, day TEXT NOT NULL, page TEXT, PRIMARY KEY (visitor, kind));`);
    const insV = db.prepare("INSERT INTO visits (at, day, visitor, referrer, country, device, landing) VALUES (?, '2026-11-10', ?, '203.0.113.7', ?, 'mobile', '/')");
    const insE = db.prepare("INSERT INTO visit_events (visitor, kind, at, day) VALUES (?, 'first_play', 1, '2026-11-10')");
    const plan: [string, number][] = [['BE', 40], ['FR', 25], ['CH', 12], ['NL', 4]];
    let n = 0;
    for (const [c, k] of plan) for (let i = 0; i < k; i++) { const v = `visiteur-secret-${n++}`; insV.run(1, v, c); insE.run(v); }
    db.prepare("INSERT INTO users (id, username, pass_hash, recovery_hash, created_at, profile) VALUES ('u-secret', 'PseudoSecret', 'x', 'x', 1, '{}')").run();
    const t0 = Date.parse('2026-11-10T19:30:00Z'); // 20 h 30 à Bruxelles
    for (let i = 0; i < CHIFFRES_MIN.hours + 10; i++) {
      store.logGame({ id: `g${i}`, mode: i % 2 ? 'online' : 'solo', humans: i % 2 ? 2 : 1, bots: 1, startedAt: t0 - 300_000, endedAt: t0, day: '2026-11-10',
        players: [{ key: 'u:u-secret', userId: 'u-secret', won: true }] });
    }
    const d = computeChiffres(store, Date.parse('2026-11-13T10:00:00Z'));
    expect(d.games.k421.total).toBe(CHIFFRES_MIN.hours + 10);
    expect(d.hours!.byHour[20]).toBe(CHIFFRES_MIN.hours + 10);
    expect(d.durations.onlineMedian).toBe(300);
    expect(d.countries!.rows.map((r) => r.code)).toEqual(['BE', 'FR', 'CH']);
    expect(d.countries!.othersShare).toBeCloseTo(4.9, 1);
    for (const lang of ['fr', 'en', 'de', 'nl'] as const) {
      const html = fillTemplate(template(lang), d, lang);
      expect(html).not.toMatch(/PseudoSecret|u-secret|visiteur-secret|203\.0\.113/);
      expect(html).not.toMatch(/Pays-Bas|Netherlands|Niederlande|Nederland<\/td>/);
      expect(html).toContain(`<html lang="${lang}">`);
      for (const j of [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])) {
        const ld = JSON.parse(j);
        const ds = ld['@graph'].find((x: { '@type': string }) => x['@type'] === 'Dataset');
        expect(ds.dateModified).toBe('2026-11-13');
        expect(ds.temporalCoverage).toBe('2026-11-10/2026-11-13');
        expect(JSON.stringify(ld)).not.toMatch(/ratingValue|aggregateRating|review/i);
      }
    }
    const fr = fillTemplate(template('fr'), d, 'fr');
    expect(fr).toContain('Belgique');
    expect(fr).toContain('20 h');
    expect(fr).toContain('<time datetime="2026-11-13">');
  });
});

describe('route publique', () => {
  let base = '';
  let close: () => void;
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chiffres-'));
    for (const l of ['fr', 'en'] as const) writeFileSync(join(dir, `${CHIFFRES_SLUGS[l]}.html`), template(l));
    const store = new Store(':memory:');
    noteOnlineGame(store, 'poker');
    const app = express();
    mountChiffres(app, store, dir);
    app.get('*', (_q, r) => r.status(404).send('absent'));
    const srv = app.listen(0);
    await new Promise((r) => srv.once('listening', r));
    base = `http://localhost:${(srv.address() as AddressInfo).port}`;
    close = () => srv.close();
  });
  afterAll(() => close());
  it('HTML complet sans JavaScript, en cache, en français et en anglais ; page absente → suite normale', async () => {
    const r = await fetch(`${base}/le-421-en-chiffres`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(r.headers.get('cache-control')).toContain('max-age');
    const html = await r.text();
    expect(html).toContain('<h2 id="parties">Parties jouées</h2>');
    expect(html).toContain('<link rel="canonical" href="https://421online.com/le-421-en-chiffres">');
    expect(html).not.toContain('Les chiffres sont calculés par le serveur du jeu.');
    expect(await (await fetch(`${base}/421-dice-game-statistics`)).text()).toContain('Games played');
    expect((await fetch(`${base}/421-wuerfelspiel-statistik`)).status).toBe(404);
  });
});
