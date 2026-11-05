/**
 * Compositeur de la musique d'ambiance : partitions originales générées à partir d'une graine.
 * Aucune dépendance au navigateur (testable sous Node) : on produit une liste d'événements
 * (instrument, note, instant, durée, intensité) que `music.ts` joue ensuite en Web Audio.
 *
 * Chaque morceau a sa grille d'accords, son tempo, sa mesure, son style d'accompagnement et
 * sa forme (intro, thème A, B, pont, chorus improvisés, fin). Les mélodies naissent d'un motif
 * tiré au sort à chaque écoute, puis évoluent à chaque reprise (ornements, renversements,
 * déplacements, silences), et l'accompagnement change de rythme, de voicing et d'instruments :
 * aucune séquence de 4 mesures ne se répète à l'identique dans un morceau.
 */

export type Inst =
  | 'ep' | 'acc' | 'gtr' | 'nyl' | 'bass' | 'organ' | 'sax' | 'viol' | 'clar' | 'flute' | 'vib' | 'pad' | 'pizz'
  | 'kick' | 'snare' | 'brush' | 'hat' | 'rim' | 'shaker' | 'tom';

/** Un événement de la partition. `t` et `d` en secondes depuis le début du morceau ; `g` = position sur la grille (1/12 de temps). */
export interface Ev { t: number; d: number; i: Inst; n: number; v: number; g: number }

export type Mood = 'normal' | 'cartes';
type Style = 'lofi' | 'cafe' | 'valse' | 'bossa' | 'pompe' | 'blues' | 'pluie' | 'tension';
type Role = 'intro' | 'theme' | 'solo' | 'pont' | 'fin';

export interface SongSpec {
  id: string;
  title: string;
  /** Ambiance en quelques mots (affichée sous le titre). */
  mood: string;
  style: Style;
  bpm: number;
  meter: 3 | 4;
  /** Position de la croche « du temps faible » (0,5 = droit, 0,6 = swing léger). */
  swing: number;
  /** Notes de la gamme (classes de hauteur 0-11), éventuellement par section. */
  scale: number[];
  scales?: Record<string, number[]>;
  /** Mélodie bluesy : toutes les notes de la gamme sont permises. */
  blue?: boolean;
  /** Grilles : mesures séparées par « | », deux accords dans une mesure séparés par une espace. */
  sections: Record<string, string>;
  /** Forme : nom de section ; « X* » = chorus improvisé sur la grille X. */
  form: string[];
  leads: Inst[];
  soloLeads: Inst[];
  mel: { lo: number; hi: number };
  ambience: { rain: number; vinyl: number };
  /** Ambiances où le morceau peut passer (« cartes » = Coups Fourrés). */
  pool: Mood[];
  /** Correction de volume du morceau (1 par défaut). */
  level?: number;
}

export interface Score {
  id: string; title: string; mood: string; seed: number; bpm: number; meter: number;
  bars: number; duration: number; barSec: number;
  sections: { name: string; bar: number; role: Role }[];
  events: Ev[];
  ambience: { rain: number; vinyl: number };
}

// ---------------------------------------------------------------------------------------------
// Hasard reproductible

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const pick = <T,>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const chance = (r: R, p: number) => r() < p;

// ---------------------------------------------------------------------------------------------
// Accords

const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14], '9': [0, 4, 7, 10, 14], '13': [0, 4, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], m6: [0, 3, 7, 9],
  '6': [0, 4, 7, 9], '69': [0, 4, 7, 9, 14], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], sus: [0, 5, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17], '7#9': [0, 4, 7, 10, 15],
};
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface Chord { sym: string; root: number; iv: number[]; pcs: number[] }
export function parseChord(sym: string): Chord {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  if (!m || !(m[3] in QUAL)) throw new Error(`Accord inconnu : ${sym}`);
  const root = (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  const iv = QUAL[m[3]];
  return { sym, root, iv, pcs: iv.map((x) => (root + x) % 12) };
}
interface BarChord { ch: Chord; at: number; len: number }
function parseBars(s: string, meter: number): BarChord[][] {
  return s.split('|').map((bar) => {
    const syms = bar.trim().split(/\s+/);
    const len = meter / syms.length;
    return syms.map((x, k) => ({ ch: parseChord(x), at: k * len, len }));
  });
}

/** Notes d'un accord par ordre d'importance (tierce, septième, extensions, quinte, fondamentale). */
function colorTones(ch: Chord, max: number): number[] {
  const rank = (x: number) => {
    const m = x % 12;
    if (m === 3 || m === 4) return 0;
    if (m === 10 || m === 11 || (m === 9 && x < 12) || m === 5) return 1;
    if (x > 12 || m === 6) return 2;
    if (m === 7) return 3;
    return 4;
  };
  return [...ch.iv].sort((a, b) => rank(a) - rank(b)).slice(0, max).map((x) => (ch.root + x) % 12);
}

/** Voicing proche du précédent (conduite des voix), dans la tessiture [lo, hi]. */
function voiceLead(pcs: number[], prev: number[] | null, lo: number, hi: number, r: R, alt: number): number[] {
  const sorted = [...new Set(pcs)].sort((a, b) => a - b);
  const cands: number[][] = [];
  for (let rot = 0; rot < sorted.length; rot++) {
    const order = [...sorted.slice(rot), ...sorted.slice(0, rot)];
    for (let oct = 0; oct < 2; oct++) {
      const notes: number[] = [];
      let cur = lo - 1 + oct * 12;
      for (const pc of order) { const p = cur + 1 + (((pc - (cur + 1)) % 12) + 12) % 12; notes.push(p); cur = p; }
      if (notes[notes.length - 1] <= hi) cands.push(notes);
    }
  }
  if (!cands.length) { let cur = lo - 1; return sorted.map((pc) => (cur = cur + 1 + (((pc - (cur + 1)) % 12) + 12) % 12)); }
  const mid = (lo + hi) / 2;
  const cost = (c: number[]) => {
    if (!prev) return Math.abs(c.reduce((s, x) => s + x, 0) / c.length - mid);
    if (prev.length === c.length) return c.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0);
    return Math.abs(c.reduce((s, x) => s + x, 0) / c.length - prev.reduce((s, x) => s + x, 0) / prev.length) * c.length;
  };
  cands.sort((a, b) => cost(a) - cost(b));
  return cands[cands.length > 1 && chance(r, alt) ? 1 : 0];
}

