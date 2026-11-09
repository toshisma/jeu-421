import { tr } from '../i18n/lang';
import { useEffect, useState } from 'react';
import { BagIcon } from './BagIcon';
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
        try { await navigator.clipboard.writeText(link); flash(tr('app.lien_copie')); } catch { flash(link); }
      }}><Icon name="share" size={18} /> {done && done !== link ? done : tr('app.copier_mon_lien')}</button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button className="btn ghost" onClick={() => void navigator.share({ title: '421 en ligne', text: 'Viens jouer au 421 avec moi !', url: link }).catch(() => {})}>{tr('app.partager')}</button>
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
          <span className="ref-ico" aria-hidden><BagIcon size="1em" /></span>
          <div>
            <b>{tr('app.parrainez_vos_amis_gagnez_des_sacs_d')}</b>
            <span>{tr('app.avec_un_compte_vous_obtenez_un_lien')}</span>
          </div>
        </div>
        <div className="ref-actions"><button className="btn" onClick={onAccount}>{tr('app.creer_mon_compte')}</button></div>
      </section>
    );
  }
  if (!r) return null;
  const left = r.bagsMax - r.bagsEarned;
  const pending = r.referees.filter((f) => !f.done);
  return (
    <section className="ref-card">
      <div className="ref-top">
        <span className="ref-ico" aria-hidden><BagIcon size="1em" /></span>
        <div>
          <b>{left > 0 ? tr('app.invitez_un_ami_gagnez_un_sac_de') : tr('app.merci_pour_vos_invitations')}</b>
          <span>{left > 0
            ? tr('app.quand_un_ami_cree_son_compte_avec', { gamesNeeded: r.gamesNeeded, bagsMax: r.bagsMax })
            : tr('app.vous_avez_gagne_les_sacs_du_parraina', { bagsMax: r.bagsMax })}</span>
        </div>
      </div>
      <div className="ref-progress" aria-label={tr('app.sacs_gagnes_sur', { bagsEarned: r.bagsEarned, bagsMax: r.bagsMax })}>
        {Array.from({ length: r.bagsMax }, (_, i) => <i key={i} className={i < r.bagsEarned ? 'on' : ''}><BagIcon size="1em" /></i>)}
        <small>{r.bagsEarned}{tr('app.sacs_gagnes', { bagsMax: r.bagsMax })}</small>
      </div>
      {r.inviteSet && (
        <div className="ref-set">
          <span className="ref-set-dice">{INVITE_DICE.map((c) => <DieCube key={c.id} id={c.id} size={34} />)}</span>
          <span><b>{tr('app.set_legendaire_feu_et_glace')}</b>
            <small>{r.inviteSet.done >= r.inviteSet.friends ? tr('app.debloque_il_est_dans_votre_collectio')
              : `${r.inviteSet.done}/${r.inviteSet.friends} amis avec ${r.inviteSet.games} parties jouées : les 3 dés sont à vous à ${r.inviteSet.friends}.`}</small></span>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="ref-list">
          {pending.slice(0, 4).map((f) => (
            <li key={f.username}><b>{f.username}</b><span className="ref-bar"><i style={{ width: `${(100 * f.played) / r.gamesNeeded}%` }} /></span><small>{f.played}{tr('app.parties_3', { gamesNeeded: r.gamesNeeded })}</small></li>
          ))}
        </ul>
      )}
      <CopyReferral code={r.code} big={left > 0} />
    </section>
  );
}
