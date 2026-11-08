/**
 * Présence : une connexion légère au serveur tant que l'application est ouverte, pour que les
 * statistiques publiques comptent les joueurs réellement en ligne. Aucune donnée personnelle :
 * un identifiant d'appareil tiré au hasard (pour ne pas compter deux fois deux onglets) et
 * l'écran en cours (menu, partie solo, jeu en ligne).
 *
 * Depuis 0.48, l'état envoyé précise aussi l'écran (« shop », « cf »…), la vue du mode
 * (salon, partie, collection…), le code de table quand il y en a un, et, pour un invité, le nom
 * qu'il a choisi et son avatar : l'administration voit ainsi qui est en ligne et où. Envoyé
 * seulement quand ça change (regroupé sur 300 ms). Le serveur accepte toujours l'ancien format
 * (simple texte) des onglets restés ouverts sur une version précédente.
 */
import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { SERVER_URL } from './platform';

export type PresenceState = 'menu' | 'solo' | 'online';
/**
 * Vue précise à l'intérieur d'un écran : « salon », « partie », « partie-solo », « spectateur »,
 * « attente », « collection », « decks », « ligue », « tournoi », « enigme », « regles »…
 * Un état peut l'accompagner (sinon : celui de l'écran).
 */
export interface PresenceLayer {
  view: string; code?: string; state?: PresenceState;
  /**
   * Niveau : 1 pour le routeur d'un mode (menu du Courtisan, de Coups Fourrés), 2 (défaut) pour une
   * table ou une partie. Le plus précis l'emporte, quel que soit l'ordre de montage (React monte les
   * enfants avant les parents).
   */
  depth?: number;
}

const KEY = '421.appareil';
let socket: Socket | null = null;
let state: PresenceState = 'menu';
let screen = 'home';
let seq = 0;
const layers: { id: number; l: PresenceLayer }[] = [];

export function deviceId(): string {
  try {
    let d = localStorage.getItem(KEY);
    if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
      d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(KEY, d);
    }
    return d;
  } catch { return 'sans-stockage'; }
}

/** Nom affiché et avatar choisis dans les réglages (utiles pour reconnaître un invité). */
function identity(): { name?: string; avatar?: string } {
  try {
    const s = JSON.parse(localStorage.getItem('421.settings') ?? 'null') as { name?: unknown; avatar?: unknown } | null;
    return {
      name: typeof s?.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 20) : undefined,
      avatar: typeof s?.avatar === 'string' && s.avatar ? s.avatar.slice(0, 8) : undefined,
    };
  } catch { return {}; }
}

function current() {
  let top: PresenceLayer | undefined;
  for (const { l } of layers) if (!top || (l.depth ?? 2) >= (top.depth ?? 2)) top = l;
  return { state: top?.state ?? state, screen, ...(top?.view ? { view: top.view } : {}), ...(top?.code ? { code: top.code } : {}), ...identity() };
}
let lastSent = '';
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  timer = null;
  if (!socket?.connected) return;
  const c = current();
  const k = JSON.stringify(c);
  if (k === lastSent) return;
  lastSent = k;
  socket.emit('presence', c);
}
const schedule = () => { if (!timer) timer = setTimeout(flush, 300); };

let starting = false;
/** La bibliothèque Socket.IO est chargée à part (après l'affichage de l'accueil). */
export function startPresence() {
  if (socket || starting) return;
  starting = true;
  import('socket.io-client').then(({ io }) => { starting = false; if (!socket) openPresence(io); }, () => { starting = false; });
}
function openPresence(io: typeof import('socket.io-client').io) {
  try {
    const url = `${(SERVER_URL ?? '').replace(/\/$/, '')}/presence`;
    const token = (() => { try { return JSON.parse(localStorage.getItem('421.compte') ?? 'null')?.token; } catch { return undefined; } })();
    socket = io(url, { auth: { device: deviceId(), token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => { lastSent = ''; flush(); });
    socket.on('account:banned', ({ text }: { text: string }) => window.dispatchEvent(new CustomEvent('421:banned', { detail: text })));
  } catch { socket = null; }
}

/** État général (menu / solo / en ligne) et, si donné, l'écran affiché. */
export function setPresence(s: PresenceState, scr?: string) {
  state = s;
  if (scr) screen = scr;
  schedule();
}

/** Vue précise d'un écran, tant que le composant est affiché (la dernière posée l'emporte). */
export function pushPresence(l: PresenceLayer): () => void {
  const id = ++seq;
  layers.push({ id, l });
  schedule();
  return () => {
    const i = layers.findIndex((x) => x.id === id);
    if (i >= 0) layers.splice(i, 1);
    schedule();
  };
}
/** Raccourci React de pushPresence (null : rien à préciser). */
export function usePresenceLayer(l: PresenceLayer | null) {
  const view = l?.view, code = l?.code, st = l?.state, depth = l?.depth;
  useEffect(() => (view ? pushPresence({ view, code, state: st, depth }) : undefined), [view, code, st, depth]);
}

/** Après connexion ou déconnexion d'un compte : la présence repart avec le bon compte. */
export function restartPresence() {
  if (!socket) return; // pas encore connecté : la connexion lira le bon compte
  socket.disconnect(); socket = null;
  startPresence();
}
