/**
 * Suivi de visite anonyme (statistiques de l'administration) : provenance, page d'arrivée,
 * langue du navigateur. Pas de cookie : l'identifiant d'appareil du jeu est haché par le serveur,
 * qui ne garde aucune adresse IP. Une visite au plus par demi-heure (filtré par le serveur).
 */
import { SERVER_URL } from './platform';
import { deviceId } from './presence';

const post = (body: object, token?: string | null) => {
  try {
    void fetch(`${(SERVER_URL ?? '').replace(/\/$/, '')}/api/visit`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* hors ligne */ }
};

export function trackVisit(token?: string | null) {
  if (!/^https?:$/.test(location.protocol)) return;
  const q = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) { const v = q.get(k); if (v) utm[k] = v.slice(0, 60); }
  post({ device: deviceId(), ref: document.referrer || '', utm, lang: navigator.language || '', landing: location.pathname }, token);
}

/** Le visiteur vient de se connecter ou de créer son compte : ses visites sont rattachées (conversion). */
export function linkVisitor(token: string) {
  if (!/^https?:$/.test(location.protocol)) return;
  post({ device: deviceId(), link: true }, token);
}
