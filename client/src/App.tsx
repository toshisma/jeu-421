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
import { feteBoss } from '../../shared/progress/fetes';
import { fetePersonas } from './fetes/personas';
import { today } from '../../shared/progress/quests';
import { PartyController } from './game/party';
import { TutorialController } from './game/tutorial';
import { didWin, titleLabel } from '../../shared/progress/profile';
import { accessoryEmoji } from '../../shared/progress/catalog';
import { AccountScreen, LeaderboardScreen } from './ui/AccountScreens';
import { RulesScreen, Sandbox, SettingsScreen, SoloSetup, STANDALONE } from './ui/Screens';
import { Home } from './ui/Home';
import { ClassicMenu } from './ui/ClassicMenu';
import { StatsScreen } from './ui/StatsScreen';
import { CollectionScreen } from './ui/DiceCollection';
import { DuelsScreen } from './ui/Social';
import type { DuelPlay } from './ui/ChallengeScreen';
import { restartPresence, setPresence, startPresence } from './presence';
import { MessagesScreen } from './ui/Messages';
import { connectMessages } from './messages';
import { cfModeParam, courtisanModeParam } from './cfLink';
import { keptLangSearch, tr, useLang } from './i18n/lang';
import { loadDmSession } from './dixmille/online';
import type { DmPending } from './dixmille/DixMille';
import { linkVisitor, trackVisit } from './visit';
import { askConfirm } from './ui/confirm';
import { CfChallengeBanner } from './cards/ChallengeBanner';
import { lazyScreen, saveData, whenIdle } from './lazy';
import { BottomNav, NavSheets, discordPending, type NavActions, type NavTab, type PlusSheet } from './ui/BottomNav';
import { confirmLeave, useInGame } from './ui/navGuard';
import { useNotifications } from './ui/Social';
import { useDiscord } from './ui/Discord';
import { changelogUnseen } from './ui/Changelog';
import { loadTrayScene } from './ui/DiceTray';
import { INVITE_DELAY_MS, inviteDue, lastInviteClosed, loadWelcomeGift, markInviteClosed, onGuestInvite, saveWelcomeGift, type InviteGame, type WelcomeGift } from './ui/guestInvite';
import { syncPushLang } from './push';
import type { TdcController } from './comptoirs/controller';
import { tdcBistro, tdcFactsFrom, type TdcBistro, type TdcProgress } from '../../shared/progress/comptoirs';

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
/** Tournée des comptoirs (carrière solo du 421). */
const TourneeScreen = lazyScreen(() => import('./comptoirs/Tournee'), 'TourneeScreen');
const TdcEndPanel = lazyScreen(() => import('./comptoirs/Tournee'), 'TdcEndPanel');
/** Coups Fourrés, le mode cartes : tout le mode est chargé à part, seulement quand on l'ouvre. */
const CfMode = lazyScreen(() => import('./cards/CfMode'), 'CfMode');
const DixMilleMode = lazyScreen(() => import('./dixmille/DixMille'), 'DixMilleMode');
/** Invitation à créer un compte (après une partie) et cadeau de bienvenue : chargés quand ils s'affichent. */
const GuestInvitePopup = lazyScreen(() => import('./ui/GuestInvite'), 'GuestInvitePopup');
const WelcomeGiftPopup = lazyScreen(() => import('./ui/GuestInvite'), 'WelcomeGiftPopup');
/** Préchargés en arrière-plan une fois l'accueil affiché (les plus utilisés d'abord). */
const LIKELY = [GameScreen, OnlineHub, OnlineFlow, TournamentFlow, ShopScreen, SpectateFlow, TutorialScreen, PartySetup, ClubScreen, AlbumScreen];

/** D'où l'on vient (pour revenir au bon menu) : menu principal, ou le menu d'un des trois jeux. */
type Back = 'home' | 'classic' | 'cf' | 'dixmille';
/** Écrans du 421 classique (la barre y ramène au menu du 421 en retour). */
const CLASSIC_SCREENS = new Set(['classic', 'solo-setup', 'solo', 'hub', 'online', 'watch', 'tournament', 'rules', 'tutorial', 'boss', 'party-setup', 'party', 'referee', 'album', 'challenge', 'tdc', 'tdc-game']);

