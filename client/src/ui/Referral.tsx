import { useEffect, useState } from 'react';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { publicUrl } from '../platform';
import { Icon } from './Icon';
import { DieCube } from './DiceCollection';
import { INVITE_DICE } from '../../../shared/progress/dice-collection';

export interface ReferralInfo {
  code: string; gamesNeeded: number; bagsMax: number; bagsEarned: number; bonus: number;
  referees: { username: string; played: number; done: boolean }[];
  inviteSet?: { friends: number; games: number; done: number };
}

export function useReferral(pa: ProfileApi) {
  const [r, setR] = useState<ReferralInfo | null>(null);
  useEffect(() => { if (pa.token) api<ReferralInfo>('/referral', { token: pa.token }).then(setR).catch(() => {}); else setR(null); }, [pa.token, pa.profile.bags]);
  return r;
}
export const referralLink = (code: string) => `${publicUrl()}/?parrain=${encodeURIComponent(code)}`;

/** Copier (ou partager, sur téléphone) le lien de parrainage. */
export function CopyReferral({ code, big = false }: { code: string; big?: boolean }) {
  const [done, setDone] = useState<string | null>(null);
  const link = referralLink(code);
  const flash = (t: string) => { setDone(t); setTimeout(() => setDone(null), 2200); };
  return (
    <div className="ref-actions">
      <button className={`btn ${big ? 'primary' : ''}`} onClick={async () => {
        try { await navigator.clipboard.writeText(link); flash('Lien copié !'); } catch { flash(link); }
      }}><Icon name="share" size={18} /> {done && done !== link ? done : 'Copier mon lien'}</button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button className="btn ghost" onClick={() => void navigator.share({ title: '421 en ligne', text: 'Viens jouer au 421 avec moi !', url: link }).catch(() => {})}>Partager</button>
      )}
      {done === link && <p className="muted small ref-link">{link}</p>}
    </div>
  );
}

/** Carte de l'accueil : parrainer un ami rapporte un sac de dés. */
export function ReferralCard({ pa, onAccount }: { pa: ProfileApi; onAccount: () => void }) {
  const r = useReferral(pa);
  if (!pa.isAccount) {
    return (
      <section className="ref-card ref-guest">
        <div className="ref-top">
          <span className="ref-ico" aria-hidden>🎒</span>
          <div>
            <b>Parrainez vos amis, gagnez des sacs de dés</b>
            <span>Avec un compte, vous obtenez un lien à partager : un sac de dés par ami qui s'inscrit et joue 10 parties (jusqu'à 3 sacs).</span>
          </div>
        </div>
        <div className="ref-actions"><button className="btn" onClick={onAccount}>Créer mon compte</button></div>
      </section>
    );
  }
  if (!r) return null;
  const left = r.bagsMax - r.bagsEarned;
  const pending = r.referees.filter((f) => !f.done);
  return (
    <section className="ref-card">
      <div className="ref-top">
        <span className="ref-ico" aria-hidden>🎒</span>
        <div>
          <b>{left > 0 ? 'Invitez un ami, gagnez un sac de dés' : 'Merci pour vos invitations !'}</b>
          <span>{left > 0
            ? `Quand un ami crée son compte avec votre lien et joue ${r.gamesNeeded} parties, vous recevez un sac de dés à ouvrir. Jusqu'à ${r.bagsMax} sacs.`
            : `Vous avez gagné les ${r.bagsMax} sacs du parrainage. Vos amis restent les bienvenus !`}</span>
        </div>
      </div>
      <div className="ref-progress" aria-label={`${r.bagsEarned} sacs gagnés sur ${r.bagsMax}`}>
        {Array.from({ length: r.bagsMax }, (_, i) => <i key={i} className={i < r.bagsEarned ? 'on' : ''}>🎒</i>)}
        <small>{r.bagsEarned}/{r.bagsMax} sacs gagnés</small>
      </div>
      {r.inviteSet && (
        <div className="ref-set">
          <span className="ref-set-dice">{INVITE_DICE.map((c) => <DieCube key={c.id} id={c.id} size={34} />)}</span>
          <span><b>Set légendaire « Feu et Glace »</b>
            <small>{r.inviteSet.done >= r.inviteSet.friends ? 'Débloqué : il est dans votre collection !'
              : `${r.inviteSet.done}/${r.inviteSet.friends} amis avec ${r.inviteSet.games} parties jouées : les 3 dés sont à vous à ${r.inviteSet.friends}.`}</small></span>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="ref-list">
          {pending.slice(0, 4).map((f) => (
            <li key={f.username}><b>{f.username}</b><span className="ref-bar"><i style={{ width: `${(100 * f.played) / r.gamesNeeded}%` }} /></span><small>{f.played}/{r.gamesNeeded} parties</small></li>
          ))}
        </ul>
      )}
      <CopyReferral code={r.code} big={left > 0} />
    </section>
  );
}
