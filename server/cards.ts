/**
 * « Coups Fourrés » (mode cartes) : données des joueurs, côté serveur (comptes seulement ;
 * les invités jouent contre l'ordinateur avec les decks de départ, sans rien gagner).
 *
 * Le serveur fait foi : capsules, éclats, boosters, collection, decks, ligue et missions sont
 * calculés ici. Les boosters sont tirés ici avec un générateur cryptographique, au pur hasard
 * (aucune garantie de rareté, voir cfRollBooster).
 *
 * Routes (préfixe /api) : GET /cf/me, POST /cf/discover, POST /cf/booster/buy, POST /cf/booster/open,
 * POST /cf/craft, POST /cf/recycle, POST /cf/recycle-extras, POST /cf/legend-pick,
 * POST /cf/decks, POST /cf/decks/:id, DELETE /cf/decks/:id, POST /cf/decks/:id/active, GET /cf/league.
 *
 * À brancher plus tard sur les vraies parties : recordCfGame, progressCfMission, rollCfSeason.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response, Router } from 'express';
import type { CfDeckRow, CfPlayerRow, Store, UserRow } from './db';
import { brusselsDay } from './stats';
import { BOOSTER, CAPSULES, CARDS, SHARDS, STARTER_DECKS, cardDef, deckProblems } from '../shared/cards/catalog';
import {
  CF_DECK_NAME_MAX, CF_DIVISIONS, CF_LEGEND_COUNT, CF_LEGEND_NAME, CF_MAX_DECKS, cfApplyDelta, cfDailyMissions, cfDecksBroken,
  cfDivisionOf, cfFloor, cfLeagueDelta, cfMaxUseful, cfNextSeasonPoints, cfRollBooster, cfSeasonEnd, cfSeasonOf,
  type CfDeck, type CfGameView, type CfLeagueBoard, type CfLeagueMe, type CfMissionKind, type CfMissionView, type CfOpenedCard,
  type CfOwnedCard, type CfState,
} from '../shared/cards/progress';

/** Générateur cryptographique dans [0, 1[ (48 bits). */
export const cryptoRng = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

/** Plafond de capsules gagnées par jour contre l'ordinateur (3 par partie, 10 parties). */
export const CF_BOT_DAILY_CAPSULES = CAPSULES.vsBot * CAPSULES.vsBotDailyMax;
/** Réserve de boosters non ouverts (garde-fou). */
export const CF_BOOSTERS_MAX = 99;

const parseList = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const parseCards = (s: string): Record<string, number> => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

// --- Lectures et écritures de base (utilisées aussi par l'administration) ------------------------
export function cfCollection(store: Store, userId: string): Record<string, CfOwnedCard> {
  return Object.fromEntries(store.cfCards(userId).map((r) => [r.card_id, { count: r.count, shiny: r.shiny }]));
}
export const cfCounts = (col: Record<string, CfOwnedCard>) => Object.fromEntries(Object.entries(col).map(([id, c]) => [id, c.count]));

/** Ajoute (ou retire, n < 0) des exemplaires ; les brillants partent en dernier. */
export function cfAddCard(store: Store, userId: string, cardId: string, n: number, shiny = 0) {
  const cur = cfCollection(store, userId)[cardId] ?? { count: 0, shiny: 0 };
  const count = Math.max(0, cur.count + n);
  const normal = cur.count - cur.shiny;
  const shinyAfter = n >= 0 ? cur.shiny + shiny : Math.max(0, cur.shiny - Math.max(0, -n - normal));
  store.cfCardSet(userId, cardId, count, Math.min(count, shinyAfter));
}

function deckView(d: CfDeckRow, owned: Record<string, number>): CfDeck {
  const cards = parseCards(d.cards);
  const problems = deckProblems(cards, owned);
  return { id: d.id, name: d.name, cards, valid: problems.length === 0, problems, createdAt: d.created_at, updatedAt: d.updated_at };
}

