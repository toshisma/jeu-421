/**
 * Coups Fourrés : bandeau « X vous défie à Coups Fourrés » partout hors du mode (comme les
 * invitations du 421 classique). Léger : seulement l'API, chargé avec l'accueil. Dans le mode,
 * les défis arrivent en direct et s'acceptent ou se refusent depuis le menu.
 */
import { useEffect, useState } from 'react';
import type { ProfileApi } from '../account/useProfile';
import { api } from '../account/api';

export function CfChallengeBanner({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const [list, setList] = useState<{ id: string; from: string }[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!pa.token) { setList([]); return; }
    let stop = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ challenges: { id: string; from: string }[] }>('/cf/challenges', { token: pa.token }).then((r) => setList(r.challenges ?? [])).catch((e) => { if (e?.status === 404) stop = true; });
    };
    load();
    const t = setInterval(() => { if (!stop) load(); }, 15_000);
    return () => clearInterval(t);
  }, [pa.token]);
  const c = list.filter((x) => !hidden.includes(x.id)).pop();
  if (!c) return null;
  return (
    <div className="invite-banner cf-duel-banner" role="alert">
      <span aria-hidden>🃏</span>
      <span className="ib-text"><b>{c.from}</b> vous défie à Coups Fourrés</span>
      <button className="btn primary small" onClick={onOpen}>Voir</button>
      <button className="btn ghost small" onClick={() => setHidden((h) => [...h, c.id])}>Plus tard</button>
    </div>
  );
}
