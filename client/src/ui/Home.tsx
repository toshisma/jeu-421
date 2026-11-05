import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BagIcon } from './BagIcon';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { DAILY_REWARDS, chestWait, dailyStatus, levelInfo, passProgress, seasonOf, titleLabel, type Profile } from '../../../shared/progress/profile';
import { dailyQuests, questsFor, today } from '../../../shared/progress/quests';
import { bossOfWeek, weekKey } from '../../../shared/progress/boss';
import { activeEvent, coinBoost, happyHour } from '../../../shared/progress/events';
import { CURRENT_VERSION } from '../../../shared/changelog';
import type { ProfileApi } from '../account/useProfile';
import { loadChallengeDone } from '../account/useProfile';
import { api } from '../account/api';
import type { Settings } from '../settings';
import { sound } from '../audio/sound';
import { reportUrl } from '../legal';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { ProfileView } from './ProfileView';
import { BossCard, DailyStreak, EveningChest, EventBanner, HappyHourBanner } from './Progression';
import { ChallengeCard, type DuelPlay } from './ChallengeScreen';
import { QuestsPanel } from './AccountScreens';
import { DieCube } from './DiceCollection';
import { ReferralCard, useReferral } from './Referral';
import { FriendsButton, NewsTicker, OpenLobbies } from './Friends';
import { NotifBell, NotifPanel, useNotifications } from './Social';
import { InstallPrompt } from './InstallPrompt';
import { MusicControl, VolumeControl } from './VolumeControl';
import { DiceTray, type DiceTrayHandle } from './DiceTray';
import { changelogUnseen } from './Changelog';
import { STANDALONE } from './Screens';
import { MessagesButton } from './Messages';
import { ScheduledCard } from './Scheduled';
import { DISCORD_RESULTS, DiscordCard, takeDiscordReturn, useDiscord } from './Discord';
import { ChestArt, FriendsArt, GiftArt, Rays, RewardBurst, ScrollArt, TableArt, TargetArt, TicketArt, TopHatArt, TrophyArt } from './illustrations';
import type { ProgrammeView } from '../../../shared/scheduled';

export interface HomeProps {
  profile: Profile; pa: ProfileApi; avatar: string; displayName: string; settings: Settings; onChangeSettings: (s: Settings) => void;
  onShop: () => void; onAccount: () => void; onLogin: () => void; onLeaderboard: () => void;
  onSolo: () => void; onOnline: () => void; onTournaments: () => void; onParty: () => void;
  /** Partie rapide : une table publique tout de suite (complétée par des ordinateurs si personne ne vient). */
  onQuick?: () => void;
  onRules: () => void; onSettings: () => void; onSandbox: () => void; onLegal: () => void; onPass: () => void; onTutorial: () => void;
  onChallenge: () => void; onBoss: () => void; onClub: () => void; onAlbum: () => void; onRecap: () => void; onStats: () => void;
  onCollection: () => void; onDuels: () => void; onFriends: () => void; onChangelog: () => void; onJoinRoom: (code: string) => void;
  onDuelPlay: (d: DuelPlay) => void; openNotifs?: boolean;
  /** Coups Fourrés, le mode cartes. */
  onCards?: () => void;
  /** Panel de modération (le menu ne le montre qu'aux modérateurs). */
  onModeration?: () => void;
  /** Tableau de bord d'administration (le menu ne le montre qu'aux admins). */
  onAdmin?: () => void;
  resume: { code: string; tournament?: boolean } | null; onResume: () => void;
  /** Tournois programmés de 11 h et 21 h : rejoindre le salon (pay = s'inscrire en entrant). */
  onJoinScheduled?: (code: string, pay: boolean) => void;
  /** Messages privés (bulle à côté des amis). */
  onMessages?: () => void;
}

type SheetKind = 'tournoi' | 'menu' | 'coffre' | 'cadeau' | 'patron' | 'defi' | 'missions' | 'parrainage' | 'lobbies' | 'discord';

