import { reputation } from '../../../shared/progress/comptoirs';
import { titleL } from '../i18n/data';
/**
 * Profil d'un joueur : le sien (photo modifiable, argent, XP, statistiques, succès) ou celui
 * d'un autre joueur (informations publiques : jamais son argent).
 */
import { trServer, loc, tr } from '../i18n/lang';
import { useEffect, useRef, useState } from 'react';
import { Showcase } from './DiceCollection';
import { collectionCount } from '../../../shared/progress/profile';
import { askConfirm } from './confirm';
import { Icon } from './Icon';
import { ACHIEVEMENTS, EMPTY_STATS, type Stats } from '../../../shared/progress/achievements';
import { PRESTIGE_COINS, PRESTIGE_LEVEL, levelInfo, purchases } from '../../../shared/progress/profile';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { Avatar } from './Avatar';
import { TitlePicker } from './Progression';
import { accessoryEmoji } from '../../../shared/progress/catalog';
import { Empty, Section, Tabs, useToast } from './kit';
import { ReportDialog } from './Report';

interface PublicPlayer {
  title?: string | null;
  accessory?: string;
  rivalry?: { mine: number; theirs: number } | null;
  /** Tournée des comptoirs : étoiles. */
  reputation?: number;
  league?: string;
  username: string; photo: string | null; createdAt: number; rank: number | null;
  level: number; xp: number; into: number; need: number;
  onlineGames: number; onlineWins: number;
  stats: Pick<Stats, 'played' | 'won' | 'total421' | 'bestStreak'>;
  achievements: Record<string, number>;
  showcase?: string[];
  collection?: { owned: number; total: number; shiny: number };
}

const fmt = (n: number) => n.toLocaleString(loc());
const date = (t: number) => new Date(t).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' });

function XpCard({ level, xp, into, need }: { level: number; xp: number; into: number; need: number }) {
  return (
    <div className="pv-level" title={tr('app.l_xp_se_gagne_en_jouant_et')}>
      <span className="pv-lvl-badge"><small>{tr('app.niv')}</small><b>{level}</b></span>
      <span className="pv-lvl-main">
        <span className="pv-lvl-bar"><i style={{ width: `${(100 * into) / need}%` }} /></span>
        <small>{fmt(xp)} {tr('app.xp_encore_pour_le_niveau', { v: fmt(need - into) })} {level + 1}</small>
      </span>
    </div>
  );
}

function Achievements({ unlocked, progress }: { unlocked: Record<string, number>; progress?: (id: string) => number }) {
  const n = Object.keys(unlocked).length;
  return (
    <section className="pv-ach">
      <p className="pv-ach-sum"><b>{n}</b> {tr('app.succes_sur')} {ACHIEVEMENTS.length}<span className="tile-bar"><i style={{ width: `${(100 * n) / ACHIEVEMENTS.length}%` }} /></span></p>
      {/* 0.53 : succès du Courtisan rangés à part, sous leur titre. */}
      {[ACHIEVEMENTS.filter((a) => !a.game), ACHIEVEMENTS.filter((a) => a.game === 'courtisan'), ACHIEVEMENTS.filter((a) => a.game === 'poker')].map((group, gi) => <div key={gi}>
      {gi > 0 && <h4 className="ach-group">{gi === 2 ? tr('pm.ach.title') : tr('dm2.ach.profile')}</h4>}
      <ul className="ach-grid">
        {group.map((a) => {
          const at = unlocked[a.id];
          const v = Math.min(a.target, progress?.(a.id) ?? 0);
          if (a.secret && !at) {
            return (
              <li key={a.id} className="secret" title={tr('app.succes_secret_a_vous_de_le_decouvrir')}>
                <span className="ach-icon">❔</span>
                <span className="ach-name">{tr('app.succes_secret')}</span>
                <span className="ach-desc">{tr('app.a_decouvrir_en_jouant_pieces', { coins: a.coins })}</span>
              </li>
            );
          }
          return (
            <li key={a.id} className={`${at ? 'on' : ''}${a.rare ? ' rare' : ''}`} title={at ? tr('app.debloque_le', { v: date(at) }) : a.description}>
              <span className="ach-icon">{at ? a.icon : '🔒'}</span>
              <span className="ach-name">{a.name}{a.rare && <em className="ach-rare"> {tr('app.difficile_2')}</em>}</span>
              <span className="ach-desc">{a.description}</span>
              {at ? <span className="ach-ok">✓ {date(at)}</span>
                : progress ? <span className="ach-prog"><i style={{ width: `${(100 * v) / a.target}%` }} /><em>{v} {tr('app.sur_pieces', { target: a.target, coins: a.coins })}</em></span>
                  : <span className="ach-desc">{a.coins} {tr('app.pieces_2')}</span>}
            </li>
          );
        })}
      </ul>
      </div>)}
    </section>
  );
}

