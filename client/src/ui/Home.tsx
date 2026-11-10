import { titleL } from '../i18n/data';
import { loc, tr } from '../i18n/lang';
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
import { DAILY_REWARDS, chestWait, collectionCount, dailyStatus, levelInfo, passProgress, seasonOf, type Profile } from '../../../shared/progress/profile';
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
import { showQuickPlay } from '../quickPlay';


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
  /** Partie express « Lancer les dés » (421 contre un ordinateur, réglages par défaut), mise en avant pour les débutants. */
  onQuickPlay?: () => void;
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

/** « Lancer les dés » : l'action principale d'un tout premier visiteur (une partie en un geste). */
function QuickPlayBanner({ onClick }: { onClick: () => void }) {
  return (
    <button className="home-banner quickplay" onClick={onClick} aria-label={tr('acc.quick.aria')}>
      <span className="qp-dice" aria-hidden><Icon name="dice" size={24} /></span>
      <span><b>{tr('acc.quick.title')}</b><small>{tr('acc.quick.sub')}</small></span>
      <em>{tr('acc.quick.go')}</em>
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
    setDiscordMsg({ ok: r === 'ok', text: DISCORD_RESULTS()[r] ?? DISCORD_RESULTS().erreur });
    setSheet('discord');
    if (r === 'ok') { sound.treasure(); pa.refresh(); reloadDiscord(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const li = levelInfo(profile.xp);
  const name = pa.session?.username ?? (props.displayName || tr('app.invite'));
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
  const hLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return m < 60 ? tr('app.min', { m }) : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const bags = profile.bags ?? 0;
  const coll = collectionCount(profile);
  // Dernier dé de collection obtenu (le profil garde l'ordre d'arrivée).
  const lastDie = [...profile.owned].reverse().find((id) => id.startsWith('dc-'))?.replace('-brillant', '') ?? null;

  const openChest = async () => {
    sound.unlock(); sound.rattle();
    setBurst({ kind: 'chest', phase: 'opening' });
    const [r] = await Promise.all([pa.openEveningChest(), new Promise((ok) => setTimeout(ok, 650))]);
    if ('error' in r) { setBurst(null); setToast(r.error); return; }
    sound.treasure(); setToast(tr('app.coffre_pieces', { coins: r.coins, v: r.bag ? tr('app.et_un_sac_de_des') : '' }));
    setBurst({ kind: 'chest', phase: 'open', title: tr('app.pieces', { coins: r.coins }), detail: r.bag ? tr('app.et_un_sac_de_des_2') : tr('app.coffre_du_comptoir') });
  };
  const claimDaily = async () => {
    const r = DAILY_REWARDS[daily.cycleDay - 1];
    sound.unlock();
    setBurst({ kind: 'gift', phase: 'opening' });
    const [err] = await Promise.all([pa.claimDailyReward(), new Promise((ok) => setTimeout(ok, 550))]);
    if (err) { setBurst(null); setToast(err); return; }
    sound.chips(daily.cycleDay === 7 ? 8 : 3);
    setToast(tr('app.cadeau_du_jour_pieces', { coins: r.coins, v: r.xp ? tr('app.et_xp', { xp: r.xp }) : '' }));
    setBurst({ kind: 'gift', phase: 'open', title: tr('app.pieces', { coins: r.coins }), detail: r.xp ? tr('app.et_xp_jour', { xp: r.xp, cycleDay: daily.cycleDay }) : tr('app.jour', { cycleDay: daily.cycleDay }) });
  };
  const rewards: { id: string; title: string; sub: React.ReactNode; hot: boolean; badge?: string; art: React.ReactNode; go: () => void }[] = [
    { id: 'cadeau', title: tr('app.cadeau'), hot: daily.canClaim, badge: daily.canClaim ? tr('app.m_j', { n: daily.cycleDay }) : undefined, art: <GiftArt size={36} />,
      sub: daily.canClaim ? tr('app.pieces', { coins: DAILY_REWARDS[daily.cycleDay - 1].coins }) : 'demain', go: () => (daily.canClaim ? void claimDaily() : setSheet('cadeau')) },
    { id: 'coffre', title: tr('app.coffre'), hot: chestLeft === 0, badge: chestLeft === 0 ? '!' : undefined, art: <ChestArt open={chestLeft === 0} size={38} />,
      sub: chestLeft === 0 ? tr('app.ouvrir') : hLeft(chestLeft), go: () => (chestLeft === 0 ? void openChest() : setSheet('coffre')) },
    { id: 'missions', title: tr('app.m_daily_short'), hot: qReady > 0, badge: qReady ? String(qReady) : undefined, art: <ScrollArt size={34} done={qDone + qReady} total={qDefs.length} />,
      sub: qReady ? tr('app.a_recuperer') : `${qDone}/${qDefs.length} faits`, go: () => setSheet('missions') },
    { id: 'pass', title: tr('app.pass'), hot: passReady > 0, badge: passReady ? String(passReady) : undefined, art: <TicketArt size={38} label={pass.tier} />,
      sub: tr('app.palier', { tier: pass.tier }), go: props.onPass },
  ];
  const ready = rewards.filter((r) => r.hot).length;

  // --- Une seule bannière : la plus utile ---------------------------------------------------------------
  const ev = activeEvent(day) || coinBoost(day);
  const banner = (() => {
    if (props.resume && !STANDALONE) return <button className="home-banner resume" onClick={props.onResume}><Icon name="resume" size={20} /><span><b>{props.resume.tournament ? tr('app.tournoi_du_421_en_cours') : props.resume.courtisan ? tr('app.partie_du_courtisan_en_cours') : tr('app.partie_de_421_en_cours')}</b><small>{tr('app.table')} {props.resume.code}</small></span><em>{tr('app.reprendre')}</em></button>;
    const salon = prog?.slots.find((x) => x.status === 'salon' && x.registered && x.code);
    if (salon && props.onJoinScheduled) return <button className="home-banner resume" onClick={() => props.onJoinScheduled!(salon.code!, false)}><Icon name="trophy" size={20} /><span><b>{tr('app.votre_tournoi_de_h_commence', { hour: salon.hour })}</b><small>{tr('app.le_salon_est_ouvert_rejoignez_le')}</small></span><em>{tr('app.rejoindre')}</em></button>;
    if (props.onQuickPlay && showQuickPlay(profile.stats.played)) return <QuickPlayBanner onClick={props.onQuickPlay} />;
    if (pa.welcomeBack) return <button className="home-banner gift" onClick={() => { pa.dismissWelcome(); props.onCollection(true); }}><Icon name="gift" size={20} /><span><b>{tr('app.content_de_vous_revoir')}</b><small>{tr('app.un_sac_de_des_vous_attend_dans')}</small></span></button>;
    if (!STANDALONE && !pa.isAccount) return <button className="home-banner account" onClick={props.onAccount}><Icon name="key" size={20} /><span><b>{tr('app.gardez_votre_progression')}</b><small>{tr('app.compte_gratuit_amis_classements_tous')}</small></span><em>{tr('app.creer')}</em></button>;
    if (happyHour(now)) return <HappyHourBanner />;
    if (ev) return <EventBanner onShop={props.onShop} />;
    if (acc && discord?.invite && discord.verify && !discord.claimed) return <button className="home-banner discord" onClick={() => setSheet('discord')}><BagIcon size={26} color="bleu" /><span><b>{tr('app.rejoignez_le_discord_du_jeu')}</b><small>{tr('app.un_sac_de_des_offert_une_fois')}</small></span><em>{tr('app.voir')}</em></button>;
    return null;
  })();

  // --- Les trois jeux : ce qui les attend ---------------------------------------------------------------
  const t = tournamentInfo(prog, now);
  const classicRes = props.resume && !props.resume.courtisan && !STANDALONE;
  const classic = classicRes ? { status: <><b className="mm-hot">{tr('app.partie_en_cours')}</b> {tr('app.table_2')} {props.resume!.code}</>, hot: true }
    : !STANDALONE && t.registered ? { status: <><b className="mm-hot">{tr('app.inscrit')}</b> {tr('app.tournoi_de')} {t.label} {t.open ? tr('app.salon_ouvert') : inTime(t.minutes)}</>, hot: t.open, badge: t.open ? tr('app.go') : undefined }
    : { status: STANDALONE ? tr('app.contre_l_ordinateur_entre_amis') : <>{online != null && <><i className="live-dot" aria-hidden />{online} {tr('app.en_ligne')} </>}{tr('app.tournoi')} {t.label} {inTime(t.minutes)}</> };
  const cardsSt = !acc ? { status: tr('app.le_421_aux_cartes_essai_gratuit') }
    : !cf ? { status: tr('app.bluff_fouine_et_coups_bas') }
    : !cf.discovered ? { status: <><b className="mm-hot">{tr('app.nouveau')}</b> {tr('app.3_boosters_offerts')}</>, hot: true, badge: tr('app.nouveau') }
    : cf.boosters > 0 ? { status: <><b className="mm-hot">{cf.boosters} {tr(cf.boosters > 1 ? 'app.booster.p' : 'app.booster')}</b> {tr('app.a_ouvrir')}{cf.division ? ` · ${cf.division}` : ''}</>, hot: true, badge: String(cf.boosters) }
    : { status: tr('app.missions', { v: cf.division ?? tr('app.ligue'), missionsDone: cf.missionsDone, missions: cf.missions }) };
  const courtRes = props.resume?.courtisan && !STANDALONE;
  const courtSt = courtRes ? { status: <><b className="mm-hot">{tr('app.partie_en_cours')}</b> {tr('app.table_2')} {props.resume!.code}</>, hot: true }
    : gr?.giftReady ? { status: <><b className="mm-hot">{tr('app.cadeau_du_jour')}</b>{tr('app.groschen', { GROSCHEN_DAILY })}</>, hot: true, badge: `+${GROSCHEN_DAILY}` }
    : gr ? { status: tr('app.groschen_2_a_6_joueurs', { v: gr.balance.toLocaleString(loc()) }) }
    : { status: tr('app.le_dix_mille_a_6_des') };

  return (
    <div className="home2 v2 main-menu">
      <header className="h2-bar">
        <button className="h2-me" onClick={() => setShowProfile(true)} aria-label={tr('app.mon_profil')}>
          <Avatar photo={pa.photo} emoji={props.avatar} size={42} accessory={accessoryEmoji(profile.equipped.accessoire)} />
          <span className="h2-me-text">
            <span><b>{name}</b><em>{tr('app.niv')} {li.level}</em></span>
            <span className="h2-coins" title={tr('app.pieces_la_monnaie_du_jeu_pour_la')}><i aria-hidden />{profile.coins.toLocaleString(loc())}<small>{tr('app.pieces_2')}</small></span>
          </span>
        </button>
        {!STANDALONE && !pa.isAccount && <button className="h2-login" onClick={props.onLogin}>{tr('app.connexion')}</button>}
        {acc && <MessagesButton pa={pa} onOpen={props.onMessages} />}
        {acc && <NotifBell count={notifs?.count ?? 0} onOpen={() => { setShowNotifs(true); reload(); }} />}
      </header>

      <main className="mm-main">
        {banner}
        {/* Vitrine 3D : le bac du joueur, avec ses dés (on peut lancer) */}
        <section className="h2-hero mm-hero">
          <HeroTray pa={pa} settings={props.settings} />
          <h1 className="mm-brand"><span className="plaque" aria-hidden>421</span><span aria-hidden>online</span><span className="sr-only">{tr('app.421_en_ligne_jeux_de_des_et')}</span></h1>
          {titleL(profile.title) && <span className="h2-title-chip">{titleL(profile.title)}</span>}
          {!STANDALONE && <div className="h2-news"><NewsTicker /></div>}
        </section>

        <nav className="mm-modes" aria-label={tr('app.les_jeux')}>
          <ModeCard tone="classique" title={tr('app.421_classique')} onClick={props.onClassic} {...classic}
            art={<span className="mm-plate">421</span>} />
          <ModeCard tone="cartes" title="Coups Fourrés" onClick={props.onCards} {...cardsSt}
            art={<span className="mm-fan"><i className="h" /><i className="v" /><i className="p" /></span>} />
          <ModeCard tone="dixmille" title={tr('app.le_courtisan')} onClick={props.onDixMille} {...courtSt}
            art={<span className="mm-dice"><DieCube id={profile.equipped.dice} size={30} /></span>} />
        </nav>

        {/* Sacs de dés et collection : bien en vue (communs aux trois jeux). */}
        {!STANDALONE && <section className="mm-coll" aria-label={tr('app.sacs_de_des_et_collection')}>
          <button className={`mm-bags${bags > 0 ? ' on' : ''}`} onClick={() => props.onCollection(bags > 0)}>
            <span className="mm-bags-art" aria-hidden><BagIcon size={46} />{bags > 0 && <em className="mm-bags-n">{bags > 99 ? '99+' : bags}</em>}</span>
            <span className="mm-coll-text">
              <b>{tr('app.sacs_de_des')}</b>
              <small className={bags > 0 ? 'mm-hot' : ''}>{bags > 0 ? (acc ? tr('app.a_ouvrir_2', { bags }) : tr(bags > 1 ? 'app.garde.p' : 'app.garde', { bags })) : tr('app.a_gagner_en_jouant')}</small>
            </span>
            {bags > 0 && <i className="mm-bags-go">{acc ? tr('app.ouvrir') : tr('app.voir')}</i>}
          </button>
          <button className="mm-dicecoll" onClick={() => props.onCollection()}>
            <span className="mm-dicecoll-art" aria-hidden><DieCube id={lastDie ?? 'dc-dragon'} size={34} spin={!!lastDie} locked={!lastDie} /></span>
            <span className="mm-coll-text">
              <b>{tr('app.collection')}</b>
              <small>{coll.owned}{tr('app.des', { total: coll.total })}</small>
              <span className="tile-bar"><i style={{ width: `${(100 * coll.owned) / Math.max(1, coll.total)}%` }} /></span>
            </span>
          </button>
        </section>}

        <section className="v2-shelf tex-wood mm-shelf" aria-label={ready ? tr('app.recompenses_du_jour_a_recuperer', { ready }) : tr('app.recompenses_du_jour')}>
          {rewards.map((r) => (
            <button key={r.id} className={`v2-rw${r.hot ? ' on' : ''}`} onClick={r.go} aria-label={`${r.title}${r.hot ? tr('app.pret') : ''}`}>
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
      {sheet === 'coffre' && <Sheet title={tr('app.coffre_du_comptoir')} onClose={() => setSheet(null)}><EveningChest pa={pa} /></Sheet>}
      {sheet === 'cadeau' && <Sheet title={tr('app.cadeau_du_jour')} onClose={() => setSheet(null)}><DailyStreak pa={pa} /></Sheet>}
      {sheet === 'missions' && <Sheet title={tr('app.defis_du_jour')} onClose={() => setSheet(null)}><QuestsPanel profile={profile} onClaim={pa.claim} /></Sheet>}
      {showNotifs && <NotifPanel pa={pa} notifs={notifs} reload={reload} onClose={() => { setShowNotifs(false); reload(); }}
        onPlay={(d) => { setShowNotifs(false); props.onDuelPlay(d); }} onDuels={() => { setShowNotifs(false); props.onDuels(); }} />}
      {showProfile && <ProfileView pa={pa} displayName={props.displayName} avatar={props.avatar} onClose={() => setShowProfile(false)} />}
    </div>
  );
}
