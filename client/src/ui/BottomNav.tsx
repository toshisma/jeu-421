/**
 * Barre du bas « Accueil · Amis · Collection · Boutique · Plus », présente sur tous les écrans
 * (rendue une seule fois par App.tsx, sous la zone d'affichage des écrans). Pendant une partie,
 * elle passe en version compacte (icônes seules, plus basse) : le plateau garde presque toute la place.
 * Le menu « Plus » (tout le général, avec la recherche) et ses fiches s'ouvrent par-dessus l'écran en cours.
 */
import { useEffect, useState } from 'react';
import { CURRENT_VERSION } from '../../../shared/changelog';
import type { ProfileApi } from '../account/useProfile';
import { api } from '../account/api';
import type { Settings } from '../settings';
import { reportUrl } from '../legal';
import { useUnread } from '../messages';
import { Icon } from './Icon';
import { Sheet } from './kit';
import { VolumeControl } from './VolumeControl';
import { InstallPrompt } from './InstallPrompt';
import { changelogUnseen } from './Changelog';
import { STANDALONE } from './Screens';
import { GUIDES_421 } from './ClassicMenu';
import { QuestsPanel } from './AccountScreens';
import { ReferralCard } from './Referral';
import { DiscordCard, type useDiscord } from './Discord';
import { ProfileView } from './ProfileView';
import { tr, useLang } from '../i18n/lang';
import { FrenchOnlyNote } from '../i18n/LangSwitch';

export type NavTab = 'home' | 'friends' | 'collection' | 'shop' | null;
export type PlusSheet = 'menu' | 'profile' | 'missions' | 'parrainage' | 'discord';
type IconName = Parameters<typeof Icon>[0]['name'];

/** Tout ce que la barre et le menu « Plus » savent ouvrir (déjà protégé par la confirmation de départ). */
export interface NavActions {
  onHome: () => void; onFriends: () => void; onCollection: (open?: boolean) => void; onShop: () => void; onMessages: () => void;
  onClassic: () => void; onCards: () => void; onDixMille: () => void;
  onAccount: () => void; onLogin: () => void; onSettings: () => void; onSandbox: () => void; onLegal: () => void;
  onPass: () => void; onStats: () => void; onClub: () => void; onDuels: () => void; onRecap: () => void; onChangelog: () => void;
  onAdmin: () => void; onModeration: () => void;
  onLeaderboard: () => void; onRules: () => void; onTutorial: () => void; onTournaments: () => void; onAlbum: () => void;
  onParty: () => void; onOnline: () => void; onChallenge: () => void;
}

type Discord = ReturnType<typeof useDiscord>['discord'];

/** Sac Discord pas encore récupéré (compte, vérification active) : point rouge jusqu'à la récupération. */
export const discordPending = (pa: ProfileApi, d: Discord) => pa.isAccount && !STANDALONE && !!d?.invite && !!d.verify && !d.claimed;

/** Pages de guide des deux autres jeux (référencement), en bas du menu « Plus ». */
const GUIDES_MORE: [string, () => string][] = [['/coups-fourres', () => 'Coups Fourrés'], ['/dix-mille-en-ligne', () => tr('app.le_dix_mille_en_ligne')]];

