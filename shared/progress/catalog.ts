/**
 * Catalogue des objets de personnalisation. Purement cosmétique : aucun objet ne change les
 * règles ni les chances. Chaque objet a un prix en pièces (gagnées en jouant) et un niveau requis.
 * Aucun achat n'est aléatoire : on voit et on essaie l'objet avant de l'acheter.
 */
import { COLLECTION, SPECIAL_DICE, SEASONS, SERIES, SHINY_SUFFIX, seasonDie, type DicePattern, type Rarity } from './dice-collection';

/** Identifiants de formes (voir client/src/physics/trayShapes.ts). */
export type TrayShapeId = 'rectangle' | 'octogone' | 'hexagone' | 'rond' | 'ovale' | 'stade';

export type Category = 'decor' | 'felt' | 'rim' | 'shape' | 'dice' | 'accessoire';

interface Base {
  id: string; name: string; price: number; level: number; description?: string;
  /** Objet d'événement (en vente seulement pendant l'événement) ou du pass de saison (gagné, pas acheté). */
  event?: string;
  pass?: 0 | 1;
}

export interface DecorItem extends Base {
  category: 'decor';
  table: { kind: 'wood' | 'stone' | 'lacquer'; base: string; dark: string };
  background: string;
  lamp: number;
  /** Couleur d'accent de l'interface. */
  accent: string;
}
export type FeltPattern = 'losanges' | 'rayures' | 'tartan' | 'etoiles' | 'damier';
export interface FeltItem extends Base { category: 'felt'; color: string; pattern?: FeltPattern }
export interface RimItem extends Base {
  category: 'rim';
  kind: 'wood' | 'leather' | 'lacquer' | 'metal' | 'marble';
  base: string;
  dark: string;
  cap: string;
  capMetal: boolean;
}
export interface ShapeItem extends Base { category: 'shape'; shape: TrayShapeId }
export interface DiceItem extends Base {
  category: 'dice';
  body: string;
  body2: string;
  pip: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  /** Dé de collection : rareté, motif, effets (voir dice-collection.ts). Jamais en vente. */
  rarity?: Rarity;
  shiny?: boolean;
  accent?: string;
  pattern?: DicePattern;
  glow?: boolean;
  iridescence?: number;
  flavor?: string;
}
/** Accessoire d'avatar : petit emblème posé sur la photo ou l'emoji du joueur. */
export interface AccessoryItem extends Base { category: 'accessoire'; emoji: string }
export type Item = DecorItem | FeltItem | RimItem | ShapeItem | DiceItem | AccessoryItem;

export const CATEGORY_LABELS: Record<Category, string> = {
  decor: 'Décors',
  felt: 'Tapis',
  rim: 'Rebords',
  shape: 'Formes',
  dice: 'Dés',
  accessoire: 'Accessoires',
};

