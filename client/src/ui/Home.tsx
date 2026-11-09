/**
 * Menu principal (écran d'arrivée) : le joueur (profil, niveau, pièces = monnaie générale), la
 * vitrine 3D de son bac, les trois jeux en grandes entrées (avec ce qui les attend), les récompenses
 * générales du jour. La barre du bas « Accueil · Amis · Collection · Boutique · Plus » est commune à
 * tous les écrans (BottomNav.tsx, rendue par App.tsx).
 * Chaque jeu a ensuite son propre menu, réduit à ce qui le concerne (ClassicMenu, CfMode, DixMille).
 */
import { useCallback, useEffect, useState } from 'react';
import { BagIcon } from './BagIcon';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { DAILY_REWARDS, chestWait, collectionCount, dailyStatus, levelInfo, passProgress, seasonOf, titleLabel, type Profile } from '../../../shared/progress/profile';
import { dailyQuests, questsFor, today } from '../../../shared/progress/quests';
import { activeEvent, coinBoost, happyHour } from '../../../shared/progress/events';
import type { ProfileApi } from '../account/useProfile';
import type { Settings } from '../settings';
import { sound } from '../audio/sound';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { ProfileView } from './ProfileView';
import { DailyStreak, EveningChest, EventBanner, HappyHourBanner } from './Progression';
import type { DuelPlay } from './ChallengeScreen';
import { QuestsPanel } from './AccountScreens';
import { DieCube } from './DiceCollection';
import { NewsTicker } from './Friends';
import { NotifBell, NotifPanel, useNotifications } from './Social';
import { HeroTray } from './HeroTray';
import { STANDALONE } from './Screens';
import { MessagesButton } from './Messages';
import { DISCORD_RESULTS, DiscordCard, takeDiscordReturn, useDiscord } from './Discord';
import { ChestArt, GiftArt, Rays, RewardBurst, ScrollArt, TicketArt } from './illustrations';
import { Sheet } from './kit';
import { inTime, tournamentInfo, useCfPeek, useGroschenPeek, useOnlineCount, useProgramme } from './menuData';
import { GROSCHEN_DAILY } from '../../../shared/dixmille/groschen';


export interface HomeProps {
  profile: Profile; pa: ProfileApi; avatar: string; displayName: string; settings: Settings; onChangeSettings: (s: Settings) => void;
  /** Les trois jeux. */
  onClassic: () => void; onCards: () => void; onDixMille: () => void;
  /** Le général. */
  onShop: () => void; onAccount: () => void; onLogin: () => void;
  /** Collection de dés ; `open` : ouvrir tout de suite un sac (écran d'ouverture). */
  onCollection: (open?: boolean) => void; onFriends: () => void; onMessages: () => void;
  onSettings: () => void; onSandbox: () => void; onLegal: () => void; onPass: () => void; onStats: () => void; onClub: () => void;
  onDuels: () => void; onRecap: () => void; onChangelog: () => void; onDuelPlay: (d: DuelPlay) => void; openNotifs?: boolean;
  onAdmin?: () => void; onModeration?: () => void;
  /** Le 421 (trouvé aussi par la recherche du menu « Plus »). */
  onLeaderboard: () => void; onRules: () => void; onTutorial: () => void; onTournaments: () => void; onAlbum: () => void;
  onParty: () => void; onOnline: () => void; onChallenge: () => void;
  /** Partie à reprendre (421 ou Courtisan). */
  resume: { code: string; tournament?: boolean; courtisan?: boolean } | null; onResume: () => void;
  /** Tournoi programmé dont le salon est ouvert (le joueur y est inscrit). */
  onJoinScheduled?: (code: string, pay: boolean) => void;
  /** Notifications et Discord : chargés une fois par l'application (la barre du bas s'en sert aussi). */
  notif: ReturnType<typeof useNotifications>; discord: ReturnType<typeof useDiscord>;
}

type SheetKind = 'coffre' | 'cadeau' | 'missions' | 'discord';

/** Grande entrée d'un jeu : illustration, nom, ce qui l'attend. */
function ModeCard({ tone, title, art, status, hot, badge, onClick }: {
  tone: 'classique' | 'cartes' | 'dixmille'; title: string; art: React.ReactNode; status: React.ReactNode; hot?: boolean; badge?: string; onClick: () => void;
}) {
  return (
    <button className={`mm-mode ${tone}${hot ? ' hot' : ''}`} onClick={onClick}>
      <span className="mm-mode-art" aria-hidden>{art}</span>
      <span className="mm-mode-text"><b>{title}</b><small>{status}</small></span>
      {badge ? <em className="mm-mode-badge">{badge}</em> : <svg className="mm-mode-go" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>}
    </button>
  );
}

