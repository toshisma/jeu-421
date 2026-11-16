/**
 * « Qui est là ? » pour l'accueil (route publique GET /api/online) : uniquement des NOMBRES.
 *
 * Ce que compte chaque nombre (à partir des connexions de présence, voir stats.ts et live.ts) :
 * - `site` : appareils distincts dont le jeu est ouvert et relié au serveur en ce moment (invités et
 *   comptes ; plusieurs onglets d'un même appareil = 1). Les robots (navigateurs d'indexation,
 *   aperçus de liens, navigateurs sans écran) ne comptent pas, ni les ordinateurs des tables.
 * - `games[jeu]` : parmi ces appareils, ceux qui sont dans ce jeu : à une table en ligne (salon ou
 *   partie), en partie contre l'ordinateur, ou dans le menu / les écrans de ce jeu. Un appareil
 *   compte dans un seul jeu au plus : la table où le serveur voit le compte assis fait foi, sinon
 *   l'onglet qui joue, sinon le dernier onglet utilisé. Un appareil sur l'accueil, la boutique,
 *   les amis… compte sur le site mais dans aucun jeu.
 *
 * Aucune information individuelle (ni nom, ni code de table, ni appareil) ne sort d'ici. Résultat
 * gardé en cache quelques secondes : la route peut être appelée par tous les accueils ouverts.
 */
import type { PresenceEntry } from './live';

export type OnlineGame = '421' | 'cf' | 'courtisan' | 'poker';
export const ONLINE_GAMES: readonly OnlineGame[] = ['421', 'cf', 'courtisan', 'poker'];

export interface OnlineCounts { site: number; games: Record<OnlineGame, number> }

/** Écrans de l'application (App.tsx) qui appartiennent à un jeu. Les autres (accueil, boutique…) : aucun. */
const SCREEN_GAME: Record<string, OnlineGame> = {
  classic: '421', 'solo-setup': '421', solo: '421', hub: '421', online: '421', tournament: '421', watch: '421',
  rules: '421', tutorial: '421', boss: '421', 'party-setup': '421', party: '421', referee: '421', challenge: '421',
  album: '421', duel: '421', tdc: '421', 'tdc-game': '421',
  cf: 'cf', dixmille: 'courtisan', poker: 'poker',
};
export const screenGame = (screen: string | undefined): OnlineGame | null => (screen ? SCREEN_GAME[screen] ?? null : null);

/** Navigateurs automatiques (même règle que le comptage des visites, admin.ts). */
export const isRobotUa = (ua: string) => /bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua);

/**
 * Compte les appareils reliés, et par jeu. `seatGame` : jeu de la table où le serveur voit ce compte
 * assis (null s'il n'est assis nulle part).
 */
export function countOnline(entries: readonly PresenceEntry[], seatGame: (userId: string) => OnlineGame | null): OnlineCounts {
  const byDevice = new Map<string, PresenceEntry[]>();
  for (const e of entries) {
    if (e.robot) continue;
    const l = byDevice.get(e.device);
    if (l) l.push(e); else byDevice.set(e.device, [e]);
  }
  const games: Record<OnlineGame, number> = { '421': 0, cf: 0, courtisan: 0, poker: 0 };
  for (const tabs of byDevice.values()) {
    let game: OnlineGame | null = null;
    for (const id of new Set(tabs.map((t) => t.userId).filter(Boolean) as string[])) { game = seatGame(id); if (game) break; }
    if (!game) {
      // L'onglet qui joue (partie solo ou en ligne) d'abord, sinon le plus récemment utilisé.
      const main = [...tabs].sort((a, b) => Number(b.info.state !== 'menu') - Number(a.info.state !== 'menu') || b.changedAt - a.changedAt)[0];
      game = screenGame(main.info.screen);
    }
    if (game) games[game]++;
  }
  return { site: byDevice.size, games };
}

/** Comptage mis en cache `ttlMs` (5 s par défaut). */
export function cachedOnline(compute: () => OnlineCounts, now: () => number = Date.now, ttlMs = 5000) {
  let cache: { at: number; v: OnlineCounts } | null = null;
  return (): OnlineCounts & { at: number } => {
    const t = now();
    if (!cache || t - cache.at >= ttlMs) cache = { at: t, v: compute() };
    return { ...cache.v, games: { ...cache.v.games }, at: cache.at };
  };
}
