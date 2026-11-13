/**
 * Tournois programmés (11h et 21h, heure de Bruxelles) : carte d'inscription (accueil et écran
 * Tournois), salon d'attente avec compte à rebours, et résultats en sacs de dés.
 */
import { BagIcon } from './BagIcon';
import { useEffect, useMemo, useState } from 'react';
import {
  BAG_TIERS, SCHED_FEE, SCHED_MAX, SCHED_MIN, bagPrizes, brusselsDay, formatClock, formatDelay, nextTier,
  type ProgrammeView, type SlotView,
} from '../../../shared/scheduled';
import type { PublicTournament } from '../../../shared/tournament';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { pushActive, pushSupported, enablePush } from '../push';
import { Avatar } from './Avatar';
import { RepBadge } from './RepBadge';
import { Icon } from './Icon';
import { tr, trServer } from '../i18n/lang';
import { hourTr, ord, trn } from '../i18n/g421';

export const placeLabel = (i: number) => ord(i + 1);
const bagsL = (n: number) => trn('g421.sch.bags', n);
const hourL = (h: number) => hourTr(h);

/** Horloge locale recalée sur celle du serveur, rafraîchie toutes les `ms`. */
export function useServerNow(serverNow: number | undefined, ms = 1000) {
  const offset = useMemo(() => (serverNow ? serverNow - Date.now() : 0), [serverNow]);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(t);
  }, [offset, ms]);
  return now;
}

/** « 21 h », « demain 11 h ». */
function whenLabel(s: SlotView, now: number) {
  const d = brusselsDay(s.startsAt), today = brusselsDay(now);
  const tomorrow = brusselsDay(now + 86400_000);
  return `${d === today ? '' : d === tomorrow ? tr('g421.sch.tomorrow') : tr('g421.sch.onDate', { d: d.slice(8), m: d.slice(5, 7) })}${hourL(s.hour)}`;
}

