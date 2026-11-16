/**
 * La Route des Auberges : la campagne solo du Courtisan (Dix mille). Douze auberges et tavernes d'un pays
 * imaginaire, rangées en quatre étapes de route (chapitres), du village à la grande ville.
 * Chaque auberge = une table du moteur EXISTANT (objectif 2 000 / 4 000 / 10 000, 1 à 3 ordinateurs, niveau
 * de chacun, seuil d'ouverture éventuel : `entry`, seule « règle maison » ajoutée au moteur) et trois étoiles :
 *  - 1re étoile : gagner ;
 *  - 2e et 3e : gagner en remplissant une condition lisible, calculée UNIQUEMENT à partir des faits que le
 *    serveur obtient en rejouant la partie (shared/rejeu/dixmille.ts : ratés, meilleur tour, tours joués,
 *    mains pleines, six dés d'un coup, score du meilleur adversaire).
 * Le serveur impose la table de l'étape au départ (server/camp-dm.ts), rejoue à la fin et attribue chaque
 * étoile une seule fois. Les invités gardent leur progression sur l'appareil (reprise plafonnée au 1er chapitre).
 * Récompenses basses : 5 pièces par nouvelle étoile ; fin de chapitre : un titre (jamais en vente) et
 * 25 Groschen une seule fois par compte (comptes seulement, voir CDM_CHAPTER_GROSCHEN).
 * Textes : clés `cdm.` (shared/i18n/zones/campdm.*.ts) ; titres : campdm-server.ts.
 */
import type { DmLevel } from '../dixmille/engine';
import type { FactsDm, SetupDm } from '../rejeu/dixmille';
import type { Profile } from '../progress/profile';

export type CdmStar =
  | { k: 'misses'; n: number } // gagner avec au plus n « Raté ! » (0 = sans raté)
  | { k: 'turn'; n: number } // gagner en encaissant un tour d'au moins n points
  | { k: 'turns'; n: number } // gagner en n tours au plus
  | { k: 'hot' } // gagner en faisant au moins une main pleine
  | { k: 'shut'; n: number }; // gagner sans qu'aucun adversaire n'atteigne n points

/** Gens de la route : aubergistes et joueurs de dés (originaux). Phrases : clés `cdm.p.<id>.*`. */
export interface CdmFolk { id: string; name: string; avatar: string; color: string; tempo: number; dice: string }

export const CDM_FOLK: CdmFolk[] = [
  { id: 'gertrude', name: 'Mère Gertrude', avatar: '👵', color: '#b5653a', tempo: 1300, dice: 'dc-brique' },
  { id: 'jacquot', name: 'Jacquot', avatar: '🥾', color: '#6f8f3a', tempo: 900, dice: 'dc-chene' },
  { id: 'colin', name: 'Colin le passeur', avatar: '🛶', color: '#2f6f9a', tempo: 1000, dice: 'dc-tortue' },
  { id: 'anselme', name: 'Maître Anselme', avatar: '🐴', color: '#8a6d2a', tempo: 1200, dice: 'dc-moutarde' },
  { id: 'tiphaine', name: 'Tiphaine', avatar: '🪕', color: '#b03a6a', tempo: 800, dice: 'dc-corail' },
  { id: 'ysabeau', name: 'Dame Ysabeau', avatar: '🍇', color: '#7a2f5a', tempo: 1200, dice: 'dc-lavande' },
  { id: 'benigne', name: 'Frère Bénigne', avatar: '📿', color: '#5a4a3a', tempo: 1500, dice: 'dc-nacre' },
  { id: 'rufine', name: 'Rufine', avatar: '🐈‍⬛', color: '#c0583a', tempo: 700, dice: 'dc-grenat' },
  { id: 'gontran', name: 'Gontran', avatar: '🔨', color: '#4a4a52', tempo: 1100, dice: 'dc-chene' },
  { id: 'godefroy', name: 'Maître Godefroy', avatar: '🧵', color: '#2f7a6a', tempo: 1100, dice: 'dc-givre' },
  { id: 'barnabe', name: 'Sergent Barnabé', avatar: '🛡️', color: '#3d5a80', tempo: 1000, dice: 'dc-tortue' },
  { id: 'mathurin', name: 'Mathurin', avatar: '🍺', color: '#c9902a', tempo: 900, dice: 'dc-moutarde' },
  { id: 'heloise', name: 'Dame Héloïse', avatar: '🦁', color: '#a8452f', tempo: 1200, dice: 'dc-grenat' },
  { id: 'aymeric', name: 'Le prévôt Aymeric', avatar: '⚖️', color: '#1f3d5c', tempo: 1300, dice: 'dc-givre' },
  { id: 'blanche', name: 'La comtesse Blanche', avatar: '👑', color: '#7b2350', tempo: 1200, dice: 'dc-galaxie' },
];