const bassPitch = (pc: number) => { const p = 36 + (((pc - 36) % 12) + 12) % 12; return p > 45 ? p - 12 : p; };
const near = (pc: number, target: number) => { let p = target + (((pc - target) % 12) + 12) % 12; if (p - target > 6) p -= 12; return p; };

// ---------------------------------------------------------------------------------------------
// Les morceaux (compositions originales)

const MAJ = (root: number) => [0, 2, 4, 5, 7, 9, 11].map((x) => (x + root) % 12);
const HARM = (root: number) => [0, 2, 3, 5, 7, 8, 11].map((x) => (x + root) % 12);
const AEOL = (root: number) => [0, 2, 3, 5, 7, 8, 10].map((x) => (x + root) % 12);

export const SONGS: SongSpec[] = [
  {
    id: 'zinc', title: 'Le Zinc à minuit', mood: 'Lofi jazzy, piano électrique', style: 'lofi', bpm: 72, meter: 4, swing: 0.6,
    scale: MAJ(0),
    sections: {
      intro: 'Cmaj9|A7b9|Dm9|G13',
      A: 'Dm9|G13|Cmaj9|Am9|Dm9|G13|Em7 A7b9|Dm9 G13',
      B: 'Fmaj9|Fm9 Bb13|Em9|A7b9|Dm9|Bbmaj7 A7b9|Dm9|G13',
      fin: 'Dm9|G13|Cmaj9|Cmaj9',
    },
    form: ['intro', 'A', 'A', 'B', 'A*', 'B', 'A', 'fin'],
    leads: ['ep', 'vib', 'ep'], soloLeads: ['ep', 'vib'], mel: { lo: 66, hi: 82 },
    ambience: { rain: 0, vinyl: 1 }, pool: ['normal'],
  },
  {
    id: 'valse', title: 'Valse du comptoir', mood: 'Valse musette discrète, accordéon', style: 'valse', bpm: 168, meter: 3, swing: 0.5,
    scale: HARM(9), scales: { B: MAJ(0) },
    sections: {
      intro: 'Am|E7|Am|E7',
      A: 'Am|Am|E7|E7|E7|E7|Am|Am|Am|A7|Dm|Dm|Am|E7|Am|E7',
      B: 'C|C|G7|G7|G7|G7|C|C|C|C7|F|F|C|G7|C|E7',
      pont: 'Dm|Dm|Am|Am|E7|E7|Am|A7|Dm|Dm|Am|F|Bm7b5|E7|Am|E7',
      fin: 'Am|Dm|Am|E7|Am|Am',
    },
    form: ['intro', 'A', 'B', 'A', 'pont', 'A*', 'B*', 'A', 'B', 'fin'],
    leads: ['acc', 'acc', 'clar'], soloLeads: ['acc', 'viol'], mel: { lo: 62, hi: 81 },
    ambience: { rain: 0, vinyl: 0.5 }, pool: ['normal'], level: 1.15,
  },
  {
    id: 'terrasse', title: 'Terrasse sous les platanes', mood: 'Bossa tranquille, guitare et flûte', style: 'bossa', bpm: 128, meter: 4, swing: 0.5,
    scale: MAJ(5),
    sections: {
      intro: 'Gm7|C9|Fmaj7|Fmaj7',
      A: 'Fmaj7|Dm9|Gm7|C9|Am7|D7b9|Gm7|C7b9|Fmaj7|Bbmaj7|Em7b5|A7b9|Dm9|G9|Gm7|C9',
      B: 'Bbmaj7|Bbm6|Am7|D7b9|Gm7|C9|Fmaj7|Fmaj7|Ebmaj7|Ab9|Dbmaj7|C7b9|Fmaj7|D7b9|Gm7|C9',
      fin: 'Gm7|C9|Fmaj7|Dbmaj7|Gm7 C9|F69',
    },
    form: ['intro', 'A', 'B', 'A*', 'B', 'A', 'fin'],
    leads: ['flute', 'vib'], soloLeads: ['vib', 'flute'], mel: { lo: 65, hi: 84 },
    ambience: { rain: 0, vinyl: 0.3 }, pool: ['normal'],
  },
  {
    id: 'pompe', title: 'La Pompe du Café des Amis', mood: 'Swing manouche léger, guitare pompe', style: 'pompe', bpm: 156, meter: 4, swing: 0.62,
    scale: HARM(7),
    sections: {
      intro: 'D7|D7|Gm6|D7',
      A: 'Gm6|Gm6|Cm6|Cm6|Gm6|Eb7|D7|Gm6 D7',
      B: 'Cm7|F7|Bbmaj7|Ebmaj7|Am7b5|D7|Gm6|D7',
      fin: 'Gm6|Eb7|D7|Gm6',
    },
    form: ['intro', 'A', 'A', 'B', 'A', 'A*', 'A*', 'B*', 'A*', 'A', 'B', 'A', 'fin'],
    leads: ['viol', 'clar'], soloLeads: ['gtr', 'viol', 'clar'], mel: { lo: 62, hi: 84 },
    ambience: { rain: 0, vinyl: 0.6 }, pool: ['normal'],
  },
  {
    id: 'metro', title: 'Blues du dernier métro', mood: 'Blues lent, orgue et saxo', style: 'blues', bpm: 62, meter: 4, swing: 0.5,
    scale: [10, 1, 2, 3, 4, 5, 7, 8], blue: true,
    sections: {
      intro: 'Cm7|F7|Bb7|F7',
      A: 'Bb7|Eb7|Bb7|Bb7|Eb7|Eb7|Bb7|G7|Cm7|F7|Bb7 G7|Cm7 F7',
      fin: 'Bb7|Eb7|Bb7 Eb7|Bb7',
    },
    form: ['intro', 'A', 'A*', 'A*', 'A', 'fin'],
    leads: ['sax', 'organ'], soloLeads: ['sax', 'ep', 'sax'], mel: { lo: 58, hi: 79 },
    ambience: { rain: 0.2, vinyl: 0.7 }, pool: ['normal', 'cartes'],
  },
  {
    id: 'pluie', title: 'Pluie sur la vitrine', mood: 'Soir de pluie, nappes et vibraphone', style: 'pluie', bpm: 66, meter: 4, swing: 0.56,
    scale: AEOL(0),
    sections: {
      intro: 'Abmaj9|Abmaj9|Gm7|Cm9',
      A: 'Cm9|Cm9|Abmaj9|Abmaj9|Fm9|Bb13|Ebmaj9|Gsus G7b9',
      B: 'Abmaj9|Bb13|Gm7|Cm9|Fm9|Dbmaj7|Ebmaj9|Bb13',
      pont: 'Fm9|Fm9|Ebmaj9|Ebmaj9|Dbmaj7|Dbmaj7|Gsus|G7b9',
      fin: 'Cm9|Abmaj9|Fm9|Gsus|Cm9|Cm9',
    },
    form: ['intro', 'A', 'B', 'A', 'pont', 'A*', 'B', 'fin'],
    leads: ['vib', 'ep', 'flute'], soloLeads: ['ep', 'vib'], mel: { lo: 63, hi: 82 },
    ambience: { rain: 1, vinyl: 0.2 }, pool: ['normal'], level: 1.2,
  },
  {
    id: 'cafe', title: 'Café-crème, 7 heures', mood: 'Lofi du matin, vibraphone', style: 'cafe', bpm: 86, meter: 4, swing: 0.58,
    scale: MAJ(7),
    sections: {
      intro: 'Cmaj9|Bm7|Am9|D9',
      A: 'Gmaj9|Em9|Am9|D9|Gmaj9|Bm7 E7b9|Am9|D9',
      B: 'Cmaj9|Cm6|Bm7|E7b9|Am9|D9|Gmaj9|Gmaj9',
      pont: 'Ebmaj7|D9|Ebmaj7|D9|Cmaj9|Bm7|Am9|D9',
      fin: 'Cmaj9|Cm6|Gmaj9|Gmaj9',
    },
    form: ['intro', 'A', 'A', 'B', 'A*', 'pont', 'A', 'B', 'fin'],
    leads: ['vib', 'ep', 'flute'], soloLeads: ['ep', 'vib'], mel: { lo: 66, hi: 83 },
    ambience: { rain: 0, vinyl: 0.8 }, pool: ['normal'],
  },
  {
    id: 'arriere', title: "L'Arrière-salle", mood: 'Partie serrée, cordes pincées', style: 'tension', bpm: 100, meter: 4, swing: 0.52,
    scale: HARM(0),
    sections: {
      intro: 'Cm|Cm|Ab7|G7b9',
      A: 'Cm|Cm|Ab7|G7b9|Cm|Fm6|Dbmaj7|G7b9',
      B: 'Fm|Fm|Cm|Cm|Ab7|Db7|G7b9|G7b9',
      pont: 'Abmaj7|Abmaj7|Fm6|Fm6|Dbmaj7|Dbmaj7|G7b9|G7b9',
      fin: 'Cm|Ab7|G7b9|Cm',
    },
    form: ['intro', 'A', 'A', 'B', 'pont', 'A', 'B*', 'A', 'fin'],
    leads: ['clar', 'viol'], soloLeads: ['viol', 'clar'], mel: { lo: 60, hi: 80 },
    ambience: { rain: 0, vinyl: 0.4 }, pool: ['cartes'], level: 1.6,
  },
];

