/** Adversaires de l'ordinateur : chacun a un nom, un avatar, une couleur, un tempo et un style. */
import type { Combo } from '../../../shared/combos';
import type { AiStyle } from '../../../shared/ai';

export interface Persona {
  id: string;
  name: string;
  avatar: string;
  color: string;
  tagline: string;
  /** Temps de réflexion moyen avant d'agir (ms). */
  tempo: number;
  style: AiStyle;
  lines: { big: string[]; good: string[]; bad: string[]; think: string[] };
}

export const PERSONAS: Persona[] = [
  {
    id: 'marcel', name: 'Marcel', avatar: '🧔', color: '#c0583a', tagline: 'Le patron du comptoir', tempo: 1100, style: { caution: 0.02 },
    lines: { big: ['Et voilà le travail !', 'Payez, messieurs !'], good: ['Pas mal, pas mal.'], bad: ['Bon… on fera mieux.'], think: ['Hmm…', 'Voyons voir…'] },
  },
  {
    id: 'josiane', name: 'Josiane', avatar: '👵', color: '#8e5bb5', tagline: 'Joue depuis 1962', tempo: 1500, style: { caution: 0.05 },
    lines: { big: ['Ah ! Comme au bon vieux temps.'], good: ['Je garde, mon petit.'], bad: ['Ces dés sont pipés…'], think: ['Laissez-moi réfléchir.', 'Doucement…'] },
  },
  {
    id: 'baron', name: 'Le Baron', avatar: '🎩', color: '#3d5a80', tagline: 'Flegme et stratégie', tempo: 1300, style: { caution: 0 },
    lines: { big: ['Prévisible.', 'Élémentaire.'], good: ['Convenable.'], bad: ['Fâcheux contretemps.'], think: ['Calculons.', 'Intéressant…'] },
  },
  {
    id: 'lulu', name: 'Lulu', avatar: '🦊', color: '#e08a2c', tagline: 'Rusée et rapide', tempo: 700, style: { caution: -0.03 },
    lines: { big: ['Hop hop hop !', 'Trop facile !'], good: ['Ça passe !'], bad: ['Oups.'], think: ['Allez…', 'On tente !'] },
  },
  {
    id: 'dede', name: 'Dédé', avatar: '🧢', color: '#3f8f5a', tagline: 'Toujours une de plus', tempo: 900, style: { caution: -0.05 },
    lines: { big: ['QUATRE-CENT-VINGT-ET-UN !', 'Tournée générale !'], good: ['Ça me va !'], bad: ['Allez, la prochaine…'], think: ['Je relance, je relance…', 'Qui ne tente rien…'] },
  },
  {
    id: 'simone', name: 'Simone', avatar: '🌹', color: '#c2366b', tagline: 'Élégante et redoutable', tempo: 1200, style: { caution: 0.01 },
    lines: { big: ['Merci, merci.'], good: ['Parfait.'], bad: ['Tant pis.'], think: ['Voyons…'] },
  },
  {
    id: 'gege', name: 'Gégé', avatar: '🥖', color: '#a8873f', tagline: 'Pilier du PMU', tempo: 1000, style: { caution: 0.03 },
    lines: { big: ['Et paf !'], good: ['Ça ira.'], bad: ['Pfff…'], think: ['Bon…'] },
  },
];

export function reaction(p: Persona, combo: Combo, final: boolean): string | null {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  if (combo.kind === '421' || combo.kind === '111' || (combo.kind === '11x' && combo.value >= 5)) return pick(p.lines.big);
  if (!final) return null;
  if (combo.value >= 2) return pick(p.lines.good);
  if (combo.kind === 'nenette' || combo.rank < 200) return pick(p.lines.bad);
  return null;
}
