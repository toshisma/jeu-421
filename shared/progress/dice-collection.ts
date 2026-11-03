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
/**
 * Dés « Feu et Glace » : jamais dans les sacs ni en fabrication. Le set complet est offert au parrain
 * dont INVITE_SET_FRIENDS filleuls ont joué INVITE_SET_GAMES parties chacun.
 */
export const INVITE_SET_FRIENDS = 5;
export const INVITE_SET_GAMES = 3;
export const INVITE_DICE: CollectionDie[] = [
  { id: 'dl-dragon-braise', name: 'Dragon de braise', rarity: 'legendaire', body: '#1a0d0a', body2: '#5a1408', pip: '#ffb347', accent: '#ff4d1a', pattern: 'ecaille',
    roughness: 0.25, metalness: 0.35, clearcoat: 1, glow: true, flavor: 'Ses écailles sont encore chaudes. Ne le laissez pas sur le comptoir.' },
  { id: 'dl-dragon-givre', name: 'Dragon de givre', rarity: 'legendaire', body: '#dff3ff', body2: '#6fb3e0', pip: '#0b2a5c', accent: '#2e7fd1', pattern: 'ecaille',
    roughness: 0.1, metalness: 0.2, clearcoat: 1, iridescence: 0.8, flavor: 'Né dans le blizzard, il glace les verres qu’il effleure.' },
  { id: 'dl-loup-nord', name: 'Loup du Grand Nord', rarity: 'legendaire', body: '#2f3a44', body2: '#1a232b', pip: '#f4f8fb', accent: '#9fd8ff', pattern: 'craquele',
    roughness: 0.4, metalness: 0.15, clearcoat: 0.8, glow: true, flavor: 'L’hiver vient toujours avant la tournée suivante.' },
];
const inviteById = new Map(INVITE_DICE.map((c) => [c.id, c]));
export const isInviteDie = (id: string) => inviteById.has(baseIdOf(id));

export function collectionDie(id: string): CollectionDie | undefined {
  const b = baseIdOf(id);
  return byId.get(b) ?? inviteById.get(b) ?? (/^ds-\d{4}-\d{2}$/.test(b) && SEASONS.includes(b.slice(3)) && !isShiny(id) ? seasonDie(b.slice(3)) : undefined);
}

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

// ---------------------------------------------------------------------------------------------
// Effets de lancer : traînée derrière les dés, célébration du 4-2-1. Trouvés dans les sacs.

export type FxKind = 'trainee' | 'fete';
export interface FxDef { id: string; kind: FxKind; name: string; rarity: Rarity; colors: string[]; flavor: string }
export const FX_KIND_LABEL: Record<FxKind, string> = { trainee: 'Traînée de lancer', fete: 'Célébration du 4-2-1' };
export const FX: FxDef[] = [
  { id: 'fx-poussiere', kind: 'trainee', name: 'Poussière de craie', rarity: 'commun', colors: ['#f1ede4', '#cfc8b8'], flavor: 'Les dés laissent un petit nuage blanc.' },
  { id: 'fx-bulles', kind: 'trainee', name: 'Bulles', rarity: 'commun', colors: ['#bfe8ff', '#7fc8f0'], flavor: 'Comme dans une bière fraîche.' },
  { id: 'fx-etincelles', kind: 'trainee', name: 'Étincelles', rarity: 'rare', colors: ['#ffe08a', '#ffb02e'], flavor: 'Ça frotte sur le feutre.' },
  { id: 'fx-confettis', kind: 'trainee', name: 'Confettis', rarity: 'rare', colors: ['#ff5d73', '#ffd23f', '#3ec1d3', '#7bd389'], flavor: 'Le carnaval dans le bac.' },
  { id: 'fx-flammes', kind: 'trainee', name: 'Flammes', rarity: 'epique', colors: ['#ffd166', '#ff7a1a', '#e2361b'], flavor: 'Des dés en feu.' },
  { id: 'fx-etoiles', kind: 'trainee', name: 'Poussière d’étoiles', rarity: 'epique', colors: ['#ffffff', '#b7c8ff', '#8fe3ff'], flavor: 'Une comète à chaque lancer.' },
  { id: 'fx-arc-en-ciel', kind: 'trainee', name: 'Arc-en-ciel', rarity: 'legendaire', colors: ['#ff4d4d', '#ffa64d', '#ffe14d', '#59d97a', '#4db8ff', '#9d6bff'], flavor: 'Toutes les couleurs, à chaque lancer.' },
  { id: 'fx-bravo', kind: 'fete', name: 'Bravo !', rarity: 'commun', colors: ['#ffd23f', '#ffffff'], flavor: 'Une gerbe de confettis.' },
  { id: 'fx-ballons', kind: 'fete', name: 'Ballons', rarity: 'rare', colors: ['#ff5d73', '#3ec1d3', '#ffd23f', '#9d6bff'], flavor: 'Les ballons montent au plafond.' },
  { id: 'fx-eclair', kind: 'fete', name: 'Coup de tonnerre', rarity: 'epique', colors: ['#fff6b0', '#8fb4ff'], flavor: 'Un éclair traverse le bistrot.' },
  { id: 'fx-pluie-or', kind: 'fete', name: 'Pluie d’or', rarity: 'epique', colors: ['#ffe08a', '#d4ad2f', '#b8892c'], flavor: 'Il pleut des pièces.' },
  { id: 'fx-feu-artifice', kind: 'fete', name: 'Feu d’artifice', rarity: 'legendaire', colors: ['#ff4d4d', '#ffe14d', '#4db8ff', '#9d6bff', '#59d97a'], flavor: 'Comme le 15 août en Outremeuse.' },
];
/** Part des sacs qui contiennent un effet plutôt qu'un dé. */
export const FX_SHARE = 0.25;
/** Traînées lumineuses (mélange additif) ; les autres sont mates (poussière, bulles, confettis). */
export const fxGlows = (id: string | undefined) => !!id && !['fx-poussiere', 'fx-bulles', 'fx-confettis'].includes(id);
const fxById = new Map(FX.map((f) => [f.id, f]));
export function fxDef(id: string | undefined): FxDef | undefined { return id ? fxById.get(id) : undefined; }

