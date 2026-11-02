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
    <div className="pv-card xp">
      <div className="pv-card-head"><span>Expérience</span><b>Niveau {level}</b></div>
      <div className="xpbar wide"><i style={{ width: `${(100 * into) / need}%` }} /></div>
      <small>{fmt(xp)} XP au total. Encore {fmt(need - into)} XP pour le niveau {level + 1}.</small>
      <small className="muted">L'XP se gagne en jouant et fait monter de niveau. Elle ne se dépense pas.</small>
    </div>
  );
}

function Achievements({ unlocked, progress }: { unlocked: Record<string, number>; progress?: (id: string) => number }) {
  const n = Object.keys(unlocked).length;
  return (
    <section>
      <h3>Succès <span className="muted small">{n}/{ACHIEVEMENTS.length}</span></h3>
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

export function ProfileView({ pa, username, displayName, avatar, onClose }: {
  pa: ProfileApi; username?: string | null; displayName?: string; avatar?: string; onClose: () => void;
}) {
  const other = !!username && username !== pa.session?.username;
  const [pub, setPub] = useState<PublicPlayer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!other) return;
    api<{ player: PublicPlayer }>(`/players/${encodeURIComponent(username!)}`, { token: pa.token }).then((r) => setPub(r.player)).catch((e) => setErr(e.message));
  }, [other, username]);

  let body: React.ReactNode;
  if (other) {
    body = !pub ? <p className="muted">{err ?? 'Chargement…'}</p> : (
      <>
        <div className="pv-head">
          <Avatar photo={pa.isBlocked(pub.username) ? null : pub.photo} emoji="🎲" size={96} accessory={pub.accessory || undefined} />
          <div>
            <div className="pv-name">{pub.username}</div>
            {pub.title && <div className="pv-title">{pub.title}</div>}
            {pub.league && <div className="muted small">Ligue {pub.league}</div>}
            {pub.rivalry && <div className="pv-rival">{pub.rivalry.mine > pub.rivalry.theirs ? `Vous menez ${pub.rivalry.mine} à ${pub.rivalry.theirs}`
              : pub.rivalry.mine < pub.rivalry.theirs ? `${pub.username} mène ${pub.rivalry.theirs} à ${pub.rivalry.mine}` : `Égalité ${pub.rivalry.mine} partout`} contre ce joueur</div>}
            <div className="muted small">Joueur depuis le {date(pub.createdAt)}{pub.rank ? `, ${pub.rank}e au classement` : ''}</div>
          </div>
        </div>
        <XpCard level={pub.level} xp={pub.xp} into={pub.into} need={pub.need} />
        <div className="pv-stats">
          <div><b>{pub.onlineWins}</b><small>victoires en ligne</small></div>
          <div><b>{pub.onlineGames}</b><small>parties en ligne</small></div>
          <div><b>{pub.stats.total421}</b><small>4-2-1</small></div>
          <div><b>{pub.stats.bestStreak}</b><small>meilleure série</small></div>
        </div>
        {(pub.showcase?.length || pub.collection?.owned) ? <><h3>Vitrine</h3><Showcase ids={pub.showcase ?? []} count={pub.collection} /></> : null}
        <Achievements unlocked={pub.achievements} />
        {pa.isAccount && (
          <div className="row">
            <button className="btn small" onClick={async () => {
              try {
                const r = await api<{ result: string }>('/friends', { body: { username: pub.username }, token: pa.token });
                setMsg(r.result === 'accepted' ? 'Vous êtes maintenant amis.' : 'Demande d’ami envoyée.');
              }
              catch (e) { setMsg((e as Error).message); }
            }}><Icon name="plus" size={18} /> Ajouter en ami</button>
            <button className="btn ghost small danger" onClick={async () => {
              const on = !pa.isBlocked(pub.username);
              if (on && !(await askConfirm(`Bloquer ${pub.username} ? Sa photo et ses réactions seront masquées, et il ne pourra plus s'asseoir à vos tables.`, 'Bloquer'))) return;
              const e = await pa.block(pub.username, on);
              setMsg(e ?? (on ? `${pub.username} est bloqué.` : `${pub.username} est débloqué.`));
            }}>{pa.isBlocked(pub.username) ? 'Débloquer' : 'Bloquer ce joueur'}</button>
            {pub.photo && (
              <button className="btn ghost small" onClick={async () => {
                if (!(await askConfirm('Signaler la photo de ce joueur comme inappropriée ?', 'Signaler'))) return;
                try { await api('/report', { body: { username: pub.username, reason: 'photo' }, token: pa.token }); setMsg('Merci, la photo a été signalée.'); }
                catch (e) { setMsg((e as Error).message); }
              }}><Icon name="flag" size={18} /> Signaler la photo</button>
            )}
          </div>
        )}
        {msg && <p className="ok small">{msg}</p>}
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
        <div className="pv-head">
          <Avatar photo={pa.photo} emoji={avatar} size={96} accessory={accessoryEmoji(p.equipped.accessoire)} />
          <div>
            <div className="pv-name">{name}</div>
            {titleLabel(p.title) && <div className="pv-title">{titleLabel(p.title)}</div>}
            <div className="muted small">{pa.isAccount ? 'Compte joueur' : 'Invité — progression sur cet appareil'}</div>
            <div className="row left">
              <button className="btn small" onClick={() => file.current?.click()}><Icon name="camera" size={18} /> {pa.photo ? 'Changer la photo' : 'Ajouter une photo'}</button>
              {pa.photo && <button className="btn ghost small" onClick={() => void pa.removePhoto()}>Retirer</button>}
            </div>
            <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setErr(await pa.setPhoto(f));
            }} />
            {err && <p className="error small">{err}</p>}
            {pa.isAccount && <p className="muted small">Votre photo est visible par les autres joueurs.</p>}
          </div>
        </div>
        <TitlePicker pa={pa} />
        {(p.showcase?.length || collectionCount(p).owned) ? <><h3>Ma vitrine</h3><Showcase ids={p.showcase ?? []} count={collectionCount(p)} /></> : null}
        {(p.prestige ?? 0) > 0 && <p className="pv-title">Prestige {p.prestige} <span className="prestige">★{p.prestige}</span></p>}
        {li.level >= PRESTIGE_LEVEL && (
          <div className="prestige-box">
            <p><b>Niveau {PRESTIGE_LEVEL} atteint : le prestige vous attend.</b> Votre niveau repart à 1, vous gardez pièces, objets, succès et titres, et gagnez l'étoile ★{(p.prestige ?? 0) + 1} visible de tous, {PRESTIGE_COINS} pièces, et la boutique sans niveau requis.</p>
            <button className="btn primary" onClick={async () => { if (await askConfirm('Passer prestige ? Votre niveau repart à 1.', 'Passer prestige')) setErr(await pa.prestige()); }}>Passer prestige ★{(p.prestige ?? 0) + 1}</button>
          </div>
        )}
        <div className="pv-money">
          <XpCard level={li.level} xp={p.xp} into={li.into} need={li.need} />
          <div className="pv-card coins">
            <div className="pv-card-head"><span>Argent du jeu</span></div>
            <div className="pv-coins">{fmt(p.coins)}<small> pièces</small></div>
            <small className="muted">Les pièces se gagnent (victoires, défis, succès) et se dépensent à la boutique. Elles ne s'achètent pas.</small>
          </div>
        </div>
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
        <Achievements unlocked={p.achievements} progress={progress} />
      </>
    );
  }

  return (
    <div className="modal" role="dialog" aria-label="Profil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card profile-card">
        <header className="panel-head">
          <h2>{other ? 'Profil' : 'Mon profil'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </header>
        <div className="modal-body">{body}</div>
      </div>
    </div>
  );
}
