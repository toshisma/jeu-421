/**
 * Coups Fourrés : la campagne solo « Les Comptoirs rivaux » (après le parcours débutant, qu'elle ne remplace pas).
 * Douze comptoirs en quatre quartiers ; à chacun, un patron (et parfois ses amis) joue un deck thématique IMPOSÉ,
 * construit selon la règle de construction (DECK_RULES : 2 familles au plus, une seule légendaire). Le joueur
 * s'assoit avec SON deck. Duel à 11 jetons, 3-4 joueurs à 9 (règles de Sam, inchangées : moteur standard).
 *
 * Étoiles : 1 = gagner ; 2 et 3 = défis lisibles calculés UNIQUEMENT à partir de la partie rejouée par le serveur
 * (shared/cards/botmatch.ts : graine + decks imposés au départ, actions du joueur à la fin) :
 *  - « rounds » : gagner en N manches au plus (état final rejoué) ;
 *  - « notrap » : gagner sans qu'aucun piège adverse ne vous touche (événements `piege-revele` visant le joueur) ;
 *  - « mono » : gagner avec un deck d'une seule famille (deck que le serveur a imposé à la partie) ;
 *  - « lead » : gagner alors que chaque adversaire a encore au moins N jetons ;
 *  - « traps » : gagner en déclenchant au moins N de vos pièges ;
 *  - « lost » : gagner en perdant au plus N manches (comptes où le joueur reçoit les jetons) ;
 *  - « combo » : gagner en jouant au moins N cartes dans une même manche.
 * Réputation (somme des étoiles) + quartier précédent terminé = quartier suivant ouvert (comme la Tournée du 421).
 * Récompenses basses : CCF_STAR_COINS pièces par nouvelle étoile ; fin de quartier : un titre (profil) et, pour un
 * compte, quelques capsules (monnaie du mode). Comptes : écrit par le serveur (server/cards-online.ts, /cf/bot/end) ;
 * invités : profil local, reprise plafonnée à l'inscription (capCcfImport).
 * Textes : clés `ccf.` (shared/i18n/zones/campcf.*.ts) ; titres en français ici, traduits par campcf-server.ts.
 */
import { CARDS, type CardFamily } from '../cards/catalog';
import type { CfLevel } from '../cards/ai';
import type { CfEvent, CfState } from '../cards/engine';
import type { BotMatchSetup } from '../cards/botmatch';
import type { Profile } from '../progress/profile';

export type CcfStar =
  | { k: 'rounds'; n: number }
  | { k: 'notrap' }
  | { k: 'mono' }
  | { k: 'lead'; n: number }
  | { k: 'traps'; n: number }
  | { k: 'lost'; n: number }
  | { k: 'combo'; n: number };

/** Patron (ou habitué) d'un comptoir rival : personnage original, niveau de l'ordinateur, deck imposé. */
export interface CcfRival {
  id: string;
  name: string;
  avatar: string;
  color: string;
  level: CfLevel;
  deck: Record<string, number>;
}

export interface CcfStage {
  id: string;
  chapter: string;
  /** Adversaires : le patron d'abord, puis ses amis (1 à 3 au total). */
  rivals: string[];
  stars: [CcfStar, CcfStar];
}

export interface CcfChapter {
  id: string;
  /** Réputation (étoiles) nécessaire, en plus du quartier précédent terminé. */
  need: number;
  /** Titre gagné en terminant le quartier (tous ses comptoirs gagnés). */
  title: string;
  /** Capsules offertes une fois au compte qui termine le quartier. */
  capsules: number;
  color: string;
}

export const CAMPAIGN = { id: 'cf', game: 'cf', nameKey: 'ccf.title', maxStars: 36 } as const;