/** Barème des gains, avec le palier actuel mis en avant. */
export function BagTable({ players, compact }: { players: number; compact?: boolean }) {
  const cur = BAG_TIERS.find((t) => players >= t.from && players <= t.to);
  return (
    <table className={`bag-table${compact ? ' compact' : ''}`} aria-label={tr('g421.sch.tableA')}>
      <thead><tr><th>{tr('g421.pa.players')}</th><th>{ord(1)}</th><th>{ord(2)}</th><th>{ord(3)}</th><th>{ord(4)}</th></tr></thead>
      <tbody>
        {BAG_TIERS.map((t) => (
          <tr key={t.from} className={t === cur ? 'on' : ''}>
            <th>{t.from === t.to ? t.from : tr('g421.sch.range', { a: t.from, b: t.to })}</th>
            {[0, 1, 2, 3].map((i) => <td key={i}>{t.bags[i] ? <><BagIcon size="1em" /> {t.bags[i]}</> : '·'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Carte « Prochain tournoi » : compte à rebours, inscrits, inscription / désinscription, bouton
 * « Rejoindre le salon » pendant les 5 minutes d'ouverture.
 */
export function ScheduledCard({ pa, onJoin, onAccount, compact }: {
  pa: ProfileApi; onJoin: (code: string, pay: boolean) => void; onAccount: () => void; compact?: boolean;
}) {
  const [prog, setProg] = useState<ProgrammeView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBag, setShowBag] = useState(!compact);
  const [pushOn, setPushOn] = useState(true);
  const now = useServerNow(prog?.now);

  const load = () => api<ProgrammeView>('/tournois/programme', { token: pa.token }).then((r) => setProg(r)).catch(() => {});
  useEffect(() => { void load(); }, [pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  // Rafraîchi plus souvent quand un salon est ouvert ou va l'être.
  const soon = !!prog?.slots.some((s) => s.status === 'salon' || (s.startsAt - now < 10 * 60_000 && s.startsAt + 5 * 60_000 > now));
  useEffect(() => {
    const t = setInterval(load, soon ? 4000 : 30_000);
    return () => clearInterval(t);
  }, [soon, pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void pushActive().then(setPushOn); }, []);

  if (!prog) return null;
  const act = async (path: string, slot: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<ProgrammeView & { profile: unknown }>(path, { body: { slot }, token: pa.token });
      setProg(r);
      if (r.profile) pa.onServerProfile(r.profile as never);
    } catch (e) { setErr(trServer((e as Error).message)); }
    setBusy(false);
  };
  const seen = async () => { if (prog.last) { await api('/tournois/vu', { body: { slot: prog.last.slot }, token: pa.token }).catch(() => {}); void load(); } };
  const coins = pa.profile.coins;

  const row = (s: SlotView, main: boolean) => {
    const toOpen = s.startsAt - now, toStart = s.beginsAt - now;
    const full = s.count >= SCHED_MAX;
    const salon = s.status === 'salon' || (toOpen <= 0 && toStart > 0 && s.status === 'a-venir');
    let state: string;
    if (s.status === 'en-cours') state = tr('g421.sch.running');
    else if (s.status === 'annule') state = tr('g421.sch.cancelled');
    else if (s.status === 'termine') state = tr('g421.sch.done');
    else if (salon) state = tr('g421.sch.salonStart', { c: formatClock(toStart) });
    else state = tr('g421.sch.inDelay', { d: formatDelay(toOpen) });
    let action: React.ReactNode = null;
    if (!pa.isAccount) action = main ? <button className="btn small" onClick={onAccount}>{tr('g421.sch.account')}</button> : null;
    else if (s.status === 'en-cours' || s.status === 'termine' || s.status === 'annule') action = null;
    else if (salon && s.registered && s.code) action = <button className="btn primary small" onClick={() => onJoin(s.code!, false)}><Icon name="trophy" size={18} /> {tr('g421.sch.joinLobby')}</button>;
    else if (salon && !s.registered) action = <button className="btn primary small" disabled={busy || full || coins < SCHED_FEE} onClick={() => act('/tournois/inscription', s.id)}>
      {full ? tr('g421.sch.full') : coins < SCHED_FEE ? tr('g421.hub.noCoins') : tr('g421.sch.regFee', { n: SCHED_FEE })}</button>;
    else if (salon) action = <span className="tag">{tr('g421.sch.opening')}</span>;
    else if (s.registered) action = <span className="sc-reg">
      <span className="tag ok"><Icon name="check" size={16} /> {tr('g421.menu.registered')}</span>
      <button className="btn ghost small" disabled={busy} onClick={() => act('/tournois/desinscription', s.id)}>{tr('g421.sch.unreg')}</button>
    </span>;
    else action = <button className="btn primary small" disabled={busy || full || coins < SCHED_FEE} onClick={() => act('/tournois/inscription', s.id)}>
      {full ? tr('g421.sch.full') : coins < SCHED_FEE ? tr('g421.hub.noCoins') : tr('g421.hub.register')}</button>;
    return (
      <div key={s.id} className={`sc-row${main ? ' main' : ''}${salon ? ' live' : ''}`}>
        <div className="sc-info">
          {main ? <b className="sc-title">{tr(salon ? 'g421.menu.tournoi' : 'g421.sch.next')} {whenLabel(s, now)}</b> : <b>{tr('g421.sch.then')} {whenLabel(s, now)}</b>}
          <small><span className={salon ? 'sc-live' : ''}>{state}</span> · {trn('g421.sch.regd', s.count)}{full ? ` ${tr('g421.sch.fullParen')}` : `/${SCHED_MAX}`} · {tr('g421.sch.feeCoins', { n: SCHED_FEE })}</small>
        </div>
        {action}
      </div>
    );
  };
  const [first, second] = prog.slots;
  const last = prog.last;
  return (
    <section className={`sched-card${compact ? ' compact' : ''}`} aria-live="polite">
      <header>
        <Icon name="trophy" />
        <span><b>{tr('g421.sch.header')}</b><small>{tr('g421.sch.daily')}</small></span>
      </header>
      {last && (
        <div className={`sc-last ${last.status}`}>
          <p>{last.status === 'joue'
            ? tr('g421.sch.lastPlayed', { h: hourL(last.hour), p: placeLabel(last.place ?? 0), of: last.players ? tr('g421.sch.ofN', { n: last.players }) : '', b: last.bags ? trn('g421.sch.bagsWon', last.bags) : '' })
            : tr('g421.sch.lastCancelled', { r: last.reason ? trServer(last.reason) : tr('g421.sch.cancelledH', { h: hourL(last.hour) }), n: last.refunded })}</p>
          <button className="btn ghost small" onClick={seen}>OK</button>
        </div>
      )}
      {prog.playing && (
        <div className="sc-row main live">
          <div className="sc-info"><b className="sc-title">{tr('g421.sch.playing', { h: hourL(prog.playing.hour) })}</b><small>{tr('g421.sch.inRace')}</small></div>
          <button className="btn primary small" onClick={() => onJoin(prog.playing!.code, false)}>{tr('g421.sch.back')}</button>
        </div>
      )}
      {first && row(first, true)}
      {second && row(second, false)}
      {err && <p className="error">{err}</p>}
      {pa.isAccount && !pushOn && pushSupported() && prog.slots.some((s) => s.registered) && (
        <button className="btn ghost small" onClick={async () => { const e = await enablePush(pa.token!); setErr(e); setPushOn(!e); }}>
          <Icon name="bell" size={18} /> {tr('g421.sch.notify')}
        </button>
      )}
      {first && <p className="sc-prize"><BagIcon size="1em" /> {first.count >= SCHED_MIN
        ? <>{trn('g421.sch.atN', first.count)}{bagPrizes(first.count).map((b, i) => `${placeLabel(i)} ${bagsL(b)}`).join(', ')}{nextTier(first.count) ? tr('g421.sch.nextTier', { n: first.count + nextTier(first.count)!.missing, b: bagsL(nextTier(first.count)!.bags[0]), first: placeLabel(0) }) : ''}.</>
        : <>{tr('g421.sch.prizeInfo')}</>}</p>}
      <button className="btn ghost small sc-toggle" aria-expanded={showBag} onClick={() => setShowBag((v) => !v)}>
        {tr(showBag ? 'g421.sch.hide' : 'g421.sch.show')}
      </button>
      {showBag && (
        <div className="sc-rules">
          <BagTable players={first?.count ?? 0} compact />
          <ul className="muted small">
            <li>{tr('g421.sch.r1', { n: SCHED_FEE })}</li>
            <li>{tr('g421.sch.r2', { a: SCHED_MIN, b: SCHED_MAX })}</li>
            <li>{tr('g421.sch.r3', { a: SCHED_MIN })}</li>
            <li>{tr('g421.sch.r4')}</li>
          </ul>
        </div>
      )}
    </section>
  );
}

/** Salon d'attente d'un tournoi programmé : présents, compte à rebours, barème qui évolue. */
export function ScheduledLobby({ t, meId }: { t: PublicTournament; meId: string }) {
  const s = t.sched!;
  const now = useServerNow(s.serverNow, 500);
  const left = s.beginsAt - now;
  const n = t.players.length;
  const bags = bagPrizes(n);
  const next = nextTier(n);
  const absent = Math.max(0, s.registered - n);
  return (
    <div className="sched-lobby">
      <div className="sl-clock" role="timer" aria-label={tr('g421.sch.startIn', { d: formatDelay(left) })}>
        <small>{tr('g421.sch.startInLbl')}</small>
        <b>{formatClock(left)}</b>
        <small>{left > 0 ? tr('g421.sch.atH', { h: s.hour }) : tr('g421.sch.starting')}</small>
      </div>
      <p className="sl-status">
        {n < SCHED_MIN
          ? trn('g421.sch.tooFew', n, { min: SCHED_MIN })
          : trn('g421.sch.prizes', n, { list: bags.map((b, i) => `${placeLabel(i)} ${bagsL(b)}`).join(', ') })}
        {next && n >= SCHED_MIN ? ` ${trn('g421.sch.more', next.missing, { b: bagsL(next.bags[0]) })}` : ''}
      </p>
      {absent > 0 && <p className="muted small">{trn('g421.sch.absent', absent)}</p>}
      <h3>{tr('g421.sch.inLobby', { n, max: SCHED_MAX })}</h3>
      <ol className="members">
        {t.players.map((p, i) => (
          <li key={p.id}>
            <span className="ord">{i + 1}</span>
            <Avatar photo={p.photo} emoji={p.avatar} size={36}><i className={`dot ${p.connected ? 'on' : 'off'}`} /><RepBadge rep={p.rep} className="rep-on-av" /></Avatar>
            <b>{p.name}</b>
            {p.id === meId && <span className="tag">{tr('g421.pc.you')}</span>}
          </li>
        ))}
      </ol>
      <h3>{tr('g421.sch.prizesH')}</h3>
      <BagTable players={n} />
      <p className="muted small">{tr('g421.sch.stay')}</p>
    </div>
  );
}

/** Fin d'un tournoi programmé : classement et sacs gagnés, ou annulation. */
export function ScheduledResults({ t, meId }: { t: PublicTournament; meId: string }) {
  const s = t.sched!;
  const nameOf = (id: string) => t.players.find((p) => p.id === id)?.name ?? '?';
  if (s.cancelled) return (
    <div className="sched-results cancelled">
      <p className="sr-big">{tr('g421.sch.cancelledT')}</p>
      <p>{trServer(s.cancelled)}</p>
      <p className="muted">{tr('g421.sch.refundNote', { n: SCHED_FEE })}</p>
    </div>
  );
  const standings = t.standings ?? [];
  const mine = standings.indexOf(meId);
  return (
    <div className="sched-results">
      {mine >= 0 && <p className="sr-big">{mine === 0 ? tr('g421.t.youWin') : tr('g421.sch.youFinished', { p: placeLabel(mine), n: standings.length })}</p>}
      {mine >= 0 && s.bags[mine] ? <p className="sr-bags"><BagIcon size="1em" /> {trn('g421.sch.bagsWonOpen', s.bags[mine])}</p> : null}
      <ol className="ranking t-standings">
        {standings.map((id, i) => (
          <li key={id} className={id === meId ? 'me' : ''}>
            <span className="rk">{placeLabel(i)}</span>
            <span className="nm">{nameOf(id)}</span>
            {s.bags[i] ? <span className="sc bag-text"><BagIcon size="1em" /> {bagsL(s.bags[i])}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
