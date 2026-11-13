/**
 * Poker menteur : le mode complet (4e jeu du site). Menu du mode, contre l'ordinateur (1 à 5
 * adversaires, 3 ou 5 vies, variante sans suites), en ligne de 2 à 6 (table privée par code ou lien
 * `/?poker=CODE`, partie rapide, ordinateurs pour compléter), règles illustrées, succès, statistiques.
 *
 * Contre l'ordinateur, la partie se joue sur l'appareil (comme le Courtisan) : le résultat est annoncé
 * au serveur avec les garde-fous du solo (jeton de départ, durée minimale, plafond quotidien).
 * En ligne, le serveur fait foi et n'envoie les dés qu'au détenteur du gobelet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { act, currentPlayer, newGame, placeOf, ranking, viewFor, PM_LEVELS, type PmAction, type PmEvent, type PmLevel, type PmOptions, type PmState } from '../../../shared/pokermenteur/engine';
import { decide } from '../../../shared/pokermenteur/ai';
import { PM_PERSONAS, type PmPersona } from '../../../shared/pokermenteur/personas';
import { PM_TABLE_MAX, type PmPublicMember } from '../../../shared/pokermenteur/protocol';
import { ACHIEVEMENTS } from '../../../shared/progress/achievements';
import type { Profile, Reward } from '../../../shared/progress/profile';
import { PmBoard, PmDice, PmHandsHelp, usePmAnimator, type Seat } from './Board';
import { PmSession, loadPmSession, savePmSession, type PmUp } from './online';
import type { ProfileApi } from '../account/useProfile';
import { api } from '../account/api';
import type { Settings } from '../settings';
import { BagIcon } from '../ui/BagIcon';
import { BigAction, Choices, Section, Sheet, Shell } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { RepBadge, RepTable } from '../ui/RepBadge';
import { ModeBar } from '../ui/ModeBar';
import { Chat } from '../ui/Chat';
import { askConfirm } from '../ui/confirm';
import { useNavGuard } from '../ui/navGuard';
import { useGuestInviteAtEnd } from '../ui/guestInvite';
import { usePresenceLayer } from '../presence';
import { useMyTurnAlert } from '../turnAlert';
import { sound } from '../audio/sound';
import { publicUrl } from '../platform';
import { trackEvent } from '../visit';
import { getLang, tr, trServer, useLang } from '../i18n/lang';
import type { MessageKey } from '../../../shared/i18n';
import { LangSwitch } from '../i18n/LangSwitch';

const NO_SERVER = typeof __STANDALONE__ !== 'undefined' && __STANDALONE__;
const COLORS = ['#f1cc7d', '#e2694f', '#4f9fd1', '#a477d6', '#57b07a', '#e0609a'];
const SETUP_KEY = '421.poker';
const K = (s: string) => s as MessageKey;
const modeName = () => tr('pm.name');
const levelLabel = (l: PmLevel) => tr(K(`pm.lv.${l}`));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PmSetup { opponents: number; level: PmLevel; lives: number; noStraights: boolean }
function loadSetup(): PmSetup {
  try {
    const r = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null');
    if (r) return { opponents: Math.min(5, Math.max(1, Number(r.opponents) || 2)), level: PM_LEVELS.includes(r.level) ? r.level : 'habitue', lives: r.lives === 5 ? 5 : 3, noStraights: !!r.noStraights };
  } catch { /* */ }
  return { opponents: 2, level: 'habitue', lives: 3, noStraights: false };
}
const saveSetup = (s: PmSetup) => { try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* */ } };
const shuffled = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

// ---------------------------------------------------------------------------------------------
// Règles illustrées

export function PmRules() {
  useLang();
  return (
    <div className="pk-rules">
      <p>{tr('pm.r.intro')}</p>
      <ol className="pk-rules-steps">
        <li><b>{tr('pm.r.s1')}</b><span>{tr('pm.r.s1d')}</span></li>
        <li><b>{tr('pm.r.s2')}</b><span>{tr('pm.r.s2d')}</span></li>
        <li><b>{tr('pm.r.s3')}</b><span>{tr('pm.r.s3d')}</span></li>
        <li><b>{tr('pm.r.s4')}</b><span>{tr('pm.r.s4d')}</span></li>
      </ol>
      <h3>{tr('pm.r.hands')}</h3>
      <p className="muted small">{tr('pm.r.handsSub')}</p>
      <PmHandsHelp />
      <h3>{tr('pm.r.ties')}</h3>
      <p className="small">{tr('pm.r.tiesD')}</p>
      <h3>{tr('pm.r.more')}</h3>
      <ul className="small pk-rules-more">
        <li>{tr('pm.r.m1')}</li>
        <li>{tr('pm.r.m2')}</li>
        <li>{tr('pm.r.m3')}</li>
        <li>{tr('pm.r.m4')}</li>
        <li>{tr('pm.r.m5')}</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Fin de partie

function EndDialog({ s, seats, reward, buttons, waiting, bags = 0, quests = [], achievements = [], onBags, isAccount }: {
  s: PmState; seats: Seat[]; reward: Reward | null | undefined; buttons: React.ReactNode; waiting?: string;
  bags?: number; quests?: string[]; achievements?: string[]; onBags?: () => void; isAccount?: boolean;
}) {
  useEffect(() => { if (bags > 0) sound.chips(3); }, [bags]);
  const me = seats.find((x) => x.isMe);
  const w = seats.find((x) => x.id === s.winner);
  return (
    <div className="dm-end-back">
      <div className={`dm-end pk-end${s.players.length > 4 ? ' many' : ''}`} role="dialog" aria-label={tr('pm.end')}>
        <h2>{me && s.winner === me.id ? tr('pm.won') : tr('pm.wins', { name: w?.name ?? '?' })}</h2>
        <ol className="dm-rank">
          {ranking(s).map((p) => {
            const seat = seats.find((x) => x.id === p.id);
            if (!seat) return null;
            return (
              <li key={p.id} className={seat.isMe ? 'me' : ''} style={{ ['--pc' as string]: seat.color }}>
                <span className="dm-place">{placeOf(s, p.id)}</span>
                <Avatar photo={seat.photo ?? null} emoji={seat.avatar} size={28} />
                <b>{seat.isMe ? tr('pm.you') : seat.name}</b>
                <em>{p.out ? tr('pm.out') : tr('pm.livesLeft', { n: p.lives })}</em>
              </li>
            );
          })}
        </ol>
        <div className="dm-reward">
          {reward === undefined ? <span className="muted">…</span>
            : reward && (reward.coins || reward.xp) ? <>
              {reward.coins > 0 && <span className="dm-coins"><i aria-hidden />{tr('pm.coins', { n: reward.coins })}</span>}
              {reward.xp > 0 && <span className="dm-xp">+{reward.xp} XP</span>}
            </> : <span className="muted small">{tr('pm.noReward')}</span>}
        </div>
        {bags > 0 && (
          <div className="dm-bag-won" role="status">
            <span className="dm-bag-ico" aria-hidden><BagIcon size={44} /></span>
            <span className="dm-bag-text"><b>{bags > 1 ? tr('pm.bagsFound', { n: bags }) : tr('pm.bagFound')}</b><small>{tr(isAccount ? 'pm.bag.acc' : 'pm.bag.guest')}</small></span>
            {onBags && <button className="btn small primary" onClick={onBags}>{tr(isAccount ? 'pm.open' : 'pm.see')}</button>}
          </div>
        )}
        {achievements.length > 0 && <ul className="dm-quests dm2-ach-won">{achievements.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return a && <li key={id}><span aria-hidden>{a.icon}</span> {tr('pm.ach.unlocked')} : <b>{achName(a.id, a.name, a.game)}</b> <em>+{a.coins}</em></li>; })}</ul>}
        {quests.length > 0 && <ul className="dm-quests">{quests.map((q) => <li key={q}><Icon name="check" size={14} /> {tr('pm.quest', { q: trServer(q) })}</li>)}</ul>}
        {waiting && <p className="muted small">{waiting}</p>}
        <div className="dm-end-btns">{buttons}</div>
      </div>
    </div>
  );
}
const achName = (id: string, fallback: string, game?: string) => (game === 'poker' ? tr(K(`pm.a.${id}`)) : fallback);

