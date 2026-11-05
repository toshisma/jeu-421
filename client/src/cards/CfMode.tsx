/**
 * Coups Fourrés : le mode cartes (écran unique chargé à la demande depuis App.tsx).
 * Menu du mode (prototype CFMenu validé par Sam), découverte, et navigation interne vers
 * boosters, collection, decks, classement, règles et parties.
 *
 * Fonctions communes du jeu gardées à l'identique : Messages, Amis, Notifications, profil.
 * Seuls changent la monnaie (capsules), le classement (ligue du mode) et les parties.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProfileApi } from '../account/useProfile';
import { api, ApiError } from '../account/api';
import type { Settings } from '../settings';
import type { DuelPlay } from '../ui/ChallengeScreen';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { MessagesButton } from '../ui/Messages';
import { FriendsButton } from '../ui/Friends';
import { NotifBell, NotifPanel, useNotifications } from '../ui/Social';
import { ProfileView } from '../ui/ProfileView';
import { Sheet } from '../ui/kit';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { sound } from '../audio/sound';
import { BOOSTER, CARDS, STARTER_DECKS, CAPSULES } from '../../../shared/cards/catalog';
import { CF_DIVISIONS, type CfGameView } from '../../../shared/cards/progress';
import { CF_LEVEL_LABEL, type CfLevel } from '../../../shared/cards/ai';
import { cfBuyBooster, cfDiscover, cfMe, type CfState } from './api';
import { BoosterPack, CardBack, CardView } from './components';
import { Capsules, DivisionShield, WaitingOverlay, divisionProgress, seasonEndsIn, seasonName, useCfToast } from './cfui';
import { CF_BOTS, LocalCfController, deckList } from './local';
import type { CfController } from './controller';
import { cfPresence, SOON, tryOnline, type CfMatchmaking } from './onlineEntry';
import { CfGame } from './CfGame';
import { BoosterOpening, CollectionScreen } from './CfCollection';
import { DeckEditor, DecksScreen } from './CfDecks';
import { LeagueScreen, MissionsList, RulesScreen } from './CfInfo';
import './fonts';

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
  | { r: 'game'; ctrl: CfController; mode: string; again?: () => void };

type SheetKind = 'bot' | 'friends' | 'boosters' | 'missions' | null;

/** Amis présents dans le mode (route du serveur en ligne ; absente → rien). */
interface CfFriend { username: string; photo?: string | null; status: 'menu' | 'partie'; code?: string; watchable?: boolean }
function useCfFriends(token: string | null): CfFriend[] | null {
  const [list, setList] = useState<CfFriend[] | null>(null);
  useEffect(() => {
    if (!token) { setList(null); return; }
    let stop = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ friends: CfFriend[] }>('/cf/friends', { token }).then((r) => { if (!stop) setList(Array.isArray(r.friends) ? r.friends : []); })
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
  const [route, setRoute] = useState<Route>({ r: 'menu' });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, showToast] = useCfToast();
  const [waiting, setWaiting] = useState<{ title: string; status: string; code?: string; mm: CfMatchmaking; ranked?: boolean } | null>(null);
  const [starting, setStarting] = useState(false);

  const reload = useCallback(async () => {
    if (!pa.token) { setSt(null); return null; }
    try { const s = await cfMe(pa.token); setSt(s); setLoadErr(null); return s; } catch (e) { setLoadErr(e instanceof Error ? e.message : 'Serveur injoignable.'); return null; }
  }, [pa.token]);
  useEffect(() => { void reload().then((s) => { if (s && !s.discovered) setRoute({ r: 'discover' }); }); }, [reload]);

  // Présence « Dans Coups Fourrés » tant que le mode est ouvert (module en ligne, s'il existe).
  useEffect(() => { cfPresence(true); return () => cfPresence(false); }, []);

  const name = pa.session?.username ?? (props.displayName || 'Vous');
  const menu = useCallback(() => { setRoute({ r: 'menu' }); void reload(); }, [reload]);

  // --- parties ---------------------------------------------------------------------------------
  const activeDeck = st?.decks.find((d) => d.id === st.activeDeck && d.valid) ?? st?.decks.find((d) => d.valid) ?? null;
  const startBot = useCallback(async (level: CfLevel, deckId: string | null) => {
    if (starting) return;
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
      setRoute({ r: 'game', ctrl, mode: `contre ${CF_BOTS[level].name}`, again: () => void startBot(level, deckId) });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Impossible de lancer la partie.', 'err');
    } finally { setStarting(false); }
  }, [starting, st, pa.token, pa.photo, pa.session, name, props.avatar, showToast]);

  /** Lance une attente en ligne (classée, défi, table) : « Bientôt disponible » si le module manque. */
  const goOnline = useCallback(async (title: string, mm: Promise<CfMatchmaking | null>, mode: string, ranked = false) => {
    const m = await mm;
    if (!m) { showToast(SOON); return; }
    setSheet(null);
    setWaiting({ title, status: ranked ? 'Recherche d’un adversaire de votre niveau…' : 'En attente des joueurs…', code: m.code, mm: m, ranked });
    try {
      const ctrl = await m.controller;
      setWaiting(null);
      setRoute({ r: 'game', ctrl, mode });
    } catch (e) {
      setWaiting(null);
      if (e instanceof Error && e.message) showToast(e.message, 'err');
    }
  }, [showToast]);
  const onStatus = (status: string) => setWaiting((w) => (w ? { ...w, status } : w));
  const common = () => ({ token: pa.token, deckId: activeDeck?.id ?? null, onStatus });

  const ranked = () => {
    if (!acc) { showToast('La partie classée demande un compte (gratuit).', 'err'); return; }
    if (!activeDeck) { showToast('Il vous faut un deck complet de 20 cartes.', 'err'); return; }
    void goOnline('Partie classée', tryOnline('startRanked', common()), 'classée', true);
  };

  // --- écrans ----------------------------------------------------------------------------------
  if (route.r === 'game') {
    return <CfGame key={gameKey(route.ctrl)} controller={route.ctrl} mode={route.mode} settings={props.settings} onSettings={props.onSettings} pa={pa}
      onExit={() => { menu(); }} onAgain={route.again ? () => { route.again!(); } : undefined}
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

  return (
    <>
      <CfMenu {...props} st={st} loadErr={loadErr} name={name}
        onBot={() => setSheet('bot')} onFriendsPlay={() => setSheet('friends')} onRanked={ranked}
        onDecks={() => setRoute({ r: 'decks' })} onBoosters={() => setSheet('boosters')} onCollection={() => setRoute({ r: 'collection' })}
        onMissions={() => setSheet('missions')} onLeague={() => setRoute({ r: 'league' })} onRules={() => setRoute({ r: 'rules' })}
        onChallenge={(u) => void goOnline(`Défi lancé à ${u}`, tryOnline('challengeFriend', { ...common(), username: u }), `contre ${u}`)}
        onWatch={(f) => void goOnline(`Partie de ${f.username}`, tryOnline('watch', { token: pa.token, username: f.username, code: f.code }), 'spectateur')}
        onRetry={() => void reload()} />
      {sheet === 'bot' && <BotSheet st={st} acc={acc} starting={starting} onClose={() => setSheet(null)} onStart={startBot} onAccount={props.onAccount} />}
      {sheet === 'friends' && <FriendsPlaySheet acc={acc} onClose={() => setSheet(null)} onAccount={props.onAccount}
        onCreate={() => void goOnline('Table entre amis', tryOnline('createTable', common()), 'entre amis')}
        onJoin={(code) => void goOnline(`Table ${code}`, tryOnline('joinTable', { ...common(), code }), 'entre amis')}
        onChallenge={() => { setSheet(null); props.onFriends(); }} />}
      {sheet === 'boosters' && st && <BoostersSheet st={st} onClose={() => setSheet(null)} onOpen={() => { setSheet(null); setRoute({ r: 'booster' }); }}
        onBuy={async () => {
          try { const r = await cfBuyBooster(pa.token); setSt(r.state); sound.chips(3); showToast('Booster acheté : il vous attend !'); }
          catch (e) { showToast(e instanceof Error ? e.message : 'Achat impossible.', 'err'); }
        }} />}
      {sheet === 'missions' && <Sheet title="Missions du jour" onClose={() => setSheet(null)}><MissionsList st={st} onAccount={props.onAccount} /></Sheet>}
      {waiting && <WaitingOverlay title={waiting.title} status={waiting.status} code={waiting.code}
        onCancel={() => { waiting.mm.cancel(); setWaiting(null); }}
        extra={waiting.ranked ? <LateBot onPlay={() => { waiting.mm.cancel(); setWaiting(null); setSheet('bot'); }} /> : undefined} />}
      {toast}
    </>
  );
}