export function songsFor(mood: Mood): SongSpec[] { return SONGS.filter((s) => s.pool.includes(mood)); }

/** Morceau suivant : au hasard, jamais le même deux fois de suite (s'il y a le choix). */
export function pickNext(pool: readonly string[], last: string | null, rnd: () => number = Math.random): string {
  const choices = pool.length > 1 ? pool.filter((x) => x !== last) : [...pool];
  return choices[Math.floor(rnd() * choices.length)] ?? pool[0];
}

// ---------------------------------------------------------------------------------------------
// Rythmes de mélodie (temps de départ, durée), par mesure

const T = 1 / 3;
const CELLS4_SLOW: [number, number][][] = [
  [[0, 1.5], [1.5, 0.5], [2, 2]], [[0.5, 0.5], [1, 1], [2.5, 1.5]], [[0, 3], [3, 0.5], [3.5, 0.5]],
  [[1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 1.5]], [[0, 4]], [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1], [3, 1]],
  [[2, 0.5], [2.5, 0.5], [3, 1]], [[0, 1], [1.5, 2.5]], [[0.5, 1], [1.5, 0.5], [2, 2]],
];
const CELLS4_MED: [number, number][][] = [
  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]], [[0, 1], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1]],
  [[0.5, 0.5], [1, 0.5], [1.5, 1.5], [3, 1]], [[0, 2], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
  [[0, 1.5], [1.5, 2.5]], [[0, 0.5], [0.5, 1], [1.5, 0.5], [2, 2]], [[1, 1], [2, 0.5], [2.5, 1.5]], [[0, 3], [3.5, 0.5]],
];
const CELLS4_TRIP: [number, number][][] = [
  [[0, 2 * T], [2 * T, T], [1, 2]], [[0, 1], [1 + 2 * T, T], [2, 2 * T], [2 + 2 * T, 1 + T]], [[T, T], [2 * T, T], [1, 3]],
  [[0, 3], [3, 2 * T], [3 + 2 * T, T]], [[1, 2 * T], [1 + 2 * T, T], [2, 2 * T], [2 + 2 * T, T], [3, 1]],
  [[0, 1.5], [2 + 2 * T, T], [3, 1]], [[0, 4]],
];
const CELLS3: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1]], [[0, 2], [2, 1]], [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1]], [[0, 3]],
  [[0, 1.5], [1.5, 0.5], [2, 1]], [[0, 1], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5]], [[1, 1], [2, 1]],
];

function cellsFor(style: Style, meter: number, solo: boolean): [number, number][][] {
  if (meter === 3) return CELLS3;
  if (style === 'blues') return CELLS4_TRIP;
  if (style === 'pompe' || style === 'bossa' || style === 'tension') return CELLS4_MED;
  return solo ? [...CELLS4_SLOW, ...CELLS4_MED.slice(0, 4)] : CELLS4_SLOW;
}

// ---------------------------------------------------------------------------------------------
// Composition

interface BarCtx {
  bar: number; role: Role; sec: string; occ: number; i: number; len: number;
  chords: BarChord[]; next: Chord; energy: number; first: boolean; last: boolean; lastOfSong: boolean;
  /** Choix tirés au début de chaque section (instruments présents, motif d'accompagnement). */
  flags: Flags;
}
interface Flags { drums: boolean; comp: number; lead: Inst | null; extra: boolean; fill: number }