/** Résumé d'un joueur pour la fiche d'administration. */
export function cfAdminView(store: Store, userId: string) {
  const p = store.cfPlayerFind(userId);
  const col = cfCollection(store, userId);
  const owned = cfCounts(col);
  return {
    discovered: !!p?.discovered, capsules: p?.capsules ?? 0, shards: p?.shards ?? 0, boosters: p?.boosters ?? 0, legendPicks: p?.legend_picks ?? 0,
    cards: Object.entries(col).map(([id, c]) => ({ id, name: cardDef(id)?.name ?? id, rarity: cardDef(id)?.rarity ?? null, count: c.count, shiny: c.shiny }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    total: Object.values(owned).reduce((a, b) => a + b, 0),
    decks: store.cfDecks(userId).map((d) => deckView(d, owned)).map((d) => ({ id: d.id, name: d.name, valid: d.valid })),
    history: store.cfGames(userId, 10).map((g) => ({ opponent: g.opponent_name, ranked: !!g.ranked, vsBot: !!g.vs_bot, result: g.result, points: g.points, capsules: g.capsules, at: g.at })),
  };
}

/**
 * Commande d'administration : capsules, éclats, boosters (delta) ou cartes (cardId + delta).
 * Renvoie un message d'erreur (texte) ou la description de ce qui a été fait.
 */
export function cfAdminAdjust(store: Store, userId: string, what: string, delta: number, cardId?: string, shiny = false): { error: string } | { details: string } {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) return { error: 'Montant invalide (entier non nul).' };
  return store.cfTx(() => {
    const p = store.cfPlayer(userId);
    const col = (k: 'capsules' | 'shards' | 'boosters', label: string, max = Infinity) => {
      const n = p[k] + delta;
      if (n < 0) return { error: `Le joueur n’a que ${p[k]} ${label}.` };
      if (n > max) return { error: `Au plus ${max} ${label}.` };
      store.cfPlayerSet(userId, { [k]: n });
      return { details: `${delta > 0 ? 'don' : 'retrait'} de ${Math.abs(delta)} ${label} (${p[k]} → ${n})` };
    };
    if (what === 'capsules') return col('capsules', 'capsules');
    if (what === 'shards') return col('shards', 'éclats de verre');
    if (what === 'boosters') return col('boosters', 'boosters', CF_BOOSTERS_MAX);
    if (what !== 'card') return { error: 'Type inconnu (capsules, shards, boosters ou card).' };
    const d = cardId ? cardDef(cardId) : undefined;
    if (!d) return { error: 'Carte inconnue du catalogue.' };
    if (Math.abs(delta) > 50) return { error: 'Au plus 50 exemplaires à la fois.' };
    const before = cfCollection(store, userId)[d.id] ?? { count: 0, shiny: 0 };
    if (delta < 0) {
      if (before.count + delta < 0) return { error: `Le joueur n’a que ${before.count} exemplaire(s) de ${d.name}.` };
      const after = { ...cfCounts(cfCollection(store, userId)), [d.id]: before.count + delta };
      const broken = cfDecksBroken(store.cfDecks(userId).map((x) => ({ name: x.name, cards: parseCards(x.cards) })), after);
      if (broken.length) return { error: `Retrait impossible : la carte est utilisée dans ${broken.map((n) => `« ${n} »`).join(', ')}.` };
    }
    cfAddCard(store, userId, d.id, delta, delta > 0 && shiny ? delta : 0);
    return { details: `${delta > 0 ? 'don' : 'retrait'} de ${Math.abs(delta)} « ${d.name} »${delta > 0 && shiny ? ' brillante(s)' : ''} (${before.count} → ${before.count + delta})` };
  });
}

// --- Module ---------------------------------------------------------------------------------------
export interface CardsCtx {
  store: Store;
  now: () => number;
  /** Routes : branchées si fournies (sinon, seulement les fonctions — tests). */
  router?: Router;
  auth?: (req: Request, res: Response, next: NextFunction) => void;
  userOf?: (req: Request) => UserRow;
  fail?: (res: Response, status: number, error: string) => void;
  /** Notification push facultative (fin de saison). */
  push?: (userId: string, title: string, body: string, url?: string) => void;
  /** Source de hasard des boosters (tests) ; par défaut cryptographique. */
  rng?: () => number;
}

export interface CfGameInput {
  /** Compte gagnant ; null : l'ordinateur ou un invité. */
  winnerId: string | null;
  /** Compte perdant ; null : l'ordinateur ou un invité. */
  loserId: string | null;
  ranked: boolean;
  vsBot: boolean;
  /** Le perdant a abandonné (ou n'est pas revenu à temps) : il ne gagne rien. */
  abandoned?: boolean;
}
export interface CfGameReward { userId: string; won: boolean; capsules: number; booster: boolean; points: number; leaguePoints: number | null; missions: string[] }

export function createCards(c: CardsCtx) {
  const { store } = c;
  const rng = c.rng ?? cryptoRng;
  const day = () => brusselsDay(c.now());
  const season = () => cfSeasonOf(day());

  // --- Ligue ---
  function leagueRow(userId: string) {
    return store.cfLeagueRow(season(), userId) ?? { season: season(), user_id: userId, points: 0, best: 0, games: 0, wins: 0, updated_at: c.now() };
  }
  function leagueMe(userId: string): CfLeagueMe {
    const s = season();
    const r = store.cfLeagueRow(s, userId);
    const points = r?.points ?? 0, best = r?.best ?? 0;
    return {
      season: s, endsOn: cfSeasonEnd(s), points, best, floor: cfFloor(best), division: cfDivisionOf(points).id,
      games: r?.games ?? 0, wins: r?.wins ?? 0, rank: r && r.games > 0 ? store.cfLeagueRank(s, r) : null,
    };
  }

  /**
   * Fin de saison (une seule fois par mois, heure de Bruxelles) : récompenses selon la division
   * (boosters, dos de carte, titre ; 20 premiers du Grand Café : « Légende du zinc », une légendaire
   * au choix), annoncées dans les notifications du jeu ; puis chacun repart deux divisions plus bas.
   * Renvoie les comptes récompensés.
   */
  function rollCfSeason(): string[] {
    const cur = season();
    const last = store.getMeta('cf_season_rolled');
    if (last === cur) return [];
    const done: string[] = [];
    const first = last ?? store.cfLeagueSeasonsBefore(cur)[0];
    store.cfTx(() => {
      for (let s = first; s && s < cur; s = cfSeasonOf(cfSeasonEnd(s))) {
        const next = cfSeasonOf(cfSeasonEnd(s));
        const rows = store.cfLeagueTop(s, 1_000_000);
        const legends = new Set(rows.filter((r) => cfDivisionOf(r.points).id === 'grand-cafe').slice(0, CF_LEGEND_COUNT).map((r) => r.user_id));
        for (const r of rows) {
          const div = cfDivisionOf(r.points);
          const legend = legends.has(r.user_id);
          const p = store.cfPlayer(r.user_id, c.now());
          const cosmetics = parseList(p.cosmetics), titles = parseList(p.titles);
          if (div.back) cosmetics.push(div.back === 'anime' ? `dos-anime:${s}` : `dos:${s}`);
          if (div.title) titles.push(`cf:${s}:${div.id}`);
          if (legend) titles.push(`cf:${s}:legende`);
          store.cfPlayerSet(r.user_id, {
            boosters: Math.min(CF_BOOSTERS_MAX, p.boosters + div.boosters), legend_picks: p.legend_picks + (legend ? 1 : 0),
            cosmetics: JSON.stringify([...new Set(cosmetics)]), titles: JSON.stringify([...new Set(titles)]),
          });
          const gifts = [`${div.boosters} booster${div.boosters > 1 ? 's' : ''}`];
          if (div.back) gifts.push(div.back === 'anime' ? 'un dos de carte animé' : 'un dos de carte');
          if (div.title) gifts.push('un titre');
          if (legend) gifts.push('une carte légendaire au choix');
          const text = `Coups Fourrés : la saison est finie. Vous terminez ${legend ? `${CF_LEGEND_NAME} (${div.name})` : `en division ${div.name}`} : ${gifts.join(', ')}.`;
          store.modNotify(r.user_id, 'cf-saison', text, c.now());
          c.push?.(r.user_id, 'Fin de saison Coups Fourrés', text, '/?notifs=1');
          done.push(r.user_id);
        }
        // Nouvelle saison : deux divisions plus bas (pour tous ceux qui ont une ligne, même sans partie).
        for (const r of store.cfLeagueAll(s)) {
          if (store.cfLeagueRow(next, r.user_id)) continue;
          const start = cfNextSeasonPoints(r.points);
          if (start > 0) store.cfLeagueSet({ season: next, user_id: r.user_id, points: start, best: start, games: 0, wins: 0, updated_at: c.now() });
        }
      }
      store.setMeta('cf_season_rolled', cur);
    });
    return done;
  }

  // --- Missions ---
  /** Missions du jour d'un joueur, avec sa progression. */
  function missions(userId: string): CfMissionView[] {
    const d = day();
    const mine = new Map(store.cfMissions(userId, d).map((m) => [m.mission_id, m]));
    return cfDailyMissions(d).map((m) => ({ ...m, progress: mine.get(m.id)?.progress ?? 0, done: !!mine.get(m.id)?.done }));
  }
  /**
   * Fait avancer les missions du jour de ce type ; une mission terminée crédite tout de suite ses
   * capsules. Renvoie les missions terminées par cet appel.
   */
  function progressCfMission(userId: string, kind: CfMissionKind, n = 1): CfMissionView[] {
    if (!(n > 0) || !store.userById(userId)) return [];
    return store.cfTx(() => {
      const d = day();
      const finished: CfMissionView[] = [];
      for (const m of missions(userId)) {
        if (m.kind !== kind || m.done) continue;
        const progress = Math.min(m.target, m.progress + Math.floor(n));
        const done = progress >= m.target;
        store.cfMissionSet(userId, d, m.id, progress, done);
        if (done) {
          const p = store.cfPlayer(userId, c.now());
          store.cfPlayerSet(userId, { capsules: p.capsules + m.capsules });
          finished.push({ ...m, progress, done });
        }
      }
      return finished;
    });
  }

  // --- Parties ---
  /**
   * Fin d'une partie de Coups Fourrés (comptes seulement ; null = ordinateur ou invité) :
   * capsules (victoire classée 15, défaite classée jouée jusqu'au bout 5, contre l'ordinateur 3 dans
   * la limite de 30 par jour, rien en cas d'abandon), 1 booster pour la première victoire du jour,
   * missions, points de ligue (parties classées entre deux comptes) et historique.
   */
  function recordCfGame(g: CfGameInput): CfGameReward[] {
    rollCfSeason();
    const out: CfGameReward[] = [];
    const ranked = g.ranked && !g.vsBot && !!g.winnerId && !!g.loserId && g.winnerId !== g.loserId;
    store.cfTx(() => {
      const t = c.now(), d = day(), s = season();
      // Points de ligue calculés avant toute écriture (sur les totaux d'avant la partie).
      let wDelta = 0, lDelta = 0;
      if (ranked) {
        const w = leagueRow(g.winnerId!), l = leagueRow(g.loserId!);
        wDelta = cfLeagueDelta(w.points, l.points, true);
        lDelta = cfLeagueDelta(l.points, w.points, false);
        const wn = cfApplyDelta(w.points, w.best, wDelta), ln = cfApplyDelta(l.points, l.best, lDelta);
        wDelta = wn.points - w.points; lDelta = ln.points - l.points;
        store.cfLeagueSet({ ...w, season: s, ...wn, games: w.games + 1, wins: w.wins + 1, updated_at: t });
        store.cfLeagueSet({ ...l, season: s, ...ln, games: l.games + 1, updated_at: t });
      }
      for (const [userId, won] of [[g.winnerId, true], [g.loserId, false]] as [string | null, boolean][]) {
        if (!userId || !store.userById(userId)) continue;
        if (!won && userId === g.winnerId) continue;
        const quit = !won && !!g.abandoned;
        const p = store.cfPlayer(userId, t);
        let capsules = 0, booster = false;
        const patch: Partial<CfPlayerRow> = {};
        if (!quit) {
          if (g.vsBot) {
            const used = p.bot_day === d ? p.bot_capsules : 0;
            capsules = Math.max(0, Math.min(CAPSULES.vsBot, CF_BOT_DAILY_CAPSULES - used));
            patch.bot_day = d; patch.bot_capsules = used + capsules;
          } else if (ranked) capsules = won ? CAPSULES.rankedWin : CAPSULES.rankedLoss;
          if (won && p.first_win_day !== d) { booster = true; patch.first_win_day = d; }
        }
        store.cfPlayerSet(userId, { ...patch, capsules: p.capsules + capsules, boosters: Math.min(CF_BOOSTERS_MAX, p.boosters + (booster ? 1 : 0)) });
        const other = won ? g.loserId : g.winnerId;
        const points = ranked ? (won ? wDelta : lDelta) : 0;
        store.cfGameAdd({
          user_id: userId, opponent_id: other, opponent_name: g.vsBot ? 'Ordinateur' : other ? store.userById(other)?.username ?? null : 'Invité',
          ranked: ranked ? 1 : 0, vs_bot: g.vsBot ? 1 : 0, result: quit ? 'abandon' : won ? 'victoire' : 'defaite', points, capsules, at: t,
        });
        const missionsDone: string[] = [];
        if (!quit) {
          const add = (k: CfMissionKind) => missionsDone.push(...progressCfMission(userId, k, 1).map((m) => m.id));
          add('partie');
          if (won) add('victoire');
          if (ranked) { add('classee'); if (won) add('victoire-classee'); }
        }
        out.push({ userId, won, capsules, booster, points, leaguePoints: ranked ? leagueRow(userId).points : null, missions: missionsDone });
      }
    });
    return out;
  }

  // --- État complet ---
  function state(userId: string): CfState {
    rollCfSeason();
    const p = store.cfPlayer(userId, c.now());
    const col = cfCollection(store, userId);
    const owned = cfCounts(col);
    const d = day();
    return {
      discovered: !!p.discovered, capsules: p.capsules, shards: p.shards, boosters: p.boosters, legendPicks: p.legend_picks,
      collection: col, decks: store.cfDecks(userId).map((x) => deckView(x, owned)), activeDeck: p.active_deck,
      cosmetics: parseList(p.cosmetics), titles: parseList(p.titles), missions: missions(userId),
      botCapsulesToday: p.bot_day === d ? p.bot_capsules : 0, firstWinToday: p.first_win_day === d,
      league: leagueMe(userId), history: store.cfGames(userId, 20).map(gameView),
    };
  }
  const gameView = (g: { opponent_name: string | null; vs_bot: number; ranked: number; result: string; points: number; capsules: number; at: number }): CfGameView =>
    ({ opponent: g.opponent_name, vsBot: !!g.vs_bot, ranked: !!g.ranked, result: g.result as CfGameView['result'], points: g.points, capsules: g.capsules, at: g.at });

  // --- Actions (renvoient un message d'erreur, ou le résultat) ---
  type Err = { error: string; status?: number };
  const isErr = (x: unknown): x is Err => !!x && typeof x === 'object' && 'error' in x;
  const needDiscovered = (p: CfPlayerRow): Err | null => (p.discovered ? null : { error: 'Découvrez d’abord le mode Coups Fourrés.', status: 409 });

  function discover(userId: string): Err | { boosters: number } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      if (p.discovered) return { error: 'Vous avez déjà reçu vos decks de départ.', status: 409 };
      const t = c.now();
      let first: string | null = null;
      STARTER_DECKS.forEach((sd, i) => {
        for (const [id, n] of Object.entries(sd.cards)) cfAddCard(store, userId, id, n);
        const id = randomUUID();
        first ??= id;
        store.cfDeckSave({ id, user_id: userId, name: sd.name, cards: JSON.stringify(sd.cards), created_at: t + i, updated_at: t + i });
      });
      store.cfPlayerSet(userId, { discovered: 1, boosters: Math.min(CF_BOOSTERS_MAX, p.boosters + CAPSULES.welcomeBoosters), active_deck: p.active_deck ?? first });
      return { boosters: CAPSULES.welcomeBoosters };
    });
  }
  function buyBooster(userId: string): Err | { capsules: number } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const e = needDiscovered(p); if (e) return e;
      if (p.capsules < BOOSTER.price) return { error: `Il faut ${BOOSTER.price} capsules pour un booster (vous en avez ${p.capsules}).`, status: 400 };
      if (p.boosters >= CF_BOOSTERS_MAX) return { error: `Ouvrez d’abord vos boosters (${CF_BOOSTERS_MAX} au plus en réserve).`, status: 400 };
      store.cfPlayerSet(userId, { capsules: p.capsules - BOOSTER.price, boosters: p.boosters + 1 });
      return { capsules: p.capsules - BOOSTER.price };
    });
  }
  function openBooster(userId: string): Err | { cards: CfOpenedCard[] } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const e = needDiscovered(p); if (e) return e;
      if (p.boosters < 1) return { error: 'Vous n’avez aucun booster à ouvrir.', status: 400 };
      const seen = new Set(Object.keys(cfCollection(store, userId)));
      const cards = cfRollBooster(rng).map((x) => {
        const isNew = !seen.has(x.id);
        seen.add(x.id);
        cfAddCard(store, userId, x.id, 1, x.shiny ? 1 : 0);
        return { ...x, rarity: cardDef(x.id)!.rarity, isNew };
      });
      store.cfPlayerSet(userId, { boosters: p.boosters - 1 });
      return { cards };
    });
  }
  function craft(userId: string, cardId: string): Err | { shards: number } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const e = needDiscovered(p); if (e) return e;
      const d = cardDef(cardId);
      if (!d) return { error: 'Carte inconnue.', status: 404 };
      const have = cfCollection(store, userId)[d.id]?.count ?? 0;
      if (have >= cfMaxUseful(d.id)) return { error: `Vous avez déjà ${have} exemplaire${have > 1 ? 's' : ''} de ${d.name} : c’est le maximum utile en deck.`, status: 400 };
      const cost = SHARDS[d.rarity].craft;
      if (p.shards < cost) return { error: `Il faut ${cost} éclats de verre pour fabriquer ${d.name} (vous en avez ${p.shards}).`, status: 400 };
      cfAddCard(store, userId, d.id, 1);
      store.cfPlayerSet(userId, { shards: p.shards - cost });
      return { shards: p.shards - cost };
    });
  }
  /** Recycle : seulement les exemplaires en trop, sauf `force` (choix confirmé du joueur), jamais au détriment d'un deck. */
  function recycle(userId: string, cardId: string, count: number, force: boolean): Err | { shards: number; gained: number } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const e = needDiscovered(p); if (e) return e;
      const d = cardDef(cardId);
      if (!d) return { error: 'Carte inconnue.', status: 404 };
      if (!Number.isInteger(count) || count < 1 || count > 99) return { error: 'Nombre d’exemplaires invalide.', status: 400 };
      const col = cfCollection(store, userId);
      const have = col[d.id]?.count ?? 0;
      if (count > have) return { error: `Vous n’avez que ${have} exemplaire${have > 1 ? 's' : ''} de ${d.name}.`, status: 400 };
      const extra = Math.max(0, have - cfMaxUseful(d.id));
      if (count > extra && !force) return { error: extra ? `Seulement ${extra} exemplaire${extra > 1 ? 's' : ''} en trop. Confirmez pour recycler davantage.` : `Aucun exemplaire en trop de ${d.name}. Confirmez pour le recycler quand même.`, status: 409 };
      const broken = cfDecksBroken(store.cfDecks(userId).map((x) => ({ name: x.name, cards: parseCards(x.cards) })), { ...cfCounts(col), [d.id]: have - count });
      if (broken.length) return { error: `Impossible : ${d.name} est utilisée dans ${broken.map((n) => `« ${n} »`).join(', ')}. Retirez-la d’abord du deck.`, status: 409 };
      const gained = SHARDS[d.rarity].recycle * count;
      cfAddCard(store, userId, d.id, -count);
      store.cfPlayerSet(userId, { shards: p.shards + gained });
      return { shards: p.shards + gained, gained };
    });
  }
  /** Recycle d'un coup tous les exemplaires au-delà du maximum utile. */
  function recycleExtras(userId: string): Err | { shards: number; gained: number; cards: number } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const e = needDiscovered(p); if (e) return e;
      let gained = 0, cards = 0;
      for (const [id, o] of Object.entries(cfCollection(store, userId))) {
        const extra = o.count - cfMaxUseful(id);
        const d = cardDef(id);
        if (extra <= 0 || !d) continue;
        cfAddCard(store, userId, id, -extra);
        gained += SHARDS[d.rarity].recycle * extra;
        cards += extra;
      }
      store.cfPlayerSet(userId, { shards: p.shards + gained });
      return { shards: p.shards + gained, gained, cards };
    });
  }
  function legendPick(userId: string, cardId: string): Err | { cardId: string } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const d = cardDef(cardId);
      if (p.legend_picks < 1) return { error: 'Aucune carte légendaire à choisir.', status: 400 };
      if (!d || d.rarity !== 'legendaire') return { error: 'Choisissez une carte légendaire.', status: 400 };
      cfAddCard(store, userId, d.id, 1);
      store.cfPlayerSet(userId, { legend_picks: p.legend_picks - 1 });
      return { cardId: d.id };
    });
  }

  // --- Decks ---
  const cleanName = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const n = v.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, CF_DECK_NAME_MAX);
    return n.length ? n : null;
  };
  const cleanCards = (v: unknown): Record<string, number> | null => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>).slice(0, 100)) {
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 99) return null;
      if (n > 0) out[k.slice(0, 40)] = n;
    }
    return out;
  };
  function checkDeck(userId: string, cards: Record<string, number> | null): Err | null {
    if (!cards) return { error: 'Liste de cartes invalide.', status: 400 };
    const problems = deckProblems(cards, cfCounts(cfCollection(store, userId)));
    return problems.length ? { error: problems.join(' '), status: 400 } : null;
  }
  function createDeck(userId: string, rawName: unknown, rawCards: unknown): Err | { id: string } {
    return store.cfTx(() => {
      const p = store.cfPlayer(userId, c.now());
      const e = needDiscovered(p); if (e) return e;
      const name = cleanName(rawName);
      if (!name) return { error: 'Donnez un nom au deck.', status: 400 };
      if (store.cfDecks(userId).length >= CF_MAX_DECKS) return { error: `${CF_MAX_DECKS} decks au plus : supprimez-en un d’abord.`, status: 400 };
      const cards = cleanCards(rawCards);
      const bad = checkDeck(userId, cards); if (bad) return bad;
      const id = randomUUID(), t = c.now();
      store.cfDeckSave({ id, user_id: userId, name, cards: JSON.stringify(cards), created_at: t, updated_at: t });
      if (!p.active_deck) store.cfPlayerSet(userId, { active_deck: id });
      return { id };
    });
  }
  function updateDeck(userId: string, id: string, rawName: unknown, rawCards: unknown): Err | { id: string } {
    return store.cfTx(() => {
      const d = store.cfDecks(userId).find((x) => x.id === id);
      if (!d) return { error: 'Deck introuvable.', status: 404 };
      let name = d.name, cards = d.cards;
      if (rawName !== undefined) { const n = cleanName(rawName); if (!n) return { error: 'Nom de deck invalide.', status: 400 }; name = n; }
      if (rawCards !== undefined) { const cc = cleanCards(rawCards); const bad = checkDeck(userId, cc); if (bad) return bad; cards = JSON.stringify(cc); }
      store.cfDeckSave({ ...d, name, cards, updated_at: c.now() });
      return { id };
    });
  }
  function deleteDeck(userId: string, id: string): Err | { id: string } {
    return store.cfTx(() => {
      if (!store.cfDeckDelete(userId, id)) return { error: 'Deck introuvable.', status: 404 };
      const p = store.cfPlayer(userId, c.now());
      if (p.active_deck === id) store.cfPlayerSet(userId, { active_deck: store.cfDecks(userId)[0]?.id ?? null });
      return { id };
    });
  }
  function setActive(userId: string, id: string): Err | { id: string } {
    const d = store.cfDecks(userId).find((x) => x.id === id);
    if (!d) return { error: 'Deck introuvable.', status: 404 };
    const v = deckView(d, cfCounts(cfCollection(store, userId)));
    if (!v.valid) return { error: `Ce deck n’est pas jouable : ${v.problems.join(' ')}`, status: 400 };
    store.cfPlayerSet(userId, { active_deck: id });
    return { id };
  }
  function league(userId: string): CfLeagueBoard {
    rollCfSeason();
    const s = season();
    return {
      me: leagueMe(userId), divisions: CF_DIVISIONS,
      top: store.cfLeagueTop(s, 50).map((r, i) => ({ rank: i + 1, username: r.username, points: r.points, division: cfDivisionOf(r.points).id, games: r.games, wins: r.wins })),
    };
  }

  // --- Routes ---
  if (c.router && c.auth && c.userOf && c.fail) {
    const { router, auth, userOf, fail } = c;
    const send = (res: Response, userId: string, out: Err | object) => {
      if (isErr(out)) return fail(res, out.status ?? 400, out.error);
      res.json({ ok: true, ...out, state: state(userId) });
    };
    const id = (req: Request) => userOf(req).id;
    router.get('/cf/me', auth, (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, state: state(id(req)) }); });
    router.post('/cf/discover', auth, (req, res) => send(res, id(req), discover(id(req))));
    router.post('/cf/booster/buy', auth, (req, res) => send(res, id(req), buyBooster(id(req))));
    router.post('/cf/booster/open', auth, (req, res) => send(res, id(req), openBooster(id(req))));
    router.post('/cf/craft', auth, (req, res) => send(res, id(req), craft(id(req), String(req.body?.cardId ?? ''))));
    router.post('/cf/recycle', auth, (req, res) =>
      send(res, id(req), recycle(id(req), String(req.body?.cardId ?? ''), req.body?.count === undefined ? 1 : Number(req.body.count), req.body?.confirm === true)));
    router.post('/cf/recycle-extras', auth, (req, res) => send(res, id(req), recycleExtras(id(req))));
    router.post('/cf/legend-pick', auth, (req, res) => send(res, id(req), legendPick(id(req), String(req.body?.cardId ?? ''))));
    router.post('/cf/decks', auth, (req, res) => send(res, id(req), createDeck(id(req), req.body?.name, req.body?.cards)));
    router.post('/cf/decks/:id/active', auth, (req, res) => send(res, id(req), setActive(id(req), String(req.params.id))));
    router.post('/cf/decks/:id', auth, (req, res) => send(res, id(req), updateDeck(id(req), String(req.params.id), req.body?.name, req.body?.cards)));
    router.delete('/cf/decks/:id', auth, (req, res) => send(res, id(req), deleteDeck(id(req), String(req.params.id))));
    router.get('/cf/league', auth, (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, ...league(id(req)) }); });
  }

  return {
    state, discover, buyBooster, openBooster, craft, recycle, recycleExtras, legendPick, createDeck, updateDeck, deleteDeck, setActive, league,
    recordCfGame, progressCfMission, rollCfSeason, missions,
  };
}
export type CardsApi = ReturnType<typeof createCards>;
/** Toutes les cartes du catalogue (pour les écrans d'administration). */
export const CF_CARD_LIST = CARDS.map((x) => ({ id: x.id, name: x.name, rarity: x.rarity }));
