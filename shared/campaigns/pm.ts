/**
 * « Les Arrière-salles » : la campagne solo du Poker menteur. Douze tables à battre, dans quatre
 * endroits où l'on bluffe au gobelet (l'arrière-boutique, le cabaret, le tripot des docks, le cercle
 * de minuit). Chaque table = une configuration du moteur existant (1 à 5 adversaires, 3 ou 5 vies,
 * avec ou sans suites) + des ordinateurs avec leur niveau ET leur style de bluff
 * (shared/pokermenteur/ai.ts : prudent, bluffeur, calculateur, imprévisible).
 *
 * Étoiles : 1re = gagner ; 2e et 3e = défis calculés UNIQUEMENT avec les faits du rejeu par le serveur
 * (shared/rejeu/poker.ts : vies perdues, bluffs démasqués, bluffs passés, adversaires éliminés).
 * Le serveur impose la table de l'étape au départ (`cpmSetup`), rejoue à la fin et attribue chaque
 * étoile une seule fois (server/camp-pm.ts). Invités : progression locale (rejeu sur l'appareil),
 * reprise plafonnée au premier chapitre à l'inscription (`capCpmImport`).
 * Textes : clés `cpm.` (shared/i18n/zones/camppm.*.ts) ; titres : camppm-server.ts.
 */
import type { PmLevel } from '../pokermenteur/engine';
import type { PmStyle } from '../pokermenteur/ai';
import type { FactsPm, SetupPm } from '../rejeu/poker';
import type { Profile } from '../progress/profile';

export const CAMPAIGN = { id: 'pm', game: 'pm', nameKey: 'cpm.name', maxStars: 36 } as const;

export type CpmStar =
  | { k: 'lives'; n: number } // gagner en perdant au plus n vies
  | { k: 'calls'; n: number } // gagner en démasquant au moins n bluffs (« Menteur ! » juste)
  | { k: 'bluffs'; n: number } // gagner en faisant passer au moins n bluffs
  | { k: 'ko'; n: number }; // gagner en éliminant vous-même au moins n adversaires

/** Personnage de la campagne (original). Répliques : `cpm.c.<id>.menteur|gagne|perd`, présentation `cpm.c.<id>`. */
export interface CpmChar { id: string; name: string; avatar: string; color: string; tempo: number; style: PmStyle }

export interface CpmStage {
  id: string;
  chapter: string;
  /** Hôte de la table (toujours le premier adversaire). */
  host: string;
  /** Adversaires dans l'ordre des sièges : personnages de la campagne ou habitués du Poker menteur. */
  opponents: { id: string; level: PmLevel; style?: PmStyle }[];
  lives: 3 | 5;
  noStraights: boolean;
  stars: [CpmStar, CpmStar];
  /** Ambiance 3D de la table : feutrine, bord, gobelet, fond, lampe. */
  look: CpmLook;
}
export interface CpmLook { felt: string; rim: string; cup: string; bg: string; lamp: string }

export interface CpmChapter {
  id: string;
  /** Étoiles nécessaires, en plus du chapitre précédent terminé. */
  need: number;
  /** Titre gagné en terminant le chapitre (toutes ses tables gagnées). */
  title: string;
  color: string;
  icon: string;
}