type Screen =
  | { name: 'home' }
  | { name: 'classic' }
  | { name: 'solo-setup' }
  | { name: 'solo'; controller: LocalController; personas: Record<string, Persona> }
  | { name: 'hub'; tab: HubTab }
  | { name: 'friends'; from?: Back }
  | { name: 'messages'; with?: string; from?: Back }
  | { name: 'dixmille'; pending?: DmPending; reset?: number }
  | { name: 'cf'; pending?: { challenge?: string; watch?: string; tournoi?: boolean; boosters?: boolean }; reset?: number }
  | { name: 'changelog' }
  | { name: 'online'; mode: OnlineMode }
  | { name: 'watch'; code: string; back: Screen }
  | { name: 'tournament'; mode: TournamentMode }
  | { name: 'rules' }
  | { name: 'settings'; from?: Back }
  | { name: 'sandbox'; tryFx?: string; from?: Back }
  | { name: 'shop'; from?: Back }
  | { name: 'account'; tab?: 'login' | 'register'; back?: Back }
  | { name: 'leaderboard'; from?: Back }
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
  | { name: 'stats'; from?: Back }
  | { name: 'collection'; from?: Back; open?: boolean }
  | { name: 'duels' }
  | { name: 'duel'; duel: DuelPlay }
  | { name: 'admin'; from?: 'stats' }
  | { name: 'moderation' }
  | { name: 'tdc' }
  | { name: 'tdc-game'; controller: TdcController };

/**
 * Nettoie l'adresse (lien d'invitation, page de confidentialité) sans recharger la page.
 * Ignoré quand le jeu tourne hors d'un site web (fichier ouvert directement, aperçu intégré).
 */
