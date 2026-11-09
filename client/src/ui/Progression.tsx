import { titleL, ofMonthL, shortDateL } from '../i18n/data';
import { loc, tr } from '../i18n/lang';
import { chestWait } from '../../../shared/progress/profile';
import { botName } from '../i18n/g421';
import type { MessageKey } from '../../../shared/i18n';
import { useEffect, useState } from 'react';
import { activeEvent, coinBoost, eventEnd, happyHour } from '../../../shared/progress/events';
import { getItem } from '../../../shared/progress/catalog';
import {
  DAILY_REWARDS, PASS_TIERS, passProgress, passThreshold, availableTitles, dailyStatus, passReward, seasonOf,
} from '../../../shared/progress/profile';
import { today } from '../../../shared/progress/quests';
import { BOSS_COINS, bossOfWeek, weekKey } from '../../../shared/progress/boss';
import { PERSONAS } from '../game/personas';
import type { ProfileApi } from '../account/useProfile';
import { sound } from '../audio/sound';
import { Icon } from './Icon';
import { BigAction, Shell, useToast } from './kit';

/** Bandeau de l'événement en cours (et des pièces boostées). */
/** Happy hour en cours : bandeau avec le temps restant (vérifié chaque minute). */
export function HappyHourBanner() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const hh = happyHour(now);
  if (!hh) return null;
  const left = 60 - new Date(now).getMinutes();
  return (
    <section className="happy-hour" aria-live="polite">
      <span className="hh-ico" aria-hidden>🍻</span>
      <div><b>{tr('app.happy_hour')}</b><span>{tr('app.toutes_les_parties_rapportent_deux_f')} {String((hh.hour + 1) % 24).padStart(2, '0')} {tr('app.h_encore_min', { left })}</span></div>
    </section>
  );
}

export function EventBanner({ onShop }: { onShop: () => void }) {
  const day = today();
  const e = activeEvent(day);
  const boost = coinBoost(day);
  if (!e && !boost) return null;
  return (
    <section className="event-banner">
      <div>
        <b>{e ? e.name : tr('app.week_end_pieces_doublees')}</b>
        <span>{e ? tr('app.jusqu_au', { description: e.description, v: shortDateL(eventEnd(e, day)).replace(/\.$/, '') }) : tr('app.toutes_les_parties_rapportent_deux_f_2')}</span>
        {boost && <span className="boost">{e ? tr('app.pieces_sur_toutes_les_parties', { v: String(boost.factor).replace('.', ','), v2: boost.factor === 2 ? tr('app.ce_week_end') : '' }) : boost.label}</span>}
      </div>
      {e && <button className="btn small" onClick={onShop}>{tr('app.objets_exclusifs')}</button>}
    </section>
  );
}

/** Série de connexions : 7 cases, la 7e est un coffre. */
export function DailyStreak({ pa }: { pa: ProfileApi }) {
  const st = dailyStatus(pa.profile);
  const [msg, setMsg] = useState<string | null>(null);
  const claim = async () => {
    const r = DAILY_REWARDS[st.cycleDay - 1];
    const err = await pa.claimDailyReward();
    if (err) { setMsg(err); return; }
    sound.chips(st.cycleDay === 7 ? 8 : 3);
    setMsg(tr('app.pieces_4', { coins: r.coins, v: r.xp ? tr('app.et_xp', { xp: r.xp }) : '' }));
  };
  const done = st.canClaim ? st.cycleDay - 1 : st.cycleDay;
  return (
    <section className="streak">
      <header>
        <h3>{(() => { const n = st.canClaim ? st.count - 1 : st.count; return n > 0 ? tr(n > 1 ? 'app.serie_de_jour.p' : 'app.serie_de_jour', { n }) : tr('app.recompense_du_jour'); })()}</h3>
        <span className="muted small">{st.canClaim ? tr('app.revenez_chaque_jour_le_7e_un_coffre') : tr('app.a_demain')}</span>
      </header>
      <ol className="streak-days">
        {DAILY_REWARDS.map((r, i) => (
          <li key={i} className={`${i < done ? 'got' : ''}${i === st.cycleDay - 1 && st.canClaim ? ' today' : ''}${i === 6 ? ' chest' : ''}`}>
            <small>{tr('app.j')}{i + 1}</small>
            <b>{i === 6 ? '🎁' : r.coins}</b>
          </li>
        ))}
      </ol>
      {st.canClaim ? <button className="btn primary wide" onClick={claim}>{tr('app.recuperer_la_recompense_du_jour')}</button>
        : msg && <p className="ok small center">{msg}</p>}
    </section>
  );
}

