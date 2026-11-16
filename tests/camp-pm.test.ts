/**
 * Campagne du Poker menteur « Les Arrière-salles » : données, déblocages, styles de bluff rejouables,
 * étoiles calculées par le serveur après rejeu (table imposée, refus, pas de double récompense), reprise
 * d'invité plafonnée, étapes jouables jusqu'au bout, traductions complètes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import {
  CAMPAIGN, CPM_CHAPTERS, CPM_CHARS, CPM_MAX_STARS, CPM_STAGES, CPM_STAR_COINS, CPM_TITLES_FR, applyCpm, campaignSummary, capCpmImport, chapterUnlocked,
  cleanCpm, cpmSetup, cpmStage, stageUnlocked, stagesOf, starsOf, type CpmFacts, type CpmProgress,
} from '../shared/campaigns/pm';
import { cpmPokerEnd } from '../server/camp-pm';
import { act, type PmAction, type PmState } from '../shared/pokermenteur/engine';
import { decide, PM_STYLES } from '../shared/pokermenteur/ai';
import { PM_PERSONAS } from '../shared/pokermenteur/personas';
import { encodePm, newGamePm, pmBotDecideFor, replayPm, setupPmFrom, type SetupPm } from '../shared/rejeu/poker';
import { mulberry32 } from '../shared/rng';
import { capGuestImport, newProfile, sanitizeProfile, titleLabel } from '../shared/progress/profile';
import { DICTS, type Lang } from '../shared/i18n';
import { cpmFr } from '../shared/i18n/zones/camppm.fr';
import { translateServerText } from '../shared/i18n/server-texts';

/** Partie de campagne jouée « comme le téléphone » : ordinateurs de la table, joueur = une Fine fouine. */
function playCamp(setup: SetupPm, seed: number, humanSeed = 3): { moves: string; state: PmState } {
  let s = newGamePm(setup, seed);
  const hr = mulberry32(humanSeed);
  const moves: string[] = [];
  while (s.phase !== 'fini') {
    const mine = s.players[s.current].id === 'moi';
    const a: PmAction = mine ? decide(s, 'fouine', hr) : pmBotDecideFor(setup, s);
    const r = act(s, a);
    if ('error' in r) throw new Error(r.error);
    if (mine) moves.push(encodePm(a));
    s = r.state;
  }
  return { moves: moves.join('.'), state: s };
}
const ids = (c: string) => stagesOf(c).map((s) => s.id);
const all = (c: string, mask = 1): CpmProgress => Object.fromEntries(ids(c).map((id) => [id, mask]));
const facts = (o: Partial<CpmFacts> = {}): CpmFacts => ({ won: true, place: 1, callsRight: 0, bluffsPassed: 0, livesLost: 3, knockouts: 0, ...o });

describe('données', () => {
  it('12 tables, 4 endroits de 3, hôte en premier, adversaires connus et distincts, défis cohérents', () => {
    expect(CPM_STAGES).toHaveLength(12);
    expect(CAMPAIGN).toMatchObject({ id: 'pm', game: 'pm', nameKey: 'cpm.name', maxStars: 36 });
    expect(CPM_MAX_STARS).toBe(36);
    for (const c of CPM_CHAPTERS) expect(stagesOf(c.id)).toHaveLength(3);
    const known = new Set([...CPM_CHARS.map((c) => c.id), ...PM_PERSONAS.map((p) => p.id)]);
    for (const st of CPM_STAGES) {
      expect(st.opponents[0].id).toBe(st.host);
      expect(st.opponents.length).toBeGreaterThanOrEqual(1);
      expect(st.opponents.length).toBeLessThanOrEqual(5);
      expect(new Set(st.opponents.map((o) => o.id)).size).toBe(st.opponents.length);
      for (const o of st.opponents) expect(known.has(o.id), o.id).toBe(true);
      for (const s of st.stars) {
        if (s.k === 'lives') expect(s.n).toBeLessThan(st.lives - 1); // jamais une étoile acquise d'office
        if (s.k === 'ko') expect(s.n).toBeLessThanOrEqual(st.opponents.length);
        expect(s.n).toBeGreaterThanOrEqual(1);
      }
      // Barème de la récompense : le niveau le plus facile de la table.
      const t = cpmSetup(st, 0);
      expect(t.levels).toEqual(st.opponents.map((o) => o.level));
      expect(['debutant', 'habitue', 'fouine'].indexOf(t.level)).toBe(Math.min(...st.opponents.map((o) => ['debutant', 'habitue', 'fouine'].indexOf(o.level))));
    }
    // Les quatre styles de bluff sont représentés.
    for (const s of PM_STYLES) expect(CPM_CHARS.some((c) => c.style === s)).toBe(true);
    for (const c of CPM_CHAPTERS) expect(titleLabel(c.title)).toBe(CPM_TITLES_FR[c.id]);
  });
});

