/**
 * Pseudos : validation à l'inscription (alphabet latin seulement, pas de nom réservé) et noms à table.
 * Les comptes déjà créés ne sont jamais touchés : seules les nouvelles inscriptions sont filtrées.
 */
import { BOT_NAMES } from './bot-names';

/** Lettres latines (accents compris), chiffres, _ . - ; exclut les lettres faciles à confondre (ı, ſ, ĸ, ŀ, ŉ). */
const USERNAME = /^[A-Za-z0-9_.\-À-ÖØ-öø-ÿĀ-İĲ-ķĹ-ľŁ-ňŊ-ž]{3,20}$/;

const LOOKALIKE: Record<string, string> = {
  ł: 'l', đ: 'd', ø: 'o', ħ: 'h', ß: 'ss', æ: 'ae', œ: 'oe', ŧ: 't', ŋ: 'n',
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', i: 'l', '|': 'l',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'l', ј: 'j', ѕ: 's', к: 'k', м: 'm', т: 't', в: 'b', н: 'h', л: 'l',
  α: 'a', β: 'b', ε: 'e', ι: 'l', κ: 'k', μ: 'm', ν: 'v', ο: 'o', ρ: 'p', σ: 's', ς: 's', τ: 't', υ: 'u', χ: 'x',
};

/** Forme réduite d'un nom : sans accents, séparateurs ni caractères invisibles, sosies ramenés à une même lettre. */
export function nameSkeleton(name: string): string {
  const s = name.normalize('NFKD').replace(/[\p{M}\p{Cf}\s_.'’-]/gu, '').toLowerCase();
  return [...s].map((c) => LOOKALIKE[c] ?? c).join('');
}

const sameAs = (name: string, list: readonly string[]) => {
  const sk = nameSkeleton(name);
  return list.some((x) => nameSkeleton(x) === sk);
};

/** Pseudos administrateurs : liste fournie, sinon variable d'environnement ADMIN_USERS. */
export function adminNameList(list?: string[]): string[] {
  return (list ?? (process.env.ADMIN_USERS ?? '').split(',')).map((s) => s.trim()).filter(Boolean);
}

/** Problème d'un pseudo à l'inscription, ou null s'il est accepté. */
export function usernameProblem(name: string, admins: readonly string[]): string | null {
  if (!USERNAME.test(name)) return 'Pseudo : 3 à 20 caractères (lettres latines, chiffres, _ . -).';
  if (sameAs(name, BOT_NAMES) || sameAs(name, admins)) return 'Ce pseudo est réservé, choisissez-en un autre.';
  return null;
}

/** Nom à table : un compte joue toujours sous son pseudo ; un invité ne peut pas prendre celui d'un administrateur. */
export function tableName(user: { username: string } | undefined, cleaned: string | null, admins: readonly string[]): { name: string } | { error: string } {
  if (user) return { name: user.username };
  if (!cleaned) return { error: 'Choisissez un nom' };
  if (sameAs(cleaned, admins)) return { error: 'Ce nom est réservé, choisissez-en un autre.' };
  return { name: cleaned };
}

/** Invité portant le nom d'un ordinateur assis à la table : il est distingué, pour ne pas s'y confondre. */
export function avoidBotName(name: string, bots: readonly string[]): string {
  return sameAs(name, bots) ? `${name.slice(0, 11).trim()} (invité)` : name;
}

/** Nom d'un invité là où un refus ne s'impose pas (spectateur) : ignoré s'il imite un administrateur. */
export function guestLabel(cleaned: string | null, admins: readonly string[]): string | null {
  return cleaned && !sameAs(cleaned, admins) ? cleaned : null;
}