function cleanUrl() {
  if (!/^https?:$/.test(location.protocol)) return;
  try { history.replaceState(null, '', `/${keptLangSearch()}`); } catch { /* aperçu intégré : rien à nettoyer */ }
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
  // Le Courtisan : invitation à une table (/?courtisan=CODE), lien direct des pages d'aide (/?mode=courtisan).
  const courtInvite = useMemo(() => { const v = new URLSearchParams(location.search).get('courtisan'); return v && /^[A-Za-z0-9]{5}$/.test(v) ? v.toUpperCase() : null; }, []);
  const openCourt = useMemo(() => { const v = courtisanModeParam(location.search); if (v) cleanUrl(); return v; }, []);
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
      : courtInvite ? { name: 'dixmille', pending: { join: courtInvite } }
      : openCourt ? { name: 'dixmille' }
      : watchLink ? { name: 'watch', code: watchLink.toUpperCase(), back: { name: 'home' } }
      : invite ? { name: 'online', mode: { kind: 'join', code: invite.toUpperCase() } }
        : tInvite && settings.name ? { name: 'tournament', mode: { kind: 'join', code: tInvite.toUpperCase() } }
          : tInvite || tSched ? { name: 'hub', tab: 'tournois' } : openCf ? { name: 'cf', ...(openCf === 'tournoi' ? { pending: { tournoi: true } } : {}) } : openDefi ? { name: 'challenge' } : openPm ? { name: 'messages', with: openPm } : { name: 'home' });
  const [resume, setResume] = useState(loadSession);
  const [courtResume, setCourtResume] = useState(loadDmSession);
  /** Rejoindre une table : du 421, ou du Courtisan (`game`). */
  const joinTable = (code: string, game?: string) => setScreen(game === 'courtisan' ? { name: 'dixmille', pending: { join: code } } : { name: 'online', mode: { kind: 'join', code, auto: true } });
  // Profil : invité (sur l'appareil) ou compte (sur le serveur). Pas de comptes sans serveur.
  const pa = useProfile(!STANDALONE);
  // Signe de vie : un compte avec le jeu ouvert apparaît « en ligne » chez ses amis.
  const firstToken = useRef(true);
  useEffect(() => { if (firstToken.current) { firstToken.current = false; return; } restartPresence(); }, [pa.token]);
  // Notifications (demandes d'amis, défis…) : chargées régulièrement, pour l'accueil et la barre du bas.
  // (Ce chargement sert aussi de signe de vie du compte.)
  const notif = useNotifications(pa);
  const discord = useDiscord(pa);
  const { profile } = pa;
  // Messages privés : réception en direct tant que le compte a le jeu ouvert.
  useEffect(() => { if (!STANDALONE) connectMessages(pa.token ?? null); }, [pa.token]);

  const lang = useLang();
  useEffect(() => {
    if (screen.name !== 'dixmille' || lang === 'fr') return;
    const before = document.title;
    document.title = tr('title.courtier');
    return () => { document.title = before; };
  }, [screen.name, lang]);

  // Notifications push : l'appareil suit la langue choisie.
  useEffect(() => { if (!STANDALONE && pa.token) void syncPushLang(pa.token); }, [lang, pa.token]);

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
      void askConfirm((e as CustomEvent<string>).detail || tr('app.votre_compte_est_suspendu'), tr('app.compris'), tr('app.fermer')).then(() => { shown = false; setScreen({ name: 'home' }); });
    };
    window.addEventListener('421:banned', onBan);
    return () => window.removeEventListener('421:banned', onBan);
  }, [pa.logout]);
  useEffect(() => {
    setPresence(screen.name === 'solo' || screen.name === 'boss' || screen.name === 'tdc-game' || screen.name === 'dixmille' ? 'solo' : screen.name === 'online' || screen.name === 'tournament' ? 'online' : 'menu', screen.name);
  }, [screen.name]);

  // Une fois l'accueil affiché : la 3D puis les écrans les plus probables se chargent en arrière-plan.
  useEffect(() => {
    if (saveData()) return;
    let i = 0;
    const next = () => { if (i < LIKELY.length) { LIKELY[i++].preload(); whenIdle(next); } };
    const t = setTimeout(() => whenIdle(() => { void loadTrayScene().catch(() => {}); whenIdle(next); }), 1500);
    return () => clearTimeout(t);
  }, []);

  const refreshResume = () => {
    if (invite || tInvite || watchLink || courtInvite || location.pathname.startsWith('/confidentialite')) cleanUrl();
    setResume(loadSession());
    setCourtResume(loadDmSession());
  };
  /** Menu principal. */
  const home = () => { refreshResume(); setScreen({ name: 'home' }); };
  /** Menu du 421 classique (retour de toutes ses parties et de ses écrans). */
  const classic = () => { refreshResume(); setScreen({ name: 'classic' }); };
  /** Retour au menu d'où l'on venait. */
  const backTo = (from?: Back) => () => (from === 'cf' ? setScreen({ name: 'cf' }) : from === 'dixmille' ? setScreen({ name: 'dixmille' }) : from === 'classic' ? classic() : home());

  const startSolo = (cfg: GameConfig, opponents: Opponent[]) => {
    sound.unlock();
    const c = new LocalController(cfg, opponents, { name: settings.name || pa.session?.username || tr('g421.guestName'), avatar: settings.avatar, photo: pa.photo, account: pa.session?.username, title: titleLabel(profile.title) ?? undefined, accessory: accessoryEmoji(profile.equipped.accessoire) || undefined });
    const personas = Object.fromEntries(opponents.map((o, i) => [`ia-${i}`, o.persona]));
    setScreen({ name: 'solo', controller: c, personas });
  };

  const meInfo = () => ({ name: settings.name || pa.session?.username || tr('g421.guestName'), avatar: settings.avatar, photo: pa.photo, account: pa.session?.username,
    title: titleLabel(profile.title) ?? undefined, accessory: accessoryEmoji(profile.equipped.accessoire) || undefined });
  const startBoss = () => {
    sound.unlock();
    const c = new BossController(bossOfWeek(today()), meInfo());
    setScreen({ name: 'boss', controller: c });
  };
  /** Adversaire spécial de Saint-Nicolas / des fêtes (pendant l'événement seulement). */
  const startFeteBoss = () => {
    const b = feteBoss(today());
    if (!b) return;
    sound.unlock();
    setScreen({ name: 'boss', controller: new BossController(b.def, meInfo(), fetePersonas(b.cast)) });
  };

  // --- Tournée des comptoirs -------------------------------------------------------------------------
  /** Progression au début de la partie de la Tournée (pour montrer les étoiles nouvelles à la fin). */
  const [tdcBefore, setTdcBefore] = useState<TdcProgress>({});
  const [tdcPending, setTdcPending] = useState(false);
  const startTdc = (b: TdcBistro) => {
    sound.unlock();
    void import('./comptoirs/controller').then(({ TdcController }) => setScreen({ name: 'tdc-game', controller: new TdcController(b, meInfo()) }));
  };
  const startTutorial = () => {
    sound.unlock();
    setScreen({ name: 'tutorial', controller: new TutorialController({ name: settings.name || pa.session?.username || tr('g421.guestName'), avatar: settings.avatar, photo: pa.photo }) });
  };
  const resumeGame = () => setScreen(resume?.tournament ? { name: 'tournament', mode: { kind: 'resume' } } : resume ? { name: 'online', mode: { kind: 'resume' } } : { name: 'dixmille', pending: { resume: true } });
  const onJoinScheduled = (code: string, pay: boolean) => setScreen({ name: 'tournament', mode: { kind: 'join', code, pay } });

  // --- Invitation à créer un compte (invités, après une partie) et cadeau de bienvenue -------------
  const [guestInvite, setGuestInvite] = useState<InviteGame | null>(null);
  const isAccountRef = useRef(pa.isAccount);
  isAccountRef.current = pa.isAccount;
  useEffect(() => {
    if (STANDALONE) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onGuestInvite((game) => {
      clearTimeout(t);
      // Un peu après l'écran de fin, le temps de voir le résultat ; revérifié au moment d'afficher.
      t = setTimeout(() => {
        if (inviteDue({ isAccount: isAccountRef.current, server: !STANDALONE, lastClosed: lastInviteClosed(), now: Date.now() })) setGuestInvite(game);
      }, INVITE_DELAY_MS);
    });
    return () => { off(); clearTimeout(t); };
  }, []);
  useEffect(() => { if (pa.isAccount) setGuestInvite(null); }, [pa.isAccount]);
  const closeInvite = () => { markInviteClosed(); setGuestInvite(null); };
  const [gift, setGift] = useState<WelcomeGift | null>(loadWelcomeGift);
  useEffect(() => {
    const f = () => setGift(loadWelcomeGift());
    window.addEventListener('421:cadeau', f);
    return () => window.removeEventListener('421:cadeau', f);
  }, []);

  // --- Barre du bas (tous les écrans) -------------------------------------------------------------
  const inGame = useInGame();
  const [plus, setPlus] = useState<PlusSheet | null>(null);
  /** Le menu de jeu d'où l'on vient (retour des écrans communs ouverts par la barre). */
  const ctx: Back = 'from' in screen && screen.from && screen.from !== 'stats' ? screen.from
    : screen.name === 'cf' ? 'cf' : screen.name === 'dixmille' ? 'dixmille'
      : CLASSIC_SCREENS.has(screen.name) ? 'classic' : 'home';
  /** Changer d'écran par la barre : d'abord la règle de départ de l'écran affiché (partie en cours…). */
  const go = (f: () => void) => () => { void confirmLeave().then((ok) => { if (!ok) return; setPlus(null); refreshResume(); f(); }); };
  const nav: NavActions = {
    onHome: go(() => setScreen({ name: 'home' })),
    onFriends: go(() => setScreen({ name: 'friends', from: ctx })),
    onCollection: (open) => go(() => setScreen({ name: 'collection', from: ctx, open }))(),
    onShop: go(() => setScreen({ name: 'shop', from: ctx })),
    onMessages: go(() => setScreen({ name: 'messages', from: ctx })),
    onClassic: go(() => setScreen({ name: 'classic' })),
    // Déjà dans ce jeu (sous-écran, partie) : retour à son menu.
    onCards: go(() => setScreen({ name: 'cf', reset: Date.now() })),
    onDixMille: go(() => setScreen({ name: 'dixmille', reset: Date.now() })),
    onAccount: go(() => setScreen({ name: 'account' })),
    onLogin: go(() => setScreen({ name: 'account', tab: 'login' })),
    onSettings: go(() => setScreen({ name: 'settings', from: ctx })),
    onSandbox: go(() => setScreen({ name: 'sandbox', from: ctx })),
    onLegal: go(() => setScreen({ name: 'legal', back: { name: 'home' } })),
    onPass: go(() => setScreen({ name: 'pass' })),
    onStats: go(() => setScreen({ name: 'stats', from: ctx })),
    onClub: go(() => setScreen({ name: 'club' })),
    onDuels: go(() => setScreen({ name: 'duels' })),
    onRecap: go(() => setScreen({ name: 'recap' })),
    onChangelog: go(() => setScreen({ name: 'changelog' })),
    onAdmin: go(() => setScreen({ name: 'admin' })),
    onModeration: go(() => setScreen({ name: 'moderation' })),
    onLeaderboard: go(() => setScreen({ name: 'leaderboard', from: ctx })),
    onRules: go(() => setScreen({ name: 'rules' })),
    onTutorial: go(startTutorial),
    onTournaments: go(() => setScreen({ name: 'hub', tab: 'tournois' })),
    onAlbum: go(() => setScreen({ name: 'album' })),
    onParty: go(() => setScreen({ name: 'party-setup' })),
    onOnline: go(() => setScreen({ name: 'hub', tab: 'tables' })),
    onChallenge: go(() => { sound.unlock(); setScreen({ name: 'challenge' }); }),
  };
  const activeTab: NavTab = screen.name === 'home' ? 'home' : screen.name === 'friends' || screen.name === 'messages' ? 'friends'
    : screen.name === 'collection' ? 'collection' : screen.name === 'shop' ? 'shop' : null;
  // Les compteurs de la barre (demandes d'amis…) suivent chaque changement d'écran.
  const firstScreen = useRef(true);
  useEffect(() => { if (firstScreen.current) { firstScreen.current = false; return; } notif.reload(); setPlus(null); }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = (() => { switch (screen.name) {
    case 'home':
      return <Home
        profile={profile} pa={pa} avatar={settings.avatar} displayName={settings.name} settings={settings} onChangeSettings={setSettings}
        onClassic={classic} onCards={() => setScreen({ name: 'cf' })} onDixMille={() => setScreen({ name: 'dixmille' })}
        onShop={() => setScreen({ name: 'shop' })} onAccount={() => setScreen({ name: 'account' })} onLogin={() => setScreen({ name: 'account', tab: 'login' })}
        onCollection={(open) => setScreen({ name: 'collection', open })} onFriends={() => setScreen({ name: 'friends' })} onMessages={() => setScreen({ name: 'messages' })}
        onSettings={() => setScreen({ name: 'settings' })} onSandbox={() => setScreen({ name: 'sandbox' })} onLegal={() => setScreen({ name: 'legal', back: { name: 'home' } })}
        onPass={() => setScreen({ name: 'pass' })} onStats={() => setScreen({ name: 'stats' })} onClub={() => setScreen({ name: 'club' })}
        onDuels={() => setScreen({ name: 'duels' })} onRecap={() => setScreen({ name: 'recap' })} onChangelog={() => setScreen({ name: 'changelog' })}
        onDuelPlay={(duel) => { sound.unlock(); setScreen({ name: 'duel', duel }); }} openNotifs={openNotifs}
        onAdmin={() => setScreen({ name: 'admin' })} onModeration={() => setScreen({ name: 'moderation' })}
        onLeaderboard={() => setScreen({ name: 'leaderboard' })} onRules={() => setScreen({ name: 'rules' })} onTutorial={startTutorial}
        onTournaments={() => setScreen({ name: 'hub', tab: 'tournois' })} onAlbum={() => setScreen({ name: 'album' })} onParty={() => setScreen({ name: 'party-setup' })}
        onOnline={() => setScreen({ name: 'hub', tab: 'tables' })} onChallenge={() => { sound.unlock(); setScreen({ name: 'challenge' }); }}
        onJoinScheduled={onJoinScheduled} notif={notif} discord={discord} onFeteBoss={startFeteBoss} onTournee={() => setScreen({ name: 'tdc' })}
        resume={resume ?? (courtResume ? { code: courtResume.code, courtisan: true } : null)} onResume={resumeGame} />;
    case 'classic':
      return <ClassicMenu profile={profile} pa={pa} settings={settings} onBack={home}
        onSolo={() => setScreen({ name: 'solo-setup' })}
        onOnline={() => setScreen({ name: 'hub', tab: 'tables' })}
        onQuick={() => { sound.unlock(); setScreen({ name: 'online', mode: { kind: 'quick' } }); }}
        onTournaments={() => setScreen({ name: 'hub', tab: 'tournois' })}
        onParty={() => setScreen({ name: 'party-setup' })}
        onRules={() => setScreen({ name: 'rules' })}
        onTutorial={startTutorial}
        onChallenge={() => { sound.unlock(); setScreen({ name: 'challenge' }); }}
        onBoss={startBoss}
        onFeteBoss={startFeteBoss}
        onTournee={() => setScreen({ name: 'tdc' })}
        onAlbum={() => setScreen({ name: 'album' })}
        onLeaderboard={() => setScreen({ name: 'leaderboard', from: 'classic' })}
        onStats={() => setScreen({ name: 'stats', from: 'classic' })}
        onAccount={() => setScreen({ name: 'account' })}
        onFriends={() => setScreen({ name: 'friends', from: 'classic' })}
        onJoinRoom={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })}
        onJoinScheduled={onJoinScheduled}
        resume={resume} onResume={resumeGame} />;
    case 'hub':
      return <OnlineHub tab={screen.tab} settings={settings} onSettings={setSettings} pa={pa} onBack={classic}
        onJoinRoom={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })}
        onJoinTournament={(code) => setScreen({ name: 'tournament', mode: { kind: 'join', code } })}
        onCreateRoom={() => setScreen({ name: 'online', mode: { kind: 'create' } })}
        onQuick={() => setScreen({ name: 'online', mode: { kind: 'quick' } })}
        onCreateTournament={() => setScreen({ name: 'tournament', mode: { kind: 'create' } })}
        onWatch={(code) => setScreen({ name: 'watch', code, back: { name: 'hub', tab: 'tables' } })}
        onJoinScheduled={onJoinScheduled}
        onAccount={() => setScreen({ name: 'account' })} />;
    case 'watch':
      return <SpectateFlow key={screen.code} code={screen.code} settings={settings} onSettings={setSettings} pa={pa}
        onExit={() => (screen.back.name === 'home' ? classic() : setScreen(screen.back))} />;
    case 'tournament':
      return <TournamentFlow mode={screen.mode} settings={settings} onSettings={setSettings} onExit={classic} onCancel={() => setScreen({ name: 'hub', tab: 'tournois' })}
        appearance={profile.equipped} onGameEnd={pa.onGameEnd} pa={pa} />;
    case 'solo-setup':
      return <SoloSetup settings={settings} onBack={classic} onStart={startSolo} />;
    case 'solo':
      return <GameScreen controller={screen.controller} personas={screen.personas} settings={settings} onSettings={setSettings} onExit={classic}
        appearance={profile.equipped} onGameStart={() => pa.onSoloStart()} pa={pa}
        onGameEnd={(st, ctx) => pa.onGameEnd(st, screen.controller.meId, ctx)} />;
    case 'online':
      return <OnlineFlow mode={screen.mode} settings={settings} onSettings={setSettings} onExit={classic} onCancel={() => setScreen({ name: 'hub', tab: 'tables' })}
        appearance={profile.equipped} onGameEnd={pa.onGameEnd} auth={pa.token} onServerReward={pa.onServerReward} pa={pa} />;
    case 'rules':
      return <RulesScreen onBack={classic} />;
    case 'settings':
      return <SettingsScreen settings={settings} onChange={setSettings} onBack={backTo(screen.from)} />;
    case 'sandbox':
      return <Sandbox settings={settings} appearance={profile.equipped} trail={profile.fx?.trainee} fete={profile.fx?.fete} tryFx={screen.tryFx}
        onSettings={setSettings} onBack={screen.tryFx ? () => setScreen({ name: 'collection', from: screen.from }) : backTo(screen.from)} />;
    case 'shop':
      return <ShopScreen profile={profile} settings={settings} onBuy={pa.buyItem} onEquip={pa.equipItem} onBack={backTo(screen.from)} />;
    case 'account':
      return <AccountScreen key={screen.tab ?? 'register'} initial={screen.tab} pa={pa} forCf={screen.back === 'cf'} onBack={screen.back ? backTo(screen.back) : home}
        onRegistered={screen.back ? backTo(screen.back) : undefined} onPrivacy={() => setScreen({ name: 'legal', back: { name: 'account' } })} />;
    case 'tutorial':
      return <TutorialScreen controller={screen.controller} settings={settings} onSettings={setSettings} onExit={classic} appearance={profile.equipped} pa={pa} />;
    case 'boss': {
      const c = screen.controller;
      return <GameScreen controller={c} personas={c.cast} settings={settings} onSettings={setSettings} onExit={classic}
        appearance={profile.equipped} onGameStart={() => pa.onSoloStart(c.boss.id)} pa={pa} bossId={c.boss.id}
        onGameEnd={(st, ctx) => pa.onGameEnd(st, c.meId, ctx)} />;
    }
    case 'tdc':
      return <TourneeScreen pa={pa} onBack={classic} onPlay={startTdc} />;
    case 'tdc-game': {
      const c = screen.controller, b = c.bistro;
      return <GameScreen controller={c} personas={c.personas} settings={settings} onSettings={setSettings} onExit={() => setScreen({ name: 'tdc' })}
        appearance={{ ...profile.equipped, ...b.look }} pa={pa}
        onGameStart={() => { setTdcBefore({ ...(pa.profile.tdc ?? {}) }); setTdcPending(false); pa.onSoloStart(undefined, b.id); }}
        onGameEnd={async (st, ctx) => {
          setTdcPending(true);
          const r = await pa.onGameEnd(st, c.meId, ctx);
          const won = didWin(st, c.meId);
          if (!pa.isAccount) pa.onTdcGuestEnd(b.id, tdcFactsFrom({ won, place: ctx.place, rounds: st.round, roundsLost: ctx.roundsLost, count421: ctx.count421, combos: ctx.combos, elapsedMs: (ctx.minutes ?? 0) * 60000 }));
          else if (!r) pa.refresh(); // plafond du jour atteint, réseau : les étoiles sont relues sur le serveur
          setTdcPending(false);
          return r;
        }}
        endExtra={tdcBistro(b.id) ? <Suspense fallback={null}><TdcEndPanel b={b} before={tdcBefore} now={profile.tdc ?? {}} pending={tdcPending} /></Suspense> : null} />;
    }
    case 'party-setup':
      return <PartySetup settings={settings} onBack={classic} onStart={(kind, names, cfg) => setScreen(kind === 'referee'
        ? { name: 'referee', names, config: cfg } : { name: 'party', controller: new PartyController(cfg, names) })} />;
    case 'party':
      return <PartyGame controller={screen.controller} settings={settings} onSettings={setSettings} onExit={classic} appearance={profile.equipped} />;
    case 'referee':
      return <RefereeScreen names={screen.names} config={screen.config} onExit={classic} />;
    case 'club':
      return <ClubScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} />;
    case 'album':
      return <AlbumScreen pa={pa} onBack={classic} />;
    case 'recap':
      return <RecapScreen pa={pa} onBack={home} />;
    case 'challenge':
      return <ChallengeScreen pa={pa} settings={settings} appearance={profile.equipped} onBack={classic} />;
    case 'pass':
      return <PassScreen pa={pa} onBack={home} />;
    case 'changelog':
      return <ChangelogScreen onBack={home} />;
    case 'dixmille':
      return <DixMilleMode key={`${JSON.stringify(screen.pending ?? null)}${screen.reset ?? ''}`} pending={screen.pending} onAccount={() => setScreen({ name: 'account', ...(lang !== 'fr' ? { back: 'dixmille' as const } : {}) })} pa={pa} settings={settings} onSettings={setSettings} onHome={home}
        onCollection={(open) => setScreen({ name: 'collection', from: 'dixmille', open })}
        displayName={settings.name} avatar={settings.avatar} />;
    case 'cf':
      return <CfMode key={`${JSON.stringify(screen.pending ?? null)}${screen.reset ?? ''}`} pending={screen.pending} pa={pa} settings={settings} onSettings={setSettings} avatar={settings.avatar} displayName={settings.name}
        onHome={home} onFriends={() => setScreen({ name: 'friends', from: 'cf' })} onBags={() => setScreen({ name: 'collection', from: 'cf', open: true })}
        onAccount={() => setScreen({ name: 'account', back: 'cf' })} onLogin={() => setScreen({ name: 'account', tab: 'login', back: 'cf' })} />;
    case 'friends':
      return <FriendsScreen pa={pa} onBack={backTo(screen.from)}
        onCfChallenge={(u) => setScreen({ name: 'cf', pending: { challenge: u } })}
        onCfWatch={(c) => setScreen({ name: 'cf', pending: { watch: c } })} onAccount={() => setScreen({ name: 'account' })} onJoin={joinTable}
        onInvite={(username) => setScreen({ name: 'online', mode: { kind: 'create', invite: username } })}
        onMessage={(username) => setScreen({ name: 'messages', with: username, from: screen.from })}
        onWatch={(code, game) => setScreen(game === 'courtisan' ? { name: 'dixmille', pending: { watch: code } } : { name: 'watch', code, back: { name: 'friends', from: screen.from } })} />;
    case 'messages':
      return <MessagesScreen key={screen.with ?? ''} pa={pa} initial={screen.with} onBack={backTo(screen.from)} onAccount={() => setScreen({ name: 'account' })} />;
    case 'duels':
      return <DuelsScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} onPlay={(duel) => { sound.unlock(); setScreen({ name: 'duel', duel }); }} />;
    case 'duel':
      return <ChallengeScreen key={screen.duel.id} pa={pa} settings={settings} appearance={profile.equipped} duel={screen.duel} onBack={() => setScreen({ name: 'duels' })} />;
    case 'collection':
      return <CollectionScreen key={screen.open ? 'ouvrir' : 'voir'} pa={pa} openNow={screen.open} onBack={backTo(screen.from)}
        onAccount={() => setScreen({ name: 'account' })} onTry={(fx) => setScreen({ name: 'sandbox', tryFx: fx, from: screen.from })} />;
    case 'stats':
      return <StatsScreen pa={pa} onBack={backTo(screen.from)} onAdmin={() => setScreen({ name: 'admin', from: 'stats' })} />;
    case 'admin':
      return <AdminDashboard pa={pa} onBack={() => (screen.from === 'stats' ? setScreen({ name: 'stats' }) : home())} />;
    case 'moderation':
      return <ModerationScreen pa={pa} onBack={home} />;
    case 'legal':
      return <LegalScreen onBack={() => (screen.back.name === 'home' ? home() : setScreen(screen.back))} />;
    case 'leaderboard':
      return <LeaderboardScreen pa={pa} onBack={backTo(screen.from)} onAccount={() => setScreen({ name: 'account' })} />;
  } })();
  // Invitation d'un ami : bandeau partout, sauf quand on est déjà à une table en ligne.
  const atTable = screen.name === 'online' || screen.name === 'tournament' || screen.name === 'watch' || screen.name === 'dixmille';
  // Cadeau de bienvenue : seulement pour ce compte, hors partie et hors des écrans où l'on ouvre déjà ses cadeaux.
  const showGift = !STANDALONE && pa.isAccount && !!gift && gift.user === pa.session?.username && !inGame && !guestInvite
    && screen.name !== 'account' && screen.name !== 'legal' && screen.name !== 'collection' && !(screen.name === 'cf' && screen.pending?.boosters);
  return (
    <div className={`app-shell${inGame ? ' in-game' : ''}`}>
      {/* Zone des écrans : tout ce qui s'y affiche (y compris les fenêtres) reste au-dessus de la barre. */}
      <div className="app-view">
        <Suspense fallback={<div className="screen-loading" role="status" aria-label={tr('app.chargement')}><span className="spinner" aria-hidden /></div>}>{view}</Suspense>
        {!STANDALONE && <FriendOnlineToast pa={pa} />}
        {!STANDALONE && !atTable && screen.name !== 'cf' && <CfChallengeBanner pa={pa} onOpen={go(() => setScreen({ name: 'cf' }))} />}
        {!STANDALONE && !atTable && <InviteBanner pa={pa} onJoin={(code, game) => go(() => joinTable(code, game))()} />}
        {guestInvite && !pa.isAccount && (
          <Suspense fallback={null}>
            <GuestInvitePopup game={guestInvite} onClose={closeInvite}
              onCreate={() => { const back: Back = guestInvite === 'cf' ? 'cf' : guestInvite === 'courtisan' ? 'dixmille' : 'classic'; markInviteClosed(); setGuestInvite(null); go(() => setScreen({ name: 'account', tab: 'register', back }))(); }} />
          </Suspense>
        )}
        {showGift && gift && (
          <Suspense fallback={null}>
            <WelcomeGiftPopup gift={gift} bags={profile.bags ?? 0} onClose={() => saveWelcomeGift(null)}
              onBags={() => { saveWelcomeGift({ ...gift, bags: false }); go(() => setScreen({ name: 'collection', from: ctx, open: true }))(); }}
              onBoosters={() => { saveWelcomeGift({ ...gift, boosters: false }); go(() => setScreen({ name: 'cf', pending: { boosters: true }, reset: Date.now() }))(); }} />
          </Suspense>
        )}
        <NavSheets sheet={plus} setSheet={setPlus} a={nav} pa={pa} settings={settings} onChangeSettings={setSettings} discord={discord.discord}
          displayName={settings.name} avatar={settings.avatar} />
      </div>
      <BottomNav active={plus === 'menu' ? null : activeTab} compact={inGame} plusOpen={plus === 'menu'} pa={pa} a={nav}
        requests={notif.notifs?.requests?.length ?? 0} bags={profile.bags ?? 0}
        plusDot={changelogUnseen() || discordPending(pa, discord.discord)}
        onPlus={() => setPlus((p) => (p === 'menu' ? null : 'menu'))} />
    </div>
  );
}
