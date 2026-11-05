/**
 * Profil d'un joueur : le sien (photo modifiable, argent, XP, statistiques, succès) ou celui
 * d'un autre joueur (informations publiques : jamais son argent).
 */
import { useEffect, useRef, useState } from 'react';
import { Showcase } from './DiceCollection';
import { collectionCount } from '../../../shared/progress/profile';
import { askConfirm } from './confirm';
import { Icon } from './Icon';
import { ACHIEVEMENTS, EMPTY_STATS, type Stats } from '../../../shared/progress/achievements';
import { PRESTIGE_COINS, PRESTIGE_LEVEL, levelInfo, purchases, titleLabel } from '../../../shared/progress/profile';
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
  league?: string;
  username: string; photo: string | null; createdAt: number; rank: number | null;
  level: number; xp: number; into: number; need: number;
  onlineGames: number; onlineWins: number;
  stats: Pick<Stats, 'played' | 'won' | 'total421' | 'bestStreak'>;
  achievements: Record<string, number>;
  showcase?: string[];
  collection?: { owned: number; total: number; shiny: number };
}

const fmt = (n: number) => n.toLocaleString('fr-BE');
const date = (t: number) => new Date(t).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });

function XpCard({ level, xp, into, need }: { level: number; xp: number; into: number; need: number }) {
  return (
    <div className="pv-level" title="L'XP se gagne en jouant et fait monter de niveau. Elle ne se dépense pas.">
      <span className="pv-lvl-badge"><small>Niv.</small><b>{level}</b></span>
      <span className="pv-lvl-main">
        <span className="pv-lvl-bar"><i style={{ width: `${(100 * into) / need}%` }} /></span>
        <small>{fmt(xp)} XP · encore {fmt(need - into)} pour le niveau {level + 1}</small>
      </span>
    </div>
  );
}

