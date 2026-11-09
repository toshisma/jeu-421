/**
 * Menu du 421 classique : seulement ce qui concerne le 421. Jouer (contre l'ordinateur, en ligne,
 * entre amis sur un téléphone), tournois (programmés de 11 h et 21 h, tournois perso), Patron de la
 * semaine, défi du jour, classement (saisons et divisions), album, règles et partie guidée.
 * Tout le général (profil, amis, boutique, collection, réglages…) est dans le menu principal.
 */
import { useEffect, useState } from 'react';
import type { Profile } from '../../../shared/progress/profile';
import { bossOfWeek, weekKey } from '../../../shared/progress/boss';
import { today } from '../../../shared/progress/quests';
import type { ProfileApi } from '../account/useProfile';
import { loadChallengeDone } from '../account/useProfile';
import type { Settings } from '../settings';
import { Icon } from './Icon';
import { ModeBar, ModeChip } from './ModeBar';
import { Sheet } from './kit';
import { HeroTray } from './HeroTray';
import { BossCard } from './Progression';
import { ChallengeCard } from './ChallengeScreen';
import { OpenLobbies, FriendsButton, NewsTicker } from './Friends';
import { ScheduledCard } from './Scheduled';
import { STANDALONE } from './Screens';
import { TableArt, TargetArt, TopHatArt, TrophyArt } from './illustrations';
import { inTime, tournamentInfo, useLiveTables, useOnlineCount, useOpenLobbies, useProgramme } from './menuData';
import { tr } from '../i18n/lang';
import { botName, trn } from '../i18n/g421';
import type { MessageKey } from '../../../shared/i18n';

export interface ClassicMenuProps {
  profile: Profile; pa: ProfileApi; settings: Settings;
  /** Retour au menu principal. */
  onBack: () => void;
  onSolo: () => void; onOnline: () => void; onQuick?: () => void; onParty: () => void; onTournaments: () => void;
  onRules: () => void; onTutorial: () => void; onChallenge: () => void; onBoss: () => void; onAlbum: () => void;
  onLeaderboard: () => void; onStats: () => void; onAccount: () => void; onFriends: () => void;
  onJoinRoom: (code: string) => void;
  onJoinScheduled?: (code: string, pay: boolean) => void;
  /** Partie du 421 à reprendre (table en ligne ou tournoi). */
  resume: { code: string; tournament?: boolean } | null; onResume: () => void;
}

/** Pages de guide du 421 (référencement) : liens texte visibles, utiles aux joueurs comme à Google. */
export const GUIDES_421: [string, string][] = [
  ['/jouer-au-421-en-ligne', 'g421.menu.g1'], ['/regles-du-421', 'g421.menu.g2'], ['/combinaisons-du-421', 'g421.menu.g3'],
  ['/strategie-421', 'g421.menu.g4'], ['/421-entre-amis', 'g421.menu.g5'], ['/jeux-entre-amis-a-distance', 'g421.menu.g6'],
  ['/jeu-multijoueur-navigateur', 'g421.menu.g7'], ['/jeux-de-des', 'g421.menu.g8'],
];

const FACE_COLORS = ['#5b8cff', '#b06ad9', '#3fbf8a', '#e8964a', '#ef5a52'];

