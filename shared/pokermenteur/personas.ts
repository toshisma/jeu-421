/**
 * Habitués du comptoir pour le Poker menteur contre l'ordinateur (personnages originaux). Leurs
 * répliques sont dans la zone de textes `poker` : `pm.p.<id>.menteur` (il crie), `.gagne` (il a eu
 * raison), `.perd` (il perd une vie), `.tag` (présentation).
 */
export interface PmPersona { id: string; name: string; avatar: string; color: string; /** Temps de réflexion moyen (ms). */ tempo: number }
export const PM_PERSONAS: PmPersona[] = [
  { id: 'gege', name: 'Gégé', avatar: '🧔', color: '#e2694f', tempo: 900 },
  { id: 'lulu', name: 'Mamie Lulu', avatar: '👵', color: '#a477d6', tempo: 1500 },
  { id: 'raymond', name: 'Raymond', avatar: '👴', color: '#4f9fd1', tempo: 1300 },
  { id: 'josy', name: 'Josy', avatar: '👩‍🦰', color: '#e0609a', tempo: 1000 },
  { id: 'bebert', name: 'Bébert', avatar: '🧑‍🔧', color: '#57b07a', tempo: 800 },
  { id: 'fernand', name: 'Maître Fernand', avatar: '🎩', color: '#f1cc7d', tempo: 1700 },
];