function Achievements({ unlocked, progress }: { unlocked: Record<string, number>; progress?: (id: string) => number }) {
  const n = Object.keys(unlocked).length;
  return (
    <section className="pv-ach">
      <p className="pv-ach-sum"><b>{n}</b> succès sur {ACHIEVEMENTS.length}<span className="tile-bar"><i style={{ width: `${(100 * n) / ACHIEVEMENTS.length}%` }} /></span></p>
      <ul className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          const v = Math.min(a.target, progress?.(a.id) ?? 0);
          if (a.secret && !at) {
            return (
              <li key={a.id} className="secret" title="Succès secret : à vous de le découvrir">
                <span className="ach-icon">❔</span>
                <span className="ach-name">Succès secret</span>
                <span className="ach-desc">À découvrir en jouant… {a.coins} pièces</span>
              </li>
            );
          }
          return (
            <li key={a.id} className={`${at ? 'on' : ''}${a.rare ? ' rare' : ''}`} title={at ? `Débloqué le ${date(at)}` : a.description}>
              <span className="ach-icon">{at ? a.icon : '🔒'}</span>
              <span className="ach-name">{a.name}{a.rare && <em className="ach-rare"> difficile</em>}</span>
              <span className="ach-desc">{a.description}</span>
              {at ? <span className="ach-ok">✓ {date(at)}</span>
                : progress ? <span className="ach-prog"><i style={{ width: `${(100 * v) / a.target}%` }} /><em>{v} sur {a.target}, {a.coins} pièces</em></span>
                  : <span className="ach-desc">{a.coins} pièces</span>}
            </li>
          );
        })}
      </ul>
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
  onWatch?: (code: string) => void;
}) {
  const other = !!username && username !== pa.session?.username;
  const [pub, setPub] = useState<PublicPlayer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [watchCode, setWatchCode] = useState<string | null>(null);
  const [tab, setTab] = useState<PvTab>('stats');
  const [reporting, setReporting] = useState(false);
  const [toast, showToast] = useToast();
  useEffect(() => { if (msg) showToast(msg); }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!other || !pa.token) return;
    api<{ friends: { username: string; room?: { code: string; watchable?: boolean } | null }[] }>('/friends', { token: pa.token })
      .then((r) => {
        const f = r.friends.find((x) => x.username.toLowerCase() === username!.toLowerCase());
        setIsFriend(!!f);
        setWatchCode(f?.room?.watchable ? f.room.code : null);
      }).catch(() => {});
  }, [other, username, pa.token]);

  useEffect(() => {
    if (!other) return;
    api<{ player: PublicPlayer }>(`/players/${encodeURIComponent(username!)}`, { token: pa.token }).then((r) => setPub(r.player)).catch((e) => setErr(e.message));
  }, [other, username]);

  const tabs = (achN: number, _total: number) => (
    <Tabs label="Profil" value={tab} onChange={setTab}
      options={[{ v: 'stats', label: 'Stats', icon: 'chart' }, { v: 'succes', label: 'Succès', icon: 'trophy', badge: achN }, { v: 'parties', label: 'Parties', icon: 'history' }]} />
  );
  let body: React.ReactNode;
  if (other) {
    body = !pub ? <p className="muted">{err ?? 'Chargement…'}</p> : (
      <>
        <div className="pv-hero">
          <Avatar photo={pa.isBlocked(pub.username) ? null : pub.photo} emoji="🎲" size={84} accessory={pub.accessory || undefined} />
          <div className="pv-hero-text">
            <div className="pv-name">{pub.username}</div>
            {pub.title && <div className="pv-title">{pub.title}</div>}
            <div className="pv-chips">
              {pub.league && <span className="pv-chip">Ligue {pub.league}</span>}
              {pub.rank ? <span className="pv-chip">{pub.rank}e au classement</span> : null}
              <span className="pv-chip dim">Depuis le {date(pub.createdAt)}</span>
            </div>
          </div>
        </div>
        {pub.rivalry && <div className="pv-rival"><Icon name="target" size={18} />{pub.rivalry.mine > pub.rivalry.theirs ? `Vous menez ${pub.rivalry.mine} à ${pub.rivalry.theirs}`
          : pub.rivalry.mine < pub.rivalry.theirs ? `${pub.username} mène ${pub.rivalry.theirs} à ${pub.rivalry.mine}` : `Égalité ${pub.rivalry.mine} partout`} contre ce joueur</div>}
        <div className="pv-friend">
          {!pa.isAccount ? <p className="k-hint">Créez un compte pour ajouter {pub.username} en ami.</p>
            : isFriend ? <>{onWatch && watchCode && <button className="btn primary" onClick={() => onWatch(watchCode)}><Icon name="eye" size={18} /> Regarder sa partie</button>}
              {onInvite && !watchCode && <button className="btn primary" onClick={() => onInvite(pub.username)}><Icon name="dice" size={18} /> Inviter à jouer</button>}
              {onMessage && <button className="btn" onClick={() => onMessage(pub.username)}><Icon name="chat" size={18} /> Message</button>}
              <span className="pv-chip ok"><Icon name="check" size={14} /> Amis</span></>
              : <button className="btn primary" onClick={async () => {
                try {
                  const r = await api<{ result: string }>('/friends', { body: { username: pub.username }, token: pa.token });
                  if (r.result === 'accepted') setIsFriend(true);
                  setMsg(r.result === 'accepted' ? 'Vous êtes maintenant amis.' : 'Demande d’ami envoyée.');
                } catch (e) { setMsg((e as Error).message); }
              }}><Icon name="plus" size={18} /> Ajouter en ami</button>}
        </div>
        {tabs(Object.keys(pub.achievements).length, ACHIEVEMENTS.length)}
        {tab === 'stats' && <>
          <XpCard level={pub.level} xp={pub.xp} into={pub.into} need={pub.need} />
          <div className="pv-stats">
            <div><b>{pub.onlineWins}</b><small>victoires en ligne</small></div>
            <div><b>{pub.onlineGames}</b><small>parties en ligne</small></div>
            <div><b>{pub.stats.total421}</b><small>4-2-1</small></div>
            <div><b>{pub.stats.bestStreak}</b><small>meilleure série</small></div>
          </div>
          {(pub.showcase?.length || pub.collection?.owned) ? <Section title="Vitrine"><Showcase ids={pub.showcase ?? []} count={pub.collection} /></Section> : null}
        </>}
        {tab === 'parties' && <History username={pub.username} />}
        {tab === 'succes' && <Achievements unlocked={pub.achievements} />}
        {(
          <div className="pv-danger">
            {pa.isAccount && <button className="btn ghost small danger" onClick={async () => {
              const on = !pa.isBlocked(pub.username);
              if (on && !(await askConfirm(`Bloquer ${pub.username} ? Sa photo et ses réactions seront masquées, et il ne pourra plus s'asseoir à vos tables.`, 'Bloquer'))) return;
              const e = await pa.block(pub.username, on);
              setMsg(e ?? (on ? `${pub.username} est bloqué.` : `${pub.username} est débloqué.`));
            }}>{pa.isBlocked(pub.username) ? 'Débloquer' : 'Bloquer ce joueur'}</button>}
            <button className="btn ghost small" onClick={() => setReporting(true)}><Icon name="flag" size={18} /> Signaler ce joueur</button>
            {pa.isAccount && pub.photo && (
              <button className="btn ghost small" onClick={async () => {
                if (!(await askConfirm('Signaler la photo de ce joueur comme inappropriée ?', 'Signaler'))) return;
                try { await api('/report', { body: { username: pub.username, reason: 'photo' }, token: pa.token }); setMsg('Merci, la photo a été signalée.'); }
                catch (e) { setMsg((e as Error).message); }
              }}><Icon name="flag" size={18} /> Signaler la photo</button>
            )}
          </div>
        )}
      </>
    );
  } else {
    const p = pa.profile;
    const li = levelInfo(p.xp);
    const s = { ...EMPTY_STATS, ...p.stats };
    const input = { stats: s, level: li.level, purchases: purchases(p), owned: p.owned };
    const progress = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.value(input);
    const name = pa.session?.username ?? (displayName || 'Invité');
    body = (
      <>
        <div className="pv-hero">
          <button className="pv-photo" onClick={() => file.current?.click()} aria-label={pa.photo ? 'Changer la photo' : 'Ajouter une photo'}>
            <Avatar photo={pa.photo} emoji={avatar} size={84} accessory={accessoryEmoji(p.equipped.accessoire)} />
            <i className="pv-photo-ic" aria-hidden><Icon name="camera" size={15} /></i>
          </button>
          <div className="pv-hero-text">
            <div className="pv-name">{name}{(p.prestige ?? 0) > 0 && <span className="prestige" title={`Prestige ${p.prestige}`}> ★{p.prestige}</span>}</div>
            {titleLabel(p.title) && <div className="pv-title">{titleLabel(p.title)}</div>}
            <div className="pv-chips">
              <span className="pv-chip">{pa.isAccount ? 'Compte joueur' : 'Invité · progression sur cet appareil'}</span>
            </div>
          </div>
        </div>
        <div className="pv-photo-row">
          <button className="btn small" onClick={() => file.current?.click()}><Icon name="camera" size={18} /> {pa.photo ? 'Changer la photo' : 'Ajouter une photo'}</button>
          {pa.photo && <button className="btn ghost small" onClick={() => void pa.removePhoto()}>Retirer</button>}
          {pa.isAccount && <small className="k-hint">Visible des autres joueurs</small>}
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
            <p><b>Niveau {PRESTIGE_LEVEL} atteint : le prestige vous attend.</b> Votre niveau repart à 1, vous gardez pièces, objets, succès et titres, et gagnez l'étoile ★{(p.prestige ?? 0) + 1} visible de tous, {PRESTIGE_COINS} pièces, et la boutique sans niveau requis.</p>
            <button className="btn primary" onClick={async () => { if (await askConfirm('Passer prestige ? Votre niveau repart à 1.', 'Passer prestige')) setErr(await pa.prestige()); }}>Passer prestige ★{(p.prestige ?? 0) + 1}</button>
          </div>
        )}
        {tabs(Object.keys(p.achievements).length, ACHIEVEMENTS.length)}
        {tab === 'stats' && <>
          <div className="pv-money">
            <XpCard level={li.level} xp={p.xp} into={li.into} need={li.need} />
            <div className="pv-wallet" title="Les pièces se gagnent (victoires, défis, succès) et se dépensent à la boutique. Elles ne s'achètent pas.">
              <i aria-hidden /><b>{fmt(p.coins)}</b><small>pièces</small>
            </div>
          </div>
          <p className="k-hint">L'XP fait monter de niveau et ne se dépense pas. Les pièces se gagnent en jouant et se dépensent à la boutique ; elles ne s'achètent pas.</p>
          <div className="pv-stats">
            <div><b>{s.played}</b><small>parties</small></div>
            <div><b>{s.won}</b><small>victoires</small></div>
            <div><b>{s.played ? Math.round((100 * s.won) / s.played) : 0} %</b><small>de victoires</small></div>
            <div><b>{s.total421}</b><small>4-2-1</small></div>
            <div><b>{s.onlineWins}/{s.onlineGames}</b><small>en ligne</small></div>
            <div><b>{s.bestStreak}</b><small>meilleure série</small></div>
            <div><b>{s.brelans}</b><small>brelans</small></div>
            <div><b>{purchases(p)}</b><small>objets achetés</small></div>
          </div>
          <Section title="Titre"><TitlePicker pa={pa} /></Section>
          {(p.showcase?.length || collectionCount(p).owned) ? <Section title="Ma vitrine"><Showcase ids={p.showcase ?? []} count={collectionCount(p)} /></Section> : null}
        </>}
        {tab === 'parties' && (pa.session?.username ? <History username={pa.session.username} /> : <Empty icon="history">Créez un compte pour garder l’historique de vos parties.</Empty>)}
        {tab === 'succes' && <Achievements unlocked={p.achievements} progress={progress} />}
      </>
    );
  }

  return (
    <div className="sheet-back pv-back" role="dialog" aria-modal="true" aria-label="Profil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet profile-sheet">
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head">
          <h2>{other ? 'Profil' : 'Mon profil'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
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
    return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : new Date(t).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
  };
  return (
    <>
      {!games.length ? <Empty icon="history">Aucune partie enregistrée pour l'instant.</Empty> : (
        <ul className="history">
          {games.map((g, i) => (
            <li key={i} className={g.won ? 'won' : ''}>
              <span className="h-ico" aria-hidden>{g.won ? '🏆' : '🍺'}</span>
              <span className="h-main"><b>{g.won ? 'Victoire' : 'Défaite'} {g.mode === 'online' ? 'en ligne' : 'contre l’ordinateur'}</b>
                <small>{g.mode === 'online' ? `${g.humans} joueur${g.humans > 1 ? 's' : ''}${g.bots ? ` + ${g.bots} ordi` : ''}` : `${g.bots} adversaire${g.bots > 1 ? 's' : ''}`} · {Math.max(1, Math.round(g.duration / 60))} min</small></span>
              <small className="h-when">{when(g.endedAt)}</small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
