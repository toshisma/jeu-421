/**
 * Coups Fourrés : le mode cartes (écran unique chargé à la demande depuis App.tsx).
 * Menu du mode (prototype CFMenu validé par Sam), découverte, et navigation interne vers
 * boosters, collection, decks, classement, règles et parties.
 *
 * Fonctions communes du jeu gardées à l'identique : Messages, Amis, Notifications, profil.
 * Seuls changent la monnaie (capsules), le classement (ligue du mode) et les parties.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ProfileApi } from '../account/useProfile';
import { ApiError, api } from '../account/api';
import type { CfFriendPresence } from '../../../shared/cards/protocol';
import type { Settings } from '../settings';
import type { DuelPlay } from '../ui/ChallengeScreen';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { MessagesButton } from '../ui/Messages';
import { FriendsButton } from '../ui/Friends';
import { NotifBell, NotifPanel, useNotifications } from '../ui/Social';
import { ProfileView } from '../ui/ProfileView';
import { Sheet } from '../ui/kit';
import { ModeSwitch } from '../ui/ModeSwitch';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { sound } from '../audio/sound';
import { BOOSTER, CARDS, CF_RULES, STARTER_DECKS, CAPSULES } from '../../../shared/cards/catalog';
import { CF_DIVISIONS, type CfGameView } from '../../../shared/cards/progress';
import { CF_LEVEL_LABEL, type CfLevel } from '../../../shared/cards/ai';
import { cfBuyBooster, cfDiscover, cfFriends, cfMe, type CfState } from './api';
import { BoosterPack, CardBack, CardView } from './components';
import { Capsules, DivisionShield, WaitingOverlay, divisionProgress, seasonEndsIn, seasonName, useCfToast } from './cfui';
import { CF_BOTS, LocalCfController, deckList } from './local';
import type { CfController } from './controller';
import { CfOnline, type CfOnlineController } from './online';
import { CfGame } from './CfGame';
import { CfChatPanel } from './CfChat';
import { BoosterOpening, CollectionScreen } from './CfCollection';
import { DeckEditor, DecksScreen } from './CfDecks';
import { LeagueScreen, MissionsList, RulesScreen } from './CfInfo';
import { CardsCatalogScreen, LearnBlock, LearnHero, LexiconScreen, TipsScreen } from './CfLearn';
import { TutorialCfController, markTutorialSeen, tutorialSeen } from './tutorial';
import { askConfirm } from '../ui/confirm';
import { TournamentCard, TournamentScreen } from './CfTournament';
import './fonts';
import { trackEvent } from '../visit';

export interface CfModeProps {
  pa: ProfileApi;
  settings: Settings;
  onSettings: (s: Settings) => void;
  avatar: string;
  displayName: string;
  /** Retour au 421 classique (accueil). */
  onHome: () => void;
  onMessages: () => void;
  onFriends: () => void;
  onAccount: () => void;
  onLogin: () => void;
  onDuelPlay: (d: DuelPlay) => void;
  onDuels: () => void;
  /** Fonctions communes du jeu : réglages, administration, modération. */
  onOpenSettings?: () => void;
  onAdmin?: () => void;
  onModeration?: () => void;
  /** À faire dès l'ouverture (venu de la liste d'amis) : défier ce pseudo, ou regarder cette partie. */
  pending?: { challenge?: string; watch?: string; tournoi?: boolean };
}

type Route =
  | { r: 'menu' }
  | { r: 'discover' }
  | { r: 'booster' }
  | { r: 'collection' }
  | { r: 'decks' }
  | { r: 'deck'; id: string | null; cards?: Record<string, number>; name?: string }
  | { r: 'league' }
  | { r: 'rules' }
  | { r: 'cards' }
  | { r: 'tips' }
  | { r: 'lexicon' }
  | { r: 'tournoi' }
  | { r: 'game'; ctrl: CfController; mode: string; again?: () => void; online?: boolean };

type SheetKind = 'bot' | 'friends' | 'boosters' | 'missions' | null;

