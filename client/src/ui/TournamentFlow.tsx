import { useEffect, useMemo, useState } from 'react';
import { askConfirm } from './confirm';
import { useNavGuard } from './navGuard';
import type { GameState } from '../../../shared/engine';
import type { Appearance } from '../../../shared/progress/catalog';
import type { RewardContext } from '../../../shared/progress/profile';
import {
  DEFAULT_TOURNAMENT, MIN_TOURNAMENT_PLAYERS, STAKES, TABLE_SIZES, TOURNAMENT_SIZES, currentTableOf, prizes, roundsFor,
  type PublicTournament, type TournamentSettings,
} from '../../../shared/tournament';
import type { EndReward, ProfileApi } from '../account/useProfile';
import { OnlineController, OnlineSession } from '../game/online';
import { publicUrl } from '../platform';
import { loadSession, type Settings } from '../settings';
import { Avatar } from './Avatar';
import { RepBadge } from './RepBadge';
import { ConfigEditor } from './ConfigEditor';
import { GameScreen, type EarlyOptions } from './GameScreen';
import { Chat } from './Chat';
import { Icon } from './Icon';
import { Seg, StakePicker } from './OnlineHub';
import { BigAction, Choices, Section, Shell } from './kit';
import { ScheduledLobby, ScheduledResults } from './Scheduled';
import { schedRounds } from '../../../shared/scheduled';
import { usePresenceLayer } from '../presence';
import { tr, trServer, fmtNum } from '../i18n/lang';
import { describeCfg, ord, roundLabel, trn } from '../i18n/g421';

export type TournamentMode = { kind: 'create' } | { kind: 'join'; code: string; pay?: boolean } | { kind: 'resume' };
/** Nombre de tours prévus (tournoi programmé : format propre, finale de 4 à 6 joueurs). */
const totalRounds = (t: PublicTournament) => Math.max(t.rounds.length,
  t.sched ? schedRounds(t.sched.starters ?? t.players.length).rounds : roundsFor(t.players.length, t.settings.tableSize));
const PLACE = (i: number) => ord(i + 1);

function useSession(session: OnlineSession | null) {
  const [, force] = useState(0);
  useEffect(() => {
    const off = session?.subscribe(() => force((n) => n + 1));
    return () => { off?.(); };
  }, [session]);
}
/** Secondes restantes avant un horodatage (rafraîchi chaque seconde). */
function useCountdown(at: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}

