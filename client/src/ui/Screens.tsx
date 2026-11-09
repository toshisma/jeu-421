import { tr } from '../i18n/lang';
import { botName, describeCfg, rich, trCombo, trn, trTagline } from '../i18n/g421';
import { LangSwitch } from '../i18n/LangSwitch';
import { BossCard, DailyStreak, EveningChest, EventBanner, HappyHourBanner, PassSummary } from './Progression';
import { BagIcon } from './BagIcon';
import { reportUrl } from '../legal';
import type { MessageKey } from '../../../shared/i18n';
import { ChallengeCard } from './ChallengeScreen';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { titleLabel as titleLabelFn } from '../../../shared/progress/profile';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG, type GameConfig } from '../../../shared/config';
import { comboTable, evaluate } from '../../../shared/combos';
import type { Difficulty } from '../../../shared/ai';
import { AVATARS } from '../../../shared/protocol';
import { PERSONAS, type Persona } from '../game/personas';
import { sound } from '../audio/sound';
import type { Appearance } from '../../../shared/progress/catalog';
import { levelInfo, type Profile } from '../../../shared/progress/profile';
import type { Settings } from '../settings';
import { ConfigEditor } from './ConfigEditor';
import { InstallPrompt } from './InstallPrompt';
import { LiveStrip } from './StatsScreen';
import { CollectionPromo } from './DiceCollection';
import { ReferralCard } from './Referral';
import { FriendsButton, NewsTicker, OpenLobbies } from './Friends';
import { MessagesButton } from './Messages';
import { ScheduledCard } from './Scheduled';
import { changelogUnseen } from './Changelog';
import { CURRENT_VERSION } from '../../../shared/changelog';
import { fxDef } from '../../../shared/progress/dice-collection';
import { Celebration } from './Celebration';
import { NotifBell, NotifPanel, useNotifications } from './Social';
import type { DuelPlay } from './ChallengeScreen';
import { Icon } from './Icon';
import type { ProfileApi } from '../account/useProfile';
import { QuestsPanel } from './AccountScreens';
import { Avatar } from './Avatar';
import { ProfileView } from './ProfileView';
import { VolumeControl } from './VolumeControl';
import { needsMotionPermission, requestMotionPermission, useShakeToThrow } from '../game/shake';
import type { ThrowGesture } from '../../../shared/gesture';
import { DiceRow, MiniDie } from './MiniDie';
import { DiceTray, type DiceTrayHandle } from './DiceTray';

export const STANDALONE = typeof __STANDALONE__ !== 'undefined' && __STANDALONE__;

/** En-tête commun des écrans de menu : voir kit.tsx (réexporté ici pour les imports existants). */
import { BigAction, Choices, Section, Shell, Toggle } from './kit';
export { Shell };

// ---------------------------------------------------------------------------------------------

/** Niveau, barre d'XP et pièces du joueur. */
export function ProfileChip({ profile, onClick, photo, emoji }: { profile: Profile; onClick?: () => void; photo?: string | null; emoji?: string }) {
  const li = levelInfo(profile.xp);
  return (
    <button type="button" className="profile-chip" onClick={onClick} disabled={!onClick} title="Voir mon profil">
      {emoji !== undefined && <Avatar photo={photo} emoji={emoji} size={26} />}
      <span className="lvl">Niv. {li.level}</span>
      <span className="xpbar" title={`${li.into} / ${li.need} XP`}><i style={{ width: `${(100 * li.into) / li.need}%` }} /></span>
      <span className="xp">{profile.xp.toLocaleString('fr-BE')} XP</span>
      <span className="coins">{profile.coins.toLocaleString('fr-BE')} pièces</span>
    </button>
  );
}