export const ITEMS: Item[] = [
  // --- Décors (salle et table) ---
  { id: 'decor-bistrot', category: 'decor', name: 'Bistrot', price: 0, level: 1, description: 'Comptoir en chêne, lumière chaude.',
    table: { kind: 'wood', base: '#5c3a1e', dark: '#2b1608' }, background: '#1a0f08', lamp: 0xffd9a0, accent: '#e0b15a' },
  { id: 'decor-taverne', category: 'decor', name: 'Taverne', price: 0, level: 1, description: 'Bois sombre et chandelles.',
    table: { kind: 'wood', base: '#2b1a10', dark: '#0c0603' }, background: '#0b0705', lamp: 0xffc070, accent: '#c99a52' },
  { id: 'decor-zinc', category: 'decor', name: 'Comptoir en zinc', price: 300, level: 2, description: 'Le bar parisien, métal patiné.',
    table: { kind: 'stone', base: '#7b7a76', dark: '#4a4945' }, background: '#121214', lamp: 0xffe2b8, accent: '#e2725b' },
  { id: 'decor-terrasse', category: 'decor', name: 'Terrasse', price: 600, level: 4, description: 'Table de marbre au soleil.',
    table: { kind: 'stone', base: '#d9d3c7', dark: '#a39b8c' }, background: '#3a3125', lamp: 0xfff4e0, accent: '#4f8fc0' },
  { id: 'decor-casino', category: 'decor', name: 'Casino', price: 900, level: 6, description: 'Laque noire et dorures.',
    table: { kind: 'lacquer', base: '#141418', dark: '#000000' }, background: '#07090d', lamp: 0xfff1d6, accent: '#d4af37' },
  { id: 'decor-nuit', category: 'decor', name: 'Nuit à Monte-Carlo', price: 1500, level: 8, description: 'Bleu minuit, reflets de néon.',
    table: { kind: 'lacquer', base: '#101a33', dark: '#050914' }, background: '#04060f', lamp: 0xc8d8ff, accent: '#7fb3ff' },
  { id: 'decor-pub', category: 'decor', name: 'Pub irlandais', price: 500, level: 3, description: 'Boiseries vertes, pinte à la main.',
    table: { kind: 'wood', base: '#3a2a18', dark: '#120a04' }, background: '#0c1a12', lamp: 0xffc98a, accent: '#3fae6a' },
  { id: 'decor-chalet', category: 'decor', name: 'Chalet', price: 800, level: 5, description: 'Pin clair et feu de cheminée.',
    table: { kind: 'wood', base: '#c79a62', dark: '#7a5530' }, background: '#2a1c12', lamp: 0xffb070, accent: '#e08a4a' },
  { id: 'decor-plage', category: 'decor', name: 'Bord de mer', price: 1200, level: 7, description: 'Terrasse au soleil, air marin.',
    table: { kind: 'stone', base: '#d8c49a', dark: '#a8916a' }, background: '#1d3b52', lamp: 0xfff8ec, accent: '#4fb3c9' },
  { id: 'decor-neon', category: 'decor', name: 'Arcade néon', price: 1800, level: 9, description: 'Laque noire et lumière rose.',
    table: { kind: 'lacquer', base: '#140a22', dark: '#05020a' }, background: '#08040f', lamp: 0xff8ae0, accent: '#ff4fd8' },
  { id: 'decor-palace', category: 'decor', name: 'Grand palace', price: 3000, level: 12, description: 'Marbre blanc et lustres dorés.',
    table: { kind: 'stone', base: '#ece6da', dark: '#b5a98f' }, background: '#1a1410', lamp: 0xffe3a0, accent: '#e8c060' },
  { id: 'decor-espace', category: 'decor', name: 'Station orbitale', price: 5000, level: 16, description: 'Le 421 en apesanteur (ou presque).',
    table: { kind: 'lacquer', base: '#0b1020', dark: '#000000' }, background: '#000005', lamp: 0x9ad0ff, accent: '#6ad1ff' },

  // --- Tapis ---
  { id: 'felt-vert', category: 'felt', name: 'Vert billard', price: 0, level: 1, color: '#174a30' },
  { id: 'felt-bordeaux', category: 'felt', name: 'Bordeaux', price: 150, level: 1, color: '#5e1620' },
  { id: 'felt-bleu', category: 'felt', name: 'Bleu nuit', price: 150, level: 2, color: '#16294d' },
  { id: 'felt-noir', category: 'felt', name: 'Noir mat', price: 250, level: 3, color: '#1a1a1c' },
  { id: 'felt-violet', category: 'felt', name: 'Violet royal', price: 350, level: 4, color: '#3d1f5c' },
  { id: 'felt-sable', category: 'felt', name: 'Sable', price: 450, level: 5, color: '#a68a5b' },
  { id: 'felt-rouge', category: 'felt', name: 'Rouge vif', price: 400, level: 3, color: '#8e1620' },
  { id: 'felt-turquoise', category: 'felt', name: 'Turquoise', price: 500, level: 4, color: '#11666a' },
  { id: 'felt-losanges', category: 'felt', name: 'Casino à losanges', price: 900, level: 6, color: '#14502f', pattern: 'losanges' },
  { id: 'felt-rayures', category: 'felt', name: 'Rayures club', price: 1100, level: 8, color: '#1d2f5a', pattern: 'rayures' },
  { id: 'felt-tartan', category: 'felt', name: 'Tartan écossais', price: 1400, level: 10, color: '#7a1620', pattern: 'tartan' },
  { id: 'felt-etoiles', category: 'felt', name: 'Ciel étoilé', price: 2000, level: 13, color: '#0e1630', pattern: 'etoiles' },
  { id: 'felt-citrouille', category: 'felt', name: 'Nuit d’Halloween', price: 450, level: 1, event: 'halloween', color: '#3a1d06', pattern: 'etoiles' },
  { id: 'felt-speculoos', category: 'felt', name: 'Spéculoos', price: 500, level: 1, event: 'saint-nicolas', color: '#8a5326', pattern: 'losanges' },
  { id: 'felt-sapin', category: 'felt', name: 'Sapin enneigé', price: 500, level: 1, event: 'fetes', color: '#0f3b26', pattern: 'etoiles' },
  { id: 'felt-confettis', category: 'felt', name: 'Confettis', price: 450, level: 1, event: 'carnaval', color: '#2a1550', pattern: 'etoiles' },
  { id: 'felt-outremeuse', category: 'felt', name: 'Outremeuse', price: 550, level: 1, event: 'outremeuse', color: '#1c3f8a', pattern: 'rayures' },
  { id: 'felt-coq', category: 'felt', name: 'Jaune wallon', price: 500, level: 1, event: 'wallonie', color: '#b8920a', pattern: 'damier' },
  { id: 'felt-pass-nuit', category: 'felt', name: 'Minuit (pass)', price: 0, level: 1, pass: 1, color: '#0b1430', pattern: 'etoiles' },
  { id: 'felt-pass-pourpre', category: 'felt', name: 'Pourpre (pass)', price: 0, level: 1, pass: 1, color: '#4a0f3a', pattern: 'losanges' },
  { id: 'felt-damier', category: 'felt', name: 'Damier', price: 2600, level: 15, color: '#3a1218', pattern: 'damier' },

  // --- Rebords ---
  { id: 'rim-chene', category: 'rim', name: 'Chêne', price: 0, level: 1, kind: 'wood', base: '#8a5a2e', dark: '#4a2a12', cap: '#3a2414', capMetal: false },
  { id: 'rim-noyer', category: 'rim', name: 'Noyer sombre', price: 200, level: 1, kind: 'wood', base: '#3b2416', dark: '#140a04', cap: '#22140a', capMetal: false },
  { id: 'rim-cognac', category: 'rim', name: 'Cuir cognac', price: 300, level: 2, kind: 'leather', base: '#8b4a1f', dark: '#3f1c06', cap: '#c9a46a', capMetal: true },
  { id: 'rim-cuir-noir', category: 'rim', name: 'Cuir noir & laiton', price: 450, level: 3, kind: 'leather', base: '#1b1b1d', dark: '#000000', cap: '#b8913c', capMetal: true },
  { id: 'rim-laque', category: 'rim', name: 'Laque ivoire', price: 700, level: 5, kind: 'lacquer', base: '#ece4d4', dark: '#c9bfa9', cap: '#c8a24a', capMetal: true },
  { id: 'rim-acier', category: 'rim', name: 'Acier brossé', price: 900, level: 7, kind: 'metal', base: '#9da3aa', dark: '#5d636b', cap: '#d6dade', capMetal: true },
  { id: 'rim-bambou', category: 'rim', name: 'Bambou', price: 550, level: 4, kind: 'wood', base: '#c9a46a', dark: '#8a6a3a', cap: '#6b4f2a', capMetal: false },
  { id: 'rim-cuir-rouge', category: 'rim', name: 'Cuir rouge & or', price: 800, level: 6, kind: 'leather', base: '#8e1b1b', dark: '#3a0606', cap: '#d4af37', capMetal: true },
  { id: 'rim-marbre', category: 'rim', name: 'Marbre de Carrare', price: 1500, level: 9, kind: 'marble', base: '#ece7dd', dark: '#9a9282', cap: '#b8913c', capMetal: true },
  { id: 'rim-ebene', category: 'rim', name: 'Ébène & argent', price: 1800, level: 11, kind: 'wood', base: '#2a1c12', dark: '#050302', cap: '#cfd3d8', capMetal: true },
  { id: 'rim-or', category: 'rim', name: 'Or massif', price: 4000, level: 14, kind: 'metal', base: '#d9b44a', dark: '#8a6d1d', cap: '#f5dc86', capMetal: true },

  // --- Formes ---
  { id: 'shape-rectangle', category: 'shape', name: 'Rectangle', price: 0, level: 1, shape: 'rectangle', description: 'La piste traditionnelle.' },
  { id: 'shape-octogone', category: 'shape', name: 'Octogone', price: 500, level: 3, shape: 'octogone', description: 'Huit pans, rebonds imprévisibles.' },
  { id: 'shape-hexagone', category: 'shape', name: 'Hexagone', price: 700, level: 5, shape: 'hexagone', description: 'Six pans, angles vifs.' },
  { id: 'shape-rond', category: 'shape', name: 'Rond', price: 1000, level: 7, shape: 'rond', description: 'Les dés roulent le long du bord.' },
  { id: 'shape-ovale', category: 'shape', name: 'Ovale', price: 1600, level: 10, shape: 'ovale', description: 'Allongé et tout en courbes.' },
  { id: 'shape-stade', category: 'shape', name: 'Stade', price: 2400, level: 13, shape: 'stade', description: 'Deux longs bords droits, deux virages.' },

  // --- Dés ---
  { id: 'dice-ivoire', category: 'dice', name: 'Ivoire classique', price: 0, level: 1, body: '#fbf9f3', body2: '#ebe5d8', pip: '#111111', roughness: 0.32, metalness: 0, clearcoat: 0.55 },
  { id: 'dice-noir', category: 'dice', name: 'Ébène', price: 200, level: 1, body: '#2a2a2c', body2: '#121214', pip: '#f4efe4', roughness: 0.3, metalness: 0, clearcoat: 0.7 },
  { id: 'dice-rouge', category: 'dice', name: 'Rouge casino', price: 300, level: 2, body: '#c4202c', body2: '#8e1019', pip: '#fdf6ea', roughness: 0.22, metalness: 0, clearcoat: 0.9 },
  { id: 'dice-bleu', category: 'dice', name: 'Bleu & or', price: 500, level: 4, body: '#1d3a78', body2: '#0f2048', pip: '#e8c25a', roughness: 0.25, metalness: 0, clearcoat: 0.85 },
  { id: 'dice-jade', category: 'dice', name: 'Jade', price: 800, level: 6, body: '#3a8466', body2: '#24604a', pip: '#fbf8f0', roughness: 0.2, metalness: 0, clearcoat: 1 },
  { id: 'dice-or', category: 'dice', name: 'Or massif', price: 2000, level: 10, body: '#f1cf72', body2: '#b8892c', pip: '#1a1205', roughness: 0.28, metalness: 0.85, clearcoat: 0.4 },
  { id: 'dice-rose', category: 'dice', name: 'Rose bonbon', price: 350, level: 3, body: '#f7a8c8', body2: '#e07aa6', pip: '#4a0f2a', roughness: 0.3, metalness: 0, clearcoat: 0.8 },
  { id: 'dice-bois', category: 'dice', name: 'Bois clair', price: 600, level: 5, body: '#d1a46c', body2: '#a97a48', pip: '#1c1006', roughness: 0.6, metalness: 0, clearcoat: 0.15 },
  { id: 'dice-marbre', category: 'dice', name: 'Marbre', price: 1000, level: 8, body: '#f4f1ea', body2: '#c9c3b6', pip: '#2a2a2a', roughness: 0.18, metalness: 0, clearcoat: 1 },
  { id: 'dice-neon', category: 'dice', name: 'Néon', price: 1200, level: 9, body: '#15151a', body2: '#050508', pip: '#39ff88', roughness: 0.25, metalness: 0, clearcoat: 0.9 },
  { id: 'dice-argent', category: 'dice', name: 'Argent', price: 1600, level: 11, body: '#e4e7ea', body2: '#9aa1a8', pip: '#101418', roughness: 0.25, metalness: 0.9, clearcoat: 0.4 },
  { id: 'dice-obsidienne', category: 'dice', name: 'Obsidienne', price: 2500, level: 13, body: '#1a1418', body2: '#050304', pip: '#f2c75c', roughness: 0.12, metalness: 0.1, clearcoat: 1 },
  // --- Événements (en vente pendant l'événement seulement) ---
  { id: 'dice-citrouille', category: 'dice', name: 'Citrouille', price: 500, level: 1, event: 'halloween', body: '#ee8530', body2: '#c95d14', pip: '#140a02', roughness: 0.4, metalness: 0, clearcoat: 0.5 },
  { id: 'dice-saint-nicolas', category: 'dice', name: 'Saint-Nicolas', price: 600, level: 1, event: 'saint-nicolas', body: '#b3161d', body2: '#740b10', pip: '#f2d27a', roughness: 0.25, metalness: 0, clearcoat: 0.9 },
  { id: 'dice-neige', category: 'dice', name: 'Flocon', price: 600, level: 1, event: 'fetes', body: '#f4fbff', body2: '#cfe6f5', pip: '#2a6fa8', roughness: 0.35, metalness: 0, clearcoat: 0.8 },
  { id: 'dice-carnaval', category: 'dice', name: 'Carnaval', price: 500, level: 1, event: 'carnaval', body: '#7b2ccf', body2: '#4a137f', pip: '#ffd23f', roughness: 0.25, metalness: 0, clearcoat: 0.9 },
  { id: 'dice-peket', category: 'dice', name: 'Péket', price: 700, level: 1, event: 'outremeuse', body: '#eef3ea', body2: '#c8d4c2', pip: '#2f6b3a', roughness: 0.08, metalness: 0.05, clearcoat: 1 },
  { id: 'dice-wallonie', category: 'dice', name: 'Coq hardi', price: 600, level: 1, event: 'wallonie', body: '#f6d42e', body2: '#d9ad12', pip: '#7a0617', roughness: 0.3, metalness: 0, clearcoat: 0.7 },
  // --- Pass de saison (gagnés, pas achetés) ---
  { id: 'dice-pass-cuivre', category: 'dice', name: 'Cuivre (pass)', price: 0, level: 1, pass: 1, body: '#cf8a55', body2: '#a8683a', pip: '#140802', roughness: 0.3, metalness: 0.8, clearcoat: 0.3 },
  { id: 'dice-pass-opale', category: 'dice', name: 'Opale (pass)', price: 0, level: 1, pass: 1, body: '#dff1f2', body2: '#a9c9e8', pip: '#6a3aa0', roughness: 0.1, metalness: 0.1, clearcoat: 1 },
  { id: 'dice-album', category: 'dice', name: 'Collectionneur (album)', price: 0, level: 1, pass: 1, description: 'Pour qui a complété l’album des combinaisons.', body: '#151515', body2: '#000000', pip: '#e8c25a', roughness: 0.15, metalness: 0.3, clearcoat: 1 },
  { id: 'dice-diamant', category: 'dice', name: 'Diamant', price: 6000, level: 18, body: '#eef8ff', body2: '#bcd8ec', pip: '#1b3a5a', roughness: 0.05, metalness: 0.25, clearcoat: 1 },

  // --- Accessoires d'avatar ---
  { id: 'acc-aucun', category: 'accessoire', name: 'Aucun', price: 0, level: 1, emoji: '' },
  { id: 'acc-casquette', category: 'accessoire', name: 'Casquette', price: 150, level: 1, emoji: '🧢' },
  { id: 'acc-lunettes', category: 'accessoire', name: 'Lunettes noires', price: 250, level: 2, emoji: '🕶️' },
  { id: 'acc-rose', category: 'accessoire', name: 'Rose', price: 300, level: 3, emoji: '🌹' },
  { id: 'acc-chope', category: 'accessoire', name: 'Chope', price: 400, level: 4, emoji: '🍺' },
  { id: 'acc-trefle', category: 'accessoire', name: 'Trèfle', price: 500, level: 5, emoji: '🍀' },
  { id: 'acc-haut-de-forme', category: 'accessoire', name: 'Haut-de-forme', price: 800, level: 7, emoji: '🎩' },
  { id: 'acc-moustache', category: 'accessoire', name: 'Moustache', price: 1200, level: 9, emoji: '🥸' },
  { id: 'acc-couronne', category: 'accessoire', name: 'Couronne', price: 3000, level: 15, emoji: '👑' },
  { id: 'acc-diamant', category: 'accessoire', name: 'Diamant', price: 5000, level: 18, emoji: '💎' },
  { id: 'acc-citrouille', category: 'accessoire', name: 'Citrouille', price: 300, level: 1, event: 'halloween', emoji: '🎃' },
  { id: 'acc-mandarine', category: 'accessoire', name: 'Mandarine', price: 300, level: 1, event: 'saint-nicolas', emoji: '🍊' },
  { id: 'acc-sapin', category: 'accessoire', name: 'Sapin', price: 300, level: 1, event: 'fetes', emoji: '🎄' },
  { id: 'acc-masque', category: 'accessoire', name: 'Masque', price: 300, level: 1, event: 'carnaval', emoji: '🎭' },
  { id: 'acc-peket', category: 'accessoire', name: 'Petit péket', price: 350, level: 1, event: 'outremeuse', emoji: '🥃' },
  { id: 'acc-coq', category: 'accessoire', name: 'Coq hardi', price: 350, level: 1, event: 'wallonie', emoji: '🐓' },
  { id: 'acc-pass-etoile', category: 'accessoire', name: 'Étoile (pass)', price: 0, level: 1, pass: 1, emoji: '⭐' },
  { id: 'acc-pass-feu', category: 'accessoire', name: 'Flamme (pass)', price: 0, level: 1, pass: 1, emoji: '🔥' },
];

