import { api } from '../account/api';
import { Chat } from './Chat';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DEFAULT_CONFIG, describeConfig, type GameConfig } from '../../../shared/config';
import { AVATARS } from '../../../shared/protocol';
import { OnlineController, OnlineSession } from '../game/online';
import { loadSession, type Settings } from '../settings';
import { ConfigEditor } from './ConfigEditor';
import { GameScreen, type EndReward } from './GameScreen';
import type { Appearance } from '../../../shared/progress/catalog';
import type { RewardContext } from '../../../shared/progress/profile';
import type { GameState } from '../../../shared/engine';
import { Shell } from './Screens';
import { publicUrl } from '../platform';
import type { ProfileApi } from '../account/useProfile';
import { DEFAULT_TABLE, STAKES, stakeLabel, type TableSettings } from '../../../shared/tournament';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Seg, StakePicker } from './OnlineHub';

export type OnlineMode = { kind: 'create'; invite?: string } | { kind: 'join'; code?: string; auto?: boolean } | { kind: 'resume' } | { kind: 'quick' };
type Mode = OnlineMode;

function useSession(session: OnlineSession | null) {
  const [, force] = useState(0);
  useEffect(() => {
    const off = session?.subscribe(() => force((n) => n + 1));
    return () => { off?.(); };
  }, [session]);
}