export const CCF_RIVALS: CcfRival[] = [
  // --- La rue des Lilas ---
  { id: 'firmin', name: 'Firmin', avatar: '🪗', color: '#b0477a', level: 'debutant', deck: {
    'cul-sec': 2, 'tete-tourne': 2, 'petit-dernier': 2, 'verre-offert': 2, 'gueule-bois': 2, 'der-des-ders': 2, 'coup-etrier': 2, sante: 2, fanfaron: 2, calva: 2,
  } },
  { id: 'paulette', name: 'Paulette', avatar: '👵', color: '#c46a3a', level: 'habitue', deck: {
    'cafe-serre': 2, 'vieux-marcel': 2, pilier: 2, pourboire: 2, 'plat-du-jour': 2, addition: 2, 'coup-coude': 2, 'mise-bouche': 2, 'boule-de-neige': 2, 'tant-qu-on-y-est': 2,
  } },
  { id: 'rosine', name: 'Rosine', avatar: '🃏', color: '#5d4a8c', level: 'debutant', deck: {
    leurre: 2, 'croche-patte': 2, mouchard: 2, fouine: 2, 'vide-poches': 2, 'peau-banane': 2, 'mot-de-trop': 2, guetteur: 2, 'verre-de-trop': 2, hoquet: 2,
  } },
  // --- Les Halles ---
  { id: 'marius', name: 'Marius', avatar: '🥖', color: '#a8742a', level: 'habitue', deck: {
    josiane: 2, pilier: 2, videur: 1, 'tournee-patron': 2, 'ticket-caisse': 2, fermeture: 2, 'note-salee': 2, 'cafe-serre': 2, doyen: 1, 'table-reservee': 2, addition: 2,
  } },
  { id: 'huguette', name: 'Huguette', avatar: '🧶', color: '#2f7a6a', level: 'fine-fouine', deck: {
    'coup-coude': 2, 'mise-bouche': 2, 'coup-pouce': 2, 'calcul-mental': 2, domino: 2, 'reaction-chaine': 2, 'tant-qu-on-y-est': 1, 'petite-soeur': 1, 'retour-envoyeur': 2, 'compte-rond': 2, engrenage: 2,
  } },
  { id: 'jojo', name: 'Jojo', avatar: '🐀', color: '#4a5a3a', level: 'fine-fouine', deck: {
    leurre: 2, 'croche-patte': 2, 'main-sac': 1, fouine: 2, 'ardoise-piegee': 2, 'faux-421': 1, 'coup-nenette': 1, mouchard: 2, 'peau-banane': 2, complice: 1, 'pot-aux-roses': 2, 'flagrant-delit': 2,
  } },
  // --- Les Docks ---
  { id: 'albert', name: 'Capitaine Albert', avatar: '⚓', color: '#24506e', level: 'fine-fouine', deck: {
    'gueule-bois': 2, 'verre-de-trop': 2, 'croche-patte': 2, 'coup-etrier': 2, trinquer: 1, 'double-tournee': 1, miroir: 2, 'verre-offert': 2, 'pot-aux-roses': 2, 'yeux-piquent': 2, 'tournee-generale': 1, 'peau-banane': 1,
  } },
  { id: 'nadege', name: 'Nadège', avatar: '🦜', color: '#c0583a', level: 'habitue', deck: {
    josiane: 2, pilier: 1, fermeture: 2, 'tournee-patron': 2, 'note-salee': 1, 'efface-tout': 1, 'gueule-bois': 2, 'verre-de-trop': 2, 'coup-etrier': 2, 'tete-tourne': 2, 'verre-offert': 2, retrouvailles: 1,
  } },
  { id: 'gustave', name: 'Gustave', avatar: '🪝', color: '#5a5f6a', level: 'habitue', deck: {
    embuscade: 1, 'derniere-maille': 2, 'reaction-chaine': 2, 'coup-pouce': 2, 'retour-envoyeur': 2, 'calcul-mental': 2, 'croche-patte': 2, 'pot-aux-roses': 2, 'flagrant-delit': 1, ricochet: 2, 'compte-rond': 2,
  } },
  // --- La Haute ---
  { id: 'clemence', name: 'Baronne Clémence', avatar: '🎩', color: '#7b2350', level: 'fine-fouine', deck: {
    fermeture: 2, 'reaction-chaine': 2, 'coup-pouce': 2, 'retour-envoyeur': 2, domino: 2, 'calcul-mental': 2, 'derniere-maille': 2, 'ticket-caisse': 2, 'note-salee': 2, josiane: 1, retrouvailles: 1,
  } },
  { id: 'seraphin', name: 'Séraphin', avatar: '🎭', color: '#3d2a6a', level: 'fine-fouine', deck: {
    embuscade: 1, 'croche-patte': 2, 'pot-aux-roses': 2, 'flagrant-delit': 2, 'peau-banane': 2, 'ardoise-piegee': 2, 'reaction-chaine': 2, 'retour-envoyeur': 2, 'coup-pouce': 2, 'calcul-mental': 2, 'derniere-maille': 1,
  } },
  { id: 'auguste', name: 'Monsieur Auguste', avatar: '👑', color: '#8a6d2a', level: 'fine-fouine', deck: {
    'gueule-bois': 2, fermeture: 2, 'verre-de-trop': 2, 'double-tournee': 1, 'coup-etrier': 2, trinquer: 2, miroir: 2, 'verre-offert': 2, 'efface-tout': 1, 'table-reservee': 2, 'tournee-generale': 1, 'note-salee': 1,
  } },
];