describe('déblocages et résumé', () => {
  it('premier endroit seulement au départ, tables dans l’ordre, endroit suivant avec étoiles + endroit précédent', () => {
    const [a, b, c] = ids('arriere');
    expect(stageUnlocked({}, a)).toBe(true);
    expect(stageUnlocked({}, b)).toBe(false);
    expect(stageUnlocked({ [a]: 1 }, b)).toBe(true);
    expect(stageUnlocked({ [a]: 1 }, c)).toBe(false);
    expect(chapterUnlocked(all('arriere'), 'cabaret')).toBe(true); // 3 étoiles
    expect(chapterUnlocked({ ...all('arriere'), ...all('cabaret') }, 'docks')).toBe(false); // 6 < 8
    expect(chapterUnlocked({ ...all('arriere', 3), ...all('cabaret') }, 'docks')).toBe(true); // 9
    expect(chapterUnlocked({ ...all('arriere', 7) }, 'docks')).toBe(false); // cabaret pas fait
    expect(stageUnlocked({}, 'inconnue')).toBe(false);
  });
  it('campaignSummary : étoiles, prochaine table, fini', () => {
    const p = newProfile();
    expect(campaignSummary(p)).toEqual({ stars: 0, maxStars: 36, next: { id: 'cave', nameKey: 'cpm.s.cave' }, done: false });
    const s = campaignSummary({ ...p, cpm: { cave: 7, reserve: 1 } });
    expect(s.stars).toBe(4);
    expect(s.next?.id).toBe('cuisine');
    const full = Object.fromEntries(CPM_STAGES.map((x) => [x.id, 7]));
    expect(campaignSummary({ ...p, cpm: full })).toMatchObject({ stars: 36, next: null, done: true });
  });
});

describe('table imposée et rejeu', () => {
  it('le téléphone ne peut pas envoyer de niveaux ni de styles par ordinateur (parties libres)', () => {
    const t = cpmSetup(cpmStage('cave')!, 1);
    expect(setupPmFrom(t)).toBeNull();
    expect(setupPmFrom({ ...t, levels: undefined, styles: undefined })).not.toBeNull();
  });
  it('styles de bluff rejouables : même partie chez le joueur et au serveur, toutes les tables', () => {
    for (const st of CPM_STAGES) {
      for (let seed = 1; seed <= 6; seed++) {
        const setup = cpmSetup(st, seed % (st.opponents.length + 1));
        const g = playCamp(setup, seed * 7919, seed);
        const r = replayPm(setup, seed * 7919, g.moves);
        expect(r.ok, st.id).toBe(true);
        if (r.ok) {
          expect(r.facts.won).toBe(g.state.winner === 'moi');
          expect(r.facts.knockouts).toBeLessThanOrEqual(st.opponents.length);
          if (r.facts.won) expect(r.facts.knockouts).toBeGreaterThanOrEqual(1); // le dernier adversaire tombe face à moi
        }
      }
    }
  });
  it('rejeu avec une autre table que celle de l’étape : pas d’étoile', () => {
    const st = cpmStage('cave')!;
    const fake = { ...cpmSetup(st, 0), levels: ['debutant'] as const, styles: [null] };
    const store = { userById: () => { throw new Error('ne doit pas lire'); } } as any;
    expect(cpmPokerEnd(store, { id: 'x' } as any, 'cpm:cave', fake as any, { won: true } as any)).toBeNull();
    expect(cpmPokerEnd(store, { id: 'x' } as any, null, cpmSetup(st, 0), { won: true } as any)).toBeNull();
  });
});

