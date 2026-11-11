/**
 * « En ligne maintenant » (administration) : qui est connecté, sur quel appareil, et où.
 *
 * La présence (namespace /presence, voir stats.ts) envoie un état par onglet. Depuis 0.48 c'est un
 * objet { state, screen, view, code, name, avatar } ; les onglets restés sur une ancienne version
 * envoient encore un simple texte ('menu' | 'solo' | 'online'), toujours accepté.
 *
 * Ce module ne fait que nettoyer ces états et les regrouper par appareil. Pour les comptes, la table
 * où le serveur les voit assis (421, Courtisan, Coups Fourrés) fait foi ; le code de table annoncé
 * par un invité n'est gardé que s'il correspond à une table qui existe.
 *
 * Vie privée : ni adresse IP, ni email, ni identifiant brut d'appareil dans la réponse. Un invité
 * est désigné par son numéro de visiteur anonyme (le même que dans l'onglet « Personnes ») et par
 * le nom qu'il a lui-même choisi pour jouer.
 */

export type PresenceState = 'menu' | 'solo' | 'online';
export type LiveGame = '421' | 'cf' | 'courtisan';
export type LiveStatus = 'partie' | 'salon' | 'menu';

/** État d'un onglet, nettoyé. */
export interface TabInfo {
  state: PresenceState;
  screen?: string; view?: string; code?: string;
  /** Nom affiché et avatar choisis par le joueur (invités : seul moyen de les reconnaître). */
  name?: string; avatar?: string;
  /** Faux pour un onglet resté sur une version d'avant 0.48 (état en simple texte). */
  detailed: boolean;
}

/** Un onglet relié (une entrée par connexion de présence). */
export interface PresenceEntry {
  device: string; userId?: string; name?: string; since: number; changedAt: number;
  /** Type d'appareil d'après le navigateur (jamais le texte du navigateur lui-même). */
  kind: 'mobile' | 'tablette' | 'ordinateur';
  info: TabInfo;
}

const SCREEN_RE = /^[a-z][a-z-]{0,23}$/;
const CODE_RE = /^[A-Za-z0-9-]{3,40}$/;
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) || undefined : undefined);

/** Nettoie ce qu'envoie un onglet (ancien format texte compris). */
export function cleanTabInfo(raw: unknown): TabInfo {
  if (typeof raw === 'string' || raw == null || typeof raw !== 'object') {
    return { state: raw === 'solo' || raw === 'online' ? raw : 'menu', detailed: false };
  }
  const o = raw as Record<string, unknown>;
  const st = o.state === 'solo' || o.state === 'online' ? o.state : 'menu';
  const screen = typeof o.screen === 'string' && SCREEN_RE.test(o.screen) ? o.screen : undefined;
  const view = typeof o.view === 'string' && SCREEN_RE.test(o.view) ? o.view : undefined;
  const code = typeof o.code === 'string' && CODE_RE.test(o.code) ? o.code : undefined;
  return { state: st, screen, view, code, name: clip(o.name, 20), avatar: clip(o.avatar, 8), detailed: true };
}

