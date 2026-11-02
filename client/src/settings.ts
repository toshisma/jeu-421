import type { Difficulty } from '../../shared/ai';
import type { Quality } from './three/TrayScene';
import { AVATARS } from '../../shared/protocol';

export interface Settings {
  name: string;
  avatar: string;
  volume: number;
  muted: boolean;
  vibrate: boolean;
  shake: boolean;
  quality: Quality;
  difficulty: Difficulty;
  /** Lancer au gobelet (sinon, les dés partent de la main). */
  cup: boolean;
}

const KEY = '421.settings';
export const DEFAULT_SETTINGS: Settings = {
  name: '',
  avatar: AVATARS[0],
  volume: 0.8,
  muted: false,
  vibrate: true,
  shake: true,
  quality: 'haute',
  difficulty: 'normal',
  cup: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ }
}

/** Session multijoueur mémorisée pour la reconnexion (rechargement de page, perte réseau). */
export interface SavedSession { code: string; token: string; /** Session de tournoi (le code est celui du tournoi). */ tournament?: boolean }
const SKEY = '421.session';
export function loadSession(): SavedSession | null {
  try { const r = localStorage.getItem(SKEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function saveSession(s: SavedSession | null) {
  try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch { /* */ }
}
