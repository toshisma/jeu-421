import { api } from '../account/api';
import { Chat } from './Chat';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavGuard } from './navGuard';
import { DEFAULT_CONFIG, type GameConfig } from '../../../shared/config';
import { AVATARS } from '../../../shared/protocol';
import { OnlineController, OnlineSession } from '../game/online';
import { loadSession, type Settings } from '../settings';
import { ConfigEditor } from './ConfigEditor';
import { GameScreen, type EndReward } from './GameScreen';
import type { Appearance } from '../../../shared/progress/catalog';
import type { RewardContext } from '../../../shared/progress/profile';
import type { GameState } from '../../../shared/engine';
import { BigAction, Choices, Shell } from './kit';
import { publicUrl } from '../platform';
import type { ProfileApi } from '../account/useProfile';
import { DEFAULT_TABLE, STAKES, type TableSettings } from '../../../shared/tournament';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Seg, StakePicker } from './OnlineHub';
import { trackEvent } from '../visit';
import { usePresenceLayer } from '../presence';
import { tr, trServer } from '../i18n/lang';
import { botName, describeCfg, trn } from '../i18n/g421';

export type OnlineMode = { kind: 'create'; invite?: string } | { kind: 'join'; code?: string; auto?: boolean } | { kind: 'resume' } | { kind: 'quick' };
type Mode = OnlineMode;

/** Table rejointe : le code d'invitation quitte l'adresse (sinon recharger la page le réutiliserait). */
function clearInviteParam() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('rejoindre')) return;
    u.searchParams.delete('rejoindre');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch { /* aperçu intégré : rien à nettoyer */ }
}

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
  // Présence (administration) : salon ou partie, avec le code de la table.
  usePresenceLayer(session?.room ? { view: session.room.status === 'playing' ? 'partie' : 'salon', code: session.room.code } : null);

  const exit = () => { session?.leave(); onExit(); };
  // Partir par la barre du bas (salon ou partie) : on quitte la table comme avec la flèche retour ;
  // en pleine partie, l'écran de jeu demande d'abord confirmation (le serveur joue à votre place).
  useNavGuard(session ? { leave: () => session.leave() } : null);
  const cancel = () => { session?.leave(); (onCancel ?? onExit)(); };

  const connect = async (kind: 'create' | 'join' | 'resume' | 'quick') => {
    setBusy(true);
    setError(null);
    const s = new OnlineSession(auth, onServerReward, pa.onServerProfile);
    s.dice = pa.profile.equipped.dice;
    try {
      if (kind === 'create') await s.create(name.trim(), avatar, DEFAULT_CONFIG, table);
      else if (kind === 'join') {
        // Page rechargée avec ?rejoindre=CODE : si c'est notre table, on reprend notre place (jeton de session).
        const c = code.trim().toUpperCase();
        const saved = loadSession();
        await s.join(c, name.trim() || settings.name || tr('g421.on.player'), avatar, saved && !saved.tournament && saved.code === c ? saved.token : undefined);
      }
      else if (kind === 'quick') await s.quick(name.trim() || tr('g421.on.player'), avatar);
      else {
        const saved = loadSession();
        if (!saved) throw new Error('Aucune partie à reprendre');
        await s.join(saved.code, name.trim() || tr('g421.on.player'), avatar, saved.token);
      }
      if (kind !== 'resume' && kind !== 'quick') onSettings({ ...settings, name: name.trim(), avatar });
      setSession(s);
      clearInviteParam();
      // Table créée pour inviter un ami : l'invitation part dès que la table existe.
      if (kind === 'create' && mode.kind === 'create' && mode.invite && pa.token) {
        await api('/invites', { token: pa.token, body: { username: mode.invite } }).catch((e) => setError(trServer((e as Error).message)));
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
    else if (mode.kind === 'join' && code.length === 5 && ((mode.auto && name.trim()) || loadSession()?.code === code)) void connect('join');
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
  if (session?.kicked) return <Shell title={tr('g421.on.table')} onBack={onExit}><p>{trServer(session.kicked)}</p><button className="btn primary" onClick={onExit}>{tr('g421.on.backHome')}</button></Shell>;
  if (session?.room) return <><Lobby session={session} onExit={exit} pa={pa} /><Notices session={session} /><Chat session={session} pa={pa} /></>;

  const isJoin = mode.kind === 'join';
  const waiting = mode.kind === 'resume' || mode.kind === 'quick';
  const canGo = !busy && !!name.trim() && (!isJoin || code.length === 5);
  const submit = () => { if (canGo) void connect(isJoin ? 'join' : 'create'); };
  return (
    <Shell title={tr(waiting ? 'g421.on.connecting' : isJoin ? 'g421.on.joinT' : 'g421.on.createT')} onBack={cancel} icon={isJoin ? 'key' : 'plus'}
      foot={waiting ? undefined : <BigAction type="button" icon={isJoin ? 'people' : 'dice'} disabled={!canGo} onClick={submit}
        label={tr(busy ? 'g421.on.connecting' : isJoin ? 'g421.on.joinB' : 'g421.on.openB')}
        sub={isJoin ? undefined : tr('g421.on.rulesLater')} />}>
      {waiting ? (
        <div className="k-wait">
          {busy && <><span className="k-spinner" aria-hidden /><p>{tr(mode.kind === 'quick' ? 'g421.on.searching' : 'g421.on.reconnecting')}</p></>}
          {error && <><p className="error">{trServer(error)}</p><button className="btn" onClick={onExit}>{tr('g421.on.backHome')}</button></>}
        </div>
      ) : (
        <form className="k-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {isJoin && (
            <label className="k-field"><span className="k-label">{tr('g421.on.code')}</span>
              <input className="code-input k-input" value={code} maxLength={5} autoFocus placeholder="ABCDE"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
          )}
          <div className="hub-me">
            <details className="hub-av">
              <summary aria-label={tr('g421.on.changeAv')}><Avatar emoji={avatar} size={46} /><i className="hub-me-edit" aria-hidden>✎</i></summary>
              <div className="avatars hub-avatars">{AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={(e) => { setAvatar(a); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }} aria-label={`Avatar ${a}`}>{a}</button>)}</div>
            </details>
            <label className="hub-me-name"><small>{tr('g421.on.name')}</small>
              <input value={name} maxLength={20} placeholder={tr('g421.on.name')} autoFocus={!isJoin} onChange={(e) => setName(e.target.value)} /></label>
          </div>
          {!isJoin && <TableFields table={table} onChange={setTable} pa={pa} />}
          {error && <p className="error">{trServer(error)}</p>}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      )}
    </Shell>
  );
}