/** Écrans de l'application (App.tsx) : libellé et jeu concerné. */
const SCREENS: Record<string, { label: string; game?: LiveGame; status?: LiveStatus }> = {
  home: { label: 'Menu principal' },
  classic: { label: 'Menu du 421', game: '421' },
  'solo-setup': { label: 'Prépare une partie solo', game: '421' },
  solo: { label: 'Partie solo', game: '421', status: 'partie' },
  hub: { label: 'Tables et tournois en ligne', game: '421' },
  online: { label: 'Table en ligne', game: '421', status: 'salon' },
  tournament: { label: 'Tournoi', game: '421', status: 'salon' },
  watch: { label: 'Regarde une partie', game: '421' },
  rules: { label: 'Règles du 421', game: '421' },
  tutorial: { label: 'Partie guidée', game: '421', status: 'partie' },
  boss: { label: 'Patron de la semaine', game: '421', status: 'partie' },
  'party-setup': { label: 'Prépare une soirée', game: '421' },
  party: { label: 'Soirée (un seul téléphone)', game: '421', status: 'partie' },
  referee: { label: 'Arbitre de partie réelle', game: '421', status: 'partie' },
  challenge: { label: 'Défi du jour', game: '421' },
  album: { label: 'Album', game: '421' },
  duels: { label: 'Défis entre amis' },
  duel: { label: 'Défi entre amis', game: '421', status: 'partie' },
  dixmille: { label: 'Le Courtisan', game: 'courtisan' },
  poker: { label: 'Poker menteur' },
  cf: { label: 'Coups Fourrés', game: 'cf' },
  shop: { label: 'Boutique' },
  collection: { label: 'Collection de dés' },
  friends: { label: 'Amis' },
  messages: { label: 'Messages' },
  settings: { label: 'Réglages' },
  sandbox: { label: 'Bac d’essai' },
  account: { label: 'Connexion / inscription' },
  leaderboard: { label: 'Classement' },
  pass: { label: 'Pass de saison' },
  club: { label: 'Clubs' },
  recap: { label: 'Récapitulatif' },
  changelog: { label: 'Nouveautés' },
  stats: { label: 'Statistiques' },
  legal: { label: 'Mentions légales' },
  admin: { label: 'Administration' },
  moderation: { label: 'Modération' },
};
/** Vues précises à l'intérieur d'un écran. */
const VIEWS: Record<string, { label: string; status: LiveStatus }> = {
  menu: { label: 'Menu', status: 'menu' },
  preparation: { label: 'Prépare une partie', status: 'menu' },
  attente: { label: 'Cherche une table', status: 'salon' },
  salon: { label: 'Salon d’attente', status: 'salon' },
  partie: { label: 'Partie en ligne', status: 'partie' },
  'partie-solo': { label: 'Partie contre l’ordinateur', status: 'partie' },
  spectateur: { label: 'Regarde une partie', status: 'menu' },
  collection: { label: 'Collection de cartes', status: 'menu' },
  decks: { label: 'Decks', status: 'menu' },
  ligue: { label: 'Ligue', status: 'menu' },
  tournoi: { label: 'Tournoi du samedi', status: 'menu' },
  enigme: { label: 'Énigme du jour', status: 'menu' },
  regles: { label: 'Règles et cartes', status: 'menu' },
  boosters: { label: 'Boosters', status: 'menu' },
};
export const GAME_LABEL: Record<LiveGame, string> = { '421': '421', cf: 'Coups Fourrés', courtisan: 'Le Courtisan' };
const MODE_MENU: Record<LiveGame, string> = { '421': 'Menu du 421', cf: 'Menu de Coups Fourrés', courtisan: 'Menu du Courtisan' };

/** Table où le serveur voit un compte assis (fait foi). */
export interface SeatInfo { game: LiveGame; code: string; status: 'salon' | 'partie' }

export interface Activity {
  game: LiveGame | null; status: LiveStatus; where: string; code: string | null;
  /** Mode de jeu : solo, en ligne, tournoi, spectateur (null : menus). */
  mode: 'solo' | 'en ligne' | 'tournoi' | 'spectateur' | null;
}

