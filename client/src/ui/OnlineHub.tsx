import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { stakeLabel, type LobbyEntry, type TournamentEntry } from '../../../shared/tournament';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Shell } from './Screens';
import { RecentGames } from './Friends';
import { ProfileView } from './ProfileView';
import { LiveGames } from './SpectateFlow';

export type HubTab = 'tables' | 'tournois';
const VARIANT: Record<string, string> = { classique: 'Partie classique', manches: 'Aux points', 'sans-charge': 'Sans charge' };

/**
 * Jouer en ligne : rejoindre avec un code, créer une table ou un tournoi, ou choisir dans les
 * listes publiques (rafraîchies toutes les 4 secondes).
 */
export function OnlineHub({ tab: initial, settings, onSettings, pa, onBack, onJoinRoom, onJoinTournament, onCreateRoom, onCreateTournament, onQuick, onWatch }: {
  tab: HubTab; settings: Settings; onSettings: (s: Settings) => void; pa: ProfileApi; onBack: () => void;
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

  return (
    <Shell title="Jouer en ligne" onBack={onBack}>
      <div className="form">
        <div className="identity">
          <button type="button" className="avatar-pick" onClick={() => setPicking((v) => !v)} aria-expanded={picking} aria-label="Changer d'avatar" title="Changer d'avatar">
            <Avatar photo={pa.photo} emoji={avatar} size={48} />
          </button>
          <label className="field grow"><span>Votre nom à la table</span>
            <input value={name} maxLength={20} placeholder="Votre nom" onChange={(e) => setName(e.target.value)} /></label>
        </div>
        {picking && <div className="avatars">{AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => { setAvatar(a); setPicking(false); }} aria-label={`Avatar ${a}`}>{a}</button>)}</div>}

        <form className="code-join" onSubmit={(e) => { e.preventDefault(); void joinCode(); }}>
          <label className="field grow"><span>Vous avez un code ?</span>
            <input className="code-input" value={code} maxLength={5} placeholder="ABCDE" aria-label="Code de la table ou du tournoi"
              onChange={(e) => { setCodeErr(null); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }} /></label>
          <button className="btn" disabled={!ready || code.length !== 5}>Rejoindre</button>
        </form>
        {codeErr && <p className="error">{codeErr}</p>}
        {!ready && <p className="muted small">Choisissez un nom pour rejoindre ou créer une partie.</p>}

        <div className="seg wide-seg" role="tablist">
          <button role="tab" aria-selected={tab === 'tables'} className={tab === 'tables' ? 'on' : ''} onClick={() => setTab('tables')}>Tables</button>
          <button role="tab" aria-selected={tab === 'tournois'} className={tab === 'tournois' ? 'on' : ''} onClick={() => setTab('tournois')}>Tournois</button>
        </div>

        {tab === 'tables' ? (
          <section>
            <div className="hub-actions">
              <button className="btn primary" disabled={!ready} onClick={() => go(onQuick)}><Icon name="dice" /> Partie rapide</button>
              <button className="btn secondary" disabled={!ready} onClick={() => go(onCreateRoom)}><Icon name="plus" /> Créer une table</button>
            </div>
            <p className="muted small hub-help">Partie rapide : vous rejoignez une table publique qui attend des joueurs, ou on vous en ouvre une. Créer une table : privée (vous envoyez le code à vos amis) ou publique.</p>
            <h3>Tables publiques</h3>
            {listErr && <p className="error">{listErr}</p>}
            {lists && !lists.lobbies.length && <p className="empty">Aucune table publique n'attend de joueurs pour l'instant. Créez-en une : elle s'affichera ici.</p>}
            <ul className="list">
              {lists?.lobbies.map((l) => (
                <li key={l.code}>
                  <div className="l-main">
                    <b>{l.title}</b>
                    <small>{VARIANT[l.variant] ?? l.variant}, {l.turnSeconds ? `${l.turnSeconds} s par tour` : 'sans limite de temps'}</small>
                    <small>{l.stake ? <span className="tag coins">Mise de {l.stake} pièces</span> : 'Sans mise'}</small>
                  </div>
                  <span className="l-seats" aria-label={`${l.players} joueurs sur ${l.max}`}>{l.players}/{l.max}</span>
                  <button className="btn small" disabled={!ready || !canPay(l.stake)} title={payHint(l.stake)} onClick={() => go(() => onJoinRoom(l.code))}>
                    {payHint(l.stake) || 'Rejoindre'}
                  </button>
                </li>
              ))}
            </ul>
            {onWatch && <LiveGames onWatch={onWatch} />}
          </section>
        ) : (
          <section>
            <button className="btn primary wide" disabled={!ready} onClick={() => go(onCreateTournament)}><Icon name="trophy" /> Créer un tournoi</button>
            <p className="muted small hub-help">Plusieurs tables jouent en même temps ; la meilleure moitié de chaque table passe au tour suivant, jusqu'à la finale.</p>
            <h3>Tournois ouverts</h3>
            {listErr && <p className="error">{listErr}</p>}
            {lists && !lists.tournaments.length && <p className="empty">Aucun tournoi public n'est ouvert aux inscriptions. Lancez le vôtre : il s'affichera ici.</p>}
            <ul className="list">
              {lists?.tournaments.map((t) => (
                <li key={t.code}>
                  <div className="l-main">
                    <b>{t.title}</b>
                    <small>Organisé par {t.host}, tables de {t.tableSize}</small>
                    <small>{t.stake ? <span className="tag coins">Entrée {t.stake} pièces, {t.payout === 'winner' ? 'tout au vainqueur' : 'podium payé'}</span> : stakeLabel(0)}</small>
                  </div>
                  <span className="l-seats" aria-label={`${t.players} inscrits sur ${t.max}`}>{t.players}/{t.max}</span>
                  <button className="btn small" disabled={!ready || !canPay(t.stake)} title={payHint(t.stake)} onClick={() => go(() => onJoinTournament(t.code))}>
                    {payHint(t.stake) || "S'inscrire"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
    <div className="field">
      <span>Mise par joueur
        <small>{!pa.isAccount ? 'Les mises demandent un compte : vos pièces sont gardées sur le serveur.' : `Vous avez ${pa.profile.coins.toLocaleString('fr-BE')} pièces.`}</small>
      </span>
      <div className="seg">
        {stakes.map((s) => (
          <button type="button" key={s} className={s === value ? 'on' : ''} disabled={s > 0 && (!pa.isAccount || pa.profile.coins < s)} onClick={() => onChange(s)}>
            {s === 0 ? 'Aucune' : s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Choix dans une courte liste (segments). */
export function Seg<T extends string | number>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <div className="seg">
        {options.map((o) => <button type="button" key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}
      </div>
    </div>
  );
}