/** Résumé du pass de saison sur l'accueil. */
export function PassSummary({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const s = seasonOf(pa.profile);
  const { tier, into, need } = passProgress(s.points);
  const ready = Array.from({ length: tier }, (_, i) => i + 1).filter((t) => !s.claimed.includes(t)).length;
  return (
    <button className="pass-summary" onClick={onOpen}>
      <span className="ps-left">
        <b>{tr('app.pass')} {ofMonthL(s.id).replace(/ \d+$/, '')}</b>
        <span className="muted small">{tr('app.palier_sur', { tier })} {PASS_TIERS}{ready ? tr(ready > 1 ? 'app.recompense_a_recuperer.p' : 'app.recompense_a_recuperer', { ready }) : ''}</span>
        <span className="q-bar"><i style={{ width: `${(100 * into) / need}%` }} /></span>
      </span>
      {ready > 0 && <span className="ps-badge">{ready}</span>}
      <Icon name="back" size={20} />
    </button>
  );
}

const rewardText = (r: ReturnType<typeof passReward>) => {
  const parts: string[] = [];
  if (r.item) parts.push(getItem(r.item)?.name.replace(' (pass)', '') ?? tr('app.objet'));
  if (r.coins) parts.push(tr('app.pieces_5', { coins: r.coins }));
  if (r.title) parts.push(tr('app.titre_2', { v: titleL(r.title) }));
  return parts.join(' + ');
};

/** Écran du pass de saison : 20 paliers, gratuits, gagnés en jouant pendant le mois. */
export function PassScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const s = seasonOf(pa.profile);
  const [toast, showToast] = useToast();
  const { tier, into, need } = passProgress(s.points);
  const ready = Array.from({ length: PASS_TIERS }, (_, i) => i + 1).filter((t) => s.points >= passThreshold(t) && !s.claimed.includes(t));
  const claim = async (t: number) => {
    const err = await pa.claimPass(t);
    if (err) { showToast(err, 'err'); return; }
    sound.chips(4);
    showToast(tr('app.palier_2', { t, v: rewardText(passReward(t, s.id)) }));
  };
  const claimAll = async () => { for (const t of ready) { const err = await pa.claimPass(t); if (err) { showToast(err, 'err'); return; } } sound.chips(6); showToast(tr(ready.length > 1 ? 'app.recompense_recuperee.p' : 'app.recompense_recuperee', { n: ready.length })); };
  return (
    <Shell title={tr('app.pass_2', { v: ofMonthL(s.id) })} onBack={onBack} icon="ticket" sub={tr('app.gratuit_repart_a_zero_le_1er_du')}
      foot={ready.length > 0 ? <BigAction icon="gift" tone="gold" label={ready.length > 1 ? tr('app.tout_recuperer', { n: ready.length }) : tr('app.recuperer_le_palier', { v: ready[0] })} sub={rewardText(passReward(ready[0], s.id))} onClick={() => void claimAll()} /> : undefined}>
      <div className="pass-hero">
        <span className="pass-tier"><small>{tr('app.palier_3')}</small><b>{tier}</b><small>{tr('app.sur')} {PASS_TIERS}</small></span>
        <div className="pass-hero-main">
          <div className="pass-total"><b>{s.points.toLocaleString(loc())}</b> {tr('app.points')}<span> {tr('app.sur')} {passThreshold(PASS_TIERS).toLocaleString(loc())}</span></div>
          <span className="pv-lvl-bar"><i style={{ width: `${tier >= PASS_TIERS ? 100 : (100 * into) / need}%` }} /></span>
          <small className="k-hint">{tr('app.chaque_point_d_xp_gagne_ce_mois')}</small>
        </div>
      </div>
      <ol className="pass-tiers">
        {Array.from({ length: PASS_TIERS }, (_, i) => i + 1).map((t) => {
          const r = passReward(t, s.id);
          const reached = s.points >= passThreshold(t);
          const got = s.claimed.includes(t);
          return (
            <li key={t} className={`${reached ? 'reached' : ''}${got ? ' got' : ''}${r.item ? ' special' : ''}`}>
              <span className="pt-n">{t}</span>
              <span className="pt-r">{rewardText(r)}<small>{passThreshold(t).toLocaleString(loc())} {tr('app.points')}</small></span>
              {got ? <span className="ok"><Icon name="check" size={18} /></span>
                : reached ? <button className="btn small primary" onClick={() => claim(t)}>{tr('app.recuperer')}</button>
                  : <Icon name="lock" size={18} />}
            </li>
          );
        })}
      </ol>
      {toast}
    </Shell>
  );
}