// ---------------------------------------------------------------------------------------------
// Contre l'ordinateur (sur l'appareil)

function personaLine(p: PmPersona | undefined, kind: 'menteur' | 'gagne' | 'perd') { return p ? tr(K(`pm.p.${p.id}.${kind}`)) : ''; }

export function PmSoloGame({ setup, opponents, pa, settings, me, onExit, onReplay, onBags }: {
  setup: PmSetup; opponents: PmPersona[]; pa: ProfileApi; settings: Settings;
  me: { name: string; avatar: string; photo: string | null }; onExit: () => void; onReplay: () => void; onBags?: () => void;
}) {
  const seats = useMemo<Seat[]>(() => [
    { id: 'moi', name: me.name || tr('pm.you'), avatar: me.avatar, color: COLORS[0], photo: me.photo, isMe: true },
    ...opponents.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, isMe: false, bot: true, persona: p })),
  ], []); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => {
    // Ordre tiré au sort (qui commence), mais je reste à ma place à table.
    const start = Math.floor(Math.random() * seats.length);
    const order = [...seats.slice(start), ...seats.slice(0, start)];
    return newGame(order.map((x) => ({ id: x.id, name: x.name, ...(x.isMe ? {} : { bot: setup.level }) })), { lives: setup.lives, noStraights: setup.noStraights }, crypto.getRandomValues(new Uint32Array(1))[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const truth = useRef(initial);
  const [rules, setRules] = useState(false);
  const alive = useRef(true);
  const persona = (id: string) => seats.find((x) => x.id === id)?.persona;
  // Répliques des habitués (sobres : un mot quand ils crient, gagnent ou perdent une vie).
  const [say, setSay] = useState<{ id: string; text: string; k: number } | null>(null);
  const onEvent = useCallback((e: PmEvent) => {
    let line: { id: string; text: string } | null = null;
    if (e.kind === 'menteur' && persona(e.playerId)) line = { id: e.playerId, text: personaLine(persona(e.playerId), 'menteur') };
    if (e.kind === 'revelation') {
      const win = e.reveal.loser === e.reveal.caller ? e.reveal.by : e.reveal.caller;
      if (persona(e.reveal.loser) && Math.random() < 0.6) line = { id: e.reveal.loser, text: personaLine(persona(e.reveal.loser), 'perd') };
      else if (persona(win)) line = { id: win, text: personaLine(persona(win), 'gagne') };
    }
    if (line?.text) setSay({ ...line, k: Date.now() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!say) return; const t = setTimeout(() => setSay(null), 2600); return () => clearTimeout(t); }, [say]);
  // Les répliques suivent l'animation (pas l'état officiel, en avance).
  const anim = usePmAnimator(viewFor(initial, 'moi'), 'moi', onEvent);

  const firstPush = useRef(false);
  useEffect(() => {
    alive.current = true;
    pa.onPokerStart();
    if (!firstPush.current) { firstPush.current = true; anim.push({ state: viewFor(initial, 'moi'), events: initial.events, by: initial.players[initial.current].id }); }
    return () => { alive.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback((a: PmAction): string | null => {
    const prev = truth.current;
    const r = act(prev, a);
    if ('error' in r) return trServer(r.error);
    truth.current = r.state;
    anim.push({ state: viewFor(r.state, 'moi'), events: r.state.events, by: prev.players[prev.current].id });
    return null;
  }, [anim.push]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tour des ordinateurs.
  const s = anim.shown;
  useEffect(() => {
    const t0 = truth.current;
    if (anim.busy || t0.phase === 'fini') return;
    const pid = currentPlayer(t0).id;
    if (pid === 'moi') return;
    const p = persona(pid);
    const delay = (t0.phase === 'decision' ? 700 : t0.phase === 'relance' ? 450 : 600) + (p?.tempo ?? 900) * (0.4 + Math.random() * 0.5);
    const t = setTimeout(() => { if (alive.current && truth.current === t0) run(decide(t0, setup.level)); }, delay);
    return () => clearTimeout(t);
  }, [s, anim.busy, run, setup.level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin : récompense (une fois).
  const [end, setEnd] = useState<{ reward: Reward | null; bags: number; quests: string[]; achievements: string[] } | null>(null);
  const ended = useRef(false);
  useEffect(() => {
    if (s.phase !== 'fini' || anim.busy || ended.current) return;
    ended.current = true;
    void (async () => {
      const place = placeOf(truth.current, 'moi');
      const [r] = await Promise.all([pa.onPokerEnd({ won: truth.current.winner === 'moi', place, opponents: opponents.length, level: setup.level }), wait(900)]);
      if (alive.current) setEnd({ reward: r?.reward ?? null, bags: r?.bags ?? 0, quests: r?.quests ?? [], achievements: r?.achievements ?? [] });
    })();
  }, [s, anim.busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const okToLeave = async () => truth.current.phase === 'fini' || askConfirm(tr('pm.quitAsk'), tr('pm.quit'));
  const leave = async () => { if (await okToLeave()) onExit(); };
  useNavGuard({ game: true, ask: okToLeave });
  useGuestInviteAtEnd('poker', !!end);
  usePresenceLayer({ view: 'partie-solo', state: 'solo', depth: 1 });

  return (
    <>
      <PmBoard anim={anim} seats={seats} meId="moi" canAct onAct={run} onLeave={() => void leave()} settings={settings} onRules={() => setRules(true)}
        overlay={say && <div className="pk-speech" key={say.k} style={{ ['--pc' as string]: seats.find((x) => x.id === say.id)?.color }}><b>{seats.find((x) => x.id === say.id)?.name}</b> {say.text}</div>}
        end={end && <EndDialog s={s} seats={seats} reward={end.reward} bags={end.bags} quests={end.quests} achievements={end.achievements} isAccount={pa.isAccount} onBags={onBags} buttons={<>
          <button className="btn secondary" onClick={onExit}>{tr('pm.back')}</button>
          <button className="btn primary" onClick={onReplay}><Icon name="resume" size={18} /> {tr('pm.replay')}</button>
        </>} />} />
      {rules && <Sheet title={tr('pm.rules')} onClose={() => setRules(false)}><PmRules /></Sheet>}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// En ligne

function usePm(session: PmSession) { return useSyncExternalStore((cb) => session.subscribe(cb), () => session.tick); }

function seatsOf(session: PmSession, state: PmState | null): Seat[] {
  const t = session.table;
  const ids = state?.players.map((p) => p.id) ?? t?.members.map((m) => m.id) ?? [];
  return ids.map((id, i) => {
    const m = t?.members.find((x) => x.id === id);
    return {
      id, name: m?.name ?? state?.players.find((p) => p.id === id)?.name ?? '?', avatar: m?.avatar ?? '🎲', color: COLORS[i % COLORS.length],
      photo: m?.photo ?? null, rep: m?.rep, isMe: id === session.playerId, bot: !!m?.bot, away: !!m && !m.bot && !m.connected && !m.left, left: !!m?.left,
    };
  });
}

function PmNotices({ session }: { session: PmSession }) {
  usePm(session);
  const [now, setNow] = useState(Date.now());
  const live = session.notices.filter((x) => now - x.at < 5000);
  useEffect(() => { if (!live.length) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [live.length]);
  useEffect(() => { setNow(Date.now()); }, [session.notices]);
  return <div className="notices">{live.slice(-2).map((x) => <div key={x.id} className={`notice ${x.kind}`}>{trServer(x.text)}</div>)}</div>;
}

function PmOnlineGame({ session, pa, settings, onExit, onBags }: { session: PmSession; pa: ProfileApi; settings: Settings; onExit: () => void; onBags?: () => void }) {
  usePm(session);
  const rewardMsg = session.reward;
  useEffect(() => { if (rewardMsg?.profile) pa.onServerProfile(rewardMsg.profile as Profile); }, [rewardMsg]); // eslint-disable-line react-hooks/exhaustive-deps
  const meId = session.spectating ? null : session.playerId;
  const anim = usePmAnimator(session.state!, meId);
  const [rules, setRules] = useState(false);
  useEffect(() => {
    anim.push({ state: session.state!, events: [], by: '', snapshot: true });
    return session.subscribeUpdates((u: PmUp) => {
      if ('snapshot' in u) anim.push({ state: u.state, events: [], by: '', snapshot: true });
      else anim.push({ state: u.state, events: u.events, by: u.by });
    });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = anim.shown;
  const seats = seatsOf(session, s);
  const t = session.table!;
  const mine = !!meId && s.phase !== 'fini' && currentPlayer(s)?.id === meId;
  useMyTurnAlert(mine && !anim.busy, !session.spectating, settings.vibrate);
  const playing = !!meId && s.phase !== 'fini' && !!s.players.find((p) => p.id === meId && !p.out);
  const okToLeave = async () => !playing || askConfirm(tr('pm.quitOnline'), tr('pm.quit'));
  const leave = async () => { if (!(await okToLeave())) return; session.leave(); onExit(); };
  useNavGuard({ game: true, ask: okToLeave, leave: () => session.leave() });
  const ended = s.phase === 'fini' && !anim.busy;
  useGuestInviteAtEnd('poker', ended && !session.spectating);
  const rematch = async () => { const a = await session.rematch(); if (!a.ok && a.error) alert(trServer(a.error)); };
  const isAcc = pa.isAccount;
  return (
    <>
      <PmBoard anim={anim} seats={seats} meId={meId} canAct={session.connected && !session.spectating} settings={settings} deadline={t.deadline}
        onAct={(a) => session.act(a).then((e) => (e ? trServer(e) : null))} onLeave={() => void leave()} onRules={() => setRules(true)}
        banner={<>{!session.connected && <p className="pk-banner warn">{tr('pm.reconnecting')}</p>}{session.spectating && <p className="pk-banner">{tr('pm.watching', { n: t.spectators })}</p>}</>}
        end={ended && <EndDialog s={s} seats={seats} reward={session.spectating ? null : !meId ? null : isAcc ? (rewardMsg?.reward ?? undefined) : null} bags={rewardMsg?.bags ?? 0}
          quests={rewardMsg?.quests ?? []} achievements={rewardMsg?.achievements ?? []} isAccount={isAcc} onBags={onBags}
          waiting={!session.isHost && !session.spectating ? tr('pm.waitHost') : undefined}
          buttons={<>
            <button className="btn secondary" onClick={() => { session.leave(); onExit(); }}>{tr('pm.back')}</button>
            {session.isHost && <button className="btn primary" onClick={() => void rematch()}><Icon name="resume" size={18} /> {tr('pm.rematch')}</button>}
          </>} />} />
      <PmNotices session={session} />
      <Chat session={session} pa={pa} />
      {rules && <Sheet title={tr('pm.rules')} onClose={() => setRules(false)}><PmRules /></Sheet>}
    </>
  );
}

function QuickInfo({ quick }: { quick: NonNullable<NonNullable<PmSession['table']>['quick']> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const secs = (at: number) => Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <div className="quick-banner" role="status">
      <span className="quick-clock" aria-hidden>{quick.startAt ? secs(quick.startAt) : quick.fillAt ? secs(quick.fillAt) : '…'}</span>
      <div>{quick.startAt ? <><b>{tr('pm.startIn', { n: secs(quick.startAt) })}</b><small>{tr('pm.startInSub')}</small></>
        : quick.fillAt ? <><b>{tr('pm.seeking')}</b><small>{tr('pm.seekingSub', { n: secs(quick.fillAt) })}</small></>
          : <b>{tr('pm.quick')}</b>}</div>
    </div>
  );
}

const LIVES_OPTS = () => [{ v: 3, label: tr('pm.lives3'), hint: tr('pm.lives3h') }, { v: 5, label: tr('pm.lives5'), hint: tr('pm.lives5h') }];
const VIS_OPTS = () => [{ v: 'private' as const, label: tr('pm.private'), hint: tr('pm.privateH') }, { v: 'public' as const, label: tr('pm.public'), hint: tr('pm.publicH') }];
const STRAIGHT_OPTS = () => [{ v: 0, label: tr('pm.withStraights') }, { v: 1, label: tr('pm.noStraights') }];

function InviteFriends({ pa, inTable }: { pa: ProfileApi; inTable: string[] }) {
  const [friends, setFriends] = useState<{ username: string; online: boolean; me?: boolean }[]>([]);
  const [sent, setSent] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () => api<{ friends: typeof friends }>('/friends', { token: pa.token! }).then((r) => setFriends(r.friends.filter((f) => !f.me))).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, [pa.token]);
  const list = friends.filter((f) => !inTable.includes(f.username)).sort((a, b) => Number(b.online) - Number(a.online));
  if (!list.length) return null;
  return (
    <Section title={tr('pm.inviteFriends')}>
      <ul className="dm-invite">
        {list.slice(0, 8).map((f) => (
          <li key={f.username}>
            <i className={`fr-dot ${f.online ? 'on' : ''}`} aria-hidden /><b>{f.username}</b>
            {sent[f.username] ? <small className="muted">{sent[f.username]}</small> : (
              <button className="btn small" onClick={async () => {
                try { await api('/invites', { token: pa.token!, body: { username: f.username } }); setSent((x) => ({ ...x, [f.username]: tr('pm.inviteSent') })); }
                catch (e) { setSent((x) => ({ ...x, [f.username]: trServer((e as Error).message) })); }
              }}>{tr('pm.inviteBtn')}</button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PmLobby({ session, pa, onExit }: { session: PmSession; pa: ProfileApi; onExit: () => void }) {
  usePm(session);
  const t = session.table!;
  const me = t.members.find((m) => m.id === session.playerId);
  const isHost = session.isHost;
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [level, setLevel] = useState<PmLevel>('habitue');
  const link = `${publicUrl()}/?poker=${t.code}${getLang() === 'fr' ? '' : `&lang=${getLang()}`}`;
  const canShare = typeof navigator.share === 'function';
  const share = async () => { try { await navigator.share({ title: modeName(), text: tr('pm.share', { code: t.code }), url: link }); trackEvent('invite'); } catch { /* annulé */ } };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); trackEvent('invite'); } catch { window.prompt(tr('pm.copyPrompt'), text); }
  };
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => { setErr(null); const a = await p; if (!a.ok) setErr(a.error ? trServer(a.error) : tr('pm.cantDo')); };
  const count = t.members.length;
  const allReady = t.members.every((m) => m.ready || m.bot);
  return (
    <Shell title={trServer(t.title)} onBack={() => { session.leave(); onExit(); }} wide icon="dice" sub={tr('pm.players', { n: count, max: PM_TABLE_MAX })}
      foot={isHost ? <BigAction icon="dice" disabled={count < 2 || !allReady} onClick={() => void run(session.start())}
        label={count < 2 ? tr('pm.waitPlayers') : !allReady ? tr('pm.waitReady') : tr('pm.start')} sub={tr('pm.livesRule', { n: t.options.lives })} />
        : me && !t.quick ? <BigAction icon="check" tone={me.ready ? undefined : 'gold'} label={tr(me.ready ? 'pm.notReadyAny' : 'pm.ready')}
          sub={tr('pm.livesRule', { n: t.options.lives })} onClick={() => void run(session.setReady(!me.ready))} /> : undefined}>
      <div className="dm-lobby-code">
        <span>{tr(t.visibility === 'public' ? 'pm.publicTable' : 'pm.inviteTable')} <b>{t.code}</b></span>
        <button className="btn small" onClick={() => void copy(t.code, 'code')}><Icon name="copy" size={16} />{tr(copied === 'code' ? 'pm.copied' : 'pm.codeBtn')}</button>
        {canShare ? <button className="btn small" onClick={() => void share()}><Icon name="share" size={16} />{tr('pm.inviteBtn')}</button>
          : <button className="btn small" onClick={() => void copy(link, 'lien')}><Icon name="share" size={16} />{tr(copied === 'lien' ? 'pm.copied' : 'pm.linkBtn')}</button>}
      </div>
      {t.quick && <QuickInfo quick={t.quick} />}
      <RepTable reps={t.members.filter((m) => !m.left).map((m) => m.rep)} />
      <ul className="dm-lobby-seats">
        {t.members.map((m: PmPublicMember, i) => {
          const mine = m.id === session.playerId;
          return (
            <li key={m.id} className={`dm-ls${mine ? ' dm-ls-me' : ''}${m.ready || m.bot ? ' ready' : ''}`} style={{ ['--pc' as string]: COLORS[i % COLORS.length] }}>
              <Avatar photo={m.photo ?? null} emoji={m.avatar} size={34} accessory={m.accessory}><RepBadge rep={m.rep} className="rep-on-av" /></Avatar>
              <span className="dm-ls-text"><b>{m.name}{mine ? tr('pm.meTag') : ''}{m.isHost && <i className="dm-host" title={tr('pm.host')}> ★</i>}</b>
                <small>{m.filler ? tr('pm.fillerBot') : m.bot ? tr('pm.botLevel', { level: levelLabel(m.bot) }) : tr(!m.connected ? 'pm.offline' : m.ready ? 'pm.isReady' : 'pm.notReady')}</small></span>
              {(m.ready || m.bot) && <Icon name="check" size={16} />}
              {isHost && !mine && <button className="btn ghost small" onClick={() => void run(m.bot ? session.removeBot(m.id) : session.kick(m.id))}>{tr(m.bot ? 'pm.remove' : 'pm.kick')}</button>}
            </li>
          );
        })}
        {count < PM_TABLE_MAX && <li className="dm-ls empty"><button onClick={() => (canShare ? void share() : void copy(link, 'lien'))}><Icon name="plus" size={18} />{tr('pm.freeSeats', { n: PM_TABLE_MAX - count })}</button></li>}
      </ul>
      {isHost && count < PM_TABLE_MAX && (
        <Section title={tr('pm.bots')}>
          <Choices value={level} onChange={setLevel} options={PM_LEVELS.map((l) => ({ v: l, label: levelLabel(l) }))} />
          <div className="dm-lobby-bots"><button className="btn small" onClick={() => void run(session.addBot(level))}><Icon name="plus" size={16} />{tr('pm.addBot')}</button></div>
        </Section>
      )}
      {pa.isAccount && count < PM_TABLE_MAX && <InviteFriends pa={pa} inTable={t.members.map((m) => m.account ?? m.name)} />}
      <Section title={tr('pm.settings')}>
        {isHost && !t.quick ? (
          <>
            <Choices value={t.options.lives} onChange={(v) => void run(session.config({ options: { lives: v } }))} options={LIVES_OPTS()} />
            <Choices value={t.options.noStraights ? 1 : 0} onChange={(v) => void run(session.config({ options: { noStraights: v === 1 } }))} options={STRAIGHT_OPTS()} />
            <Choices value={t.visibility} onChange={(v) => void run(session.config({ visibility: v }))} options={VIS_OPTS()} />
          </>
        ) : (
          <ul className="muted dm-lobby-rules">
            <li>{tr('pm.livesRule', { n: t.options.lives })}</li>
            <li>{t.options.noStraights ? tr('pm.noStraights') : tr('pm.withStraights')}</li>
            <li>{tr('pm.timeRule')}</li>
          </ul>
        )}
      </Section>
      {!session.connected && <p className="error">{tr('pm.reconnecting')}</p>}
      {err && <p className="error">{err}</p>}
    </Shell>
  );
}

export type PmOnlineMode =
  | { kind: 'create'; options: PmOptions; visibility: 'private' | 'public' }
  | { kind: 'join'; code: string } | { kind: 'quick' } | { kind: 'resume' } | { kind: 'watch'; code: string };

const DUMMY = { subscribe: () => () => {}, tick: 0, version: 0, table: null, chat: [], notices: [], reward: null, connected: false } as unknown as PmSession;

function PmOnlineFlow({ mode, pa, settings, me, onExit, onBags }: { mode: PmOnlineMode; pa: ProfileApi; settings: Settings; me: { name: string; avatar: string }; onExit: () => void; onBags?: () => void }) {
  const [session, setSession] = useState<PmSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const s = new PmSession(pa.token, { name: me.name || pa.session?.username || tr('pm.player'), avatar: me.avatar, dice: pa.profile.equipped.dice });
    let off = false;
    void (async () => {
      try {
        if (mode.kind === 'create') await s.create(mode);
        else if (mode.kind === 'join') await s.join(mode.code);
        else if (mode.kind === 'quick') await s.quick();
        else if (mode.kind === 'watch') await s.watch(mode.code, me.name || tr('pm.spectator'));
        else { const saved = loadPmSession(); if (!saved) throw new Error('Aucune partie à reprendre.'); await s.resume(saved); }
        if (!off) setSession(s);
      } catch (e) { s.socket.disconnect(); if (!off) setError(trServer((e as Error).message)); }
    })();
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  usePm(session ?? DUMMY);
  const dt = session?.table;
  usePresenceLayer(dt ? (session!.spectating ? { view: 'spectateur', code: dt.code, state: 'menu' }
    : dt.status === 'playing' ? { view: 'partie', code: dt.code, state: 'online' } : { view: 'salon', code: dt.code, state: 'online' }) : null);
  useEffect(() => () => { if (session && !session.closed) { session.closed = true; session.socket.disconnect(); } }, [session]);
  useNavGuard(session ? { leave: () => session.leave() } : null);
  if (error || session?.kicked || session?.watchClosed) {
    return <Shell title={modeName()} onBack={onExit} icon="dice"><div className="k-wait"><p className="error">{error ?? trServer(session?.kicked ?? session?.watchClosed ?? '')}</p><button className="btn" onClick={onExit}>{tr('pm.back')}</button></div></Shell>;
  }
  if (!session || !session.table) {
    return <Shell title={modeName()} onBack={() => { session?.leave(); onExit(); }} icon="dice"><div className="k-wait"><span className="k-spinner" aria-hidden /><p>{tr(mode.kind === 'quick' ? 'pm.findTable' : 'pm.connecting')}</p></div></Shell>;
  }
  if (session.table.status === 'playing' && session.state) {
    return <PmOnlineGame key={`${session.table.code}:${session.state.round <= 1 && session.state.turns === 0 ? session.version : 'g'}`} session={session} pa={pa} settings={settings} onExit={onExit} onBags={onBags} />;
  }
  if (session.spectating) return <Shell title={modeName()} onBack={() => { session.leave(); onExit(); }} icon="dice"><div className="k-wait"><p>{tr('pm.notStarted')}</p></div></Shell>;
  return <><PmLobby session={session} pa={pa} onExit={onExit} /><PmNotices session={session} /><Chat session={session} pa={pa} /></>;
}

// ---------------------------------------------------------------------------------------------
// Préparation (contre l'ordinateur / en ligne)

function PmSetupScreen({ initialTab, onBack, onStart, onOnline, onRules }: {
  initialTab: 'solo' | 'ligne'; onBack: () => void; onStart: (s: PmSetup, opp: PmPersona[]) => void; onOnline: (m: PmOnlineMode) => void; onRules: () => void;
}) {
  const [setup, setSetup] = useState<PmSetup>(loadSetup);
  const [roster, setRoster] = useState(() => shuffled(PM_PERSONAS));
  const [tab, setTab] = useState<'solo' | 'ligne'>(NO_SERVER ? 'solo' : initialTab);
  const [code, setCode] = useState('');
  const [table, setTable] = useState<{ lives: number; noStraights: boolean; visibility: 'private' | 'public' }>({ lives: 3, noStraights: false, visibility: 'private' });
  const chosen = roster.slice(0, setup.opponents);
  const set = (p: Partial<PmSetup>) => setSetup((s) => { const n = { ...s, ...p }; saveSetup(n); return n; });
  return (
    <Shell title={modeName()} onBack={onBack} icon="dice" wide sub={tr('pm.sub')}
      right={<button className="icon-btn" onClick={onRules} aria-label={tr('pm.rules')}><Icon name="rules" /></button>}
      foot={tab === 'solo'
        ? <BigAction icon="dice" label={tr('pm.sit')} sub={tr('pm.setupLine', { n: setup.opponents, level: levelLabel(setup.level), lives: setup.lives })} onClick={() => onStart(setup, chosen)} />
        : <BigAction icon="dice" tone="gold" label={tr('pm.quick')} sub={tr('pm.quickSub')} onClick={() => onOnline({ kind: 'quick' })} />}>
      {!NO_SERVER && <div className="seg dm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>{tr('pm.vsCpu')}</button>
        <button role="tab" aria-selected={tab === 'ligne'} className={tab === 'ligne' ? 'on' : ''} onClick={() => setTab('ligne')}>{tr('pm.online')}</button>
      </div>}
      {tab === 'solo' ? (
        <>
          <Section title={tr('pm.opponents')} aside={<button className="btn ghost small" onClick={() => setRoster(shuffled(PM_PERSONAS))}><Icon name="resume" size={18} /> {tr('pm.change')}</button>}>
            <div className="k-pills big" role="radiogroup" aria-label={tr('pm.oppCount')}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={n === setup.opponents} className={n === setup.opponents ? 'on' : ''} onClick={() => set({ opponents: n })}>{n}</button>)}
            </div>
            <ul className="solo-roster">
              {chosen.map((p) => (
                <li key={p.id} style={{ ['--pc' as string]: p.color }}>
                  <span className="avatar"><span>{p.avatar}</span></span>
                  <b>{p.name}</b><small>{tr(K(`pm.p.${p.id}.tag`))}</small>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={tr('pm.level')}><Choices value={setup.level} onChange={(v) => set({ level: v })} options={PM_LEVELS.map((l) => ({ v: l, label: levelLabel(l), hint: tr(K(`pm.lh.${l}`)) }))} /></Section>
          <Section title={tr('pm.livesTitle')}><Choices value={setup.lives} onChange={(v) => set({ lives: v })} options={LIVES_OPTS()} /></Section>
          <Section title={tr('pm.variant')}><Choices value={setup.noStraights ? 1 : 0} onChange={(v) => set({ noStraights: v === 1 })} options={STRAIGHT_OPTS()} /></Section>
        </>
      ) : (
        <>
          {loadPmSession() && <button className="home-banner resume dm-resume" onClick={() => onOnline({ kind: 'resume' })}><Icon name="resume" size={20} /><span><b>{tr('pm.resume')}</b><small>{tr('pm.tableN', { code: loadPmSession()!.code })}</small></span></button>}
          <Section title={tr('pm.joinCode')}>
            <form className="hub-code" onSubmit={(e) => { e.preventDefault(); if (code.length === 5) onOnline({ kind: 'join', code }); }}>
              <Icon name="key" size={20} />
              <input value={code} maxLength={5} placeholder="CODE" aria-label={tr('pm.code')} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn small primary" disabled={code.length !== 5}>{tr('pm.join')}</button>
            </form>
          </Section>
          <Section title={tr('pm.openTable')}>
            <Choices value={table.lives} onChange={(v) => setTable((t) => ({ ...t, lives: v }))} options={LIVES_OPTS()} />
            <Choices value={table.noStraights ? 1 : 0} onChange={(v) => setTable((t) => ({ ...t, noStraights: v === 1 }))} options={STRAIGHT_OPTS()} />
            <Choices value={table.visibility} onChange={(v) => setTable((t) => ({ ...t, visibility: v }))} options={VIS_OPTS()} />
            <button className="btn primary wide dm-open" onClick={() => onOnline({ kind: 'create', options: { lives: table.lives, noStraights: table.noStraights }, visibility: table.visibility })}><Icon name="plus" size={18} />{tr('pm.open2')}</button>
            <p className="muted small">{tr('pm.openSub')}</p>
          </Section>
        </>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Menu du mode

function PmAchievements({ profile, compact, onOpen }: { profile: Profile; compact?: boolean; onOpen?: () => void }) {
  const list = ACHIEVEMENTS.filter((a) => a.game === 'poker');
  const input = { stats: profile.stats, level: 0, purchases: 0, owned: profile.owned, pm: profile.pm };
  const done = list.filter((a) => profile.achievements[a.id]).length;
  if (compact) {
    return (
      <button className="dm2-ach-row" onClick={onOpen}>
        <span className="dm2-ach-row-title"><b>{tr('pm.ach.title')}</b><small>{tr('pm.ach.count', { n: done, total: list.length })}</small></span>
        <span className="dm2-ach-row-icons" aria-hidden>{list.map((a) => <i key={a.id} className={profile.achievements[a.id] ? 'on' : ''}>{profile.achievements[a.id] || !a.secret ? a.icon : '❔'}</i>)}</span>
      </button>
    );
  }
  return (
    <ul className="pk-ach">
      {list.map((a) => {
        const got = !!profile.achievements[a.id];
        const hidden = a.secret && !got;
        const v = Math.min(a.target, a.value(input));
        return (
          <li key={a.id} className={got ? 'on' : ''}>
            <span className="pk-ach-ic" aria-hidden>{hidden ? '?' : a.icon}</span>
            <span><b>{hidden ? tr('pm.ach.secret') : tr(K(`pm.a.${a.id}`))}</b><small>{hidden ? tr('pm.ach.secretD') : tr(K(`pm.a.${a.id}.d`))}</small>
              {!got && a.target > 1 && <i className="tile-bar"><i style={{ width: `${(100 * v) / a.target}%` }} /></i>}</span>
            <em>{got ? '✓' : `+${a.coins}`}</em>
          </li>
        );
      })}
    </ul>
  );
}

const helpUrl = (path: string) => (NO_SERVER || !/^https?:$/.test(location.protocol) ? `https://421online.com${path}` : path);

function PmMenu({ pa, onHome, onRules, onSetup, onOnline, onCollection }: {
  pa: ProfileApi; onHome: () => void; onRules: () => void; onSetup: (tab: 'solo' | 'ligne') => void; onOnline: (m: PmOnlineMode) => void; onCollection?: (open?: boolean) => void;
}) {
  const p = pa.profile;
  const acc = pa.isAccount;
  const [code, setCode] = useState('');
  const [sheet, setSheet] = useState<'stats' | 'succes' | null>(null);
  const bags = p.bags ?? 0;
  const saved = NO_SERVER ? null : loadPmSession();
  const st = p.pm;
  return (
    <div className="dm-menu pk-menu">
      <ModeBar tone="poker" title={modeName()} onBack={onHome}>
        <LangSwitch />
        <button className="icon-btn mode-rules" onClick={onRules} aria-label={tr('pm.rules')}><Icon name="rules" size={20} /></button>
      </ModeBar>
      <main className="dm-menu-main">
        {saved && <button className="home-banner resume dm-resume" onClick={() => onOnline({ kind: 'resume' })}><Icon name="resume" size={20} /><span><b>{tr('pm.resume')}</b><small>{tr('pm.tableN', { code: saved.code })}</small></span></button>}
        {bags > 0 && onCollection && <button className="home-banner gift dm-bags" onClick={() => onCollection(acc)}><BagIcon size={26} /><span><b>{tr(bags > 1 ? 'pm.bagsN' : 'pm.bag1', { n: bags })}</b><small>{tr(acc ? 'pm.bagsWon' : 'pm.bagsAcc')}</small></span><em>{tr('pm.open')}</em></button>}
        <section className="dm-hero pk-hero">
          <span className="pk-hero-art" aria-hidden><span className="pk-hero-cup" /><PmDice dice={[5, 5, 4, 4, 4]} size={18} /></span>
          <span className="dm-hero-text">
            <h1>{modeName()}</h1>
            <p>{tr('pm.hero')} <button className="link" onClick={onRules}>{tr('pm.readRules')}</button></p>
          </span>
        </section>
        <div className="dm-plays">
          <button className="dm-play solo" onClick={() => onSetup('solo')}>
            <span className="dm-play-ic" aria-hidden><Icon name="dice" size={26} /></span>
            <span className="dm-play-text"><b>{tr('pm.vsCpu')}</b><small>{tr('pm.vsSub')}</small></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {!NO_SERVER && <>
            <div className="dm-play-row">
              <button className="dm-play quick" onClick={() => onOnline({ kind: 'quick' })}><span className="dm-play-text"><b>{tr('pm.quick')}</b><small>{tr('pm.quickSub2')}</small></span></button>
              <button className="dm-play table" onClick={() => onSetup('ligne')}><span className="dm-play-text"><b>{tr('pm.openTable')}</b><small>{tr('pm.tableSub')}</small></span></button>
            </div>
            <form className="hub-code dm-code" onSubmit={(e) => { e.preventDefault(); if (code.length === 5) onOnline({ kind: 'join', code }); }}>
              <Icon name="key" size={20} />
              <input value={code} maxLength={5} placeholder="CODE" aria-label={tr('pm.code')} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn small primary" disabled={code.length !== 5}>{tr('pm.join')}</button>
            </form>
          </>}
        </div>
        <div className="dm-tiles">
          <button className="dm-tile" onClick={() => setSheet('stats')}>
            <span className="dm-tile-art" aria-hidden><Icon name="chart" size={28} /></span>
            <b>{tr('pm.stats')}</b><small>{st?.games ? tr('pm.gamesN', { n: st.games }) : tr('pm.yourGames')}</small>
          </button>
          <button className="dm-tile" onClick={onRules}>
            <span className="dm-tile-art" aria-hidden><Icon name="rules" size={28} /></span>
            <b>{tr('pm.rulesShort')}</b><small>{tr('pm.handsShort')}</small>
          </button>
          {onCollection && <button className="dm-tile bags" onClick={() => onCollection()}>
            <span className="dm-tile-art" aria-hidden><BagIcon size={34} /></span>
            <b>{tr('pm.bagsTile')}</b><small>{tr('pm.bagsSub')}</small>
          </button>}
        </div>
        <PmAchievements profile={p} compact onOpen={() => setSheet('succes')} />
        <nav className="dm-help" aria-label={tr('pm.helpAria')}>
          <span>{tr('pm.help')}</span>
          <a href={helpUrl(`/${({ fr: 'regles-du-poker-menteur', en: 'liars-dice-poker-dice-rules', de: 'luegenpoker-wuerfel-regeln', nl: 'blufpoker-spelregels' } as Record<string, string>)[getLang()] ?? 'regles-du-poker-menteur'}`)} target="_blank" rel="noopener">{tr('pm.help1')}</a>
        </nav>
      </main>
      {sheet === 'stats' && (
        <Sheet title={tr('pm.statsTitle')} onClose={() => setSheet(null)}>
          <div className="dm-stats">
            <div><b>{st?.games ?? 0}</b><small>{tr('pm.st.games')}</small></div>
            <div><b>{st?.wins ?? 0}</b><small>{tr('pm.st.wins')}{st?.games ? ` (${Math.round(((st.wins ?? 0) / st.games) * 100)} %)` : ''}</small></div>
            <div><b>{acc ? st?.callsRight ?? 0 : '—'}</b><small>{tr('pm.st.calls')}</small></div>
            <div><b>{acc ? st?.bluffsPassed ?? 0 : '—'}</b><small>{tr('pm.st.bluffs')}</small></div>
          </div>
          <p className="muted small">{tr('pm.st.note')}</p>
        </Sheet>
      )}
      {sheet === 'succes' && <Sheet title={tr('pm.ach.title')} onClose={() => setSheet(null)}><PmAchievements profile={p} /><p className="muted small">{tr('pm.ach.note')}</p></Sheet>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Mode complet

/** `play` : lien direct `/?jouer=poker` (une partie contre UN ordinateur Débutant). */
export type PmPending = { join?: string; watch?: string; resume?: boolean; play?: boolean };

export function PokerMenteurMode({ pa, settings, onHome, displayName, avatar, pending, onCollection }: {
  pa: ProfileApi; settings: Settings; onSettings?: (s: Settings) => void; onHome: () => void; displayName: string; avatar: string;
  pending?: PmPending; onAccount?: () => void; onCollection?: (open?: boolean) => void;
}) {
  type Route = { r: 'menu' } | { r: 'setup'; tab: 'solo' | 'ligne' } | { r: 'game'; setup: PmSetup; opponents: PmPersona[]; key: number } | { r: 'online'; mode: PmOnlineMode; key: number; from: 'menu' | 'setup' };
  const [route, setRoute] = useState<Route>(() => pending?.join ? { r: 'online', mode: { kind: 'join', code: pending.join }, key: 1, from: 'menu' }
    : pending?.watch ? { r: 'online', mode: { kind: 'watch', code: pending.watch }, key: 1, from: 'menu' }
      : pending?.resume ? { r: 'online', mode: { kind: 'resume' }, key: 1, from: 'menu' }
        : pending?.play ? { r: 'game', setup: { opponents: 1, level: 'debutant', lives: 3, noStraights: false }, opponents: shuffled(PM_PERSONAS).slice(0, 1), key: 1 } : { r: 'menu' });
  const [rules, setRules] = useState(false);
  usePresenceLayer(route.r === 'menu' || route.r === 'setup' ? { view: route.r === 'setup' ? 'preparation' : 'menu', state: 'menu', depth: 1 } : null);
  useLang();
  const me = { name: pa.session?.username ?? displayName ?? tr('pm.you'), avatar, photo: pa.photo };
  const toMenu = () => setRoute({ r: 'menu' });
  const bags = onCollection && (() => onCollection(true));
  if (route.r === 'game') {
    return <PmSoloGame key={route.key} setup={route.setup} opponents={route.opponents} pa={pa} settings={settings} me={me}
      onExit={() => setRoute({ r: 'setup', tab: 'solo' })} onBags={bags}
      onReplay={() => setRoute({ ...route, opponents: route.opponents, key: route.key + 1 })} />;
  }
  if (route.r === 'online') {
    const exit = route.from === 'setup' ? () => setRoute({ r: 'setup', tab: 'ligne' }) : toMenu;
    return <PmOnlineFlow key={route.key} mode={route.mode} pa={pa} settings={settings} me={{ name: me.name, avatar }} onExit={exit} onBags={bags} />;
  }
  const online = (mode: PmOnlineMode, from: 'menu' | 'setup') => { sound.unlock(); if (mode.kind !== 'resume' && mode.kind !== 'watch') savePmSession(null); setRoute({ r: 'online', mode, key: Date.now(), from }); };
  return (
    <>
      {route.r === 'setup'
        ? <PmSetupScreen initialTab={route.tab} onBack={toMenu} onRules={() => setRules(true)} onOnline={(m) => online(m, 'setup')}
          onStart={(setup, opponents) => { sound.unlock(); setRoute({ r: 'game', setup, opponents, key: Date.now() }); }} />
        : <PmMenu pa={pa} onHome={onHome} onRules={() => setRules(true)} onSetup={(tab) => setRoute({ r: 'setup', tab })} onOnline={(m) => online(m, 'menu')} onCollection={onCollection} />}
      {rules && <Sheet title={tr('pm.rules')} onClose={() => setRules(false)}><PmRules /></Sheet>}
    </>
  );
}
