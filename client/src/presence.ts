/**
 * Présence : une connexion légère au serveur tant que l'application est ouverte, pour que les
 * statistiques publiques comptent les joueurs réellement en ligne. Aucune donnée personnelle :
 * un identifiant d'appareil tiré au hasard (pour ne pas compter deux fois deux onglets) et
 * l'écran en cours (menu, partie solo, jeu en ligne).
 */
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from './platform';

export type PresenceState = 'menu' | 'solo' | 'online';
const KEY = '421.appareil';
let socket: Socket | null = null;
let state: PresenceState = 'menu';

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

export function startPresence() {
  if (socket) return;
  try {
    const url = `${(SERVER_URL ?? '').replace(/\/$/, '')}/presence`;
    socket = io(url, { auth: { device: deviceId() }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket?.emit('presence', state));
  } catch { socket = null; }
}

export function setPresence(s: PresenceState) {
  if (s === state) return;
  state = s;
  socket?.emit('presence', s);
}
