import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { stakeLabel, type LobbyEntry, type TournamentEntry } from '../../../shared/tournament';
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

export type HubTab = 'tables' | 'tournois';
const VARIANT: Record<string, string> = { classique: 'Classique', decharge: 'Décharge seule', manches: 'Aux points', 'sans-charge': 'Sans charge' };

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
      .catch((e) => { if (alive) setListErr((e as Error).message); });
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
    } catch (e) { setCodeErr((e as Error).message); }
  };
  const coins = pa.profile.coins;
  const canPay = (stake: number) => stake === 0 || (pa.isAccount && coins >= stake);
  const payHint = (stake: number) => (stake === 0 ? '' : !pa.isAccount ? 'Compte requis' : coins < stake ? 'Pas assez de pièces' : '');

  const nTables = lists?.lobbies.length ?? 0, nTourn = lists?.tournaments.length ?? 0;
  const vName = VARIANT;
  return (
    <Shell title="Jouer en ligne" onBack={onBack} icon="people"
      sub={lists ? (nTables + nTourn ? `${nTables} table${nTables > 1 ? 's' : ''} et ${nTourn} tournoi${nTourn > 1 ? 's' : ''} ouverts` : 'Tables, tournois et parties à regarder') : 'Chargement des tables…'}>
      <div className="hub">
        <div className="hub-me">
          <button type="button" className="avatar-pick" onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-label="Changer d'avatar" title="Changer d'avatar">
            <Avatar photo={pa.photo} emoji={avatar} size={46} /><i className="hub-me-edit" aria-hidden>✎</i>
          </button>
          <label className="hub-me-name"><small>Votre nom à la table</small>
            <input value={name} maxLength={20} placeholder="Votre nom" onChange={(e) => setName(e.target.value)} /></label>
        </div>
        {picking && <div className="avatars hub-avatars">{AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => { setAvatar(a); setPicking(false); }} aria-label={`Avatar ${a}`}>{a}</button>)}</div>}
        {!ready && <p className="k-warn">Choisissez un nom pour rejoindre ou créer une partie.</p>}

        <form className="hub-code" onSubmit={(e) => { e.preventDefault(); void joinCode(); }}>
          <Icon name="key" size={20} />
          <input className="code-input" value={code} maxLength={5} placeholder="CODE" aria-label="Code de la table ou du tournoi"
            onChange={(e) => { setCodeErr(null); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }} />
          <button className="btn primary small" disabled={!ready || code.length !== 5}>Rejoindre</button>
        </form>
        {codeErr && <p className="error small">{codeErr}</p>}

        <Tabs label="Tables ou tournois" value={tab} onChange={setTab}
          options={[{ v: 'tables', label: 'Tables', icon: 'dice', badge: nTables }, { v: 'tournois', label: 'Tournois', icon: 'trophy', badge: nTourn }]} />

        {tab === 'tables' ? (
          <>
            <BigAction icon="dice" label="Partie rapide" sub="On vous trouve une table tout de suite" disabled={!ready} onClick={() => go(onQuick)} />
            <Tile icon="plus" label="Créer une table" sub="Privée pour vos amis, ou publique" disabled={!ready} onClick={() => go(onCreateRoom)} />
            <Section title="Tables publiques" count={lists ? nTables : undefined}>
              {listErr && <p className="error small">{listErr}</p>}
              {lists && !nTables && <Empty icon="dice" action={<button className="btn small" disabled={!ready} onClick={() => go(onCreateRoom)}>Ouvrir une table</button>}>Aucune table n'attend de joueurs. Ouvrez-en une : elle s'affichera ici.</Empty>}
              <ul className="hub-list">
                {lists?.lobbies.map((l) => (
                  <li key={l.code}>
                    <span className="hub-seats" aria-label={`${l.players} joueurs sur ${l.max}`}><b>{l.players}</b>/{l.max}</span>
                    <div className="l-main">
                      <b>{l.title}</b>
                      <small>{vName[l.variant] ?? l.variant} · {l.turnSeconds ? `${l.turnSeconds} s` : 'sans chrono'}</small>
                      {l.stake ? <small><Coins n={l.stake} label="de mise" /></small> : <small>Sans mise</small>}
                    </div>
                    <button className="btn small primary" disabled={!ready || !canPay(l.stake)} title={payHint(l.stake)} onClick={() => go(() => onJoinRoom(l.code))}>
                      {payHint(l.stake) || 'Rejoindre'}
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
            <BigAction icon="trophy" tone="gold" label="Créer un tournoi" sub="Plusieurs tables, la meilleure moitié passe, jusqu'à la finale" disabled={!ready} onClick={() => go(onCreateTournament)} />
            <Section title="Tournois ouverts" count={lists ? nTourn : undefined}>
              {listErr && <p className="error small">{listErr}</p>}
              {lists && !nTourn && <Empty icon="trophy">Aucun tournoi public n'attend d'inscrits. Lancez le vôtre : il s'affichera ici.</Empty>}
              <ul className="hub-list">
                {lists?.tournaments.map((t) => (
                  <li key={t.code}>
                    <span className="hub-seats gold" aria-label={`${t.players} inscrits sur ${t.max}`}><b>{t.players}</b>/{t.max}</span>
                    <div className="l-main">
                      <b>{t.title}</b>
                      <small>Par {t.host} · tables de {t.tableSize}</small>
                      {t.stake ? <small><Coins n={t.stake} label={`d'entrée, ${t.payout === 'winner' ? 'tout au vainqueur' : 'podium payé'}`} /></small> : <small>{stakeLabel(0)}</small>}
                    </div>
                    <button className="btn small primary" disabled={!ready || !canPay(t.stake)} title={payHint(t.stake)} onClick={() => go(() => onJoinTournament(t.code))}>
                      {payHint(t.stake) || "S'inscrire"}
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
      <span className="k-label">Mise par joueur
        <small>{!pa.isAccount ? 'Les mises demandent un compte (pièces gardées sur le serveur).' : `Vous avez ${pa.profile.coins.toLocaleString('fr-BE')} pièces.`}</small>
      </span>
      <div className="k-pills coins" role="radiogroup" aria-label="Mise par joueur">
        {stakes.map((s) => (
          <button type="button" role="radio" aria-checked={s === value} key={s} className={s === value ? 'on' : ''} disabled={s > 0 && (!pa.isAccount || pa.profile.coins < s)} onClick={() => onChange(s)}>
            {s === 0 ? 'Aucune' : s.toLocaleString('fr-BE')}
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
