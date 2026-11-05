import { api } from './account/api';
import { ChangelogScreen } from './ui/Changelog';
import { FriendOnlineToast, FriendsScreen, InviteBanner } from './ui/Friends';
import { Suspense, useEffect, useRef, useMemo, useState } from 'react';
import type { GameConfig } from '../../shared/config';
import { sound } from './audio/sound';
import { setHaptics } from './audio/haptics';
import { LocalController, type Opponent } from './game/localController';
import type { Persona } from './game/personas';
import { loadSession, loadSettings, saveSettings, type Settings } from './settings';
import { useProfile } from './account/useProfile';
import type { OnlineMode } from './ui/OnlineFlow';
import type { HubTab } from './ui/OnlineHub';
import type { TournamentMode } from './ui/TournamentFlow';
import { PassScreen } from './ui/Progression';
import { ChallengeScreen } from './ui/ChallengeScreen';
import { BossController } from './game/boss';
import { bossOfWeek } from '../../shared/progress/boss';
import { today } from '../../shared/progress/quests';
import { PERSONAS } from './game/personas';
import { PartyController } from './game/party';
import { TutorialController } from './game/tutorial';
import { titleLabel } from '../../shared/progress/profile';
import { accessoryEmoji } from '../../shared/progress/catalog';
import { AccountScreen, LeaderboardScreen } from './ui/AccountScreens';
import { RulesScreen, Sandbox, SettingsScreen, SoloSetup, STANDALONE } from './ui/Screens';
import { Home } from './ui/Home';
import { StatsScreen } from './ui/StatsScreen';
import { CollectionScreen } from './ui/DiceCollection';
import { DuelsScreen } from './ui/Social';
import type { DuelPlay } from './ui/ChallengeScreen';
import { restartPresence, setPresence, startPresence } from './presence';
import { MessagesScreen } from './ui/Messages';
import { connectMessages } from './messages';
import { cfModeParam } from './cfLink';
import { linkVisitor, trackVisit } from './visit';
import { askConfirm } from './ui/confirm';
import { CfChallengeBanner } from './cards/ChallengeBanner';
import { lazyScreen, saveData, whenIdle } from './lazy';
import { loadTrayScene } from './ui/DiceTray';

// Écrans secondaires : chargés à la demande (voir lazy.ts). L'accueil n'attend aucun d'eux.
const GameScreen = lazyScreen(() => import('./ui/GameScreen'), 'GameScreen');
const OnlineFlow = lazyScreen(() => import('./ui/OnlineFlow'), 'OnlineFlow');
const OnlineHub = lazyScreen(() => import('./ui/OnlineHub'), 'OnlineHub');
const SpectateFlow = lazyScreen(() => import('./ui/SpectateFlow'), 'SpectateFlow');
const TournamentFlow = lazyScreen(() => import('./ui/TournamentFlow'), 'TournamentFlow');
const LegalScreen = lazyScreen(() => import('./ui/LegalScreen'), 'LegalScreen');
const TutorialScreen = lazyScreen(() => import('./ui/TutorialScreen'), 'TutorialScreen');
const PartyGame = lazyScreen(() => import('./ui/PartyScreens'), 'PartyGame');
const PartySetup = lazyScreen(() => import('./ui/PartyScreens'), 'PartySetup');
const RefereeScreen = lazyScreen(() => import('./ui/PartyScreens'), 'RefereeScreen');
const ClubScreen = lazyScreen(() => import('./ui/ClubScreen'), 'ClubScreen');
const AlbumScreen = lazyScreen(() => import('./ui/Collection'), 'AlbumScreen');
const RecapScreen = lazyScreen(() => import('./ui/Collection'), 'RecapScreen');
const ShopScreen = lazyScreen(() => import('./ui/ShopScreen'), 'ShopScreen');
const AdminDashboard = lazyScreen(() => import('./ui/AdminDashboard'), 'AdminDashboard');
const ModerationScreen = lazyScreen(() => import('./ui/Moderation'), 'ModerationScreen');
/** Coups Fourrés, le mode cartes : tout le mode est chargé à part, seulement quand on l'ouvre. */
const CfMode = lazyScreen(() => import('./cards/CfMode'), 'CfMode');
/** Préchargés en arrière-plan une fois l'accueil affiché (les plus utilisés d'abord). */
const LIKELY = [GameScreen, OnlineHub, OnlineFlow, TournamentFlow, ShopScreen, SpectateFlow, TutorialScreen, PartySetup, ClubScreen, AlbumScreen];

