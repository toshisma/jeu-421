import { BossCard, DailyStreak, EventBanner, HappyHourBanner, PassSummary } from './Progression';
import { reportUrl } from '../legal';
import { ChallengeCard } from './ChallengeScreen';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { titleLabel as titleLabelFn } from '../../../shared/progress/profile';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG, describeConfig, type GameConfig } from '../../../shared/config';
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
import { OpenLobbies } from './Friends';
import { fxDef, fxGlows } from '../../../shared/progress/dice-collection';
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

export function Shell({ title, onBack, children, wide }: { title: string; onBack: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="screen">
      <div className={`panel${wide ? ' wide' : ''}`}>
        <header className="panel-head">
          <button className="icon-btn" onClick={onBack} aria-label="Retour"><Icon name="back" /></button>
          <h2>{title}</h2>
        </header>
        {children}
      </div>
    </div>
  );
}

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
  onSolo: () => void; onOnline: () => void; onTournaments: () => void; onRules: () => void; onSettings: () => void; onSandbox: () => void; onLegal: () => void; onPass: () => void; onTutorial: () => void; onChallenge: () => void; onBoss: () => void; onParty: () => void; onClub: () => void; onAlbum: () => void; onRecap: () => void; onStats: () => void; onLogin: () => void; onCollection: () => void; onDuels: () => void; onFriends: () => void; onJoinRoom: (code: string) => void; onDuelPlay: (d: DuelPlay) => void; openNotifs?: boolean;
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
        {!STANDALONE && <OpenLobbies onJoin={props.onJoinRoom} onAll={props.onOnline} />}
        {!props.profile.tutorial && (
          <section className="tuto-card">
            <div><b>Nouveau au 421 ?</b><span>Une partie guidée de quelques minutes pour apprendre les règles en jouant. 50 pièces à la clé.</span></div>
            <button className="btn primary" onClick={props.onTutorial}>Apprendre à jouer</button>
          </section>
        )}
        <HappyHourBanner />
        {props.pa.welcomeBack && (
          <button className="welcome-back" onClick={() => { props.pa.dismissWelcome(); props.onCollection(); }}>
            <span aria-hidden>🎒</span><span><b>Content de vous revoir !</b> Un sac de dés vous attend : ouvrez-le dans la Collection.</span>
          </button>
        )}
        <EventBanner onShop={props.onShop} />
        <DailyStreak pa={props.pa} />
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
          {!STANDALONE && <button onClick={props.onDuels} className="tile-coll"><Icon name="dice" /><span>Défis</span>{(notifs?.toPlay.filter((d) => !d.sent).length ?? 0) > 0 && <i className="tile-badge">{notifs!.toPlay.filter((d) => !d.sent).length}</i>}</button>}
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
  return (
    <Shell title="Partie solo" onBack={onBack} wide>
      <div className="cols">
        <section>
          <h3>Adversaires</h3>
          <div className="seg">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} className={n === count ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>)}
          </div>
          <h3>Difficulté</h3>
          <div className="seg">
            {(['facile', 'normal', 'difficile'] as Difficulty[]).map((d) => (
              <button key={d} className={d === diff ? 'on' : ''} onClick={() => setDiff(d)}>{d[0].toUpperCase() + d.slice(1)}</button>
            ))}
          </div>
          <ul className="roster">
            {chosen.map((p) => (
              <li key={p.id} style={{ ['--pc' as string]: p.color }}>
                <span className="avatar"><span>{p.avatar}</span></span>
                <div><b>{p.name}</b><small>{p.tagline}</small></div>
              </li>
            ))}
          </ul>
          <button className="btn ghost small" onClick={() => setRoster([...PERSONAS].sort(() => Math.random() - 0.5))}>Changer d'adversaires</button>
        </section>
        <section>
          <h3>Règles</h3>
          <ConfigEditor config={cfg} onChange={setCfg} />
        </section>
      </div>
      <div className="panel-foot">
        <button className="btn primary big" onClick={() => onStart(cfg, chosen.map((persona) => ({ persona, difficulty: diff })))}>
          S'asseoir à la table
        </button>
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
          <h3>Règles de cette partie</h3>
          <ul>{describeConfig(current).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      <p>On lance trois dés, avec jusqu'à trois lancers par tour. Après un lancer, on peut <b>conserver</b> certains dés en cliquant dessus et relancer les autres, ou <b>valider</b> son tour. Chaque manche, le joueur qui a la plus mauvaise combinaison perd : il reçoit des jetons. Le but est de se débarrasser de tous ses jetons.</p>
      <h3>Combinaisons (de la meilleure à la plus faible)</h3>
      <table className="combo-table">
        <tbody>
          {comboTable(v).map((r) => (
            <tr key={r.name}><td><DiceRow dice={r.example} size={20} /></td><td>{r.name}</td><td className="val">{r.value}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Les combinaisons ordinaires se comparent dé par dé, du plus fort au plus faible (6-6-5 bat 6-6-4). Exemple : {evaluate([6, 5, 2], v).label} bat {evaluate([6, 4, 3], v).label}.</p>
      <h3>Variante classique (par défaut)</h3>
      <ol>
        <li><b>La charge.</b> Le pot contient {cfg.totalTokens} jetons. Chaque joueur lance <b>une seule fois</b>. Le perdant de la manche prend dans le pot autant de jetons que vaut la meilleure combinaison de la manche.</li>
        <li>Quand le pot est vide, les joueurs <b>sans jeton sont sortis</b> : ils ont gagné.</li>
        <li><b>La décharge.</b> Jusqu'à 3 lancers par tour, mais le premier joueur de la manche fixe le nombre de lancers des suivants. Le meilleur <b>donne</b> au perdant autant de jetons que vaut sa combinaison. Celui qui n'a plus de jeton sort.</li>
        <li>Le dernier à garder des jetons a perdu la partie. Le perdant de chaque manche commence la suivante.</li>
        <li><b>Égalités :</b> si plusieurs joueurs ont la plus mauvaise combinaison, ils font un <b>barrage</b> (un lancer chacun), départagé <b>{cfg.rolloffMode === 'addition' ? 'à l’addition : le plus petit total des trois dés perd' : 'à la figure : la plus faible combinaison perd'}</b> (réglable : figure ou addition). Pour la meilleure combinaison, le premier à l'avoir obtenue l'emporte.</li>
          <li><b>Temps :</b> {cfg.turnSeconds ? `${cfg.turnSeconds} secondes pour jouer à chaque fois ; passé ce délai, le jeu lance (si besoin) puis valide votre tour.` : 'pas de limite de temps dans cette partie.'}</li>
          <li><b>Garder des dés :</b> touchez un dé pour le garder, il est posé au bord du bac ; seuls les autres sont relancés.</li>
        <li><b>Nénette</b> (2-2-1) : la plus faible combinaison ; le perdant qui l'a faite prend au minimum {v.nenetteMin} jetons.</li>
      </ol>
      <h3>Autres variantes proposées</h3>
      <ul>
        <li><b>Décharge seule :</b> chaque joueur reçoit des jetons au départ, on joue directement la décharge.</li>
        <li><b>Aux points :</b> un nombre fixe de manches ; chaque joueur marque la valeur de sa combinaison ; le meilleur total gagne.</li>
      </ul>
      <p>Tout est réglable avant chaque partie : variante, nombre de lancers, jetons, sens de rotation, règle des égalités, valeurs des combinaisons. Réglages par défaut :</p>
      <ul className="muted">{describeConfig(DEFAULT_CONFIG).map((l) => <li key={l}>{l}</li>)}</ul>
      <h3>Raccourcis</h3>
      <p className="muted">Pour lancer, glissez le doigt sur le bac ou secouez le téléphone. Touchez un dé pour le garder. Au clavier : Espace pour lancer, Entrée pour valider.</p>
      <h3>Suivi de la manche</h3>
      <p className="muted">Le bandeau en haut indique la plus mauvaise combinaison du moment et ce qu'elle coûte, par exemple « 5-2-1 pour 6 jetons » : le joueur qui l'a faite prendrait 6 jetons si la manche s'arrêtait là.</p>
    </div>
  );
}

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return (
    <Shell title="Règles du jeu" onBack={onBack} wide>
      <RulesContent />
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

export function SettingsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = (p: Partial<Settings>) => { sound.unlock(); onChange({ ...settings, ...p }); };
  return (
    <Shell title="Paramètres" onBack={onBack}>
      <div className="form">
        <label className="field"><span>Votre nom</span>
          <input value={settings.name} maxLength={20} placeholder="Votre nom" onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="field"><span>Avatar</span>
          <div className="avatars">{AVATARS.map((a) => <button key={a} className={a === settings.avatar ? 'on' : ''} onClick={() => set({ avatar: a })}>{a}</button>)}</div>
        </div>
        <label className="field"><span>Qualité graphique</span>
          <select value={settings.quality} onChange={(e) => set({ quality: e.target.value as Settings['quality'] })}>
            <option value="haute">Haute (ombres fines)</option>
            <option value="normale">Normale (plus léger)</option>
          </select></label>
        <label className="field"><span>Volume : {settings.muted ? 0 : Math.round(settings.volume * 100)} %</span>
          <input type="range" min={0} max={100} step={1} value={settings.muted ? 0 : Math.round(settings.volume * 100)}
            onChange={(e) => { const v = Number(e.target.value); set({ volume: v / 100, muted: v === 0 }); }} /></label>
        <label className="field check"><input type="checkbox" checked={settings.muted} onChange={(e) => set({ muted: e.target.checked })} /><span>Couper tous les sons</span></label>
        <label className="field check"><input type="checkbox" checked={settings.vibrate} onChange={(e) => set({ vibrate: e.target.checked })} /><span>Vibrations quand les dés frappent (téléphone)</span></label>
        <label className="field check"><input type="checkbox" checked={settings.shake}
          onChange={async (e) => { const on = e.target.checked; if (on && needsMotionPermission() && !(await requestMotionPermission())) return; set({ shake: on }); }} />
          <span>Secouer le téléphone pour lancer</span></label>
        <label className="field check"><input type="checkbox" checked={settings.cup} onChange={(e) => set({ cup: e.target.checked })} /><span>Lancer au gobelet</span></label>
        <InstallPrompt />
        <a className="btn ghost small" href={reportUrl()}>Signaler un problème</a>
        <button className="btn ghost small" onClick={() => { sound.unlock(); sound.impact('paroi', 10); setTimeout(() => sound.impact('feutre', 9), 120); setTimeout(() => sound.impact('de', 8), 220); }}>Tester le son</button>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

/** Bac d'essai : lancers libres pour juger la physique, relances partielles comprises. */
export function Sandbox({ settings, appearance, onBack, onSettings, trail }: { settings: Settings; appearance: Appearance; onBack: () => void; onSettings: (s: Settings) => void; trail?: string }) {
  const tray = useRef<DiceTrayHandle>(null);
  // Le bac d'essai montre aussi la traînée équipée.
  useEffect(() => { tray.current?.setTrail(fxDef(trail)?.colors ?? null, fxGlows(trail)); }, [trail]);
  const [dice, setDice] = useState<number[]>([4, 2, 1]);
  const [keep, setKeep] = useState([false, false, false]);
  const [rolling, setRolling] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => { tray.current?.setKept(keep); tray.current?.setInteractive(!rolling && count > 0); }, [keep, rolling, count]);
  const roll = async (gesture?: ThrowGesture) => {
    if (rolling || keep.every(Boolean)) return;
    sound.unlock();
    const r = crypto.getRandomValues(new Uint32Array(4));
    const next = dice.map((d, i) => (keep[i] ? d : 1 + (r[i] % 6)));
    setRolling(true);
    await tray.current?.roll(next, keep, r[3] >>> 1, gesture);
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
        </div>
      </div>
    </div>
  );
}
