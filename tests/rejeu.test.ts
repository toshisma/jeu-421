/**
 * Parties solo rejouées par le serveur (shared/rejeu, server/solo-replay.ts) :
 *  - une partie jouée « comme le téléphone » puis rejouée donne exactement les mêmes faits (centaines de
 *    graines, variantes du 421, toute la Tournée, patrons, niveaux, Courtisan, Poker menteur) ;
 *  - listes trafiquées refusées ou ramenées au vrai résultat ; anciens clients : récompense de base ;
 *  - pas de double récompense ; temps de rejeu mesuré.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from '../server/app';
import { DEFAULT_CONFIG, MODES, sanitizeConfig } from '../shared/config';
import { TDC_BISTROS, tdcConfig, TDC_QUARTERS, bistrosOf } from '../shared/progress/comptoirs';
import { BOSSES } from '../shared/progress/boss';
import { FETE_BOSSES } from '../shared/progress/fetes';
import { replay421, setup421For, MAX_MOVES_421, PERSONA_CAUTION, cautionOf, type Setup421 } from '../shared/rejeu/r421';
import { replayDm, setupDmFrom } from '../shared/rejeu/dixmille';
import { replayPm, setupPmFrom } from '../shared/rejeu/poker';
import { decide } from '../shared/ai';
import { PERSONAS } from '../client/src/game/personas';
import { fetePersonas } from '../client/src/fetes/personas';
import { rejeuFr } from '../shared/i18n/zones/rejeu.fr';
import { rejeuEn } from '../shared/i18n/zones/rejeu.en';
import { rejeuDe } from '../shared/i18n/zones/rejeu.de';
import { rejeuNl } from '../shared/i18n/zones/rejeu.nl';
import { translateServerText } from '../shared/i18n/server-texts';
import { UNVERIFIED_LINE } from '../server/solo-replay';
import { REJEU_ERRORS } from '../shared/rejeu/common';
import { dmPlace, freeSetup, play421, playDm, playPm, pmPlace, solo421 } from './rejeu-helpers';
import { createGame } from '../shared/engine';

const S = (cfg: Partial<typeof DEFAULT_CONFIG>, opps: [string, 'facile' | 'normal' | 'difficile'][], firstIdx = 0): Setup421 =>
  ({ config: sanitizeConfig({ ...DEFAULT_CONFIG, ...cfg }), opponents: opps.map(([persona, difficulty]) => ({ persona, difficulty })), firstIdx });

describe('rejeu du 421 (moteur partagé)', () => {
  const VARIANTS: Partial<typeof DEFAULT_CONFIG>[] = [
    {}, { variant: 'decharge', startTokens: 5 }, { variant: 'manches', rounds: 4 }, { variant: 'manches', rounds: 1 },
    { maxThrows: 2 }, { tieRule: 'premierPerd' }, { tieRule: 'dernierPerd', rolloffMode: 'addition' }, { fewerThrowsWins: true, direction: 'antihoraire' },
    { totalTokens: 11, chargeThrows: 3 }, { leaderSetsThrows: false, loserStarts: false, bestTieRule: 'premier' }, ...MODES.map((m) => m.patch),
  ];
  it('même résultat chez le joueur et au serveur : 330 graines, variantes, niveaux, 2 à 6 joueurs', () => {
    let n = 0, wins = 0;
    const diffs = ['facile', 'normal', 'difficile'] as const;
    const names = ['marcel', 'josiane', 'baron', 'lulu', 'dede'];
    for (let seed = 1; seed <= 330; seed++) {
      const cfg = VARIANTS[seed % VARIANTS.length];
      const k = 1 + (seed % 5);
      const setup = S(cfg, names.slice(0, k).map((p, i) => [p, diffs[(seed + i) % 3]]), seed % (k + 1));
      const g = play421(setup, seed * 2654435761 >>> 0, diffs[seed % 3], seed);
      const r = replay421(setup, seed * 2654435761 >>> 0, g.moves);
      expect(r.ok, String(seed)).toBe(true);
      if (r.ok) expect(r.facts).toEqual(g.facts);
      n++; if (g.facts.won) wins++;
    }
    expect(n).toBe(330);
    expect(wins).toBeGreaterThan(20); // le joueur simulé gagne parfois, perd souvent : le rejeu le suit
  });

  it('toute la Tournée des comptoirs, patrons de la semaine et adversaires de fête', () => {
    let n = 0;
    for (const b of TDC_BISTROS) for (let i = 0; i < 6; i++) {
      const setup: Setup421 = { config: tdcConfig(b), opponents: b.opponents.map((o) => ({ ...o })), firstIdx: i % (b.opponents.length + 1) };
      const seed = (i * 7919 + b.id.length * 104729) >>> 0;
      const g = play421(setup, seed, 'normal', i);
      const r = replay421(setup, seed, g.moves);
      expect(r.ok && r.facts).toEqual(g.facts);
      n++;
    }
    for (const boss of BOSSES) for (let i = 0; i < 4; i++) {
      const opps: [string, 'difficile' | 'normal'][] = [[boss.persona, 'difficile'], ...['marcel', 'simone', 'dede', 'lulu'].filter((p) => p !== boss.persona).slice(0, boss.sidekicks).map((p) => [p, 'normal'] as [string, 'normal'])];
      const setup = S(boss.config, opps, i % opps.length);
      const g = play421(setup, 1000 + i, 'difficile', i);
      expect(replay421(setup, 1000 + i, g.moves)).toEqual({ ok: true, facts: g.facts });
      n++;
    }
    for (const f of Object.values(FETE_BOSSES)) {
      const setup = S(f.def.config, f.cast.slice(0, 1 + f.def.sidekicks).map((id, i) => [`fete-${id}`, i ? 'normal' : 'difficile']));
      const g = play421(setup, 42, 'normal');
      expect(replay421(setup, 42, g.moves)).toEqual({ ok: true, facts: g.facts });
      n++;
    }
    expect(n).toBe(TDC_BISTROS.length * 6 + BOSSES.length * 4 + 2);
  });

  it('liste trafiquée : décision impossible, en trop, manquante, illisible, trop longue', () => {
    const setup = S({}, [['marcel', 'normal']]);
    const g = play421(setup, 99, 'normal');
    expect(replay421(setup, 99, g.moves).ok).toBe(true);
    expect(replay421(setup, 99, g.moves + 'a')).toEqual({ ok: false, error: REJEU_ERRORS.extra });
    expect(replay421(setup, 99, g.moves.slice(0, -1))).toEqual({ ok: false, error: REJEU_ERRORS.incomplete });
    expect(replay421(setup, 99, 'S')).toEqual({ ok: false, error: REJEU_ERRORS.illegal }); // garder sans avoir lancé
    const d3 = S({ variant: 'decharge' }, [['marcel', 'normal']]);
    expect(replay421(d3, 99, 'ah')).toEqual({ ok: false, error: REJEU_ERRORS.illegal }); // relancer en gardant les 3 dés
    expect(replay421(setup, 99, 'a!')).toEqual({ ok: false, error: REJEU_ERRORS.format });
    expect(replay421(setup, 99, { won: true })).toEqual({ ok: false, error: REJEU_ERRORS.format });
    expect(replay421(setup, 99, 'a'.repeat(MAX_MOVES_421 + 1))).toEqual({ ok: false, error: REJEU_ERRORS.tooLong });
    // Les mêmes décisions avec une autre graine ne racontent pas la même partie : le résultat est celui du moteur.
    const other = replay421(setup, 100, g.moves);
    if (other.ok) expect(other.facts).not.toEqual(g.facts);
  });

  it('table vérifiée au départ : partie libre, patron, fête, Tournée', () => {
    const day = '2026-11-13';
    expect(setup421For(freeSetup(2, 'normal', { totalTokens: 15 }), { day })?.config.totalTokens).toBe(15);
    expect(setup421For({ ...freeSetup(), opponents: [{ persona: 'inconnu', difficulty: 'normal' }] }, { day })).toBeNull();
    expect(setup421For({ ...freeSetup(), opponents: [{ persona: 'marcel', difficulty: 'impossible' }] }, { day })).toBeNull();
    expect(setup421For({ ...freeSetup(), firstIdx: 9 }, { day })).toBeNull();
    expect(setup421For({ ...freeSetup(), opponents: [] }, { day })).toBeNull();
    // Patron imposé : le patron difficile d'abord ; un patron facile est refusé.
    const b = BOSSES.find((x) => x.id === 'baron')!;
    const day0 = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10)).find((d) => setup421For({ config: {}, opponents: [{ persona: 'baron', difficulty: 'difficile' }], firstIdx: 0 }, { boss: 'baron', day: d }))!;
    expect(day0).toBeTruthy();
    expect(setup421For({ config: { values: { v421: 1 } }, opponents: [{ persona: 'baron', difficulty: 'difficile' }], firstIdx: 0 }, { boss: 'baron', day: day0 })!.config.values.v421).toBe(10);
    expect(setup421For({ config: {}, opponents: [{ persona: 'baron', difficulty: 'facile' }], firstIdx: 0 }, { boss: 'baron', day: day0 })).toBeNull();
    void b;
    // Tournée : adversaires du bistrot exigés, règles maison imposées.
    const t = TDC_BISTROS[3];
    expect(setup421For({ config: {}, opponents: t.opponents, firstIdx: 0 }, { tdc: t.id, day })!.config).toEqual(tdcConfig(t));
    expect(setup421For({ config: {}, opponents: [{ persona: 'marcel', difficulty: 'facile' }], firstIdx: 0 }, { tdc: t.id, day })).toBeNull();
  });

  it('prudence des personnages : mêmes valeurs que le téléphone', () => {
    for (const p of PERSONAS) expect(cautionOf(p.id)).toBe(p.style.caution);
    for (const p of fetePersonas(['saint-nicolas', 'fouettard', 'pere-noel'])) expect(PERSONA_CAUTION[p.id]).toBe(p.style.caution);
    for (const q of TDC_QUARTERS) for (const b of bistrosOf(q.id)) for (const o of b.opponents) expect(cautionOf(o.persona)).not.toBeNull();
  });

  it('temps de rejeu : quelques millisecondes par partie', () => {
    const cases: [string, Setup421][] = [
      ['1 adversaire facile', S({}, [['marcel', 'facile']])],
      ['3 adversaires normaux', S({}, [['marcel', 'normal'], ['josiane', 'normal'], ['baron', 'normal']])],
      ['5 adversaires difficiles', S({}, [['marcel', 'difficile'], ['josiane', 'difficile'], ['baron', 'difficile'], ['lulu', 'difficile'], ['dede', 'difficile']])],
    ];
    const out: string[] = [];
    for (const [label, setup] of cases) {
      const games = Array.from({ length: 20 }, (_, i) => ({ seed: 500 + i, moves: play421(setup, 500 + i, 'difficile', i).moves }));
      replay421(setup, games[0].seed, games[0].moves); // tables de l'IA
      const t0 = performance.now();
      for (const g of games) expect(replay421(setup, g.seed, g.moves).ok).toBe(true);
      const ms = (performance.now() - t0) / games.length;
      out.push(`421, ${label} : ${ms.toFixed(2)} ms`);
      expect(ms).toBeLessThan(60);
    }
    const dm = setupDmFrom({ level: 'fouine', target: 10000, bots: ['a', 'b', 'c'] })!;
    const dmg = Array.from({ length: 20 }, (_, i) => ({ seed: i, moves: playDm(dm, i).moves }));
    replayDm(dm, 0, dmg[0].moves);
    let t0 = performance.now();
    for (const g of dmg) expect(replayDm(dm, g.seed, g.moves).ok).toBe(true);
    out.push(`Courtisan 10 000 points, 3 fines fouines : ${((performance.now() - t0) / dmg.length).toFixed(2)} ms`);
    const pm = setupPmFrom({ level: 'fouine', lives: 5, noStraights: false, bots: ['a', 'b', 'c', 'd', 'e'], start: 0 })!;
    const pmg = Array.from({ length: 20 }, (_, i) => ({ seed: i, moves: playPm(pm, i).moves }));
    replayPm(pm, 0, pmg[0].moves);
    t0 = performance.now();
    for (const g of pmg) expect(replayPm(pm, g.seed, g.moves).ok).toBe(true);
    out.push(`Poker menteur 6 joueurs, 5 vies, fines fouines : ${((performance.now() - t0) / pmg.length).toFixed(2)} ms`);
    console.log(`Temps de rejeu (moyenne) :\n  ${out.join('\n  ')}`);
  });

  it('IA déterministe : même décision pour le même état et le même tirage', () => {
    const s = createGame(DEFAULT_CONFIG, [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], 0);
    s.dice = [6, 3, 2]; s.throwsUsed = 1;
    for (const d of ['facile', 'normal', 'difficile'] as const) {
      const r1 = decide(s, 'a', d, () => 0.37), r2 = decide(s, 'a', d, () => 0.37);
      expect(r1).toEqual(r2);
    }
  });
});

describe('rejeu du Courtisan et du Poker menteur', () => {
  it('Courtisan : 300 graines, objectifs et niveaux, mêmes faits', () => {
    const levels = ['debutant', 'habitue', 'fouine'] as const;
    let wins = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const setup = setupDmFrom({ level: levels[seed % 3], target: [2000, 4000, 10000][seed % 3 === 0 ? 0 : seed % 2], bots: ['gege', 'lulu', 'raymond'].slice(0, 1 + (seed % 3)) })!;
      const g = playDm(setup, seed, levels[(seed + 1) % 3]);
      const r = replayDm(setup, seed, g.moves);
      expect(r.ok, String(seed)).toBe(true);
      if (!r.ok) continue;
      expect(r.facts.won).toBe(g.state.winner === 'moi');
      expect(r.facts.place).toBe(dmPlace(g.state));
      expect(r.facts.bestTurn).toBe(g.state.players[0].best);
      if (r.facts.won) wins++;
    }
    expect(wins).toBeGreaterThan(30);
  });
  it('Courtisan : listes trafiquées', () => {
    const setup = setupDmFrom({ level: 'habitue', target: 2000, bots: ['gege'] })!;
    const g = playDm(setup, 5);
    expect(replayDm(setup, 5, g.moves).ok).toBe(true);
    expect(replayDm(setup, 5, `${g.moves}.L`)).toEqual({ ok: false, error: REJEU_ERRORS.extra });
    expect(replayDm(setup, 5, g.moves.split('.').slice(0, -1).join('.'))).toEqual({ ok: false, error: REJEU_ERRORS.incomplete });
    expect(replayDm(setup, 5, 'L.E012345')).toMatchObject({ ok: false }); // mettre de côté des dés qui ne rapportent pas
    expect(replayDm(setup, 5, 'E0')).toEqual({ ok: false, error: REJEU_ERRORS.illegal }); // encaisser sans avoir lancé
    expect(replayDm(setup, 5, 'L;X')).toEqual({ ok: false, error: REJEU_ERRORS.format });
    expect(setupDmFrom({ level: 'triche', target: 2000, bots: ['gege'] })).toBeNull();
    expect(setupDmFrom({ level: 'habitue', target: 50, bots: ['gege'] })).toBeNull();
    expect(setupDmFrom({ level: 'habitue', target: 2000, bots: ['a', 'b', 'c', 'd'] })).toBeNull();
  });
  it('Poker menteur : 300 graines, vies, suites, niveaux, mêmes faits', () => {
    const levels = ['debutant', 'habitue', 'fouine'] as const;
    let wins = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const k = 1 + (seed % 5);
      const setup = setupPmFrom({ level: levels[seed % 3], lives: seed % 2 ? 3 : 5, noStraights: seed % 4 === 0, bots: ['gege', 'lulu', 'raymond', 'josy', 'bebert'].slice(0, k), start: seed % (k + 1) })!;
      const g = playPm(setup, seed, levels[(seed + 2) % 3], seed);
      const r = replayPm(setup, seed, g.moves);
      expect(r.ok, String(seed)).toBe(true);
      if (!r.ok) continue;
      expect(r.facts.won).toBe(g.state.winner === 'moi');
      expect(r.facts.place).toBe(pmPlace(g.state));
      if (r.facts.won) wins++;
    }
    expect(wins).toBeGreaterThan(20);
  });
  it('Poker menteur : listes trafiquées', () => {
    const setup = setupPmFrom({ level: 'habitue', lives: 3, noStraights: false, bots: ['gege'], start: 0 })!;
    const g = playPm(setup, 8);
    expect(replayPm(setup, 8, g.moves).ok).toBe(true);
    expect(replayPm(setup, 8, `${g.moves}.M`)).toEqual({ ok: false, error: REJEU_ERRORS.extra });
    expect(replayPm(setup, 8, 'M')).toEqual({ ok: false, error: REJEU_ERRORS.illegal }); // crier menteur sans annonce
    expect(replayPm(setup, 8, 'A55555')).toMatchObject({ ok: false }); // une seule annonce : partie inachevée
    expect(replayPm(setup, 8, 'A9')).toEqual({ ok: false, error: REJEU_ERRORS.format });
    expect(setupPmFrom({ level: 'habitue', lives: 4, noStraights: false, bots: ['gege'], start: 0 })).toBeNull();
    expect(setupPmFrom({ level: 'habitue', lives: 3, noStraights: false, bots: ['gege'], start: 5 })).toBeNull();
  });
});

describe('textes', () => {
  it('zone rej. complète en en/de/nl ; messages du serveur traduits', () => {
    for (const d of [rejeuEn, rejeuDe, rejeuNl]) {
      expect(Object.keys(d).sort()).toEqual(Object.keys(rejeuFr).sort());
      for (const v of Object.values(d)) expect(v.length).toBeGreaterThan(3);
    }
    for (const t of [UNVERIFIED_LINE, ...Object.values(REJEU_ERRORS)]) for (const l of ['en', 'de', 'nl'] as const) expect(translateServerText(l, t)).not.toBe(t);
  });
});

// ---------------------------------------------------------------------------------------------
// Serveur

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
let clock = Date.parse('2026-12-05T10:00:00Z'); // Saint-Nicolas : adversaire de fête disponible
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 1000, authAttempts: 100000, tdcRoundMs: 1, now: () => clock } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv?.close(); });
async function api(path: string, body?: unknown, token?: string) {
  const r = await fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
let nUser = 0;
const register = async () => (await api('/register', { username: `Rejeu${++nUser}`, password: 'motdepasse1' })).token as string;

describe('serveur : parties solo rejouées', () => {
  it('421 : graine donnée au départ, résultat calculé par le serveur, victoire inventée ignorée', async () => {
    const t = await register();
    const lose = await solo421(api, t, { want: 'lose', setup: freeSetup(1, 'difficile'), extra: { won: true, place: 1, count421: 9, combos: { '421': 9, '111': 5 } } });
    expect(lose.end.ok).toBe(true);
    expect(lose.end.verified).toBe(true);
    expect(lose.end.reward.won).toBe(false); // « won: true » envoyé : ramené au vrai résultat
    const l421 = lose.end.reward.lines.find((l: { label: string }) => l.label.startsWith('4-2-1'));
    if (lose.facts.count421) expect(l421.coins).toBeGreaterThan(0); else expect(l421).toBeUndefined();
    const win = await solo421(api, t, { want: 'win', setup: freeSetup(1, 'facile') });
    expect(win.end.verified).toBe(true);
    expect(win.end.reward.won).toBe(true);
    expect(win.end.applied.profile.stats.won).toBeGreaterThanOrEqual(1);
    // Jeton à usage unique : pas de double récompense.
    expect((await api('/solo/end', { gameToken: win.start.gameToken, moves: 'a' }, t)).status).toBe(400);
  });

  it('421 : liste refusée ou ancien téléphone → récompense de base seulement, avec la ligne « Mettez à jour la page… »', async () => {
    const t = await register();
    const st = await api('/solo/start', { setup: freeSetup() }, t);
    const bad = await api('/solo/end', { gameToken: st.gameToken, moves: 'S', won: true, rounds: 10, opponents: 1 }, t);
    expect(bad.verified).toBe(false);
    expect(bad.refused).toBe(REJEU_ERRORS.illegal);
    expect(bad.reward.won).toBe(false); // graine délivrée mais décisions refusées : compté comme une défaite
    expect(bad.reward.lines.at(-1).label).toBe(UNVERIFIED_LINE);
    expect(bad.applied.achievementsDone).toEqual([]);
    expect(bad.applied.questsDone).toEqual([]);
    // Ancienne version : pas de table au début, pas de décisions à la fin.
    const old = await api('/solo/start', {}, t);
    expect(old.seed).toBeUndefined();
    const before = (await api('/me', undefined, t)).profile;
    const e = await api('/solo/end', { gameToken: old.gameToken, won: true, rounds: 10, opponents: 3, count421: 3, combos: { '421': 3, '111': 2, brelan: 4 } }, t);
    expect(e.verified).toBe(false);
    expect(e.reward.won).toBe(true);
    expect(e.reward.lines.some((l: { label: string }) => l.label.startsWith('4-2-1'))).toBe(false);
    expect(e.applied.profile.stats.brelans).toBe(before.stats.brelans); // combinaisons annoncées : rien
    expect(e.applied.profile.coins).toBeGreaterThan(before.coins);
  });

  it('graine délivrée mais aucune décision envoyée : défaite, quel que soit le jeu', async () => {
    const t = await register();
    const s1 = await api('/solo/start', { setup: freeSetup() }, t);
    const e1 = await api('/solo/end', { gameToken: s1.gameToken, won: true, rounds: 12, opponents: 1 }, t);
    expect(e1.verified).toBe(false);
    expect(e1.reward.won).toBe(false);
  });

  it('au plus 3 parties solo ouvertes par compte : une 4e remplace la plus ancienne', async () => {
    const t = await register();
    const st = [];
    for (let i = 0; i < 4; i++) st.push(await api('/solo/start', { setup: freeSetup() }, t));
    expect((await api('/solo/end', { gameToken: st[0].gameToken, moves: 'a' }, t)).status).toBe(400); // la plus ancienne n'existe plus
    const g = play421(st[3].setup, st[3].seed, 'difficile', 1);
    expect((await api('/solo/end', { gameToken: st[3].gameToken, moves: g.moves }, t)).verified).toBe(true);
  });

  it('Tournée : étoiles seulement pour une partie rejouée ; table du bistrot exigée', async () => {
    const t = await register();
    const b = TDC_BISTROS[0];
    const table = { config: {}, opponents: b.opponents, firstIdx: 0 };
    // Ancien téléphone : aucune étoile, même en annonçant une victoire.
    const old = await api('/solo/start', { tdc: b.id }, t);
    const e0 = await api('/solo/end', { gameToken: old.gameToken, won: true, place: 1, rounds: 12, roundsLost: 0, count421: 1 }, t);
    expect(e0.tdc).toBeUndefined();
    expect((await api('/me', undefined, t)).profile.tdc?.[b.id]).toBeUndefined();
    // Mauvais adversaires : pas de graine.
    expect((await api('/solo/start', { tdc: b.id, setup: freeSetup() }, t)).seed).toBeUndefined();
    const w = await solo421(api, t, { tdc: b.id, setup: table, want: 'win', tries: 120 });
    expect(w.end.verified).toBe(true);
    expect(w.end.tdc.newStars).toContain(1);
    expect((await api('/me', undefined, t)).profile.tdc[b.id] & 1).toBe(1);
  });

  it('adversaire de fête : compté seulement s’il est vraiment battu', async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-12-05T15:00:00Z'));
    const t = await register();
    const f = FETE_BOSSES['saint-nicolas'];
    const table = { config: {}, opponents: f.cast.slice(0, 1 + f.def.sidekicks).map((id, i) => ({ persona: `fete-${id}`, difficulty: i ? 'normal' : 'difficile' })), firstIdx: 0 };
    const lose = await solo421(api, t, { boss: f.def.id, setup: table, want: 'lose' });
    expect(lose.end.verified).toBe(true);
    expect(lose.end.applied.achievementsDone.some((a: { id: string }) => a.id.startsWith('fet-boss'))).toBe(false);
    const win = await solo421(api, t, { boss: f.def.id, setup: table, want: 'win', tries: 200 });
    expect(win.end.applied.achievementsDone.some((a: { id: string }) => a.id.startsWith('fet-boss'))).toBe(true);
    // Ancien téléphone : victoire annoncée contre l'adversaire de fête → rien de spécial.
    const t2 = await register();
    const old = await api('/solo/start', { boss: f.def.id }, t2);
    const e = await api('/solo/end', { gameToken: old.gameToken, won: true, rounds: 5, opponents: 2 }, t2);
    expect(e.applied.achievementsDone).toEqual([]);
    vi.useRealTimers();
  });

  it('Courtisan et Poker menteur : rejoués par le serveur, succès possibles ; ancien téléphone : base seulement', async () => {
    const t = await register();
    const dmSetup = { level: 'debutant', target: 2000, bots: ['gege'] };
    let dmWin: any = null;
    for (let i = 0; i < 40 && !dmWin; i++) {
      const st = await api('/dixmille/start', { setup: dmSetup }, t);
      expect(st.seed).toBeTypeOf('number');
      const g = playDm(st.setup, st.seed);
      if (g.state.winner !== 'moi') continue;
      dmWin = await api('/dixmille/end', { gameToken: st.gameToken, moves: g.moves, won: false, place: 2 }, t);
    }
    expect(dmWin.verified).toBe(true);
    expect(dmWin.reward.won).toBe(true); // « won: false » envoyé : le vrai résultat compte
    expect(dmWin.applied.profile.dm.vWins).toBe(1);
    const st = await api('/dixmille/start', { setup: dmSetup }, t);
    const bad = await api('/dixmille/end', { gameToken: st.gameToken, moves: 'E0', won: true, place: 1, opponents: 1, level: 'debutant' }, t);
    expect(bad.verified).toBe(false);
    expect(bad.applied.profile.dm.vWins).toBe(1);
    expect(bad.reward.lines.at(-1).label).toBe(UNVERIFIED_LINE);

    const pmSetup = { level: 'debutant', lives: 3, noStraights: false, bots: ['gege'], start: 0 };
    let pmEnd: any = null;
    for (let i = 0; i < 40 && !pmEnd; i++) {
      const s = await api('/poker/start', { setup: pmSetup }, t);
      const g = playPm(s.setup, s.seed, 'fouine', i);
      if (g.state.winner !== 'moi') continue;
      pmEnd = await api('/poker/end', { gameToken: s.gameToken, moves: g.moves, won: false }, t);
    }
    expect(pmEnd.verified).toBe(true);
    expect(pmEnd.reward.won).toBe(true);
    expect(pmEnd.applied.profile.pm.vWins).toBe(1);
    const old = await api('/poker/start', {}, t);
    expect(old.seed).toBeUndefined();
    const e = await api('/poker/end', { gameToken: old.gameToken, won: true, place: 1, opponents: 5, level: 'fouine' }, t);
    expect(e.verified).toBe(false);
    expect(e.applied.profile.pm.vWins).toBe(1);
    expect(e.applied.questsDone).toEqual([]);
    // Graine d'un jeu, décisions d'un autre : refusé.
    const s1 = await api('/poker/start', { setup: pmSetup }, t);
    const e1 = await api('/dixmille/end', { gameToken: s1.gameToken, moves: 'L' }, t);
    expect(e1.verified).toBe(false);
  });
});

describe('relecture 0.56', () => {
  it('partie libre du 421 : difficultés mélangées ou habitué en double refusés', async () => {
    const { setup421For } = await import('../shared/rejeu/r421');
    const { HABITUES } = await import('../shared/rejeu/r421').catch(() => ({ HABITUES: undefined as unknown as string[] }));
    const ids: string[] = (HABITUES as string[] | undefined) ?? [];
    if (ids.length < 2) return;
    const base = { firstIdx: 0, config: {} };
    expect(setup421For({ ...base, opponents: [{ persona: ids[0], difficulty: 'difficile' }, { persona: ids[1], difficulty: 'facile' }] }, { day: '2026-11-13' })).toBeNull();
    expect(setup421For({ ...base, opponents: [{ persona: ids[0], difficulty: 'normal' }, { persona: ids[0], difficulty: 'normal' }] }, { day: '2026-11-13' })).toBeNull();
    expect(setup421For({ ...base, opponents: [{ persona: ids[0], difficulty: 'normal' }, { persona: ids[1], difficulty: 'normal' }] }, { day: '2026-11-13' })).not.toBeNull();
  });
});

describe('plafond quotidien vérifié avant le rejeu', () => {
  it('au-delà du plafond : refus immédiat, sans rejouer', async () => {
    const small = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 1, authAttempts: 100000 } });
    try {
      const b2 = `http://localhost:${small.port}`;
      const call = async (path: string, body: unknown, token?: string) => {
        const r = await fetch(`${b2}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
        return { status: r.status, ...(await r.json().catch(() => ({}))) };
      };
      const t = (await call('/register', { username: 'Plafond1', password: 'motdepasse1' })).token as string;
      const one = await solo421(call, t, {});
      expect(one.end.ok).toBe(true);
      const st = await call('/solo/start', { setup: freeSetup() }, t);
      const g = play421(st.setup, st.seed, 'difficile', 1);
      expect((await call('/solo/end', { gameToken: st.gameToken, moves: g.moves }, t)).status).toBe(429);
    } finally { await small.close(); }
  });
});
