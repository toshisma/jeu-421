/**
 * Dés de collection : ils ne s'achètent pas, on les trouve dans des sacs gagnés en jouant.
 * Quatre raretés, et une version « brillante » très rare de chaque dé.
 * Purement cosmétique : aucun dé ne change les règles ni le hasard des lancers.
 */
export type Rarity = 'commun' | 'rare' | 'epique' | 'legendaire';
export type DicePattern = 'uni' | 'marbre' | 'paillettes' | 'bois' | 'rayures' | 'ecaille' | 'galaxie' | 'craquele' | 'nacre' | 'degrade' | 'filigrane';

export const RARITIES: Rarity[] = ['commun', 'rare', 'epique', 'legendaire'];
export const RARITY_LABEL: Record<Rarity, string> = { commun: 'Commun', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };
/** Couleurs des raretés (interface). */
export const RARITY_COLOR: Record<Rarity, string> = { commun: '#9aa5ab', rare: '#4f9dff', epique: '#b26bff', legendaire: '#f2b632' };
/** Chances à l'ouverture d'un sac (total 1). */
export const RARITY_ODDS: Record<Rarity, number> = { commun: 0.66, rare: 0.25, epique: 0.08, legendaire: 0.01 };
/** Une chance sur 150 que le dé tiré soit brillant. */
export const SHINY_ODDS = 1 / 150;
/** Éclats rendus par un doublon (doublés pour un brillant). */
export const SHARDS_FOR_DUPLICATE: Record<Rarity, number> = { commun: 5, rare: 15, epique: 50, legendaire: 200 };
/** Prix en éclats pour fabriquer un dé (pas les brillants). */
export const CRAFT_COST: Record<Rarity, number> = { commun: 40, rare: 120, epique: 400, legendaire: 1500 };

export interface CollectionDie {
  id: string;
  name: string;
  rarity: Rarity;
  body: string;
  body2: string;
  pip: string;
  /** Couleur du motif. */
  accent?: string;
  pattern?: DicePattern;
  roughness: number;
  metalness: number;
  clearcoat: number;
  /** Points et motif lumineux. */
  glow?: boolean;
  /** Reflets irisés. */
  iridescence?: number;
  flavor: string;
}

const d = (id: string, name: string, rarity: Rarity, body: string, body2: string, pip: string, extra: Partial<CollectionDie> & { flavor: string }): CollectionDie =>
  ({ id: `dc-${id}`, name, rarity, body, body2, pip, roughness: 0.3, metalness: 0, clearcoat: 0.7, pattern: 'uni', ...extra });