/** Création / rejoindre → salon → partie → revanche, tout en ligne. */
export function OnlineFlow({ mode, settings, onSettings, onExit, onCancel, appearance, onGameEnd, auth, onServerReward, pa }: {
  mode: Mode; settings: Settings; onSettings: (s: Settings) => void; onExit: () => void; onCancel?: () => void;
  appearance: Appearance; onGameEnd: (state: GameState, meId: string, ctx: RewardContext) => Promise<EndReward | null>;
  auth: string | null; onServerReward: (r: EndReward) => void; pa: ProfileApi;
}) {
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(settings.name || pa.session?.username || '');
  const [avatar, setAvatar] = useState(settings.avatar);
  const [code, setCode] = useState(mode.kind === 'join' ? mode.code ?? '' : '');
  const [table, setTable] = useState<TableSettings>(DEFAULT_TABLE);
  useSession(session);

  const exit = () => { session?.leave(); onExit(); };
  const cancel = () => { session?.leave(); (onCancel ?? onExit)(); };

  const connect = async (kind: 'create' | 'join' | 'resume' | 'quick') => {
    setBusy(true);
    setError(null);
    const s = new OnlineSession(auth, onServerReward, pa.onServerProfile);
    s.dice = pa.profile.equipped.dice;
    try {
      if (kind === 'create') await s.create(name.trim(), avatar, DEFAULT_CONFIG, table);
      else if (kind === 'join') await s.join(code.trim().toUpperCase(), name.trim(), avatar);
      else if (kind === 'quick') await s.quick(name.trim() || 'Joueur', avatar);
      else {
        const saved = loadSession();
        if (!saved) throw new Error('Aucune partie à reprendre');
        await s.join(saved.code, name.trim() || 'Joueur', avatar, saved.token);
      }
      if (kind !== 'resume' && kind !== 'quick') onSettings({ ...settings, name: name.trim(), avatar });
      setSession(s);
      // Table créée pour inviter un ami : l'invitation part dès que la table existe.
      if (kind === 'create' && mode.kind === 'create' && mode.invite && pa.token) {
        await api('/invites', { token: pa.token, body: { username: mode.invite } }).catch((e) => setError((e as Error).message));
      }
    } catch (e) {
      s.socket.disconnect();
      setError((e as Error).message);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (mode.kind === 'resume') void connect('resume');
    else if (mode.kind === 'create' && mode.invite) {
      if (name.trim()) void connect('create');
    }
    else if (mode.kind === 'quick') void connect('quick');
    else if (mode.kind === 'join' && mode.auto && name.trim() && code.length === 5) void connect('join');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const controller = useMemo(() => (session ? new OnlineController(session) : null), [session]);

  if (session?.room?.status === 'playing' && controller) {
    return (
      <>
        <GameScreen controller={controller} settings={settings} onSettings={onSettings} onExit={onExit}
          appearance={appearance} pa={pa} onGameEnd={(st, ctx) => onGameEnd(st, controller.meId, ctx)} />
        <Notices session={session} />
        <Chat session={session} pa={pa} />
      </>
    );
  }
  if (session?.kicked) return <Shell title="Table" onBack={onExit}><p>{session.kicked}</p><button className="btn primary" onClick={onExit}>Retour à l’accueil</button></Shell>;
  if (session?.room) return <><Lobby session={session} onExit={exit} pa={pa} /><Notices session={session} /><Chat session={session} pa={pa} /></>;

  const isJoin = mode.kind === 'join';
  return (
    <Shell title={mode.kind === 'resume' || mode.kind === 'quick' ? 'Connexion…' : isJoin ? 'Rejoindre une table' : 'Créer une table'} onBack={cancel}>
      {mode.kind === 'resume' || mode.kind === 'quick' ? (
        <div className="form">
          {busy && <p>{mode.kind === 'quick' ? 'Recherche d’une table…' : 'Reconnexion au salon…'}</p>}
          {error && <><p className="error">{error}</p><button className="btn" onClick={onExit}>Retour à l'accueil</button></>}
        </div>
      ) : (
        <form className="form" onSubmit={(e) => { e.preventDefault(); void connect(isJoin ? 'join' : 'create'); }}>
          {isJoin && (
            <label className="field"><span>Code de la partie</span>
              <input className="code-input" value={code} maxLength={5} autoFocus placeholder="ABCDE"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
          )}
          <label className="field"><span>Votre nom</span>
            <input value={name} maxLength={20} placeholder="Votre nom" autoFocus={!isJoin} onChange={(e) => setName(e.target.value)} /></label>
          <details className="values">
            <summary>Changer d'avatar ({avatar})</summary>
            <div className="avatars">{AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}</div>
          </details>
          {!isJoin && <TableFields table={table} onChange={setTable} pa={pa} />}
          {error && <p className="error">{error}</p>}
          <button className="btn primary big" disabled={busy || !name.trim() || (isJoin && code.length !== 5)}>
            {busy ? 'Connexion…' : isJoin ? 'Rejoindre' : 'Créer la table'}
          </button>
          {!isJoin && <p className="muted small">Vous choisirez les règles dans le salon, une fois vos amis arrivés.</p>}
        </form>
      )}
    </Shell>
  );
}

/** Réglages de la table : visibilité, nombre de places, mise. */
function TableFields({ table, onChange, pa, minPlayers = 2 }: { table: TableSettings; onChange: (t: TableSettings) => void; pa: ProfileApi; minPlayers?: number }) {
  return (
    <>
      <Seg label="Qui peut rejoindre ?" value={table.visibility} onChange={(v) => onChange({ ...table, visibility: v })}
        hint={table.visibility === 'public' ? 'La table apparaît dans la liste des tables publiques.' : 'Seuls ceux qui ont le code ou le lien peuvent entrer.'}
        options={[{ v: 'private', label: 'Sur invitation' }, { v: 'public', label: 'Tout le monde' }]} />
      <Seg label="Nombre de places" value={table.maxPlayers} onChange={(v) => onChange({ ...table, maxPlayers: v })}
        options={[2, 3, 4, 5, 6].filter((n) => n >= minPlayers).map((n) => ({ v: n, label: String(n) }))} />
      <StakePicker value={table.stake} onChange={(v) => onChange({ ...table, stake: v })} pa={pa} stakes={STAKES} />
      {table.stake > 0 && <p className="muted small">Chaque joueur mise {table.stake} pièces au lancement de la partie. Le gagnant remporte la cagnotte (partagée en cas d'égalité).</p>}
    </>
  );
}

function Lobby({ session, onExit, pa }: { session: OnlineSession; onExit: () => void; pa: ProfileApi }) {
  const room = session.room!;
  const me = room.members.find((m) => m.id === session.playerId);
  const isHost = session.isHost;
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const link = `${publicUrl()}/?rejoindre=${room.code}`;
  // Sur téléphone : menu de partage natif (SMS, WhatsApp, Messenger…).
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    try { await navigator.share({ title: 'Partie de 421', text: `Viens jouer au 421 avec moi ! Code : ${room.code}`, url: link }); }
    catch { /* partage annulé */ }
  };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); }
    catch { window.prompt('Copiez :', text); }
  };
  const allReady = room.members.filter((m) => !m.left).every((m) => m.ready);
  const count = room.members.length;
  const updateConfig = async (c: GameConfig) => { const a = await session.setConfig(c); if (!a.ok) setErr(a.error); };
  const updateTable = async (t: TableSettings) => { setErr(null); const a = await session.setTable(t); if (!a.ok) setErr(a.error); };
  const max = room.table.maxPlayers;
  const [botLevel, setBotLevel] = useState<'facile' | 'normal' | 'difficile'>('normal');
  const addBot = async () => { setErr(null); const a = await session.addBot(botLevel); if (!a.ok) setErr(a.error); };
  const humans = room.members.filter((m) => !m.bot).length;
  const start = async () => { setErr(null); const a = await session.start(); if (!a.ok) setErr(a.error); };

  return (
    <Shell title={room.title} onBack={onExit} wide>
      <div className="cols">
        <section>
          <LobbyTable room={room} meId={session.playerId} isHost={isHost} max={max}
            onInvite={() => (canShare ? void share() : void copy(link, 'lien'))}
            onKick={async (id) => { const a = await session.kick(id); if (!a.ok) setErr(a.error); }}
            onRemoveBot={(id) => void session.removeBot(id)} />
          <div className="lobby-code">
            <span>{room.table.visibility === 'public' ? 'Table publique' : 'Sur invitation'} · code <b>{room.code}</b></span>
            <button className="btn small" onClick={() => copy(room.code, 'code')}><Icon name="copy" size={16} />{copied === 'code' ? 'Copié' : 'Code'}</button>
            {canShare
              ? <button className="btn small" onClick={share}><Icon name="share" size={16} />Inviter</button>
              : <button className="btn small" onClick={() => copy(link, 'lien')}><Icon name="share" size={16} />{copied === 'lien' ? 'Copié' : 'Lien'}</button>}
          </div>
          {pa.isAccount && count < max && <InviteFriends pa={pa} inRoom={room.members.map((m) => m.name)} />}
          {isHost && count < max && room.table.stake === 0 && (
            <div className="bot-add">
              <div className="seg" role="group" aria-label="Niveau de l'ordinateur">
                {(['facile', 'normal', 'difficile'] as const).map((d) => <button key={d} className={botLevel === d ? 'on' : ''} onClick={() => setBotLevel(d)}>{d[0].toUpperCase() + d.slice(1)}</button>)}
              </div>
              <button className="btn small" onClick={addBot}><Icon name="plus" size={18} />Ajouter un ordinateur</button>
            </div>
          )}
          {isHost && humans === 1 && count < 2 && <p className="muted small">Personne pour l'instant : ajoutez un ordinateur pour jouer tout de suite, ou partagez le code.</p>}
          {!session.connected && <p className="error">Connexion perdue, reconnexion en cours…</p>}
          <div className="lobby-actions">
            {!isHost && me && (
              <button className={`btn big wide ${me.ready ? '' : 'primary'}`} onClick={() => session.setReady(!me.ready)}>
                {me.ready ? 'Je ne suis plus prêt' : 'Je suis prêt'}
              </button>
            )}
            {isHost && (
              <button className="btn primary big wide" disabled={count < 2 || !allReady} onClick={start}>
                {count < 2 ? 'En attente de joueurs…' : !allReady ? 'En attente des joueurs prêts…' : 'Lancer la partie'}
              </button>
            )}
            {err && <p className="error">{err}</p>}
          </div>
        </section>
        <section>
          <h3>Table</h3>
          {isHost ? <TableFields table={room.table} onChange={updateTable} pa={pa} minPlayers={Math.max(2, count)} />
            : <ul className="muted">
              <li>{room.table.visibility === 'public' ? 'Table publique' : 'Table sur invitation'}, {max} places</li>
              <li>{room.table.stake ? `Mise de ${room.table.stake} pièces par joueur, le gagnant remporte la cagnotte` : stakeLabel(0)}</li>
            </ul>}
          <h3>Règles {isHost ? '' : <small className="muted">(choisies par l'hôte)</small>}</h3>
          {isHost ? <ConfigEditor config={room.config} onChange={updateConfig} />
            : <ul className="muted">{describeConfig(room.config).map((l) => <li key={l}>{l}</li>)}</ul>}
        </section>
      </div>
    </Shell>
  );
}

/** Salon : la table vue du dessus, les joueurs assis autour, les places libres pour inviter. */
function LobbyTable({ room, meId, isHost, max, onInvite, onKick, onRemoveBot }: {
  room: NonNullable<OnlineSession['room']>; meId: string | null; isHost: boolean; max: number;
  onInvite: () => void; onKick: (id: string) => void; onRemoveBot: (id: string) => void;
}) {
  const seats = Math.max(max, room.members.length);
  // Le joueur se voit toujours en haut de la table ; les autres suivent dans l'ordre.
  const meIdx = Math.max(0, room.members.findIndex((m) => m.id === meId));
  const ordered = [...room.members.slice(meIdx), ...room.members.slice(0, meIdx)];
  const ready = room.members.filter((m) => !m.left && m.ready).length;
  return (
    <div className="ltable-wrap">
      <div className="ltable" style={{ ['--n' as string]: seats }}>
        <div className="ltable-felt">
          {room.table.stake > 0
            ? <><b>{room.table.stake * room.members.length}</b><small>pièces en jeu</small><small className="muted">{room.table.stake} par joueur</small></>
            : <><b>{room.members.length}/{max}</b><small>joueurs</small><small className="muted">{ready} prêt{ready > 1 ? 's' : ''}</small></>}
        </div>
        {Array.from({ length: seats }, (_, i) => {
          const m = ordered[i];
          const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
          const style = { left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` };
          if (!m) return (
            <button key={`v${i}`} className="seat empty" style={style} onClick={onInvite} aria-label="Inviter quelqu'un à cette place">
              <span className="seat-av"><Icon name="plus" size={20} /></span><span className="seat-name">Inviter</span>
            </button>
          );
          const mine = m.id === meId;
          return (
            <div key={m.id} className={`seat${mine ? ' me' : ''}${m.ready || m.bot ? ' ready' : ''}`} style={style}>
              <span className="seat-av"><Avatar photo={m.photo} emoji={m.avatar} size={46} accessory={m.accessory} />
                {(m.ready || m.bot) && <i className="seat-ok"><Icon name="check" size={11} /></i>}
                {!m.connected && !m.bot && <i className="seat-off" />}
                {m.isHost && <i className="seat-host" title="Hôte">★</i>}</span>
              <span className="seat-name">{mine ? `${m.name} (vous)` : m.name}</span>
              <small>{m.bot ? `Ordi · ${m.bot}` : !m.connected ? 'hors ligne' : m.ready ? 'prêt' : 'pas prêt'}</small>
              {isHost && !mine && (m.bot
                ? <button className="seat-kick" onClick={() => onRemoveBot(m.id)} aria-label={`Retirer ${m.name}`}>Retirer</button>
                : <button className="seat-kick" onClick={() => onKick(m.id)} aria-label={`Exclure ${m.name}`}>Exclure</button>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Notices({ session }: { session: OnlineSession }) {
  const n = useSyncExternalStore((cb) => session.subscribe(cb), () => session.notices);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  useEffect(() => {
    const last = n[n.length - 1];
    if (!last) return;
    const t = setTimeout(() => setHidden((h) => new Set(h).add(last.id)), 5000);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="notices">
      {n.filter((x) => !hidden.has(x.id)).map((x) => <div key={x.id} className={`notice ${x.kind}`}>{x.text}</div>)}
    </div>
  );
}

/** Inviter ses amis en ligne directement depuis le salon. */
function InviteFriends({ pa, inRoom }: { pa: ProfileApi; inRoom: string[] }) {
  const [friends, setFriends] = useState<{ username: string; online: boolean; me?: boolean; room: unknown }[]>([]);
  const [sent, setSent] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () => api<{ friends: typeof friends }>('/friends', { token: pa.token! }).then((r) => setFriends(r.friends.filter((f) => !f.me))).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, [pa.token]);
  const list = friends.filter((f) => !inRoom.includes(f.username)).sort((a, b) => Number(b.online) - Number(a.online));
  if (!list.length) return null;
  return (
    <section className="lobby-invite">
      <h3>Inviter des amis</h3>
      <ul>
        {list.slice(0, 8).map((f) => (
          <li key={f.username}>
            <i className={`fr-dot ${f.online ? 'on' : ''}`} aria-hidden /><b>{f.username}</b>
            {sent[f.username] ? <small className="muted">{sent[f.username]}</small> : (
              <button className="btn small" onClick={async () => {
                try { await api('/invites', { token: pa.token!, body: { username: f.username } }); setSent((x) => ({ ...x, [f.username]: 'Invitation envoyée' })); }
                catch (e) { setSent((x) => ({ ...x, [f.username]: (e as Error).message })); }
              }}>Inviter</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