type Screen =
  | { name: 'home' }
  | { name: 'solo-setup' }
  | { name: 'solo'; controller: LocalController; personas: Record<string, Persona> }
  | { name: 'hub'; tab: HubTab }
  | { name: 'friends'; from?: 'cf' }
  | { name: 'messages'; with?: string; from?: 'cf' }
  | { name: 'cf'; pending?: { challenge?: string; watch?: string; tournoi?: boolean } }
  | { name: 'changelog' }
  | { name: 'online'; mode: OnlineMode }
  | { name: 'watch'; code: string; back: Screen }
  | { name: 'tournament'; mode: TournamentMode }
  | { name: 'rules' }
  | { name: 'settings'; from?: 'cf' }
  | { name: 'sandbox'; tryFx?: string }
  | { name: 'shop' }
  | { name: 'account'; tab?: 'login' | 'register' }
  | { name: 'leaderboard' }
  | { name: 'legal'; back: Screen }
  | { name: 'pass' }
  | { name: 'challenge' }
  | { name: 'boss'; controller: BossController }
  | { name: 'party-setup' }
  | { name: 'party'; controller: PartyController }
  | { name: 'referee'; names: string[]; config: GameConfig }
  | { name: 'club' }
  | { name: 'album' }
  | { name: 'recap' }
  | { name: 'tutorial'; controller: TutorialController }
  | { name: 'stats' }
  | { name: 'collection' }
  | { name: 'duels' }
  | { name: 'duel'; duel: DuelPlay }
  | { name: 'admin'; from?: 'cf' }
  | { name: 'moderation'; from?: 'cf' };

/**
 * Nettoie l'adresse (lien d'invitation, page de confidentialité) sans recharger la page.
 * Ignoré quand le jeu tourne hors d'un site web (fichier ouvert directement, aperçu intégré).
 */
function cleanUrl() {
  if (!/^https?:$/.test(location.protocol)) return;
  try { history.replaceState(null, '', '/'); } catch { /* aperçu intégré : rien à nettoyer */ }
}