export function Home(props: HomeProps) {
  const { pa, profile } = props;
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const { notifs, reload } = props.notif;
  const [showNotifs, setShowNotifs] = useState(!!props.openNotifs);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  const online = useOnlineCount();
  const prog = useProgramme(pa.token);
  const cf = useCfPeek(pa);
  const gr = useGroschenPeek(pa);
  // Ouverture animée du coffre et du cadeau (le toast donne toujours le détail).
  const [burst, setBurst] = useState<{ kind: 'chest' | 'gift'; phase: 'opening' | 'open'; title?: string; detail?: string } | null>(null);
  const closeBurst = useCallback(() => setBurst(null), []);
  const { discord, reload: reloadDiscord } = props.discord;
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

  // --- Récompenses générales du jour ----------------------------------------------------------------
  const chestLeft = chestWait(profile, now);
  const daily = dailyStatus(profile);
  const quests = questsFor(profile.quests, day);
  const qDefs = dailyQuests(day);
  const qReady = qDefs.filter((d) => (quests.progress[d.id] ?? 0) >= d.target && !quests.claimed.includes(d.id)).length;
  const qDone = qDefs.filter((d) => quests.claimed.includes(d.id)).length;
  const season = seasonOf(profile);
  const pass = passProgress(season.points);
  const passReady = Array.from({ length: pass.tier }, (_, i) => i + 1).filter((t) => !season.claimed.includes(t)).length;
  const hLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const bags = profile.bags ?? 0;
  const coll = collectionCount(profile);
  // Dernier dé de collection obtenu (le profil garde l'ordre d'arrivée).
  const lastDie = [...profile.owned].reverse().find((id) => id.startsWith('dc-'))?.replace('-brillant', '') ?? null;

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
  const rewards: { id: string; title: string; sub: React.ReactNode; hot: boolean; badge?: string; art: React.ReactNode; go: () => void }[] = [
    { id: 'cadeau', title: 'Cadeau', hot: daily.canClaim, badge: daily.canClaim ? `J${daily.cycleDay}` : undefined, art: <GiftArt size={36} />,
      sub: daily.canClaim ? `+${DAILY_REWARDS[daily.cycleDay - 1].coins} pièces` : 'demain', go: () => (daily.canClaim ? void claimDaily() : setSheet('cadeau')) },
    { id: 'coffre', title: 'Coffre', hot: chestLeft === 0, badge: chestLeft === 0 ? '!' : undefined, art: <ChestArt open={chestLeft === 0} size={38} />,
      sub: chestLeft === 0 ? 'Ouvrir' : hLeft(chestLeft), go: () => (chestLeft === 0 ? void openChest() : setSheet('coffre')) },
    { id: 'missions', title: 'Défis du jour', hot: qReady > 0, badge: qReady ? String(qReady) : undefined, art: <ScrollArt size={34} done={qDone + qReady} total={qDefs.length} />,
      sub: qReady ? 'à récupérer' : `${qDone}/${qDefs.length} faits`, go: () => setSheet('missions') },
    { id: 'pass', title: 'Pass', hot: passReady > 0, badge: passReady ? String(passReady) : undefined, art: <TicketArt size={38} label={pass.tier} />,
      sub: `Palier ${pass.tier}`, go: props.onPass },
  ];
  const ready = rewards.filter((r) => r.hot).length;

  // --- Une seule bannière : la plus utile ---------------------------------------------------------------
  const ev = activeEvent(day) || coinBoost(day);
  const banner = (() => {
    if (props.resume && !STANDALONE) return <button className="home-banner resume" onClick={props.onResume}><Icon name="resume" size={20} /><span><b>{props.resume.tournament ? 'Tournoi du 421 en cours' : props.resume.courtisan ? 'Partie du Courtisan en cours' : 'Partie de 421 en cours'}</b><small>Table {props.resume.code}</small></span><em>Reprendre</em></button>;
    const salon = prog?.slots.find((x) => x.status === 'salon' && x.registered && x.code);
    if (salon && props.onJoinScheduled) return <button className="home-banner resume" onClick={() => props.onJoinScheduled!(salon.code!, false)}><Icon name="trophy" size={20} /><span><b>Votre tournoi de {salon.hour} h commence !</b><small>Le salon est ouvert : rejoignez-le</small></span><em>Rejoindre</em></button>;
    if (pa.welcomeBack) return <button className="home-banner gift" onClick={() => { pa.dismissWelcome(); props.onCollection(true); }}><Icon name="gift" size={20} /><span><b>Content de vous revoir !</b><small>Un sac de dés vous attend dans la Collection.</small></span></button>;
    if (!STANDALONE && !pa.isAccount) return <button className="home-banner account" onClick={props.onAccount}><Icon name="key" size={20} /><span><b>Gardez votre progression</b><small>Compte gratuit : amis, classements, tous les jeux</small></span><em>Créer</em></button>;
    if (happyHour(now)) return <HappyHourBanner />;
    if (ev) return <EventBanner onShop={props.onShop} />;
    if (acc && discord?.invite && discord.verify && !discord.claimed) return <button className="home-banner discord" onClick={() => setSheet('discord')}><BagIcon size={26} color="bleu" /><span><b>Rejoignez le Discord du jeu</b><small>Un sac de dés offert, une fois vérifié</small></span><em>Voir</em></button>;
    return null;
  })();

  // --- Les trois jeux : ce qui les attend ---------------------------------------------------------------
  const t = tournamentInfo(prog, now);
  const classicRes = props.resume && !props.resume.courtisan && !STANDALONE;
  const classic = classicRes ? { status: <><b className="mm-hot">Partie en cours</b> · table {props.resume!.code}</>, hot: true }
    : !STANDALONE && t.registered ? { status: <><b className="mm-hot">Inscrit</b> · tournoi de {t.label} {t.open ? '· salon ouvert' : inTime(t.minutes)}</>, hot: t.open, badge: t.open ? 'Go !' : undefined }
    : { status: STANDALONE ? 'Contre l’ordinateur, entre amis' : <>{online != null && <><i className="live-dot" aria-hidden />{online} en ligne · </>}Tournoi {t.label} {inTime(t.minutes)}</> };
  const cardsSt = !acc ? { status: 'Le 421 aux cartes · essai gratuit' }
    : !cf ? { status: 'Bluff, fouine et coups bas' }
    : !cf.discovered ? { status: <><b className="mm-hot">Nouveau</b> · 3 boosters offerts</>, hot: true, badge: 'Nouveau' }
    : cf.boosters > 0 ? { status: <><b className="mm-hot">{cf.boosters} booster{cf.boosters > 1 ? 's' : ''}</b> à ouvrir{cf.division ? ` · ${cf.division}` : ''}</>, hot: true, badge: String(cf.boosters) }
    : { status: `${cf.division ?? 'Ligue'} · missions ${cf.missionsDone}/${cf.missions}` };
  const courtRes = props.resume?.courtisan && !STANDALONE;
  const courtSt = courtRes ? { status: <><b className="mm-hot">Partie en cours</b> · table {props.resume!.code}</>, hot: true }
    : gr?.giftReady ? { status: <><b className="mm-hot">Cadeau du jour</b> : +{GROSCHEN_DAILY} Groschen</>, hot: true, badge: `+${GROSCHEN_DAILY}` }
    : gr ? { status: `${gr.balance.toLocaleString('fr-BE')} Groschen · 2 à 6 joueurs` }
    : { status: 'Le Dix mille à 6 dés' };

  return (
    <div className="home2 v2 main-menu">
      <header className="h2-bar">
        <button className="h2-me" onClick={() => setShowProfile(true)} aria-label="Mon profil">
          <Avatar photo={pa.photo} emoji={props.avatar} size={42} accessory={accessoryEmoji(profile.equipped.accessoire)} />
          <span className="h2-me-text">
            <span><b>{name}</b><em>Niv. {li.level}</em></span>
            <span className="h2-coins" title="Pièces : la monnaie du jeu, pour la boutique"><i aria-hidden />{profile.coins.toLocaleString('fr-BE')}<small>pièces</small></span>
          </span>
        </button>
        {!STANDALONE && !pa.isAccount && <button className="h2-login" onClick={props.onLogin}>Connexion</button>}
        {acc && <MessagesButton pa={pa} onOpen={props.onMessages} />}
        {acc && <NotifBell count={notifs?.count ?? 0} onOpen={() => { setShowNotifs(true); reload(); }} />}
      </header>

      <main className="mm-main">
        {banner}
        {/* Vitrine 3D : le bac du joueur, avec ses dés (on peut lancer) */}
        <section className="h2-hero mm-hero">
          <HeroTray pa={pa} settings={props.settings} />
          <h1 className="mm-brand"><span className="plaque" aria-hidden>421</span><span aria-hidden>online</span><span className="sr-only">421 en ligne : jeux de dés et de cartes multijoueurs gratuits</span></h1>
          {titleLabel(profile.title) && <span className="h2-title-chip">{titleLabel(profile.title)}</span>}
          {!STANDALONE && <div className="h2-news"><NewsTicker /></div>}
        </section>

        <nav className="mm-modes" aria-label="Les jeux">
          <ModeCard tone="classique" title="421 classique" onClick={props.onClassic} {...classic}
            art={<span className="mm-plate">421</span>} />
          <ModeCard tone="cartes" title="Coups Fourrés" onClick={props.onCards} {...cardsSt}
            art={<span className="mm-fan"><i className="h" /><i className="v" /><i className="p" /></span>} />
          <ModeCard tone="dixmille" title="Le Courtisan" onClick={props.onDixMille} {...courtSt}
            art={<span className="mm-dice"><DieCube id={profile.equipped.dice} size={30} /></span>} />
        </nav>

        {/* Sacs de dés et collection : bien en vue (communs aux trois jeux). */}
        {!STANDALONE && <section className="mm-coll" aria-label="Sacs de dés et collection">
          <button className={`mm-bags${bags > 0 ? ' on' : ''}`} onClick={() => props.onCollection(bags > 0)}>
            <span className="mm-bags-art" aria-hidden><BagIcon size={46} />{bags > 0 && <em className="mm-bags-n">{bags > 99 ? '99+' : bags}</em>}</span>
            <span className="mm-coll-text">
              <b>Sacs de dés</b>
              <small className={bags > 0 ? 'mm-hot' : ''}>{bags > 0 ? (acc ? `${bags} à ouvrir ›` : `${bags} gardé${bags > 1 ? 's' : ''} ›`) : 'À gagner en jouant'}</small>
            </span>
            {bags > 0 && <i className="mm-bags-go">{acc ? 'Ouvrir' : 'Voir'}</i>}
          </button>
          <button className="mm-dicecoll" onClick={() => props.onCollection()}>
            <span className="mm-dicecoll-art" aria-hidden><DieCube id={lastDie ?? 'dc-dragon'} size={34} spin={!!lastDie} locked={!lastDie} /></span>
            <span className="mm-coll-text">
              <b>Collection</b>
              <small>{coll.owned}/{coll.total} dés</small>
              <span className="tile-bar"><i style={{ width: `${(100 * coll.owned) / Math.max(1, coll.total)}%` }} /></span>
            </span>
          </button>
        </section>}

        <section className="v2-shelf tex-wood mm-shelf" aria-label={ready ? `Récompenses du jour : ${ready} à récupérer` : 'Récompenses du jour'}>
          {rewards.map((r) => (
            <button key={r.id} className={`v2-rw${r.hot ? ' on' : ''}`} onClick={r.go} aria-label={`${r.title}${r.hot ? ' : prêt' : ''}`}>
              <span className="v2-medal">{r.hot && <Rays />}{r.art}</span>
              {r.badge && <em className="v2-cnt">{r.badge}</em>}
              <b>{r.title}</b>
              <small>{r.sub}</small>
            </button>
          ))}
        </section>
      </main>


      {toast && <div className="h2-toast" role="status">{toast}</div>}
      {burst && <RewardBurst kind={burst.kind} phase={burst.phase} title={burst.title} detail={burst.detail} onClose={closeBurst} />}
      {sheet === 'discord' && discord && <Sheet title="Discord" onClose={() => { setSheet(null); setDiscordMsg(null); }}>{discordMsg && <p className={`discord-msg${discordMsg.ok ? ' ok' : ''}`}>{discordMsg.text}</p>}<DiscordCard pa={pa} state={discord} onAccount={() => { setSheet(null); props.onAccount(); }} /></Sheet>}
      {sheet === 'coffre' && <Sheet title="Coffre du comptoir" onClose={() => setSheet(null)}><EveningChest pa={pa} /></Sheet>}
      {sheet === 'cadeau' && <Sheet title="Cadeau du jour" onClose={() => setSheet(null)}><DailyStreak pa={pa} /></Sheet>}
      {sheet === 'missions' && <Sheet title="Défis du jour" onClose={() => setSheet(null)}><QuestsPanel profile={profile} onClaim={pa.claim} /></Sheet>}
      {showNotifs && <NotifPanel pa={pa} notifs={notifs} reload={reload} onClose={() => { setShowNotifs(false); reload(); }}
        onPlay={(d) => { setShowNotifs(false); props.onDuelPlay(d); }} onDuels={() => { setShowNotifs(false); props.onDuels(); }} />}
      {showProfile && <ProfileView pa={pa} displayName={props.displayName} avatar={props.avatar} onClose={() => setShowProfile(false)} />}
    </div>
  );
}