/** Amis présents dans le mode (bandeau « Dédé est dans Coups Fourrés · Défier »). */
type CfFriend = CfFriendPresence;
function useCfFriends(token: string | null): CfFriend[] | null {
  const [list, setList] = useState<CfFriend[] | null>(null);
  useEffect(() => {
    if (!token) { setList(null); return; }
    let stop = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      cfFriends(token).then((f) => { if (!stop) setList(Array.isArray(f) ? f : []); })
        .catch((e) => { if (!stop && e instanceof ApiError && e.status === 404) stop = true; });
    };
    load();
    const t = setInterval(() => { if (!stop) load(); }, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, [token]);
  return list;
}

/** Une clé par partie (Rejouer recrée l'écran de partie). */
const keys = new WeakMap<object, number>();
let keyN = 0;
const gameKey = (c: object) => { let k = keys.get(c); if (!k) { k = ++keyN; keys.set(c, k); } return k; };

const FACE_COLORS = ['linear-gradient(135deg,#3fbf8a,#1d7a55)', 'linear-gradient(135deg,#b06ad9,#6a2f99)', 'linear-gradient(135deg,#e8964a,#b8552b)', 'linear-gradient(135deg,#5b8cff,#2c54c2)'];
const initials = (n: string) => n.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';

export function CfMode(props: CfModeProps) {
  const { pa } = props;
  const acc = pa.isAccount;
  const [st, setSt] = useState<CfState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => (props.pending?.tournoi ? { r: 'tournoi' } : { r: 'menu' }));
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, showToast] = useCfToast();
  const [waiting, setWaiting] = useState<{ kind: 'queue' | 'challenge'; title: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [online, setOnline] = useState<CfOnline | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const reload = useCallback(async () => {
    if (!pa.token) { setSt(null); return null; }
    try { const s = await cfMe(pa.token); setSt(s); setLoadErr(null); return s; } catch (e) { setLoadErr(e instanceof Error ? e.message : 'Serveur injoignable.'); return null; }
  }, [pa.token]);
  useEffect(() => { void reload().then((s) => { if (s && !s.discovered) setRoute({ r: 'discover' }); }); }, [reload]);

  // Connexion « Coups Fourrés en ligne » (comptes) : présence, file classée, défis, tables, reprise.
  useEffect(() => {
    if (!pa.token) { setOnline(null); return; }
    const o = new CfOnline(pa.token);
    setOnline(o);
    o.presence(true);
    const offC = o.onChange(bump);
    const offG = o.onGame((ctrl) => {
      setWaiting(null);
      setSheet(null);
      sound.unlock();
      setRoute({ r: 'game', ctrl, mode: modeLabel(ctrl), online: true });
    });
    return () => { offC(); offG(); o.presence(false); setTimeout(() => o.close(), 300); };
  }, [pa.token]);
  // Messages du serveur (retiré d'une table, défi refusé…).
  useEffect(() => { if (online?.alert) { showToast(online.alert, 'err'); online.alert = null; } });
  useEffect(() => {
    const sc = online?.sentChallenge;
    if (waiting?.kind === 'challenge' && sc?.closed) {
      if (sc.closed !== 'accepte') showToast(sc.closed, 'err');
      online!.sentChallenge = null;
      setWaiting(null);
    }
  });

  // Venu de la liste d'amis : défi ou partie à regarder, dès que la connexion et les decks sont prêts.
  const pendingDone = useRef(false);
  useEffect(() => {
    const pd = props.pending;
    if (!pd || pendingDone.current || !online?.connected || !st) return;
    pendingDone.current = true;
    if (pd.challenge) challenge(pd.challenge);
    else if (pd.watch) watch(pd.watch);
  });

  const name = pa.session?.username ?? (props.displayName || 'Vous');
  const menu = useCallback(() => { setRoute({ r: 'menu' }); void reload(); }, [reload]);

  // --- parties ---------------------------------------------------------------------------------
  const activeDeck = st?.decks.find((d) => d.id === st.activeDeck && d.valid) ?? st?.decks.find((d) => d.valid) ?? null;
  // --- partie guidée : proposée à la première partie, relançable depuis « Bien débuter » ---------------
  const startTutorial = useCallback(() => {
    sound.unlock();
    markTutorialSeen('propose');
    const ctrl = new TutorialCfController({ me: { name, avatar: props.avatar, photo: pa.photo, account: pa.session?.username }, token: pa.token, onReward: () => void reload() });
    setSheet(null);
    setRoute({ r: 'game', ctrl, mode: 'partie guidée', again: () => { setRoute({ r: 'menu' }); setSheet('bot'); } });
  }, [name, props.avatar, pa.photo, pa.session, pa.token, reload]);
  /** Première partie dans le mode (ni partie jouée, ni partie guidée vue) : on propose la partie guidée. */
  const offerTutorial = useCallback(async (): Promise<boolean> => {
    if (tutorialSeen() || st?.tutorialDone || (st?.history.length ?? 0) > 0) return false;
    markTutorialSeen('propose');
    const yes = await askConfirm(`Première partie de Coups Fourrés ? Une partie guidée de 3 minutes vous montre tout, pas à pas${acc ? ' (et rapporte 20 capsules, une fois)' : ''}.`, 'Partie guidée', 'Jouer directement');
    if (yes) startTutorial();
    return yes;
  }, [st, acc, startTutorial]);

  const startBot = useCallback(async (level: CfLevel, deckId: string | null) => {
    if (starting) return;
    if (await offerTutorial()) return;
    sound.unlock();
    setStarting(true);
    try {
      const own = st?.decks.find((d) => d.id === deckId && d.valid);
      const cards = own?.cards ?? (STARTER_DECKS.find((d) => d.id === deckId) ?? STARTER_DECKS[0]).cards;
      const ctrl = await LocalCfController.create({
        level, deck: deckList(cards), deckId: own ? own.id : null, token: own ? pa.token : null,
        me: { name, avatar: props.avatar, photo: pa.photo, account: pa.session?.username },
      });
      setSheet(null);
      setRoute({ r: 'game', ctrl, mode: '', again: () => void startBot(level, deckId) });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Impossible de lancer la partie.', 'err');
    } finally { setStarting(false); }
  }, [starting, st, pa.token, pa.photo, pa.session, name, props.avatar, showToast, offerTutorial]);

  /** Commande en ligne : erreur claire en français si elle échoue. */
  const tryOnline = useCallback(async (f: (o: CfOnline) => Promise<unknown>): Promise<boolean> => {
    if (!online) { showToast(acc ? 'Connexion au serveur de jeu en cours…' : 'Les parties en ligne demandent un compte (gratuit).', 'err'); return false; }
    try { await f(online); return true; } catch (e) { showToast(e instanceof Error ? e.message : 'Action impossible.', 'err'); return false; }
  }, [online, acc, showToast]);

  const needDeck = () => { if (!activeDeck) { showToast('Il vous faut un deck complet de 20 cartes (Mes decks).', 'err'); return true; } return false; };
  const ranked = () => {
    if (!acc) { showToast('La partie classée demande un compte (gratuit).', 'err'); return; }
    if (needDeck()) return;
    sound.unlock();
    void offerTutorial().then((t) => { if (!t) void tryOnline((o) => o.queueJoin(activeDeck!.id)).then((ok) => { if (ok) setWaiting({ kind: 'queue', title: 'Partie classée' }); }); });
  };
  const challenge = (username: string) => {
    if (needDeck()) return;
    void tryOnline((o) => o.challenge(username, activeDeck!.id)).then((ok) => { if (ok) { setSheet(null); setWaiting({ kind: 'challenge', title: `Défi envoyé à ${username}` }); } });
  };
  const watch = (code: string) => void tryOnline((o) => o.watch(code));

  // Parcours des visiteurs (tableau admin) : première partie de Coups Fourrés lancée, quel que soit le type.
  useEffect(() => { if (route.r === 'game') trackEvent('cards'); }, [route.r]);

  // --- écrans ----------------------------------------------------------------------------------
  if (route.r === 'game') {
    return <CfGame key={gameKey(route.ctrl)} controller={route.ctrl} mode={route.mode} settings={props.settings} onSettings={props.onSettings} pa={pa}
      online={route.online ? online : null} onExit={() => { if (route.mode === 'tournoi') { setRoute({ r: 'tournoi' }); void reload(); } else menu(); }} onAgain={route.again ? () => { route.again!(); } : undefined}
      onAccount={props.onAccount} />;
  }
  if (route.r === 'discover' && st) {
    return <Discover onGo={async () => {
      try { const r = await cfDiscover(pa.token); setSt(r.state); sound.treasure(); setRoute({ r: 'booster' }); }
      catch (e) { showToast(e instanceof Error ? e.message : 'Erreur', 'err'); void reload().then((s) => { if (s?.discovered) setRoute({ r: 'menu' }); }); }
    }} onBack={props.onHome} toast={toast} />;
  }
  if (route.r === 'booster' && st) {
    return <BoosterOpening token={pa.token} state={st} onState={setSt} onDone={menu} onCollection={() => setRoute({ r: 'collection' })}
      onAutoDeck={() => setRoute({ r: 'decks' })} />;
  }
  if (route.r === 'collection') {
    return <CollectionScreen token={pa.token} state={st} onState={setSt} onBack={menu} onAccount={props.onAccount} />;
  }
  if (route.r === 'decks') {
    return <DecksScreen token={pa.token} state={st} onState={setSt} onBack={menu} onAccount={props.onAccount}
      onEdit={(id, cards, nm) => setRoute({ r: 'deck', id, cards, name: nm })} />;
  }
  if (route.r === 'deck' && st) {
    return <DeckEditor token={pa.token} state={st} onState={setSt} deckId={route.id} initial={route.cards} initialName={route.name} onBack={() => setRoute({ r: 'decks' })} />;
  }
  if (route.r === 'league') return <LeagueScreen token={pa.token} state={st} onState={setSt} onBack={menu} onAccount={props.onAccount} username={pa.session?.username} />;
  if (route.r === 'rules') return <RulesScreen onBack={menu} />;
  if (route.r === 'cards') return <CardsCatalogScreen onBack={menu} />;
  if (route.r === 'tips') return <TipsScreen onBack={menu} />;
  if (route.r === 'lexicon') return <LexiconScreen onBack={menu} />;
  if (route.r === 'tournoi') {
    return <>
      <TournamentScreen token={pa.token} acc={acc} onBack={menu} onWatch={watch} onAccount={props.onAccount} onError={(t) => showToast(t, 'err')}
        onResume={() => void tryOnline((o) => o.resume())} />
      {toast}
    </>;
  }

  const q = online?.queue;
  const resumeGame = online?.hello?.game && !online.game ? online.hello.game : null;
  return (
    <>
      <CfMenu {...props} st={st} loadErr={loadErr} name={name} token={pa.token}
        onBot={() => setSheet('bot')} onFriendsPlay={() => setSheet('friends')} onRanked={ranked}
        onDecks={() => setRoute({ r: 'decks' })} onBoosters={() => setSheet('boosters')} onCollection={() => setRoute({ r: 'collection' })}
        onMissions={() => setSheet('missions')} onLeague={() => setRoute({ r: 'league' })} onRules={() => setRoute({ r: 'rules' })}
        onChallenge={challenge} onWatch={(f) => f.code && watch(f.code)} onRetry={() => void reload()} onTournament={() => setRoute({ r: 'tournoi' })}
        onLearn={(r) => setRoute({ r })} onTuto={startTutorial}
        top={<>
          {resumeGame && <button className="cf-banner gold" onClick={() => void tryOnline((o) => o.resume(resumeGame.id))}><b>Partie en cours</b><span>{resumeGame.ranked ? 'Classée' : 'Entre amis'} : reprenez-la avant d’être compté absent.</span><em>Reprendre</em></button>}
          {online?.challenges.map((c) => (
            <div key={c.id} className="cf-banner duel" role="alert">
              <span><b>{c.from} vous défie !</b><span>Duel avec votre deck actif{activeDeck ? ` (« ${activeDeck.name} »)` : ''}.</span></span>
              <button className="cf-btn small ghost" onClick={() => void tryOnline((o) => o.answerChallenge(c.id, false))}>Refuser</button>
              <button className="cf-btn small gold" onClick={() => { if (!needDeck()) void tryOnline((o) => o.answerChallenge(c.id, true, activeDeck!.id)); }}>Accepter</button>
            </div>
          ))}
        </>} />
      {sheet === 'bot' && <BotSheet st={st} acc={acc} starting={starting} onClose={() => setSheet(null)} onStart={startBot} onAccount={props.onAccount} />}
      {sheet === 'friends' && <FriendsPlaySheet acc={acc} token={pa.token} onClose={() => setSheet(null)} onAccount={props.onAccount}
        onCreate={() => { if (!needDeck()) void tryOnline((o) => o.tableCreate(activeDeck!.id)).then((ok) => ok && setSheet(null)); }}
        onJoin={(code) => { if (!needDeck()) void tryOnline((o) => o.tableJoin(code, activeDeck!.id)).then((ok) => ok && setSheet(null)); }}
        onChallenge={challenge} onWatch={watch} onFriends={() => { setSheet(null); props.onFriends(); }} />}
      {sheet === 'boosters' && st && <BoostersSheet st={st} onClose={() => setSheet(null)} onOpen={() => { setSheet(null); setRoute({ r: 'booster' }); }}
        onBuy={async () => {
          try { const r = await cfBuyBooster(pa.token); setSt(r.state); sound.chips(3); showToast('Booster acheté : il vous attend !'); }
          catch (e) { showToast(e instanceof Error ? e.message : 'Achat impossible.', 'err'); }
        }} />}
      {sheet === 'missions' && <Sheet title="Missions du jour" onClose={() => setSheet(null)}><MissionsList st={st} onAccount={props.onAccount} /></Sheet>}
      {online?.table && <TableLobby online={online} st={st} pa={pa} me={pa.session?.username ?? ''} onError={(t) => showToast(t, 'err')} />}
      {waiting?.kind === 'queue' && <WaitingOverlay title={waiting.title} status={q?.text ?? 'Recherche d’un adversaire de votre niveau…'}
        onCancel={() => { void online?.queueLeave(); setWaiting(null); }}
        extra={q?.offer ? <button className="cf-btn violet" onClick={() => { void online?.queueLeave(); setWaiting(null); setSheet('bot'); }}>Jouer contre l’ordinateur en attendant</button> : undefined} />}
      {waiting?.kind === 'challenge' && <WaitingOverlay title={waiting.title} status="En attente de sa réponse…"
        onCancel={() => { void online?.cancelChallenge(); setWaiting(null); }} />}
      {toast}
    </>
  );
}

