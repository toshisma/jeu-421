import { useEffect, useMemo, useState } from 'react';
import type { GameConfig } from '../../shared/config';
import { sound } from './audio/sound';
import { setHaptics } from './audio/haptics';
import { LocalController, type Opponent } from './game/localController';
import type { Persona } from './game/personas';
import { loadSession, loadSettings, saveSettings, type Settings } from './settings';
import { useProfile } from './account/useProfile';
import { GameScreen } from './ui/GameScreen';
import { OnlineFlow, type OnlineMode } from './ui/OnlineFlow';
import { OnlineHub, type HubTab } from './ui/OnlineHub';
import { TournamentFlow, type TournamentMode } from './ui/TournamentFlow';
import { LegalScreen } from './ui/LegalScreen';
import { PassScreen } from './ui/Progression';
import { TutorialScreen } from './ui/TutorialScreen';
import { ChallengeScreen } from './ui/ChallengeScreen';
import { BossController } from './game/boss';
import { bossOfWeek } from '../../shared/progress/boss';
import { today } from '../../shared/progress/quests';
import { PERSONAS } from './game/personas';
import { PartyController } from './game/party';
import { PartyGame, PartySetup, RefereeScreen } from './ui/PartyScreens';
import { ClubScreen } from './ui/ClubScreen';
import { AlbumScreen, RecapScreen } from './ui/Collection';
import { TutorialController } from './game/tutorial';
import { titleLabel } from '../../shared/progress/profile';
import { accessoryEmoji } from '../../shared/progress/catalog';
import { ShopScreen } from './ui/ShopScreen';
import { AccountScreen, LeaderboardScreen } from './ui/AccountScreens';
import { Home, RulesScreen, Sandbox, SettingsScreen, SoloSetup, STANDALONE } from './ui/Screens';
import { AdminScreen, StatsScreen } from './ui/StatsScreen';
import { setPresence, startPresence } from './presence';

type Screen =
  | { name: 'home' }
  | { name: 'solo-setup' }
  | { name: 'solo'; controller: LocalController; personas: Record<string, Persona> }
  | { name: 'hub'; tab: HubTab }
  | { name: 'online'; mode: OnlineMode }
  | { name: 'tournament'; mode: TournamentMode }
  | { name: 'rules' }
  | { name: 'settings' }
  | { name: 'sandbox' }
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
  | { name: 'admin' };

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
  // Lien de parrainage : le pseudo du parrain est retenu pour la création du compte.
  useMemo(() => {
    const p = new URLSearchParams(location.search).get('parrain');
    if (p) { try { localStorage.setItem('421.parrain', p.slice(0, 20)); } catch { /* */ } cleanUrl(); }
  }, []);
  const [screen, setScreen] = useState<Screen>(() =>
    location.pathname.startsWith('/confidentialite') ? { name: 'legal', back: { name: 'home' } }
    : STANDALONE ? { name: 'home' }
      : invite ? { name: 'online', mode: { kind: 'join', code: invite.toUpperCase() } }
        : tInvite && settings.name ? { name: 'tournament', mode: { kind: 'join', code: tInvite.toUpperCase() } }
          : tInvite ? { name: 'hub', tab: 'tournois' } : { name: 'home' });
  const [resume, setResume] = useState(loadSession);
  // Profil : invité (sur l'appareil) ou compte (sur le serveur). Pas de comptes sans serveur.
  const pa = useProfile(!STANDALONE);
  const { profile } = pa;

  const setSettings = (s: Settings) => { setSettingsState(s); saveSettings(s); };
  useEffect(() => { sound.configure({ volume: settings.volume, muted: settings.muted }); }, [settings.volume, settings.muted]);
  useEffect(() => { setHaptics(settings.vibrate); }, [settings.vibrate]);
  // Présence (statistiques publiques) : seulement avec un serveur.
  useEffect(() => { if (!STANDALONE) startPresence(); }, []);
  useEffect(() => {
    setPresence(screen.name === 'solo' || screen.name === 'boss' ? 'solo' : screen.name === 'online' || screen.name === 'tournament' ? 'online' : 'menu');
  }, [screen.name]);

  const home = () => {
    if (invite || tInvite || location.pathname.startsWith('/confidentialite')) cleanUrl();
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

  switch (screen.name) {
    case 'home':
      return <Home
        profile={profile} pa={pa} avatar={settings.avatar} displayName={settings.name} onShop={() => setScreen({ name: 'shop' })}
        onAccount={() => setScreen({ name: 'account' })} onLogin={() => setScreen({ name: 'account', tab: 'login' })} onLeaderboard={() => setScreen({ name: 'leaderboard' })}
        onSolo={() => setScreen({ name: 'solo-setup' })}
        onOnline={() => setScreen({ name: 'hub', tab: 'tables' })}
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
        resume={resume} onResume={() => setScreen(resume?.tournament ? { name: 'tournament', mode: { kind: 'resume' } } : { name: 'online', mode: { kind: 'resume' } })} />;
    case 'hub':
      return <OnlineHub tab={screen.tab} settings={settings} onSettings={setSettings} pa={pa} onBack={home}
        onJoinRoom={(code) => setScreen({ name: 'online', mode: { kind: 'join', code, auto: true } })}
        onJoinTournament={(code) => setScreen({ name: 'tournament', mode: { kind: 'join', code } })}
        onCreateRoom={() => setScreen({ name: 'online', mode: { kind: 'create' } })}
        onQuick={() => setScreen({ name: 'online', mode: { kind: 'quick' } })}
        onCreateTournament={() => setScreen({ name: 'tournament', mode: { kind: 'create' } })} />;
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
      return <SettingsScreen settings={settings} onChange={setSettings} onBack={home} />;
    case 'sandbox':
      return <Sandbox settings={settings} appearance={profile.equipped} onSettings={setSettings} onBack={home} />;
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
    case 'stats':
      return <StatsScreen pa={pa} onBack={home} onAdmin={() => setScreen({ name: 'admin' })} />;
    case 'admin':
      return <AdminScreen pa={pa} onBack={() => setScreen({ name: 'stats' })} />;
    case 'legal':
      return <LegalScreen onBack={() => (screen.back.name === 'home' ? home() : setScreen(screen.back))} />;
    case 'leaderboard':
      return <LeaderboardScreen pa={pa} onBack={home} onAccount={() => setScreen({ name: 'account' })} />;
  }
}