export const CPM_CHARS: CpmChar[] = [
  { id: 'cpm-marius', name: 'Marius', avatar: '🧺', color: '#c9894a', tempo: 1300, style: 'prudent' },
  { id: 'cpm-nini', name: 'Nini', avatar: '💄', color: '#e05a7a', tempo: 900, style: 'bluffeur' },
  { id: 'cpm-leon', name: 'Léon', avatar: '🧮', color: '#5f8fb8', tempo: 1500, style: 'calculateur' },
  { id: 'cpm-zaza', name: 'Zaza', avatar: '🎭', color: '#b05ad0', tempo: 800, style: 'imprevisible' },
  { id: 'cpm-gaspard', name: 'Gaspard', avatar: '🎩', color: '#d4a63a', tempo: 1000, style: 'bluffeur' },
  { id: 'cpm-colette', name: 'Colette', avatar: '🪶', color: '#7fb08a', tempo: 1400, style: 'calculateur' },
  { id: 'cpm-tonin', name: 'Tonin', avatar: '⚓', color: '#4c7da0', tempo: 1300, style: 'prudent' },
  { id: 'cpm-mado', name: 'Mado', avatar: '🦜', color: '#e07a3a', tempo: 900, style: 'imprevisible' },
  { id: 'cpm-ange', name: 'Ange', avatar: '🃏', color: '#c84a4a', tempo: 1000, style: 'bluffeur' },
  { id: 'cpm-baronne', name: 'La Baronne', avatar: '💎', color: '#9a6ad8', tempo: 1500, style: 'calculateur' },
  { id: 'cpm-silas', name: 'Silas', avatar: '🕯️', color: '#8a8f9a', tempo: 1600, style: 'prudent' },
  { id: 'cpm-minuit', name: 'Monsieur Minuit', avatar: '🌙', color: '#3a4f9a', tempo: 1200, style: 'imprevisible' },
];

export const CPM_CHAPTERS: CpmChapter[] = [
  { id: 'arriere', need: 0, title: 'cpm:arriere', color: '#b0703a', icon: '🕯️' },
  { id: 'cabaret', need: 3, title: 'cpm:cabaret', color: '#b04a7a', icon: '🎭' },
  { id: 'docks', need: 8, title: 'cpm:docks', color: '#3f7a9a', icon: '⚓' },
  { id: 'cercle', need: 14, title: 'cpm:cercle', color: '#6a4ab0', icon: '🌙' },
];

const C = (id: string): { id: string; level: PmLevel; style: PmStyle } => {
  const c = CPM_CHARS.find((x) => x.id === `cpm-${id}`)!;
  return { id: c.id, level: 'debutant', style: c.style };
};
const at = (o: { id: string; level: PmLevel; style?: PmStyle }, level: PmLevel) => ({ ...o, level });