/** Ce que fait un onglet : écran, jeu, partie ou menus. */
export function describeTab(info: TabInfo, seat: SeatInfo | null, codeKnown: (code: string) => boolean): Activity {
  const sc = info.screen ? SCREENS[info.screen] : undefined;
  const vw = info.view ? VIEWS[info.view] : undefined;
  let game: LiveGame | null = sc?.game ?? null;
  let code = info.code && codeKnown(info.code) ? info.code : null;
  let status: LiveStatus;
  let where: string;
  if (!info.detailed) {
    // Ancienne version : seul l'état général est connu.
    status = info.state === 'menu' ? 'menu' : 'partie';
    where = info.state === 'solo' ? 'Partie solo' : info.state === 'online' ? 'Jeu en ligne' : 'Menus';
  } else if (vw) {
    status = vw.status;
    where = info.view === 'menu' && game ? MODE_MENU[game] : vw.label;
  } else {
    status = sc?.status ?? (info.state === 'menu' ? 'menu' : 'partie');
    where = sc?.label ?? (info.state === 'solo' ? 'Partie solo' : info.state === 'online' ? 'Jeu en ligne' : 'Menus');
    if (info.screen === 'cf' || info.screen === 'dixmille') where = MODE_MENU[game!];
  }
  // Coups Fourrés : la partie elle-même (CfGame) annonce solo / en ligne par l'état général.
  if (info.detailed && info.screen === 'cf' && !info.view && info.state !== 'menu') {
    status = 'partie'; where = info.state === 'online' ? 'Partie en ligne' : 'Partie contre l’ordinateur';
  }
  // Le serveur fait foi pour les comptes assis à une table.
  if (seat) {
    game = seat.game; code = seat.code; status = seat.status;
    if (info.view !== 'spectateur') where = seat.status === 'partie' ? 'Partie en ligne' : 'Salon d’attente';
  }
  let mode: Activity['mode'] = null;
  if (info.view === 'spectateur' || info.screen === 'watch') { mode = 'spectateur'; status = 'menu'; if (!seat) where = 'Regarde une partie'; }
  else if (info.screen === 'tournament') mode = 'tournoi';
  else if (status !== 'menu') {
    const onlineView = info.view === 'partie' || info.view === 'salon' || info.view === 'attente';
    mode = info.view === 'partie-solo' ? 'solo' : seat || onlineView || info.screen === 'online' || info.state === 'online' ? 'en ligne' : 'solo';
  }
  if (mode === 'tournoi' && status !== 'menu') where = status === 'partie' ? 'Partie de tournoi' : 'Salon du tournoi';
  return { game, status, where, code, mode };
}

const RANK: Record<LiveStatus, number> = { partie: 2, salon: 1, menu: 0 };

export interface LiveRow {
  /** Clé stable et anonyme (empreinte salée de l'appareil). */
  key: string;
  kind: 'compte' | 'invite';
  userId: string | null; username: string | null; level: number | null; photo: string | null; admin: boolean;
  /** Invité : « Visiteur #a3f9 » (même numéro que l'onglet Personnes) et nom choisi s'il y en a un. */
  label: string; displayName: string | null; avatar: string | null;
  activity: Activity; activitySince: number;
  /** Autres onglets ouverts sur le même appareil (leur activité). */
  otherTabs: string[]; tabs: number;
  since: number; device: PresenceEntry['kind'];
  country: string | null; countryName: string | null; flag: string | null;
  /** Nouveau : première visite aujourd'hui. Habitué : venu d'autres jours (nombre de jours). */
  newcomer: boolean | null; activeDays: number | null;
  oldClient: boolean;
}

export interface LiveContext {
  now: number;
  seatOf: (userId: string) => SeatInfo | null;
  codeKnown: (code: string) => boolean;
  /** Empreinte anonyme d'un appareil (clé de visiteur). */
  visitorKey: (device: string) => string;
  visitorInfo: (visitorKey: string, userId: string | null) => { country: string | null; countryName: string | null; flag: string | null; newcomer: boolean | null; activeDays: number | null } | null;
  userInfo: (userId: string) => { username: string; level: number; photo: string | null; admin: boolean } | null;
}

export interface LiveSummary {
  accounts: number; guests: number; playing: number; inMenus: number;
  byGame: Record<LiveGame | 'aucun', number>;
}