const modeLabel = (c: CfOnlineController) => (c.spectator ? 'spectateur' : c.mode === 'classee' ? 'classée' : c.mode === 'ami' ? 'défi' : c.mode === 'tournoi' ? 'tournoi' : 'entre amis');

/** Table privée à code (avant le départ) : joueurs, decks, code à partager, lancer. */
function TableLobby({ online, st, me, pa, onError }: { online: CfOnline; st: CfState | null; me: string; pa: ProfileApi; onError: (t: string) => void }) {
  const t = online.table!;
  const host = t.host === me;
  const mine = t.players.find((p) => p.account === me);
  const decks = st?.decks.filter((d) => d.valid) ?? [];
  const run = (f: () => Promise<unknown>) => void f().catch((e) => onError(e instanceof Error ? e.message : 'Action impossible.'));
  const share = () => {
    const text = `Rejoignez ma table de Coups Fourrés sur 421online.com : code ${t.code}`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) void nav.share({ text }).catch(() => {}); else void navigator.clipboard?.writeText(t.code);
  };
  return (
    <div className="cf-wait" role="dialog" aria-modal="true" aria-label="Table entre amis">
      <div className="cf-wait-card cf-table">
        <h3>Table entre amis</h3>
        <button className="cf-table-code" onClick={share} aria-label={`Code ${t.code}, partager`}><small>Code</small><b>{t.code}</b><Icon name="share" size={18} /></button>
        <ul className="cf-table-list">
          {t.players.map((p) => (
            <li key={p.account}>
              {p.photo ? <Avatar photo={p.photo} size={30} /> : <i>{initials(p.name)}</i>}
              <span><b>{p.name}{p.host ? ' · hôte' : ''}</b><small>{p.deck ? `Deck « ${p.deck} »` : 'Choisit son deck…'}</small></span>
              {host && !p.host && <button className="cf-btn small ghost" onClick={() => run(() => online.tableKick(p.account))}>Retirer</button>}
            </li>
          ))}
          {Array.from({ length: Math.max(0, t.max - t.players.length) }, (_, i) => <li key={`v${i}`} className="empty"><i>?</i><span><small>Place libre</small></span></li>)}
        </ul>
        {decks.length > 1 && <div className="cf-chips">{decks.map((d) => <button key={d.id} className={mine?.deck === d.name ? 'on' : ''} onClick={() => run(() => online.tableDeck(d.id))}>{d.name}</button>)}</div>}
        <p>{host ? (t.players.length < 2 ? 'Partagez le code : la partie se lance dès 2 joueurs (4 au plus).' : 'Tout le monde est là ? Lancez la partie.') : 'L’hôte lancera la partie dès que tout le monde est prêt.'}</p>
        {host && <button className="cf-btn gold big" disabled={t.players.length < 2} onClick={() => run(() => online.tableStart())}>Lancer la partie</button>}
        <CfChatPanel inline pa={pa} src={{ chat: online.tableChat, send: (t) => online.tableSay(t) }} />
        <button className="cf-btn ghost" onClick={() => void online.tableLeave()}>Quitter la table</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Menu du mode

function CfMenu(p: CfModeProps & {
  st: CfState | null; loadErr: string | null; name: string;
  onBot: () => void; onFriendsPlay: () => void; onRanked: () => void; onDecks: () => void; onBoosters: () => void; onCollection: () => void;
  onMissions: () => void; onLeague: () => void; onRules: () => void; onChallenge: (u: string) => void; onWatch: (f: CfFriend) => void; onRetry: () => void;
  onLearn: (r: 'cards' | 'tips' | 'lexicon') => void;
  onTuto: () => void;
  onTournament: () => void; token?: string | null; top?: React.ReactNode;
}) {
  const { pa, st } = p;
  const acc = pa.isAccount;
  const { notifs, reload } = useNotifications(pa);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [role, setRole] = useState<{ admin: boolean; moderator: boolean; pending: number }>({ admin: false, moderator: false, pending: 0 });
  useEffect(() => { if (acc && pa.token) api<{ admin: boolean; moderator: boolean; pending: number }>('/moderation/whoami', { token: pa.token }).then(setRole).catch(() => {}); }, [acc, pa.token]);
  const friends = useCfFriends(pa.token);
  const league = st?.league;
  const prog = league ? divisionProgress(league.points) : null;
  const owned = st ? Object.values(st.collection).filter((c) => c.count > 0).length : 0;
  const deck = st?.decks.find((d) => d.id === st.activeDeck) ?? null;
  const missionsDone = st?.missions.filter((m) => m.done).length ?? 0;
  const last: CfGameView | undefined = st?.history[0];
  const divName = league ? CF_DIVISIONS.find((d) => d.id === league.division)?.name : null;
  const present = (friends ?? []).slice(0, 3);
  // Nouveau joueur (aucune partie jouée) : la section « Bien débuter » est mise en avant.
  const fresh = !st?.history.length;
  return (
    <div className="cf-menu">
      <span className="cf-stars" aria-hidden />
      <header className="cf-menu-bar">
        <button className="cf-me" onClick={() => setShowProfile(true)} aria-label="Mon profil">
          <Avatar photo={pa.photo} emoji={p.avatar} size={42} accessory={accessoryEmoji(pa.profile.equipped.accessoire)} />
          <span className="cf-me-text">
            <b>{p.name}{divName && <em>{divName}</em>}</b>
            {acc ? <Capsules n={st?.capsules ?? 0} size={16} /> : <small>Invité</small>}
          </span>
        </button>
        {!acc && <button className="cf-login" onClick={p.onLogin}>Connexion</button>}
        {acc && <MessagesButton pa={pa} onOpen={p.onMessages} />}
        {acc && <FriendsButton pa={pa} onOpen={p.onFriends} />}
        {acc && <NotifBell count={notifs?.count ?? 0} onOpen={() => { setShowNotifs(true); reload(); }} />}
        <button className="icon-btn cf-more-btn" onClick={() => setShowMore(true)} aria-label="Réglages et plus">
          <Icon name="settings" size={22} />{(role.admin || role.moderator) && role.pending > 0 && <i className="cf-more-dot" aria-hidden />}
        </button>
      </header>
      <ModeSwitch active="cartes" onClassic={p.onHome} onCards={() => {}} />

      <main className="cf-menu-main">
        {p.top}
        {fresh && <LearnHero onTuto={p.onTuto} />}
        {present.length > 0 && (
          <div className="cf-present">
            <span className="cf-faces" aria-hidden>{present.map((f, i) => f.photo
              ? <Avatar key={f.username} photo={f.photo} size={26} />
              : <i key={f.username} style={{ background: FACE_COLORS[i % FACE_COLORS.length] }}>{initials(f.username)}</i>)}</span>
            <span className="cf-present-text"><b>{present.length === 1 ? present[0].username : `${present.slice(0, -1).map((f) => f.username).join(', ')} et ${present[present.length - 1].username}`}</b>
              {present.length === 1 ? (present[0].status === 'partie' ? ' joue à Coups Fourrés' : ' est dans Coups Fourrés') : ' sont dans Coups Fourrés'}</span>
            {present.length === 1 && present[0].status === 'partie' && present[0].watchable
              ? <button className="cf-present-go" onClick={() => p.onWatch(present[0])}>Regarder</button>
              : <button className="cf-present-go" onClick={() => p.onChallenge((present.find((f) => f.status === 'menu') ?? present[0]).username)}>Défier</button>}
          </div>
        )}

        <section className="cf-hero">
          <div className="cf-hero-fan" aria-hidden>
            <i className="cf-hab" /><i className="cf-ivr" /><i className="cf-pie" /><i className="cf-cha" />
            <span className="cf-hero-die"><b /><b /><b /><b /></span>
          </div>
          <h1>Coups Fourrés</h1>
          <p>Le 421 aux cartes : bluff, fouine et coups bas · <button className="cf-link" onClick={p.onRules}>Règles</button></p>
          <p className="cf-beta"><b>Bêta</b> Nouvel écran de partie, plus clair : en partie, touchez « ? » pour l’aide et le rappel des 5 types de cartes.</p>
        </section>

        {acc && league && prog ? (
          <button className="cf-league" onClick={p.onLeague}>
            <DivisionShield id={league.division} size={38} />
            <span className="cf-league-text">
              <span className="cf-league-row"><b>{prog.name}</b><small>{league.points} pts{prog.next ? ` · ${prog.next} à ${league.points + prog.toNext}` : ''}</small></span>
              <span className="cf-bar"><i style={{ width: `${prog.pct}%` }} /></span>
              <small>{seasonName(league.season)} · {seasonEndsIn(league.endsOn)}</small>
            </span>
          </button>
        ) : !acc ? (
          <button className="cf-league guest" onClick={p.onAccount}>
            <DivisionShield id="comptoir" size={38} />
            <span className="cf-league-text">
              <span className="cf-league-row"><b>Ligue réservée aux comptes</b></span>
              <small>Compte gratuit : collection, boosters, capsules et parties classées.</small>
            </span>
            <em>Créer</em>
          </button>
        ) : p.loadErr ? (
          <button className="cf-league guest" onClick={p.onRetry}><span className="cf-league-text"><b>{p.loadErr}</b><small>Touchez pour réessayer.</small></span></button>
        ) : <div className="cf-league skeleton" aria-hidden />}

        <div className="cf-plays">
          <button className="cf-play rank" onClick={p.onRanked} aria-disabled={!acc}>
            <span className="cf-play-ic" aria-hidden><Icon name="trophy" size={26} /></span>
            <span className="cf-play-text"><b>Partie classée</b><small>{acc ? 'Duel contre un joueur de votre niveau' : 'Avec un compte gratuit'}</small></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="cf-play-row">
            <button className="cf-play bot" onClick={p.onBot}><span className="cf-play-text"><b>Contre l’ordinateur</b><small>{acc ? 'Entraînement, 3 niveaux' : 'Essai gratuit, 3 niveaux'}</small></span></button>
            <button className="cf-play ami" onClick={p.onFriendsPlay}><span className="cf-play-text"><b>Entre amis</b><small>De 2 à 4 joueurs</small></span></button>
          </div>
        </div>

        <TournamentCard token={pa.token} acc={acc} onOpen={p.onTournament} />

        <div className="cf-tiles">
          <button className="cf-tile" onClick={p.onDecks}>
            <span className="cf-tile-art minis" aria-hidden><i className="cf-hab" /><i className="cf-cha" /><i className="cf-ivr" /></span>
            <b>Mes decks</b><small>{deck ? `« ${deck.name} » actif` : acc ? 'Construire' : 'Decks de départ'}</small>
          </button>
          <button className="cf-tile" onClick={acc ? p.onBoosters : p.onAccount}>
            {!!st?.boosters && <span className="cf-badge">{st.boosters}</span>}
            <span className="cf-tile-art" aria-hidden><BoosterPack width={24} /></span>
            <b>Boosters</b><small>{st?.boosters ? `${st.boosters} à ouvrir` : acc ? `${BOOSTER.price} capsules` : 'Avec un compte'}</small>
          </button>
          <button className="cf-tile" onClick={p.onCollection}>
            <span className="cf-tile-art num" aria-hidden>{acc ? owned : '?'}<small>/{CARDS.length}</small></span>
            <b>Collection</b><small>{acc ? 'Cartes, éclats' : 'Les 34 cartes'}</small>
          </button>
          <button className="cf-tile" onClick={p.onMissions}>
            {st && st.missions.some((m) => m.done) && missionsDone < st.missions.length && <span className="cf-badge green">{missionsDone}</span>}
            <span className="cf-tile-art dots" aria-hidden>{(st?.missions ?? [0, 1, 2]).map((m, i) => <i key={i} className={typeof m === 'object' && m.done ? 'on' : ''} />)}</span>
            <b>Missions</b><small>{st ? `${missionsDone} sur ${st.missions.length}` : 'Du jour'}</small>
          </button>
          <button className="cf-tile" onClick={p.onLeague}>
            <span className="cf-tile-art" aria-hidden><Icon name="chart" size={28} /></span>
            <b>Classement</b><small>Saison en cours</small>
          </button>
          <button className="cf-tile classic" onClick={p.onHome}>
            <span className="cf-tile-art" aria-hidden><span className="cf-421">421</span></span>
            <b>421 classique</b><small>Jeu de base</small>
          </button>
        </div>

        <LearnBlock fresh={fresh} onTuto={p.onTuto} onRules={p.onRules} onCards={() => p.onLearn('cards')} onTips={() => p.onLearn('tips')} onLexicon={() => p.onLearn('lexicon')} />

        {last ? (
          <div className="cf-last">
            <span className={`cf-last-ic ${last.result === 'victoire' ? 'win' : 'lose'}`} aria-hidden>{last.vsBot ? '🤖' : initials(last.opponent ?? '?')}</span>
            <span className="cf-last-text"><b>{last.result === 'victoire' ? 'Victoire' : last.result === 'abandon' ? 'Abandon' : 'Défaite'}</b>
              {` ${last.vsBot ? 'contre l’ordinateur' : `contre ${last.opponent ?? 'un joueur'}`}`}
              {last.ranked && last.points ? ` · ${last.points > 0 ? '+' : ''}${last.points} pts` : ''}{last.capsules ? ` · +${last.capsules} capsules` : ''}</span>
          </div>
        ) : !acc ? (
          <p className="cf-guest-note">Invité : essayez contre l’ordinateur avec les decks de départ (sans rien gagner). <button className="cf-link" onClick={p.onAccount}>Créer un compte</button> pour la collection, les boosters et le classé.</p>
        ) : null}
      </main>

      {showMore && (
        <Sheet title="Réglages et plus" onClose={() => setShowMore(false)}>
          <div className="cf-more">
            {p.onOpenSettings && <button className="cf-more-item" onClick={() => { setShowMore(false); p.onOpenSettings!(); }}><Icon name="settings" size={20} /><span>Réglages<small>Son, musique, vibrations, qualité 3D…</small></span></button>}
            {role.admin && p.onAdmin && <button className="cf-more-item" onClick={() => { setShowMore(false); p.onAdmin!(); }}><Icon name="chart" size={20} /><span>Administration<small>Tableau de bord, joueurs, signalements</small></span>{role.pending > 0 && <em>{role.pending}</em>}</button>}
            {!role.admin && role.moderator && p.onModeration && <button className="cf-more-item" onClick={() => { setShowMore(false); p.onModeration!(); }}><Icon name="flag" size={20} /><span>Modération<small>Signalements à traiter</small></span>{role.pending > 0 && <em>{role.pending}</em>}</button>}
            <button className="cf-more-item" onClick={() => { setShowMore(false); p.onRules(); }}><Icon name="rules" size={20} /><span>Règles du mode<small>Cartes, Tournées, pièges, Dernier mot</small></span></button>
            <button className="cf-more-item" onClick={() => { setShowMore(false); p.onHome(); }}><Icon name="home" size={20} /><span>421 classique<small>Retour à l'accueil du jeu</small></span></button>
          </div>
        </Sheet>
      )}
      {showNotifs && <NotifPanel pa={pa} notifs={notifs} reload={reload} onClose={() => { setShowNotifs(false); reload(); }}
        onPlay={(d) => { setShowNotifs(false); p.onDuelPlay(d); }} onDuels={() => { setShowNotifs(false); p.onDuels(); }} />}
      {showProfile && <ProfileView pa={pa} displayName={p.displayName} avatar={p.avatar} onClose={() => setShowProfile(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Feuilles du menu

const LEVELS: CfLevel[] = ['debutant', 'habitue', 'fine-fouine'];

function BotSheet({ st, acc, starting, onClose, onStart, onAccount }: { st: CfState | null; acc: boolean; starting: boolean; onClose: () => void; onStart: (l: CfLevel, deckId: string | null) => void; onAccount: () => void }) {
  const [level, setLevel] = useState<CfLevel>(() => { try { return (localStorage.getItem('421.cf.niveau') as CfLevel) || 'debutant'; } catch { return 'debutant'; } });
  const decks = useMemo(() => (acc && st ? st.decks.filter((d) => d.valid).map((d) => ({ id: d.id, name: d.name, n: 20 })) : STARTER_DECKS.map((d) => ({ id: d.id, name: d.name, n: 20 }))), [acc, st]);
  const [deckId, setDeckId] = useState<string | null>(() => (acc && st ? st.activeDeck : STARTER_DECKS[0].id));
  const chosen = decks.find((d) => d.id === deckId) ?? decks[0];
  const left = st ? Math.max(0, CAPSULES.vsBotDailyMax - st.botCapsulesToday) : 0;
  return (
    <Sheet title="Contre l’ordinateur" onClose={onClose}>
      <div className="cf-levels" role="radiogroup" aria-label="Niveau">
        {LEVELS.map((l) => (
          <button key={l} role="radio" aria-checked={level === l} className={level === l ? 'on' : ''} onClick={() => { setLevel(l); try { localStorage.setItem('421.cf.niveau', l); } catch { /* */ } }}>
            <span className="cf-lvl-av" aria-hidden>{CF_BOTS[l].avatar}</span>
            <span><b>{CF_LEVEL_LABEL[l]}</b><small>{CF_BOTS[l].name} · {CF_BOTS[l].blurb}</small></span>
          </button>
        ))}
      </div>
      <div className="cf-deckpick">
        <b>Votre deck</b>
        {decks.length ? (
          <div className="cf-chips">{decks.map((d) => <button key={d.id} className={chosen?.id === d.id ? 'on' : ''} onClick={() => setDeckId(d.id)}>{d.name}</button>)}</div>
        ) : <small>Aucun deck complet : construisez-en un dans « Mes decks ».</small>}
      </div>
      <p className="cf-sheet-note">{acc ? (left > 0 ? `+${CAPSULES.vsBot} capsules par partie terminée (encore ${left} aujourd’hui).` : 'Plafond de capsules contre l’ordinateur atteint aujourd’hui : la partie reste un bon entraînement.')
        : <>Partie d’essai sans gain. <button className="cf-link" onClick={onAccount}>Créer un compte</button> pour gagner des capsules.</>}</p>
      <button className="cf-btn gold big" disabled={starting || !chosen} onClick={() => chosen && onStart(level, chosen.id)}>{starting ? 'Préparation…' : 'Jouer'}</button>
    </Sheet>
  );
}

function FriendsPlaySheet({ acc, token, onClose, onCreate, onJoin, onChallenge, onWatch, onFriends, onAccount }: {
  acc: boolean; token: string | null; onClose: () => void; onCreate: () => void; onJoin: (code: string) => void;
  onChallenge: (u: string) => void; onWatch: (code: string) => void; onFriends: () => void; onAccount: () => void;
}) {
  const [code, setCode] = useState('');
  const friends = useCfFriends(token);
  return (
    <Sheet title="Entre amis" onClose={onClose}>
      {!acc && <p className="cf-sheet-note">Les parties entre amis demandent un compte gratuit. <button className="cf-link" onClick={onAccount}>Créer un compte</button></p>}
      {acc && friends && friends.length > 0 && (
        <ul className="cf-friend-list">
          {friends.map((f) => (
            <li key={f.username}>
              {f.photo ? <Avatar photo={f.photo} size={30} /> : <i>{initials(f.username)}</i>}
              <span><b>{f.username}</b><small>{f.status === 'partie' ? 'En partie de Coups Fourrés' : 'Dans Coups Fourrés'}</small></span>
              {f.status === 'partie' ? (f.watchable && f.code ? <button className="cf-btn small ghost" onClick={() => onWatch(f.code!)}>Regarder</button> : null)
                : <button className="cf-btn small gold" onClick={() => onChallenge(f.username)}>Défier</button>}
            </li>
          ))}
        </ul>
      )}
      <button className="cf-row-btn" onClick={onFriends} disabled={!acc}><Icon name="people" size={22} /><span><b>Défier un ami</b><small>Votre liste d’amis, bouton « Défier »</small></span></button>
      <button className="cf-row-btn" onClick={onCreate} disabled={!acc}><Icon name="plus" size={22} /><span><b>Ouvrir une table à code</b><small>De 2 à 4 joueurs · {CF_RULES.startTokensMulti} jetons à 3 ou 4</small></span></button>
      <form className="cf-code" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 4) onJoin(code.trim().toUpperCase()); }}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder="Code de la table" aria-label="Code de la table" disabled={!acc} autoCapitalize="characters" />
        <button className="cf-btn violet" disabled={!acc || code.trim().length < 4}>Rejoindre</button>
      </form>
    </Sheet>
  );
}

function BoostersSheet({ st, onClose, onOpen, onBuy }: { st: CfState; onClose: () => void; onOpen: () => void; onBuy: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Boosters" onClose={onClose}>
      <div className="cf-boost-head">
        <BoosterPack width={92} />
        <div>
          <b>{st.boosters ? `${st.boosters} booster${st.boosters > 1 ? 's' : ''} à ouvrir` : 'Aucun booster à ouvrir'}</b>
          <small>5 cartes au pur hasard : communes 70 %, rares 22 %, épiques 6,5 %, légendaires 1,5 %. Une carte sur vingt sort brillante.</small>
        </div>
      </div>
      {st.boosters > 0 && <button className="cf-btn gold big" onClick={onOpen}>Ouvrir {st.boosters > 1 ? 'un booster' : 'le booster'}</button>}
      <button className="cf-btn violet" disabled={busy || st.capsules < BOOSTER.price} onClick={async () => { setBusy(true); await onBuy(); setBusy(false); }}>
        Acheter un booster · {BOOSTER.price} <span className="cf-sr">capsules</span><Capsules n={st.capsules} size={16} className="inline" />
      </button>
      {st.capsules < BOOSTER.price && <p className="cf-sheet-note">Il vous manque {BOOSTER.price - st.capsules} capsules. Gagnez-en en partie, avec les missions du jour et la ligue.</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------
// Découverte du mode (première visite d'un compte)

function Discover({ onGo, onBack, toast }: { onGo: () => Promise<void>; onBack: () => void; toast: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="cf-discover">
      <span className="cf-stars" aria-hidden />
      <button className="cf-ib cf-discover-back" onClick={onBack} aria-label="Retour au 421 classique"><Icon name="back" size={22} /></button>
      <div className="cf-discover-fan" aria-hidden>
        <CardView id="josiane" width={104} /><CardView id="tete-tourne" width={104} /><CardView id="fouine" width={104} />
      </div>
      <h1>Bienvenue dans Coups Fourrés</h1>
      <p className="cf-discover-lead">Le 421 que vous connaissez, avec des cartes pour piéger, relancer, retourner les dés… et se refaire.</p>
      <ul className="cf-discover-list">
        <li><span className="cf-dl-ic" aria-hidden><CardBack width={24} /></span><span><b>2 decks de départ offerts</b><small>« Le Zinc » et « La Bringue », prêts à jouer.</small></span></li>
        <li><span className="cf-dl-ic" aria-hidden><BoosterPack width={24} /></span><span><b>3 boosters de bienvenue</b><small>15 cartes de plus pour votre collection.</small></span></li>
        <li><span className="cf-dl-ic" aria-hidden><DivisionShield id="bistrot" size={22} /></span><span><b>Une ligue chaque mois</b><small>Du Comptoir au Grand Café.</small></span></li>
      </ul>
      <button className="cf-btn gold big" disabled={busy} onClick={async () => { setBusy(true); await onGo(); setBusy(false); }}>{busy ? 'Un instant…' : 'Recevoir mes cartes'}</button>
      {toast}
    </div>
  );
}