export const CCF_CHAPTERS: CcfChapter[] = [
  { id: 'lilas', need: 0, title: 'ccf:lilas', capsules: 20, color: '#c46a3a' },
  { id: 'halles', need: 3, title: 'ccf:halles', capsules: 20, color: '#2f7a6a' },
  { id: 'docks', need: 8, title: 'ccf:docks', capsules: 25, color: '#24506e' },
  { id: 'haute', need: 14, title: 'ccf:haute', capsules: 35, color: '#8a6d2a' },
];

export const CCF_STAGES: CcfStage[] = [
  // La rue des Lilas : on se fait la main, contre des débutants.
  { id: 'guinguette', chapter: 'lilas', rivals: ['firmin'], stars: [{ k: 'lost', n: 2 }, { k: 'combo', n: 3 }] },
  { id: 'bar-amis', chapter: 'lilas', rivals: ['paulette'], stars: [{ k: 'rounds', n: 6 }, { k: 'lost', n: 1 }] },
  { id: 'tripot', chapter: 'lilas', rivals: ['rosine', 'firmin'], stars: [{ k: 'notrap' }, { k: 'lead', n: 10 }] },
  // Les Halles : un deck d'une seule famille par comptoir, des ordinateurs qui comptent.
  { id: 'cantine', chapter: 'halles', rivals: ['marius'], stars: [{ k: 'rounds', n: 6 }, { k: 'lost', n: 0 }] },
  { id: 'cave-jojo', chapter: 'halles', rivals: ['jojo'], stars: [{ k: 'rounds', n: 7 }, { k: 'notrap' }] },
  { id: 'fil-plomb', chapter: 'halles', rivals: ['huguette'], stars: [{ k: 'lost', n: 1 }, { k: 'traps', n: 1 }] },
  // Les Docks : on joue à plusieurs.
  { id: 'escale', chapter: 'docks', rivals: ['albert'], stars: [{ k: 'lost', n: 2 }, { k: 'notrap' }] },
  { id: 'taverne-quai', chapter: 'docks', rivals: ['nadege', 'marius'], stars: [{ k: 'lead', n: 9 }, { k: 'mono' }] },
  { id: 'hangar', chapter: 'docks', rivals: ['gustave', 'huguette', 'jojo'], stars: [{ k: 'lead', n: 6 }, { k: 'notrap' }] },
  // La Haute : les meilleurs decks, les meilleurs ordinateurs.
  { id: 'cercle-lustre', chapter: 'haute', rivals: ['clemence', 'albert'], stars: [{ k: 'rounds', n: 5 }, { k: 'combo', n: 3 }] },
  { id: 'bar-theatre', chapter: 'haute', rivals: ['seraphin', 'albert'], stars: [{ k: 'notrap' }, { k: 'mono' }] },
  { id: 'grand-comptoir', chapter: 'haute', rivals: ['auguste', 'clemence', 'seraphin'], stars: [{ k: 'rounds', n: 6 }, { k: 'combo', n: 3 }] },
];

