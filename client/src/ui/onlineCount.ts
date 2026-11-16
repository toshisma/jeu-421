/**
 * Accueil : combien de personnes sont sur le site, et dans chaque jeu (GET /api/online, nombres
 * seulement ; ce que compte chaque nombre : server/online-count.ts).
 * Rechargé toutes les 25 s tant que la page est visible ; rien en arrière-plan, rechargé au retour.
 */
import { useEffect, useState } from 'react';
import { api } from '../account/api';
import { STANDALONE } from './Screens';

export type OnlineGame = '421' | 'cf' | 'courtisan' | 'poker';
export interface OnlineNow { site: number; games: Record<OnlineGame, number> }

const EVERY = 25_000;

export function useOnlineNow(): OnlineNow | null {
  const [v, setV] = useState<OnlineNow | null>(null);
  useEffect(() => {
    if (STANDALONE) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    const load = () => api<OnlineNow>('/online').then((r) => {
      if (alive && typeof r.site === 'number' && r.games) setV({ site: r.site, games: r.games });
    }).catch(() => {});
    const start = () => { if (timer) return; load(); timer = setInterval(load, EVERY); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return v;
}