export function Home(props: {
  profile: Profile; pa: ProfileApi; avatar: string; displayName: string; onShop: () => void; onAccount: () => void; onLeaderboard: () => void;
  onSolo: () => void; onOnline: () => void; onTournaments: () => void; onRules: () => void; onSettings: () => void; onSandbox: () => void; onLegal: () => void; onPass: () => void; onTutorial: () => void; onChallenge: () => void; onBoss: () => void; onParty: () => void; onClub: () => void; onAlbum: () => void; onRecap: () => void; onStats: () => void; onLogin: () => void; onCollection: () => void; onDuels: () => void; onFriends: () => void; onMessages?: () => void; onJoinScheduled?: (code: string, pay: boolean) => void; onChangelog: () => void; onJoinRoom: (code: string) => void; settings: Settings; onChangeSettings: (s: Settings) => void; onDuelPlay: (d: DuelPlay) => void; openNotifs?: boolean;
  resume: { code: string; tournament?: boolean } | null; onResume: () => void;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [showProfile, setShowProfile] = useState(false);
  const { notifs, reload } = useNotifications(props.pa);
  const [showNotifs, setShowNotifs] = useState(!!props.openNotifs);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const li = levelInfo(props.profile.xp);
  const name = props.pa.session?.username ?? (props.displayName || 'Invité');
  return (
    <div className="home">
      <header className="home-bar">
        <button className="me-btn" onClick={() => setShowProfile(true)} aria-label="Mon profil">
          <Avatar photo={props.pa.photo} emoji={props.avatar} size={40} accessory={accessoryEmoji(props.profile.equipped.accessoire)} />
          <span className="me-text">
            <b>{name}</b>
            <span>Niveau {li.level}{titleLabelFn(props.profile.title) ? `, ${titleLabelFn(props.profile.title)}` : ''}</span>
          </span>
        </button>
        {!STANDALONE && !props.pa.isAccount && <button className="install-chip login-chip" onClick={props.onLogin}>Connexion</button>}
        <div className="home-audio"><VolumeControl settings={props.settings} onSettings={props.onChangeSettings} /></div>
        {!STANDALONE && props.pa.isAccount && <div className="home-social">
          <FriendsButton pa={props.pa} onOpen={props.onFriends} />
          {props.onMessages && <MessagesButton pa={props.pa} onOpen={props.onMessages} />}
        </div>}
        {!STANDALONE && props.pa.isAccount && <NotifBell count={notifs?.count ?? 0} onOpen={() => { setShowNotifs(true); reload(); }} />}
        <InstallPrompt compact />
        <div className="wallet" aria-label="Mon solde">
          <span className="wallet-xp" title={`${li.into} sur ${li.need} XP pour le niveau suivant`}>
            <i style={{ width: `${(100 * li.into) / li.need}%` }} />{props.profile.xp.toLocaleString('fr-BE')} XP
          </span>
          <span className="wallet-coins">{props.profile.coins.toLocaleString('fr-BE')} pièces</span>
        </div>
      </header>

      <main className="home-main">
        <h1 className="plaque logo-plaque"><span>421</span></h1>
        <p className="tagline">Trois dés, un bac, et le dernier paie la tournée.</p>

        {!STANDALONE && <LiveStrip onOpen={props.onStats} />}
        {!STANDALONE && <NewsTicker />}
        {!STANDALONE && online && props.onJoinScheduled && <ScheduledCard pa={props.pa} onJoin={props.onJoinScheduled} onAccount={props.onAccount} compact />}
        {!STANDALONE && <OpenLobbies onJoin={props.onJoinRoom} onAll={props.onOnline} />}
        <nav className="home-actions">
          {props.resume && !STANDALONE && (
            <button className="btn secondary wide" onClick={props.onResume}><Icon name="resume" /> {props.resume.tournament ? 'Reprendre le tournoi' : 'Reprendre la partie'} {props.resume.code}</button>
          )}
          <button className="btn primary wide" onClick={props.onSolo}><Icon name="dice" /> Jouer contre l'ordinateur</button>
          {STANDALONE ? (
            <p className="note">Le jeu entre amis demande le serveur du projet. Cette version propose le solo et le bac d'essai.</p>
          ) : (
            <div className="pair">
              <button className="btn secondary" onClick={props.onOnline} disabled={!online}><Icon name="people" /> Jouer en ligne</button>
              <button className="btn secondary" onClick={props.onTournaments} disabled={!online}><Icon name="trophy" /> Tournois</button>
            </div>
          )}
          <button className="btn secondary wide" onClick={props.onParty}><Icon name="cheers" /> Soirée entre amis (un seul téléphone ou vrais dés)</button>
          {!online && !STANDALONE && <p className="note">Hors connexion : le jeu entre amis reviendra avec le réseau.</p>}
        </nav>

        {!STANDALONE && <CollectionPromo pa={props.pa} onOpen={props.onCollection} />}
        {!STANDALONE && <ReferralCard pa={props.pa} onAccount={props.onAccount} />}
        {!STANDALONE && !props.pa.isAccount && (
          <section className="account-card">
            <div><b>Gardez votre progression</b><span>Un compte gratuit sauvegarde vos pièces et vos objets, et ouvre les classements, clubs et tables avec mise.</span></div>
            <div className="account-actions">
              <button className="btn primary" onClick={props.onAccount}>Créer un compte</button>
              <button className="btn secondary" onClick={props.onLogin}>Se connecter</button>
            </div>
          </section>
        )}
        {!props.profile.tutorial && (
          <section className="tuto-card">
            <div><b>Nouveau au 421 ?</b><span>Une partie guidée de quelques minutes pour apprendre les règles en jouant. 50 pièces à la clé.</span></div>
            <button className="btn primary" onClick={props.onTutorial}>Apprendre à jouer</button>
          </section>
        )}
        <HappyHourBanner />
        {props.pa.welcomeBack && (
          <button className="welcome-back" onClick={() => { props.pa.dismissWelcome(); props.onCollection(); }}>
            <span aria-hidden><BagIcon size="1em" /></span><span><b>Content de vous revoir !</b> Un sac de dés vous attend : ouvrez-le dans la Collection.</span>
          </button>
        )}
        <EventBanner onShop={props.onShop} />
        <DailyStreak pa={props.pa} />
        <EveningChest pa={props.pa} />
        <ChallengeCard onOpen={props.onChallenge} />
        <BossCard pa={props.pa} onPlay={props.onBoss} />
        <PassSummary pa={props.pa} onOpen={props.onPass} />
        <QuestsPanel profile={props.profile} onClaim={props.pa.claim} />

        <nav className="home-grid" aria-label="Plus">
          <button onClick={() => setShowProfile(true)}><Icon name="user" /><span>Profil</span></button>
          <button onClick={props.onShop}><Icon name="shop" /><span>Boutique</span></button>
          {!STANDALONE && <button onClick={props.onCollection} className="tile-coll"><Icon name="dice" /><span>Collection</span>{(props.profile.bags ?? 0) > 0 && <i className="tile-badge">{props.profile.bags}</i>}</button>}
          <button onClick={props.onAlbum}><Icon name="album" /><span>Album</span></button>
          {!STANDALONE && <button onClick={props.onLeaderboard}><Icon name="trophy" /><span>Classement</span></button>}
          {!STANDALONE && <button onClick={props.onClub}><Icon name="club" /><span>Club</span></button>}
          {!STANDALONE && <button onClick={props.onFriends}><Icon name="user" /><span>Amis</span></button>}
          {!STANDALONE && <button onClick={props.onDuels} className="tile-coll"><Icon name="dice" /><span>Défis entre amis</span>{(notifs?.toPlay.filter((d) => !d.sent).length ?? 0) > 0 && <i className="tile-badge">{notifs!.toPlay.filter((d) => !d.sent).length}</i>}</button>}
          <button onClick={props.onRecap}><Icon name="chart" /><span>Récap</span></button>
          {!STANDALONE && <button onClick={props.onStats}><Icon name="stats" /><span>Statistiques</span></button>}
          <button onClick={props.onRules}><Icon name="rules" /><span>Règles</span></button>
          <button onClick={props.onSettings}><Icon name="settings" /><span>Réglages</span></button>
          <button onClick={props.onSandbox}><Icon name="target" /><span>Bac d'essai</span></button>
        </nav>

        <div className="home-foot">
          {!STANDALONE && (
            props.pa.isAccount
              ? <button className="link" onClick={props.onAccount}>Connecté en tant que {props.pa.session!.username} (gérer le compte)</button>
              : <button className="link" onClick={props.onLogin}>Déjà un compte ? Se connecter</button>
          )}
          <div className="foot-links">
            <button className="link small-link" onClick={props.onChangelog}>Nouveautés (v{CURRENT_VERSION}){changelogUnseen() && <i className="new-dot" aria-label="nouvelle version" />}</button>
            <a className="link small-link" href={reportUrl()}>Signaler un problème</a>
            <button className="link small-link" onClick={props.onLegal}>Confidentialité et mentions légales</button>
          </div>
          {!STANDALONE && (
            <div className="foot-links">
              <a className="link small-link" href="/regles-du-421">Règles du 421</a>
              <a className="link small-link" href="/combinaisons-du-421">Combinaisons et probabilités</a>
              <a className="link small-link" href="/421-entre-amis">Jouer entre amis</a>
            </div>
          )}
        </div>
      </main>
      {showNotifs && <NotifPanel pa={props.pa} notifs={notifs} reload={reload} onClose={() => { setShowNotifs(false); reload(); }}
        onPlay={(d) => { setShowNotifs(false); props.onDuelPlay(d); }} onDuels={() => { setShowNotifs(false); props.onDuels(); }} />}
      {showProfile && <ProfileView pa={props.pa} displayName={props.displayName} avatar={props.avatar} onClose={() => setShowProfile(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function SoloSetup({ settings, onBack, onStart }: {
  settings: Settings; onBack: () => void;
  onStart: (cfg: GameConfig, opponents: { persona: Persona; difficulty: Difficulty }[]) => void;
}) {
  const [count, setCount] = useState(3);
  const [diff, setDiff] = useState<Difficulty>(settings.difficulty);
  const [cfg, setCfg] = useState<GameConfig>(DEFAULT_CONFIG);
  const [roster, setRoster] = useState(() => [...PERSONAS].sort(() => Math.random() - 0.5));
  const chosen = roster.slice(0, count);
  const DIFFS: { v: Difficulty; label: string; hint: string }[] = [
    { v: 'facile', label: tr('g421.solo.easy'), hint: tr('g421.solo.easyH') },
    { v: 'normal', label: tr('g421.solo.normal'), hint: tr('g421.solo.normalH') },
    { v: 'difficile', label: tr('g421.solo.hard'), hint: tr('g421.solo.hardH') },
  ];
  return (
    <Shell title={tr('g421.solo.title')} onBack={onBack} icon="dice" wide sub={trn('g421.solo.sub', count, { d: tr(`g421.solo.level.${diff}`) })}
      foot={<BigAction icon="dice" label={tr('g421.solo.sit')} sub={describeCfg(cfg)[0]} onClick={() => onStart(cfg, chosen.map((persona) => ({ persona, difficulty: diff })))} />}>
      <div className="cols solo">
        <div>
          <Section title={tr('g421.solo.opps')} aside={<button className="btn ghost small" onClick={() => setRoster([...PERSONAS].sort(() => Math.random() - 0.5))}><Icon name="resume" size={18} /> {tr('g421.solo.change')}</button>}>
            <div className="k-pills big" role="radiogroup" aria-label={tr('g421.solo.oppCount')}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={n === count} className={n === count ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>)}
            </div>
            <ul className="solo-roster">
              {chosen.map((p) => (
                <li key={p.id} style={{ ['--pc' as string]: p.color }}>
                  <span className="avatar"><span>{p.avatar}</span></span>
                  <b>{botName(p.name)}</b><small>{trTagline(p.id, p.tagline)}</small>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={tr('g421.solo.diff')}>
            <Choices value={diff} onChange={setDiff} options={DIFFS} />
          </Section>
        </div>
        <Section title={tr('g421.solo.rules')}>
          <ConfigEditor config={cfg} onChange={setCfg} />
        </Section>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

/** Contenu des règles, affiché à l'accueil et pendant la partie (avec les réglages en cours). */
export function RulesContent({ current }: { current?: GameConfig }) {
  const cfg = current ?? DEFAULT_CONFIG;
  const v = cfg.values;
  return (
      <div className="rules">
      {current && (
        <div className="rules-current">
          <h3>{tr('g421.rc.current')}</h3>
          <ul>{describeCfg(current).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      <p>{rich(tr('g421.rc.intro'))}</p>
      <h3>{tr('g421.rc.combos')}</h3>
      <table className="combo-table">
        <tbody>
          {comboTable(v).map((r, i) => (
            <tr key={r.name}><td><DiceRow dice={r.example} size={20} /></td><td>{i === 0 ? r.name : tr(`g421.rc.row${i}` as MessageKey)}</td><td className="val">{i === 2 ? tr('g421.rc.valX') : i === 5 ? tr('g421.rc.valNen', { a: v.autre, b: v.nenetteMin }) : r.value}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{tr('g421.rc.compare', { a: trCombo(evaluate([6, 5, 2], v).label), b: trCombo(evaluate([6, 4, 3], v).label) })}</p>
      <h3>{tr('g421.rc.classicH')}</h3>
      <ol>
        <li>{rich(tr('g421.rc.load', { n: cfg.totalTokens }))}</li>
        <li>{rich(tr('g421.rc.empty'))}</li>
        <li>{rich(tr('g421.rc.unload'))}</li>
        <li>{tr('g421.rc.lastLoses')}</li>
        <li>{rich(tr('g421.rc.ties', { how: tr(cfg.rolloffMode === 'addition' ? 'g421.rc.tieAdd' : 'g421.rc.tieFig') }))}</li>
          <li>{rich(tr(cfg.turnSeconds ? 'g421.rc.time' : 'g421.rc.noTime', { n: cfg.turnSeconds }))}</li>
          <li>{rich(tr('g421.rc.keep'))}</li>
        <li>{rich(tr('g421.rc.nen', { n: v.nenetteMin }))}</li>
      </ol>
      <h3>{tr('g421.rc.others')}</h3>
      <ul>
        <li>{rich(tr('g421.rc.varDech'))}</li>
        <li>{rich(tr('g421.rc.varPts'))}</li>
      </ul>
      <p>{tr('g421.rc.adjust')}</p>
      <ul className="muted">{describeCfg(DEFAULT_CONFIG).map((l) => <li key={l}>{l}</li>)}</ul>
      <h3>{tr('g421.rc.shortcuts')}</h3>
      <p className="muted">{tr('g421.rc.shortcutsT')}</p>
      <h3>{tr('g421.rc.tracker')}</h3>
      <p className="muted">{tr('g421.rc.trackerT')}</p>
    </div>
  );
}

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return (
    <Shell title={tr('g421.rules')} onBack={onBack} icon="rules" sub={tr('g421.rc.sub')}>
      <RulesContent />
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

export function SettingsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = (p: Partial<Settings>) => { sound.unlock(); onChange({ ...settings, ...p }); };
  const vol = settings.muted ? 0 : Math.round(settings.volume * 100);
  return (
    <Shell title="Réglages" onBack={onBack} icon="settings" sub="Enregistrés automatiquement sur cet appareil">
      <div className="k-stack">
        <Section title="Vous">
          <div className="k-card">
            <label className="k-field"><span className="k-label">Votre nom</span>
              <input className="k-input" value={settings.name} maxLength={20} placeholder="Votre nom" onChange={(e) => set({ name: e.target.value })} /></label>
            <div className="k-field"><span className="k-label">Avatar</span>
              <div className="avatars">{AVATARS.map((a) => <button key={a} className={a === settings.avatar ? 'on' : ''} onClick={() => set({ avatar: a })} aria-label={`Avatar ${a}`}>{a}</button>)}</div>
            </div>
          </div>
        </Section>
        <Section title="Langue · Language · Sprache · Taal"><LangSwitch full /><p className="muted small">{tr('lang.note')}</p></Section>
        <Section title="Son" aside={<button className="btn ghost small" onClick={() => { sound.unlock(); sound.impact('paroi', 10); setTimeout(() => sound.impact('feutre', 9), 120); setTimeout(() => sound.impact('de', 8), 220); }}><Icon name="sound" size={18} /> Tester le son</button>}>
          <div className="k-card">
            <label className="k-range"><span><Icon name={vol ? 'sound' : 'mute'} size={20} /><b>Effets</b><em>{vol} %</em></span>
              <input type="range" min={0} max={100} step={1} value={vol}
                onChange={(e) => { const v = Number(e.target.value); set({ volume: v / 100, muted: v === 0 }); }} /></label>
            <Toggle label="Couper tous les sons" checked={settings.muted} onChange={(b) => set({ muted: b })} />
          </div>
        </Section>
        <Section title="Lancer les dés">
          <div className="k-card">
            <Toggle label="Secouer le téléphone pour lancer" checked={settings.shake}
              onChange={async (on) => { if (on && needsMotionPermission() && !(await requestMotionPermission())) return; set({ shake: on }); }} />
            <Toggle label="Lancer au gobelet" hint="Les dés partent d'un gobelet renversé" checked={settings.cup} onChange={(b) => set({ cup: b })} />
            <Toggle label="Vibrations" hint="Quand les dés frappent (téléphone)" checked={settings.vibrate} onChange={(b) => set({ vibrate: b })} />
            <Toggle label="M'alerter quand c'est mon tour" hint="Onglet qui clignote et petit son quand le jeu est en arrière-plan" checked={settings.turnAlert} onChange={(b) => set({ turnAlert: b })} />
          </div>
        </Section>
        <Section title="Graphismes">
          <Choices value={settings.quality} onChange={(q) => set({ quality: q })}
            options={[{ v: 'haute', label: 'Haute', hint: 'Ombres fines' }, { v: 'normale', label: 'Normale', hint: 'Plus léger' }]} />
        </Section>
        <Section title="Aide">
          <div className="k-links">
            <InstallPrompt />
            <a className="btn" href={reportUrl()}><Icon name="flag" size={18} /> Signaler un problème</a>
          </div>
        </Section>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * Bac d'essai : lancers libres pour juger la physique, relances partielles comprises.
 * Montre la traînée et la célébration équipées ; `tryFx` (depuis la collection) en essaie une autre.
 */
export function Sandbox({ settings, appearance, onBack, onSettings, trail, fete, tryFx }: {
  settings: Settings; appearance: Appearance; onBack: () => void; onSettings: (s: Settings) => void; trail?: string; fete?: string; tryFx?: string;
}) {
  const tray = useRef<DiceTrayHandle>(null);
  const tried = fxDef(tryFx);
  const trailId = tried?.kind === 'trainee' ? tried.id : trail;
  const feteId = tried?.kind === 'fete' ? tried.id : fete;
  // Le bac d'essai montre aussi la traînée équipée (ou celle qu'on essaie).
  useEffect(() => { tray.current?.setTrail(trailId ?? null); }, [trailId]);
  const [shot, setShot] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => { if (!shot) return; const t = setTimeout(() => setShot(null), 2400); return () => clearTimeout(t); }, [shot]);
  const [dice, setDice] = useState<number[]>([4, 2, 1]);
  const [keep, setKeep] = useState([false, false, false]);
  const [rolling, setRolling] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => { tray.current?.setKept(keep); tray.current?.setInteractive(!rolling && count > 0); }, [keep, rolling, count]);
  const roll = async (gesture?: ThrowGesture, force421 = false) => {
    if (rolling || (!force421 && keep.every(Boolean))) return;
    sound.unlock();
    const r = crypto.getRandomValues(new Uint32Array(4));
    const k = force421 ? [false, false, false] : keep;
    const next = force421 ? [4, 2, 1] : dice.map((d, i) => (keep[i] ? d : 1 + (r[i] % 6)));
    if (force421) setKeep([false, false, false]);
    setRolling(true);
    // Les mêmes règles qu'en partie : seuls le 4-2-1 et les trois as ont le ralenti et la célébration.
    const big = evaluate(next, DEFAULT_CONFIG.values).kind === '421' || evaluate(next, DEFAULT_CONFIG.values).kind === '111';
    await tray.current?.roll(next, k, r[3] >>> 1, gesture, big);
    if (big) {
      sound.jackpot();
      tray.current?.celebrate(feteId ?? null);
      setShot({ id: Date.now(), text: next[0] === 1 ? 'Trois as !' : '4-2-1 !' });
    }
    setDice(next);
    setCount((c) => c + 1);
    setRolling(false);
  };
  const canThrow = !rolling && !keep.every(Boolean);
  useEffect(() => { tray.current?.setSwipeEnabled(canThrow); }, [canThrow]);
  useShakeToThrow(settings.shake && canThrow, (g) => { void roll(g); });
  const combo = evaluate(dice, DEFAULT_CONFIG.values);
  return (
    <div className="game sandbox" onPointerDown={() => { sound.unlock(); if (settings.shake && needsMotionPermission()) void requestMotionPermission(); }}>
      <DiceTray ref={tray} appearance={appearance} quality={settings.quality} cup={settings.cup} insets={{ top: 70, bottom: 150, left: 0, right: 0 }}
        onDieClick={(i) => { sound.click(); setKeep((k) => k.map((v, j) => (j === i ? !v : v))); }}
        onSwipe={(g) => { void roll(g); }} />
      <div className="vignette" />
      <div className="top"><div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Retour"><Icon name="back" /></button>
        <div className="phase"><span className="logo-mini">421</span><span>Bac d'essai</span></div>
        <div className="top-actions">
          <VolumeControl settings={settings} onSettings={onSettings} />
        </div>
      </div></div>
      <div className="actionbar">
        <div className="status"><div className="turn-line"><b>{rolling ? 'Les dés roulent…' : count ? combo.label : 'Lancez pour essayer'}</b></div>
          <div className="throws"><span>{count} lancer{count > 1 ? 's' : ''}. Touchez un dé pour le garder, glissez sur le bac pour lancer.</span></div></div>
        <div className="result">{count > 0 && !rolling && (
          <div className="keep-row">{dice.map((d, i) => (
            <button key={i} className={`keep-die${keep[i] ? ' on' : ''}`} onClick={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))}>
              <MiniDie value={d} size={30} kept={keep[i]} /><small>{keep[i] ? 'gardé' : 'relancé'}</small>
            </button>))}</div>)}
        </div>
        <div className="buttons">
          <button className="btn primary big" disabled={rolling || keep.every(Boolean)} onClick={() => roll()}>
            🎲 {keep.some(Boolean) ? `Relancer (${keep.filter((k) => !k).length})` : 'Lancer les dés'}
          </button>
          {keep.some(Boolean) && <button className="btn ghost small" onClick={() => setKeep([false, false, false])}>Tout relancer</button>}
          <button className="btn ghost small" disabled={rolling} onClick={() => void roll(undefined, true)}>
            ✨ {tried ? `Essayer « ${tried.name} »` : 'Voir la célébration du 4-2-1'}
          </button>
        </div>
      </div>
      {shot && (
        <div key={shot.id} className="bigshot" aria-live="assertive">
          {feteId && <Celebration id={feteId} />}
          <div className="bs-text">{shot.text}</div>
        </div>
      )}
    </div>
  );
}
