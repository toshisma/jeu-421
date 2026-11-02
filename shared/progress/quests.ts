/**
 * Défis du jour : 3 défis tirés chaque jour (les mêmes pour tout le monde, pour pouvoir en parler
 * entre amis), qui progressent à la fin de chaque partie terminée et se récupèrent contre des
 * pièces et de l'XP. Logique pure : utilisée par le jeu (invités) et par le serveur (comptes).
 */
import type { ComboKind } from '../combos';
import type { Difficulty } from '../ai';
import { mulberry32 } from '../rng';

/** Ce qui s'est passé pour un joueur pendant une partie terminée. */
export interface GameSummary {
  won: boolean;
  mode: 'solo' | 'online';
  difficulty?: Difficulty;
  opponents: number;
  /** Nombre de lancers du joueur par combinaison obtenue. */
  combos: Partial<Record<ComboKind, number>>;
  /** Lancers faits d'un geste (glisser ou secouer). */
  gestureThrows: number;
}

export interface QuestDef {
  id: string;
  text: string;
  target: number;
  coins: number;
  xp: number;
  progress: (g: GameSummary) => number;
}

const c = (g: GameSummary, k: ComboKind) => g.combos[k] ?? 0;

export const QUESTS: QuestDef[] = [
  { id: 'gagner-2', text: 'Gagner 2 parties', target: 2, coins: 20, xp: 40, progress: (g) => (g.won ? 1 : 0) },
  { id: 'jouer-3', text: 'Terminer 3 parties', target: 3, coins: 10, xp: 30, progress: () => 1 },
  { id: 'faire-421', text: 'Faire un 4-2-1', target: 1, coins: 20, xp: 30, progress: (g) => c(g, '421') },
  { id: 'brelans', text: 'Faire 3 brelans', target: 3, coins: 15, xp: 30, progress: (g) => c(g, 'brelan') },
  { id: 'as', text: 'Faire 4 fois deux as ou plus', target: 4, coins: 15, xp: 30, progress: (g) => c(g, '11x') + c(g, '111') },
  { id: 'suites', text: 'Faire 3 suites', target: 3, coins: 15, xp: 25, progress: (g) => c(g, 'suite') },
  { id: 'difficile', text: "Gagner une partie contre l'IA difficile", target: 1, coins: 30, xp: 60, progress: (g) => (g.won && g.mode === 'solo' && g.difficulty === 'difficile' ? 1 : 0) },
  { id: 'grande-table', text: 'Gagner contre 3 adversaires ou plus', target: 1, coins: 25, xp: 50, progress: (g) => (g.won && g.opponents >= 3 ? 1 : 0) },
  { id: 'en-ligne', text: 'Jouer une partie en ligne', target: 1, coins: 25, xp: 40, progress: (g) => (g.mode === 'online' ? 1 : 0) },
  { id: 'gagner-en-ligne', text: 'Gagner une partie en ligne', target: 1, coins: 35, xp: 75, progress: (g) => (g.won && g.mode === 'online' ? 1 : 0) },
  { id: 'gestes', text: "Lancer 10 fois d'un geste (glisser ou secouer)", target: 10, coins: 10, xp: 25, progress: (g) => g.gestureThrows },
];

export interface QuestState { day: string; progress: Record<string, number>; claimed: string[] }

/** Jour local au format AAAA-MM-JJ. */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Les 3 défis du jour, toujours dont un défi « facile » (jouer / gagner) pour tout le monde. */
export function dailyQuests(day: string): QuestDef[] {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = mulberry32(h >>> 0);
  const easy = ['gagner-2', 'jouer-3'];
  const easyId = easy[Math.floor(rng() * easy.length)]; // tiré une seule fois
  const first = QUESTS.find((q) => q.id === easyId)!;
  const rest = QUESTS.filter((q) => !easy.includes(q.id));
  const picks: QuestDef[] = [first];
  while (picks.length < 3) {
    const q = rest[Math.floor(rng() * rest.length)];
    if (!picks.includes(q)) picks.push(q);
  }
  return picks;
}

export function freshQuests(day: string): QuestState { return { day, progress: {}, claimed: [] }; }

/** Remet à zéro si on a changé de jour. */
export function questsFor(q: QuestState | undefined, day: string): QuestState {
  return q && q.day === day ? q : freshQuests(day);
}

/** Fait progresser les défis du jour avec une partie terminée. Renvoie les défis tout juste accomplis. */
export function applySummary(q: QuestState | undefined, g: GameSummary, day: string): { quests: QuestState; completed: QuestDef[] } {
  const cur = questsFor(q, day);
  const progress = { ...cur.progress };
  const completed: QuestDef[] = [];
  for (const def of dailyQuests(day)) {
    const before = progress[def.id] ?? 0;
    if (before >= def.target) continue;
    const after = Math.min(def.target, before + Math.max(0, Math.floor(def.progress(g))));
    progress[def.id] = after;
    if (after >= def.target) completed.push(def);
  }
  return { quests: { ...cur, progress }, completed };
}

export function canClaim(q: QuestState | undefined, id: string, day: string): QuestDef | null {
  const cur = questsFor(q, day);
  const def = dailyQuests(day).find((d) => d.id === id);
  if (!def || cur.claimed.includes(id) || (cur.progress[id] ?? 0) < def.target) return null;
  return def;
}
