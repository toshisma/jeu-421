/**
 * Coups Fourrés, campagne « Les Comptoirs rivaux » : données (decks imposés valides), déblocages, étoiles
 * calculées par le serveur sur la partie REJOUÉE (refus si la table ou les actions ne sont pas celles de
 * l'étape), pas de double récompense, reprise invité plafonnée, comptoirs jouables jusqu'au bout, traductions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { mulberry32 } from '../shared/rng';
import { cfDecide } from '../shared/cards/ai';
import { advanceBots, playMine, replayBotMatch, startBotMatch, type BotMatchSetup } from '../shared/cards/botmatch';
import { legalActions, viewFor, type CfAction, type CfEvent } from '../shared/cards/engine';
import { CARD_BY_ID, CAPSULES, DECK_RULES, STARTER_DECKS, deckProblems } from '../shared/cards/catalog';
import {
  CAMPAIGN, CCF_CHAPTERS, CCF_MAX_STARS, CCF_RIVALS, CCF_STAGES, CCF_STAR_COINS, CCF_TITLES_FR, applyCcf, campaignSummary, capCcfImport, ccfBots, ccfDeckList,
  ccfFacts, ccfReputation, ccfStage, ccfStarsOf, ccfTableMatches, chapterUnlocked, cleanCcf, deckFamilies, stageUnlocked, stagesOf, type CcfFacts, type CcfProgress,
} from '../shared/campaigns/cf';
import { capGuestImport, newProfile, sanitizeProfile, titleLabel } from '../shared/progress/profile';
import { DICTS, type Lang } from '../shared/i18n';
import { ccfFr } from '../shared/i18n/zones/campcf.fr';
import { translateServerText } from '../shared/i18n/server-texts';

const ids = (c: string) => stagesOf(c).map((s) => s.id);
const all = (c: string, mask = 1): CcfProgress => Object.fromEntries(ids(c).map((id) => [id, mask]));
const facts = (o: Partial<CcfFacts> = {}): CcfFacts => ({ won: true, rounds: 5, trapsOnMe: 0, myTraps: 0, mono: false, minOppTokens: 20, lost: 1, maxCards: 2, ...o });

describe('données', () => {
  it('12 comptoirs, 4 quartiers de 3, 36 étoiles, interface commune', () => {
    expect(CCF_STAGES).toHaveLength(12);
    for (const c of CCF_CHAPTERS) expect(stagesOf(c.id)).toHaveLength(3);
    expect(CCF_MAX_STARS).toBe(36);
    expect(CAMPAIGN).toMatchObject({ id: 'cf', game: 'cf', nameKey: 'ccf.title', maxStars: 36 });
    expect(new Set(CCF_STAGES.map((s) => s.id)).size).toBe(12);
  });
  it('chaque deck imposé respecte la règle de construction (20 cartes, 2 familles au plus, une légendaire)', () => {
    expect(DECK_RULES.maxFamilies).toBe(2);
    for (const r of CCF_RIVALS) {
      expect(deckProblems(r.deck), r.id).toEqual([]);
      expect(ccfDeckList(r.deck)).toHaveLength(20);
      expect(deckFamilies(r.deck).length).toBeLessThanOrEqual(2);
      expect(Object.keys(r.deck).filter((id) => CARD_BY_ID[id].rarity === 'legendaire').length).toBeLessThanOrEqual(1);
    }
  });
  it('tables : 1 à 3 adversaires connus et différents ; jetons du moteur inchangés (11 en duel, 9 à 3-4)', () => {
    for (const s of CCF_STAGES) {
      expect(s.rivals.length).toBeGreaterThanOrEqual(1);
      expect(s.rivals.length).toBeLessThanOrEqual(3);
      expect(new Set(s.rivals).size).toBe(s.rivals.length);
      for (const r of s.rivals) expect(CCF_RIVALS.some((x) => x.id === r), r).toBe(true);
      const { match } = startBotMatch({ seed: 5, me: { id: 'j', name: 'J', deck: ccfDeckList(STARTER_DECKS[0].cards) }, bots: ccfBots(s) });
      expect(match.state.players.every((p) => p.tokens === (s.rivals.length === 1 ? 11 : 9))).toBe(true);
      // « lead » n'a de sens qu'à plusieurs (en duel, l'adversaire a toujours tous les jetons à la fin).
      if (s.rivals.length === 1) expect(s.stars.some((x) => x.k === 'lead')).toBe(false);
    }
  });
  it('titres de quartier nommés et traduits', () => {
    for (const c of CCF_CHAPTERS) {
      expect(titleLabel(c.title)).toBe(CCF_TITLES_FR[c.id]);
      for (const l of ['en', 'de', 'nl'] as const) expect(translateServerText(l, CCF_TITLES_FR[c.id])).not.toBe(CCF_TITLES_FR[c.id]);
      expect(c.capsules).toBeLessThanOrEqual(40); // petit bonus dans la monnaie du mode
    }
    expect(translateServerText('de', 'Ce comptoir n’est pas encore ouvert.')).toBe('Diese Kneipe ist noch nicht offen.');
  });
});

describe('déblocages', () => {
  it('premier quartier : un comptoir après l’autre', () => {
    const [a, b, c] = ids('lilas');
    expect(stageUnlocked({}, a)).toBe(true);
    expect(stageUnlocked({}, b)).toBe(false);
    expect(stageUnlocked({ [a]: 1 }, b)).toBe(true);
    expect(stageUnlocked({ [a]: 1 }, c)).toBe(false);
    expect(chapterUnlocked({}, 'halles')).toBe(false);
    expect(stageUnlocked({}, 'inconnu')).toBe(false);
  });
  it('quartier suivant : quartier précédent terminé ET réputation suffisante', () => {
    expect(chapterUnlocked(all('lilas'), 'halles')).toBe(true); // 3 étoiles
    const six = { ...all('lilas'), ...all('halles') };
    expect(ccfReputation(six)).toBe(6);
    expect(chapterUnlocked(six, 'docks')).toBe(false); // il en faut 8
    expect(chapterUnlocked({ ...all('lilas', 7), ...all('halles') }, 'docks')).toBe(true);
    expect(chapterUnlocked({ ...all('lilas', 7), [ids('halles')[0]]: 7 }, 'docks')).toBe(false); // quartier pas fini
  });
  it('résumé pour l’accueil', () => {
    const p = { ...newProfile(), ccf: { [ids('lilas')[0]]: 3 } };
    expect(campaignSummary(p)).toEqual({ stars: 2, maxStars: 36, next: { id: ids('lilas')[1], nameKey: `ccf.s.${ids('lilas')[1]}` }, done: false });
    expect(campaignSummary({ ...newProfile(), ccf: Object.fromEntries(CCF_STAGES.map((s) => [s.id, 7])) })).toMatchObject({ stars: 36, next: null, done: true });
  });
  it('profil nettoyé ; reprise d’invité : premier quartier seulement, sans titre', () => {
    expect(cleanCcf({ [ids('lilas')[0]]: 7, [ids('lilas')[1]]: 6, x: 1, [ids('halles')[0]]: 9 })).toEqual({ [ids('lilas')[0]]: 7 });
    const lilasSaufDerniere = Object.fromEntries(ids('lilas').slice(0, -1).map((id) => [id, 7]));
    expect(capCcfImport({ ...all('lilas', 7), ...all('halles', 7) })).toEqual(lilasSaufDerniere);
    const guest = sanitizeProfile({ ...newProfile(), ccf: { ...all('lilas', 7), ...all('halles', 7) }, titles: ['ccf:lilas', 'ccf:halles'] });
    expect(guest.ccf).toEqual({ ...all('lilas', 7), ...all('halles', 7) });
    const kept = capGuestImport(guest);
    expect(kept.ccf).toEqual(lilasSaufDerniere);
    expect(kept.titles ?? []).toEqual([]);
  });
});

describe('étoiles et récompenses', () => {
  const s0 = CCF_STAGES[0];
  it('faits tirés des événements rejoués', () => {
    const setup: BotMatchSetup = { seed: 1, me: { id: 'j', name: 'J', deck: ccfDeckList(CCF_RIVALS.find((r) => r.id === 'jojo')!.deck) }, bots: ccfBots(s0) };
    const ev = (e: Partial<CfEvent>): CfEvent => ({ kind: 'x', text: '', ...e });
    const events = [
      ev({ kind: 'manche' }), ev({ kind: 'carte', player: 'j' }), ev({ kind: 'pose', player: 'j' }), ev({ kind: 'carte', player: 'ordi' }),
      ev({ kind: 'piege-revele', player: 'ordi', target: 'j' }), ev({ kind: 'piege-revele', player: 'j', target: 'ordi' }), ev({ kind: 'comptes', player: 'ordi', target: 'j' }),
      ev({ kind: 'manche' }), ev({ kind: 'carte', player: 'j' }), ev({ kind: 'comptes', player: 'j', target: 'ordi' }),
    ];
    const state = { phase: 'over', winner: 'j', round: 2, players: [{ id: 'j', tokens: 0 }, { id: 'ordi', tokens: 22 }] } as never;
    expect(ccfFacts(setup, state, events)).toEqual({ won: true, rounds: 2, trapsOnMe: 1, myTraps: 1, mono: true, minOppTokens: 22, lost: 1, maxCards: 2 });
  });
  it('rien sans victoire ; étoiles 2 et 3 selon les défis', () => {
    expect(ccfStarsOf(s0, facts({ won: false }))).toBe(0);
    const st = ccfStage('cave-jojo')!; // rounds ≤ 7, sans piège subi
    expect(ccfStarsOf(st, facts({ rounds: 9, trapsOnMe: 1 }))).toBe(1);
    expect(ccfStarsOf(st, facts({ rounds: 7, trapsOnMe: 1 }))).toBe(3);
    expect(ccfStarsOf(st, facts({ rounds: 8, trapsOnMe: 0 }))).toBe(5);
    expect(ccfStarsOf(st, facts({ rounds: 3, trapsOnMe: 0 }))).toBe(7);
  });
  it('nouvelles étoiles seulement, 5 pièces chacune ; titre et capsules du quartier une seule fois', () => {
    let p = newProfile();
    const c0 = p.coins;
    const a = applyCcf(p, ids('lilas')[0], facts({ rounds: 9, lost: 5, maxCards: 1 }));
    expect(a.result.newStars).toEqual([1]);
    expect(a.profile.coins).toBe(c0 + CCF_STAR_COINS);
    const again = applyCcf(a.profile, ids('lilas')[0], facts({ rounds: 9, lost: 5, maxCards: 1 }));
    expect(again.result.newStars).toEqual([]);
    expect(again.profile.coins).toBe(a.profile.coins);
    p = { ...again.profile, ccf: { ...again.profile.ccf, [ids('lilas')[1]]: 1 } };
    const end = applyCcf(p, ids('lilas')[2], facts());
    expect(end.result).toMatchObject({ chapter: 'lilas', title: 'ccf:lilas', capsules: CCF_CHAPTERS[0].capsules });
    expect(end.profile.titles).toContain('ccf:lilas');
    const twice = applyCcf(end.profile, ids('lilas')[2], facts());
    expect(twice.result.chapter).toBeUndefined();
  });
});

describe('serveur : table imposée, rejeu, étoiles', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let n = 0;
  const api = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`http://localhost:${srv.port}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { code: r.status, ...(await r.json()) };
  };
  beforeAll(async () => { srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000 }, cf: { minBotMs: 0 } }); });
  afterAll(async () => { await srv.close(); });
  const reg = async () => {
    const r = await api('/register', { username: `Comptoir${++n}`, password: 'motdepasse1' });
    await api('/cf/discover', {}, r.token);
    return { token: r.token as string, id: r.user.id as string };
  };
  const profileOf = (id: string) => srv.store.profileOf(srv.store.userById(id)!);
  const capsulesOf = async (token: string) => (await api('/cf/me', undefined, token)).state.capsules as number;
  function playLocal(setup: BotMatchSetup, seed: number) {
    const { match } = startBotMatch(setup);
    const rng = mulberry32(seed);
    for (let i = 0; i < 5000 && match.state.phase !== 'over'; i++) {
      expect(playMine(match, cfDecide(viewFor(match.state, setup.me.id), legalActions(match.state, setup.me.id), 'fine-fouine', rng)).ok).toBe(true);
      advanceBots(match);
    }
    expect(match.state.phase).toBe('over');
    return match;
  }
  /** Joue le comptoir jusqu'à une victoire (les défaites sont rendues au serveur, sans étoile). */
  async function winStage(token: string, stage: string) {
    for (let k = 0; k < 40; k++) {
      const s = await api('/cf/bot/start', { level: 'debutant', campaign: stage }, token);
      expect(s.ok).toBe(true);
      const m = playLocal({ seed: s.seed, me: s.me, bots: s.bots }, k + 1);
      const end = await api('/cf/bot/end', { gameId: s.gameId, actions: m.mine }, token);
      expect(end.ok).toBe(true);
      if (!end.won) { expect(end.campaign.newStars).toEqual([]); continue; }
      return { s, m, end };
    }
    throw new Error('jamais gagné');
  }

  it('comptoir fermé ou inconnu : refusé ; table imposée par le serveur (niveau demandé ignoré)', async () => {
    const a = await reg();
    expect((await api('/cf/bot/start', { level: 'debutant', campaign: ids('lilas')[1] }, a.token)).code).toBe(403);
    expect((await api('/cf/bot/start', { level: 'debutant', campaign: 'nulle-part' }, a.token)).code).toBe(400);
    expect((await api('/cf/bot/start', { level: 'debutant', campaign: ids('halles')[0] }, a.token)).code).toBe(403);
    // Pas de deck d'entraînement dans la campagne.
    expect((await api('/cf/bot/start', { level: 'debutant', campaign: ids('lilas')[0], deckId: 'parcours:1' }, a.token)).code).toBe(400);
    const s = await api('/cf/bot/start', { level: 'debutant', opponents: 3, campaign: ids('lilas')[0] }, a.token);
    expect(s.ok).toBe(true);
    expect(ccfTableMatches(CCF_STAGES[0], s.bots)).toBe(true);
    expect(s.me.deck).toHaveLength(20);
    // La table d'un autre comptoir n'est pas celle-ci.
    expect(ccfTableMatches(CCF_STAGES[1], s.bots)).toBe(false);
  });

  it('étoiles après rejeu, une seule fois ; actions trafiquées ou table changée : aucune étoile', async () => {
    const a = await reg();
    const stage = ids('lilas')[0];
    const coins0 = profileOf(a.id).coins;
    const { s, m, end } = await winStage(a.token, stage);
    // Le serveur a rejoué : mêmes faits que le rejeu local.
    const evs: CfEvent[] = [];
    const rep = replayBotMatch({ seed: s.seed, me: s.me, bots: s.bots }, m.mine, (e) => evs.push(...e));
    expect(rep.ok).toBe(true);
    const mask = ccfStarsOf(ccfStage(stage)!, ccfFacts({ seed: s.seed, me: s.me, bots: s.bots }, m.state, evs));
    expect(end.campaign.after).toBe(mask);
    expect(end.campaign.newStars.length).toBe((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1));
    expect(end.profile.ccf[stage]).toBe(mask);
    expect(profileOf(a.id).ccf?.[stage]).toBe(mask);
    // Pièces : 5 par nouvelle étoile, en plus de la récompense de partie (barème commun).
    expect(profileOf(a.id).coins).toBeGreaterThanOrEqual(coins0 + end.campaign.coins);
    expect(end.campaign.coins).toBe(end.campaign.newStars.length * CCF_STAR_COINS);
    expect(end.reward.capsules).toBe(CAPSULES.vsBot); // compte comme une partie contre l'ordinateur
    // Deuxième « end » : refusé.
    expect((await api('/cf/bot/end', { gameId: s.gameId, actions: m.mine }, a.token)).code).toBe(404);
    // Rejouer et regagner : pas de double récompense pour les mêmes étoiles.
    const again = await winStage(a.token, stage);
    expect(again.end.campaign.newStars.every((x: number) => !(mask & (1 << (x - 1))))).toBe(true);
    // Actions d'une autre partie (autre graine) : le serveur ne retrouve pas la partie → refus, rien de changé.
    const before = profileOf(a.id).ccf;
    const s3 = await api('/cf/bot/start', { level: 'debutant', campaign: stage }, a.token);
    const bad = await api('/cf/bot/end', { gameId: s3.gameId, actions: m.mine }, a.token);
    expect(bad.code).toBe(400);
    // Partie jouée contre une table trafiquée (decks changés côté client) : le serveur rejoue SA table → refus ou faits différents.
    const s4 = await api('/cf/bot/start', { level: 'debutant', campaign: stage }, a.token);
    const fake: BotMatchSetup = { seed: s4.seed, me: s4.me, bots: s4.bots.map((b: BotMatchSetup['bots'][number]) => ({ ...b, deck: Array(20).fill('leurre'), level: 'debutant' })) };
    const mf = playLocal(fake, 99);
    const r4 = await api('/cf/bot/end', { gameId: s4.gameId, actions: mf.mine as CfAction[] }, a.token);
    if (r4.ok) expect(r4.campaign.after).toBe(profileOf(a.id).ccf?.[stage]); // au mieux, la partie rejouée sur la vraie table
    else expect(r4.code).toBe(400);
    expect(profileOf(a.id).ccf?.[stage] ?? 0).toBeGreaterThanOrEqual(before?.[stage] ?? 0);
  }, 120_000);

  it('fin de quartier : titre et capsules une seule fois', async () => {
    const a = await reg();
    const [x, y, z] = ids('lilas');
    srv.store.saveProfile(a.id, { ...profileOf(a.id), ccf: { [x]: 1, [y]: 1 } });
    const caps = await capsulesOf(a.token);
    const { end } = await winStage(a.token, z);
    expect(end.campaign).toMatchObject({ chapter: 'lilas', title: 'ccf:lilas', capsules: CCF_CHAPTERS[0].capsules });
    expect(profileOf(a.id).titles).toContain('ccf:lilas');
    // Capsules : le bonus du quartier, en plus de celles des parties (plafond du jour, missions).
    const caps2 = await capsulesOf(a.token);
    expect(caps2 - caps).toBeGreaterThanOrEqual(CCF_CHAPTERS[0].capsules);
    const again = await winStage(a.token, z);
    expect(again.end.campaign.chapter).toBeUndefined();
    expect(again.end.campaign.capsules).toBeUndefined(); // pas une deuxième fois
    // Quartier 2 ouvert.
    expect((await api('/cf/bot/start', { level: 'debutant', campaign: ids('halles')[0] }, a.token)).ok).toBe(true);
  }, 120_000);
});