/** Menu « Plus » : tout le général, rangé par thème, avec une recherche (qui trouve aussi le 421). */
function PlusMenu({ a, pa, settings, onChangeSettings, discord, unread, onSheet, onClose }: {
  a: NavActions; pa: ProfileApi; settings: Settings; onChangeSettings: (s: Settings) => void; discord: Discord; unread: number;
  onSheet: (s: PlusSheet) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const acc = pa.isAccount && !STANDALONE;
  const [role, setRole] = useState<{ admin: boolean; moderator: boolean; pending: number }>({ admin: false, moderator: false, pending: 0 });
  useEffect(() => { if (acc && pa.token) api<{ admin: boolean; moderator: boolean; pending: number }>('/moderation/whoami', { token: pa.token }).then(setRole).catch(() => {}); }, [acc, pa.token]);
  const admin = role.admin;
  type Item = { label: string; icon: IconName; go: () => void; show?: boolean; dot?: boolean; keys?: string; /** Montré seulement quand on cherche. */ search?: boolean };
  const groups: { title: string; items: Item[] }[] = [
    { title: tr('plus.g.mine'), items: [
      { label: tr('plus.profile'), icon: 'user', go: () => onSheet('profile'), keys: 'titre avatar photo succes niveau' },
      { label: tr('plus.pass'), icon: 'ticket', go: a.onPass, keys: 'saison paliers' },
      { label: tr('plus.quests'), icon: 'check', go: () => onSheet('missions'), keys: 'missions quetes' },
      { label: tr('plus.recap'), icon: 'chart', go: a.onRecap },
      { label: tr('plus.referral'), icon: 'gift', go: () => (acc ? onSheet('parrainage') : a.onAccount()), show: !STANDALONE, keys: 'inviter ami sac offert' },
      { label: tr('plus.sandbox'), icon: 'dice', go: a.onSandbox, keys: 'lancer entrainement des effets' },
    ] },
    { title: tr('plus.g.players'), items: [
      { label: tr('plus.messages'), icon: 'chat', go: a.onMessages, show: acc, dot: unread > 0, keys: 'messages prives discuter' },
      { label: tr('plus.club'), icon: 'club', go: a.onClub, show: !STANDALONE },
      { label: tr('plus.duels'), icon: 'target', go: a.onDuels, show: !STANDALONE, keys: 'duels' },
      { label: tr('plus.discord'), icon: 'chat', go: () => onSheet('discord'), show: !STANDALONE && !!discord?.invite, dot: discordPending(pa, discord), keys: 'discord communaute serveur sac offert' },
      { label: tr('plus.stats'), icon: 'stats', go: a.onStats, show: !STANDALONE, keys: 'en ligne joueurs' },
    ] },
    { title: tr('plus.g.settings'), items: [
      { label: tr('plus.settings'), icon: 'settings', go: a.onSettings, keys: 'son vibration qualite graphismes secouer gobelet alerte' },
      { label: tr(acc ? 'plus.myAccount' : 'plus.account'), icon: 'key', go: acc ? a.onAccount : a.onLogin, show: !STANDALONE, keys: 'connexion mot de passe' },
      { label: 'Administration', icon: 'settings', go: a.onAdmin, show: admin, dot: role.pending > 0, keys: 'admin bannir pieces tableau de bord signalements moderation cartes' },
      { label: 'Modération', icon: 'flag', go: a.onModeration, show: role.moderator && !admin, dot: role.pending > 0, keys: 'signalements sanctions moderateur' },
    ] },
    { title: tr('plus.g.games'), items: [
      { label: tr('plus.classic'), icon: 'dice', go: a.onClassic, keys: 'jeu de base solo en ligne' },
      { label: tr('plus.cf'), icon: 'cards', go: a.onCards, keys: 'cartes mode cartes deck booster capsules ligue' },
      { label: tr('plus.courtier'), icon: 'dice', go: a.onDixMille, keys: '10000 dix mille farkle six des courtisan groschen' },
      // Le 421 : seulement à la recherche (tout est dans son menu).
      { label: tr('app.regles_du_421'), icon: 'rules', go: a.onRules, search: true, keys: 'regles combinaisons charge decharge' },
      { label: tr('app.partie_guidee_421'), icon: 'resume', go: a.onTutorial, search: true, keys: 'tuto apprendre' },
      { label: tr('app.tournois_du_421'), icon: 'trophy', go: a.onTournaments, search: true, show: !STANDALONE, keys: 'tournoi 11h 21h perso' },
      { label: tr('app.classement_du_421'), icon: 'trophy', go: a.onLeaderboard, search: true, show: !STANDALONE, keys: 'classement ligue saison division' },
      { label: tr('app.album'), icon: 'album', go: a.onAlbum, search: true, keys: 'combinaisons' },
      { label: tr('app.regarder_une_partie'), icon: 'eye', go: a.onOnline, search: true, show: !STANDALONE, keys: 'spectateur parties en cours tables' },
      { label: tr('app.soiree_un_telephone'), icon: 'cheers', go: a.onParty, search: true, keys: 'vrais des arbitre entre amis' },
      { label: tr('app.defi_du_jour_421'), icon: 'target', go: a.onChallenge, search: true, keys: 'defi' },
    ] },
  ];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = norm(q.trim());
  const pick = (go: () => void) => { onClose(); go(); };
  return (
    <Sheet title={tr('nav.more')} onClose={onClose}>
      <div className="plus-audio"><span>{tr('plus.sound')}</span><VolumeControl settings={settings} onSettings={onChangeSettings} /><button className="plus-set" onClick={() => pick(a.onSettings)}><Icon name="settings" size={18} />{tr('plus.settings')}</button><InstallPrompt compact /></div>
      <label className="plus-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('plus.search')} aria-label={tr('plus.searchLabel')} /></label>
      {groups.map((g) => {
        const items = g.items.filter((i) => i.show !== false && (nq ? norm(`${i.label} ${i.keys ?? ''}`).includes(nq) : !i.search));
        if (!items.length) return null;
        return (
          <section key={g.title} className="plus-group">
            <h3>{g.title}</h3>
            <div className="plus-grid">
              {items.map((i) => <button key={i.label} onClick={() => pick(i.go)}><Icon name={i.icon} size={22} /><span>{i.label}</span>{i.dot && <i className="plus-dot" aria-label={tr('plus.seen')} />}</button>)}
            </div>
          </section>
        );
      })}
      <FrenchOnlyNote />
      <div className="plus-foot">
        <button className="link small-link" onClick={() => pick(a.onChangelog)}>{tr('plus.news', { v: CURRENT_VERSION })}{changelogUnseen() && <i className="new-dot" aria-label={tr('plus.newVersion')} />}</button>
        <a className="link small-link" href={reportUrl()}>{tr('plus.report')}</a>
        <button className="link small-link" onClick={() => pick(a.onLegal)}>{tr('plus.privacy')}</button>
        {!STANDALONE && [...GUIDES_421, ...GUIDES_MORE].map(([href, label]) => <a key={href} className="link small-link" href={href}>{typeof label === 'function' ? label() : label}</a>)}
      </div>
    </Sheet>
  );
}

/** Menu « Plus » et ses fiches (profil, défis du jour, parrainage, Discord), par-dessus l'écran en cours. */
export function NavSheets({ sheet, setSheet, a, pa, settings, onChangeSettings, discord, displayName, avatar }: {
  sheet: PlusSheet | null; setSheet: (s: PlusSheet | null) => void; a: NavActions; pa: ProfileApi; settings: Settings; onChangeSettings: (s: Settings) => void;
  discord: Discord; displayName: string; avatar: string;
}) {
  const unread = useUnread(pa.token);
  const close = () => setSheet(null);
  if (!sheet) return null;
  if (sheet === 'menu') return <PlusMenu a={a} pa={pa} settings={settings} onChangeSettings={onChangeSettings} discord={discord} unread={unread} onSheet={setSheet} onClose={close} />;
  if (sheet === 'profile') return <ProfileView pa={pa} displayName={displayName} avatar={avatar} onClose={close} />;
  if (sheet === 'missions') return <Sheet title={tr('app.defis_du_jour')} onClose={close}><QuestsPanel profile={pa.profile} onClaim={pa.claim} /></Sheet>;
  if (sheet === 'parrainage') return <Sheet title={tr('app.parrainage')} onClose={close}><ReferralCard pa={pa} onAccount={() => { close(); a.onAccount(); }} /></Sheet>;
  if (sheet === 'discord' && discord) return <Sheet title="Discord" onClose={close}><DiscordCard pa={pa} state={discord} onAccount={() => { close(); a.onAccount(); }} /></Sheet>;
  return null;
}

/** La barre elle-même. `active` : l'onglet de l'écran affiché (aucun dans les menus de jeu et les parties). */
export function BottomNav({ active, compact, plusOpen, pa, requests, bags, plusDot, a, onPlus }: {
  active: NavTab; compact: boolean; plusOpen: boolean; pa: ProfileApi; requests: number; bags: number; plusDot: boolean;
  a: NavActions; onPlus: () => void;
}) {
  useLang();
  const unread = useUnread(pa.token);
  const friends = requests + (pa.isAccount ? unread : 0);
  const sz = compact ? 20 : 22;
  const tab = (id: Exclude<NavTab, null>, icon: IconName, label: string, go: () => void, badge?: React.ReactNode) => (
    <button className={active === id ? 'on' : undefined} aria-current={active === id ? 'page' : undefined} aria-label={compact ? label : undefined}
      onClick={() => { if (active !== id) go(); }}>
      <Icon name={icon} size={sz} />{!compact && <span>{label}</span>}{badge}
    </button>
  );
  const dot = (n: number) => (n > 0 ? <i className="tab-dot">{n > 99 ? '99+' : n}</i> : null);
  return (
    <nav className={`h2-tabs app-tabs${compact ? ' compact' : ''}`} aria-label={tr('nav.label')}>
      {tab('home', 'home', tr('nav.home'), a.onHome)}
      {!STANDALONE && tab('friends', 'people', tr('nav.friends'), a.onFriends, dot(friends))}
      {!STANDALONE && tab('collection', 'grid', tr('nav.collection'), () => a.onCollection(), dot(bags))}
      {tab('shop', 'shop', tr('nav.shop'), a.onShop)}
      <button className={plusOpen ? 'on' : undefined} aria-label={compact ? tr('nav.more') : undefined} aria-expanded={plusOpen} onClick={onPlus}>
        <Icon name="menu" size={sz} />{!compact && <span>{tr('nav.more')}</span>}{plusDot && <i className="tab-dot small" />}
      </button>
    </nav>
  );
}
