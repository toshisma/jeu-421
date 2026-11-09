import { useEffect, useMemo, useState } from 'react';
import { usePresenceLayer } from '../presence';
import { api } from '../account/api';
import type { ProfileApi } from '../account/useProfile';
import { OnlineController, OnlineSession } from '../game/online';
import type { Settings } from '../settings';
import type { LiveEntry } from '../../../shared/protocol';
import { GameScreen } from './GameScreen';
import { Chat } from './Chat';
import { Shell } from './Screens';
import { Notices } from './OnlineFlow';
import { tr, trServer } from '../i18n/lang';

/**
 * Mode spectateur : on regarde une partie en ligne en cours (bac 3D, cartes, scores, tchat),
 * sans aucune commande de jeu. Le bouton Quitter ramène à l'écran précédent.
 */
export function SpectateFlow({ code, settings, onSettings, onExit, pa }: {
  code: string; settings: Settings; onSettings: (s: Settings) => void; onExit: () => void; pa: ProfileApi;
}) {
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);
  usePresenceLayer({ view: 'spectateur', code });
  useEffect(() => {
    const s = new OnlineSession(pa.token);
    let alive = true;
    s.watch(code, settings.name || pa.session?.username || tr('g421.sp.spectator'))
      .then(() => { if (alive) setSession(s); })
      .catch((e) => { if (alive) setError((e as Error).message); s.socket.disconnect(); });
    return () => { alive = false; s.leave(); };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const off = session?.subscribe(() => force((n) => n + 1));
    return () => { off?.(); };
  }, [session]);
  const controller = useMemo(() => (session ? new OnlineController(session) : null), [session]);
  const quit = () => { session?.leave(); onExit(); };

  if (error) {
    return (
      <Shell title={tr('g421.sp.title')} onBack={onExit}>
        <p className="error">{trServer(error)}</p>
        <button className="btn primary" onClick={onExit}>{tr('common.back')}</button>
      </Shell>
    );
  }
  if (!session || !controller) return <Shell title={tr('g421.sp.title')} onBack={onExit}><p>{tr('g421.sp.connecting')}</p></Shell>;
  const room = session.room;
  // Table fermée, ou retour des joueurs au salon (revanche) : plus rien à regarder pour l'instant.
  if (session.watchClosed || (room && room.status === 'lobby' && !session.game)) {
    return (
      <Shell title={tr('g421.sp.title')} onBack={quit}>
        <p>{session.watchClosed ? trServer(session.watchClosed) : tr('g421.sp.ended')}</p>
        <button className="btn primary" onClick={quit}>{tr('g421.quit')}</button>
      </Shell>
    );
  }
  return (
    <>
      <GameScreen controller={controller} settings={settings} onSettings={onSettings} onExit={onExit} guestInvite={false}
        appearance={pa.profile.equipped} pa={pa} tableExit={{ label: tr('g421.quit') }} />
      <Notices session={session} />
      <Chat session={session} pa={pa} />
    </>
  );
}

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 1 ? tr('g421.sp.justNow') : tr('g421.sp.since', { m }); };

/** Liste « Parties en cours » : les parties publiques qu'on peut regarder (rafraîchie toutes les 6 s). */
export function LiveGames({ onWatch }: { onWatch: (code: string) => void }) {
  const [games, setGames] = useState<LiveEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ games: LiveEntry[] }>('/live').then((r) => { if (alive) setGames(r.games); }).catch(() => {});
    load(); const t = setInterval(load, 6000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!games) return null;
  return (
    <section className="live-games">
      <h3>{tr('g421.sp.live')}</h3>
      {!games.length && <p className="empty">{tr('g421.sp.none')}</p>}
      <ul className="list">
        {games.map((g) => (
          <li key={g.code}>
            <div className="l-main">
              <b>{g.tournament ? `🏆 ${trServer(g.tournament)}` : trServer(g.title)}</b>
              <small className="live-players">{g.players.map((p) => `${p.avatar} ${p.name}`).join(' · ')}</small>
              <small>{tr('g421.sp.round', { n: g.round })}, {ago(g.startedAt)}{g.spectators ? ` · 👁 ${g.spectators}` : ''}</small>
            </div>
            <button className="btn small" onClick={() => onWatch(g.code)}>{tr('g421.sp.watch')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