interface Motif { cells: [number, number][][]; contour: number[]; answer: number[] }

const ROLE_ENERGY: Record<Role, number> = { intro: 0.35, theme: 0.6, solo: 0.8, pont: 0.5, fin: 0.35 };

export function compose(specOrId: SongSpec | string, seed: number): Score {
  const spec = typeof specOrId === 'string' ? SONGS.find((s) => s.id === specOrId)! : specOrId;
  if (!spec) throw new Error('Morceau inconnu');
  const r = rng(seed * 7919 + spec.id.length * 104729 + spec.id.charCodeAt(0));
  const meter = spec.meter;
  const spb = 60 / spec.bpm;
  const level = spec.level ?? 1;
  const events: Ev[] = [];
  const voices = new Map<string, number[] | null>();
  const sections: Score['sections'] = [];
  const parsed: Record<string, BarChord[][]> = {};
  for (const [k, v] of Object.entries(spec.sections)) parsed[k] = parseBars(v, meter);

  // Liste des mesures
  const plan: { sec: string; role: Role; occ: number; i: number; len: number; chords: BarChord[] }[] = [];
  const occs = new Map<string, number>();
  for (const tok of spec.form) {
    const sec = tok.replace('*', '');
    const role: Role = tok.endsWith('*') ? 'solo' : sec === 'intro' ? 'intro' : sec === 'fin' ? 'fin' : sec === 'pont' ? 'pont' : 'theme';
    const key = `${role}:${sec}`;
    const occ = occs.get(key) ?? 0; occs.set(key, occ + 1);
    const bars = parsed[sec];
    sections.push({ name: tok, bar: plan.length, role });
    bars.forEach((chords, i) => plan.push({ sec, role, occ, i, len: bars.length, chords }));
  }
  const total = plan.length;

  const swingPos = (beat: number) => {
    const b = Math.floor(beat + 1e-9), f = beat - b;
    const s = spec.swing;
    // Les triolets restent des triolets ; les croches et doubles croches swinguent.
    if (Math.abs(f - T) < 1e-6 || Math.abs(f - 2 * T) < 1e-6) return beat;
    return b + (f <= 0.5 ? (f / 0.5) * s : s + ((f - 0.5) / 0.5) * (1 - s));
  };
  const drumsSet = new Set<Inst>(['kick', 'snare', 'brush', 'hat', 'rim', 'shaker', 'tom']);
  const add = (i: Inst, n: number, bar: number, beat: number, durBeats: number, v: number) => {
    if (v <= 0.01) return;
    const abs = bar * meter + beat;
    const jit = (r() - 0.5) * (drumsSet.has(i) ? 0.008 : 0.018);
    const t = Math.max(0, (bar * meter + swingPos(beat)) * spb + jit);
    events.push({ t, d: Math.max(0.04, durBeats * spb), i, n, v: Math.min(1, v * level * (0.9 + r() * 0.2)), g: Math.round(abs * 12) });
  };
  const chordAt = (b: BarCtx, beat: number) => (b.chords.find((c) => beat >= c.at - 1e-9 && beat < c.at + c.len - 1e-9) ?? b.chords[0]).ch;
  const voice = (key: string, ch: Chord, n: number, lo: number, hi: number, alt = 0.25) => {
    const v = voiceLead(colorTones(ch, n), voices.get(key) ?? null, lo, hi, r, alt);
    voices.set(key, v);
    return v;
  };
  const chordNotes = (i: Inst, notes: number[], bar: number, beat: number, dur: number, v: number, strum = 0) =>
    notes.forEach((n, k) => add(i, n, bar, beat + k * strum, dur, v * (k === notes.length - 1 ? 1.1 : 0.9)));

  // ----- Mélodie
  const motifs = new Map<string, Motif>();
  let lastPitch = (spec.mel.lo + spec.mel.hi) / 2;
  /** Contour mélodique : surtout des pas conjoints, quelques sauts, une courbe en arche. */
  const makeContour = (n: number) => {
    const c: number[] = [];
    let dir = chance(r, 0.5) ? 1 : -1;
    let rest = false;
    for (let k = 0; k < n; k++) {
      if (k === Math.floor(n / 2) ? chance(r, 0.6) : chance(r, 0.22)) dir = -dir;
      if (!rest && k > 0 && chance(r, 0.1)) { c.push(0); rest = true; continue; }
      rest = false;
      c.push(dir * (chance(r, 0.72) ? 1 : 2));
    }
    return c;
  };
  /** Rappel vers le milieu de la tessiture (évite que la mélodie reste collée en haut ou en bas). */
  const gravity = (p: number, step: number, lo: number, hi: number) => {
    const mid = (lo + hi) / 2;
    if ((p > mid + 5 && step > 0) || (p < mid - 5 && step < 0)) return chance(r, 0.65) ? -step : step;
    return step;
  };
  const motifFor = (sec: string, solo: boolean): Motif => {
    const key = sec + (solo ? '*' : '');
    let m = motifs.get(key);
    if (!m) {
      const cells = cellsFor(spec.style, meter, solo);
      const c = [pick(r, cells), pick(r, cells)];
      const n = c[0].length + c[1].length;
      m = { cells: c, contour: makeContour(n), answer: makeContour(n) };
      motifs.set(key, m);
    }
    return m;
  };
  const scaleFor = (sec: string) => spec.scales?.[sec] ?? spec.scale;
  const allowed = (ch: Chord, sec: string) => {
    const ct = new Set(ch.pcs);
    const out = new Set(ct);
    for (const s of scaleFor(sec)) {
      if (spec.blue || ![...ct].some((c) => (s - c + 12) % 12 === 1 || (c - s + 12) % 12 === 1)) out.add(s);
    }
    return out;
  };
  const listIn = (set: Set<number>, lo: number, hi: number) => { const a: number[] = []; for (let p = lo; p <= hi; p++) if (set.has(p % 12)) a.push(p); return a; };
  const stepFrom = (p: number, step: number, list: number[]) => {
    let idx = 0, best = Infinity;
    list.forEach((x, k) => { const d = Math.abs(x - p); if (d < best) { best = d; idx = k; } });
    let j = idx + step;
    if (j < 0) j = Math.min(list.length - 1, -j);
    if (j >= list.length) j = Math.max(0, 2 * (list.length - 1) - j);
    return list[j];
  };
  const nearestIn = (p: number, list: number[]) => list.reduce((a, x) => (Math.abs(x - p) < Math.abs(a - p) ? x : a), list[0]);
  const strongBeat = (beat: number) => Math.abs(beat % (meter === 3 ? 3 : 2)) < 1e-6;

  /** Joue un fragment de mélodie (rythme + contour) sur une ou deux mesures. */
  const phrase = (bs: BarCtx[], cells: [number, number][][], contour: number[], inst: Inst, opts: { orn: number; drop: number; shift: number; lift: number; cadence: boolean; vel: number }) => {
    let k = 0;
    let p = lastPitch + opts.lift;
    const lo = spec.mel.lo, hi = spec.mel.hi;
    bs.forEach((b, bi) => {
      let notes = cells[bi] ?? cells[0];
      if (opts.cadence && bi === bs.length - 1) notes = meter === 3 ? [[0, 3]] : chance(r, 0.5) ? [[0, 4]] : [[0, 1], [1, 3]];
      notes.forEach(([at, dur], ni) => {
        const step = contour[k++ % contour.length];
        if (chance(r, opts.drop) && ni > 0) return;
        const beat = Math.min(meter - 0.5, at + (opts.shift && at + opts.shift < meter ? opts.shift : 0));
        const ch = chordAt(b, beat);
        const all = listIn(allowed(ch, b.sec), lo, hi);
        const tones = listIn(new Set(ch.pcs), lo, hi);
        p = stepFrom(p, gravity(p, step, lo, hi), all.length ? all : tones);
        if (strongBeat(beat) || dur >= 1.5 || (opts.cadence && bi === bs.length - 1)) p = nearestIn(p, tones.length ? tones : all);
        const accent = strongBeat(beat) ? 1 : 0.85;
        if (chance(r, opts.orn) && dur >= 1 && all.length) {
          // Ornement : petite note voisine avant la note principale.
          const g = stepFrom(p, chance(r, 0.5) ? 1 : -1, all);
          add(inst, g, b.bar, beat, 0.5, opts.vel * 0.75);
          add(inst, p, b.bar, beat + 0.5, (dur - 0.5) * 0.95, opts.vel * accent);
        } else add(inst, p, b.bar, beat, dur * 0.95, opts.vel * accent);
        lastPitch = p;
      });
    });
  };

  /** Chorus improvisé : marche aléatoire dans la gamme, plus dense, avec quelques arpèges. */
  const improv = (b: BarCtx, inst: Inst) => {
    const cells = cellsFor(spec.style, meter, true);
    const notes = chance(r, 0.12) && !b.last ? [] : pick(r, cells);
    const lo = spec.mel.lo + 2, hi = spec.mel.hi + 2;
    let dir = lastPitch > (lo + hi) / 2 ? -1 : 1;
    for (const [at, dur] of notes) {
      const ch = chordAt(b, at);
      const all = listIn(allowed(ch, b.sec), lo, hi);
      const tones = listIn(new Set(ch.pcs), lo, hi);
      if (chance(r, 0.25)) dir = -dir;
      dir = gravity(lastPitch, dir, lo, hi);
      let p = chance(r, 0.25) ? stepFrom(lastPitch, dir * 2, tones) : stepFrom(lastPitch, dir * (chance(r, 0.75) ? 1 : 2), all);
      if (strongBeat(at)) p = nearestIn(p, tones);
      add(inst, p, b.bar, at, dur * 0.9, (strongBeat(at) ? 0.62 : 0.52) * (0.85 + b.energy * 0.2));
      lastPitch = p;
    }
  };

  // Section en cours (tirages faits à la première mesure)
  let flags: Flags = { drums: true, comp: 0, lead: null, extra: false, fill: 0 };
  let pairBars: BarCtx[] = [];

  const melody = (b: BarCtx) => {
    const inst = b.flags.lead;
    if (!inst) return;
    if (b.role === 'solo') { improv(b, inst); return; }
    if (b.role === 'intro') {
      // Une petite annonce dans les deux dernières mesures, une fois sur deux.
      if (b.i >= b.len - 2 && b.flags.extra) {
        const m = motifFor('A', false);
        phrase([b], [m.cells[b.i - (b.len - 2)]], m.contour, inst, { orn: 0, drop: 0.5, shift: 0, lift: 0, cadence: false, vel: 0.4 });
      }
      return;
    }
    // Phrases de deux mesures : motif, réponse, motif varié, cadence.
    pairBars.push(b);
    if (pairBars.length < 2 && !b.last) return;
    const bs = pairBars; pairBars = [];
    const pairIdx = Math.floor(bs[0].i / 2);
    const pos = pairIdx % 4;
    const lvl = b.occ + (pairIdx >= 4 ? 1 : 0) + (b.role === 'pont' ? 1 : 0);
    const m = motifFor(b.sec, false);
    const vel = b.role === 'fin' ? 0.45 : 0.58;
    const base = { orn: Math.min(0.5, 0.12 * lvl), drop: Math.min(0.35, 0.08 * lvl), shift: 0, lift: 0, cadence: false, vel };
    if (b.role === 'fin') {
      phrase(bs, m.cells, m.contour, inst, { ...base, cadence: b.last });
      return;
    }
    if (pos === 0) {
      phrase(bs, m.cells, lvl >= 2 && chance(r, 0.4) ? m.contour.map((x) => -x) : m.contour, inst,
        { ...base, shift: lvl >= 1 && chance(r, 0.3) ? 0.5 : 0, lift: lvl % 2 ? 3 : 0 });
    } else if (pos === 1) {
      const c2 = chance(r, 0.25 + 0.15 * lvl) ? pick(r, cellsFor(spec.style, meter, false)) : m.cells[1];
      phrase(bs, [m.cells[0], c2], m.answer, inst, base);
    } else if (pos === 2) {
      // Une fois sur cinq, on laisse respirer (l'accompagnement occupe l'espace).
      if (lvl >= 1 && chance(r, 0.2)) return;
      phrase(bs, chance(r, 0.5) ? m.cells : [m.cells[1], m.cells[0]], m.contour.map((x, k) => (k % 3 === 2 ? -x : x)), inst,
        { ...base, orn: base.orn + 0.15, lift: chance(r, 0.5) ? 2 : -2 });
    } else {
      phrase(bs, m.cells, m.answer, inst, { ...base, cadence: true });
    }
  };

  // ----- Batterie : remplissages de fin de section
  const fill = (b: BarCtx, kind: number, vel: number) => {
    const from = meter - (meter === 3 ? 1 : 1.5);
    if (kind === 0) for (let x = from; x < meter - 1e-9; x += 0.25) add('snare', 0, b.bar, x, 0.25, vel * (0.4 + 0.6 * (x - from) / (meter - from)));
    else if (kind === 1) for (let k = 0; k < 6; k++) add(k < 3 ? 'snare' : 'tom', k < 3 ? 0 : 2 - Math.floor((k - 3) / 2), b.bar, meter - 2 + k * T, T, vel * 0.8);
    else if (kind === 2) [0, 1, 2, 3].forEach((k) => add('tom', 2 - Math.min(2, k), b.bar, from + k * ((meter - from) / 4), 0.5, vel * 0.75));
    else { add('snare', 0, b.bar, meter - 1, 0.5, vel * 0.6); add('snare', 0, b.bar, meter - 0.5, 0.5, vel * 0.8); }
  };

  // ----- Accompagnement par style
  const arrange = (b: BarCtx) => {
    const e = b.energy;
    const f = b.flags;
    const st = spec.style;
    const c0 = b.chords[0].ch;
    const wantFill = b.last && !b.lastOfSong && f.drums && b.role !== 'intro' && chance(r, 0.35 + e * 0.4);

    if (st === 'lofi' || st === 'cafe') {
      const cafe = st === 'cafe';
      // Accords au piano électrique, rythme tiré par mesure
      const pats: number[][][] = [
        [[0, 4]], [[0, 1.5], [1.5, 2.5]], [[0, 2], [2.5, 1.5]], [[0, 3], [3.5, 0.5]], [[0.5, 1.5], [2, 2]], [[0, 1], [1.5, 1], [3, 1]],
      ];
      for (const bc of b.chords) {
        const notes = voice('ep', bc.ch, 4, 52, 71, 0.2);
        const pat = b.role === 'intro' || b.role === 'fin' ? [[0, bc.len]] : pick(r, pats).filter(([x]) => x < bc.len);
        if (b.role === 'pont' && !cafe) {
          // Pont : accord brisé en croches
          for (let k = 0; k < bc.len * 2; k++) add('ep', notes[(k * 2 + (k > 3 ? 1 : 0)) % notes.length] + (k % 4 === 3 ? 12 : 0), b.bar, bc.at + k * 0.5, 0.9, 0.3);
        } else for (const [x, d] of pat) chordNotes('ep', notes, b.bar, bc.at + x, Math.min(d, bc.len - x) * 0.95, 0.34 + e * 0.08, 0.012);
        if (cafe && f.extra && b.role !== 'intro') add('pad', notes[0] - 12, b.bar, bc.at, bc.len, 0.18);
      }
      // Basse
      if (!(b.role === 'intro' && b.i < 2)) {
        for (const bc of b.chords) {
          const rt = bassPitch(bc.ch.root);
          add('bass', rt, b.bar, bc.at, Math.min(1.5, bc.len) * 0.9, 0.7);
          if (bc.len >= 4) {
            add('bass', chance(r, 0.5) ? rt + 7 : rt + 12, b.bar, 2.5, 0.9, 0.5);
            if (chance(r, 0.5)) { const nx = bassPitch(b.next.root); add('bass', nx + (chance(r, 0.5) ? 1 : -1), b.bar, 3.5, 0.45, 0.45); }
          } else if (cafe) add('bass', rt + 7, b.bar, bc.at + 1.5, 0.4, 0.4);
        }
      }
      // Batterie
      if (f.drums && !(b.role === 'intro' && b.i < 2)) {
        const kicks = cafe ? pick(r, [[0, 0.75, 2.5], [0, 2.5, 2.75], [0, 1.75, 2.5]]) : pick(r, [[0, 2.5], [0, 1.75, 2.5], [0, 2.25]]);
        if (b.lastOfSong) { add('kick', 0, b.bar, 0, 1, 0.6); add('hat', 0, b.bar, 0, 0.5, 0.2); }
        else {
          kicks.forEach((x) => add('kick', 0, b.bar, x, 0.5, 0.62));
          const sn = b.role === 'pont' || b.role === 'intro' ? 'rim' : 'snare';
          add(sn, 0, b.bar, 1, 0.5, 0.5); if (!(wantFill)) add(sn, 0, b.bar, 3, 0.5, 0.52);
          const step = cafe && f.comp % 2 ? 0.25 : 0.5;
          for (let x = 0; x < (wantFill ? 2.5 : 4) - 1e-9; x += step) add('hat', 0, b.bar, x, 0.2, (x % 1 === 0 ? 0.32 : 0.2) * (0.7 + e * 0.5));
          if (wantFill) fill(b, f.fill, 0.5);
          else if (chance(r, 0.1)) add('snare', 0, b.bar, 3.75, 0.25, 0.18); // petite note fantôme
        }
      }
    } else if (st === 'valse') {
      const notes = voice('gtr', c0, 3, 55, 68, 0.3);
      const rt = bassPitch(c0.root);
      const alt = b.i % 2 === 1 && chance(r, 0.85) ? near((c0.root + 7) % 12, rt - 3) : rt;
      if (b.lastOfSong) { add('bass', rt, b.bar, 0, 2.5, 0.7); chordNotes('acc', voice('acc', c0, 4, 57, 72), b.bar, 0, 3, 0.3); return; }
      if (!(b.role === 'intro' && b.i === 0)) add('bass', alt, b.bar, 0, 0.9, 0.72);
      const stab: Inst = f.lead === 'acc' || f.comp % 2 === 0 ? 'gtr' : 'acc';
      chordNotes(stab, notes, b.bar, 1, stab === 'acc' ? 0.45 : 0.4, 0.34, 0.008);
      chordNotes(stab, notes, b.bar, 2, stab === 'acc' ? 0.45 : 0.4, 0.3, 0.008);
      if (f.extra && b.i % 4 === 3 && b.role !== 'intro') add('gtr', notes[notes.length - 1] + 12, b.bar, 2.5, 0.4, 0.25);
      if (f.drums) { add('brush', 0, b.bar, 0, 1, 0.22); add('hat', 0, b.bar, 1, 0.3, 0.15); add('hat', 0, b.bar, 2, 0.3, 0.13); }
      if (wantFill && f.fill % 2) add('rim', 0, b.bar, 2.5, 0.5, 0.25);
    } else if (st === 'bossa') {
      const notes = voice('nyl', c0, 4, 52, 70, 0.25);
      const pat = (b.i + f.comp) % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
      if (b.lastOfSong) { chordNotes('nyl', notes, b.bar, 0, 4, 0.4, 0.04); add('bass', bassPitch(c0.root), b.bar, 0, 3, 0.6); return; }
      for (const bc of b.chords) {
        const nn = bc.ch === c0 ? notes : voice('nyl', bc.ch, 4, 52, 70);
        pat.filter((x) => x >= bc.at && x < bc.at + bc.len).forEach((x) => chordNotes('nyl', nn, b.bar, x, 1.1, 0.36, 0.01));
        const rt = bassPitch(bc.ch.root);
        if (!(b.role === 'intro' && b.i < 1)) {
          add('bass', rt, b.bar, bc.at, 1.4, 0.62);
          if (bc.len >= 4) add('bass', near((bc.ch.root + 7) % 12, rt + 4), b.bar, 2, 1.4, 0.5);
        }
        if (f.extra && b.role !== 'intro') add('pad', voice('pad', bc.ch, 3, 60, 74)[0], b.bar, bc.at, bc.len, 0.12);
      }
      if (f.drums && !(b.role === 'intro' && b.i < 2)) {
        for (let x = 0; x < 4; x += 0.5) add('shaker', 0, b.bar, x, 0.4, x % 1 === 0 ? 0.32 : 0.2);
        const clave = b.i % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
        clave.forEach((x) => add('rim', 0, b.bar, x, 0.3, 0.3));
        [0, 1.5, 2, 3.5].forEach((x, k) => add('kick', 0, b.bar, x, 0.4, k % 2 ? 0.3 : 0.45));
        if (wantFill) fill(b, 3, 0.35);
      }
    } else if (st === 'pompe') {
      if (b.lastOfSong) {
        chordNotes('gtr', voice('gtr', c0, 4, 52, 67), b.bar, 0, 0.3, 0.6, 0.02);
        chordNotes('gtr', voice('gtr', c0, 4, 55, 70), b.bar, 1, 2.5, 0.5, 0.05);
        add('bass', bassPitch(c0.root), b.bar, 0, 1, 0.7);
        return;
      }
      for (let beat = 0; beat < 4; beat++) {
        const ch = chordAt(b, beat);
        const notes = voice('gtr', ch, 4, 52, 66, 0.15);
        chordNotes('gtr', notes, b.bar, beat, beat % 2 ? 0.28 : 0.18, beat % 2 ? 0.48 : 0.3, 0.006);
      }
      // Contrebasse en marche (2 temps dans l'intro et le premier A)
      const twoFeel = b.role === 'intro' || (b.role === 'theme' && b.occ === 0 && b.sec === 'A' && f.comp % 2 === 0);
      let prev = bassPitch(c0.root);
      for (let beat = 0; beat < 4; beat += twoFeel ? 2 : 1) {
        const ch = chordAt(b, beat);
        const rt = bassPitch(ch.root);
        const onChord = b.chords.some((bc) => Math.abs(bc.at - beat) < 1e-6);
        let n: number;
        if (onChord) n = rt;
        else if (beat === 3) n = bassPitch(b.next.root) + (chance(r, 0.5) ? 1 : -1);
        else n = near(pick(r, [ch.pcs[1], ch.pcs[2], ch.pcs[Math.min(3, ch.pcs.length - 1)]]), prev);
        if (n < 33) n += 12; if (n > 50) n -= 12;
        add('bass', n, b.bar, beat, twoFeel ? 1.8 : 0.9, 0.62);
        prev = n;
      }
      if (f.drums) {
        add('brush', 0, b.bar, 0, 4, 0.16);
        [1, 3].forEach((x) => add('hat', 0, b.bar, x, 0.3, 0.2));
        if (e > 0.6) [0, 1, 2, 3].forEach((x) => add('kick', 0, b.bar, x, 0.3, 0.12));
        if (f.comp % 3 === 1) [1.5 + 0.12, 3.5 + 0.12].forEach((x) => add('hat', 0, b.bar, x - 0.12, 0.2, 0.1));
        if (wantFill) fill(b, 3, 0.3);
      }
    } else if (st === 'blues') {
      if (b.lastOfSong) {
        chordNotes('organ', voice('organ', c0, 4, 55, 72), b.bar, 0, 4, 0.36);
        add('bass', bassPitch(c0.root), b.bar, 0, 3, 0.7); add('kick', 0, b.bar, 0, 1, 0.5); add('brush', 0, b.bar, 0, 2, 0.3);
        return;
      }
      for (const bc of b.chords) {
        const notes = voice('organ', bc.ch, 4, 55, 72, 0.2);
        if (b.role !== 'intro' || b.i >= 2) chordNotes('organ', notes, b.bar, bc.at, bc.len * 0.98, b.role === 'solo' ? 0.26 : 0.3);
        // Piano électrique : petites relances en triolets
        if (f.extra) {
          const ep = voice('ep', bc.ch, 3, 60, 76);
          [bc.at + 2 * T, bc.at + 1 + 2 * T].filter((x) => x < bc.at + bc.len && chance(r, 0.55)).forEach((x) => chordNotes('ep', ep, b.bar, x, T, 0.28));
        }
        // Basse shuffle
        const rt = bassPitch(bc.ch.root);
        const third = bc.ch.iv.includes(4) ? 4 : 3;
        const line = pick(r, [[0, third, 7, 9], [0, 7, 9, 10], [0, 4, 7, 10], [0, 0, 7, 9]]);
        for (let k = 0; k < bc.len; k++) {
          const n = rt + line[k % 4];
          add('bass', n, b.bar, bc.at + k, 2 * T, 0.62);
          if (chance(r, 0.6)) add('bass', n, b.bar, bc.at + k + 2 * T, T * 0.9, 0.4);
        }
      }
      if (f.drums && !(b.role === 'intro' && b.i < 2)) {
        [0, 2].forEach((x) => add('kick', 0, b.bar, x, 0.5, 0.5));
        [1, 3].forEach((x) => { if (!(wantFill && x === 3)) add('snare', 0, b.bar, x, 0.5, 0.36); });
        for (let x = 0; x < (wantFill ? 2 : 4); x++) { add('hat', 0, b.bar, x, 0.3, 0.26); add('hat', 0, b.bar, x + 2 * T, 0.2, 0.17); }
        if (wantFill) fill(b, 1, 0.45);
      }
    } else if (st === 'pluie') {
      // Nappe sur deux mesures, piano électrique clairsemé, basse ronde
      for (const bc of b.chords) {
        const pad = voice('pad', bc.ch, 4, 50, 70, 0.3);
        if (b.chords.length > 1 || b.i % 2 === 0 || b.chords[0].ch.sym !== plan[b.bar - 1]?.chords.at(-1)?.ch.sym)
          chordNotes('pad', pad, b.bar, bc.at, b.chords.length > 1 ? bc.len : Math.min(8, bc.len * 2) - 0.2, 0.26);
        if (b.role !== 'intro' || b.i >= 1) {
          const n = 1 + Math.floor(r() * (2 + e * 3));
          for (let k = 0; k < n; k++) {
            const x = bc.at + Math.floor(r() * bc.len * 2) / 2;
            add('ep', pick(r, pad) + 12, b.bar, x, 1.5, 0.22 + r() * 0.1);
          }
        }
        if (b.role !== 'intro' && b.role !== 'fin') add('bass', bassPitch(bc.ch.root), b.bar, bc.at, bc.len * 0.9, 0.5);
      }
      if (b.lastOfSong) add('vib', near(c0.root, 72), b.bar, 0.5, 4, 0.3);
      if (f.drums && !b.lastOfSong) {
        add('kick', 0, b.bar, 0, 0.5, 0.42); if (chance(r, 0.4)) add('kick', 0, b.bar, 2.5, 0.5, 0.3);
        add('rim', 0, b.bar, 2, 0.3, 0.22);
        if (e > 0.55) for (let x = 0; x < 4; x += 0.5) add('hat', 0, b.bar, x, 0.2, x % 1 === 0 ? 0.14 : 0.09);
        if (b.i % 4 === 0) add('brush', 0, b.bar, 0, 3, 0.12);
      }
    } else {
      // tension : ostinato pincé, nappe grave, tic-tac
      const rt = bassPitch(c0.root) + 12;
      if (b.lastOfSong) { add('pizz', rt - 12, b.bar, 0, 1, 0.7); add('pad', rt, b.bar, 0, 4, 0.3); add('tom', 0, b.bar, 0, 1, 0.5); return; }
      const osti = pick(r, [[0, 0, 7, 0, 12, 0, 7, 8], [0, 7, 12, 7, 0, 7, 8, 7], [0, 0, 3, 0, 7, 0, 6, 7], [0, 12, 0, 7, 0, 12, 1, 0]]);
      for (let k = 0; k < 8; k++) {
        const ch = chordAt(b, k / 2);
        const base = bassPitch(ch.root) + 12;
        if (!(b.role === 'intro' && b.i === 0 && k < 4)) add('pizz', base + osti[k], b.bar, k / 2, 0.4, k % 2 ? 0.4 : 0.55);
      }
      for (const bc of b.chords) {
        const pad = voice('pad', bc.ch, 3, 48, 64, 0.2);
        if (b.role !== 'intro' || b.i >= 2) chordNotes('pad', pad, b.bar, bc.at, bc.len, 0.24);
        if (f.extra && b.i % 2 === 0) {
          const top = voice('ep', bc.ch, 3, 64, 79);
          for (let k = 0; k < 4; k++) chordNotes('ep', top, b.bar, bc.at + 2 + k * 0.25, 0.22, 0.12 + k * 0.03);
        }
      }
      if (f.drums && !(b.role === 'intro' && b.i < 2)) {
        for (let x = 0; x < (wantFill ? 3 : 4) - 1e-9; x += 0.25) add('hat', 0, b.bar, x, 0.1, x % 1 === 0 ? 0.2 : 0.09);
        [0, 1.5].forEach((x) => add('kick', 0, b.bar, x, 0.5, 0.55));
        if (b.i % 2 === 1 && chance(r, 0.6)) add('kick', 0, b.bar, 2.75, 0.5, 0.4);
        add('rim', 0, b.bar, 3, 0.3, 0.32);
        if (wantFill) fill(b, 2, 0.5);
      }
    }
  };

  // ----- Boucle sur les mesures
  plan.forEach((p, bar) => {
    if (p.i === 0) {
      const leads = p.role === 'solo' ? spec.soloLeads : spec.leads;
      const absent = p.role === 'intro' ? 0.1 : p.role === 'pont' ? 0.3 : 0;
      flags = {
        drums: p.role === 'intro' ? chance(r, 0.6) : p.role === 'pont' ? chance(r, 0.5) : p.role === 'fin' ? chance(r, 0.5) : p.occ > 0 && chance(r, 0.1) ? false : true,
        comp: Math.floor(r() * 6),
        lead: chance(r, absent) ? null : leads[(p.occ + Math.floor(r() * 2) * (p.role === 'solo' ? 1 : 0)) % leads.length],
        extra: chance(r, p.role === 'intro' ? 0.5 : 0.35 + 0.15 * p.occ),
        fill: Math.floor(r() * 4),
      };
      pairBars = [];
    }
    const nextChord = plan[bar + 1]?.chords[0].ch ?? p.chords[0].ch;
    const b: BarCtx = {
      bar, role: p.role, sec: p.sec, occ: p.occ, i: p.i, len: p.len, chords: p.chords, next: nextChord,
      energy: Math.min(1, ROLE_ENERGY[p.role] + 0.06 * p.occ + (p.i >= p.len / 2 ? 0.05 : 0)),
      first: p.i === 0, last: p.i === p.len - 1, lastOfSong: bar === total - 1, flags,
    };
    arrange(b);
    melody(b);
  });

  events.sort((a, b) => a.t - b.t);
  const duration = total * meter * spb + 3.5;
  return {
    id: spec.id, title: spec.title, mood: spec.mood, seed, bpm: spec.bpm, meter, bars: total, duration, barSec: meter * spb,
    sections, events, ambience: spec.ambience,
  };
}

/** Empreinte d'une mesure (instrument, note, position sur la grille), sans l'humanisation. */
export function barPrints(score: Score): string[] {
  const per = score.meter * 12;
  const bars: string[][] = Array.from({ length: score.bars }, () => []);
  for (const e of score.events) { const k = Math.floor(e.g / per); if (bars[k]) bars[k].push(`${e.i}:${e.n}:${e.g - k * per}`); }
  return bars.map((b) => b.sort().join(','));
}