export const CPM_STAGES: CpmStage[] = [
  // --- L'arrière-boutique : on apprend à lire un gobelet ---
  { id: 'cave', chapter: 'arriere', host: 'cpm-marius', opponents: [at(C('marius'), 'debutant')], lives: 3, noStraights: false,
    stars: [{ k: 'lives', n: 1 }, { k: 'calls', n: 1 }], look: { felt: '#2d5a3a', rim: '#6b4a2a', cup: '#5a3a1e', bg: '#120c07', lamp: '#ffd08a' } },
  { id: 'reserve', chapter: 'arriere', host: 'cpm-nini', opponents: [at(C('nini'), 'debutant'), { id: 'gege', level: 'debutant' }], lives: 3, noStraights: false,
    stars: [{ k: 'calls', n: 2 }, { k: 'bluffs', n: 2 }], look: { felt: '#5a2a3a', rim: '#4a2a1a', cup: '#6a2a2a', bg: '#140a0c', lamp: '#ffb08a' } },
  { id: 'cuisine', chapter: 'arriere', host: 'cpm-leon', opponents: [at(C('leon'), 'debutant')], lives: 3, noStraights: false,
    stars: [{ k: 'lives', n: 1 }, { k: 'bluffs', n: 2 }], look: { felt: '#3a4a5a', rim: '#5a5a5a', cup: '#3a2a1a', bg: '#0c0e12', lamp: '#fff0c8' } },
  // --- Le cabaret des Lanternes : on bluffe en musique ---
  { id: 'loge', chapter: 'cabaret', host: 'cpm-gaspard', opponents: [at(C('gaspard'), 'habitue'), { id: 'josy', level: 'debutant' }, { id: 'bebert', level: 'debutant' }], lives: 3, noStraights: false,
    stars: [{ k: 'calls', n: 3 }, { k: 'ko', n: 2 }], look: { felt: '#6a1a22', rim: '#c8a04a', cup: '#4a1a1a', bg: '#120608', lamp: '#ffd26a' } },
  { id: 'coulisses', chapter: 'cabaret', host: 'cpm-zaza', opponents: [at(C('zaza'), 'fouine'), { id: 'lulu', level: 'debutant' }], lives: 3, noStraights: false,
    stars: [{ k: 'calls', n: 2 }, { k: 'lives', n: 1 }], look: { felt: '#4a1f4a', rim: '#2a1a2a', cup: '#7a2a5a', bg: '#100810', lamp: '#ff9ad8' } },
  { id: 'scene', chapter: 'cabaret', host: 'cpm-colette', opponents: [at(C('colette'), 'habitue'), { id: 'raymond', level: 'debutant' }], lives: 3, noStraights: true,
    stars: [{ k: 'bluffs', n: 3 }, { k: 'lives', n: 1 }], look: { felt: '#1f3a5a', rim: '#c0c0c8', cup: '#2a2a3a', bg: '#06080e', lamp: '#bfe0ff' } },
  // --- Le tripot des docks : sans suites, à la dure ---
  { id: 'hangar', chapter: 'docks', host: 'cpm-tonin', opponents: [at(C('tonin'), 'habitue'), { id: 'bebert', level: 'habitue' }, { id: 'gege', level: 'debutant' }], lives: 5, noStraights: true,
    stars: [{ k: 'lives', n: 3 }, { k: 'calls', n: 3 }], look: { felt: '#2a3a3a', rim: '#3a2a1a', cup: '#4a3a2a', bg: '#080c0c', lamp: '#ffe0a0' } },
  { id: 'cale', chapter: 'docks', host: 'cpm-mado', opponents: [at(C('mado'), 'fouine'), { id: 'josy', level: 'habitue' }], lives: 3, noStraights: true,
    stars: [{ k: 'bluffs', n: 3 }, { k: 'lives', n: 1 }], look: { felt: '#3a2a1a', rim: '#2a1a0a', cup: '#6a4a2a', bg: '#0a0704', lamp: '#ffc070' } },
  { id: 'phare', chapter: 'docks', host: 'cpm-ange', opponents: [at(C('ange'), 'fouine'), { id: 'raymond', level: 'debutant' }, { id: 'lulu', level: 'debutant' }, { id: 'gege', level: 'habitue' }], lives: 3, noStraights: false,
    stars: [{ k: 'ko', n: 2 }, { k: 'calls', n: 2 }], look: { felt: '#1a3a4a', rim: '#d0d0d0', cup: '#2a3a4a', bg: '#04080c', lamp: '#fff4c0' } },
  // --- Le cercle de minuit : la cour des grands ---
  { id: 'salon', chapter: 'cercle', host: 'cpm-baronne', opponents: [at(C('baronne'), 'fouine'), { id: 'fernand', level: 'habitue' }, at(C('colette'), 'debutant')], lives: 3, noStraights: false,
    stars: [{ k: 'lives', n: 1 }, { k: 'bluffs', n: 4 }], look: { felt: '#5a1a2a', rim: '#d4b05a', cup: '#3a1a1a', bg: '#0e0406', lamp: '#ffd890' } },
  { id: 'fumoir', chapter: 'cercle', host: 'cpm-silas', opponents: [at(C('silas'), 'fouine'), at(C('leon'), 'fouine'), { id: 'josy', level: 'habitue' }, at(C('nini'), 'habitue')], lives: 5, noStraights: true,
    stars: [{ k: 'calls', n: 5 }, { k: 'ko', n: 3 }], look: { felt: '#2a2a22', rim: '#5a4a3a', cup: '#4a3a2a', bg: '#08080a', lamp: '#e8c890' } },
  { id: 'minuit', chapter: 'cercle', host: 'cpm-minuit', opponents: [at(C('minuit'), 'fouine'), at(C('baronne'), 'habitue'), at(C('ange'), 'habitue'), { id: 'fernand', level: 'habitue' }, at(C('gaspard'), 'habitue')], lives: 3, noStraights: false,
    stars: [{ k: 'ko', n: 3 }, { k: 'lives', n: 1 }], look: { felt: '#141a3a', rim: '#a0a8c8', cup: '#1a1a2a', bg: '#03040a', lamp: '#c8d0ff' } },
];

