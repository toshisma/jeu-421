/**
 * Succès du Courtisan (0.53) : rangée du menu du mode, liste complète (feuille du menu, profil) et
 * bandeau « Succès débloqué » en fin de partie. Les succès eux-mêmes sont dans
 * shared/progress/achievements.ts (`game: 'courtisan'`), débloqués par le serveur pour les comptes.
 */
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, EMPTY_STATS } from '../../../shared/progress/achievements';
import { levelInfo, purchases, type Profile } from '../../../shared/progress/profile';
import { fmtNum, loc, tr } from '../i18n/lang';
import { sound } from '../audio/sound';

export const DM_ACH = () => ACHIEVEMENTS.filter((a) => a.game === 'courtisan');
const date = (t: number) => new Date(t).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' });

/** `compact` : une rangée (icônes et compteur) qui ouvre la liste ; sinon la liste avec la progression. */
export function DmAchievements({ profile: p, compact, onOpen }: { profile: Profile; compact?: boolean; onOpen?: () => void }) {
  const list = DM_ACH();
  const got = list.filter((a) => p.achievements[a.id]);
  if (compact) {
    return (
      <button className="dm2-ach-row" onClick={onOpen}>
        <span className="dm2-ach-row-title"><b>{tr('dm2.ach.title')}</b><small>{tr('dm2.ach.count', { n: got.length, t: list.length })}</small></span>
        <span className="dm2-ach-row-icons" aria-hidden>
          {list.slice(0, 8).map((a) => <i key={a.id} className={p.achievements[a.id] ? 'on' : ''}>{p.achievements[a.id] || !a.secret ? a.icon : '❔'}</i>)}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </button>
    );
  }
  const input = { stats: { ...EMPTY_STATS, ...p.stats }, level: levelInfo(p.xp).level, purchases: purchases(p), owned: p.owned, dm: p.dm };
  return (
    <section className="dm2-ach">
      <p className="pv-ach-sum"><b>{got.length}</b> {tr('app.succes_sur')} {list.length}<span className="tile-bar"><i style={{ width: `${(100 * got.length) / list.length}%` }} /></span></p>
      <ul className="ach-grid">
        {list.map((a) => {
          const at = p.achievements[a.id];
          if (a.secret && !at) {
            return (
              <li key={a.id} className="secret">
                <span className="ach-icon">❔</span>
                <span className="ach-name">{tr('app.succes_secret')}</span>
                <span className="ach-desc">{tr('app.a_decouvrir_en_jouant_pieces', { coins: a.coins })}</span>
              </li>
            );
          }
          const v = Math.min(a.target, a.value(input));
          return (
            <li key={a.id} className={`${at ? 'on' : ''}${a.rare ? ' rare' : ''}`}>
              <span className="ach-icon">{at ? a.icon : '🔒'}</span>
              <span className="ach-name">{a.name}{a.rare && <em className="ach-rare"> {tr('app.difficile_2')}</em>}</span>
              <span className="ach-desc">{a.description}</span>
              {at ? <span className="ach-ok">✓ {date(at)}</span>
                : <span className="ach-prog"><i style={{ width: `${(100 * v) / a.target}%` }} /><em>{fmtNum(v)} {tr('app.sur_pieces', { target: fmtNum(a.target), coins: a.coins })}</em></span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">{tr('dm2.ach.note')}</p>
    </section>
  );
}

/** Bandeau « Succès débloqué » au-dessus de la partie (quelques secondes, un succès après l'autre). */
export function DmAchToast({ ids }: { ids: string[] }) {
  const [k, setK] = useState(0);
  const key = ids.join(',');
  useEffect(() => { setK(0); }, [key]);
  useEffect(() => {
    if (k >= ids.length) return;
    sound.validate();
    const t = setTimeout(() => setK((x) => x + 1), 3200);
    return () => clearTimeout(t);
  }, [k, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = k < ids.length ? ACHIEVEMENTS.find((x) => x.id === ids[k]) : undefined;
  if (!a) return null;
  return (
    <div className="dm2-ach-toast" role="status" key={a.id} onClick={() => setK((x) => x + 1)}>
      <span className="dm2-ach-toast-ic" aria-hidden>{a.icon}</span>
      <span><small>{tr('dm2.ach.unlocked')}</small><b>{a.name}</b></span>
      <em>{tr('dm2.ach.coins', { n: a.coins })}</em>
    </div>
  );
}