/** Tournoi : création ou inscription → salle d'attente → tables successives → classement final. */
export function TournamentFlow({ mode, settings, onSettings, onExit, onCancel, appearance, onGameEnd, pa }: {
  mode: TournamentMode; settings: Settings; onSettings: (s: Settings) => void; onExit: () => void; onCancel?: () => void;
  appearance: Appearance; onGameEnd: (state: GameState, meId: string, ctx: RewardContext) => Promise<EndReward | null>; pa: ProfileApi;
}) {
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<TournamentSettings>({ ...DEFAULT_TOURNAMENT, title: tr('g421.t.defaultTitle', { name: settings.name || tr('g421.t.myBar') }) });
  const [watchBracket, setWatchBracket] = useState(false);
  useSession(session);

  const name = settings.name.trim() || pa.session?.username || tr('g421.on.player');
  const connect = async (kind: 'create' | 'join' | 'resume') => {
    setBusy(true);
    setError(null);
    const s = new OnlineSession(pa.token, pa.onServerReward, pa.onServerProfile);
    s.dice = pa.profile.equipped.dice;
    try {
      if (kind === 'create') await s.tCreate(name, settings.avatar, form);
      else if (kind === 'join') await s.tJoin((mode as { code: string }).code, name, settings.avatar, undefined, (mode as { pay?: boolean }).pay);
      else {
        const saved = loadSession();
        if (!saved?.tournament) throw new Error('Aucun tournoi à reprendre');
        await s.tJoin(saved.code, name, settings.avatar, saved.token);
      }
      setSession(s);
    } catch (e) {
      s.socket.disconnect();
      setError((e as Error).message);
    }
    setBusy(false);
  };
  useEffect(() => { if (mode.kind !== 'create') void connect(mode.kind); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const controller = useMemo(() => (session ? new OnlineController(session) : null), [session]);
  const t = session?.tournament ?? null;
  const room = session?.room ?? null;
  // Partir par la barre du bas : comme la flèche retour du tableau (désinscription d'un tournoi pas encore
  // lancé, sinon on se détache : le tournoi reste reprenable depuis l'accueil).
  useNavGuard(session ? { leave: () => { if (session.closed) return; if (t?.status === 'inscriptions' && !t.sched) session.tLeave(); else session.detach(); } } : null);
  // Nouvelle table (tour suivant) : on y retourne automatiquement.
  useEffect(() => { setWatchBracket(false); }, [room?.code]);
  // Présence (administration) : salon du tournoi ou table en cours.
  usePresenceLayer(t ? { view: room?.status === 'playing' && session?.game ? 'partie' : 'salon', code: room?.status === 'playing' && room.code ? room.code : t.code } : null);

  if (session && t && controller) {
    const myTable = currentTableOf(t, session.playerId);
    const live = t.status === 'en-cours' && myTable && !myTable.ranking && room?.code === myTable.code && room.status === 'playing';
    const atTable = room?.tournament === t.code && room.code === myTable?.code && session.game;
    if ((live || atTable) && !watchBracket) {
      const roundIdx = t.rounds.length - 1;
      const total = totalRounds(t);
      const note = (st: GameState) => {
        const rank = st.ranking.indexOf(session.playerId);
        const tb = currentTableOf(t, session.playerId);
        if (roundIdx === total - 1 || t.rounds[roundIdx].tables.length === 1) return rank === 0 ? tr('g421.t.youWin') : tr('g421.t.finalDone', { p: PLACE(rank) });
        return rank >= 0 && tb && rank < tb.qualified ? tr('g421.t.qualified', { r: roundLabel(roundIdx + 1, total).toLowerCase() }) : tr('g421.t.eliminated');
      };
      // Sorti avant la fin de la table : qualifié (on attend le tour suivant), éliminé ou place de finale acquise (on peut partir).
      const early = (_st: GameState, place: number): EarlyOptions => {
        const tb = currentTableOf(t, session.playerId);
        const final = t.rounds[roundIdx].tables.length === 1;
        const board = { label: tr('g421.t.seeBoard'), run: () => setWatchBracket(true) };
        const quit = { label: tr('g421.cashOut'), run: () => { session.tLeave(); onExit(); } };
        if (final) return {
          title: place === 1 ? tr('g421.t.youWin') : tr('g421.t.youPlace', { p: PLACE(place - 1) }),
          note: tr(pa.isAccount ? 'g421.t.placeAcq' : 'g421.t.placeAcq2'), quit, alt: board,
        };
        if (tb && place - 1 < tb.qualified) return {
          title: tr('g421.t.qualified', { r: roundLabel(roundIdx + 1, total).toLowerCase() }),
          note: tr('g421.t.stayAround'), quit: null, alt: board,
        };
        return {
          title: tr('g421.t.elimPlace', { p: PLACE(place - 1) }),
          note: tr(pa.isAccount ? 'g421.t.elimNote' : 'g421.t.elimNote2'), quit, alt: board,
        };
      };
      return (
        <>
        <GameScreen key={room!.code} controller={controller} settings={settings} onSettings={onSettings} onExit={() => setWatchBracket(true)}
          appearance={appearance} pa={pa} onGameEnd={(st, ctx) => onGameEnd(st, controller.meId, ctx)}
          tableExit={{ label: tr('g421.t.seeBoard'), note }} early={early}
          guestInvite={(st) => {
            // Seulement quand le tournoi est fini pour le joueur (finale jouée ou éliminé), pas entre deux tours.
            const tb = currentTableOf(t, session.playerId);
            const rank = st.ranking.indexOf(session.playerId);
            return roundIdx === total - 1 || t.rounds[roundIdx].tables.length === 1 || !(rank >= 0 && tb && rank < tb.qualified);
          }} />
          {/* Tchat de la table, comme à une table en ligne ordinaire. */}
          <Chat session={session} pa={pa} />
        </>
      );
    }
    return <TournamentView session={session} t={t} pa={pa} onExit={onExit}
      onBackToTable={live || atTable ? () => setWatchBracket(false) : null} />;
  }

  if (mode.kind !== 'create' || session) {
    return (
      <Shell title={tr('g421.menu.tournoi')} onBack={() => { session?.detach(); onExit(); }}>
        <div className="form">
          {(busy || session) && !error && <p>{tr('g421.t.connecting')}</p>}
          {error && <><p className="error">{trServer(error)}</p><button className="btn" onClick={onCancel ?? onExit}>{tr('common.back')}</button></>}
        </div>
      </Shell>
    );
  }

  const set = (patch: Partial<TournamentSettings>) => setForm((f) => ({ ...f, ...patch }));
  const rounds = roundsFor(form.maxPlayers, form.tableSize);
  return (
    <Shell title={tr('g421.t.create')} onBack={onCancel ?? onExit} wide icon="trophy" sub={tr('g421.t.formSub', { n: form.maxPlayers, t: form.tableSize })}
      foot={<>{error && <p className="error">{trServer(error)}</p>}<BigAction icon="trophy" tone="gold" disabled={busy || !form.title.trim()} onClick={() => void connect('create')}
        label={tr(busy ? 'g421.t.creating' : 'g421.t.createB')} sub={trn('g421.t.roundsSub', rounds)} /></>}>
      <form className="cols" onSubmit={(e) => { e.preventDefault(); void connect('create'); }}>
        <section className="k-form">
          <label className="k-field"><span className="k-label">{tr('g421.t.nameL')}</span>
            <input className="k-input" value={form.title} maxLength={32} onChange={(e) => set({ title: e.target.value })} /></label>
          <div className="k-field"><span className="k-label">{tr('g421.t.whoReg')}</span>
            <Choices value={form.visibility} onChange={(v) => set({ visibility: v })}
              options={[{ v: 'private', label: tr('g421.on.invite'), hint: tr('g421.on.inviteH'), icon: 'key' }, { v: 'public', label: tr('g421.on.everyone'), hint: tr('g421.on.everyoneH'), icon: 'people' }]} />
          </div>
          <Seg label={tr('g421.t.maxPlayers')} hint={tr('g421.t.minHint', { n: MIN_TOURNAMENT_PLAYERS })}
            value={form.maxPlayers} onChange={(v) => set({ maxPlayers: v })} options={TOURNAMENT_SIZES.map((n) => ({ v: n, label: String(n) }))} />
          <Seg label={tr('g421.t.perTable')} value={form.tableSize} onChange={(v) => set({ tableSize: v })}
            options={TABLE_SIZES.map((n) => ({ v: n, label: String(n) }))} />
          <p className="k-hint">{trn('g421.t.hint', rounds)}</p>
          <StakePicker value={form.stake} onChange={(v) => set({ stake: v })} pa={pa} stakes={STAKES} />
          {form.stake > 0 && (
            <Seg label={tr('g421.t.split')} value={form.payout} onChange={(v) => set({ payout: v })}
              hint={tr(form.payout === 'podium' ? 'g421.t.splitPod' : 'g421.t.splitWin')}
              options={[{ v: 'podium', label: tr('g421.t.podium') }, { v: 'winner', label: tr('g421.t.allWinner') }]} />
          )}
        </section>
        <Section title={tr('g421.t.gameRules')}>
          <ConfigEditor config={form.config} onChange={(c) => set({ config: c })} />
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </Section>
      </form>
    </Shell>
  );
}

function TournamentView({ session, t, pa, onExit, onBackToTable }: {
  session: OnlineSession; t: PublicTournament; pa: ProfileApi; onExit: () => void; onBackToTable: (() => void) | null;
}) {
  const me = t.players.find((p) => p.id === session.playerId);
  const isHost = t.hostId === session.playerId;
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const countdown = useCountdown(t.nextRoundAt);
  const total = totalRounds(t);
  const sched = t.sched;
  const nameOf = (id: string) => t.players.find((p) => p.id === id)?.name ?? '?';
  const link = `${publicUrl()}/?tournoi=${t.code}`;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); }
    catch { window.prompt(tr('g421.copyPrompt'), text); }
  };
  const share = async () => { try { await navigator.share({ title: trServer(t.settings.title), text: tr('g421.t.shareX', { title: trServer(t.settings.title), code: t.code }), url: link }); } catch { /* annulé */ } };
  const start = async () => { setErr(null); const a = await session.tStart(); if (!a.ok) setErr(trServer(a.error)); };
  const gains = t.status === 'inscriptions' ? prizes(t.settings.stake * t.players.length, t.players.length, t.settings.payout) : t.prizes;

  // Ce que le joueur doit savoir tout de suite.
  let headline: string;
  if (session.removed) headline = tr('g421.t.removed', { r: trServer(session.removed) });
  else if (sched?.cancelled) headline = tr('g421.t.hCancelled');
  else if (sched && t.status === 'inscriptions') headline = tr('g421.t.hSched');
  else if (t.status === 'inscriptions') headline = countdown != null ? tr('g421.t.hFull', { s: countdown }) : trn('g421.t.hOpen', t.players.length, { max: t.settings.maxPlayers });
  else if (t.status === 'termine') {
    const place = t.standings!.indexOf(session.playerId);
    headline = place === 0 ? tr('g421.t.youWin') : tr('g421.t.hWinner', { name: nameOf(t.standings![0]), p: PLACE(place) });
  } else if (me?.out != null) headline = tr('g421.t.hElim', { r: roundLabel(me.out, total).toLowerCase() });
  else if (countdown != null) headline = tr('g421.t.hQualIn', { r: roundLabel(t.rounds.length, total), s: countdown });
  else if (onBackToTable) headline = tr('g421.t.hPlaying', { r: roundLabel(t.rounds.length - 1, total).toLowerCase() });
  else headline = tr('g421.t.hQualWait');

  const leaveLabel = sched && t.status === 'inscriptions' ? null : t.status === 'inscriptions' ? tr('g421.t.unreg') : t.status === 'en-cours' && me?.out == null ? tr('g421.t.abandon') : null;
  const leave = async () => {
    if (t.status === 'en-cours' && !(await askConfirm(tr('g421.t.abandonQ'), tr('g421.t.abandonB')))) return;
    session.tLeave();
    onExit();
  };

  return (
    <Shell title={trServer(t.settings.title)} onBack={() => { if (t.status === 'inscriptions' && !sched) session.tLeave(); else session.detach(); onExit(); }} wide>
      <div className="t-head">
        <p className="t-headline">{headline}</p>
        {onBackToTable && <button className="btn primary" onClick={onBackToTable}><Icon name="dice" /> {tr('g421.t.backTable')}</button>}
        {t.status === 'inscriptions' && isHost && !sched && (
          <button className="btn primary" disabled={t.players.length < MIN_TOURNAMENT_PLAYERS} onClick={start}>
            {t.players.length < MIN_TOURNAMENT_PLAYERS ? tr('g421.t.needN', { n: MIN_TOURNAMENT_PLAYERS }) : tr('g421.t.startN', { n: t.players.length })}
          </button>
        )}
        {t.status === 'inscriptions' && isHost && !sched && t.settings.stake === 0 && t.players.length < t.settings.maxPlayers && (
          <button className="btn" onClick={async () => { setErr(null); const a = await session.tFillBots('normal'); if (!a.ok) setErr(trServer(a.error)); }}>
            <Icon name="plus" /> {tr('g421.t.fill')}
          </button>
        )}
        {t.status === 'inscriptions' && !isHost && !sched && <p className="muted small">{tr('g421.t.hostStart')}</p>}
        {err && <p className="error">{err}</p>}
      </div>

      {sched && t.status === 'inscriptions' ? (
        <ScheduledLobby t={t} meId={session.playerId} />
      ) : sched?.cancelled ? (
        <ScheduledResults t={t} meId={session.playerId} />
      ) : t.status === 'inscriptions' ? (
        <div className="cols">
          <section>
            <div className="code-box">
              <small>{tr(t.settings.visibility === 'public' ? 'g421.t.publicCode' : 'g421.t.codeL')}</small>
              <div className="code">{t.code}</div>
              <div className="code-actions">
                <button className="btn small" onClick={() => copy(t.code, 'code')}><Icon name="copy" size={18} />{tr(copied === 'code' ? 'g421.on.copied' : 'g421.t.copyCode')}</button>
                {typeof navigator.share === 'function'
                  ? <button className="btn small" onClick={share}><Icon name="share" size={18} />{tr('g421.on.inviteFriends')}</button>
                  : <button className="btn small" onClick={() => copy(link, 'lien')}><Icon name="share" size={18} />{tr(copied === 'lien' ? 'g421.on.copied' : 'g421.t.copyLink')}</button>}
              </div>
            </div>
            <h3>{tr('g421.t.registered', { n: t.players.length, max: t.settings.maxPlayers })}</h3>
            <ol className="members">
              {t.players.map((p, i) => (
                <li key={p.id}>
                  <span className="ord">{i + 1}</span>
                  <Avatar photo={p.photo} emoji={p.avatar} size={36}><i className={`dot ${p.connected ? "on" : "off"}`} /><RepBadge rep={p.rep} className="rep-on-av" /></Avatar>
                  <b>{p.name}</b>
                  {p.id === t.hostId && <span className="tag">{tr('g421.t.organiser')}</span>}
                  {p.bot && <span className="tag bot">{tr('g421.t.computer')}</span>}
                  {p.id === session.playerId && <span className="tag">{tr('g421.pc.you')}</span>}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <TournamentRules t={t} gains={gains} pa={pa} />
          </section>
        </div>
      ) : (
        <>
          {t.status === 'termine' && sched && <ScheduledResults t={t} meId={session.playerId} />}
          {t.status === 'termine' && t.standings && !sched && (
            <section>
              <h3>{tr('g421.t.finalRank')}</h3>
              <ol className="ranking t-standings">
                {t.standings.map((id, i) => (
                  <li key={id} className={id === session.playerId ? 'me' : ''}>
                    <span className="rk">{PLACE(i)}</span>
                    <span className="nm">{nameOf(id)}</span>
                    {t.prizes[i] ? <span className="sc coins-text">{trn('g421.plusCoins', t.prizes[i])}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <h3>{tr('g421.t.bracket')}</h3>
          <div className="bracket">
            {Array.from({ length: total }, (_, ri) => {
              const rd = t.rounds[ri];
              return (
                <div className="b-round" key={ri}>
                  <h4>{roundLabel(ri, total)}</h4>
                  {rd ? rd.tables.map((tb, ti) => {
                    const order = tb.ranking ?? tb.ids;
                    const mine = tb.ids.includes(session.playerId);
                    return (
                      <div key={tb.code} className={`b-table${!tb.ranking ? ' live' : ''}${mine ? ' mine' : ''}`}>
                        <header><span>{tr('g421.menu.tableN', { code: ti + 1 })}</span><span>{tr(tb.ranking ? 'g421.t.tableDone' : 'g421.sch.running')}</span></header>
                        <ol>
                          {order.map((id, k) => (
                            <li key={id} className={tb.ranking ? (k < tb.qualified ? 'q' : 'x') : ''}>
                              <span>{nameOf(id)}{id === session.playerId ? ` ${tr('g421.youParen')}` : ''}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  }) : <div className="b-table"><ol><li className="tbd">{tr('g421.t.tbd')}</li></ol></div>}
                </div>
              );
            })}
          </div>
          {!sched && <TournamentRules t={t} gains={gains} pa={pa} compact />}
        </>
      )}

      <div className="row left t-actions">
        {leaveLabel && <button className="btn danger" onClick={leave}>{leaveLabel}</button>}
        {(t.status === 'termine' || sched?.cancelled) && <button className="btn" onClick={() => { session.detach(); onExit(); }}>{tr('g421.on.backHome')}</button>}
      </div>
    </Shell>
  );
}

function TournamentRules({ t, gains, pa, compact }: { t: PublicTournament; gains: number[]; pa: ProfileApi; compact?: boolean }) {
  const s = t.settings;
  const pot = t.status === 'inscriptions' ? s.stake * t.players.length : t.pot;
  return (
    <div className={compact ? 't-rules compact' : 't-rules'}>
      {s.stake > 0 && (
        <div className="pot">
          <span>{tr('g421.t.pot')}{t.status === 'inscriptions' ? ` ${tr('g421.t.ifNow')}` : ''}<br />
            <small className="muted">{tr('g421.t.entry', { n: s.stake })}{pa.isAccount ? tr('g421.t.youHave', { n: fmtNum(pa.profile.coins) }) : ''}</small></span>
          <b>{tr('g421.sch.feeCoins', { n: pot })}</b>
        </div>
      )}
      {s.stake > 0 && gains.length > 0 && (
        <p className="muted">{tr('g421.t.prizes', { list: gains.map((g, i) => `${PLACE(i)} ${tr('g421.sch.feeCoins', { n: g })}`).join(', ') })}</p>
      )}
      <h3>{tr('g421.t.format')}</h3>
      <ul className="muted">
        <li>{tr('g421.t.tablesOf', { n: s.tableSize })}</li>
        <li>{s.stake ? tr('g421.t.entryFee', { n: s.stake }) : tr('g421.t.forGlory')}</li>
      </ul>
      <h3>{tr('g421.t.gameRules')}</h3>
      <ul className="muted">{describeCfg(s.config).map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}