/** Pièces par nouvelle étoile (gains volontairement bas, comme la Tournée des comptoirs). */
export const CPM_STAR_COINS = 5;
export const CPM_MAX_STARS = CPM_STAGES.length * 3;

export const cpmStage = (id: unknown): CpmStage | undefined => (typeof id === 'string' ? CPM_STAGES.find((s) => s.id === id) : undefined);
export const cpmChar = (id: string): CpmChar | undefined => CPM_CHARS.find((c) => c.id === id);
export const cpmChapter = (id: string): CpmChapter => CPM_CHAPTERS.find((c) => c.id === id)!;
export const stagesOf = (chapter: string) => CPM_STAGES.filter((s) => s.chapter === chapter);

const LEVEL_ORDER: PmLevel[] = ['debutant', 'habitue', 'fouine'];
/**
 * Table de l'étape pour le moteur et le rejeu. `start` : siège de celui qui commence (tiré par le
 * téléphone avant la graine, comme une partie libre). `level` = le niveau le plus facile de la table
 * (barème de la récompense : jamais plus que ce qu'une partie libre équivalente rapporterait).
 */
export function cpmSetup(st: CpmStage, start: number): SetupPm {
  const levels = st.opponents.map((o) => o.level);
  const easiest = LEVEL_ORDER.find((l) => levels.includes(l))!;
  const s = Number.isInteger(start) && start >= 0 && start <= st.opponents.length ? start : 0;
  return {
    level: easiest, lives: st.lives, noStraights: st.noStraights, bots: st.opponents.map((o) => o.id), start: s,
    levels, styles: st.opponents.map((o) => o.style ?? null),
  };
}

// ---------------------------------------------------------------------------------------------
// Progression : étape → étoiles (masque : bit 0 = 1re étoile, bit 1 = 2e, bit 2 = 3e)

export type CpmProgress = Record<string, number>;
export const starCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
export const cpmStars = (p: CpmProgress | undefined) => Object.values(p ?? {}).reduce((n, m) => n + starCount(m), 0);
const won = (p: CpmProgress | undefined, id: string) => ((p?.[id] ?? 0) & 1) === 1;
export const chapterDone = (p: CpmProgress | undefined, chapter: string) => stagesOf(chapter).every((s) => won(p, s.id));

export function chapterUnlocked(p: CpmProgress | undefined, chapter: string): boolean {
  const i = CPM_CHAPTERS.findIndex((c) => c.id === chapter);
  if (i < 0) return false;
  if (i === 0) return true;
  return cpmStars(p) >= CPM_CHAPTERS[i].need && chapterDone(p, CPM_CHAPTERS[i - 1].id);
}
export function stageUnlocked(p: CpmProgress | undefined, id: string): boolean {
  const st = cpmStage(id);
  if (!st || !chapterUnlocked(p, st.chapter)) return false;
  const list = stagesOf(st.chapter);
  const i = list.indexOf(st);
  return i === 0 || won(p, list[i - 1].id);
}

