/**
 * Les bistrots entre amis : petits clubs privés (comptes seulement) avec leur classement de la semaine.
 * Règles communes au client et au serveur (le serveur fait foi : il recalcule tout).
 *
 *  - Points : seulement les parties vérifiées par le serveur (421, Courtisan et Coups Fourrés en ligne,
 *    tournois, défis entre amis), entre au moins deux comptes. Le solo annoncé par le téléphone ne compte pas.
 *  - Barème : 1 point par partie jouée jusqu'au bout, +2 pour une victoire, +3 pour un tournoi gagné.
 *  - Anti-abus : les parties entre deux mêmes joueurs ne comptent que PAIR_DAILY_CAP fois par jour ;
 *    une partie abandonnée ne rapporte rien.
 *  - Chaque lundi (heure de Bruxelles) : le champion de la semaine passée est annoncé dans chaque bistrot.
 */
import { nameSkeleton } from './names';

export const BISTROT_MAX_MEMBERS = 30;
/** Bistrots dont un joueur peut être membre en même temps. */
export const BISTROTS_PER_PLAYER = 3;
export const BISTROT_NAME_MIN = 3;
export const BISTROT_NAME_MAX = 24;
/** Bistrots qu'un joueur peut ouvrir par 24 h (contre les ouvertures / fermetures à la chaîne). */
export const BISTROT_CREATES_PER_DAY = 3;

export const POINTS_PLAY = 1;
export const POINTS_WIN = 2;
export const POINTS_TOURNEY = 3;
/** Parties qui comptent par jour entre deux mêmes joueurs. */
export const PAIR_DAILY_CAP = 4;
/** Tournois gagnés qui comptent par jour et par joueur. */
export const TOURNEY_DAILY_CAP = 2;
/** Récompense du champion de la semaine (gains volontairement bas). */
export const CHAMPION_COINS = 10;
/** Membres ayant marqué des points dans la semaine pour que la récompense soit versée (contre les faux comptes). */
export const CHAMPION_MIN_ACTIVE = 3;

/** Réactions rapides sur le mur (une par joueur et par annonce). */
export const BISTROT_REACTIONS = ['👏', '🍺', '😂', '🔥', '😱'] as const;
export const isBistrotReaction = (v: unknown): v is string => typeof v === 'string' && (BISTROT_REACTIONS as readonly string[]).includes(v);

/** Code d'invitation (lien `/?bistrot=CODE`). */
export const BISTROT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const BISTROT_CODE_LEN = 6;
export const cleanBistrotCode = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const c = v.trim().toUpperCase();
  return c.length === BISTROT_CODE_LEN && [...c].every((ch) => BISTROT_CODE_ALPHABET.includes(ch)) ? c : null;
};

export type BistrotGame = '421' | 'courtisan' | 'cf' | 'duel' | 'poker';

/** Annonce du mur (le client l'écrit dans la langue du joueur). */
export type WallKind = 'ouvert' | 'recrue' | 'depart' | 'retire' | 'victoire' | 'coup' | 'tournoi' | 'champion' | 'patron';

// --- Nom du bistrot : alphabet des pseudos (lettres latines), espaces et apostrophes en plus -----------
const NAME = /^[A-Za-z0-9À-ÖØ-öø-ÿĀ-İĲ-ķĹ-ľŁ-ňŊ-ž][A-Za-z0-9À-ÖØ-öø-ÿĀ-İĲ-ķĹ-ľŁ-ňŊ-ž '’.,&!-]*$/;

/**
 * Mots grossiers (fr, en, de, nl). `word` : seulement un mot entier (trop courts ou trop communs
 * à l'intérieur d'autres mots), sinon cherchés dans chaque mot et dans le nom collé.
 */
const BAD_INSIDE = ['merde', 'putain', 'salope', 'connard', 'connasse', 'encul', 'batard', 'nazi', 'hitler', 'fuck', 'shit', 'bitch', 'nigg',
  'pussy', 'whore', 'asshole', 'porn', 'scheiss', 'fotze', 'wichser', 'arschloch', 'klootzak', 'kanker', 'mongool', 'negro', 'tapette', 'pedale', 'couille'];
const BAD_WORD = ['con', 'cons', 'cul', 'pd', 'fdp', 'ntm', 'pute', 'putes', 'bite', 'nique', 'niquer', 'cunt', 'fag', 'dick', 'slut', 'sex', 'sexe',
  'hure', 'kut', 'lul', 'hoer', 'tering', 'neger', 'anal', 'xxx'];
/** Noms qui imiteraient l'équipe du jeu. */
const RESERVED = ['admin', 'moderat', 'moderation', '421online', 'officiel', 'official', 'staff'];
const SK_INSIDE = BAD_INSIDE.map(nameSkeleton), SK_WORD = BAD_WORD.map(nameSkeleton), SK_RES = RESERVED.map(nameSkeleton);

/** Nom nettoyé : espaces en trop retirés. */
export const tidyBistrotName = (v: unknown): string => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');

/** Problème d'un nom de bistrot (texte du serveur, en français), ou null s'il est accepté. */
export function bistrotNameProblem(raw: string): string | null {
  const name = tidyBistrotName(raw);
  if (name.length < BISTROT_NAME_MIN || name.length > BISTROT_NAME_MAX || !NAME.test(name)) {
    return `Nom du bistrot : ${BISTROT_NAME_MIN} à ${BISTROT_NAME_MAX} caractères (lettres latines, chiffres, espaces, apostrophes).`;
  }
  // Lettres isolées (« F.U.C.K ») recollées en un mot.
  const words = name.split(/[\s'’.,&!-]+/).filter(Boolean).map(nameSkeleton)
    .reduce<string[]>((acc, w, i, all) => (w.length === 1 && i > 0 && all[i - 1].length === 1 ? [...acc.slice(0, -1), acc[acc.length - 1] + w] : [...acc, w]), []);
  const whole = nameSkeleton(name);
  const bad = words.some((w) => SK_WORD.includes(w) || SK_INSIDE.some((b) => w.includes(b)))
    || SK_INSIDE.some((b) => b.length >= 6 && whole.includes(b));
  if (bad) return 'Ce nom de bistrot n’est pas accepté : choisissez-en un autre.';
  if (SK_RES.some((r) => whole.includes(r))) return 'Ce nom est réservé, choisissez-en un autre.';
  return null;
}

/** Points d'une partie pour un joueur (avant le plafond entre mêmes joueurs). */
export const gamePoints = (won: boolean) => POINTS_PLAY + (won ? POINTS_WIN : 0);

/** Classement : points, puis victoires, puis le moins de parties, puis le pseudo (ordre stable). */
export function rankRows<T extends { points: number; wins: number; games: number; username: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || a.games - b.games || a.username.localeCompare(b.username));
}