// Dés de collection (trouvés dans les sacs) et leur version brillante.
for (const c of COLLECTION) {
  const base = { category: 'dice' as const, price: 0, level: 1, pass: 1 as const, rarity: c.rarity, body: c.body, body2: c.body2, pip: c.pip,
    roughness: c.roughness, metalness: c.metalness, clearcoat: c.clearcoat, accent: c.accent, pattern: c.pattern, glow: c.glow, flavor: c.flavor };
  ITEMS.push({ ...base, id: c.id, name: c.name, iridescence: c.iridescence });
  ITEMS.push({ ...base, id: c.id + SHINY_SUFFIX, name: `${c.name} brillant`, shiny: true, iridescence: 1, clearcoat: 1 });
}

// Dés de saison (classement mensuel) : jamais en vente, jamais dans les sacs.
for (const season of SEASONS) {
  const c = seasonDie(season);
  ITEMS.push({ id: c.id, category: 'dice', name: c.name, price: 0, level: 1, pass: 1, rarity: c.rarity, body: c.body, body2: c.body2, pip: c.pip,
    roughness: c.roughness, metalness: c.metalness, clearcoat: c.clearcoat, accent: c.accent, pattern: c.pattern, flavor: c.flavor });
}
// Dés « Feu et Glace » du parrainage : jamais en vente, jamais dans les sacs.
for (const c of SPECIAL_DICE) {
  ITEMS.push({ id: c.id, category: 'dice', name: c.name, price: 0, level: 1, pass: 1, rarity: c.rarity, body: c.body, body2: c.body2, pip: c.pip,
    roughness: c.roughness, metalness: c.metalness, clearcoat: c.clearcoat, accent: c.accent, pattern: c.pattern, glow: c.glow, iridescence: c.iridescence, flavor: c.flavor });
}
// Tapis des séries de collection complétées.
const SERIES_FELTS: Record<string, { color: string; pattern?: FeltPattern }> = {
  comptoir: { color: '#6b4a2b', pattern: 'damier' }, sucreries: { color: '#c96a9a', pattern: 'losanges' }, atelier: { color: '#2a5d8a', pattern: 'rayures' },
  pierres: { color: '#0f5a46', pattern: 'losanges' }, legendes: { color: '#1b1640', pattern: 'etoiles' },
};
for (const s of SERIES) ITEMS.push({ id: s.felt, category: 'felt', name: `${s.name} (série)`, price: 0, level: 1, pass: 1, color: SERIES_FELTS[s.id].color, pattern: SERIES_FELTS[s.id].pattern, description: `Pour qui a complété la série « ${s.name} ».` });

