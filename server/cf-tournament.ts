/**
 * Coups Fourrés : tournoi du samedi (règles : shared/cards/tournament.ts).
 *
 * Tout ce qui compte est en base (tables cf_tours et cf_tour_regs) : inscriptions, tableau,
 * places et boosters. Seuls la présence dans le salon et les parties en cours sont en mémoire :
 * un redémarrage du serveur pendant le tournoi l'annule (rien à rembourser, l'inscription est gratuite).
 *
 * États d'un tournoi : a-venir → salon (20 h 30 à 20 h 40) → en-cours → termine, ou annule.
 * États d'une inscription : inscrit → joue → fini, ou absent (pas dans le salon au départ).
 *
 * Routes (préfixe /api) : GET /cf/tournoi, POST /cf/tournoi/inscription, POST /cf/tournoi/desinscription,
 * POST /cf/tournoi/salon { in: boolean }.
 * Essais (jamais en production) : SCHED_TEST_NOW (horloge) et SCHED_TEST_QUICK=1 (duels à 3 jetons, pauses de 10 s).
 */
import { randomInt } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { photoUrl, type Store, type UserRow } from './db';
import type { CardsApi } from './cards';
import { CF_BOOSTERS_MAX } from './cards';
import type { CfGameEnd, CfOnline } from './cards-online';
import type { CfTournamentEvent } from './discord-hooks';
import type { CfConfig } from '../shared/cards/engine';
import {
  CF_TOUR_ANNOUNCE_MS, CF_TOUR_LOBBY_MS, CF_TOUR_MAX, CF_TOUR_MIN, CF_TOUR_PAUSE_MS, CF_TOUR_REMIND_MS, CF_TOUR_SHOW_MS,
  cfAdvance, cfBracketDone, cfDrawBracket, cfFinal, cfFindMatch, cfNextTour, cfPlaces, cfReadyMatches, cfReport, cfRoundName,
  cfTourBoostersFor, cfTourPrizes, type CfBracket, type CfMatch, type CfMatchReason, type CfTourMatchView, type CfTourPlayer,
  type CfTourStatus, type CfTourView,
} from '../shared/cards/tournament';

interface TourRow { id: string; starts_at: number; status: CfTourStatus; starters: number | null; reason: string | null; bracket: string | null; reminded: number; finished_at: number | null }
interface RegRow { tour_id: string; user_id: string; created_at: number; status: 'inscrit' | 'joue' | 'absent' | 'fini'; place: number | null; boosters: number }

export interface CfTourOptions {
  /** Intervalle de l'horloge (0 : manuel, tests). */
  tickMs?: number;
  /** Pause entre deux matchs d'un joueur. */
  pauseMs?: number;
  /** Règles des duels (essais : moins de jetons). */
  config?: Partial<CfConfig>;
}
export interface CfTourDeps {
  store: Store;
  cards: CardsApi;
  online: CfOnline;
  now: () => number;
  userFromToken: (t: unknown) => UserRow | undefined;
  push: (userId: string, title: string, body: string, url?: string) => void;
  discord?: (ev: CfTournamentEvent) => unknown;
  /** Vainqueur du tournoi (bistrots entre amis) : son compte et le nombre de partants. */
  onChampion?: (userId: string, players: number) => unknown;
  opts?: CfTourOptions;
}

const URL_TOUR = '/?cf-tournoi=1';
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
const placeLabel = (p: number) => (p === 1 ? 'vainqueur' : p === 2 ? 'finaliste' : p === 3 ? 'demi-finaliste' : `${p}e`);