describe('étoiles et récompenses', () => {
  it('rien sans victoire ; défis lus dans les faits du rejeu', () => {
    const st = cpmStage('cave')!; // vies ≤ 1, 1 bluff démasqué
    expect(starsOf(st, facts({ won: false, place: 2 }))).toBe(0);
    expect(starsOf(st, facts())).toBe(1);
    expect(starsOf(st, facts({ livesLost: 1 }))).toBe(3);
    expect(starsOf(st, facts({ callsRight: 1 }))).toBe(5);
    expect(starsOf(st, facts({ livesLost: 0, callsRight: 2 }))).toBe(7);
    expect(starsOf(cpmStage('coulisses')!, facts({ callsRight: 2 }))).toBe(3);
  });
  it('nouvelles étoiles seulement, 5 pièces chacune, titre d’endroit une fois', () => {
    let p = { ...newProfile(), coins: 0 };
    let r = applyCpm(p, 'cave', facts({ livesLost: 1 }));
    expect(r.result.newStars).toEqual([1, 2]);
    expect(r.profile.coins).toBe(2 * CPM_STAR_COINS);
    r = applyCpm(r.profile, 'cave', facts({ livesLost: 1, callsRight: 1 }));
    expect(r.result.newStars).toEqual([3]);
    expect(r.profile.coins).toBe(3 * CPM_STAR_COINS);
    r = applyCpm(r.profile, 'cave', facts({ livesLost: 0, callsRight: 4 }));
    expect(r.result.newStars).toEqual([]);
    expect(r.profile.coins).toBe(3 * CPM_STAR_COINS);
    p = applyCpm(r.profile, 'reserve', facts()).profile;
    const done = applyCpm(p, 'cuisine', facts());
    expect(done.result.title).toBe('cpm:arriere');
    expect(done.profile.titles).toContain('cpm:arriere');
    expect(applyCpm(done.profile, 'cuisine', facts()).result.title).toBeUndefined();
  });
  it('profil : nettoyage, reprise d’invité plafonnée au premier endroit, titre retiré à la reprise', () => {
    expect(cleanCpm({ cave: 7, reserve: 2, inconnue: 3, cuisine: 9 })).toEqual({ cave: 7 });
    const guest = sanitizeProfile({ ...newProfile(), cpm: { cave: 7, reserve: 3, loge: 7, minuit: 7 }, titles: ['cpm:arriere', 'cpm:cercle'] });
    expect(guest.cpm).toEqual({ cave: 7, reserve: 3, loge: 7, minuit: 7 });
    const imported = capGuestImport(guest);
    expect(imported.cpm).toEqual({ cave: 7, reserve: 3 });
    expect(imported.titles ?? []).not.toContain('cpm:cercle');
    expect(capCpmImport(undefined)).toBeUndefined();
  });
});

describe('serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 1000, authAttempts: 100000 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const call = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) } as any;
  };
  let n = 0;
  const account = async (guestProfile?: object) => (await call('/register', { username: `Arriere${++n}`, password: 'motdepasse1', ...(guestProfile ? { guestProfile } : {}) })).token as string;
  /** Vraie partie de campagne (graine du serveur, table du serveur), jusqu'au résultat voulu. */
  const real = async (t: string, camp: string, want: (won: boolean, s: PmState) => boolean = (w) => w, tries = 120) => {
    for (let i = 0; i < tries; i++) {
      const st = cpmStage(camp)!;
      const start = await call('/poker/start', { camp, setup: cpmSetup(st, i % (st.opponents.length + 1)) }, t);
      const g = playCamp(start.setup, start.seed, i + 11);
      if (!want(g.state.winner === 'moi', g.state)) continue;
      const end = await call('/poker/end', { gameToken: start.gameToken, moves: g.moves, won: false, place: 4 }, t);
      return { start, end, g };
    }
    throw new Error('résultat voulu introuvable');
  };

  it('étoiles attribuées par le serveur après rejeu ; partie comptée comme un Poker menteur contre l’ordinateur', async () => {
    const t = await account();
    const { start, end } = await real(t, 'cave');
    expect(start.camp).toBe(true);
    expect(start.setup).toEqual(cpmSetup(cpmStage('cave')!, start.setup.start));
    expect(end.verified).toBe(true);
    expect(end.cpm.newStars).toContain(1);
    expect(end.applied.profile.cpm.cave & 1).toBe(1);
    expect(end.applied.profile.pm.games).toBe(1);
    expect(end.applied.profile.pm.vWins).toBe(1);
    expect(end.applied.profile.coins).toBeGreaterThanOrEqual(end.cpm.newStars.length * CPM_STAR_COINS);
    // Même étoile une seconde fois : rien de neuf.
    const again = await real(t, 'cave', (w, s) => w && (s.players.find((p) => p.id === 'moi')!.lives < 3 || true));
    expect(again.end.cpm.newStars.filter((x: number) => x === 1)).toEqual([]);
  });
  it('défaite : partie comptée, aucune étoile', async () => {
    const t = await account();
    const { end } = await real(t, 'cave', (w) => !w);
    expect(end.verified).toBe(true);
    expect(end.cpm.after).toBe(0);
    expect(end.applied.profile.cpm).toBeUndefined();
  });
  it('table fermée : pas une partie de campagne (pas de table imposée, pas de graine pour une table trafiquée)', async () => {
    const t = await account();
    const start = await call('/poker/start', { camp: 'minuit', setup: cpmSetup(cpmStage('minuit')!, 0) }, t);
    expect(start.camp).toBeUndefined();
    expect(start.seed).toBeUndefined();
    const end = await call('/poker/end', { gameToken: start.gameToken, won: true, place: 1, opponents: 5, level: 'fouine' }, t);
    expect(end.verified).toBe(false);
    expect(end.cpm).toBeUndefined();
    expect(end.applied.profile.cpm).toBeUndefined();
  });
  it('table envoyée différente : le serveur impose celle de l’étape ; décisions illisibles : aucune étoile', async () => {
    const t = await account();
    const start = await call('/poker/start', { camp: 'cave', setup: { level: 'fouine', lives: 5, noStraights: true, bots: ['gege'], start: 0 } }, t);
    expect(start.camp).toBe(true);
    expect(start.setup.bots).toEqual(['cpm-marius']);
    expect(start.setup.lives).toBe(3);
    const end = await call('/poker/end', { gameToken: start.gameToken, moves: 'Z', won: true, place: 1 }, t);
    expect(end.verified).toBe(false);
    expect(end.cpm).toBeUndefined();
    expect(end.applied.profile.cpm).toBeUndefined();
    // Décisions d'une autre partie (graine différente) : refusées ou perdantes, jamais d'étoile sans victoire rejouée.
    const s2 = await call('/poker/start', { camp: 'cave', setup: cpmSetup(cpmStage('cave')!, 0) }, t);
    const other = playCamp(s2.setup, (s2.seed + 1) >>> 0, 5);
    const e2 = await call('/poker/end', { gameToken: s2.gameToken, moves: other.moves }, t);
    const rep = replayPm(s2.setup, s2.seed, other.moves);
    if (!rep.ok) { expect(e2.verified).toBe(false); expect(e2.cpm).toBeUndefined(); }
    else expect(!!(e2.cpm?.after & 1)).toBe(rep.facts.won);
  });
  it('jeton à usage unique : pas de double récompense', async () => {
    const t = await account();
    const { start, g } = await real(t, 'cave');
    const twice = await call('/poker/end', { gameToken: start.gameToken, moves: g.moves }, t);
    expect(twice.status).toBe(400);
  });
  it('reprise d’un invité : premier endroit seulement, titre donné à la partie suivante', async () => {
    const t = await account({ ...newProfile(), cpm: { cave: 7, reserve: 1, cuisine: 1, loge: 7 } });
    const me = await call('/me', undefined, t);
    const prof = me.profile ?? me.user?.profile;
    if (prof) expect(prof.cpm).toEqual({ cave: 7, reserve: 1, cuisine: 1 });
    const { end } = await real(t, 'loge', () => true);
    expect(end.applied.profile.titles).toContain('cpm:arriere');
    expect(end.applied.profile.cpm.loge ?? 0).toBe(end.cpm.after);
  });
});

