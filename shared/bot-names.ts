/** Noms des ordinateurs (tables du 421 et du Courtisan, Coups Fourrés, personnages) : réservés aux inscriptions. */
export const COUNTER_BOTS: { name: string; avatar: string }[] = [
  { name: 'Marcel', avatar: '🐻' }, { name: 'Josiane', avatar: '🦉' }, { name: 'Le Baron', avatar: '🎩' }, { name: 'Lulu', avatar: '🦊' },
  { name: 'Dédé', avatar: '⚓' }, { name: 'Simone', avatar: '🍷' }, { name: 'Gégé', avatar: '🐸' }, { name: 'Fernand', avatar: '🐙' },
  { name: 'Odette', avatar: '🍀' }, { name: 'Raymond', avatar: '🦁' }, { name: 'Huguette', avatar: '🐧' }, { name: 'Firmin', avatar: '🐯' },
];

/** Noms de bistrot originaux pour les ordinateurs de Coups Fourrés. */
export const CF_BOT_NAMES = [
  'Mimile du comptoir', 'Tonton Gaston', 'La Mère Ginette', 'Fredo des Halles', 'Bébert la Tournée', 'Le Grand Raymond',
  'Zézette', 'Momo le Zingueur', 'Riton du Marché', 'Paulette Belote', 'Dédé Deux-Dés', 'Nénette du Port',
];

/** Personnages du jeu contre l'ordinateur (client/src/game/personas.ts ; un test vérifie la correspondance). */
export const PERSONA_NAMES = ['Marcel', 'Josiane', 'Le Baron', 'Lulu', 'Dédé', 'Simone', 'Gégé'];

export const BOT_NAMES: string[] = [...new Set([...COUNTER_BOTS.map((b) => b.name), ...CF_BOT_NAMES, ...PERSONA_NAMES])];
