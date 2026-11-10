/**
 * Les bistrots entre amis (écran Amis) : mes bistrots, invitations, ouverture d'un bistrot, et l'écran
 * d'un bistrot (classement de la semaine, mur d'annonces avec réactions, invitations, outils du patron).
 * Règles et barème : shared/bistrots.ts ; tout est calculé par le serveur (server/bistrots.ts).
 */
import { useEffect, useState } from 'react';
import { loc, tr, useLang } from '../i18n/lang';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { BISTROT_NAME_MAX, BISTROT_NAME_MIN, BISTROT_REACTIONS, CHAMPION_COINS, CHAMPION_MIN_ACTIVE, PAIR_DAILY_CAP, type WallKind } from '../../../shared/bistrots';
import { bistrotLink, clearPendingBistrot, pendingBistrot } from '../bistrots';
import { BigAction, Empty, Initial, Section, Sheet, Shell, Tabs, useToast } from './kit';
import { Icon } from './Icon';
import { ProfileView } from './ProfileView';
import { askConfirm } from './confirm';

interface Summary { id: string; name: string; members: number; owner: string; rank: number; points: number; leader: string | null }
interface Invite { id: string; name: string; from: string; members: number }
interface Preview { id: string; name: string; owner: string; members: number; max: number; member: boolean; staff: boolean }
interface Row { rank: number; username: string; points: number; games: number; wins: number; owner: boolean; me: boolean; champion: boolean }
interface WallItem { id: number; kind: WallKind; name: string; data: { game?: string; points?: number; coins?: number }; at: number; reactions: Record<string, number>; mine: string | null }
interface Full {
  id: string; name: string; code: string; owner: string; isOwner: boolean; week: string; endsAt: string; max: number;
  standings: Row[]; champions: { week: string; name: string; points: number }[]; wall: WallItem[]; staff: boolean;
}

const plural = (n: number, key: 'club.members' | 'club.invitedBy' | 'club.games', vars: Record<string, string | number>) =>
  tr(n > 1 ? (`${key}.p` as const) : key, { n, ...vars });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
const gameName = (g?: string) => (g === 'courtisan' ? tr('club.g.courtisan') : g === 'cf' ? tr('club.g.cf') : g === 'duel' ? tr('club.g.duel') : tr('club.g.421'));

