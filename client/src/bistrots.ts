/**
 * Bistrots entre amis : lien d'invitation `/?bistrot=CODE` (gardé jusqu'à ce que le joueur entre, même
 * s'il doit d'abord créer un compte) et `/?bistrot-ouvrir=1` (notification) qui ouvre l'écran Amis.
 */
import { cleanBistrotCode } from '../../shared/bistrots';
import { keptLangSearch } from './i18n/lang';

const KEY = '421.bistrot';

/** Lit l'adresse au démarrage : true s'il faut ouvrir l'écran Amis (où vivent les bistrots). */
export function captureBistrotLink(): boolean {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  const code = cleanBistrotCode(q.get('bistrot'));
  const open = q.has('bistrot-ouvrir');
  if (!code && !open) return false;
  if (code) { try { localStorage.setItem(KEY, code); } catch { /* navigation privée */ } }
  if (/^https?:$/.test(location.protocol)) { try { history.replaceState(null, '', `/${keptLangSearch()}`); } catch { /* aperçu intégré */ } }
  return true;
}
export function pendingBistrot(): string | null {
  try { return cleanBistrotCode(localStorage.getItem(KEY)); } catch { return null; }
}
export function clearPendingBistrot() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
}
/** Lien à partager. */
export const bistrotLink = (code: string) => `${typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.origin : 'https://421online.com'}/?bistrot=${code}`;
