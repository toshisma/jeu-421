/**
 * Suivi de visite anonyme (statistiques de l'administration) : provenance, page d'arrivée,
 * langue et fuseau horaire du navigateur (pour estimer le pays), temps passé onglet visible.
 * Pas de cookie : l'identifiant d'appareil du jeu, tiré au hasard, est haché par le serveur,
 * qui ne garde aucune adresse IP.
 */
import { SERVER_URL } from './platform';
import { deviceId } from './presence';

const base = () => `${(SERVER_URL ?? '').replace(/\/$/, '')}/api`;
const web = () => /^https?:$/.test(location.protocol);
const post = (path: string, body: object, token?: string | null) => {
  try {
    void fetch(`${base()}${path}`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* hors ligne */ }
};
const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };

/**
 * Adresse d'arrivée, lue dès le chargement : certains paramètres (?parrain, ?tournois…) sont
 * effacés de la barre d'adresse avant l'envoi de la visite, ce qui faisait perdre les utm_*.
 */
const firstSearch = (() => { try { return location.search; } catch { return ''; } })();

let started = false;
export function trackVisit(token?: string | null) {
  if (!web()) return;
  const q = new URLSearchParams(firstSearch);
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) { const v = q.get(k); if (v) utm[k] = v.slice(0, 60); }
  post('/visit', { device: deviceId(), ref: document.referrer || '', utm, lang: navigator.language || '', tz: timeZone(), landing: location.pathname }, token);
  if (['rejoindre', 'tournoi', 'regarder', 'parrain'].some((k) => q.has(k))) trackEvent('invited');
  if (!started) { started = true; startHeartbeat(); }
}

/**
 * Étape du parcours (conversion), comptée une seule fois par visiteur côté serveur :
 * première partie solo, première table en ligne, invitation envoyée, arrivée par invitation,
 * première partie de Coups Fourrés (contre l'ordinateur, guidée, en ligne ou en tournoi).
 */
const sentEvents = new Set<string>();
export function trackEvent(kind: 'solo' | 'online' | 'invite' | 'invited' | 'cards') {
  if (kind === 'solo' || kind === 'online' || kind === 'cards') trackFirstPlay(kind === 'solo' ? '421' : kind === 'cards' ? 'cartes' : 'online');
  if (!web() || sentEvents.has(kind)) return;
  sentEvents.add(kind);
  post('/visit/event', { device: deviceId(), kind });
}

/**
 * Première partie (tableau de bord : « première partie lancée », délai depuis l'arrivée) :
 *  - first_play : une partie démarre (421, Courtisan, Coups Fourrés, table en ligne) ;
 *  - first_roll : le joueur lance lui-même les dés pour la première fois (421, Courtisan).
 * `ms` : temps écoulé depuis l'ouverture de la page ; `via` : bouton « Lancer les dés » de l'accueil,
 * lien direct `?jouer=` (pages d'aide) ou menus. Une seule fois par visiteur (le serveur garde la première).
 */
export type PlayVia = 'accueil' | 'lien' | 'menu';
let via: PlayVia = 'menu';
export function setPlayVia(v: PlayVia) { via = v; }
const sinceArrival = () => { try { return Math.max(0, Math.round(performance.now())); } catch { return null; } };
export function trackFirstPlay(game: '421' | 'courtisan' | 'cartes' | 'poker' | 'online') {
  if (!web() || sentEvents.has('first_play')) return;
  sentEvents.add('first_play');
  post('/visit/event', { device: deviceId(), kind: 'first_play', ms: sinceArrival(), via, game });
}
export function trackFirstRoll() {
  if (!web() || sentEvents.has('first_roll')) return;
  sentEvents.add('first_roll');
  post('/visit/event', { device: deviceId(), kind: 'first_roll', ms: sinceArrival(), via });
}

/** Le visiteur vient de se connecter ou de créer son compte : ses visites sont rattachées (conversion). */
export function linkVisitor(token: string) {
  if (!web()) return;
  post('/visit', { device: deviceId(), link: true }, token);
}

/**
 * Temps passé : compté seulement quand l'onglet est visible, envoyé toutes les 30 s et au masquage
 * (sendBeacon). Le serveur plafonne chaque envoi au temps réellement écoulé.
 */
function startHeartbeat() {
  let since = document.visibilityState === 'visible' ? Date.now() : 0;
  const flush = (beacon = false) => {
    if (!since) return;
    const s = Math.round((Date.now() - since) / 1000);
    since = document.visibilityState === 'visible' ? Date.now() : 0;
    if (s < 1) return;
    const body = JSON.stringify({ device: deviceId(), seconds: Math.min(s, 60) });
    if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(`${base()}/visit/beat`, new Blob([body], { type: 'application/json' }))) return; } catch { /* repli */ } }
    post('/visit/beat', JSON.parse(body));
  };
  setInterval(() => { if (document.visibilityState === 'visible') flush(); }, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
    else since = Date.now();
  });
  window.addEventListener('pagehide', () => flush(true));
}