export const COLLECTION: CollectionDie[] = [
  // --- Communs ---
  d('craie', 'Craie', 'commun', '#f6f4ee', '#dedad0', '#1d3c8f', { flavor: 'Celle qui sert à noter les tournées sur l’ardoise.' }),
  d('ardoise', 'Ardoise', 'commun', '#434c53', '#2b3237', '#f4efe4', { roughness: 0.55, clearcoat: 0.3, flavor: 'Le menu du jour, sans le plat.' }),
  d('brique', 'Brique', 'commun', '#b5523b', '#8c3a28', '#fff6e6', { roughness: 0.5, clearcoat: 0.3, flavor: 'Comme les façades d’Outremeuse.' }),
  d('menthe', 'Menthe à l’eau', 'commun', '#a4e3c8', '#74c5a5', '#0c3527', { flavor: 'Pour ceux qui conduisent.' }),
  d('moutarde', 'Moutarde', 'commun', '#e8b53a', '#bf8c1a', '#271903', { flavor: 'Elle monte au nez quand on perd.' }),
  d('lavande', 'Lavande', 'commun', '#bcabe8', '#9682d1', '#24124a', { flavor: 'Doux comme un dimanche matin.' }),
  d('pistache', 'Pistache', 'commun', '#cde193', '#a6c163', '#253309', { flavor: 'Toujours une coque au fond du bol.' }),
  d('corail', 'Corail', 'commun', '#ff907a', '#e56852', '#340a04', { flavor: 'Un air de vacances au comptoir.' }),
  d('sable', 'Sable', 'commun', '#ead9b4', '#cfb98c', '#33230b', { flavor: 'Plage de la Boverie, version dé.' }),
  d('cerise', 'Cerise', 'commun', '#8e1b3a', '#5f0f26', '#ffe6ec', { clearcoat: 0.9, flavor: 'Comme sur le gâteau.' }),
  // --- Rares ---
  d('marbre-vert', 'Marbre vert', 'rare', '#2f6b55', '#1d4a3a', '#fbf8ef', { accent: '#cfeee0', pattern: 'marbre', roughness: 0.15, clearcoat: 1, flavor: 'Taillé dans un ancien comptoir.' }),
  d('paillettes', 'Paillettes', 'rare', '#2a2f6b', '#161a45', '#ffffff', { accent: '#d6deff', pattern: 'paillettes', clearcoat: 1, flavor: 'Sorti tout droit du carnaval.' }),
  d('chene', 'Vieux chêne', 'rare', '#c99560', '#a3713f', '#150b03', { accent: '#5e3b1d', pattern: 'bois', roughness: 0.55, clearcoat: 0.2, flavor: 'Le bois du bac de grand-père.' }),
  d('transat', 'Transat', 'rare', '#f6f1e6', '#e6dfd0', '#b3201a', { accent: '#2a78c2', pattern: 'rayures', flavor: 'Rayé comme une chaise de plage.' }),
  d('tortue', 'Écaille', 'rare', '#6b3a17', '#3c1f0a', '#fff0d2', { accent: '#c58a3e', pattern: 'ecaille', clearcoat: 1, roughness: 0.15, flavor: 'Comme les lunettes du patron.' }),
  d('grenat', 'Grenat', 'rare', '#7a1023', '#4a0814', '#f2c75c', { clearcoat: 1, roughness: 0.12, metalness: 0.15, flavor: 'Une pierre de la couronne, paraît-il.' }),
  d('crepuscule', 'Crépuscule', 'rare', '#b8401f', '#6e1a4a', '#fff4e0', { accent: '#6e1a4a', pattern: 'degrade', clearcoat: 0.9, flavor: 'L’heure de la dernière tournée.' }),
  // --- Épiques ---
  d('galaxie', 'Galaxie', 'epique', '#1d1846', '#07051a', '#ffffff', { accent: '#a8b8ff', pattern: 'galaxie', clearcoat: 1, roughness: 0.1, flavor: 'Des étoiles plein le bac.' }),
  d('lave', 'Coulée de lave', 'epique', '#1c100c', '#0a0504', '#ffd27a', { accent: '#ff6a1a', pattern: 'craquele', glow: true, roughness: 0.6, clearcoat: 0.2, flavor: 'Chaud devant !' }),
  d('nacre', 'Nacre', 'epique', '#f3eff9', '#d8d0ea', '#2f1f63', { accent: '#bfe6f0', pattern: 'nacre', iridescence: 1, clearcoat: 1, roughness: 0.08, flavor: 'Tirée d’une huître de Zeebrugge.' }),
  d('givre', 'Givre', 'epique', '#e2f5ff', '#a9d6f2', '#0b3560', { accent: '#ffffff', pattern: 'craquele', clearcoat: 1, roughness: 0.05, flavor: 'Il fait froid sur la terrasse.' }),
  d('malachite', 'Malachite', 'epique', '#1f7a52', '#0e4a30', '#ffffff', { accent: '#8ae0b5', pattern: 'marbre', clearcoat: 1, roughness: 0.1, flavor: 'Une pierre qui porte chance.' }),
  // --- Légendaires ---
  d('perron', 'Perron d’or', 'legendaire', '#f3d47a', '#b8892c', '#5a0a0a', { accent: '#fff1b8', pattern: 'filigrane', metalness: 0.85, roughness: 0.22, clearcoat: 0.5, flavor: 'Le symbole de Liège, en or massif.' }),
  d('dragon', 'Dragon', 'legendaire', '#7a0d12', '#3a0507', '#ffd166', { accent: '#e8a33a', pattern: 'ecaille', glow: true, clearcoat: 1, roughness: 0.2, flavor: 'Il crache le 4-2-1.' }),
  d('aurore', 'Aurore boréale', 'legendaire', '#0b1a2e', '#03070f', '#effffb', { accent: '#5cffc8', pattern: 'galaxie', glow: true, iridescence: 1, clearcoat: 1, roughness: 0.08, flavor: 'Vu une seule fois au-dessus de la Meuse.' }),
];

export const SHINY_SUFFIX = '-brillant';
export const isShiny = (id: string) => id.endsWith(SHINY_SUFFIX);
export const baseIdOf = (id: string) => (isShiny(id) ? id.slice(0, -SHINY_SUFFIX.length) : id);
const byId = new Map(COLLECTION.map((c) => [c.id, c]));
/** Dé de collection (ou sa version brillante). */
export function collectionDie(id: string): CollectionDie | undefined { return byId.get(baseIdOf(id)); }

/** Luminance relative (WCAG) d'une couleur #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/** Rapport de contraste (1 à 21) entre deux couleurs. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