/** Regroupe les onglets par appareil et décrit chaque appareil connecté. */
export function buildLive(entries: PresenceEntry[], ctx: LiveContext): { rows: LiveRow[]; summary: LiveSummary } {
  const byDevice = new Map<string, PresenceEntry[]>();
  for (const e of entries) { const l = byDevice.get(e.device); if (l) l.push(e); else byDevice.set(e.device, [e]); }
  // Un compte assis à une table : rattaché à l'appareil qui dit jouer (ou à son seul appareil).
  const devicesOfUser = new Map<string, number>();
  for (const tabs of byDevice.values()) {
    for (const id of new Set(tabs.map((t) => t.userId).filter(Boolean) as string[])) devicesOfUser.set(id, (devicesOfUser.get(id) ?? 0) + 1);
  }
  const rows: LiveRow[] = [];
  for (const [device, tabs] of byDevice) {
    const userId = tabs.find((t) => t.userId)?.userId ?? null;
    const seat = userId ? ctx.seatOf(userId) : null;
    const described = tabs.map((t) => {
      const useSeat = seat && (t.userId === userId) && (devicesOfUser.get(userId!) === 1 || t.info.state !== 'menu' || (t.info.view && VIEWS[t.info.view]?.status !== 'menu'));
      return { t, a: describeTab(t.info, useSeat ? seat : null, ctx.codeKnown) };
    });
    // Onglet principal : celui qui joue, sinon le plus récemment actif.
    described.sort((x, y) => RANK[y.a.status] - RANK[x.a.status] || y.t.changedAt - x.t.changedAt);
    const main = described[0];
    // Un compte assis à une table que ses onglets ne montrent pas (ancienne version, autre écran) : la table prime.
    if (seat && userId && devicesOfUser.get(userId) === 1 && main.a.status === 'menu' && main.a.mode !== 'spectateur') {
      main.a = describeTab({ ...main.t.info, view: undefined }, seat, ctx.codeKnown);
    }
    const key = ctx.visitorKey(device);
    const u = userId ? ctx.userInfo(userId) : null;
    const v = ctx.visitorInfo(key, userId);
    const named = tabs.map((t) => t.info.name).find(Boolean) ?? null;
    rows.push({
      key, kind: u ? 'compte' : 'invite',
      userId: u ? userId : null, username: u?.username ?? null, level: u?.level ?? null, photo: u?.photo ?? null, admin: u?.admin ?? false,
      label: `Visiteur #${key.slice(0, 4)}`, displayName: u ? null : named, avatar: tabs.map((t) => t.info.avatar).find(Boolean) ?? null,
      activity: main.a, activitySince: main.t.changedAt,
      otherTabs: described.slice(1).map((d) => d.a.where + (d.a.game && !d.a.where.includes(GAME_LABEL[d.a.game]) && d.a.where !== 'Menu principal' ? ` (${GAME_LABEL[d.a.game]})` : '')),
      tabs: tabs.length,
      since: Math.min(...tabs.map((t) => t.since)), device: tabs[0].kind,
      country: v?.country ?? null, countryName: v?.countryName ?? null, flag: v?.flag ?? null,
      newcomer: v?.newcomer ?? null, activeDays: v?.activeDays ?? null,
      oldClient: tabs.every((t) => !t.info.detailed),
    });
  }
  rows.sort((a, b) => RANK[b.activity.status] - RANK[a.activity.status] || Number(b.kind === 'compte') - Number(a.kind === 'compte') || a.since - b.since);
  const summary: LiveSummary = {
    accounts: rows.filter((r) => r.kind === 'compte').length,
    guests: rows.filter((r) => r.kind === 'invite').length,
    playing: rows.filter((r) => r.activity.status !== 'menu').length,
    inMenus: rows.filter((r) => r.activity.status === 'menu').length,
    byGame: { '421': 0, cf: 0, courtisan: 0, aucun: 0 },
  };
  for (const r of rows) summary.byGame[r.activity.game ?? 'aucun']++;
  return { rows, summary };
}

/** Type d'appareil d'après le navigateur (même règle que les visites). */
export const deviceKindOf = (ua: string): PresenceEntry['kind'] => (/iPad|Tablet/i.test(ua) ? 'tablette' : /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'ordinateur');