export interface CdmStage {
  id: string;
  chapter: string;
  /** Aubergiste (toujours le premier adversaire). */
  host: string;
  /** Adversaires dans l'ordre des sièges : l'aubergiste d'abord. */
  opponents: { folk: string; level: DmLevel }[];
  target: 2000 | 4000 | 10000;
  /** Seuil d'ouverture (règle maison) : 300, 500 ou 1 000. */
  entry?: number;
  stars: [CdmStar, CdmStar];
  /** Ambiance 3D de la table (objets du catalogue, prêtés le temps de la partie). */
  look: { decor: string; felt: string; rim: string };
}

export interface CdmChapter {
  id: string;
  /** Étoiles nécessaires, en plus du chapitre précédent terminé. */
  need: number;
  /** Titre gagné à la fin du chapitre (tous ses lieux gagnés). */
  title: string;
  color: string;
  /** Emblème de la carte. */
  icon: string;
}

export const CDM_CHAPTERS: CdmChapter[] = [
  { id: 'val', need: 0, title: 'cdm:val', color: '#6f8f3a', icon: '🌾' },
  { id: 'coteaux', need: 4, title: 'cdm:coteaux', color: '#8a3a5a', icon: '🍇' },
  { id: 'route', need: 10, title: 'cdm:route', color: '#b07a2a', icon: '🐎' },
  { id: 'cite', need: 17, title: 'cdm:cite', color: '#3d4f8a', icon: '🏰' },
];

const L = (decor: string, felt: string, rim: string) => ({ decor, felt, rim });