/** Prochain tournoi programmé (11 h et 21 h, heure de Bruxelles) : heure affichée et minutes restantes. */
export function nextTournamentSlot(now = Date.now()): { label: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0), m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const cur = h * 60 + m;
  for (const slot of [11 * 60, 21 * 60]) if (cur < slot + 5) return { label: `${String(slot / 60).padStart(2, '0')}:00`, minutes: slot - cur };
  return { label: '11:00', minutes: 24 * 60 - cur + 11 * 60 };
}
const inTime = (min: number) => (min <= 0 ? 'salon ouvert !' : min < 60 ? `dans ${min} min` : `dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

/** Salons publics qui attendent des joueurs (affichés seulement s'il y en a). */
function useOpenLobbies() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<{ lobbies: unknown[] }>('/lobbies').then((r) => setN(r.lobbies.length)).catch(() => {});
    load(); const t = setInterval(load, 10_000); return () => clearInterval(t);
  }, []);
  return n;
}

/** Programme des tournois de 11 h et 21 h (pour la tuile). */
function useProgramme(token: string | null) {
  const [p, setP] = useState<ProgrammeView | null>(null);
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<ProgrammeView>('/tournois/programme', { token }).then(setP).catch(() => {});
    load(); const t = setInterval(load, 30_000); return () => clearInterval(t);
  }, [token]);
  return p;
}

/** Parties en cours (pour montrer qui joue en ce moment sur la carte « Jouer en ligne »). */
function useLiveTables() {
  const [v, setV] = useState<{ games: number; faces: { avatar: string }[] }>({ games: 0, faces: [] });
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<{ games: { players: { avatar: string; bot?: boolean }[] }[] }>('/live').then((r) => setV({
      games: r.games.length,
      faces: r.games.flatMap((g) => g.players.filter((x) => !x.bot)).slice(0, 8),
    })).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, []);
  return v;
}
const FACE_COLORS = ['#5b8cff', '#b06ad9', '#3fbf8a', '#e8964a', '#ef5a52'];

function useOnlineCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (STANDALONE) return;
    const load = () => api<{ live: { online: number } }>('/stats').then((r) => setN(r.live.online)).catch(() => {});
    load(); const t = setInterval(load, 20_000); return () => clearInterval(t);
  }, []);
  return n;
}

/** Fenêtre glissée depuis le bas (détail d'une tuile, menu « Plus »). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button></header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Menu « Plus » : tout le reste du jeu, rangé par thème, avec une recherche. */
function PlusMenu(p: HomeProps & { onProfile: () => void; onClose: () => void; onDiscord?: () => void; discordDot?: boolean }) {
  const [q, setQ] = useState('');
  const acc = p.pa.isAccount && !STANDALONE;
  const [role, setRole] = useState<{ admin: boolean; moderator: boolean; pending: number }>({ admin: false, moderator: false, pending: 0 });
  useEffect(() => { if (acc && p.pa.token) api<{ admin: boolean; moderator: boolean; pending: number }>('/moderation/whoami', { token: p.pa.token }).then(setRole).catch(() => {}); }, [acc, p.pa.token]);
  const admin = role.admin;
  const groups: { title: string; items: { label: string; icon: Parameters<typeof Icon>[0]['name']; go: () => void; show?: boolean; dot?: boolean; keys?: string }[] }[] = [
    { title: 'Progresser', items: [
      { label: 'Profil et succès', icon: 'user', go: p.onProfile, keys: 'titre avatar photo succes' },
      { label: 'Pass du mois', icon: 'ticket', go: p.onPass, keys: 'saison paliers' },
      { label: 'Classement', icon: 'trophy', go: p.onLeaderboard, show: !STANDALONE, keys: 'ligue saison' },
      { label: 'Défi du jour', icon: 'target', go: p.onChallenge },
    ] },
    { title: 'Mes dés et mes parties', items: [
      { label: 'Coups Fourrés', icon: 'cards', go: () => p.onCards?.(), show: !!p.onCards, keys: 'cartes mode cartes deck booster capsules' },
      { label: 'Collection', icon: 'dice', go: p.onCollection, show: !STANDALONE, keys: 'sacs des rares' },
      { label: 'Boutique', icon: 'shop', go: p.onShop, keys: 'tapis decor rebord' },
      { label: 'Album', icon: 'album', go: p.onAlbum, keys: 'combinaisons' },
      { label: 'Récap du mois', icon: 'chart', go: p.onRecap },
      { label: 'Statistiques', icon: 'stats', go: p.onStats, show: !STANDALONE, keys: 'admin en ligne' },
    ] },
    { title: 'Entre joueurs', items: [
      { label: 'Amis', icon: 'people', go: p.onFriends, show: !STANDALONE },
      { label: 'Messages', icon: 'chat', go: () => p.onMessages?.(), show: acc && !!p.onMessages, keys: 'messages prives discuter' },
      { label: 'Club', icon: 'club', go: p.onClub, show: !STANDALONE },
      { label: 'Défis entre amis', icon: 'target', go: p.onDuels, show: !STANDALONE, keys: 'duels' },
      { label: 'Tournois', icon: 'trophy', go: p.onTournaments, show: !STANDALONE },
      { label: 'Regarder une partie', icon: 'eye', go: p.onOnline, show: !STANDALONE, keys: 'spectateur parties en cours' },
      { label: 'Soirée (un téléphone)', icon: 'cheers', go: p.onParty, keys: 'vrais des arbitre' },
      { label: 'Discord du jeu', icon: 'chat', go: () => p.onDiscord?.(), show: !STANDALONE && !!p.onDiscord, dot: p.discordDot, keys: 'discord communaute serveur sac offert' },
    ] },
    { title: 'Apprendre et régler', items: [
      { label: 'Règles', icon: 'rules', go: p.onRules, keys: 'combinaisons charge decharge' },
      { label: 'Partie guidée', icon: 'resume', go: p.onTutorial, keys: 'tuto apprendre' },
      { label: "Bac d'essai", icon: 'dice', go: p.onSandbox, keys: 'lancer entrainement' },
      { label: 'Réglages', icon: 'settings', go: p.onSettings, keys: 'son vibration qualite graphismes secouer' },
      { label: 'Administration', icon: 'settings', go: () => p.onAdmin?.(), show: admin && !!p.onAdmin, dot: role.pending > 0, keys: 'admin bannir pieces tableau de bord signalements moderation' },
      { label: 'Modération', icon: 'flag', go: () => p.onModeration?.(), show: role.moderator && !admin && !!p.onModeration, dot: role.pending > 0, keys: 'signalements sanctions moderateur' },
      { label: acc ? 'Mon compte' : 'Compte', icon: 'key', go: acc ? p.onAccount : p.onLogin, show: !STANDALONE, keys: 'connexion mot de passe' },
    ] },
  ];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = norm(q.trim());
  const pick = (go: () => void) => { p.onClose(); go(); };
  return (
    <Sheet title="Tout le comptoir" onClose={p.onClose}>
      <div className="plus-audio"><span>Son</span><MusicControl settings={p.settings} onSettings={p.onChangeSettings} /><VolumeControl settings={p.settings} onSettings={p.onChangeSettings} /><InstallPrompt compact /></div>
      <label className="plus-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher : règles, réglages, club…" aria-label="Chercher dans le menu" /></label>
      {groups.map((g) => {
        const items = g.items.filter((i) => i.show !== false && (!nq || norm(`${i.label} ${i.keys ?? ''}`).includes(nq)));
        if (!items.length) return null;
        return (
          <section key={g.title} className="plus-group">
            <h3>{g.title}</h3>
            <div className="plus-grid">
              {items.map((i) => <button key={i.label} onClick={() => pick(i.go)}><Icon name={i.icon} size={22} /><span>{i.label}</span>{i.dot && <i className="plus-dot" aria-label="à voir" />}</button>)}
            </div>
          </section>
        );
      })}
      <div className="plus-foot">
        <button className="link small-link" onClick={() => pick(p.onChangelog)}>Nouveautés (v{CURRENT_VERSION}){changelogUnseen() && <i className="new-dot" aria-label="nouvelle version" />}</button>
        <a className="link small-link" href={reportUrl()}>Signaler un problème</a>
        <button className="link small-link" onClick={() => pick(p.onLegal)}>Confidentialité</button>
        {!STANDALONE && GUIDES.map(([href, label]) => <a key={href} className="link small-link" href={href}>{label}</a>)}
      </div>
    </Sheet>
  );
}

/** Vitrine 3D : le vrai bac du joueur, on peut le toucher pour lancer. */
function HeroTray({ pa, settings }: { pa: ProfileApi; settings: Settings }) {
  const tray = useRef<DiceTrayHandle>(null);
  const rolling = useRef(false);
  const roll = async () => {
    if (rolling.current) return;
    rolling.current = true; sound.unlock();
    const r = crypto.getRandomValues(new Uint32Array(4));
    await tray.current?.roll([0, 1, 2].map((i) => 1 + (r[i] % 6)), [false, false, false], r[3] >>> 1);
    rolling.current = false;
  };
  useEffect(() => { tray.current?.setSwipeEnabled(true); }, []);
  return (
    <div className="hero-tray" onClick={() => void roll()}>
      <DiceTray ref={tray} appearance={pa.profile.equipped} quality={settings.quality} insets={{ top: 0, bottom: 40, left: 0, right: 0 }} onSwipe={() => void roll()} />
    </div>
  );
}

type Tile = { id: string; title: string; sub: React.ReactNode; icon: Parameters<typeof Icon>[0]['name']; hot?: boolean; badge?: string; badgeKind?: 'blue'; go: () => void; show?: boolean };

/** Pages de guide (référencement) : liens texte visibles, utiles aux joueurs comme à Google. */
const GUIDES: [string, string][] = [
  ['/jouer-au-421-en-ligne', 'Jouer au 421 en ligne'], ['/regles-du-421', 'Règles du 421'], ['/combinaisons-du-421', 'Combinaisons'],
  ['/strategie-421', 'Stratégie'], ['/421-entre-amis', '421 entre amis'], ['/jeux-entre-amis-a-distance', 'Jeux entre amis à distance'],
  ['/jeu-multijoueur-navigateur', 'Jeu multijoueur sur navigateur'], ['/jeux-de-des', 'Jeux de dés'],
];

export function Home(props: HomeProps) {
  const { pa, profile } = props;
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const { notifs, reload } = useNotifications(pa);
  const [showNotifs, setShowNotifs] = useState(!!props.openNotifs);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [netOk, setNetOk] = useState(navigator.onLine);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const up = () => setNetOk(true), down = () => setNetOk(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  const online = useOnlineCount();
  const live = useLiveTables();
  // Ouverture animée du coffre et du cadeau (le toast donne toujours le détail).
  const [burst, setBurst] = useState<{ kind: 'chest' | 'gift'; phase: 'opening' | 'open'; title?: string; detail?: string } | null>(null);
  const closeBurst = useCallback(() => setBurst(null), []);
  const lobbies = useOpenLobbies();
  const prog = useProgramme(pa.token);
  const referral = useReferral(pa);
  const { discord, reload: reloadDiscord } = useDiscord(pa);
  // Sac Discord pas encore récupéré (compte, vérification active) : point rouge jusqu'à la récupération.
  const discordDot = pa.isAccount && !STANDALONE && !!discord?.invite && !!discord.verify && !discord.claimed;
  // Retour de la vérification Discord (/?discord=…) : message dans la fiche Discord, profil rafraîchi.
  const [discordMsg, setDiscordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const r = takeDiscordReturn();
    if (!r) return;
    setDiscordMsg({ ok: r === 'ok', text: DISCORD_RESULTS[r] ?? DISCORD_RESULTS.erreur });
    setSheet('discord');
    if (r === 'ok') { sound.treasure(); pa.refresh(); reloadDiscord(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const li = levelInfo(profile.xp);
  const name = pa.session?.username ?? (props.displayName || 'Invité');
  const acc = pa.isAccount && !STANDALONE;
  const day = today();

  // --- État de chaque tuile -------------------------------------------------------------------
  const chestLeft = chestWait(profile, now);
  const daily = dailyStatus(profile);
  const quests = questsFor(profile.quests, day);
  const qDefs = dailyQuests(day);
  const qReady = qDefs.filter((d) => (quests.progress[d.id] ?? 0) >= d.target && !quests.claimed.includes(d.id)).length;
  const qDone = qDefs.filter((d) => quests.claimed.includes(d.id)).length;
  const season = seasonOf(profile);
  const pass = passProgress(season.points);
  const passReady = Array.from({ length: pass.tier }, (_, i) => i + 1).filter((t) => !season.claimed.includes(t)).length;
  const boss = bossOfWeek(day);
  const bossBeaten = profile.bossWeek === weekKey(day);
  const chal = loadChallengeDone();
  const chalDone = chal?.day === day;
  const duelsToPlay = notifs?.toPlay.filter((d) => !d.sent).length ?? 0;
  const slot = nextTournamentSlot(now);
  const hLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

  const openChest = async () => {
    sound.unlock(); sound.rattle();
    setBurst({ kind: 'chest', phase: 'opening' });
    const [r] = await Promise.all([pa.openEveningChest(), new Promise((ok) => setTimeout(ok, 650))]);
    if ('error' in r) { setBurst(null); setToast(r.error); return; }
    sound.treasure(); setToast(`Coffre : +${r.coins} pièces${r.bag ? ' et un sac de dés !' : ''}`);
    setBurst({ kind: 'chest', phase: 'open', title: `+${r.coins} pièces`, detail: r.bag ? 'et un sac de dés !' : 'Coffre du comptoir' });
  };
  const claimDaily = async () => {
    const r = DAILY_REWARDS[daily.cycleDay - 1];
    sound.unlock();
    setBurst({ kind: 'gift', phase: 'opening' });
    const [err] = await Promise.all([pa.claimDailyReward(), new Promise((ok) => setTimeout(ok, 550))]);
    if (err) { setBurst(null); setToast(err); return; }
    sound.chips(daily.cycleDay === 7 ? 8 : 3);
    setToast(`Cadeau du jour : +${r.coins} pièces${r.xp ? ` et +${r.xp} XP` : ''}`);
    setBurst({ kind: 'gift', phase: 'open', title: `+${r.coins} pièces`, detail: r.xp ? `et +${r.xp} XP · jour ${daily.cycleDay}` : `Jour ${daily.cycleDay}` });
  };

  const tiles: Tile[] = [
    { id: 'coffre', title: 'Coffre', icon: 'chest', hot: chestLeft === 0, badge: chestLeft === 0 ? 'Prêt' : undefined,
      sub: chestLeft === 0 ? 'Ouvrir' : `dans ${hLeft(chestLeft)}`, go: () => (chestLeft === 0 ? void openChest() : setSheet('coffre')) },
    { id: 'cadeau', title: 'Cadeau du jour', icon: 'gift', hot: daily.canClaim, badge: daily.canClaim ? `J${daily.cycleDay}` : undefined,
      sub: daily.canClaim ? (daily.cycleDay === 7 ? 'Coffre du 7e jour' : `+${DAILY_REWARDS[daily.cycleDay - 1].coins} pièces`) : 'Revenez demain', go: () => (daily.canClaim ? void claimDaily() : setSheet('cadeau')) },
    (() => {
      // Tournoi programmé : données du serveur si disponibles, sinon l'horaire calculé ici.
      const sv = prog?.slots.find((x) => x.status === 'salon' || x.status === 'a-venir') ?? null;
      const open = sv?.status === 'salon';
      const hh = sv ? `${String(sv.hour).padStart(2, '0')}:00` : slot.label;
      const mins = sv ? Math.ceil((sv.startsAt - now) / 60000) : slot.minutes;
      return { id: 'tournoi', title: 'Tournoi', icon: 'trophy', hot: open && !!sv?.registered, badge: sv?.registered ? (open ? 'Go !' : 'Inscrit') : hh, badgeKind: sv?.registered ? undefined : 'blue' as const,
        sub: open ? `salon ouvert · ${sv!.count} joueurs` : `${inTime(mins)}${sv ? ` · ${sv.count} inscrit${sv.count > 1 ? 's' : ''}` : ''}`,
        go: () => (props.onJoinScheduled ? setSheet('tournoi') : props.onTournaments()), show: !STANDALONE } satisfies Tile;
    })(),
    { id: 'patron', title: 'Patron', icon: 'hat', sub: bossBeaten ? `${boss.name} · battu` : `${boss.name} · à battre`, go: () => setSheet('patron') },
    { id: 'defi', title: 'Défi du jour', icon: 'target', sub: chalDone ? `${chal!.points} points` : '1 essai', go: () => setSheet('defi') },
    { id: 'missions', title: 'Missions', icon: 'check', hot: qReady > 0, badge: qReady ? String(qReady) : undefined, sub: qReady ? 'à récupérer' : `${qDone}/${qDefs.length} faites`, go: () => setSheet('missions') },
    { id: 'pass', title: `Pass ${pass.tier}/20`, icon: 'ticket', hot: passReady > 0, badge: passReady ? String(passReady) : undefined,
      sub: <span className="tile-bar"><i style={{ width: `${pass.tier >= 20 ? 100 : (100 * pass.into) / pass.need}%` }} /></span>, go: props.onPass },
    acc ? { id: 'duels', title: 'Défis d’amis', icon: 'people', hot: duelsToPlay > 0, badge: duelsToPlay ? String(duelsToPlay) : undefined, sub: duelsToPlay ? 'à jouer' : 'Défier un ami', go: props.onDuels }
      : { id: 'album', title: 'Album', icon: 'album', sub: 'Vos combinaisons', go: props.onAlbum },
  ];
  const shown = tiles.filter((t) => t.show !== false);
  const ready = shown.filter((t) => t.hot).length;

  // --- Bannière : une seule à la fois, la plus utile ----------------------------------------------
  const ev = activeEvent(day) || coinBoost(day);
  const banner = (() => {
    if (props.resume && !STANDALONE) return <button className="home-banner resume" onClick={props.onResume}><Icon name="resume" size={20} /><span><b>{props.resume.tournament ? 'Reprendre le tournoi' : 'Reprendre la partie'}</b><small>Table {props.resume.code}</small></span></button>;
    const salon = prog?.slots.find((x) => x.status === 'salon' && x.registered && x.code);
    if (salon && props.onJoinScheduled) return <button className="home-banner resume" onClick={() => props.onJoinScheduled!(salon.code!, false)}><Icon name="trophy" size={20} /><span><b>Votre tournoi de {salon.hour} h commence !</b><small>Le salon est ouvert : rejoignez-le avant le départ</small></span><em>Rejoindre</em></button>;
    if (pa.welcomeBack) return <button className="home-banner gift" onClick={() => { pa.dismissWelcome(); props.onCollection(); }}><Icon name="gift" size={20} /><span><b>Content de vous revoir !</b><small>Un sac de dés vous attend dans la Collection.</small></span></button>;
    if (!profile.tutorial) return <button className="home-banner tuto" onClick={props.onTutorial}><Icon name="resume" size={20} /><span><b>Nouveau ? Apprendre à jouer</b><small>Partie guidée de 3 minutes</small></span><em>+50 pièces</em></button>;
    if (lobbies > 0 && netOk) return <button className="home-banner lobbies" onClick={() => setSheet('lobbies')}><Icon name="people" size={20} /><span><b>{lobbies > 1 ? `${lobbies} parties attendent des joueurs` : 'Une partie attend des joueurs'}</b><small>Rejoignez une table ouverte</small></span><em>Voir</em></button>;
    if (!STANDALONE && !pa.isAccount) return <button className="home-banner account" onClick={props.onAccount}><Icon name="key" size={20} /><span><b>Gardez votre progression</b><small>Compte gratuit : classements, clubs, amis, tables avec mise</small></span><em>Créer</em></button>;
    if (happyHour(now)) return <HappyHourBanner />;
    if (ev) return <EventBanner onShop={props.onShop} />;
    if (acc && discord?.invite && discord.verify && !discord.claimed) return <button className="home-banner discord" onClick={() => setSheet('discord')}><BagIcon size={26} color="bleu" /><span><b>Rejoignez le Discord du jeu</b><small>Un sac de dés offert, une fois vérifié</small></span><em>Voir</em></button>;
    return null;
  })();

  const coll = useMemo(() => {
    const owned = new Set(profile.owned.filter((id) => id.startsWith('dc-')).map((id) => id.replace('-brillant', '')));
    return owned.size;
  }, [profile.owned]);
  const bags = profile.bags ?? 0;
  const byId = Object.fromEntries(shown.map((t) => [t.id, t])) as Record<string, Tile>;
  const tour = byId.tournoi as Tile | undefined;
  // Événements : tournoi programmé, patron, défi du jour (cartes illustrées).
  const events: { t: Tile; art: React.ReactNode; tone: string }[] = [
    ...(tour ? [{ t: tour, art: <TrophyArt size={52} />, tone: 'blue' }] : []),
    { t: byId.patron, art: <TopHatArt size={52} />, tone: 'felt' },
    { t: byId.defi, art: <TargetArt size={52} />, tone: 'felt' },
  ];
  // Récompenses : médaillons sur l'étagère (ceux qui sont prêts brillent).
  const rewardIds = ['coffre', 'cadeau', 'missions', 'pass', acc ? 'duels' : 'album'];
  const rewards = rewardIds.map((id) => byId[id]).filter(Boolean);
  const rewardArt = (id: string, hot: boolean) => {
    switch (id) {
      case 'coffre': return <ChestArt open={hot} size={40} />;
      case 'cadeau': return <GiftArt size={38} />;
      case 'missions': return <ScrollArt size={36} done={qDone + qReady} total={qDefs.length} />;
      case 'pass': return <TicketArt size={40} label={pass.tier} />;
      case 'duels': return <FriendsArt size={38} />;
      default: return <span className="v2-album"><Icon name="album" size={24} /></span>;
    }
  };
  const tourMins = (() => {
    const sv = prog?.slots.find((x) => x.status === 'salon' || x.status === 'a-venir') ?? null;
    return sv ? Math.ceil((sv.startsAt - now) / 60000) : slot.minutes;
  })();
  const liveLine = lobbies > 0 ? `${lobbies} table${lobbies > 1 ? 's' : ''} vous attend${lobbies > 1 ? 'ent' : ''}`
    : live.games > 0 ? `${live.games} partie${live.games > 1 ? 's' : ''} en cours` : 'Ouvrez une table, on vous rejoint';
  const extra = online != null ? Math.max(0, online - live.faces.length) : 0;

  return (
    <div className="home2 v2">
      <header className="h2-bar">
        <button className="h2-me" onClick={() => setShowProfile(true)} aria-label="Mon profil">
          <Avatar photo={pa.photo} emoji={props.avatar} size={40} accessory={accessoryEmoji(profile.equipped.accessoire)} />
          <span className="h2-me-text">
            <span><b>{name}</b><em>Niv. {li.level}</em></span>
            <span className="h2-coins"><i aria-hidden />{profile.coins.toLocaleString('fr-BE')}</span>
          </span>
        </button>
        {!STANDALONE && !pa.isAccount && <button className="h2-login" onClick={props.onLogin}>Connexion</button>}
        {acc && props.onMessages && <MessagesButton pa={pa} onOpen={props.onMessages} />}
        {acc && <FriendsButton pa={pa} onOpen={props.onFriends} />}
        {acc && <NotifBell count={notifs?.count ?? 0} onOpen={() => { setShowNotifs(true); reload(); }} />}
      </header>

      <main className="h2-main">
        {/* 1. Vitrine 3D et partie contre l'ordinateur */}
        <section className="h2-hero">
          <HeroTray pa={pa} settings={props.settings} />
          <h1 className="plaque h2-plaque"><span aria-hidden>421</span><span className="sr-only">421 en ligne : jeu de dés multijoueur gratuit</span></h1>
          {STANDALONE && online !== null && <button className="h2-live" onClick={props.onStats}><i aria-hidden />{online} en ligne</button>}
          {!STANDALONE && <div className="h2-news"><NewsTicker /></div>}
          {titleLabel(profile.title) && <span className="h2-title-chip">{titleLabel(profile.title)}</span>}
          <button className="h2-play" onClick={props.onSolo}><Icon name="dice" size={26} /><span>Jouer contre l'ordinateur</span><Icon name="back" size={20} /></button>
        </section>

        {/* 2. Jeu en ligne : la grande carte rouge et or */}
        {STANDALONE ? <p className="note">Le jeu entre amis demande le serveur du projet. Cette version propose le solo et le bac d'essai.</p> : (
          <section className="v2-multi" aria-label="Jouer en ligne">
            <span className="v2-multi-art"><TableArt size={74} /></span>
            <div className="v2-multi-body">
              <div className="v2-multi-head">
                <b>Jouer en ligne</b>
                {online !== null && <button className="v2-live" onClick={props.onStats} aria-label={`${online} joueurs en ligne, voir les statistiques`}><i aria-hidden />{online}</button>}
              </div>
              <button className="v2-multi-who" onClick={() => (lobbies > 0 ? setSheet('lobbies') : props.onOnline())} disabled={!netOk}>
                {live.faces.length > 0 && <span className="v2-faces" aria-hidden>
                  {live.faces.slice(0, 3).map((f, i) => <span key={i} className="v2-face" style={{ background: FACE_COLORS[i % FACE_COLORS.length] }}>{f.avatar}</span>)}
                  {extra > 0 && <span className="v2-face more">+{extra > 99 ? 99 : extra}</span>}
                </span>}
                <span>{liveLine}</span>
              </button>
              <div className="v2-multi-btns">
                {props.onQuick && <button className="v2-mbtn gold v2-quick" onClick={props.onQuick} disabled={!netOk}><Icon name="dice" size={17} />Partie rapide</button>}
                <button className={`v2-mbtn ${props.onQuick ? 'ghost v2-tables' : 'gold'}`} onClick={props.onOnline} disabled={!netOk}
                  aria-label="Rejoindre une table">{props.onQuick ? 'Tables' : 'Rejoindre une table'}</button>
                <button className="v2-mbtn ghost" onClick={props.onParty} aria-label="Entre amis"><Icon name="cheers" size={16} /><span className="v2-amis">Entre amis</span></button>
              </div>
            </div>
          </section>
        )}
        {!netOk && !STANDALONE && <p className="note">Hors connexion : le jeu en ligne reviendra avec le réseau.</p>}

        {banner}

        {/* 3. Événements */}
        <div className="v2-sect"><b>Événements</b>{tour && <span>Tournoi {inTime(tourMins)}</span>}</div>
        <section className="v2-events">
          {events.map(({ t, art, tone }) => (
            <button key={t.id} className={`v2-ev ${tone}${t.hot ? ' hot' : ''}`} onClick={t.go}>
              {t.badge && <em className={`v2-tag${t.badgeKind === 'blue' ? ' gold' : ''}`}>{t.badge}</em>}
              <span className="v2-ev-art">{art}</span>
              <b>{t.title}</b>
              <small>{t.sub}</small>
            </button>
          ))}
        </section>

        {/* 4. Collection et parrainage, plus compacts */}
        {!STANDALONE && (
          <section className={`v2-promos${props.onCards ? ' three' : ''}`}>
            <button className="v2-promo coll" onClick={props.onCollection}>
              <span className="v2-promo-art cubes" aria-hidden><DieCube id="dc-galaxie" size={24} spin /><DieCube id="dc-dragon" size={34} spin /></span>
              <span className="promo-shine" aria-hidden />
              {bags > 0 && <em className="promo-badge">{bags} sac{bags > 1 ? 's' : ''}</em>}
              <span className="v2-promo-text"><b>Collection</b><small>{coll > 0 ? `${coll}/25 dés` : '25 dés rares'}</small><span className="tile-bar"><i style={{ width: `${(100 * coll) / 25}%` }} /></span></span>
            </button>
            <button className="v2-promo ref" onClick={() => (acc ? setSheet('parrainage') : props.onAccount())}>
              <span className="v2-promo-art bag" aria-hidden><BagIcon size={50} /></span>
              <span className="promo-shine late" aria-hidden />
              {referral && <em className="promo-badge">{referral.bagsEarned}/{referral.bagsMax}</em>}
              <span className="v2-promo-text"><b>Parrainage</b><small>{acc ? '1 sac par ami' : 'Sac offert, compte gratuit'}</small></span>
            </button>
            {props.onCards && <button className="v2-promo cf" onClick={props.onCards}>
              <span className="v2-promo-art cf-fanart" aria-hidden><i className="h" /><i className="v" /><i className="p" /></span>
              <span className="promo-shine" aria-hidden />
              <em className="promo-badge cf-new-badge">Nouveau</em>
              <span className="v2-promo-text"><b>Coups Fourrés</b><small>Le 421 aux cartes</small></span>
            </button>}
          </section>
        )}

        {/* 5. Récompenses : l'étagère en bois */}
        <div className="v2-sect"><b>Récompenses</b>{ready > 0 && <span>{ready} à récupérer</span>}</div>
        <section className="v2-shelf tex-wood">
          {rewards.map((t) => (
            <button key={t.id} className={`v2-rw${t.hot ? ' on' : ''}`} onClick={t.go} aria-label={`${t.title}${t.hot ? ' : prêt' : ''}`}>
              <span className="v2-medal">{t.hot && <Rays />}{rewardArt(t.id, !!t.hot)}</span>
              {t.badge && <em className="v2-cnt">{t.id === 'coffre' ? '!' : t.badge}</em>}
              <b>{t.id === 'pass' ? 'Pass' : t.id === 'cadeau' ? 'Cadeau' : t.title}</b>
              <small>{t.id === 'pass' ? `Palier ${pass.tier}` : t.sub}</small>
            </button>
          ))}
        </section>
        {!STANDALONE && <nav className="h2-guides" aria-label="Guides du 421">{GUIDES.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</nav>}
      </main>

      <nav className="h2-tabs" aria-label="Navigation">
        <button className="on" aria-current="page"><Icon name="home" size={22} /><span>Accueil</span></button>
        {!STANDALONE && <button onClick={props.onCollection}><Icon name="grid" size={22} /><span>Collection</span>{bags > 0 && <i className="tab-dot">{bags}</i>}</button>}
        <button onClick={props.onShop}><Icon name="shop" size={22} /><span>Boutique</span></button>
        {!STANDALONE && <button onClick={props.onLeaderboard}><Icon name="chart" size={22} /><span>Classement</span></button>}
        <button onClick={() => setSheet('menu')}><Icon name="menu" size={22} /><span>Plus</span>{(changelogUnseen() || discordDot) && <i className="tab-dot small" />}</button>
      </nav>

      {toast && <div className="h2-toast" role="status">{toast}</div>}
      {burst && <RewardBurst kind={burst.kind} phase={burst.phase} title={burst.title} detail={burst.detail} onClose={closeBurst} />}
      {sheet === 'menu' && <PlusMenu {...props} onProfile={() => setShowProfile(true)} onClose={() => setSheet(null)} onDiscord={discord?.invite ? () => setSheet('discord') : undefined} discordDot={discordDot} />}
      {sheet === 'discord' && discord && <Sheet title="Discord" onClose={() => { setSheet(null); setDiscordMsg(null); }}>{discordMsg && <p className={`discord-msg${discordMsg.ok ? ' ok' : ''}`}>{discordMsg.text}</p>}<DiscordCard pa={pa} state={discord} onAccount={() => { setSheet(null); props.onAccount(); }} /></Sheet>}
      {sheet === 'tournoi' && props.onJoinScheduled && <Sheet title="Tournois de 11 h et 21 h" onClose={() => setSheet(null)}>
        <ScheduledCard pa={pa} onJoin={(c, pay) => { setSheet(null); props.onJoinScheduled!(c, pay); }} onAccount={() => { setSheet(null); props.onAccount(); }} />
        <button className="btn ghost small" onClick={() => { setSheet(null); props.onTournaments(); }}>Autres tournois</button>
      </Sheet>}
      {sheet === 'coffre' && <Sheet title="Coffre du comptoir" onClose={() => setSheet(null)}><EveningChest pa={pa} /></Sheet>}
      {sheet === 'cadeau' && <Sheet title="Cadeau du jour" onClose={() => setSheet(null)}><DailyStreak pa={pa} /></Sheet>}
      {sheet === 'patron' && <Sheet title="Patron de la semaine" onClose={() => setSheet(null)}><BossCard pa={pa} onPlay={() => { setSheet(null); props.onBoss(); }} /></Sheet>}
      {sheet === 'defi' && <Sheet title="Défi du jour" onClose={() => setSheet(null)}><ChallengeCard onOpen={() => { setSheet(null); props.onChallenge(); }} /></Sheet>}
      {sheet === 'missions' && <Sheet title="Missions du jour" onClose={() => setSheet(null)}><QuestsPanel profile={profile} onClaim={pa.claim} /></Sheet>}
      {sheet === 'parrainage' && <Sheet title="Parrainage" onClose={() => setSheet(null)}><ReferralCard pa={pa} onAccount={props.onAccount} /></Sheet>}
      {sheet === 'lobbies' && <Sheet title="Salons ouverts" onClose={() => setSheet(null)}><OpenLobbies onJoin={props.onJoinRoom} onAll={props.onOnline} /></Sheet>}
      {showNotifs && <NotifPanel pa={pa} notifs={notifs} reload={reload} onClose={() => { setShowNotifs(false); reload(); }}
        onPlay={(d) => { setShowNotifs(false); props.onDuelPlay(d); }} onDuels={() => { setShowNotifs(false); props.onDuels(); }} />}
      {showProfile && <ProfileView pa={pa} displayName={props.displayName} avatar={props.avatar} onClose={() => setShowProfile(false)} />}
    </div>
  );
}