export interface Appearance { decor: string; felt: string; rim: string; shape: string; dice: string; accessoire: string }

export const DEFAULT_APPEARANCE: Appearance = {
  decor: 'decor-bistrot', felt: 'felt-vert', rim: 'rim-chene', shape: 'shape-rectangle', dice: 'dice-ivoire', accessoire: 'acc-aucun',
};

const byId = new Map(ITEMS.map((i) => [i.id, i]));
export function getItem(id: string): Item | undefined { return byId.get(id); }
export function itemsOf<C extends Category>(c: C): Extract<Item, { category: C }>[] {
  return ITEMS.filter((i) => i.category === c) as Extract<Item, { category: C }>[];
}

/** Objets complets de l'apparence, avec repli sur l'objet par défaut si un identifiant est inconnu. */
export function resolveAppearance(a: Partial<Appearance> | undefined) {
  const pick = <C extends Category>(c: C) => {
    const it = getItem(a?.[c] ?? '');
    return (it && it.category === c ? it : getItem(DEFAULT_APPEARANCE[c])!) as Extract<Item, { category: C }>;
  };
  return { decor: pick('decor'), felt: pick('felt'), rim: pick('rim'), shape: pick('shape'), dice: pick('dice'), accessoire: pick('accessoire') };
}
export type ResolvedAppearance = ReturnType<typeof resolveAppearance>;

/** Objets du pass de saison du mois (alternent d'un mois à l'autre). */
export function passItems(seasonId: string): { accessoire: string; felt: string; dice: string } {
  return Number(seasonId.slice(5, 7)) % 2 === 0
    ? { accessoire: 'acc-pass-etoile', felt: 'felt-pass-nuit', dice: 'dice-pass-cuivre' }
    : { accessoire: 'acc-pass-feu', felt: 'felt-pass-pourpre', dice: 'dice-pass-opale' };
}
/** Emoji de l'accessoire équipé (vide si aucun). */
export const accessoryEmoji = (id: string | undefined) => { const it = id ? byId.get(id) : undefined; return it && it.category === 'accessoire' ? it.emoji : ''; };