export const CDM_STAGES: CdmStage[] = [
  // --- Le Val des Moulins : on apprend à encaisser ---
  { id: 'moulin', chapter: 'val', host: 'gertrude', opponents: [{ folk: 'gertrude', level: 'debutant' }], target: 2000,
    stars: [{ k: 'turn', n: 1000 }, { k: 'misses', n: 0 }], look: L('decor-chalet', 'felt-sable', 'rim-chene') },
  { id: 'gue', chapter: 'val', host: 'colin', opponents: [{ folk: 'colin', level: 'debutant' }], target: 4000, entry: 300,
    stars: [{ k: 'turns', n: 6 }, { k: 'hot' }], look: L('decor-taverne', 'felt-vert', 'rim-noyer') },
  { id: 'relais', chapter: 'val', host: 'anselme', opponents: [{ folk: 'anselme', level: 'habitue' }], target: 2000,
    stars: [{ k: 'shut', n: 1000 }, { k: 'turn', n: 1000 }], look: L('decor-pub', 'felt-tartan', 'rim-cognac') },
  // --- Les Coteaux : les vignerons ouvrent leurs caves ---
  { id: 'pressoir', chapter: 'coteaux', host: 'ysabeau', opponents: [{ folk: 'ysabeau', level: 'habitue' }], target: 4000, entry: 500,
    stars: [{ k: 'turn', n: 1500 }, { k: 'misses', n: 1 }], look: L('decor-taverne', 'felt-bordeaux', 'rim-cognac') },
  { id: 'abbaye', chapter: 'coteaux', host: 'benigne', opponents: [{ folk: 'benigne', level: 'fouine' }], target: 2000,
    stars: [{ k: 'turns', n: 3 }, { k: 'shut', n: 1000 }], look: L('decor-chalet', 'felt-damier', 'rim-ebene') },
  { id: 'chat-borgne', chapter: 'coteaux', host: 'rufine', opponents: [{ folk: 'rufine', level: 'fouine' }], target: 4000, entry: 500,
    stars: [{ k: 'misses', n: 0 }, { k: 'shut', n: 2500 }], look: L('decor-nuit', 'felt-noir', 'rim-cuir-noir') },
  // --- La Grand-Route marchande : foires et relais de marchands ---
  { id: 'foire', chapter: 'route', host: 'godefroy', opponents: [{ folk: 'godefroy', level: 'habitue' }, { folk: 'gontran', level: 'debutant' }], target: 4000,
    stars: [{ k: 'turn', n: 1500 }, { k: 'misses', n: 0 }], look: L('decor-bistrot', 'felt-losanges', 'rim-noyer') },
  { id: 'tonneaux', chapter: 'route', host: 'mathurin', opponents: [{ folk: 'mathurin', level: 'habitue' }, { folk: 'tiphaine', level: 'habitue' }], target: 10000,
    stars: [{ k: 'turns', n: 15 }, { k: 'shut', n: 8000 }], look: L('decor-taverne', 'felt-sable', 'rim-cognac') },
  { id: 'pont', chapter: 'route', host: 'barnabe', opponents: [{ folk: 'barnabe', level: 'fouine' }, { folk: 'colin', level: 'habitue' }], target: 4000, entry: 500,
    stars: [{ k: 'hot' }, { k: 'turn', n: 2000 }], look: L('decor-pub', 'felt-rouge', 'rim-acier') },
  // --- La cité de Montclair : la cour des grands ---
  { id: 'lion', chapter: 'cite', host: 'heloise', opponents: [{ folk: 'heloise', level: 'fouine' }, { folk: 'godefroy', level: 'fouine' }], target: 4000, entry: 500,
    stars: [{ k: 'misses', n: 0 }, { k: 'turn', n: 1500 }], look: L('decor-palace', 'felt-bordeaux', 'rim-marbre') },
  { id: 'prevot', chapter: 'cite', host: 'aymeric', opponents: [{ folk: 'aymeric', level: 'fouine' }, { folk: 'barnabe', level: 'fouine' }, { folk: 'mathurin', level: 'habitue' }], target: 4000,
    stars: [{ k: 'hot' }, { k: 'turns', n: 5 }], look: L('decor-casino', 'felt-noir', 'rim-cuir-rouge') },
  { id: 'banquet', chapter: 'cite', host: 'blanche', opponents: [{ folk: 'blanche', level: 'fouine' }, { folk: 'aymeric', level: 'fouine' }, { folk: 'heloise', level: 'fouine' }], target: 10000, entry: 300,
    stars: [{ k: 'turn', n: 2500 }, { k: 'shut', n: 8000 }], look: L('decor-palace', 'felt-etoiles', 'rim-or') },
];

/** Pièces par nouvelle étoile (gains volontairement bas, comme la Tournée des comptoirs). */
export const CDM_STAR_COINS = 5;
/**
 * Groschen à la fin de chaque chapitre, une seule fois par compte (4 × 25 = 100 en tout, une fois dans la
 * vie du compte) : autant que la part des ordinateurs permise en UN jour (DM_BOT_GAIN_DAILY = 100) ou que
 * 5 cadeaux quotidiens (GROSCHEN_DAILY = 20). Assez pour une petite mise, jamais une source régulière.
 */
export const CDM_CHAPTER_GROSCHEN = 25;
export const CDM_MAX_STARS = CDM_STAGES.length * 3;

