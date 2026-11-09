import { loc, tr } from '../i18n/lang';
import { LangSwitch } from '../i18n/LangSwitch';
import { BossCard, DailyStreak, EveningChest, EventBanner, HappyHourBanner, PassSummary } from './Progression';
import { BagIcon } from './BagIcon';
import { reportUrl } from '../legal';
import { ChallengeCard } from './ChallengeScreen';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { titleL } from '../i18n/data';
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
    <button type="button" className="profile-chip" onClick={onClick} disabled={!onClick} title={tr('app.voir_mon_profil')}>
      {emoji !== undefined && <Avatar photo={photo} emoji={emoji} size={26} />}
      <span className="lvl">{tr('app.niv')} {li.level}</span>
      <span className="xpbar" title={tr('app.xp', { into: li.into, need: li.need })}><i style={{ width: `${(100 * li.into) / li.need}%` }} /></span>
      <span className="xp">{profile.xp.toLocaleString(loc())} {tr('app.xp_2')}</span>
      <span className="coins">{profile.coins.toLocaleString(loc())} {tr('app.pieces_2')}</span>
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
  const name = props.pa.session?.username ?? (props.displayName || tr('app.invite'));
  return (
    <div className="home">
      <header className="home-bar">
        <button className="me-btn" onClick={() => setShowProfile(true)} aria-label={tr('app.mon_profil')}>
          <Avatar photo={props.pa.photo} emoji={props.avatar} size={40} accessory={accessoryEmoji(props.profile.equipped.accessoire)} />
          <span className="me-text">
            <b>{name}</b>
            <span>{tr('app.niveau')} {li.level}{titleL(props.profile.title) ? `, ${titleL(props.profile.title)}` : ''}</span>
          </span>
        </button>
        {!STANDALONE && !props.pa.isAccount && <button className="install-chip login-chip" onClick={props.onLogin}>{tr('app.connexion')}</button>}
        <div className="home-audio"><VolumeControl settings={props.settings} onSettings={props.onChangeSettings} /></div>
        {!STANDALONE && props.pa.isAccount && <div className="home-social">
          <FriendsButton pa={props.pa} onOpen={props.onFriends} />
          {props.onMessages && <MessagesButton pa={props.pa} onOpen={props.onMessages} />}
        </div>}
        {!STANDALONE && props.pa.isAccount && <NotifBell count={notifs?.count ?? 0} onOpen={() => { setShowNotifs(true); reload(); }} />}
        <InstallPrompt compact />
        <div className="wallet" aria-label={tr('app.mon_solde')}>
          <span className="wallet-xp" title={tr('app.sur_xp_pour_le_niveau_suivant', { into: li.into, need: li.need })}>
            <i style={{ width: `${(100 * li.into) / li.need}%` }} />{props.profile.xp.toLocaleString(loc())} {tr('app.xp_2')}
          </span>
          <span className="wallet-coins">{props.profile.coins.toLocaleString(loc())} {tr('app.pieces_2')}</span>
        </div>
      </header>

      <main className="home-main">
        <h1 className="plaque logo-plaque"><span>421</span></h1>
        <p className="tagline">{tr('app.trois_des_un_bac_et_le_dernier')}</p>

        {!STANDALONE && <LiveStrip onOpen={props.onStats} />}
        {!STANDALONE && <NewsTicker />}
        {!STANDALONE && online && props.onJoinScheduled && <ScheduledCard pa={props.pa} onJoin={props.onJoinScheduled} onAccount={props.onAccount} compact />}
        {!STANDALONE && <OpenLobbies onJoin={props.onJoinRoom} onAll={props.onOnline} />}
        <nav className="home-actions">
          {props.resume && !STANDALONE && (
            <button className="btn secondary wide" onClick={props.onResume}><Icon name="resume" /> {props.resume.tournament ? tr('app.reprendre_le_tournoi') : tr('app.reprendre_la_partie')} {props.resume.code}</button>
          )}
          <button className="btn primary wide" onClick={props.onSolo}><Icon name="dice" /> {tr('app.jouer_contre_l_ordinateur')}</button>
          {STANDALONE ? (
            <p className="note">{tr('app.le_jeu_entre_amis_demande_le_serveur')}</p>
          ) : (
            <div className="pair">
              <button className="btn secondary" onClick={props.onOnline} disabled={!online}><Icon name="people" /> {tr('app.jouer_en_ligne')}</button>
              <button className="btn secondary" onClick={props.onTournaments} disabled={!online}><Icon name="trophy" /> {tr('app.tournois')}</button>
            </div>
          )}
          <button className="btn secondary wide" onClick={props.onParty}><Icon name="cheers" /> {tr('app.soiree_entre_amis_un_seul_telephone_')}</button>
          {!online && !STANDALONE && <p className="note">{tr('app.hors_connexion_le_jeu_entre_amis_rev')}</p>}
        </nav>

        {!STANDALONE && <CollectionPromo pa={props.pa} onOpen={props.onCollection} />}
        {!STANDALONE && <ReferralCard pa={props.pa} onAccount={props.onAccount} />}
        {!STANDALONE && !props.pa.isAccount && (
          <section className="account-card">
            <div><b>{tr('app.gardez_votre_progression')}</b><span>{tr('app.un_compte_gratuit_sauvegarde_vos_pie')}</span></div>
            <div className="account-actions">
              <button className="btn primary" onClick={props.onAccount}>{tr('app.creer_un_compte')}</button>
              <button className="btn secondary" onClick={props.onLogin}>{tr('app.se_connecter')}</button>
            </div>
          </section>
        )}
        {!props.profile.tutorial && (
          <section className="tuto-card">
            <div><b>{tr('app.nouveau_au_421')}</b><span>{tr('app.une_partie_guidee_de_quelques_minute')}</span></div>
            <button className="btn primary" onClick={props.onTutorial}>{tr('app.apprendre_a_jouer')}</button>
          </section>
        )}
        <HappyHourBanner />
        {props.pa.welcomeBack && (
          <button className="welcome-back" onClick={() => { props.pa.dismissWelcome(); props.onCollection(); }}>
            <span aria-hidden><BagIcon size="1em" /></span><span><b>{tr('app.content_de_vous_revoir')}</b> {tr('app.un_sac_de_des_vous_attend_ouvrez')}</span>
          </button>
        )}
        <EventBanner onShop={props.onShop} />
        <DailyStreak pa={props.pa} />
        <EveningChest pa={props.pa} />
        <ChallengeCard onOpen={props.onChallenge} />
        <BossCard pa={props.pa} onPlay={props.onBoss} />
        <PassSummary pa={props.pa} onOpen={props.onPass} />
        <QuestsPanel profile={props.profile} onClaim={props.pa.claim} />

        <nav className="home-grid" aria-label={tr('app.plus')}>
          <button onClick={() => setShowProfile(true)}><Icon name="user" /><span>{tr('app.profil')}</span></button>
          <button onClick={props.onShop}><Icon name="shop" /><span>{tr('app.boutique')}</span></button>
          {!STANDALONE && <button onClick={props.onCollection} className="tile-coll"><Icon name="dice" /><span>{tr('app.collection')}</span>{(props.profile.bags ?? 0) > 0 && <i className="tile-badge">{props.profile.bags}</i>}</button>}
          <button onClick={props.onAlbum}><Icon name="album" /><span>{tr('app.album')}</span></button>
          {!STANDALONE && <button onClick={props.onLeaderboard}><Icon name="trophy" /><span>{tr('app.classement')}</span></button>}
          {!STANDALONE && <button onClick={props.onClub}><Icon name="club" /><span>{tr('app.club')}</span></button>}
          {!STANDALONE && <button onClick={props.onFriends}><Icon name="user" /><span>{tr('app.amis')}</span></button>}
          {!STANDALONE && <button onClick={props.onDuels} className="tile-coll"><Icon name="dice" /><span>{tr('app.defis_entre_amis')}</span>{(notifs?.toPlay.filter((d) => !d.sent).length ?? 0) > 0 && <i className="tile-badge">{notifs!.toPlay.filter((d) => !d.sent).length}</i>}</button>}
          <button onClick={props.onRecap}><Icon name="chart" /><span>{tr('app.recap')}</span></button>
          {!STANDALONE && <button onClick={props.onStats}><Icon name="stats" /><span>{tr('app.statistiques')}</span></button>}
          <button onClick={props.onRules}><Icon name="rules" /><span>{tr('app.regles')}</span></button>
          <button onClick={props.onSettings}><Icon name="settings" /><span>{tr('app.reglages')}</span></button>
          <button onClick={props.onSandbox}><Icon name="target" /><span>{tr('app.bac_d_essai')}</span></button>
        </nav>

        <div className="home-foot">
          {!STANDALONE && (
            props.pa.isAccount
              ? <button className="link" onClick={props.onAccount}>{tr('app.connecte_en_tant_que_gerer_le_compte', { username: props.pa.session!.username })}</button>
              : <button className="link" onClick={props.onLogin}>{tr('app.deja_un_compte_se_connecter')}</button>
          )}
          <div className="foot-links">
            <button className="link small-link" onClick={props.onChangelog}>{tr('app.nouveautes_v', { CURRENT_VERSION })}{changelogUnseen() && <i className="new-dot" aria-label="nouvelle version" />}</button>
            <a className="link small-link" href={reportUrl()}>{tr('app.signaler_un_probleme')}</a>
            <button className="link small-link" onClick={props.onLegal}>{tr('app.confidentialite_et_mentions_legales')}</button>
          </div>
          {!STANDALONE && (
            <div className="foot-links">
              <a className="link small-link" href="/regles-du-421">{tr('app.regles_du_421')}</a>
              <a className="link small-link" href="/combinaisons-du-421">{tr('app.combinaisons_et_probabilites')}</a>
              <a className="link small-link" href="/421-entre-amis">{tr('app.jouer_entre_amis')}</a>
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
    { v: 'facile', label: tr('app.facile'), hint: tr('app.pour_apprendre') },
    { v: 'normal', label: tr('app.normal'), hint: tr('app.joue_juste') },
    { v: 'difficile', label: tr('app.difficile'), hint: tr('app.ne_pardonne_rien') },
  ];
  return (
    <Shell title={tr('app.partie_solo')} onBack={onBack} icon="dice" wide sub={tr(count > 1 ? 'app.adversaire_niveau.p' : 'app.adversaire_niveau', { count, diff })}
      foot={<BigAction icon="dice" label={tr('app.s_asseoir_a_la_table')} sub={describeConfig(cfg)[0]} onClick={() => onStart(cfg, chosen.map((persona) => ({ persona, difficulty: diff })))} />}>
      <div className="cols solo">
        <div>
          <Section title={tr('app.adversaires')} aside={<button className="btn ghost small" onClick={() => setRoster([...PERSONAS].sort(() => Math.random() - 0.5))}><Icon name="resume" size={18} /> {tr('app.changer')}</button>}>
            <div className="k-pills big" role="radiogroup" aria-label={tr('app.nombre_d_adversaires')}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={n === count} className={n === count ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>)}
            </div>
            <ul className="solo-roster">
              {chosen.map((p) => (
                <li key={p.id} style={{ ['--pc' as string]: p.color }}>
                  <span className="avatar"><span>{p.avatar}</span></span>
                  <b>{p.name}</b><small>{p.tagline}</small>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={tr('app.difficulte')}>
            <Choices value={diff} onChange={setDiff} options={DIFFS} />
          </Section>
        </div>
        <Section title={tr('app.regles')}>
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
          <h3>{tr('app.regles_de_cette_partie')}</h3>
          <ul>{describeConfig(current).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      <p>{tr('app.on_lance_trois_des_avec_jusqu_a')} <b>{tr('app.conserver')}</b> {tr('app.certains_des_en_cliquant_dessus_et_r')} <b>{tr('app.valider')}</b> {tr('app.son_tour_chaque_manche_le_joueur_qui')}</p>
      <h3>{tr('app.combinaisons_de_la_meilleure_a_la_pl')}</h3>
      <table className="combo-table">
        <tbody>
          {comboTable(v).map((r) => (
            <tr key={r.name}><td><DiceRow dice={r.example} size={20} /></td><td>{r.name}</td><td className="val">{r.value}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{tr('app.les_combinaisons_ordinaires_se_compa', { label: evaluate([6, 5, 2], v).label, label2: evaluate([6, 4, 3], v).label })}</p>
      <h3>{tr('app.variante_classique_par_defaut')}</h3>
      <ol>
        <li><b>{tr('app.la_charge')}</b> {tr('app.le_pot_contient_jetons_chaque_joueur', { totalTokens: cfg.totalTokens })} <b>{tr('app.une_seule_fois')}</b>{tr('app.le_perdant_de_la_manche_prend_dans')}</li>
        <li>{tr('app.quand_le_pot_est_vide_les_joueurs')} <b>{tr('app.sans_jeton_sont_sortis')}</b>{tr('app.ils_ont_gagne')}</li>
        <li><b>{tr('app.la_decharge')}</b> {tr('app.jusqu_a_3_lancers_par_tour_mais')} <b>{tr('app.donne')}</b> {tr('app.au_perdant_autant_de_jetons_que_vaut')}</li>
        <li>{tr('app.le_dernier_a_garder_des_jetons_a')}</li>
        <li><b>{tr('app.egalites')}</b> {tr('app.si_plusieurs_joueurs_ont_la_plus_mau')} <b>{tr('app.barrage')}</b> {tr('app.un_lancer_chacun_departage')} <b>{cfg.rolloffMode === 'addition' ? tr('app.a_l_addition_le_plus_petit_total') : tr('app.a_la_figure_la_plus_faible_combinais')}</b> {tr('app.reglable_figure_ou_addition_pour_la_')}</li>
          <li><b>{tr('app.temps')}</b> {cfg.turnSeconds ? tr('app.secondes_pour_jouer_a_chaque_fois_pa', { turnSeconds: cfg.turnSeconds }) : tr('app.pas_de_limite_de_temps_dans_cette')}</li>
          <li><b>{tr('app.garder_des_des')}</b> {tr('app.touchez_un_de_pour_le_garder_il')}</li>
        <li><b>{tr('app.nenette')}</b> {tr('app.2_2_1_la_plus_faible_combinaison', { nenetteMin: v.nenetteMin })}</li>
      </ol>
      <h3>{tr('app.autres_variantes_proposees')}</h3>
      <ul>
        <li><b>{tr('app.decharge_seule')}</b> {tr('app.chaque_joueur_recoit_des_jetons_au_d')}</li>
        <li><b>{tr('app.aux_points')}</b> {tr('app.un_nombre_fixe_de_manches_chaque_jou')}</li>
      </ul>
      <p>{tr('app.tout_est_reglable_avant_chaque_parti')}</p>
      <ul className="muted">{describeConfig(DEFAULT_CONFIG).map((l) => <li key={l}>{l}</li>)}</ul>
      <h3>{tr('app.raccourcis')}</h3>
      <p className="muted">{tr('app.pour_lancer_glissez_le_doigt_sur_le')}</p>
      <h3>{tr('app.suivi_de_la_manche')}</h3>
      <p className="muted">{tr('app.le_bandeau_en_haut_indique_la_plus')}</p>
    </div>
  );
}

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return (
    <Shell title={tr('app.regles_du_jeu')} onBack={onBack} icon="rules" sub={tr('app.le_421_en_2_minutes')}>
      <RulesContent />
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------

export function SettingsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = (p: Partial<Settings>) => { sound.unlock(); onChange({ ...settings, ...p }); };
  const vol = settings.muted ? 0 : Math.round(settings.volume * 100);
  return (
    <Shell title={tr('app.reglages')} onBack={onBack} icon="settings" sub={tr('app.enregistres_automatiquement_sur_cet_')}>
      <div className="k-stack">
        <Section title={tr('app.vous')}>
          <div className="k-card">
            <label className="k-field"><span className="k-label">{tr('app.votre_nom')}</span>
              <input className="k-input" value={settings.name} maxLength={20} placeholder={tr('app.votre_nom')} onChange={(e) => set({ name: e.target.value })} /></label>
            <div className="k-field"><span className="k-label">{tr('app.avatar')}</span>
              <div className="avatars">{AVATARS.map((a) => <button key={a} className={a === settings.avatar ? 'on' : ''} onClick={() => set({ avatar: a })} aria-label={tr('app.avatar_2', { a })}>{a}</button>)}</div>
            </div>
          </div>
        </Section>
        <Section title="Langue · Language · Sprache · Taal"><LangSwitch full /><p className="muted small">{tr('lang.note')}</p></Section>
        <Section title={tr('app.son')} aside={<button className="btn ghost small" onClick={() => { sound.unlock(); sound.impact('paroi', 10); setTimeout(() => sound.impact('feutre', 9), 120); setTimeout(() => sound.impact('de', 8), 220); }}><Icon name="sound" size={18} /> {tr('app.tester_le_son')}</button>}>
          <div className="k-card">
            <label className="k-range"><span><Icon name={vol ? 'sound' : 'mute'} size={20} /><b>{tr('app.effets')}</b><em>{vol} %</em></span>
              <input type="range" min={0} max={100} step={1} value={vol}
                onChange={(e) => { const v = Number(e.target.value); set({ volume: v / 100, muted: v === 0 }); }} /></label>
            <Toggle label={tr('app.couper_tous_les_sons')} checked={settings.muted} onChange={(b) => set({ muted: b })} />
          </div>
        </Section>
        <Section title={tr('app.lancer_les_des')}>
          <div className="k-card">
            <Toggle label={tr('app.secouer_le_telephone_pour_lancer')} checked={settings.shake}
              onChange={async (on) => { if (on && needsMotionPermission() && !(await requestMotionPermission())) return; set({ shake: on }); }} />
            <Toggle label={tr('app.lancer_au_gobelet')} hint={tr('app.les_des_partent_d_un_gobelet_renvers')} checked={settings.cup} onChange={(b) => set({ cup: b })} />
            <Toggle label={tr('app.vibrations')} hint={tr('app.quand_les_des_frappent_telephone')} checked={settings.vibrate} onChange={(b) => set({ vibrate: b })} />
            <Toggle label={tr('app.m_alerter_quand_c_est_mon_tour')} hint={tr('app.onglet_qui_clignote_et_petit_son_qua')} checked={settings.turnAlert} onChange={(b) => set({ turnAlert: b })} />
          </div>
        </Section>
        <Section title={tr('app.graphismes')}>
          <Choices value={settings.quality} onChange={(q) => set({ quality: q })}
            options={[{ v: 'haute', label: tr('app.haute'), hint: tr('app.ombres_fines') }, { v: 'normale', label: tr('app.normale'), hint: tr('app.plus_leger') }]} />
        </Section>
        <Section title={tr('app.aide')}>
          <div className="k-links">
            <InstallPrompt />
            <a className="btn" href={reportUrl()}><Icon name="flag" size={18} /> {tr('app.signaler_un_probleme')}</a>
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
      setShot({ id: Date.now(), text: next[0] === 1 ? tr('app.trois_as') : '4-2-1 !' });
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
        <button className="icon-btn" onClick={onBack} aria-label={tr('app.retour')}><Icon name="back" /></button>
        <div className="phase"><span className="logo-mini">421</span><span>{tr('app.bac_d_essai')}</span></div>
        <div className="top-actions">
          <VolumeControl settings={settings} onSettings={onSettings} />
        </div>
      </div></div>
      <div className="actionbar">
        <div className="status"><div className="turn-line"><b>{rolling ? tr('app.les_des_roulent') : count ? combo.label : tr('app.lancez_pour_essayer')}</b></div>
          <div className="throws"><span>{count} {tr(count > 1 ? 'app.lancer_touchez_un_de_pour_le_garder.p' : 'app.lancer_touchez_un_de_pour_le_garder')}</span></div></div>
        <div className="result">{count > 0 && !rolling && (
          <div className="keep-row">{dice.map((d, i) => (
            <button key={i} className={`keep-die${keep[i] ? ' on' : ''}`} onClick={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))}>
              <MiniDie value={d} size={30} kept={keep[i]} /><small>{keep[i] ? tr('app.garde_2') : tr('app.relance')}</small>
            </button>))}</div>)}
        </div>
        <div className="buttons">
          <button className="btn primary big" disabled={rolling || keep.every(Boolean)} onClick={() => roll()}>
            🎲 {keep.some(Boolean) ? tr('app.relancer', { n: keep.filter((k) => !k).length }) : tr('app.lancer_les_des')}
          </button>
          {keep.some(Boolean) && <button className="btn ghost small" onClick={() => setKeep([false, false, false])}>{tr('app.tout_relancer')}</button>}
          <button className="btn ghost small" disabled={rolling} onClick={() => void roll(undefined, true)}>
            ✨ {tried ? tr('app.essayer', { name: tried.name }) : tr('app.voir_la_celebration_du_4_2_1')}
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