describe('chaque comptoir se joue jusqu’au bout', () => {
  it('parties entre ordinateurs, durée de calcul raisonnable', () => {
    for (const s of CCF_STAGES) {
      for (let g = 0; g < 3; g++) {
        const deck = ccfDeckList(STARTER_DECKS[g % 2].cards);
        const setup: BotMatchSetup = { seed: 100 + g, me: { id: 'joueur', name: 'J', deck }, bots: ccfBots(s) };
        const { match } = startBotMatch(setup);
        const rng = mulberry32(g + 7);
        const t = Date.now();
        for (let i = 0; i < 5000 && match.state.phase !== 'over'; i++) {
          playMine(match, cfDecide(viewFor(match.state, 'joueur'), legalActions(match.state, 'joueur'), 'habitue', rng));
          advanceBots(match);
        }
        expect(match.state.phase, s.id).toBe('over');
        expect(match.state.round).toBeLessThanOrEqual(20);
        expect(Date.now() - t).toBeLessThan(5000);
      }
    }
  }, 120_000);
});

describe('traductions', () => {
  it('toutes les clés `ccf.` en en/de/nl, et les noms de chaque comptoir, quartier et patron', () => {
    const keys = Object.keys(ccfFr);
    for (const s of CCF_STAGES) { expect(keys).toContain(`ccf.s.${s.id}`); expect(keys).toContain(`ccf.s.${s.id}.d`); }
    for (const c of CCF_CHAPTERS) { expect(keys).toContain(`ccf.c.${c.id}`); expect(keys).toContain(`ccf.c.${c.id}.d`); }
    for (const r of CCF_RIVALS) expect(keys).toContain(`ccf.r.${r.id}`);
    for (const l of ['en', 'de', 'nl'] as Lang[]) {
      const d = DICTS[l] as Record<string, string>;
      for (const k of keys) {
        expect(d[k], `${l} ${k}`).toBeTruthy();
        // Mêmes variables que le français.
        const vars = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort().join();
        expect(vars(d[k]), `${l} ${k}`).toBe(vars((ccfFr as Record<string, string>)[k]));
      }
    }
  });
});