// ---------------------------------------------------------------------------------------------
// Séries : compléter une série donne un titre et un tapis exclusif.

export interface SeriesDef { id: string; name: string; title: string; dice: string[]; felt: string }
export const SERIES: SeriesDef[] = [
  { id: 'comptoir', name: 'Au comptoir', title: 'Pilier de comptoir', dice: ['dc-craie', 'dc-ardoise', 'dc-brique', 'dc-sable', 'dc-moutarde'], felt: 'felt-serie-comptoir' },
  { id: 'sucreries', name: 'Sucreries', title: 'Bec sucré', dice: ['dc-menthe', 'dc-lavande', 'dc-pistache', 'dc-corail', 'dc-cerise'], felt: 'felt-serie-sucreries' },
  { id: 'atelier', name: 'L’atelier', title: 'Artisan du dé', dice: ['dc-chene', 'dc-transat', 'dc-tortue', 'dc-paillettes', 'dc-crepuscule'], felt: 'felt-serie-atelier' },
  { id: 'pierres', name: 'Pierres précieuses', title: 'Joaillier', dice: ['dc-grenat', 'dc-marbre-vert', 'dc-malachite', 'dc-nacre', 'dc-givre'], felt: 'felt-serie-pierres' },
  { id: 'legendes', name: 'Légendes', title: 'Légende du 421', dice: ['dc-galaxie', 'dc-lave', 'dc-perron', 'dc-dragon', 'dc-aurore'], felt: 'felt-serie-legendes' },
];

// ---------------------------------------------------------------------------------------------
// Dé de saison : un dé épique par mois, donné en fin de saison classée, introuvable ensuite.

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SEASON_LOOKS: [string, string, string, string, DicePattern][] = [
  ['#e8f4ff', '#b6d4ef', '#0d2f57', '#ffffff', 'paillettes'], // janvier : givre
  ['#5a1030', '#2e0617', '#ffd0e0', '#ff7aa8', 'nacre'],
  ['#2f7a4a', '#174d2c', '#fff7d6', '#b8f0c8', 'marbre'],
  ['#ffe6f0', '#f2b6cf', '#5a1030', '#ffffff', 'paillettes'],
  ['#ffd75e', '#e0a91a', '#3a2300', '#fff4c0', 'filigrane'],
  ['#c4451a', '#8a2a10', '#fff1e0', '#8a2a10', 'degrade'],
  ['#1660a8', '#0a3566', '#ffffff', '#7fc8ff', 'rayures'],
  ['#c22f2f', '#7a1414', '#ffe3b0', '#ffb347', 'craquele'],
  ['#8a5a2e', '#5a3818', '#ffe9c8', '#c99560', 'bois'],
  ['#3a1a5c', '#170a26', '#ffb347', '#ff7a1a', 'galaxie'],
  ['#4a2c18', '#24140a', '#f2c75c', '#c98a3e', 'ecaille'],
  ['#0e4a30', '#06261a', '#ffffff', '#e8343a', 'paillettes'],
];
export function seasonDie(season: string): CollectionDie {
  const m = Number(season.slice(5, 7)) - 1;
  const [body, body2, pip, accent, pattern] = SEASON_LOOKS[((m % 12) + 12) % 12];
  return { id: `ds-${season}`, name: `Saison de ${MONTHS[m]} ${season.slice(0, 4)}`, rarity: 'epique', body, body2, pip, accent, pattern,
    roughness: 0.2, metalness: 0.1, clearcoat: 1, flavor: 'Donné à la fin de la saison classée. Introuvable ensuite.' };
}
/** Saisons pour lesquelles un dé existe (de novembre 2026 à fin 2029). */
export const SEASONS: string[] = (() => { const out: string[] = []; for (let y = 2026; y <= 2029; y++) for (let m = 1; m <= 12; m++) if (y > 2026 || m >= 11) out.push(`${y}-${String(m).padStart(2, '0')}`); return out; })();
export const isSeasonDie = (id: string) => /^ds-\d{4}-\d{2}$/.test(id);