/** Pièces par nouvelle étoile (gains volontairement bas, comme la Tournée des comptoirs). */
export const CCF_STAR_COINS = 5;
export const CCF_MAX_STARS = CCF_STAGES.length * 3;

export const ccfStage = (id: unknown): CcfStage | undefined => (typeof id === 'string' ? CCF_STAGES.find((s) => s.id === id) : undefined);
export const ccfRival = (id: string): CcfRival => CCF_RIVALS.find((r) => r.id === id)!;
export const ccfChapter = (id: string): CcfChapter => CCF_CHAPTERS.find((c) => c.id === id)!;
export const stagesOf = (chapter: string) => CCF_STAGES.filter((s) => s.chapter === chapter);
/** Le patron du comptoir (premier adversaire). */
export const ccfHost = (s: CcfStage): CcfRival => ccfRival(s.rivals[0]);
/** Joueurs à la table (le joueur compris) et jetons de départ (règle du moteur : 11 en duel, 9 à 3-4). */
export const ccfPlayers = (s: CcfStage) => s.rivals.length + 1;

const FAM_ORDER: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
/** Familles d'un deck (en nombre de cartes, de la plus fournie à la moins fournie). */
export function deckFamilies(cards: Record<string, number> | string[]): CardFamily[] {
  const per = new Map<CardFamily, number>();
  const list = Array.isArray(cards) ? cards.map((id) => [id, 1] as const) : Object.entries(cards);
  for (const [id, n] of list) {
    const f = CARDS.find((c) => c.id === id)?.family;
    if (f && n > 0) per.set(f, (per.get(f) ?? 0) + n);
  }
  return [...per].sort((a, b) => b[1] - a[1] || FAM_ORDER.indexOf(a[0]) - FAM_ORDER.indexOf(b[0])).map(([f]) => f);
}

/** Liste de 20 identifiants d'un deck (ordre du catalogue : le moteur mélange avec la graine). */
export const ccfDeckList = (cards: Record<string, number>) => CARDS.flatMap((c) => Array<string>(cards[c.id] ?? 0).fill(c.id));

/** Sièges des ordinateurs d'un comptoir (identiques côté serveur et côté appareil). */
export function ccfBots(s: CcfStage): BotMatchSetup['bots'] {
  return s.rivals.map((id, i) => {
    const r = ccfRival(id);
    return { id: i ? `ordi${i + 1}` : 'ordi', name: r.name, deck: ccfDeckList(r.deck), level: r.level };
  });
}

/** La table envoyée est-elle exactement celle du comptoir (noms, niveaux, decks, nombre) ? */
export function ccfTableMatches(s: CcfStage, bots: BotMatchSetup['bots']): boolean {
  const want = ccfBots(s);
  if (bots.length !== want.length) return false;
  return want.every((w, i) => {
    const b = bots[i];
    return b.id === w.id && b.name === w.name && b.level === w.level && [...b.deck].sort().join(',') === [...w.deck].sort().join(',');
  });
}

// ---------------------------------------------------------------------------------------------
// Progression : comptoir → étoiles (masque : bit 0 = 1re étoile, bit 1 = 2e, bit 2 = 3e)

export type CcfProgress = Record<string, number>;
export const starCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
export const ccfReputation = (p: CcfProgress | undefined) => Object.values(p ?? {}).reduce((n, m) => n + starCount(m), 0);
const won = (p: CcfProgress | undefined, id: string) => ((p?.[id] ?? 0) & 1) === 1;
export const chapterDone = (p: CcfProgress | undefined, chapter: string) => stagesOf(chapter).every((s) => won(p, s.id));
export const stageWon = won;