export const cdmStage = (id: unknown): CdmStage | undefined => (typeof id === 'string' ? CDM_STAGES.find((s) => s.id === id) : undefined);
export const cdmFolk = (id: string): CdmFolk | undefined => CDM_FOLK.find((f) => f.id === id);
export const cdmChapter = (id: string): CdmChapter => CDM_CHAPTERS.find((c) => c.id === id)!;
export const stagesOf = (chapter: string) => CDM_STAGES.filter((s) => s.chapter === chapter);

/** Table imposée d'une étape (celle que le serveur rejoue). Niveau « principal » = celui de l'aubergiste. */
export function cdmSetup(st: CdmStage): SetupDm {
  return {
    level: st.opponents[0].level, target: st.target, bots: st.opponents.map((o) => o.folk),
    levels: st.opponents.map((o) => o.level), ...(st.entry ? { entry: st.entry } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Progression : étape → étoiles (masque : bit 0 = 1re étoile, bit 1 = 2e, bit 2 = 3e)

export type CdmProgress = Record<string, number>;
export const cdmStarCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
export const cdmStars = (p: CdmProgress | undefined) => Object.values(p ?? {}).reduce((n, m) => n + cdmStarCount(m), 0);
const won = (p: CdmProgress | undefined, id: string) => ((p?.[id] ?? 0) & 1) === 1;
export const chapterDone = (p: CdmProgress | undefined, chapter: string) => stagesOf(chapter).every((s) => won(p, s.id));

/** Chapitre ouvert : étoiles suffisantes et chapitre précédent terminé. */
export function chapterUnlocked(p: CdmProgress | undefined, chapter: string): boolean {
  const i = CDM_CHAPTERS.findIndex((c) => c.id === chapter);
  if (i < 0) return false;
  if (i === 0) return true;
  return cdmStars(p) >= CDM_CHAPTERS[i].need && chapterDone(p, CDM_CHAPTERS[i - 1].id);
}
/** Étape ouverte : son chapitre est ouvert et l'étape précédente du chapitre est gagnée. */
export function stageUnlocked(p: CdmProgress | undefined, id: string): boolean {
  const st = cdmStage(id);
  if (!st || !chapterUnlocked(p, st.chapter)) return false;
  const list = stagesOf(st.chapter);
  const i = list.indexOf(st);
  return i === 0 || won(p, list[i - 1].id);
}

/** Nettoie la progression lue d'un profil (étapes connues, masques 1 à 7 avec la victoire). */
export function cleanCdm(raw: unknown): CdmProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: CdmProgress = {};
  for (const st of CDM_STAGES) {
    const v = (raw as Record<string, unknown>)[st.id];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 7 && v & 1) out[st.id] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
/** Reprise à l'inscription d'un invité : seulement le premier chapitre (progression faite sans compte). */
export function capCdmImport(p: CdmProgress | undefined): CdmProgress | undefined {
  if (!p) return undefined;
  // Premier chapitre seulement, et JAMAIS terminé à la reprise : la dernière étape du chapitre n'est pas reprise.
  // (Un profil d'invité n'est pas vérifiable : sinon un faux profil ferait verser titre, monnaie du mode et
  // déblocage du chapitre suivant à chaque nouveau compte.) Le joueur rejoue cette étape pour clore le chapitre.
  const stages = stagesOf(CDM_CHAPTERS[0].id).map((s) => s.id);
  const first = new Set(stages.slice(0, -1));
  return cleanCdm(Object.fromEntries(Object.entries(p).filter(([id]) => first.has(id))));
}

// ---------------------------------------------------------------------------------------------
// Fin de partie : étoiles gagnées (faits du rejeu seulement)

export type CdmFacts = Pick<FactsDm, 'won' | 'place' | 'bestTurn' | 'misses' | 'hotMax' | 'turns' | 'oppBest'>;

export function cdmStarMet(s: CdmStar, f: CdmFacts): boolean {
  switch (s.k) {
    case 'misses': return f.misses <= s.n;
    case 'turn': return f.bestTurn >= s.n;
    case 'turns': return f.turns <= s.n;
    case 'hot': return f.hotMax >= 1;
    case 'shut': return f.oppBest < s.n;
  }
}
/** Masque des étoiles d'une partie : rien sans victoire. */
export function cdmStarsOf(st: CdmStage, f: CdmFacts): number {
  if (!f.won || f.place !== 1) return 0;
  let m = 1;
  st.stars.forEach((s, i) => { if (cdmStarMet(s, f)) m |= 2 << i; });
  return m;
}

export interface CdmResult {
  stage: string;
  before: number;
  after: number;
  /** Étoiles nouvellement gagnées (1, 2, 3). */
  newStars: number[];
  coins: number;
  /** Chapitre terminé (récompense donnée à l'instant) : titre ; Groschen versés par le serveur (comptes). */
  chapter?: string;
  title?: string;
  groschen?: number;
}

/**
 * Applique une partie de campagne au profil : nouvelles étoiles seulement (jamais deux fois la même),
 * CDM_STAR_COINS pièces par nouvelle étoile, titre de chaque chapitre terminé s'il manque (y compris un
 * chapitre repris d'un profil d'invité). `stageUnlocked` doit avoir été vérifié au début de la partie.
 * Les Groschen de fin de chapitre ne sont PAS ici : le serveur les verse une fois par compte (server/camp-dm.ts).
 */
export function applyCdm(p: Profile, stageId: string, f: CdmFacts): { profile: Profile; result: CdmResult } {
  const st = cdmStage(stageId)!;
  const before = p.campDm?.[st.id] ?? 0;
  const mask = cdmStarsOf(st, f);
  const after = before | mask;
  const fresh = after & ~before;
  const newStars = [1, 2, 3].filter((s) => fresh & (1 << (s - 1)));
  const coins = newStars.length * CDM_STAR_COINS;
  let profile: Profile = { ...p, coins: p.coins + coins, ...(after ? { campDm: { ...(p.campDm ?? {}), [st.id]: after } } : {}) };
  const result: CdmResult = { stage: st.id, before, after, newStars, coins };
  for (const c of CDM_CHAPTERS) {
    if (!chapterDone(profile.campDm, c.id) || (profile.titles ?? []).includes(c.title)) continue;
    profile = { ...profile, titles: [...(profile.titles ?? []), c.title] };
    if (!result.chapter) Object.assign(result, { chapter: c.id, title: c.title });
  }
  return { profile, result };
}

/** Titres de chapitre (français : traduits par shared/i18n/zones/campdm-server.ts). */
export const CDM_TITLES_FR: Record<string, string> = {
  val: 'Pèlerin des auberges', coteaux: 'Ami des vignerons', route: 'Roi de la foire', cite: 'Courtisan de Montclair',
};
export const cdmTitleFr = (chapter: string): string | null => CDM_TITLES_FR[chapter] ?? null;
export const isCdmTitle = (t: string) => /^cdm:[a-z-]{1,20}$/.test(t) && t.slice(4) in CDM_TITLES_FR;

// ---------------------------------------------------------------------------------------------
// Interface commune des campagnes (accueil)

export const CAMPAIGN = { id: 'dm', game: 'dm' as const, nameKey: 'cdm.title', maxStars: CDM_MAX_STARS };

/** Résumé pour l'accueil : étoiles, prochaine étape à jouer (ouverte et pas gagnée, sinon étoiles manquantes). */
export function campaignSummary(profile: Profile): { stars: number; maxStars: number; next: { id: string; nameKey: string } | null; done: boolean } {
  const p = profile.campDm;
  const stars = cdmStars(p);
  const open = CDM_STAGES.filter((s) => stageUnlocked(p, s.id));
  const nx = open.find((s) => !won(p, s.id)) ?? open.find((s) => cdmStarCount(p?.[s.id] ?? 0) < 3) ?? null;
  return {
    stars, maxStars: CDM_MAX_STARS,
    next: nx ? { id: nx.id, nameKey: `cdm.s.${nx.id}` } : null,
    done: CDM_STAGES.every((s) => won(p, s.id)),
  };
}