/** Choix du titre affiché sous le pseudo. */
export function TitlePicker({ pa }: { pa: ProfileApi }) {
  const ids = availableTitles(pa.profile);
  const [err, setErr] = useState<string | null>(null);
  if (!ids.length) return <p className="muted small">{tr('app.debloquez_des_succes_pour_gagner_des')}</p>;
  return (
    <label className="field">
      <span>{tr('app.titre_affiche_sous_votre_pseudo')}</span>
      <select value={pa.profile.title ?? ''} onChange={async (e) => setErr(await pa.chooseTitle(e.target.value || null))}>
        <option value="">{tr('app.aucun')}</option>
        {ids.map((id) => <option key={id} value={id}>{titleL(id)}</option>)}
      </select>
      {err && <span className="error">{err}</span>}
    </label>
  );
}

/** Patron de la semaine : carte sur l'accueil. */
export function BossCard({ pa, onPlay }: { pa: ProfileApi; onPlay: () => void }) {
  const day = today();
  const b = bossOfWeek(day);
  const persona = PERSONAS.find((p) => p.id === b.persona);
  const beaten = pa.profile.bossWeek === weekKey(day);
  return (
    <section className="boss-card">
      <span className="boss-face" aria-hidden>{persona?.avatar ?? '🎩'}</span>
      <div>
        <small>{tr('g421.menu.patronW')}</small>
        <b>{botName(b.name)}</b>
        <span>{tr(`g421.boss.${b.id}` as MessageKey)}</span>
        <span className="boss-prize">{beaten ? tr('g421.boss.beaten') : tr('g421.boss.prize', { n: BOSS_COINS, title: titleL(`patron:${b.id}`) })}</span>
      </div>
      <button className={`btn ${beaten ? '' : 'primary'}`} onClick={onPlay}>{tr('app.defier')}</button>
    </section>
  );
}

/** Coffre du comptoir : toujours sur l'accueil, avec le décompte jusqu'au prochain. */
export function EveningChest({ pa }: { pa: ProfileApi }) {
  const [now, setNow] = useState(Date.now());
  const [res, setRes] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const wait = chestWait(pa.profile, now);
  const ready = wait === 0;
  const h = Math.floor(wait / 3600_000), m = Math.floor((wait % 3600_000) / 60_000), sec = Math.floor((wait % 60_000) / 1000);
  const left = tr('app.h_min_s', { h, v: String(m).padStart(2, '0'), v2: String(sec).padStart(2, '0') });
  return (
    <section className={`chest-card ${ready ? 'ready' : 'later'}${opening ? ' opening' : ''}`}>
      <span className="chest-ico" aria-hidden>{res && !ready ? '✨' : '🧰'}</span>
      <div className="chest-text">
        <b>{tr('app.coffre_du_comptoir')}</b>
        <span>{ready ? tr('app.votre_coffre_est_pret_des_pieces_et') : <>{res && <>{res} · </>}{tr('app.prochain_coffre_dans')} <b className="chest-timer">{left}</b></>}</span>
      </div>
      {ready && (
        <button className="btn primary small" disabled={opening} onClick={async () => {
          setOpening(true); sound.unlock(); sound.rattle();
          await new Promise((ok) => setTimeout(ok, 700));
          const r = await pa.openEveningChest();
          setOpening(false);
          if ('error' in r) { setRes(r.error); return; }
          sound.treasure();
          setRes(tr('app.pieces_4', { coins: r.coins, v: r.bag ? tr('app.et_un_sac_de_des') : '' }));
        }}>{tr('app.ouvrir')}</button>
      )}
    </section>
  );
}
