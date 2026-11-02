import { useEffect, useState } from 'react';
import { activeEvent, coinBoost, eventEnd, happyHour, shortDate } from '../../../shared/progress/events';
import { getItem } from '../../../shared/progress/catalog';
import {
  DAILY_REWARDS, PASS_POINTS, PASS_TIERS, availableTitles, dailyStatus, monthName, passReward, seasonOf, titleLabel,
} from '../../../shared/progress/profile';
import { today } from '../../../shared/progress/quests';
import { BOSS_COINS, bossOfWeek, weekKey } from '../../../shared/progress/boss';
import { PERSONAS } from '../game/personas';
import type { ProfileApi } from '../account/useProfile';
import { sound } from '../audio/sound';
import { Icon } from './Icon';
import { Shell } from './Screens';

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
      <div><b>Happy hour !</b><span>Toutes les parties rapportent deux fois plus de pièces jusqu'à {String((hh.hour + 1) % 24).padStart(2, '0')} h. Encore {left} min.</span></div>
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
        <b>{e ? e.name : 'Week-end pièces doublées'}</b>
        <span>{e ? `${e.description} Jusqu’au ${shortDate(eventEnd(e, day)).replace(/\.$/, '')}.` : 'Toutes les parties rapportent deux fois plus de pièces.'}</span>
        {boost && <span className="boost">{e ? `Pièces ×${String(boost.factor).replace('.', ',')}${boost.factor === 2 ? ' ce week-end' : ''} sur toutes les parties` : boost.label}</span>}
      </div>
      {e && <button className="btn small" onClick={onShop}>Objets exclusifs</button>}
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
    setMsg(`+${r.coins} pièces${r.xp ? ` et +${r.xp} XP` : ''}`);
  };
  const done = st.canClaim ? st.cycleDay - 1 : st.cycleDay;
  return (
    <section className="streak">
      <header>
        <h3>{(() => { const n = st.canClaim ? st.count - 1 : st.count; return n > 0 ? `Série de ${n} jour${n > 1 ? 's' : ''}` : 'Récompense du jour'; })()}</h3>
        <span className="muted small">{st.canClaim ? 'Revenez chaque jour : le 7e, un coffre.' : 'À demain !'}</span>
      </header>
      <ol className="streak-days">
        {DAILY_REWARDS.map((r, i) => (
          <li key={i} className={`${i < done ? 'got' : ''}${i === st.cycleDay - 1 && st.canClaim ? ' today' : ''}${i === 6 ? ' chest' : ''}`}>
            <small>J{i + 1}</small>
            <b>{i === 6 ? '🎁' : r.coins}</b>
          </li>
        ))}
      </ol>
      {st.canClaim ? <button className="btn primary wide" onClick={claim}>Récupérer la récompense du jour</button>
        : msg && <p className="ok small center">{msg}</p>}
    </section>
  );
}

/** Résumé du pass de saison sur l'accueil. */
export function PassSummary({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const s = seasonOf(pa.profile);
  const tier = Math.min(PASS_TIERS, Math.floor(s.points / PASS_POINTS));
  const ready = Array.from({ length: tier }, (_, i) => i + 1).filter((t) => !s.claimed.includes(t)).length;
  const into = tier >= PASS_TIERS ? PASS_POINTS : s.points % PASS_POINTS;
  return (
    <button className="pass-summary" onClick={onOpen}>
      <span className="ps-left">
        <b>Pass de {monthName(s.id).split(' ')[0]}</b>
        <span className="muted small">Palier {tier} sur {PASS_TIERS}{ready ? `, ${ready} récompense${ready > 1 ? 's' : ''} à récupérer` : ''}</span>
        <span className="q-bar"><i style={{ width: `${(100 * into) / PASS_POINTS}%` }} /></span>
      </span>
      {ready > 0 && <span className="ps-badge">{ready}</span>}
      <Icon name="back" size={20} />
    </button>
  );
}

const rewardText = (r: ReturnType<typeof passReward>) => {
  const parts: string[] = [];
  if (r.item) parts.push(getItem(r.item)?.name.replace(' (pass)', '') ?? 'Objet');
  if (r.coins) parts.push(`${r.coins} pièces`);
  if (r.title) parts.push(`titre « ${titleLabel(r.title)} »`);
  return parts.join(' + ');
};

/** Écran du pass de saison : 20 paliers, gratuits, gagnés en jouant pendant le mois. */
export function PassScreen({ pa, onBack }: { pa: ProfileApi; onBack: () => void }) {
  const s = seasonOf(pa.profile);
  const [msg, setMsg] = useState<string | null>(null);
  const claim = async (t: number) => {
    const err = await pa.claimPass(t);
    if (err) { setMsg(err); return; }
    sound.chips(4);
    setMsg(`Palier ${t} : ${rewardText(passReward(t, s.id))}.`);
  };
  return (
    <Shell title={`Pass de ${monthName(s.id)}`} onBack={onBack}>
      <p className="muted">Gratuit. Chaque point d'XP gagné ce mois-ci fait avancer le pass ; les objets marqués « pass » ne s'achètent pas. Tout repart à zéro le 1er du mois.</p>
      <div className="pass-total"><b>{s.points}</b> points<span className="muted small"> sur {PASS_TIERS * PASS_POINTS}</span></div>
      {msg && <p className="ok">{msg}</p>}
      <ol className="pass-tiers">
        {Array.from({ length: PASS_TIERS }, (_, i) => i + 1).map((t) => {
          const r = passReward(t, s.id);
          const reached = s.points >= t * PASS_POINTS;
          const got = s.claimed.includes(t);
          return (
            <li key={t} className={`${reached ? 'reached' : ''}${got ? ' got' : ''}${r.item ? ' special' : ''}`}>
              <span className="pt-n">{t}</span>
              <span className="pt-r">{rewardText(r)}<small>{t * PASS_POINTS} points</small></span>
              {got ? <span className="ok"><Icon name="check" size={18} /></span>
                : reached ? <button className="btn small primary" onClick={() => claim(t)}>Récupérer</button>
                  : <Icon name="lock" size={18} />}
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}

/** Choix du titre affiché sous le pseudo. */
export function TitlePicker({ pa }: { pa: ProfileApi }) {
  const ids = availableTitles(pa.profile);
  const [err, setErr] = useState<string | null>(null);
  if (!ids.length) return <p className="muted small">Débloquez des succès pour gagner des titres à afficher sous votre pseudo.</p>;
  return (
    <label className="field">
      <span>Titre affiché sous votre pseudo</span>
      <select value={pa.profile.title ?? ''} onChange={async (e) => setErr(await pa.chooseTitle(e.target.value || null))}>
        <option value="">Aucun</option>
        {ids.map((id) => <option key={id} value={id}>{titleLabel(id)}</option>)}
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
        <small>Patron de la semaine</small>
        <b>{b.name}</b>
        <span>{b.twist}</span>
        <span className="boss-prize">{beaten ? 'Battu cette semaine. Revanche possible, sans récompense.' : `Première victoire : ${BOSS_COINS} pièces, un trophée et le titre « ${titleLabel(`patron:${b.id}`)} ».`}</span>
      </div>
      <button className={`btn ${beaten ? '' : 'primary'}`} onClick={onPlay}>Défier</button>
    </section>
  );
}