/** Section de l'écran Amis : mes bistrots, invitations, lien reçu, ouvrir un bistrot. */
export function BistrotsSection({ pa, onOpen }: { pa: ProfileApi; onOpen: (id: string) => void }) {
  useLang();
  const [mine, setMine] = useState<Summary[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [max, setMax] = useState(3);
  const [maxMembers, setMaxMembers] = useState(30);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const load = () => {
    if (!pa.token) return;
    api<{ mine: Summary[]; invites: Invite[]; max: number; maxMembers: number }>('/bistrots', { token: pa.token })
      .then((r) => { setMine(r.mine); setInvites(r.invites); setMax(r.max); setMaxMembers(r.maxMembers); }).catch(() => {});
    const code = pendingBistrot();
    if (code) api<{ bistrot: Preview }>(`/bistrots/apercu/${code}`, { token: pa.token }).then((r) => setPreview(r.bistrot)).catch(() => { clearPendingBistrot(); setPreview(null); });
  };
  useEffect(() => { load(); }, [pa.token]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (f: () => Promise<{ bistrot?: { id: string; name: string } }>, ok?: (b?: { id: string; name: string }) => string) => {
    if (busy) return;
    setBusy(true);
    try { const r = await f(); if (ok) showToast(ok(r.bistrot)); load(); if (r.bistrot) onOpen(r.bistrot.id); return true; }
    catch (x) { showToast((x as Error).message, 'err'); return false; }
    finally { setBusy(false); }
  };
  const joinCode = (code: string) => run(async () => { const r = await api<{ bistrot: { id: string; name: string } }>('/bistrots/rejoindre', { token: pa.token!, body: { code } }); clearPendingBistrot(); setPreview(null); return r; },
    (b) => tr('club.welcome', { name: b?.name ?? '' }));
  const joinInvite = (id: string) => run(() => api<{ bistrot: { id: string; name: string } }>('/bistrots/rejoindre', { token: pa.token!, body: { id } }), (b) => tr('club.welcome', { name: b?.name ?? '' }));
  const decline = (id: string) => { setInvites((l) => l.filter((x) => x.id !== id)); void api(`/bistrots/invitations/${id}/refuser`, { token: pa.token!, body: {} }).catch(() => {}); };
  const create = () => run(async () => { const r = await api<{ bistrot: { id: string; name: string } }>('/bistrots', { token: pa.token!, body: { name } }); setCreating(false); setName(''); return r; }, () => tr('club.created'));
  const n = name.trim().length;
  const full = (mine?.length ?? 0) >= max;

  return (
    <Section title={tr('club.section')} count={mine?.length || undefined} className="bistrots">
      {preview && !preview.member && (
        <div className="bis-card bis-link">
          <span className="bis-ic" aria-hidden>🍺</span>
          <span className="bis-text"><b>{tr('club.linkFrom', { owner: preview.owner, name: preview.name })}</b><small>{plural(preview.members, 'club.members', {})}</small></span>
          <span className="bis-actions">
            <button className="btn small primary" disabled={busy || preview.members >= preview.max} onClick={() => void joinCode(pendingBistrot() ?? '')}>{preview.members >= preview.max ? tr('club.full') : tr('club.join')}</button>
            <button className="btn small ghost" onClick={() => { clearPendingBistrot(); setPreview(null); }}>{tr('club.decline')}</button>
            {/* Modération : un lien signalé s'ouvre ici, le bistrot peut être fermé sans y entrer. */}
            {preview.staff && <button className="btn small ghost danger" onClick={async () => {
              if (!(await askConfirm(tr('club.modCloseQ'), tr('club.modClose')))) return;
              try { await api(`/bistrots/${preview.id}/fermer-moderation`, { token: pa.token!, body: {} }); clearPendingBistrot(); setPreview(null); showToast(tr('club.closed')); }
              catch (x) { showToast((x as Error).message, 'err'); }
            }}>{tr('club.modClose')}</button>}
          </span>
        </div>
      )}
      {invites.map((i) => (
        <div key={i.id} className="bis-card bis-link">
          <span className="bis-ic" aria-hidden>✉️</span>
          <span className="bis-text"><b>{i.name}</b><small>{plural(i.members, 'club.invitedBy', { from: i.from })}</small></span>
          <span className="bis-actions">
            <button className="btn small primary" disabled={busy} onClick={() => void joinInvite(i.id)}>{tr('club.join')}</button>
            <button className="btn small ghost" onClick={() => decline(i.id)}>{tr('club.decline')}</button>
          </span>
        </div>
      ))}
      {mine && mine.length === 0 && invites.length === 0 && !preview && <p className="k-hint bis-pitch">{tr('club.none')}</p>}
      {mine && mine.length > 0 && (
        <ul className="bis-list">
          {mine.map((b) => (
            <li key={b.id}>
              <button className="bis-row" onClick={() => onOpen(b.id)}>
                <span className="bis-ic" aria-hidden>🍺</span>
                <span className="bis-text"><b>{b.name}</b><small>{plural(b.members, 'club.members', {})}{b.leader ? ` · 👑 ${b.leader}` : ''}</small></span>
                <span className="bis-rank">{tr('club.rankLine', { rank: b.rank, n: b.members, points: b.points })}</span>
                <Icon name="back" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mine && (full ? <p className="k-hint">{tr('club.limit', { n: mine.length, max })}</p>
        : <button className="btn bis-open" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> {tr('club.open')} <small>{tr('club.openSub', { max: maxMembers })}</small></button>)}
      {creating && (
        <Sheet title={tr('club.open')} onClose={() => setCreating(false)}>
          <form className="k-form" onSubmit={(e) => { e.preventDefault(); if (n >= BISTROT_NAME_MIN) void create(); }}>
            <p className="k-hint">{tr('club.pitch')}</p>
            <label className="k-field"><span className="k-label">{tr('club.nameLabel')}</span>
              <input className="k-input" value={name} maxLength={BISTROT_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={tr('club.namePh')} autoFocus /></label>
            <p className="k-hint">{tr('club.nameHint', { min: BISTROT_NAME_MIN, max: BISTROT_NAME_MAX })}</p>
            <BigAction type="submit" icon="plus" tone="gold" disabled={busy || n < BISTROT_NAME_MIN} label={tr('club.create')} />
          </form>
        </Sheet>
      )}
      {toast}
    </Section>
  );
}

/** Invité arrivé par un lien de bistrot : il voit l'invitation et le bouton pour créer son compte. */
export function BistrotGuestInvite({ onAccount }: { onAccount: () => void }) {
  useLang();
  const [p, setP] = useState<Preview | null>(null);
  useEffect(() => {
    const code = pendingBistrot();
    if (code) api<{ bistrot: Preview }>(`/bistrots/apercu/${code}`).then((r) => setP(r.bistrot)).catch(() => {});
  }, []);
  if (!p) return null;
  return (
    <div className="bis-card bis-guest">
      <span className="bis-ic" aria-hidden>🍺</span>
      <span className="bis-text"><b>{tr('club.guestInvite', { name: p.name })}</b><small>{plural(p.members, 'club.members', {})}</small></span>
      <button className="btn small primary" onClick={onAccount}>{tr('club.guestCta')}</button>
    </div>
  );
}

/** Texte d'une annonce du mur, dans la langue du joueur. */
function wallText(w: WallItem): string {
  const v = { name: w.name, points: w.data.points ?? 0, game: gameName(w.data.game) };
  if (w.kind === 'champion') return tr('club.w.champion', v) + (w.data.coins ? tr('club.w.championCoins', { coins: w.data.coins }) : '');
  const key = `club.w.${w.kind}` as const;
  return tr(key as Parameters<typeof tr>[0], v);
}
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? tr('app.il_y_a_min', { v: Math.max(1, m) }) : m < 1440 ? tr('app.il_y_a_h', { v: Math.round(m / 60) }) : tr('app.il_y_a_j', { v: Math.round(m / 1440) });
};

/** Un bistrot : classement de la semaine, mur, invitations, outils du patron. */
export function BistrotScreen({ pa, id, onBack }: { pa: ProfileApi; id: string; onBack: () => void }) {
  useLang();
  const [b, setB] = useState<Full | null>(null);
  const [tab, setTab] = useState<'semaine' | 'mur' | 'inviter'>('semaine');
  const [friends, setFriends] = useState<string[] | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const token = pa.token!;
  const load = () => api<{ bistrot: Full }>(`/bistrots/${id}`, { token }).then((r) => setB(r.bistrot)).catch((x) => { showToast((x as Error).message, 'err'); setTimeout(onBack, 1200); });
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'inviter' || friends) return;
    api<{ friends: { username: string; me?: boolean }[] }>('/friends', { token }).then((r) => setFriends(r.friends.filter((f) => !f.me).map((f) => f.username))).catch(() => setFriends([]));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (path: string, body: object, ok?: string, after?: () => void) => {
    try {
      const r = await api<{ bistrot?: Full }>(`/bistrots/${id}/${path}`, { token, body });
      if (r.bistrot) setB(r.bistrot);
      if (ok) showToast(ok);
      after?.();
      return true;
    } catch (x) { showToast((x as Error).message, 'err'); return false; }
  };
  if (!b) return <Shell title={tr('club.section')} onBack={onBack} icon="cheers"><p className="k-hint">{tr('app.chargement')}</p>{toast}</Shell>;

  const link = bistrotLink(b.code);
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    if (canShare) { try { await navigator.share({ title: tr('club.shareTitle', { name: b.name }), text: tr('club.shareText', { name: b.name }), url: link }); } catch { /* annulé */ } return; }
    try { await navigator.clipboard.writeText(`${tr('club.shareText', { name: b.name })} ${link}`); showToast(tr('club.copied')); } catch { showToast(link); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); showToast(tr('club.copied')); } catch { showToast(link); } };
  const members = new Set(b.standings.map((r) => r.username));

  return (
    <Shell title={b.name} onBack={onBack} icon="cheers" wide sub={tr('club.sub', { n: b.standings.length, max: b.max, owner: b.owner })}>
      <Tabs label={b.name} value={tab} onChange={setTab}
        options={[{ v: 'semaine', label: tr('club.tabRank'), icon: 'trophy' }, { v: 'mur', label: tr('club.tabWall'), icon: 'cheers' }, { v: 'inviter', label: tr('club.tabInvite'), icon: 'share' }]} />

      {tab === 'semaine' && <>
        <Section title={tr('club.weekTitle')} aside={<small className="bis-ends">{tr('club.weekEnds')}</small>}>
          <ol className="board bis-board">
            {b.standings.map((r) => (
              <li key={r.username} className={`${r.me ? 'me ' : ''}clickable`} onClick={() => (r.me ? null : setSel(r))}>
                <span className="b-rank">{r.rank}</span>
                <span className="b-name">{r.champion && <span className="bis-crown" title={tr('club.champBadge')} aria-label={tr('club.champBadge')}>👑 </span>}{r.username}
                  <small>{plural(r.games, 'club.games', { w: r.wins })}{r.owner ? ` · ${tr('club.owner')}` : ''}{r.me ? ` · ${tr('club.you')}` : ''}</small></span>
                <span className="b-wins"><b>{r.points}</b> <small>pts</small></span>
              </li>
            ))}
          </ol>
        </Section>
        <p className="k-hint">{tr('club.scoring')} {tr('club.capNote', { cap: PAIR_DAILY_CAP })}</p>
        <p className="k-hint">{tr('club.monday')} {CHAMPION_COINS > 0 && tr('club.mondayCoins', { coins: CHAMPION_COINS, n: CHAMPION_MIN_ACTIVE })}</p>
        <Section title={tr('club.champions')} count={b.champions.length || undefined}>
          {b.champions.length === 0 ? <p className="k-hint">{tr('club.noChampion')}</p> : (
            <ul className="history bis-champs">
              {b.champions.map((c) => <li key={c.week}><span aria-hidden>👑</span><span className="h-main"><b>{c.name}</b><small>{tr('club.champWeek', { date: shortDate(c.week) })}</small></span><small>{tr('club.pts', { n: c.points })}</small></li>)}
            </ul>
          )}
        </Section>
      </>}

      {tab === 'mur' && <>
        {b.wall.length === 0 ? <Empty icon="cheers">{tr('club.wallEmpty')}</Empty> : (
          <ul className="bis-wall">
            {b.wall.map((w) => (
              <li key={w.id} className={`bis-w ${w.kind}`}>
                <p>{wallText(w)} <small>{ago(w.at)}</small></p>
                <span className="bis-reacts" role="group" aria-label={tr('club.react')}>
                  {BISTROT_REACTIONS.map((e) => (
                    <button key={e} className={`bis-react${w.mine === e ? ' on' : ''}${w.reactions[e] ? ' has' : ''}`} aria-pressed={w.mine === e}
                      onClick={() => void act('reaction', { wall: w.id, emoji: e })}>{e}{w.reactions[e] ? <i>{w.reactions[e]}</i> : null}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="k-hint">{tr('club.wallNote')}</p>
      </>}

      {tab === 'inviter' && <>
        <div className="bis-share">
          <button className="btn primary" onClick={() => void share()}><Icon name="share" size={18} /> {tr('club.share')}</button>
          <button className="btn ghost" onClick={() => void copy()}><Icon name="copy" size={18} /> {tr('club.copy')}</button>
          <small className="bis-code">{tr('club.code', { code: b.code })}</small>
        </div>
        <p className="k-hint">{tr('club.inviteHelp')}</p>
        <Section title={tr('club.friends')} count={friends?.length || undefined}>
          {friends && friends.length === 0 && <p className="k-hint">{tr('club.noFriends')}</p>}
          <ul className="friends-list">
            {friends?.map((f) => (
              <li key={f} className="on">
                <span className="fr-main"><Initial name={f} /><span className="fr-name"><b>{f}</b></span></span>
                {members.has(f) ? <small className="bis-here">{tr('club.here')}</small>
                  : <button className="btn small primary" onClick={() => void act('inviter', { username: f }, tr('club.invited', { name: f }))}>{tr('club.invite')}</button>}
              </li>
            ))}
          </ul>
        </Section>
      </>}

      <div className="bis-tools">
        {b.isOwner && <>
          <small className="k-hint">{tr('club.ownerTools')}</small>
          <button className="btn small ghost" onClick={() => void act('nouveau-lien', {}, tr('club.newLinkDone'))}>{tr('club.newLink')}</button>
          <button className="btn small ghost danger" onClick={async () => { if (await askConfirm(tr('club.closeQ', { name: b.name }), tr('club.close'))) void act('fermer', {}, tr('club.closed'), onBack); }}>{tr('club.close')}</button>
        </>}
        <button className="btn small ghost danger" onClick={async () => { if (await askConfirm(tr('club.leaveQ', { name: b.name }), tr('club.leave'))) void act('quitter', {}, tr('club.left'), onBack); }}>{tr('club.leave')}</button>
        {!b.isOwner && <button className="btn small ghost" onClick={() => void act('signaler', {}, tr('club.reported'))}><Icon name="flag" size={16} /> {tr('club.report')}</button>}
        {b.staff && <button className="btn small ghost danger" onClick={async () => { if (await askConfirm(tr('club.modCloseQ'), tr('club.modClose'))) void act('fermer-moderation', {}, tr('club.closed'), onBack); }}>{tr('club.modClose')}</button>}
      </div>

      {sel && (
        <Sheet title={sel.username} onClose={() => setSel(null)}>
          <div className="bis-sel">
            <button className="btn" onClick={() => { setProfile(sel.username); setSel(null); }}><Icon name="user" size={18} /> {tr('club.profile')}</button>
            {b.isOwner && <>
              <button className="btn" onClick={async () => { const u = sel.username; setSel(null); if (await askConfirm(tr('club.transferQ', { name: u }), tr('club.transfer'))) void act('transmettre', { username: u }, tr('club.transferred', { name: u })); }}>{tr('club.transfer')}</button>
              <button className="btn danger" onClick={async () => { const u = sel.username; setSel(null); if (await askConfirm(tr('club.kickQ', { name: u }), tr('club.kick'))) void act('retirer', { username: u }, tr('club.kicked', { name: u })); }}>{tr('club.kick')}</button>
            </>}
          </div>
        </Sheet>
      )}
      {profile && <ProfileView pa={pa} username={profile} onClose={() => setProfile(null)} />}
      {toast}
    </Shell>
  );
}

/** Accueil : mention discrète du bistrot (ou d'une invitation), qui ouvre l'écran Amis. */
export function BistrotChip({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  useLang();
  const [s, setS] = useState<{ first: Summary | null; invites: number } | null>(null);
  useEffect(() => {
    if (!pa.token) { setS(null); return; }
    const load = () => { if (document.visibilityState === 'visible') api<{ first: Summary | null; invites: number }>('/bistrots-apercu', { token: pa.token! }).then(setS).catch(() => {}); };
    load(); const t = setInterval(load, 120_000); return () => clearInterval(t);
  }, [pa.token]);
  // Lien d'invitation reçu avant de créer son compte : rappelé ici tant qu'il n'est pas utilisé.
  if (!s || (!s.first && !s.invites && !pendingBistrot())) return null;
  if (!s.first) return <button className="mm-bistrot invite" onClick={onOpen}><span aria-hidden>✉️</span>{tr('club.homeInvite')}</button>;
  return (
    <button className="mm-bistrot" onClick={onOpen} aria-label={tr('club.homeAria', { name: s.first.name })}>
      <span aria-hidden>🍺</span><b>{s.first.name}</b><em>#{s.first.rank}</em>
    </button>
  );
}
