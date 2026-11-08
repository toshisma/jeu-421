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
    s.watch(code, settings.name || pa.session?.username || 'Spectateur')
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
      <Shell title="Regarder une partie" onBack={onExit}>
        <p className="error">{error}</p>
        <button className="btn primary" onClick={onExit}>Retour</button>
      </Shell>
    );
  }
  if (!session || !controller) return <Shell title="Regarder une partie" onBack={onExit}><p>Connexion à la partie…</p></Shell>;
  const room = session.room;
  // Table fermée, ou retour des joueurs au salon (revanche) : plus rien à regarder pour l'instant.
  if (session.watchClosed || (room && room.status === 'lobby' && !session.game)) {
    return (
      <Shell title="Regarder une partie" onBack={quit}>
        <p>{session.watchClosed ?? 'La partie est terminée : les joueurs sont retournés au salon. Si une revanche est lancée, vous la verrez ici.'}</p>
        <button className="btn primary" onClick={quit}>Quitter</button>
      </Shell>
    );
  }
  return (
    <>
      <GameScreen controller={controller} settings={settings} onSettings={onSettings} onExit={onExit} guestInvite={false}
        appearance={pa.profile.equipped} pa={pa} tableExit={{ label: 'Quitter' }} />
      <Notices session={session} />
      <Chat session={session} pa={pa} />
    </>
  );
}

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 1 ? 'à l’instant' : `depuis ${m} min`; };

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
      <h3>Parties en cours</h3>
      {!games.length && <p className="empty">Aucune partie publique en cours pour l'instant.</p>}
      <ul className="list">
        {games.map((g) => (
          <li key={g.code}>
            <div className="l-main">
              <b>{g.tournament ? `🏆 ${g.tournament}` : g.title}</b>
              <small className="live-players">{g.players.map((p) => `${p.avatar} ${p.name}`).join(' · ')}</small>
              <small>Manche {g.round}, {ago(g.startedAt)}{g.spectators ? ` · 👁 ${g.spectators}` : ''}</small>
            </div>
            <button className="btn small" onClick={() => onWatch(g.code)}>Regarder</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