/** Nettoie la progression lue d'un profil (étapes connues, masques 1 à 7 avec la victoire). */
export function cleanCpm(raw: unknown): CpmProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: CpmProgress = {};
  for (const st of CPM_STAGES) {
    const v = (raw as Record<string, unknown>)[st.id];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 7 && v & 1) out[st.id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
/** Reprise à l'inscription d'un invité : seulement le premier chapitre (progression faite sans compte, modifiable). */
export function capCpmImport(p: CpmProgress | undefined): CpmProgress | undefined {
  if (!p) return undefined;
  const first = new Set(stagesOf(CPM_CHAPTERS[0].id).map((s) => s.id));
  return cleanCpm(Object.fromEntries(Object.entries(p).filter(([id]) => first.has(id))));
}

// ---------------------------------------------------------------------------------------------
// Fin de partie : étoiles gagnées (faits du rejeu seulement)

export type CpmFacts = Pick<FactsPm, 'won' | 'place' | 'callsRight' | 'bluffsPassed' | 'livesLost' | 'knockouts'>;

export function starMet(s: CpmStar, f: CpmFacts): boolean {
  switch (s.k) {
    case 'lives': return f.livesLost <= s.n;
    case 'calls': return f.callsRight >= s.n;
    case 'bluffs': return f.bluffsPassed >= s.n;
    case 'ko': return f.knockouts >= s.n;
  }
}
export function starsOf(st: CpmStage, f: CpmFacts): number {
  if (!f.won || f.place !== 1) return 0;
  let m = 1;
  st.stars.forEach((s, i) => { if (starMet(s, f)) m |= 2 << i; });
  return m;
}

export interface CpmResult {
  stage: string;
  before: number;
  after: number;
  newStars: number[];
  coins: number;
  chapter?: string;
  title?: string;
}

/**
 * Applique une partie au profil : nouvelles étoiles seulement (jamais deux fois la même), CPM_STAR_COINS
 * pièces par nouvelle étoile, titre du chapitre terminé s'il manque. `stageUnlocked` a été vérifié au départ.
 */
export function applyCpm(p: Profile, stageId: string, f: CpmFacts): { profile: Profile; result: CpmResult } {
  const st = cpmStage(stageId)!;
  const before = p.cpm?.[st.id] ?? 0;
  const after = before | starsOf(st, f);
  const fresh = after & ~before;
  const newStars = [1, 2, 3].filter((n) => fresh & (1 << (n - 1)));
  const coins = newStars.length * CPM_STAR_COINS;
  let profile: Profile = { ...p, coins: p.coins + coins, ...(after ? { cpm: { ...(p.cpm ?? {}), [st.id]: after } } : {}) };
  const result: CpmResult = { stage: st.id, before, after, newStars, coins };
  // Tout chapitre terminé (y compris repris d'un profil d'invité) reçoit son titre s'il manque.
  for (const c of CPM_CHAPTERS) {
    if (!chapterDone(profile.cpm, c.id) || (profile.titles ?? []).includes(c.title)) continue;
    profile = { ...profile, titles: [...(profile.titles ?? []), c.title] };
    if (!result.chapter) Object.assign(result, { chapter: c.id, title: c.title });
  }
  return { profile, result };
}

/** Titres de chapitre (français : traduits par shared/i18n/zones/camppm-server.ts). */
export const CPM_TITLES_FR: Record<string, string> = {
  arriere: 'Habitué des arrière-salles', cabaret: 'Bluffeur de cabaret', docks: 'Loup des docks', cercle: 'Maître du gobelet',
};
export const cpmTitleFr = (chapter: string): string | null => CPM_TITLES_FR[chapter] ?? null;

// ---------------------------------------------------------------------------------------------
// Interface commune des campagnes (accueil)

export function campaignSummary(profile: Profile): { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean } {
  const p = profile.cpm;
  const next = CPM_STAGES.find((s) => stageUnlocked(p, s.id) && !won(p, s.id))
    ?? CPM_STAGES.find((s) => stageUnlocked(p, s.id) && starCount(p?.[s.id] ?? 0) < 3) ?? null;
  return {
    stars: cpmStars(p), maxStars: CPM_MAX_STARS,
    next: next ? { id: next.id, nameKey: `cpm.s.${next.id}` } : null,
    done: CPM_STAGES.every((s) => won(p, s.id)),
  };
}