/** Au bout d'une minute de recherche : proposer une partie contre l'ordinateur. */
function LateBot({ onPlay }: { onPlay: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 60_000); return () => clearTimeout(t); }, []);
  return show ? <button className="cf-btn violet" onClick={onPlay}>Jouer contre l’ordinateur en attendant</button> : null;
}

// ------------------------------------------------------------------------------------------------
// Menu du mode

function CfMenu(p: CfModeProps & {
  st: CfState | null; loadErr: string | null; name: string;
  onBot: () => void; onFriendsPlay: () => void; onRanked: () => void; onDecks: () => void; onBoosters: () => void; onCollection: () => void;
  onMissions: () => void; onLeague: () => void; onRules: () => void; onChallenge: (u: string) => void; onWatch: (f: CfFriend) => void; onRetry: () => void;
}) {
  const { pa, st } = p;
  const acc = pa.isAccount;
  const { notifs, reload } = useNotifications(pa);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const friends = useCfFriends(pa.token);
  const league = st?.league;
  const prog = league ? divisionProgress(league.points) : null;
  const owned = st ? Object.values(st.collection).filter((c) => c.count > 0).length : 0;
  const deck = st?.decks.find((d) => d.id === st.activeDeck) ?? null;
  const missionsDone = st?.missions.filter((m) => m.done).length ?? 0;
  const last: CfGameView | undefined = st?.history[0];
  const divName = league ? CF_DIVISIONS.find((d) => d.id === league.division)?.name : null;
  const present = (friends ?? []).slice(0, 3);
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
      </header>

      <main className="cf-menu-main">
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
            <b>421 classique</b><small>Retour au jeu de base</small>
          </button>
        </div>

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

function FriendsPlaySheet({ acc, onClose, onCreate, onJoin, onChallenge, onAccount }: { acc: boolean; onClose: () => void; onCreate: () => void; onJoin: (code: string) => void; onChallenge: () => void; onAccount: () => void }) {
  const [code, setCode] = useState('');
  return (
    <Sheet title="Entre amis" onClose={onClose}>
      {!acc && <p className="cf-sheet-note">Les parties entre amis demandent un compte gratuit. <button className="cf-link" onClick={onAccount}>Créer un compte</button></p>}
      <button className="cf-row-btn" onClick={onChallenge} disabled={!acc}><Icon name="people" size={22} /><span><b>Défier un ami</b><small>Choisissez-le dans votre liste d’amis</small></span></button>
      <button className="cf-row-btn" onClick={onCreate} disabled={!acc}><Icon name="plus" size={22} /><span><b>Ouvrir une table à code</b><small>De 2 à 4 joueurs · 7 jetons à 3 ou 4</small></span></button>
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
