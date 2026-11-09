import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { type LobbyEntry, type TournamentEntry } from '../../../shared/tournament';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { BigAction, Coins, Empty, Section, Shell, Tabs, Tile } from './kit';
import { RecentGames } from './Friends';
import { ProfileView } from './ProfileView';
import { LiveGames } from './SpectateFlow';
import { ScheduledCard } from './Scheduled';
import { tr, trServer, fmtNum } from '../i18n/lang';
import { trn, trVariant } from '../i18n/g421';

export type HubTab = 'tables' | 'tournois';

/**
 * Jouer en ligne : rejoindre avec un code, créer une table ou un tournoi, ou choisir dans les
 * listes publiques (rafraîchies toutes les 4 secondes).
 */
export function OnlineHub({ tab: initial, settings, onSettings, pa, onBack, onJoinRoom, onJoinTournament, onCreateRoom, onCreateTournament, onQuick, onWatch, onJoinScheduled, onAccount }: {
  tab: HubTab; settings: Settings; onSettings: (s: Settings) => void; pa: ProfileApi; onBack: () => void;
  onJoinScheduled?: (code: string, pay: boolean) => void; onAccount?: () => void;
  onJoinRoom: (code: string) => void; onJoinTournament: (code: string) => void; onCreateRoom: () => void; onCreateTournament: () => void; onQuick: () => void;
  /** Regarder une partie en cours (mode spectateur). */
  onWatch?: (code: string) => void;
}) {
  const [profile, setProfile] = useState<string | null>(null);
  const [tab, setTab] = useState<HubTab>(initial);
  const [name, setName] = useState(settings.name || pa.session?.username || '');
  const [avatar, setAvatar] = useState(settings.avatar);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [lists, setLists] = useState<{ lobbies: LobbyEntry[]; tournaments: TournamentEntry[] } | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api<{ lobbies: LobbyEntry[]; tournaments: TournamentEntry[] }>('/lobbies')
      .then((r) => { if (alive) { setLists(r); setListErr(null); } })
      .catch((e) => { if (alive) setListErr(trServer((e as Error).message)); });
    void load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const ready = name.trim().length > 0;
  /** Mémorise le nom et l'avatar avant d'aller plus loin. */
  const go = (fn: () => void) => { onSettings({ ...settings, name: name.trim(), avatar }); fn(); };
  const joinCode = async () => {
    setCodeErr(null);
    try {
      const r = await api<{ kind: 'room' | 'tournament'; playing?: boolean }>(`/code/${code}`);
      if (r.playing && onWatch) { onWatch(code); return; }
      go(() => (r.kind === 'room' ? onJoinRoom(code) : onJoinTournament(code)));
    } catch (e) { setCodeErr(trServer((e as Error).message)); }
  };
  const coins = pa.profile.coins;
  const canPay = (stake: number) => stake === 0 || (pa.isAccount && coins >= stake);
  const payHint = (stake: number) => (stake === 0 ? '' : !pa.isAccount ? tr('g421.hub.needAcc') : coins < stake ? tr('g421.hub.noCoins') : '');

  const nTables = lists?.lobbies.length ?? 0, nTourn = lists?.tournaments.length ?? 0;
  return (
    <Shell title={tr('g421.menu.online')} onBack={onBack} icon="people"
      sub={lists ? (nTables + nTourn ? tr('g421.hub.sub', { t: trn('g421.hub.tables', nTables), u: trn('g421.hub.tourns', nTourn) }) : tr('g421.hub.subEmpty')) : tr('g421.hub.loading')}>
      <div className="hub">
        <div className="hub-me">
          <button type="button" className="avatar-pick" onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-label={tr('g421.on.changeAv')} title={tr('g421.on.changeAv')}>
            <Avatar photo={pa.photo} emoji={avatar} size={46} /><i className="hub-me-edit" aria-hidden>✎</i>
          </button>
          <label className="hub-me-name"><small>{tr('g421.hub.tableName')}</small>
            <input value={name} maxLength={20} placeholder={tr('g421.on.name')} onChange={(e) => setName(e.target.value)} /></label>
        </div>
        {picking && <div className="avatars hub-avatars">{AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => { setAvatar(a); setPicking(false); }} aria-label={`Avatar ${a}`}>{a}</button>)}</div>}
        {!ready && <p className="k-warn">{tr('g421.hub.needName')}</p>}

        <form className="hub-code" onSubmit={(e) => { e.preventDefault(); void joinCode(); }}>
          <Icon name="key" size={20} />
          <input className="code-input" value={code} maxLength={5} placeholder="CODE" aria-label={tr('g421.hub.codeA')}
            onChange={(e) => { setCodeErr(null); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }} />
          <button className="btn primary small" disabled={!ready || code.length !== 5}>{tr('g421.menu.join')}</button>
        </form>
        {codeErr && <p className="error small">{codeErr}</p>}

        <Tabs label={tr('g421.hub.tabs')} value={tab} onChange={setTab}
          options={[{ v: 'tables', label: tr('g421.menu.tables'), icon: 'dice', badge: nTables }, { v: 'tournois', label: tr('g421.hub.tournois'), icon: 'trophy', badge: nTourn }]} />

        {tab === 'tables' ? (
          <>
            <BigAction icon="dice" label={tr('g421.menu.quick')} sub={tr('g421.hub.quickSub')} disabled={!ready} onClick={() => go(onQuick)} />
            <Tile icon="plus" label={tr('g421.on.createT')} sub={tr('g421.hub.createSub')} disabled={!ready} onClick={() => go(onCreateRoom)} />
            <Section title={tr('g421.hub.public')} count={lists ? nTables : undefined}>
              {listErr && <p className="error small">{listErr}</p>}
              {lists && !nTables && <Empty icon="dice" action={<button className="btn small" disabled={!ready} onClick={() => go(onCreateRoom)}>{tr('g421.hub.openOne')}</button>}>{tr('g421.hub.noneT')}</Empty>}
              <ul className="hub-list">
                {lists?.lobbies.map((l) => (
                  <li key={l.code}>
                    <span className="hub-seats" aria-label={tr('g421.hub.seatsA', { a: l.players, b: l.max })}><b>{l.players}</b>/{l.max}</span>
                    <div className="l-main">
                      <b>{trServer(l.title)}</b>
                      <small>{trVariant(l.variant)} · {l.turnSeconds ? `${l.turnSeconds} s` : tr('g421.hub.noClock')}</small>
                      {l.stake ? <small><Coins n={l.stake} label={tr('g421.hub.ofStake')} /></small> : <small>{tr('g421.on.noStake')}</small>}
                    </div>
                    <button className="btn small primary" disabled={!ready || !canPay(l.stake)} title={payHint(l.stake)} onClick={() => go(() => onJoinRoom(l.code))}>
                      {payHint(l.stake) || tr('g421.menu.join')}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
            {onWatch && <LiveGames onWatch={onWatch} />}
          </>
        ) : (
          <>
            {onJoinScheduled && <ScheduledCard pa={pa} onJoin={(c, pay) => go(() => onJoinScheduled(c, pay))} onAccount={onAccount ?? onBack} />}
            <BigAction icon="trophy" tone="gold" label={tr('g421.t.create')} sub={tr('g421.hub.tSub')} disabled={!ready} onClick={() => go(onCreateTournament)} />
            <Section title={tr('g421.hub.openT')} count={lists ? nTourn : undefined}>
              {listErr && <p className="error small">{listErr}</p>}
              {lists && !nTourn && <Empty icon="trophy">{tr('g421.hub.noneTour')}</Empty>}
              <ul className="hub-list">
                {lists?.tournaments.map((t) => (
                  <li key={t.code}>
                    <span className="hub-seats gold" aria-label={tr('g421.hub.regA', { a: t.players, b: t.max })}><b>{t.players}</b>/{t.max}</span>
                    <div className="l-main">
                      <b>{trServer(t.title)}</b>
                      <small>{tr('g421.hub.by', { h: t.host, n: t.tableSize })}</small>
                      {t.stake ? <small><Coins n={t.stake} label={tr(t.payout === 'winner' ? 'g421.hub.entryAll' : 'g421.hub.entryPod')} /></small> : <small>{tr('g421.on.noStake')}</small>}
                    </div>
                    <button className="btn small primary" disabled={!ready || !canPay(t.stake)} title={payHint(t.stake)} onClick={() => go(() => onJoinTournament(t.code))}>
                      {payHint(t.stake) || tr('g421.hub.register')}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
        <RecentGames onOpen={setProfile} />
        {profile && <ProfileView pa={pa} username={profile} onClose={() => setProfile(null)} />}
      </div>
    </Shell>
  );
}

/** Sélecteur de mise : les montants hors de portée sont désactivés, avec la raison. */
export function StakePicker({ value, onChange, pa, stakes }: { value: number; onChange: (v: number) => void; pa: ProfileApi; stakes: number[] }) {
  return (
    <div className="k-field">
      <span className="k-label">{tr('g421.hub.stakeL')}
        <small>{!pa.isAccount ? tr('g421.hub.stakeAcc') : tr('g421.hub.haveCoins', { n: fmtNum(pa.profile.coins) })}</small>
      </span>
      <div className="k-pills coins" role="radiogroup" aria-label={tr('g421.hub.stakeL')}>
        {stakes.map((s) => (
          <button type="button" role="radio" aria-checked={s === value} key={s} className={s === value ? 'on' : ''} disabled={s > 0 && (!pa.isAccount || pa.profile.coins < s)} onClick={() => onChange(s)}>
            {s === 0 ? tr('g421.hub.none') : fmtNum(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Choix dans une courte liste (pastilles). */
export function Seg<T extends string | number>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="k-field">
      <span className="k-label">{label}{hint && <small>{hint}</small>}</span>
      <div className="k-pills" role="radiogroup" aria-label={label}>
        {options.map((o) => <button type="button" role="radio" aria-checked={o.v === value} key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}
      </div>
    </div>
  );
}