export function createCfTournament(d: CfTourDeps) {
  const { store, cards, online } = d;
  const PAUSE = d.opts?.pauseMs ?? CF_TOUR_PAUSE_MS;
  const db = store.sqlite;
  db.exec(`
    CREATE TABLE IF NOT EXISTS cf_tours (
      id TEXT PRIMARY KEY, starts_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'a-venir', starters INTEGER, reason TEXT,
      bracket TEXT, reminded INTEGER NOT NULL DEFAULT 0, finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS cf_tour_regs (
      tour_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'inscrit',
      place INTEGER, boosters INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tour_id, user_id)
    );
  `);
  const tourRow = (id: string) => db.prepare('SELECT * FROM cf_tours WHERE id = ?').get(id) as unknown as TourRow | undefined;
  const ensureTour = (id: string, startsAt: number) => { db.prepare('INSERT OR IGNORE INTO cf_tours (id, starts_at) VALUES (?, ?)').run(id, startsAt); return tourRow(id)!; };
  const setTour = (id: string, patch: Partial<Omit<TourRow, 'id'>>) => { for (const [k, v] of Object.entries(patch)) db.prepare(`UPDATE cf_tours SET ${k} = ? WHERE id = ?`).run(v as never, id); };
  const regs = (id: string, status?: RegRow['status']) => (status
    ? db.prepare('SELECT * FROM cf_tour_regs WHERE tour_id = ? AND status = ? ORDER BY created_at').all(id, status)
    : db.prepare('SELECT * FROM cf_tour_regs WHERE tour_id = ? ORDER BY created_at').all(id)) as unknown as RegRow[];
  const reg = (id: string, userId: string) => db.prepare('SELECT * FROM cf_tour_regs WHERE tour_id = ? AND user_id = ?').get(id, userId) as unknown as RegRow | undefined;
  const setReg = (id: string, userId: string, patch: Partial<Omit<RegRow, 'tour_id' | 'user_id'>>) => {
    for (const [k, v] of Object.entries(patch)) db.prepare(`UPDATE cf_tour_regs SET ${k} = ? WHERE tour_id = ? AND user_id = ?`).run(v as never, id, userId);
  };
  const toursBy = (statuses: CfTourStatus[]) => db.prepare(`SELECT * FROM cf_tours WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY starts_at`).all(...statuses) as unknown as TourRow[];

  /** Présents dans le salon (comptes), et tournoi en cours avec son tableau. */
  const here = new Set<string>();
  let active: { id: string; bracket: CfBracket; absentAtStart: Map<string, Set<string>>; games: Map<string, { round: number; index: number }> } | null = null;

  const save = () => { if (active) setTour(active.id, { bracket: JSON.stringify(active.bracket) }); };
  const nameOf = (userId: string) => store.userById(userId)?.username ?? '?';

  // --- Inscriptions -------------------------------------------------------------------------------
  /** Pourquoi ce compte ne peut pas jouer (mode pas découvert, pas de deck actif valide), ou null. */
  function cannotPlay(userId: string): string | null {
    const st = cards.state(userId);
    if (!st.discovered) return 'Découvrez d’abord le mode Coups Fourrés.';
    const deck = st.decks.find((x) => x.id === st.activeDeck);
    if (!deck || !deck.valid) return 'Il vous faut un deck actif complet de 20 cartes (Mes decks).';
    return null;
  }
  /** Tournoi ouvert aux inscriptions à `now` (le prochain samedi, salon compris). */
  function openTour(now = d.now()) {
    const slot = cfNextTour(now);
    const row = ensureTour(slot.id, slot.startsAt);
    return { slot, row };
  }

  function register(userId: string): string | null {
    const { slot, row } = openTour();
    if (!['a-venir', 'salon'].includes(row.status) || d.now() >= slot.beginsAt) return 'Les inscriptions sont closes.';
    const r = reg(slot.id, userId);
    if (r) return null; // déjà inscrit
    const why = cannotPlay(userId);
    if (why) return why;
    if (regs(slot.id).length >= CF_TOUR_MAX) return `Le tournoi est complet (${CF_TOUR_MAX} joueurs).`;
    db.prepare('INSERT INTO cf_tour_regs (tour_id, user_id, created_at) VALUES (?, ?, ?)').run(slot.id, userId, d.now());
    return null;
  }
  function unregister(userId: string): string | null {
    const { slot, row } = openTour();
    if (!reg(slot.id, userId)) return 'Vous n’êtes pas inscrit à ce tournoi.';
    if (!['a-venir', 'salon'].includes(row.status)) return 'Le tournoi a commencé.';
    db.prepare('DELETE FROM cf_tour_regs WHERE tour_id = ? AND user_id = ?').run(slot.id, userId);
    here.delete(userId);
    return null;
  }
  /** Entrer (ou sortir) du salon pendant ses 10 minutes d'ouverture ; s'inscrit au passage. */
  function salon(userId: string, inside: boolean): string | null {
    if (!inside) { here.delete(userId); return null; }
    const { slot, row } = openTour();
    const now = d.now();
    if (now < slot.startsAt) return 'Le salon n’est pas encore ouvert.';
    if (row.status !== 'salon' && row.status !== 'a-venir') return 'Le tournoi a commencé.';
    const err = register(userId);
    if (err) return err;
    if (!online.isConnected(userId)) return 'Ouvrez Coups Fourrés pour entrer dans le salon.';
    here.add(userId);
    return null;
  }

  // Un joueur qui quitte le mode (plus aucune connexion « /cf ») sort du salon.
  online.onSocket((socket, userId) => {
    socket.on('disconnect', () => setImmediate(() => { if (!online.isConnected(userId)) here.delete(userId); }));
  });
  // Inscrits encore en lice (ou présents dans le salon) : pas d'autre partie en ligne.
  online.setBusyCheck((userId) => {
    if (active) {
      const r = reg(active.id, userId);
      if (r?.status === 'joue') {
        const m = cfFindMatch(active.bracket, userId);
        if (m && (m.match.status !== 'fini' || m.match.winner === userId) && !cfBracketDone(active.bracket)) return 'Vous jouez le tournoi du samedi : votre prochain match arrive bientôt.';
      }
    }
    if (here.has(userId)) return 'Vous êtes dans le salon du tournoi : le départ approche.';
    return null;
  });

  // --- Déroulé -----------------------------------------------------------------------------------
  function cancel(id: string, reason: string, players: number, notify = true) {
    setTour(id, { status: 'annule', reason, starters: players, finished_at: d.now() });
    if (notify) for (const r of regs(id)) if (r.status !== 'absent') d.push(r.user_id, 'Tournoi Coups Fourrés annulé', reason, URL_TOUR);
    if (active?.id === id) active = null;
    for (const u of [...here]) if (reg(id, u)) here.delete(u);
  }

  function begin(row: TourRow) {
    const registered = regs(row.id, 'inscrit').map((r) => r.user_id);
    const present = registered.filter((u) => here.has(u) && online.isConnected(u) && !cannotPlay(u));
    for (const u of registered) if (!present.includes(u)) {
      setReg(row.id, u, { status: 'absent' });
      d.push(u, 'Tournoi Coups Fourrés', 'Vous n’étiez pas dans le salon au départ : le tournoi s’est joué sans vous. À samedi prochain !', URL_TOUR);
    }
    for (const u of present) here.delete(u);
    if (present.length < CF_TOUR_MIN) {
      const reason = `Tournoi annulé : ${plural(present.length, 'joueur')} au départ, il en faut au moins ${CF_TOUR_MIN}.`;
      cancel(row.id, reason, present.length);
      void d.discord?.({ kind: 'annule', id: row.id, players: present.length });
      return;
    }
    const bracket = cfDrawBracket(present, () => randomInt(0, 2 ** 30) / 2 ** 30, d.now());
    for (const u of present) setReg(row.id, u, { status: 'joue' });
    setTour(row.id, { status: 'en-cours', starters: present.length, bracket: JSON.stringify(bracket) });
    active = { id: row.id, bracket, absentAtStart: new Map(), games: new Map() };
    const prizes = cfTourPrizes(present.length);
    for (const u of present) d.push(u, 'Le tournoi Coups Fourrés commence', `${present.length} joueurs. À gagner : ${prizes.map((b, i) => `${['vainqueur', 'finaliste', 'demi-finalistes'][i]} ${plural(b, 'booster')}`).join(', ')}.`, URL_TOUR);
    run();
  }

  /** Lance les matchs prêts ; termine le tournoi quand la finale est jouée. */
  function run() {
    if (!active) return;
    const a = active;
    const now = d.now();
    cfAdvance(a.bracket, now, PAUSE);
    for (const { round, index, match } of cfReadyMatches(a.bracket, now)) startMatch(round, index, match);
    cfAdvance(a.bracket, now, PAUSE);
    save();
    if (cfBracketDone(a.bracket)) finish();
  }

  function startMatch(round: number, index: number, m: CfMatch) {
    const a = active!;
    const [pa, pb] = [m.a!, m.b!];
    const inA = online.isConnected(pa), inB = online.isConnected(pb);
    const now = d.now();
    if (!inA && !inB) { cfReport(a.bracket, round, index, null, 'double-forfait', now); return; }
    const r = online.createMatch('tournoi', [pa, pb], d.opts?.config ?? {});
    if ('error' in r) {
      // Deck devenu injouable, ou déjà dans une autre partie : forfait de ce joueur.
      cfReport(a.bracket, round, index, r.userId === pa ? pb : pa, 'forfait', now);
      d.push(r.userId, 'Tournoi Coups Fourrés : forfait', `Votre match n’a pas pu commencer : ${r.error}`, URL_TOUR);
      return;
    }
    m.status = 'en-cours';
    m.game = r.id;
    a.games.set(r.id, { round, index });
    a.absentAtStart.set(r.id, new Set([...(inA ? [] : [pa]), ...(inB ? [] : [pb])]));
    const name = cfRoundName(round, a.bracket.rounds.length).toLowerCase();
    for (const [u, o] of [[pa, pb], [pb, pa]]) d.push(u, 'Votre match du tournoi commence', `${name[0].toUpperCase()}${name.slice(1)} contre ${nameOf(o)}. Ouvrez Coups Fourrés : 60 s pour arriver, sinon c’est perdu.`, URL_TOUR);
  }

  online.onEnd((e: CfGameEnd) => {
    if (e.mode !== 'tournoi' || !active) return;
    const where = active.games.get(e.id);
    if (!where) return;
    active.games.delete(e.id);
    const absent = active.absentAtStart.get(e.id);
    const reason: CfMatchReason = e.abandon ? (absent?.has(e.abandon) ? 'forfait' : 'abandon') : 'victoire';
    cfReport(active.bracket, where.round, where.index, e.winner, reason, d.now());
    run();
  });

  function finish() {
    const a = active!;
    active = null;
    const row = tourRow(a.id)!;
    const n = row.starters ?? 0;
    const places = cfPlaces(a.bracket);
    const champion = cfFinal(a.bracket).winner;
    store.cfTx(() => {
      for (const r of regs(a.id, 'joue')) {
        const place = places.get(r.user_id) ?? null;
        const boosters = cfTourBoostersFor(place, n);
        setReg(a.id, r.user_id, { status: 'fini', place, boosters });
        if (boosters > 0 && store.userById(r.user_id)) {
          const p = store.cfPlayer(r.user_id, d.now());
          store.cfPlayerSet(r.user_id, { boosters: Math.min(CF_BOOSTERS_MAX, p.boosters + boosters) });
        }
      }
      setTour(a.id, { status: 'termine', finished_at: d.now(), bracket: JSON.stringify(a.bracket) });
    });
    for (const r of regs(a.id, 'fini')) {
      const text = r.boosters
        ? `Tournoi Coups Fourrés : vous terminez ${placeLabel(r.place!)}${r.place === 1 ? ' !' : ''} ${plural(r.boosters, 'booster')} ${r.boosters > 1 ? 'vous attendent' : 'vous attend'}.`
        : `Tournoi Coups Fourrés : ${champion ? `${nameOf(champion)} l’emporte` : 'le tournoi est fini'}. Merci d’avoir joué, à samedi prochain !`;
      if (r.boosters) store.modNotify(r.user_id, 'cf-tournoi', text, d.now());
      d.push(r.user_id, r.place === 1 ? 'Vous remportez le tournoi Coups Fourrés !' : 'Tournoi Coups Fourrés terminé', text, URL_TOUR);
    }
    const f = cfFinal(a.bracket);
    const podium = champion ? [champion, ...[f.a, f.b].filter((x): x is string => !!x && x !== champion)] : [];
    if (champion) { try { d.onChampion?.(champion, n); } catch { /* sans effet sur le tournoi */ } }
    if (champion) void d.discord?.({ kind: 'fin', id: a.id, players: n, podium: podium.map(nameOf), boosters: cfTourBoostersFor(1, n) });
  }

  /** Horloge : rappels, annonces, ouverture du salon, départ, matchs. */
  function tick() {
    const now = d.now();
    const slot = cfNextTour(now);
    const row = tourRow(slot.id);
    const count = row ? regs(slot.id).length : 0;
    if (now >= slot.startsAt - CF_TOUR_ANNOUNCE_MS && now < slot.startsAt - CF_TOUR_ANNOUNCE_MS + 10 * 60_000)
      void d.discord?.({ kind: 'bientot', id: slot.id, registered: count });
    if (row && row.status === 'a-venir' && row.reminded < 1 && now >= slot.startsAt - CF_TOUR_REMIND_MS && now < slot.startsAt) {
      setTour(slot.id, { reminded: 1 });
      for (const r of regs(slot.id)) d.push(r.user_id, 'Tournoi Coups Fourrés dans 10 minutes', 'Le salon ouvre à 20 h 30 : entrez-y avant 20 h 40 pour jouer.', URL_TOUR);
    }
    if (now >= slot.startsAt && now < slot.beginsAt) {
      const r = row ?? ensureTour(slot.id, slot.startsAt);
      if (r.status === 'a-venir') {
        setTour(slot.id, { status: 'salon' });
        if (r.reminded < 2) {
          setTour(slot.id, { reminded: 2 });
          for (const x of regs(slot.id)) d.push(x.user_id, 'Le salon du tournoi Coups Fourrés est ouvert', 'Entrez dans le salon : départ à 20 h 40.', URL_TOUR);
        }
      }
      if (now < slot.startsAt + 3 * 60_000) void d.discord?.({ kind: 'salon', id: slot.id, registered: count });
    }
    // Départ (ou départ manqué : serveur arrêté à ce moment-là).
    for (const t of toursBy(['a-venir', 'salon'])) {
      const beginsAt = t.starts_at + CF_TOUR_LOBBY_MS;
      if (now < beginsAt) continue;
      if (now > beginsAt + 5 * 60_000) cancel(t.id, 'Le tournoi n’a pas pu avoir lieu (serveur indisponible).', 0);
      else begin(t);
    }
    if (active) run();
  }

  /** Démarrage du serveur : un tournoi en cours a été interrompu → annulé. */
  function recover() {
    for (const t of toursBy(['en-cours'])) cancel(t.id, 'Le tournoi a été interrompu par une mise à jour du serveur. Toutes nos excuses !', t.starters ?? 0);
  }

  // --- Vue ----------------------------------------------------------------------------------------
  const player = (userId: string | null): CfTourPlayer | null => {
    if (!userId) return null;
    const u = store.userById(userId);
    if (!u) return { name: '?' };
    const photo = photoUrl(u);
    return photo ? { name: u.username, photo } : { name: u.username };
  };
  const matchView = (m: CfMatch, me?: string): CfTourMatchView => ({
    a: player(m.a), b: player(m.b), winner: m.winner ? (m.winner === m.a ? 'a' : 'b') : null, status: m.status, reason: m.reason,
    game: m.status === 'en-cours' ? m.game : null, readyAt: m.readyAt, mine: !!me && (m.a === me || m.b === me),
  });

  function view(userId?: string): CfTourView {
    const now = d.now();
    const shown = (db.prepare(`SELECT * FROM cf_tours WHERE starts_at <= ? AND (status = 'en-cours' OR (status IN ('termine', 'annule') AND finished_at >= ?))
      ORDER BY starts_at DESC LIMIT 1`).get(now, now - CF_TOUR_SHOW_MS) as unknown as TourRow | undefined);
    const slot = cfNextTour(now);
    const row = shown ?? tourRow(slot.id) ?? { id: slot.id, starts_at: slot.startsAt, status: 'a-venir' as CfTourStatus, starters: null, reason: null, bracket: null, reminded: 0, finished_at: null };
    const bracket: CfBracket | null = active?.id === row.id ? active.bracket : row.bracket ? JSON.parse(row.bracket) as CfBracket : null;
    const status: CfTourStatus = row.status === 'a-venir' && now >= row.starts_at ? 'salon' : row.status;
    const all = regs(row.id);
    const mine = userId ? all.find((r) => r.user_id === userId) : undefined;
    const open = status === 'a-venir' || status === 'salon';
    let cannot: string | null = null;
    if (!userId) cannot = 'Le tournoi demande un compte (gratuit).';
    else if (open && !mine) cannot = cannotPlay(userId) ?? (all.length >= CF_TOUR_MAX ? `Le tournoi est complet (${CF_TOUR_MAX} joueurs).` : null);
    const n = row.starters ?? all.length;
    let me: CfTourView['me'] = null;
    if (mine && userId) {
      const at = bracket ? cfFindMatch(bracket, userId) : null;
      const state = mine.status === 'absent' ? 'absent' : mine.status === 'inscrit' ? 'inscrit'
        : mine.place === 1 || (bracket && cfFinal(bracket).winner === userId) ? 'vainqueur'
          : at && at.match.status === 'fini' && at.match.winner !== userId ? 'elimine' : 'en-lice';
      me = { state, place: mine.place, boosters: mine.boosters, match: at ? matchView(at.match, userId) : null };
    }
    return {
      id: row.id, startsAt: row.starts_at, beginsAt: row.starts_at + CF_TOUR_LOBBY_MS, serverNow: now, status,
      count: row.starters ?? all.filter((r) => r.status !== 'absent').length, min: CF_TOUR_MIN, max: CF_TOUR_MAX, lobbyMs: CF_TOUR_LOBBY_MS,
      registered: !!mine && mine.status !== 'absent', here: !!userId && here.has(userId), present: all.filter((r) => here.has(r.user_id)).length,
      cannot, prizes: cfTourPrizes(Math.max(n, CF_TOUR_MIN)), starters: row.starters, reason: row.reason,
      rounds: bracket ? bracket.rounds.map((ms, i) => ({ name: cfRoundName(i, bracket.rounds.length), matches: ms.map((m) => matchView(m, userId)) })) : null,
      me, champion: bracket && cfFinal(bracket).status === 'fini' ? player(cfFinal(bracket).winner) : null,
      next: row.id !== slot.id ? { id: slot.id, startsAt: slot.startsAt } : null,
    };
  }

  // --- Routes -------------------------------------------------------------------------------------
  const router = express.Router();
  router.use('/cf/tournoi', express.json({ limit: '1kb' }));
  const userOf = (req: Request) => { const h = req.headers.authorization ?? ''; return d.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : ''); };
  router.get('/cf/tournoi', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, tour: view(userOf(req)?.id) }); });
  const act = (fn: (userId: string, req: Request) => string | null) => (req: Request, res: Response) => {
    const u = userOf(req);
    if (!u) return res.status(401).json({ ok: false, error: 'Le tournoi demande un compte (gratuit).' });
    const err = fn(u.id, req);
    if (err) return res.status(400).json({ ok: false, error: err, tour: view(u.id) });
    res.json({ ok: true, tour: view(u.id) });
  };
  router.post('/cf/tournoi/inscription', act((u) => register(u)));
  router.post('/cf/tournoi/desinscription', act((u) => unregister(u)));
  router.post('/cf/tournoi/salon', act((u, req) => salon(u, req.body?.in !== false)));

  recover();
  const timer = d.opts?.tickMs === 0 ? null : setInterval(tick, d.opts?.tickMs ?? 2000);
  timer?.unref?.();
  return {
    router, tick, view, register, unregister, salon, recover,
    get active() { return active; }, here,
    close: () => { if (timer) clearInterval(timer); },
  };
}
export type CfTournamentApi = ReturnType<typeof createCfTournament>;
