/**
 * Série de jours joués (accueil) et réglages des rappels par notification.
 * - SerieChip : petite flamme avec le nombre de jours dans la barre du haut (ne prend pas de hauteur),
 *   détail au toucher (semaine, jokers, prochaine récompense) ; annonce une fois la récompense du jour.
 * - NotifPrefs : cases à cocher des rappels (Réglages), comptes seulement.
 * - useTourneyWatch : « Me prévenir » d'un tournoi programmé.
 * Règles et barème : shared/progress/serie.ts ; serveur : server/serie.ts et server/notifs.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { SERIE_JOKERS_MAX, serieView, type SerieReward } from '../../../shared/progress/serie';
import { today } from '../../../shared/progress/quests';
import type { Profile } from '../../../shared/progress/profile';
import { api, loadSession } from '../account/api';
import { enablePush, pushActive, pushSupported } from '../push';
import { getLang, loc, tr, useLang } from '../i18n/lang';
import { BagIcon } from './BagIcon';
import { Section, Sheet, Toggle } from './kit';

const SEEN = '421.serie.vu';
/** Pluriel : « 0 jour » en français, « 0 days / 0 Tage / 0 dagen » ailleurs. */
const daysL = (n: number) => tr(n > 1 || (n === 0 && getLang() !== 'fr') ? 'ser.days.p' : 'ser.days', { n });
const rewardL = (r: SerieReward) => (r.bag ? tr('ser.bag') : tr('ser.coins', { n: r.coins }));

export function SerieChip({ profile, guest, onToast }: { profile: Profile; guest: boolean; onToast: (t: string) => void }) {
  useLang();
  const [open, setOpen] = useState(false);
  const day = today();
  const v = serieView(profile.serie, day);
  // Récompense du jour : annoncée une seule fois par jour sur cet appareil.
  useEffect(() => {
    const g = v.got;
    if (!g) return;
    try { if (localStorage.getItem(SEEN) === g.day) return; localStorage.setItem(SEEN, g.day); } catch { return; }
    onToast(`${g.bag ? tr('ser.gotBag', { n: g.n }) : tr('ser.got', { n: g.n, coins: g.coins })}${g.joker ? ` ${tr('ser.gotJoker')}` : ''}`);
  }, [v.got?.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const lit = v.count > 0;
  return (
    <>
      <button className={`serie-chip${lit ? ' on' : ''}${v.playedToday ? ' done' : ''}`} onClick={() => setOpen(true)}
        aria-label={lit ? tr('ser.chipAria', { n: v.count }) : tr('ser.chipAria0')}>
        <span aria-hidden className="serie-flame">🔥</span><b>{v.count}</b>
      </button>
      {open && <Sheet title={tr('ser.title')} onClose={() => setOpen(false)}><SerieDetail profile={profile} guest={guest} /></Sheet>}
    </>
  );
}

export function SerieDetail({ profile, guest }: { profile: Profile; guest: boolean }) {
  const day = today();
  const v = serieView(profile.serie, day);
  const wd = new Intl.DateTimeFormat(loc(), { weekday: 'narrow', timeZone: 'UTC' });
  const status = v.status === 'today' ? tr('ser.todayDone') : v.status === 'pending' ? tr('ser.todayTodo') : v.status === 'paused' ? tr('ser.paused') : tr('ser.none');
  return (
    <div className="serie-detail">
      <div className="serie-big">
        <span aria-hidden className="serie-flame">🔥</span>
        <b>{daysL(v.count)}</b>
        {v.best > 0 && <small>{tr('ser.best', { n: v.best })}</small>}
      </div>
      <p className="serie-status">{status}</p>
      <ol className="serie-week">
        {v.week.map((c) => (
          <li key={c.day} className={c.cell} aria-label={`${c.day} : ${tr(`ser.cell.${c.cell}` as 'ser.cell.joue')}`}>
            <small>{wd.format(new Date(`${c.day}T12:00:00Z`))}</small>
            <i aria-hidden>{c.cell === 'joue' ? '🔥' : c.cell === 'joker' ? '🃏' : ''}</i>
          </li>
        ))}
      </ol>
      <p className="serie-next">
        {tr(v.next.tomorrow ? 'ser.nextTomorrow' : 'ser.next', { n: v.next.n })} <b>{v.next.bag ? <><BagIcon size="1em" /> {rewardL(v.next)}</> : rewardL(v.next)}</b>
      </p>
      <p className="serie-jokers">
        <b>{tr('ser.jokers', { n: v.jokers, max: SERIE_JOKERS_MAX })}</b>
        {v.count > 0 && v.jokers < SERIE_JOKERS_MAX && <span> · {tr(v.toJoker !== 1 ? 'ser.toJoker.p' : 'ser.toJoker', { n: v.toJoker })}</span>}
      </p>
      <p className="muted small">{tr('ser.jokerHint')}</p>
      <p className="muted small">{tr('ser.lead')} {tr('ser.scale')}</p>
      {guest && <p className="muted small">{tr('ser.guestNote')}</p>}
    </div>
  );
}

// --- Réglages : rappels par notification ----------------------------------------------------------
const KINDS = ['bistrot', 'tournoi', 'serie', 'evenements'] as const;
type Kind = (typeof KINDS)[number];

export function NotifPrefs() {
  useLang();
  const session = loadSession();
  const [prefs, setPrefs] = useState<Record<Kind, boolean> | null>(null);
  const [push, setPush] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    api<{ prefs: Record<Kind, boolean> }>('/notifs/prefs', { token: session.token }).then((r) => setPrefs(r.prefs)).catch(() => {});
    void pushActive().then(setPush).catch(() => setPush(false));
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!session) return <Section title={tr('ser.set.title')}><p className="muted small">{tr('ser.set.account')}</p></Section>;
  const set = async (k: Kind, on: boolean) => {
    setPrefs((p) => (p ? { ...p, [k]: on } : p));
    try { const r = await api<{ prefs: Record<Kind, boolean> }>('/notifs/prefs', { body: { kind: k, on }, token: session.token }); setPrefs(r.prefs); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Section title={tr('ser.set.title')}>
      <div className="k-card">
        <p className="muted small serie-set-lead">{tr('ser.set.lead')}</p>
        {KINDS.map((k) => <Toggle key={k} label={tr(`ser.set.${k}` as 'ser.set.bistrot')} checked={prefs?.[k] ?? true} disabled={!prefs} onChange={(on) => void set(k, on)} />)}
        {push === false && (
          <div className="serie-set-push">
            <small className="muted">{tr('ser.set.noPush')}</small>
            {pushSupported() && <button className="btn small" onClick={async () => { const e = await enablePush(session.token); setErr(e); setPush(!e); }}>{tr('ser.set.enable')}</button>}
          </div>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </Section>
  );
}

// --- Tournois programmés : « Me prévenir » ---------------------------------------------------------
export function useTourneyWatch(token: string | null | undefined) {
  const [watched, setWatched] = useState<string[]>([]);
  useEffect(() => {
    if (!token) return;
    api<{ watched: string[] }>('/notifs/prefs', { token }).then((r) => setWatched(r.watched ?? [])).catch(() => {});
  }, [token]);
  const toggle = useCallback(async (slot: string): Promise<string | null> => {
    if (!token) return null;
    const on = !watched.includes(slot);
    if (on && !(await pushActive())) { const e = await enablePush(token); if (e) return e; }
    try { const r = await api<{ watched: string[] }>('/notifs/tournoi', { body: { slot, on }, token }); setWatched(r.watched); return null; } catch (e) { return (e as Error).message; }
  }, [token, watched]);
  return { watched, toggle };
}