type PvTab = 'stats' | 'succes' | 'parties';

export function ProfileView({ pa, username, displayName, avatar, onClose, onInvite, onMessage, onWatch }: {
  pa: ProfileApi; username?: string | null; displayName?: string; avatar?: string; onClose: () => void;
  /** Ouvre une table et y invite ce joueur (amis seulement). */
  onInvite?: (username: string) => void;
  /** Ouvre la conversation privée avec ce joueur (amis seulement). */
  onMessage?: (username: string) => void;
  /** Regarder la partie en cours de cet ami (mode spectateur). */
  onWatch?: (code: string, game?: string) => void;
}) {
  const other = !!username && username !== pa.session?.username;
  const [pub, setPub] = useState<PublicPlayer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [watchCode, setWatchCode] = useState<string | null>(null);
  const [watchGame, setWatchGame] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<PvTab>('stats');
  const [reporting, setReporting] = useState(false);
  const [toast, showToast] = useToast();
  useEffect(() => { if (msg) showToast(msg); }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!other || !pa.token) return;
    api<{ friends: { username: string; room?: { code: string; watchable?: boolean; game?: string } | null }[] }>('/friends', { token: pa.token })
      .then((r) => {
        const f = r.friends.find((x) => x.username.toLowerCase() === username!.toLowerCase());
        setIsFriend(!!f);
        setWatchCode(f?.room?.watchable ? f.room.code : null);
        setWatchGame(f?.room?.game);
      }).catch(() => {});
  }, [other, username, pa.token]);

  useEffect(() => {
    if (!other) return;
    api<{ player: PublicPlayer }>(`/players/${encodeURIComponent(username!)}`, { token: pa.token }).then((r) => setPub(r.player)).catch((e) => setErr(e.message));
  }, [other, username]);

  const tabs = (achN: number, _total: number) => (
    <Tabs label={tr('app.profil')} value={tab} onChange={setTab}
      options={[{ v: 'stats', label: tr('app.stats'), icon: 'chart' }, { v: 'succes', label: tr('app.succes'), icon: 'trophy', badge: achN }, { v: 'parties', label: tr('app.parties'), icon: 'history' }]} />
  );
  let body: React.ReactNode;
  if (other) {
    body = !pub ? <p className="muted">{err ?? tr('app.chargement')}</p> : (
      <>
        <div className="pv-hero">
          <Avatar photo={pa.isBlocked(pub.username) ? null : pub.photo} emoji="🎲" size={84} accessory={pub.accessory || undefined} />
          <div className="pv-hero-text">
            <div className="pv-name">{pub.username}</div>
            {pub.title && <div className="pv-title">{pub.title}</div>}
            <div className="pv-chips">
              {pub.league && <span className="pv-chip">{tr('app.ligue')} {trServer(pub.league)}</span>}
              {pub.rank ? <span className="pv-chip">{pub.rank}{tr('app.e_au_classement')}</span> : null}
              {pub.reputation ? <span className="pv-chip" title={tr('tdc.title')}>★ {pub.reputation} · {tr('tdc.rep')}</span> : null}
              <span className="pv-chip dim">{tr('app.depuis_le')} {date(pub.createdAt)}</span>
            </div>
          </div>
        </div>
        {pub.rivalry && <div className="pv-rival"><Icon name="target" size={18} />{pub.rivalry.mine > pub.rivalry.theirs ? tr('app.vous_menez_a', { mine: pub.rivalry.mine, theirs: pub.rivalry.theirs })
          : pub.rivalry.mine < pub.rivalry.theirs ? tr('app.mene_a', { username: pub.username, theirs: pub.rivalry.theirs, mine: pub.rivalry.mine }) : tr('app.egalite_partout', { mine: pub.rivalry.mine })} {tr('app.contre_ce_joueur')}</div>}
        <div className="pv-friend">
          {!pa.isAccount ? <p className="k-hint">{tr('app.creez_un_compte_pour_ajouter_en_ami', { username: pub.username })}</p>
            : isFriend ? <>{onWatch && watchCode && <button className="btn primary" onClick={() => onWatch(watchCode, watchGame)}><Icon name="eye" size={18} /> {tr('app.regarder_sa_partie')}</button>}
              {onInvite && !watchCode && <button className="btn primary" onClick={() => onInvite(pub.username)}><Icon name="dice" size={18} /> {tr('app.inviter_a_jouer')}</button>}
              {onMessage && <button className="btn" onClick={() => onMessage(pub.username)}><Icon name="chat" size={18} /> {tr('app.message')}</button>}
              <span className="pv-chip ok"><Icon name="check" size={14} /> {tr('app.amis')}</span></>
              : <button className="btn primary" onClick={async () => {
                try {
                  const r = await api<{ result: string }>('/friends', { body: { username: pub.username }, token: pa.token });
                  if (r.result === 'accepted') setIsFriend(true);
                  setMsg(r.result === 'accepted' ? tr('app.vous_etes_maintenant_amis') : tr('app.demande_d_ami_envoyee'));
                } catch (e) { setMsg((e as Error).message); }
              }}><Icon name="plus" size={18} /> {tr('app.ajouter_en_ami')}</button>}
        </div>
        {tabs(Object.keys(pub.achievements).length, ACHIEVEMENTS.length)}
        {tab === 'stats' && <>
          <XpCard level={pub.level} xp={pub.xp} into={pub.into} need={pub.need} />
          <div className="pv-stats">
            <div><b>{pub.onlineWins}</b><small>{tr('app.victoires_en_ligne')}</small></div>
            <div><b>{pub.onlineGames}</b><small>{tr('app.parties_en_ligne')}</small></div>
            <div><b>{pub.stats.total421}</b><small>4-2-1</small></div>
            <div><b>{pub.stats.bestStreak}</b><small>{tr('app.meilleure_serie')}</small></div>
          </div>
          {(pub.showcase?.length || pub.collection?.owned) ? <Section title={tr('app.vitrine')}><Showcase ids={pub.showcase ?? []} count={pub.collection} /></Section> : null}
        </>}
        {tab === 'parties' && <History username={pub.username} />}
        {tab === 'succes' && <Achievements unlocked={pub.achievements} />}
        {(
          <div className="pv-danger">
            {pa.isAccount && <button className="btn ghost small danger" onClick={async () => {
              const on = !pa.isBlocked(pub.username);
              if (on && !(await askConfirm(tr('app.bloquer_sa_photo_et_ses_reactions_se', { username: pub.username }), tr('app.bloquer')))) return;
              const e = await pa.block(pub.username, on);
              setMsg(e ?? (on ? tr('app.est_bloque', { username: pub.username }) : tr('app.est_debloque_2', { username: pub.username })));
            }}>{pa.isBlocked(pub.username) ? tr('app.debloquer') : tr('app.bloquer_ce_joueur')}</button>}
            <button className="btn ghost small" onClick={() => setReporting(true)}><Icon name="flag" size={18} /> {tr('app.signaler_ce_joueur')}</button>
            {pa.isAccount && pub.photo && (
              <button className="btn ghost small" onClick={async () => {
                if (!(await askConfirm(tr('app.signaler_la_photo_de_ce_joueur_comme'), tr('app.signaler')))) return;
                try { await api('/report', { body: { username: pub.username, reason: 'photo' }, token: pa.token }); setMsg(tr('app.merci_la_photo_a_ete_signalee')); }
                catch (e) { setMsg((e as Error).message); }
              }}><Icon name="flag" size={18} /> {tr('app.signaler_la_photo')}</button>
            )}
          </div>
        )}
      </>
    );
  } else {
    const p = pa.profile;
    const li = levelInfo(p.xp);
    const s = { ...EMPTY_STATS, ...p.stats };
    const input = { stats: s, level: li.level, purchases: purchases(p), owned: p.owned, dm: p.dm };
    const progress = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.value(input);
    const name = pa.session?.username ?? (displayName || tr('app.invite'));
    body = (
      <>
        <div className="pv-hero">
          <button className="pv-photo" onClick={() => file.current?.click()} aria-label={pa.photo ? tr('app.changer_la_photo') : tr('app.ajouter_une_photo')}>
            <Avatar photo={pa.photo} emoji={avatar} size={84} accessory={accessoryEmoji(p.equipped.accessoire)} />
            <i className="pv-photo-ic" aria-hidden><Icon name="camera" size={15} /></i>
          </button>
          <div className="pv-hero-text">
            <div className="pv-name">{name}{(p.prestige ?? 0) > 0 && <span className="prestige" title={tr('app.prestige', { prestige: p.prestige })}> ★{p.prestige}</span>}</div>
            {titleL(p.title) && <div className="pv-title">{titleL(p.title)}</div>}
            <div className="pv-chips">
              <span className="pv-chip">{pa.isAccount ? tr('app.compte_joueur') : tr('app.invite_progression_sur_cet_appareil')}</span>
              {reputation(p.tdc) > 0 && <span className="pv-chip" title={tr('tdc.title')}>★ {reputation(p.tdc)} · {tr('tdc.rep')}</span>}
            </div>
          </div>
        </div>
        <div className="pv-photo-row">
          <button className="btn small" onClick={() => file.current?.click()}><Icon name="camera" size={18} /> {pa.photo ? tr('app.changer_la_photo') : tr('app.ajouter_une_photo')}</button>
          {pa.photo && <button className="btn ghost small" onClick={() => void pa.removePhoto()}>{tr('app.retirer')}</button>}
          {pa.isAccount && <small className="k-hint">{tr('app.visible_des_autres_joueurs')}</small>}
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setErr(await pa.setPhoto(f));
        }} />
        {err && <p className="error small">{err}</p>}
        {li.level >= PRESTIGE_LEVEL && (
          <div className="prestige-box">
            <p><b>{tr('app.niveau_atteint_le_prestige_vous_atte', { PRESTIGE_LEVEL })}</b> {tr('app.votre_niveau_repart_a_1_vous_gardez')}{(p.prestige ?? 0) + 1} {tr('app.visible_de_tous_pieces_et_la_boutiqu', { PRESTIGE_COINS })}</p>
            <button className="btn primary" onClick={async () => { if (await askConfirm(tr('app.passer_prestige_votre_niveau_repart_'), tr('app.passer_prestige_2'))) setErr(await pa.prestige()); }}>{tr('app.passer_prestige')}{(p.prestige ?? 0) + 1}</button>
          </div>
        )}
        {tabs(Object.keys(p.achievements).length, ACHIEVEMENTS.length)}
        {tab === 'stats' && <>
          <div className="pv-money">
            <XpCard level={li.level} xp={p.xp} into={li.into} need={li.need} />
            <div className="pv-wallet" title={tr('app.les_pieces_se_gagnent_victoires_defi')}>
              <i aria-hidden /><b>{fmt(p.coins)}</b><small>{tr('app.pieces_2')}</small>
            </div>
          </div>
          <p className="k-hint">{tr('app.l_xp_fait_monter_de_niveau_et')}</p>
          <div className="pv-stats">
            <div><b>{s.played}</b><small>{tr('app.parties_2')}</small></div>
            <div><b>{s.won}</b><small>{tr('app.victoires_2')}</small></div>
            <div><b>{s.played ? Math.round((100 * s.won) / s.played) : 0} %</b><small>{tr('app.de_victoires')}</small></div>
            <div><b>{s.total421}</b><small>4-2-1</small></div>
            <div><b>{s.onlineWins}/{s.onlineGames}</b><small>{tr('app.en_ligne_2')}</small></div>
            <div><b>{s.bestStreak}</b><small>{tr('app.meilleure_serie')}</small></div>
            <div><b>{s.brelans}</b><small>{tr('app.brelans')}</small></div>
            <div><b>{purchases(p)}</b><small>{tr('app.objets_achetes')}</small></div>
          </div>
          <Section title={tr('app.titre')}><TitlePicker pa={pa} /></Section>
          {(p.showcase?.length || collectionCount(p).owned) ? <Section title={tr('app.ma_vitrine')}><Showcase ids={p.showcase ?? []} count={collectionCount(p)} /></Section> : null}
        </>}
        {tab === 'parties' && (pa.session?.username ? <History username={pa.session.username} /> : <Empty icon="history">{tr('app.creez_un_compte_pour_garder_l_histor')}</Empty>)}
        {tab === 'succes' && <Achievements unlocked={p.achievements} progress={progress} />}
      </>
    );
  }

  return (
    <div className="sheet-back pv-back" role="dialog" aria-modal="true" aria-label={tr('app.profil')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet profile-sheet">
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head">
          <h2>{other ? tr('app.profil') : tr('app.mon_profil')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={tr('app.fermer')}><Icon name="close" /></button>
        </header>
        <div className="sheet-body pv-body">{body}</div>
      </div>
      {toast}
      {reporting && pub && <ReportDialog pa={pa} target={{ username: pub.username }} onClose={() => setReporting(false)} />}
    </div>
  );
}

/** Dernières parties d'un joueur : quand, contre qui, gagnée ou perdue. */
function History({ username }: { username: string }) {
  const [games, setGames] = useState<{ mode: string; humans: number; bots: number; endedAt: number; duration: number; won: boolean }[] | null>(null);
  useEffect(() => { api<{ games: NonNullable<typeof games> }>(`/players/${encodeURIComponent(username)}/history`).then((r) => setGames(r.games)).catch(() => setGames([])); }, [username]);
  if (!games) return null;
  const when = (t: number) => {
    const m = Math.round((Date.now() - t) / 60_000);
    return m < 60 ? tr('app.il_y_a_min', { v: Math.max(1, m) }) : m < 1440 ? tr('app.il_y_a_h', { v: Math.round(m / 60) }) : new Date(t).toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  };
  return (
    <>
      {!games.length ? <Empty icon="history">{tr('app.aucune_partie_enregistree_pour_l_ins')}</Empty> : (
        <ul className="history">
          {games.map((g, i) => (
            <li key={i} className={g.won ? 'won' : ''}>
              <span className="h-ico" aria-hidden>{g.won ? '🏆' : '🍺'}</span>
              <span className="h-main"><b>{g.won ? tr('app.victoire_2') : tr('app.defaite')} {g.mode === 'online' ? 'en ligne' : tr('app.contre_l_ordinateur')}</b>
                <small>{g.mode === 'online' ? tr(g.humans > 1 ? 'app.joueur.p' : 'app.joueur', { humans: g.humans, v2: g.bots ? tr('app.ordi', { bots: g.bots }) : '' }) : tr(g.bots > 1 ? 'app.adversaire.p' : 'app.adversaire', { bots: g.bots })} · {Math.max(1, Math.round(g.duration / 60))} {tr('app.min_2')}</small></span>
              <small className="h-when">{when(g.endedAt)}</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