export function ClassicMenu(props: ClassicMenuProps) {
  const { pa, profile } = props;
  const [sheet, setSheet] = useState<'tournoi' | 'patron' | 'defi' | 'lobbies' | null>(null);
  const [now, setNow] = useState(Date.now());
  const [netOk, setNetOk] = useState(navigator.onLine);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const up = () => setNetOk(true), down = () => setNetOk(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const online = useOnlineCount();
  const live = useLiveTables();
  const lobbies = useOpenLobbies();
  const prog = useProgramme(pa.token);
  const acc = pa.isAccount && !STANDALONE;
  const day = today();
  const boss = bossOfWeek(day);
  const bossBeaten = profile.bossWeek === weekKey(day);
  const chal = loadChallengeDone();
  const chalDone = chal?.day === day;
  const t = tournamentInfo(prog, now);

  // Une seule bannière : la plus utile.
  const banner = (() => {
    if (props.resume && !STANDALONE) return <button className="home-banner resume" onClick={props.onResume}><Icon name="resume" size={20} /><span><b>{tr(props.resume.tournament ? 'g421.menu.resumeT' : 'g421.menu.resumeG')}</b><small>{tr('g421.menu.tableN', { code: props.resume.code })}</small></span></button>;
    const salon = prog?.slots.find((x) => x.status === 'salon' && x.registered && x.code);
    if (salon && props.onJoinScheduled) return <button className="home-banner resume" onClick={() => props.onJoinScheduled!(salon.code!, false)}><Icon name="trophy" size={20} /><span><b>{tr('g421.menu.tourStart', { h: tr('g421.hour', { h: salon.hour }) })}</b><small>{tr('g421.menu.lobbyOpen')}</small></span><em>{tr('g421.menu.join')}</em></button>;
    if (!profile.tutorial) return <button className="home-banner tuto" onClick={props.onTutorial}><Icon name="resume" size={20} /><span><b>{tr('g421.menu.newT')}</b><small>{tr('g421.menu.newS')}</small></span><em>{tr('g421.menu.plus50')}</em></button>;
    if (lobbies > 0 && netOk) return <button className="home-banner lobbies" onClick={() => setSheet('lobbies')}><Icon name="people" size={20} /><span><b>{lobbies > 1 ? tr('g421.menu.manyWait', { n: lobbies }) : tr('g421.menu.oneWait')}</b><small>{tr('g421.menu.joinOpen')}</small></span><em>{tr('g421.menu.see')}</em></button>;
    return null;
  })();

  const liveLine = lobbies > 0 ? trn('g421.menu.tablesWait', lobbies)
    : live.games > 0 ? trn('g421.menu.gamesOn', live.games) : tr('g421.menu.openOne');
  const extra = online != null ? Math.max(0, online - live.faces.length) : 0;

  const events = [
    ...(!STANDALONE ? [{ id: 'tournoi', title: tr('g421.menu.tournoi'), art: <TrophyArt size={46} />, tone: 'blue', hot: t.open && t.registered,
      tag: t.registered ? tr(t.open ? 'g421.menu.go' : 'g421.menu.registered') : tr('g421.hour', { h: parseInt(t.label, 10) }), tagGold: !t.registered,
      sub: t.open ? `${tr('g421.menu.lobbyOpenLow')}${t.count != null ? ` · ${trn('g421.menu.players', t.count)}` : ''}` : inTime(t.minutes),
      go: () => (props.onJoinScheduled ? setSheet('tournoi') : props.onTournaments()) }] : []),
    { id: 'patron', title: tr('g421.menu.patron'), art: <TopHatArt size={46} />, tone: 'felt', hot: false, tag: bossBeaten ? tr('g421.menu.beaten') : undefined, tagGold: false,
      sub: `${botName(boss.name)} · ${tr(bossBeaten ? 'g421.menu.beatenLow' : 'g421.menu.toBeat')}`, go: () => setSheet('patron') },
    { id: 'defi', title: tr('g421.menu.defi'), art: <TargetArt size={46} />, tone: 'felt', hot: false, tag: undefined, tagGold: false,
      sub: chalDone ? trn('g421.ptLong', chal!.points) : tr('g421.menu.oneTry'), go: () => setSheet('defi') },
  ];

  return (
    <div className="home2 v2 classic-menu">
      <ModeBar tone="classique" title={tr('g421.menu.title')} onBack={props.onBack}>
        {online !== null && <ModeChip onClick={props.onStats} label={trn('g421.menu.onlineStats', online)}><i className="live-dot" aria-hidden />{online}</ModeChip>}
        {acc && <FriendsButton pa={pa} onOpen={props.onFriends} />}
        <button className="icon-btn mode-rules" onClick={props.onRules} aria-label={tr('g421.menu.rulesAria')}><Icon name="rules" size={20} /></button>
      </ModeBar>

      <main className="h2-main">
        {banner}
        {/* Vitrine 3D et partie contre l'ordinateur */}
        <section className="h2-hero">
          <HeroTray pa={pa} settings={props.settings} />
          <h1 className="plaque h2-plaque"><span aria-hidden>421</span><span className="sr-only">{tr('g421.menu.sr')}</span></h1>
          {!STANDALONE && <div className="h2-news"><NewsTicker /></div>}
          <button className="h2-play" onClick={props.onSolo}><Icon name="dice" size={26} /><span>{tr('g421.menu.playCpu')}</span><Icon name="back" size={20} /></button>
        </section>

        {/* Jeu en ligne : la grande carte rouge et or */}
        {STANDALONE ? <p className="note">{tr('g421.menu.standalone')}</p> : (
          <section className="v2-multi" aria-label={tr('g421.menu.online')}>
            <span className="v2-multi-art"><TableArt size={70} /></span>
            <div className="v2-multi-body">
              <div className="v2-multi-head"><b>{tr('g421.menu.online')}</b></div>
              <button className="v2-multi-who" onClick={() => (lobbies > 0 ? setSheet('lobbies') : props.onOnline())} disabled={!netOk}>
                {live.faces.length > 0 && <span className="v2-faces" aria-hidden>
                  {live.faces.slice(0, 3).map((f, i) => <span key={i} className="v2-face" style={{ background: FACE_COLORS[i % FACE_COLORS.length] }}>{f.avatar}</span>)}
                  {extra > 0 && <span className="v2-face more">+{extra > 99 ? 99 : extra}</span>}
                </span>}
                <span>{liveLine}</span>
              </button>
              <div className="v2-multi-btns">
                {props.onQuick && <button className="v2-mbtn gold v2-quick" onClick={props.onQuick} disabled={!netOk}><Icon name="dice" size={17} />{tr('g421.menu.quick')}</button>}
                <button className={`v2-mbtn ${props.onQuick ? 'ghost v2-tables' : 'gold'}`} onClick={props.onOnline} disabled={!netOk} aria-label={tr('g421.menu.tablesAria')}>{tr('g421.menu.tables')}</button>
              </div>
            </div>
          </section>
        )}
        {!netOk && !STANDALONE && <p className="note">{tr('g421.menu.offline')}</p>}

        {/* Rendez-vous du 421 */}
        <section className="v2-events" aria-label={tr('g421.menu.rdv')}>
          {events.map((e) => (
            <button key={e.id} className={`v2-ev ${e.tone}${e.hot ? ' hot' : ''}`} onClick={e.go}>
              {e.tag && <em className={`v2-tag${e.tagGold ? ' gold' : ''}`}>{e.tag}</em>}
              <span className="v2-ev-art">{e.art}</span>
              <b>{e.title}</b>
              <small>{e.sub}</small>
            </button>
          ))}
        </section>

        {/* Le reste du 421, en une rangée */}
        <nav className="cm-links" aria-label={tr('g421.menu.moreAria')}>
          <button onClick={props.onParty}><Icon name="cheers" size={22} /><span>{tr('g421.menu.friends')}<small>{tr('g421.menu.onePhone')}</small></span></button>
          {!STANDALONE && <button onClick={props.onLeaderboard}><Icon name="chart" size={22} /><span>{tr('g421.menu.rank')}<small>{tr('g421.menu.season')}</small></span></button>}
          <button onClick={props.onAlbum}><Icon name="album" size={22} /><span>{tr('g421.menu.album')}<small>{tr('g421.menu.combos')}</small></span></button>
          <button onClick={props.onTutorial}><Icon name="resume" size={22} /><span>{tr('g421.menu.tuto')}<small>{tr('g421.menu.min3')}</small></span></button>
        </nav>
        {!STANDALONE && <nav className="h2-guides" aria-label={tr('g421.menu.guides')}>{GUIDES_421.map(([href, label]) => <a key={href} href={href}>{tr(label as MessageKey)}</a>)}</nav>}
      </main>

      {sheet === 'tournoi' && props.onJoinScheduled && <Sheet title={tr('g421.menu.tourTitle')} onClose={() => setSheet(null)}>
        <ScheduledCard pa={pa} onJoin={(c, pay) => { setSheet(null); props.onJoinScheduled!(c, pay); }} onAccount={() => { setSheet(null); props.onAccount(); }} />
        {/* Tournois perso (créés par les joueurs) : bien visibles sous le tournoi programmé. */}
        <button className="btn secondary wide" style={{ marginTop: 10 }} onClick={() => { setSheet(null); props.onTournaments(); }}><Icon name="trophy" size={18} /> {tr('g421.menu.tourPerso')}</button>
      </Sheet>}
      {sheet === 'patron' && <Sheet title={tr('g421.menu.patronW')} onClose={() => setSheet(null)}><BossCard pa={pa} onPlay={() => { setSheet(null); props.onBoss(); }} /></Sheet>}
      {sheet === 'defi' && <Sheet title={tr('g421.menu.defi')} onClose={() => setSheet(null)}><ChallengeCard onOpen={() => { setSheet(null); props.onChallenge(); }} /></Sheet>}
      {sheet === 'lobbies' && <Sheet title={tr('g421.menu.openLobbies')} onClose={() => setSheet(null)}><OpenLobbies onJoin={props.onJoinRoom} onAll={props.onOnline} /></Sheet>}
    </div>
  );
}