/** Réglages de la table : visibilité, nombre de places, mise. */
function TableFields({ table, onChange, pa, minPlayers = 2 }: { table: TableSettings; onChange: (t: TableSettings) => void; pa: ProfileApi; minPlayers?: number }) {
  return (
    <>
      <div className="k-field"><span className="k-label">{tr('g421.on.whoCan')}</span>
        <Choices value={table.visibility} onChange={(v) => onChange({ ...table, visibility: v })}
          options={[{ v: 'private', label: tr('g421.on.invite'), hint: tr('g421.on.inviteH'), icon: 'key' }, { v: 'public', label: tr('g421.on.everyone'), hint: tr('g421.on.everyoneH'), icon: 'people' }]} />
      </div>
      <Seg label={tr('g421.on.seats')} value={table.maxPlayers} onChange={(v) => onChange({ ...table, maxPlayers: v })}
        options={[2, 3, 4, 5, 6].filter((n) => n >= minPlayers).map((n) => ({ v: n, label: String(n) }))} />
      <StakePicker value={table.stake} onChange={(v) => onChange({ ...table, stake: v })} pa={pa} stakes={STAKES} />
      {table.stake > 0 && <p className="k-hint">{tr('g421.on.stakeNote', { n: table.stake })}</p>}
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
    try { await navigator.share({ title: tr('g421.on.shareT'), text: tr('g421.on.shareX', { code: room.code }), url: link }); trackEvent('invite'); }
    catch { /* partage annulé */ }
  };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); trackEvent('invite'); }
    catch { window.prompt(tr('g421.copyPrompt'), text); }
  };
  const allReady = room.members.filter((m) => !m.left).every((m) => m.ready);
  const count = room.members.length;
  const updateConfig = async (c: GameConfig) => { const a = await session.setConfig(c); if (!a.ok) setErr(trServer(a.error)); };
  const updateTable = async (t: TableSettings) => { setErr(null); const a = await session.setTable(t); if (!a.ok) setErr(trServer(a.error)); };
  const max = room.table.maxPlayers;
  const [botLevel, setBotLevel] = useState<'facile' | 'normal' | 'difficile'>('normal');
  const addBot = async () => { setErr(null); const a = await session.addBot(botLevel); if (!a.ok) setErr(trServer(a.error)); };
  const fill = async () => { setErr(null); const a = await session.fill(botLevel); if (!a.ok) setErr(trServer(a.error)); };
  const quick = room.quick;
  const humans = room.members.filter((m) => !m.bot).length;
  const start = async () => { setErr(null); const a = await session.start(); if (!a.ok) setErr(trServer(a.error)); };

  return (
    <Shell title={trServer(room.title)} onBack={onExit} wide>
      <div className="cols">
        <section>
          <LobbyTable room={room} meId={session.playerId} isHost={isHost} max={max}
            onInvite={() => (canShare ? void share() : void copy(link, 'lien'))}
            onKick={async (id) => { const a = await session.kick(id); if (!a.ok) setErr(trServer(a.error)); }}
            onRemoveBot={(id) => void session.removeBot(id)} />
          <div className="lobby-code">
            <span>{tr(room.table.visibility === 'public' ? 'g421.on.publicT' : 'g421.on.invite')} · {tr('g421.on.codeLow')} <b>{room.code}</b></span>
            <button className="btn small" onClick={() => copy(room.code, 'code')}><Icon name="copy" size={16} />{tr(copied === 'code' ? 'g421.on.copied' : 'g421.on.codeBtn')}</button>
            {canShare
              ? <button className="btn small" onClick={share}><Icon name="share" size={16} />{tr('g421.on.inviteBtn')}</button>
              : <button className="btn small" onClick={() => copy(link, 'lien')}><Icon name="share" size={16} />{tr(copied === 'lien' ? 'g421.on.copied' : 'g421.on.link')}</button>}
          </div>
          {quick && <QuickBanner quick={quick} isHost={isHost} canFill={count < max && room.table.stake === 0} onFill={fill} />}
          {pa.isAccount && count < max && <InviteFriends pa={pa} inRoom={room.members.map((m) => m.name)} />}
          {isHost && count < max && room.table.stake === 0 && (
            <div className="bot-add">
              <div className="seg" role="group" aria-label={tr('g421.on.botLevel')}>
                {(['facile', 'normal', 'difficile'] as const).map((d) => <button key={d} className={botLevel === d ? 'on' : ''} onClick={() => setBotLevel(d)}>{tr(d === 'facile' ? 'g421.solo.easy' : d === 'normal' ? 'g421.solo.normal' : 'g421.solo.hard')}</button>)}
              </div>
              <button className="btn small" onClick={addBot}><Icon name="plus" size={18} />{tr('g421.on.addBot')}</button>
              {!quick && <button className="btn small" onClick={fill} title={tr('g421.on.fillT')}>
                <Icon name="people" size={18} />{tr('g421.on.fillB')}</button>}
            </div>
          )}
          {isHost && humans === 1 && count < 2 && !quick && <p className="muted small">{tr('g421.on.nobody')}</p>}
          {!session.connected && <p className="error">{tr('g421.on.lost')}</p>}
          <div className="lobby-actions">
            {!isHost && me && !quick && (
              <button className={`btn big wide ${me.ready ? '' : 'primary'}`} onClick={() => session.setReady(!me.ready)}>
                {tr(me.ready ? 'g421.on.notReady' : 'g421.on.ready')}
              </button>
            )}
            {isHost && (
              <button className="btn primary big wide" disabled={count < 2 || !allReady} onClick={start}>
                {tr(count < 2 ? 'g421.on.waitPlayers' : !allReady ? 'g421.on.waitReady' : 'g421.on.start')}
              </button>
            )}
            {err && <p className="error">{err}</p>}
          </div>
        </section>
        <section>
          <h3>{tr('g421.on.table')}</h3>
          {isHost ? <TableFields table={room.table} onChange={updateTable} pa={pa} minPlayers={Math.max(2, count)} />
            : <ul className="muted">
              <li>{tr(room.table.visibility === 'public' ? 'g421.on.publicT' : 'g421.on.inviteT')}, {tr('g421.on.nSeats', { n: max })}</li>
              <li>{room.table.stake ? tr('g421.on.stakeLine', { n: room.table.stake }) : tr('g421.on.noStake')}</li>
            </ul>}
          <h3>{tr('g421.solo.rules')} {isHost ? '' : <small className="muted">{tr('g421.on.byHost')}</small>}</h3>
          {isHost ? <ConfigEditor config={room.config} onChange={updateConfig} />
            : <ul className="muted">{describeCfg(room.config).map((l) => <li key={l}>{l}</li>)}</ul>}
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
            ? <><b>{room.table.stake * room.members.length}</b><small>{tr('g421.on.coinsAtStake')}</small><small className="muted">{tr('g421.on.perPlayer', { n: room.table.stake })}</small></>
            : <><b>{room.members.length}/{max}</b><small>{tr('g421.on.players')}</small><small className="muted">{trn('g421.on.nReady', ready)}</small></>}
        </div>
        {Array.from({ length: seats }, (_, i) => {
          const m = ordered[i];
          const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
          const style = { left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` };
          if (!m) return (
            <button key={`v${i}`} className="seat empty" style={style} onClick={onInvite} aria-label={tr('g421.on.inviteSeat')}>
              <span className="seat-av"><Icon name="plus" size={20} /></span><span className="seat-name">{tr('g421.on.inviteBtn')}</span>
            </button>
          );
          const mine = m.id === meId;
          return (
            <div key={m.id} className={`seat${mine ? ' me' : ''}${m.ready || m.bot ? ' ready' : ''}`} style={style}>
              <span className="seat-av"><Avatar photo={m.photo} emoji={m.avatar} size={46} accessory={m.accessory} />
                {(m.ready || m.bot) && <i className="seat-ok"><Icon name="check" size={11} /></i>}
                {!m.connected && !m.bot && <i className="seat-off" />}
                {m.isHost && <i className="seat-host" title={tr('g421.host')}>★</i>}</span>
              <span className="seat-name">{mine ? `${m.name} ${tr('g421.youParen')}` : botName(m.name)}</span>
              <small>{m.filler ? tr('g421.on.filler') : m.bot ? tr('g421.on.botLvl', { l: m.bot === 'facile' || m.bot === 'difficile' || m.bot === 'normal' ? tr(`g421.solo.level.${m.bot}`) : m.bot }) : tr(!m.connected ? 'g421.offline' : m.ready ? 'g421.on.readyLow' : 'g421.on.notReadyLow')}</small>
              {isHost && !mine && (m.bot
                ? <button className="seat-kick" onClick={() => onRemoveBot(m.id)} aria-label={tr('g421.on.removeA', { name: m.name })}>{tr('g421.on.remove')}</button>
                : <button className="seat-kick" onClick={() => onKick(m.id)} aria-label={tr('g421.on.kickA', { name: m.name })}>{tr('g421.on.kick')}</button>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Partie rapide : compte à rebours avant les ordinateurs de complément, puis avant le départ. */
function QuickBanner({ quick, isHost, canFill, onFill }: { quick: NonNullable<NonNullable<OnlineSession['room']>['quick']>; isHost: boolean; canFill: boolean; onFill: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const secs = (at: number) => Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <div className="quick-banner" role="status">
      <span className="quick-clock" aria-hidden>{quick.startAt ? secs(quick.startAt) : quick.fillAt ? secs(quick.fillAt) : '…'}</span>
      <div>
        {quick.startAt
          ? <><b>{tr('g421.on.startsIn', { s: secs(quick.startAt) })}</b><small>{tr('g421.on.quickNote')}</small></>
          : quick.fillAt
            ? <><b>{tr('g421.on.searchingP')}</b><small>{tr('g421.on.fillSoon', { s: secs(quick.fillAt) })}</small></>
            : <><b>{tr('g421.menu.quick')}</b><small>{tr('g421.on.waitP')}</small></>}
      </div>
      {isHost && canFill && !quick.startAt && <button className="btn small" onClick={onFill}>{tr('g421.on.fillB')}</button>}
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
      {n.filter((x) => !hidden.has(x.id)).map((x) => <div key={x.id} className={`notice ${x.kind}`}>{trServer(x.text)}</div>)}
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
      <h3>{tr('g421.on.inviteFriends')}</h3>
      <ul>
        {list.slice(0, 8).map((f) => (
          <li key={f.username}>
            <i className={`fr-dot ${f.online ? 'on' : ''}`} aria-hidden /><b>{f.username}</b>
            {sent[f.username] ? <small className="muted">{sent[f.username]}</small> : (
              <button className="btn small" onClick={async () => {
                try { await api('/invites', { token: pa.token!, body: { username: f.username } }); setSent((x) => ({ ...x, [f.username]: tr('g421.on.sent') })); }
                catch (e) { setSent((x) => ({ ...x, [f.username]: trServer((e as Error).message) })); }
              }}>{tr('g421.on.inviteBtn')}</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