export function chapterUnlocked(p: CcfProgress | undefined, chapter: string): boolean {
  const i = CCF_CHAPTERS.findIndex((c) => c.id === chapter);
  if (i < 0) return false;
  if (i === 0) return true;
  return ccfReputation(p) >= CCF_CHAPTERS[i].need && chapterDone(p, CCF_CHAPTERS[i - 1].id);
}
/** Comptoir ouvert : son quartier est ouvert et le comptoir précédent du quartier est gagné. */
export function stageUnlocked(p: CcfProgress | undefined, id: string): boolean {
  const s = ccfStage(id);
  if (!s || !chapterUnlocked(p, s.chapter)) return false;
  const list = stagesOf(s.chapter);
  const i = list.indexOf(s);
  return i === 0 || won(p, list[i - 1].id);
}

/** Nettoie la progression lue d'un profil (comptoirs connus, masques 1 à 7 avec la victoire). */
export function cleanCcf(raw: unknown): CcfProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: CcfProgress = {};
  for (const s of CCF_STAGES) {
    const v = (raw as Record<string, unknown>)[s.id];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 7 && (v & 1)) out[s.id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
/** Reprise à l'inscription d'un invité : seulement le premier quartier (progression faite sans compte, modifiable). */
export function capCcfImport(p: CcfProgress | undefined): CcfProgress | undefined {
  if (!p) return undefined;
  // Premier chapitre seulement, et JAMAIS terminé à la reprise : la dernière étape du chapitre n'est pas reprise.
  // (Un profil d'invité n'est pas vérifiable : sinon un faux profil ferait verser titre, monnaie du mode et
  // déblocage du chapitre suivant à chaque nouveau compte.) Le joueur rejoue cette étape pour clore le chapitre.
  const stages = stagesOf(CCF_CHAPTERS[0].id).map((s) => s.id);
  const first = new Set(stages.slice(0, -1));
  return cleanCcf(Object.fromEntries(Object.entries(p).filter(([id]) => first.has(id))));
}

/** Résumé pour l'accueil (interface commune des campagnes). */
export function campaignSummary(profile: Profile): { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean } {
  const p = profile.ccf;
  const next = CCF_STAGES.find((s) => !won(p, s.id) && stageUnlocked(p, s.id)) ?? null;
  const done = CCF_STAGES.every((s) => won(p, s.id));
  return { stars: ccfReputation(p), maxStars: CCF_MAX_STARS, next: next ? { id: next.id, nameKey: `ccf.s.${next.id}` } : null, done };
}

// ---------------------------------------------------------------------------------------------
// Faits d'une partie rejouée, étoiles

export interface CcfFacts {
  won: boolean;
  rounds: number;
  /** Pièges adverses déclenchés contre le joueur (le Videur qui les met dehors ne compte pas). */
  trapsOnMe: number;
  /** Pièges du joueur déclenchés. */
  myTraps: number;
  /** Deck d'une seule famille. */
  mono: boolean;
  /** Jetons du moins chargé des adversaires à la fin. */
  minOppTokens: number;
  /** Manches perdues (le joueur avait la plus mauvaise combinaison). */
  lost: number;
  /** Plus grand nombre de cartes jouées (ou pièges posés) par le joueur dans une même manche. */
  maxCards: number;
}

/** Faits tirés de l'état final et des événements BRUTS d'une partie rejouée (replayBotMatch). */
export function ccfFacts(setup: BotMatchSetup, state: CfState, events: CfEvent[]): CcfFacts {
  const me = setup.me.id;
  let trapsOnMe = 0, myTraps = 0, lost = 0, maxCards = 0, cards = 0;
  for (const e of events) {
    if (e.kind === 'manche') cards = 0;
    else if ((e.kind === 'carte' || e.kind === 'pose') && e.player === me) maxCards = Math.max(maxCards, ++cards);
    else if (e.kind === 'comptes' && e.target === me) lost++;
    else if (e.kind === 'piege-revele') {
      if (e.player === me) myTraps++;
      else if (e.target === me) trapsOnMe++;
    }
  }
  const opp = state.players.filter((p) => p.id !== me).map((p) => p.tokens);
  return {
    won: state.phase === 'over' && state.winner === me,
    rounds: state.round, trapsOnMe, myTraps,
    mono: deckFamilies(setup.me.deck).length === 1,
    minOppTokens: opp.length ? Math.min(...opp) : 0,
    lost, maxCards,
  };
}

export function ccfStarMet(s: CcfStar, f: CcfFacts): boolean {
  switch (s.k) {
    case 'rounds': return f.rounds <= s.n;
    case 'notrap': return f.trapsOnMe === 0;
    case 'mono': return f.mono;
    case 'lead': return f.minOppTokens >= s.n;
    case 'traps': return f.myTraps >= s.n;
    case 'lost': return f.lost <= s.n;
    case 'combo': return f.maxCards >= s.n;
  }
}
/** Masque des étoiles d'une partie : rien sans victoire. */
export function ccfStarsOf(s: CcfStage, f: CcfFacts): number {
  if (!f.won) return 0;
  let m = 1;
  s.stars.forEach((x, i) => { if (ccfStarMet(x, f)) m |= 2 << i; });
  return m;
}

export interface CcfResult {
  stage: string;
  before: number;
  after: number;
  /** Étoiles nouvellement gagnées (1, 2, 3). */
  newStars: number[];
  coins: number;
  /** Quartier terminé à l'instant (titre donné ; capsules pour un compte, ajoutées par le serveur). */
  chapter?: string;
  title?: string;
  capsules?: number;
}

/**
 * Applique une partie de la campagne au profil : nouvelles étoiles seulement (jamais deux fois la même),
 * CCF_STAR_COINS pièces par nouvelle étoile, titre de quartier s'il est terminé et pas encore reçu.
 * `stageUnlocked` doit avoir été vérifié au début de la partie. Les capsules du quartier sont versées par
 * le serveur (comptes) d'après `result.chapter`.
 */
export function applyCcf(p: Profile, stageId: string, f: CcfFacts): { profile: Profile; result: CcfResult } {
  const s = ccfStage(stageId)!;
  const before = p.ccf?.[s.id] ?? 0;
  const mask = ccfStarsOf(s, f);
  const after = before | mask;
  const fresh = after & ~before;
  const newStars = [1, 2, 3].filter((n) => fresh & (1 << (n - 1)));
  const coins = newStars.length * CCF_STAR_COINS;
  let profile: Profile = { ...p, coins: p.coins + coins, ...(after ? { ccf: { ...(p.ccf ?? {}), [s.id]: after } } : {}) };
  const result: CcfResult = { stage: s.id, before, after, newStars, coins };
  // Quartier terminé (y compris repris d'un profil d'invité) : titre s'il manque. Les capsules suivent le titre :
  // une seule fois par compte (le titre ne se perd pas).
  for (const c of CCF_CHAPTERS) {
    if (!chapterDone(profile.ccf, c.id) || (profile.titles ?? []).includes(c.title)) continue;
    profile = { ...profile, titles: [...(profile.titles ?? []), c.title] };
    if (!result.chapter) Object.assign(result, { chapter: c.id, title: c.title, capsules: c.capsules });
  }
  return { profile, result };
}

/** Titres de quartier (français : traduits par shared/i18n/zones/campcf-server.ts). */
export const CCF_TITLES_FR: Record<string, string> = {
  lilas: 'Figure de la rue des Lilas',
  halles: 'Fine lame des Halles',
  docks: 'Terreur des Docks',
  haute: 'Maître des Coups Fourrés',
};
export const ccfTitleFr = (chapter: string): string | null => CCF_TITLES_FR[chapter] ?? null;