export function App() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const invite = useMemo(() => new URLSearchParams(location.search).get('rejoindre'), []);
  const tInvite = useMemo(() => new URLSearchParams(location.search).get('tournoi'), []);
  // Lien direct pour regarder une partie : /?regarder=CODE
  const watchLink = useMemo(() => new URLSearchParams(location.search).get('regarder'), []);
  // Clic sur une notification de tournoi programmé : écran Tournois.
  const tSched = useMemo(() => { const v = new URLSearchParams(location.search).has('tournois'); if (v) cleanUrl(); return v; }, []);
  // Clic sur une notification : l'accueil s'ouvre sur le panneau des notifications.
  // Clic sur une notification de message : la conversation s'ouvre.
  const openPm = useMemo(() => { const v = new URLSearchParams(location.search).get('messages'); if (v) cleanUrl(); return v ? v.slice(0, 20) : null; }, []);
  // Notification « X vous défie à Coups Fourrés » : le mode s'ouvre, le défi s'y affiche.
  // Lien « Jouer gratuitement » des pages Coups Fourrés (/?mode=cartes) : le mode s'ouvre directement.
  const openCf = useMemo(() => { const q = new URLSearchParams(location.search); const v = q.has('cf-defi') ? 'defi' : q.has('cf-tournoi') ? 'tournoi' : cfModeParam(location.search) ? 'menu' : null; if (v) cleanUrl(); return v; }, []);
  // Lien partagé du défi du jour (« 421online.com/?defi ») : le défi s'ouvre directement.
  const openDefi = useMemo(() => { const v = new URLSearchParams(location.search).has('defi'); if (v) cleanUrl(); return v; }, []);
  const openNotifs = useMemo(() => { const v = new URLSearchParams(location.search).has('notifs'); if (v) cleanUrl(); return v; }, []);
  // Lien de parrainage : le pseudo du parrain est retenu pour la création du compte.
  useMemo(() => {
    const p = new URLSearchParams(location.search).get('parrain');
    if (p) { try { localStorage.setItem('421.parrain', p.slice(0, 20)); } catch { /* */ } cleanUrl(); }
  }, []);
  const [screen, setScreen] = useState<Screen>(() =>
    location.pathname.startsWith('/confidentialite') ? { name: 'legal', back: { name: 'home' } }
    : STANDALONE ? { name: 'home' }
      : watchLink ? { name: 'watch', code: watchLink.toUpperCase(), back: { name: 'home' } }
      : invite ? { name: 'online', mode: { kind: 'join', code: invite.toUpperCase() } }
        : tInvite && settings.name ? { name: 'tournament', mode: { kind: 'join', code: tInvite.toUpperCase() } }
          : tInvite || tSched ? { name: 'hub', tab: 'tournois' } : openCf ? { name: 'cf', ...(openCf === 'tournoi' ? { pending: { tournoi: true } } : {}) } : openDefi ? { name: 'challenge' } : openPm ? { name: 'messages', with: openPm } : { name: 'home' });
  const [resume, setResume] = useState(loadSession);
  // Profil : invité (sur l'appareil) ou compte (sur le serveur). Pas de comptes sans serveur.
  const pa = useProfile(!STANDALONE);
  // Signe de vie : un compte avec le jeu ouvert apparaît « en ligne » chez ses amis.
  const firstToken = useRef(true);
  useEffect(() => { if (firstToken.current) { firstToken.current = false; return; } restartPresence(); }, [pa.token]);
  useEffect(() => {
    if (!pa.token) return;
    const ping = () => { if (document.visibilityState === 'visible') api('/notifications', { token: pa.token! }).catch(() => {}); };
    ping(); const t = setInterval(ping, 45_000); return () => clearInterval(t);
  }, [pa.token]);
  const { profile } = pa;
  // Messages privés : réception en direct tant que le compte a le jeu ouvert.
  useEffect(() => { if (!STANDALONE) connectMessages(pa.token ?? null); }, [pa.token]);

  const setSettings = (s: Settings) => { setSettingsState(s); saveSettings(s); };
  useEffect(() => { sound.configure({ volume: settings.volume, muted: settings.muted }); }, [settings.volume, settings.muted]);
  useEffect(() => { setHaptics(settings.vibrate); }, [settings.vibrate]);
  // Présence (statistiques publiques) : seulement avec un serveur.
  useEffect(() => { if (!STANDALONE) startPresence(); }, []);
  // Visite anonyme (provenance, page d'arrivée) ; rattachée au compte à la connexion.
  useEffect(() => { if (!STANDALONE) trackVisit(pa.token); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!STANDALONE && pa.token) linkVisitor(pa.token); }, [pa.token]);
  // Compte suspendu par l'administration : session fermée, message clair.
  useEffect(() => {
    let shown = false;
    const onBan = (e: Event) => {
      if (shown) return;
      shown = true;
      void pa.logout();
      void askConfirm((e as CustomEvent<string>).detail || 'Votre compte est suspendu.', 'Compris', 'Fermer').then(() => { shown = false; setScreen({ name: 'home' }); });
    };
    window.addEventListener('421:banned', onBan);
    return () => window.removeEventListener('421:banned', onBan);
  }, [pa.logout]);
  useEffect(() => {
    setPresence(screen.name === 'solo' || screen.name === 'boss' ? 'solo' : screen.name === 'online' || screen.name === 'tournament' ? 'online' : 'menu');
  }, [screen.name]);

  // Une fois l'accueil affiché : la 3D puis les écrans les plus probables se chargent en arrière-plan.
  useEffect(() => {
    if (saveData()) return;
    let i = 0;
    const next = () => { if (i < LIKELY.length) { LIKELY[i++].preload(); whenIdle(next); } };
    const t = setTimeout(() => whenIdle(() => { void loadTrayScene().catch(() => {}); whenIdle(next); }), 1500);
    return () => clearTimeout(t);
  }, []);

  const home = () => {
    if (invite || tInvite || watchLink || location.pathname.startsWith('/confidentialite')) cleanUrl();
    setResume(loadSession());
    setScreen({ name: 'home' });
  };

  const startSolo = (cfg: GameConfig, opponents: Opponent[]) => {
    sound.unlock();
    const c = new LocalController(cfg, opponents, { name: settings.name || pa.session?.username || 'Vous', avatar: settings.avatar, photo: pa.photo, account: pa.session?.username, title: titleLabel(profile.title) ?? undefined, accessory: accessoryEmoji(profile.equipped.accessoire) || undefined });
    const personas = Object.fromEntries(opponents.map((o, i) => [`ia-${i}`, o.persona]));
    setScreen({ name: 'solo', controller: c, personas });
  };

  const meInfo = () => ({ name: settings.name || pa.session?.username || 'Vous', avatar: settings.avatar, photo: pa.photo, account: pa.session?.username,
    title: titleLabel(profile.title) ?? undefined, accessory: accessoryEmoji(profile.equipped.accessoire) || undefined });
  const startBoss = () => {
    sound.unlock();
    const c = new BossController(bossOfWeek(today()), meInfo());
    setScreen({ name: 'boss', controller: c });
  };
  const startTutorial = () => {
    sound.unlock();
    setScreen({ name: 'tutorial', controller: new TutorialController({ name: settings.name || pa.session?.username || 'Vous', avatar: settings.avatar, photo: pa.photo }) });
  };

  const view = (() => { switch (screen.name) {
    case 'home':
      return <Home
        profile={profile} pa={pa} avatar={settings.avatar} displayName={settings.name} onShop={() => setScreen({ name: 'shop' })}
        onAccount={() => setScreen({ name: 'account' })} onLogin={() => setScreen({ name: 'account', tab: 'login' })} onLeaderboard={() => setScreen({ name: 'leaderboard' })}
        onSolo={() => setScreen({ name: 'solo-setup' })}
        onOnline={() => setScreen({ name: 'hub', tab: 'tables' })}
        onQuick={() => { sound.unlock(); setScreen({ name: 'online', mode: { kind: 'quick' } }); }}
        onTournaments={() => setScreen({ name: 'hub', tab: 'tournois' })}
        onRules={() => setScreen({ name: 'rules' })}
        onSettings={() => setScreen({ name: 'settings' })}
        onSandbox={() => setScreen({ name: 'sandbox' })}
        onLegal={() => setScreen({ name: 'legal', back: { name: 'home' } })}
        onPass={() => setScreen({ name: 'pass' })}
        onChallenge={() => { sound.unlock(); setScreen({ name: 'challenge' }); }}
        onBoss={startBoss}
        onParty={() => setScreen({ name: 'party-setup' })}
        onClub={() => setScreen({ name: 'club' })}
        onAlbum={() => setScreen({ name: 'album' })}
        onRecap={() => setScreen({ name: 'recap' })}
        onTutorial={startTutorial}
        onStats={() => setScreen({ name: 'stats' })}
        onCollection={() => setScreen({ name: 'collection' })}
        onDuels={() => setScreen({ name: 'duels' })}
        onFriends={() => setScreen({ name: 'friends' })}
        onMessages={() => setScreen({ name: 'messages' })}
        onChangelog={() => setScreen({ name: 'changelog' })}
        onCards={() => setScreen({ name: 'cf' })}
        onAdmin={() => setScreen({ name: 'admin' })}
        onModeration={() => setScreen({ name: 'moderation' })}
        settings={settings} onChangeSettings={setSettings}
        onJoinRoom={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })}
        onJoinScheduled={(code, pay) => setScreen({ name: 'tournament', mode: { kind: 'join', code, pay } })}
        onDuelPlay={(duel) => { sound.unlock(); setScreen({ name: 'duel', duel }); }}
        openNotifs={openNotifs}
        resume={resume} onResume={() => setScreen(resume?.tournament ? { name: 'tournament', mode: { kind: 'resume' } } : { name: 'online', mode: { kind: 'resume' } })} />;
    case 'hub':
      return <OnlineHub tab={screen.tab} settings={settings} onSettings={setSettings} pa={pa} onBack={home}
        onJoinRoom={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })}
        onJoinTournament={(code) => setScreen({ name: 'tournament', mode: { kind: 'join', code } })}
        onCreateRoom={() => setScreen({ name: 'online', mode: { kind: 'create' } })}
        onQuick={() => setScreen({ name: 'online', mode: { kind: 'quick' } })}
        onCreateTournament={() => setScreen({ name: 'tournament', mode: { kind: 'create' } })}
        onWatch={(code) => setScreen({ name: 'watch', code, back: { name: 'hub', tab: 'tables' } })}
        onJoinScheduled={(code, pay) => setScreen({ name: 'tournament', mode: { kind: 'join', code, pay } })}
        onAccount={() => setScreen({ name: 'account' })} />;
    case 'watch':
      return <SpectateFlow key={screen.code} code={screen.code} settings={settings} onSettings={setSettings} pa={pa}
        onExit={() => (screen.back.name === 'home' ? home() : setScreen(screen.back))} />;
    case 'tournament':
      return <TournamentFlow mode={screen.mode} settings={settings} onSettings={setSettings} onExit={home} onCancel={() => setScreen({ name: 'hub', tab: 'tournois' })}
        appearance={profile.equipped} onGameEnd={pa.onGameEnd} pa={pa} />;
    case 'solo-setup':
      return <SoloSetup settings={settings} onBack={home} onStart={startSolo} />;
    case 'solo':
      return <GameScreen controller={screen.controller} personas={screen.personas} settings={settings} onSettings={setSettings} onExit={home}
        appearance={profile.equipped} onGameStart={pa.onSoloStart} pa={pa}
        onGameEnd={(st, ctx) => pa.onGameEnd(st, screen.controller.meId, ctx)} />;
    case 'online':
      return <OnlineFlow mode={screen.mode} settings={settings} onSettings={setSettings} onExit={home} onCancel={() => setScreen({ name: 'hub', tab: 'tables' })}
        appearance={profile.equipped} onGameEnd={pa.onGameEnd} auth={pa.token} onServerReward={pa.onServerReward} pa={pa} />;
    case 'rules':
      return <RulesScreen onBack={home} />;
    case 'settings':
      return <SettingsScreen settings={settings} onChange={setSettings} onBack={screen.from === 'cf' ? () => setScreen({ name: 'cf' }) : home} />;
    case 'sandbox':
      return <Sandbox settings={settings} appearance={profile.equipped} trail={profile.fx?.trainee} fete={profile.fx?.fete} tryFx={screen.tryFx}
        onSettings={setSettings} onBack={screen.tryFx ? () => setScreen({ name: 'collection' }) : home} />;
    case 'shop':
      return <ShopScreen profile={profile} settings={settings} onBuy={pa.buyItem} onEquip={pa.equipItem} onBack={home} />;
    case 'account':
      return <AccountScreen key={screen.tab ?? 'register'} initial={screen.tab} pa={pa} onBack={home} onPrivacy={() => setScreen({ name: 'legal', back: { name: 'account' } })} />;
    case 'tutorial':
      return <TutorialScreen controller={screen.controller} settings={settings} onSettings={setSettings} onExit={home} appearance={profile.equipped} pa={pa} />;
    case 'boss': {
      const c = screen.controller;
      const personas = Object.fromEntries(c.getMeta().filter((m) => m.isBot).map((m, i) => [m.id, PERSONAS.find((p) => p.name === m.name) ?? PERSONAS[i]]));
      return <GameScreen controller={c} personas={personas} settings={settings} onSettings={setSettings} onExit={home}
        appearance={profile.equipped} onGameStart={pa.onSoloStart} pa={pa} bossId={c.boss.id}
        onGameEnd={(st, ctx) => pa.onGameEnd(st, c.meId, ctx)} />;
    }
    case 'party-setup':
      return <PartySetup settings={settings} onBack={home} onStart={(kind, names, cfg) => setScreen(kind === 'referee'
        ? { name: 'referee', names, config: cfg } : { name: 'party', controller: new PartyController(cfg, names) })} />;
    case 'party':
      return <PartyGame controller={screen.controller} settings={settings} onSettings={setSettings} onExit={home} appearance={profile.equipped} />;
    case 'referee':
      return <RefereeScreen names={screen.names} config={screen.config} onExit={home} />;
    case 'club':
      return <ClubScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} />;
    case 'album':
      return <AlbumScreen pa={pa} onBack={home} />;
    case 'recap':
      return <RecapScreen pa={pa} onBack={home} />;
    case 'challenge':
      return <ChallengeScreen pa={pa} settings={settings} appearance={profile.equipped} onBack={home} />;
    case 'pass':
      return <PassScreen pa={pa} onBack={home} />;
    case 'changelog':
      return <ChangelogScreen onBack={home} />;
    case 'cf':
      return <CfMode key={JSON.stringify(screen.pending ?? null)} pending={screen.pending} pa={pa} settings={settings} onSettings={setSettings} avatar={settings.avatar} displayName={settings.name}
        onHome={home} onMessages={() => setScreen({ name: 'messages', from: 'cf' })} onFriends={() => setScreen({ name: 'friends', from: 'cf' })}
        onAccount={() => setScreen({ name: 'account' })} onLogin={() => setScreen({ name: 'account', tab: 'login' })}
        onDuelPlay={(duel) => { sound.unlock(); setScreen({ name: 'duel', duel }); }} onDuels={() => setScreen({ name: 'duels' })}
        onOpenSettings={() => setScreen({ name: 'settings', from: 'cf' })} onAdmin={() => setScreen({ name: 'admin', from: 'cf' })} onModeration={() => setScreen({ name: 'moderation', from: 'cf' })} />;
    case 'friends':
      return <FriendsScreen pa={pa} onBack={screen.from === 'cf' ? () => setScreen({ name: 'cf' }) : home}
        onCfChallenge={screen.from === 'cf' ? (u) => setScreen({ name: 'cf', pending: { challenge: u } }) : undefined}
        onCfWatch={screen.from === 'cf' ? (c) => setScreen({ name: 'cf', pending: { watch: c } }) : undefined} onAccount={() => setScreen({ name: 'account' })} onJoin={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })}
        onInvite={(username) => setScreen({ name: 'online', mode: { kind: 'create', invite: username } })}
        onMessage={(username) => setScreen({ name: 'messages', with: username })}
        onWatch={(code) => setScreen({ name: 'watch', code, back: { name: 'friends' } })} />;
    case 'messages':
      return <MessagesScreen key={screen.with ?? ''} pa={pa} initial={screen.with} onBack={screen.from === 'cf' ? () => setScreen({ name: 'cf' }) : home} onAccount={() => setScreen({ name: 'account' })} />;
    case 'duels':
      return <DuelsScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} onPlay={(duel) => { sound.unlock(); setScreen({ name: 'duel', duel }); }} />;
    case 'duel':
      return <ChallengeScreen key={screen.duel.id} pa={pa} settings={settings} appearance={profile.equipped} duel={screen.duel} onBack={() => setScreen({ name: 'duels' })} />;
    case 'collection':
      return <CollectionScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} onTry={(fx) => setScreen({ name: 'sandbox', tryFx: fx })} />;
    case 'stats':
      return <StatsScreen pa={pa} onBack={home} onAdmin={() => setScreen({ name: 'admin' })} />;
    case 'admin':
      return <AdminDashboard pa={pa} onBack={() => setScreen(screen.from === 'cf' ? { name: 'cf' } : { name: 'stats' })} />;
    case 'moderation':
      return <ModerationScreen pa={pa} onBack={screen.from === 'cf' ? () => setScreen({ name: 'cf' }) : home} />;
    case 'legal':
      return <LegalScreen onBack={() => (screen.back.name === 'home' ? home() : setScreen(screen.back))} />;
    case 'leaderboard':
      return <LeaderboardScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} />;
  } })();
  // Invitation d'un ami : bandeau partout, sauf quand on est déjà à une table en ligne.
  const atTable = screen.name === 'online' || screen.name === 'tournament' || screen.name === 'watch';
  return (
    <>
      <Suspense fallback={<div className="screen-loading" role="status" aria-label="Chargement…"><span className="spinner" aria-hidden /></div>}>{view}</Suspense>
      {!STANDALONE && <FriendOnlineToast pa={pa} />}
      {!STANDALONE && !atTable && screen.name !== 'cf' && <CfChallengeBanner pa={pa} onOpen={() => setScreen({ name: 'cf' })} />}
      {!STANDALONE && !atTable && <InviteBanner pa={pa} onJoin={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })} />}
    </>
  );
}