describe('chaque table se joue jusqu’au bout', () => {
  it('ordinateurs contre ordinateurs, aucune partie bloquée, durée raisonnable', () => {
    for (const st of CPM_STAGES) {
      let turns = 0;
      for (let g = 0; g < 15; g++) {
        const r = playCamp(cpmSetup(st, g % (st.opponents.length + 1)), 4242 + g * 31, g);
        expect(r.state.phase).toBe('fini');
        turns += r.state.turns;
      }
      expect(turns / 15, st.id).toBeLessThan(250);
    }
  });
});

describe('traductions', () => {
  const keys = Object.keys(cpmFr);
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  it.each(['en', 'de', 'nl'] as Lang[])('%s : toutes les clés cpm., mêmes variables', (lang) => {
    for (const k of keys) {
      const v = (DICTS[lang] as Record<string, string>)[k];
      expect(v, `${lang} ${k}`).toBeTruthy();
      expect(vars(v), `${lang} ${k}`).toBe(vars((cpmFr as Record<string, string>)[k]));
    }
  });
  it('clés fabriquées par l’écran : tables, endroits, personnages, styles, étoiles', () => {
    const need: string[] = [];
    for (const st of CPM_STAGES) need.push(`cpm.s.${st.id}`, `cpm.s.${st.id}.d`);
    for (const c of CPM_CHAPTERS) need.push(`cpm.ch.${c.id}`, `cpm.ch.${c.id}.d`);
    for (const c of CPM_CHARS) for (const x of ['', '.menteur', '.gagne', '.perd']) need.push(`cpm.c.${c.id.slice(4)}${x}`);
    for (const s of PM_STYLES) need.push(`cpm.style.${s}`);
    for (const k of ['lives', 'calls', 'bluffs', 'ko']) need.push(`cpm.star.${k}1`, `cpm.star.${k}N`);
    for (const k of need) expect(keys, k).toContain(k);
  });
  it('titres traduits pour les autres langues', () => {
    for (const fr of Object.values(CPM_TITLES_FR)) for (const l of ['en', 'de', 'nl'] as Lang[]) expect(translateServerText(l, fr)).not.toBe(fr);
  });
});
