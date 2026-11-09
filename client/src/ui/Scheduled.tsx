/**
 * Tournois programmés (11h et 21h, heure de Bruxelles) : carte d'inscription (accueil et écran
 * Tournois), salon d'attente avec compte à rebours, et résultats en sacs de dés.
 */
import { BagIcon } from './BagIcon';
import { useEffect, useMemo, useState } from 'react';
import {
  BAG_TIERS, SCHED_FEE, SCHED_MAX, SCHED_MIN, bagPrizes, bagsLabel, brusselsDay, formatClock, formatDelay, hourLabel, nextTier,
  type ProgrammeView, type SlotView,
} from '../../../shared/scheduled';
import type { PublicTournament } from '../../../shared/tournament';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { pushActive, pushSupported, enablePush } from '../push';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export const placeLabel = (i: number) => (i === 0 ? '1er' : `${i + 1}e`);

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
  return `${d === today ? '' : d === tomorrow ? 'demain ' : `le ${d.slice(8)}/${d.slice(5, 7)} `}${hourLabel(s.hour)}`;
}

/** Barème des gains, avec le palier actuel mis en avant. */
export function BagTable({ players, compact }: { players: number; compact?: boolean }) {
  const cur = BAG_TIERS.find((t) => players >= t.from && players <= t.to);
  return (
    <table className={`bag-table${compact ? ' compact' : ''}`} aria-label="Gains en sacs de dés selon le nombre de joueurs">
      <thead><tr><th>Joueurs</th><th>1er</th><th>2e</th><th>3e</th><th>4e</th></tr></thead>
      <tbody>
        {BAG_TIERS.map((t) => (
          <tr key={t.from} className={t === cur ? 'on' : ''}>
            <th>{t.from === t.to ? t.from : `${t.from} à ${t.to}`}</th>
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
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const seen = async () => { if (prog.last) { await api('/tournois/vu', { body: { slot: prog.last.slot }, token: pa.token }).catch(() => {}); void load(); } };
  const coins = pa.profile.coins;

  const row = (s: SlotView, main: boolean) => {
    const toOpen = s.startsAt - now, toStart = s.beginsAt - now;
    const full = s.count >= SCHED_MAX;
    const salon = s.status === 'salon' || (toOpen <= 0 && toStart > 0 && s.status === 'a-venir');
    let state: string;
    if (s.status === 'en-cours') state = 'En cours';
    else if (s.status === 'annule') state = 'Annulé';
    else if (s.status === 'termine') state = 'Terminé';
    else if (salon) state = `Salon ouvert · départ dans ${formatClock(toStart)}`;
    else state = `dans ${formatDelay(toOpen)}`;
    let action: React.ReactNode = null;
    if (!pa.isAccount) action = main ? <button className="btn small" onClick={onAccount}>Créer un compte pour jouer</button> : null;
    else if (s.status === 'en-cours' || s.status === 'termine' || s.status === 'annule') action = null;
    else if (salon && s.registered && s.code) action = <button className="btn primary small" onClick={() => onJoin(s.code!, false)}><Icon name="trophy" size={18} /> Rejoindre le salon</button>;
    else if (salon && !s.registered) action = <button className="btn primary small" disabled={busy || full || coins < SCHED_FEE} onClick={() => act('/tournois/inscription', s.id)}>
      {full ? 'Complet' : coins < SCHED_FEE ? 'Pas assez de pièces' : `S'inscrire (${SCHED_FEE} pièces)`}</button>;
    else if (salon) action = <span className="tag">Ouverture…</span>;
    else if (s.registered) action = <span className="sc-reg">
      <span className="tag ok"><Icon name="check" size={16} /> Inscrit</span>
      <button className="btn ghost small" disabled={busy} onClick={() => act('/tournois/desinscription', s.id)}>Se désinscrire</button>
    </span>;
    else action = <button className="btn primary small" disabled={busy || full || coins < SCHED_FEE} onClick={() => act('/tournois/inscription', s.id)}>
      {full ? 'Complet' : coins < SCHED_FEE ? 'Pas assez de pièces' : "S'inscrire"}</button>;
    return (
      <div key={s.id} className={`sc-row${main ? ' main' : ''}${salon ? ' live' : ''}`}>
        <div className="sc-info">
          {main ? <b className="sc-title">{salon ? 'Tournoi' : 'Prochain tournoi'} {whenLabel(s, now)}</b> : <b>Ensuite : {whenLabel(s, now)}</b>}
          <small><span className={salon ? 'sc-live' : ''}>{state}</span> · {s.count} inscrit{s.count > 1 ? 's' : ''}{full ? ' (complet)' : `/${SCHED_MAX}`} · {SCHED_FEE} pièces</small>
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
        <span><b>Tournois de 11 h et 21 h</b><small>Rendez-vous quotidien, heure de Bruxelles</small></span>
      </header>
      {last && (
        <div className={`sc-last ${last.status}`}>
          <p>{last.status === 'joue'
            ? `Tournoi de ${hourLabel(last.hour)} : vous finissez ${placeLabel(last.place ?? 0)}${last.players ? ` sur ${last.players}` : ''}${last.bags ? `, ${bagsLabel(last.bags)} de dés gagné${last.bags > 1 ? 's' : ''} !` : '.'}`
            : `${last.reason ?? `Tournoi de ${hourLabel(last.hour)} annulé.`} ${last.refunded} pièces remboursées.`}</p>
          <button className="btn ghost small" onClick={seen}>OK</button>
        </div>
      )}
      {prog.playing && (
        <div className="sc-row main live">
          <div className="sc-info"><b className="sc-title">Tournoi de {hourLabel(prog.playing.hour)} en cours</b><small>Vous êtes en lice.</small></div>
          <button className="btn primary small" onClick={() => onJoin(prog.playing!.code, false)}>Revenir au tournoi</button>
        </div>
      )}
      {first && row(first, true)}
      {second && row(second, false)}
      {err && <p className="error">{err}</p>}
      {pa.isAccount && !pushOn && pushSupported() && prog.slots.some((s) => s.registered) && (
        <button className="btn ghost small" onClick={async () => { const e = await enablePush(pa.token!); setErr(e); setPushOn(!e); }}>
          <Icon name="bell" size={18} /> Me prévenir 5 minutes avant
        </button>
      )}
      {first && <p className="sc-prize"><BagIcon size="1em" /> {first.count >= SCHED_MIN
        ? <>À {first.count} joueur{first.count > 1 ? 's' : ''} : {bagPrizes(first.count).map((b, i) => `${placeLabel(i)} ${bagsLabel(b)}`).join(', ')}{nextTier(first.count) ? `. Dès ${first.count + nextTier(first.count)!.missing} : ${bagsLabel(nextTier(first.count)!.bags[0])} au 1er` : ''}.</>
        : <>Gains en sacs de dés : de 1 sac (4 joueurs) à 5 sacs au 1er (16 joueurs).</>}</p>}
      <button className="btn ghost small sc-toggle" aria-expanded={showBag} onClick={() => setShowBag((v) => !v)}>
        {showBag ? 'Masquer' : 'Voir'} les gains et le déroulé
      </button>
      {showBag && (
        <div className="sc-rules">
          <BagTable players={first?.count ?? 0} compact />
          <ul className="muted small">
            <li>Inscription : {SCHED_FEE} pièces, à l'avance ou pendant les 5 minutes d'ouverture du salon. Désinscription remboursée jusqu'à l'ouverture.</li>
            <li>À l'heure dite, le salon ouvre ; le tournoi part 5 minutes après, de {SCHED_MIN} à {SCHED_MAX} joueurs.</li>
            <li>Inscrit mais absent du salon au départ : vous êtes retiré et remboursé. Moins de {SCHED_MIN} présents : tournoi annulé, tout le monde est remboursé.</li>
            <li>Les gains dépendent du nombre de joueurs au départ ; le contenu des sacs reste une surprise.</li>
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
      <div className="sl-clock" role="timer" aria-label={`Départ dans ${formatDelay(left)}`}>
        <small>Départ dans</small>
        <b>{formatClock(left)}</b>
        <small>{left > 0 ? `à ${s.hour} h 05` : 'Départ…'}</small>
      </div>
      <p className="sl-status">
        {n < SCHED_MIN
          ? `${n} joueur${n > 1 ? 's' : ''} dans le salon : il en faut au moins ${SCHED_MIN}, sinon le tournoi est annulé et remboursé.`
          : `${n} joueur${n > 1 ? 's' : ''} dans le salon. À gagner : ${bags.map((b, i) => `${placeLabel(i)} ${bagsLabel(b)}`).join(', ')}.`}
        {next && n >= SCHED_MIN ? ` Encore ${next.missing} joueur${next.missing > 1 ? 's' : ''} et le 1er gagne ${bagsLabel(next.bags[0])}.` : ''}
      </p>
      {absent > 0 && <p className="muted small">{absent} inscrit{absent > 1 ? 's' : ''} pas encore là. Absent au départ = retiré et remboursé.</p>}
      <h3>Dans le salon ({n}/{SCHED_MAX})</h3>
      <ol className="members">
        {t.players.map((p, i) => (
          <li key={p.id}>
            <span className="ord">{i + 1}</span>
            <Avatar photo={p.photo} emoji={p.avatar} size={36}><i className={`dot ${p.connected ? 'on' : 'off'}`} /></Avatar>
            <b>{p.name}</b>
            {p.id === meId && <span className="tag">Vous</span>}
          </li>
        ))}
      </ol>
      <h3>Gains selon le nombre de joueurs</h3>
      <BagTable players={n} />
      <p className="muted small">Restez sur cet écran : au départ, vous êtes installé à votre table. Si vous êtes coupé pendant une partie, le serveur joue à votre place jusqu'à votre retour.</p>
    </div>
  );
}

/** Fin d'un tournoi programmé : classement et sacs gagnés, ou annulation. */
export function ScheduledResults({ t, meId }: { t: PublicTournament; meId: string }) {
  const s = t.sched!;
  const nameOf = (id: string) => t.players.find((p) => p.id === id)?.name ?? '?';
  if (s.cancelled) return (
    <div className="sched-results cancelled">
      <p className="sr-big">Tournoi annulé</p>
      <p>{s.cancelled}</p>
      <p className="muted">Vos {SCHED_FEE} pièces vous ont été rendues. Rendez-vous au prochain tournoi !</p>
    </div>
  );
  const standings = t.standings ?? [];
  const mine = standings.indexOf(meId);
  return (
    <div className="sched-results">
      {mine >= 0 && <p className="sr-big">{mine === 0 ? 'Vous remportez le tournoi !' : `Vous finissez ${placeLabel(mine)} sur ${standings.length}`}</p>}
      {mine >= 0 && s.bags[mine] ? <p className="sr-bags"><BagIcon size="1em" /> {bagsLabel(s.bags[mine])} de dés gagné{s.bags[mine] > 1 ? 's : ouvrez-les' : ' : ouvrez-le'} dans votre collection.</p> : null}
      <ol className="ranking t-standings">
        {standings.map((id, i) => (
          <li key={id} className={id === meId ? 'me' : ''}>
            <span className="rk">{placeLabel(i)}</span>
            <span className="nm">{nameOf(id)}</span>
            {s.bags[i] ? <span className="sc bag-text"><BagIcon size="1em" /> {bagsLabel(s.bags[i])}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
