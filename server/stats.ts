/**
 * Statistiques du jeu.
 *
 * Publiques (GET /api/stats) : uniquement des totaux anonymes, calculés ici à partir de ce qui
 * s'est réellement passé sur le serveur :
 * - « en ligne » : appareils dont l'application est ouverte et reliée au serveur en ce moment
 *   (connexion de présence ; une déconnexion les retire aussitôt que le serveur la constate) ;
 * - parties : enregistrées une seule fois (identifiant unique), et seulement quand elles sont
 *   vraiment terminées (partie en ligne arrivée au bout, ou partie solo déclarée terminée avec le
 *   jeton reçu au début et une durée minimale) ;
 * - jours : fuseau Europe/Brussels.
 *
 * Administration (GET /api/admin/stats) : réservée aux comptes listés dans ADMIN_USERS,
 * vérifiés côté serveur à chaque appel.
 */
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { Namespace, Server } from 'socket.io';
import type { Store, UserRow } from './db';

export interface StatsOptions {
  /** Durée minimale d'une partie solo pour qu'elle compte. */
  minSoloMs?: number;
  /** Pseudos administrateurs (sinon : variable d'environnement ADMIN_USERS, séparés par des virgules). */
  adminUsers?: string[];
  now?: () => number;
}

export interface LiveRooms {
  /** Parties en ligne en cours (au moins un humain connecté). */
  onlineGames: number;
  /** Joueurs humains connectés à une table (salon ou partie). */
  inRooms: number;
}

const TZ = 'Europe/Brussels';
export const brusselsDay = (t: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
/** Minuit (heure de Bruxelles) du jour donné, en millisecondes. */
export function brusselsMidnight(day: string): number {
  const utc = Date.parse(`${day}T00:00:00Z`);
  for (const h of [1, 2, 0, 3]) {
    const t = utc - h * 3600_000;
    if (brusselsDay(t) === day && brusselsDay(t - 1) !== day) return t;
  }
  return utc - 3600_000;
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const cleanDevice = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null);

export function createStats(store: Store, opts: StatsOptions & { userFromToken: (t: unknown) => UserRow | undefined; live: () => LiveRooms; notifyAdmins?: (title: string, body: string) => void }) {
  const now = opts.now ?? Date.now;
  const MIN_SOLO = opts.minSoloMs ?? 20_000;
  const admins = new Set((opts.adminUsers ?? (process.env.ADMIN_USERS ?? '').split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const isAdmin = (u: UserRow | undefined) => !!u && admins.has(u.username.toLowerCase());

  // --- Présence : appareils reliés en ce moment ---------------------------------------------------
  const presence = new Map<string, { device: string; state: 'menu' | 'solo' | 'online'; name?: string; since?: number }>();
  const devices = () => new Set([...presence.values()].map((p) => p.device));
  const soloDevices = () => new Set([...presence.values()].filter((p) => p.state === 'solo').map((p) => p.device));
  let peak: { n: number; at: number } = (() => { try { return JSON.parse(store.getMeta('stats_peak') ?? '') as { n: number; at: number }; } catch { return { n: 0, at: 0 }; } })();
  const checkPeak = () => {
    const n = devices().size;
    if (n > peak.n) { peak = { n, at: now() }; store.setMeta('stats_peak', JSON.stringify(peak)); }
  };
  // Alerte aux administrateurs (notification sur leur téléphone) : quelqu'un arrive ou lance une partie.
  // Au plus une alerte d'arrivée par appareil toutes les 3 h, une de partie par appareil toutes les 30 min,
  // et 30 alertes par heure en tout ; jamais pour les administrateurs eux-mêmes.
  const lastAlert = new Map<string, number>();
  let hourStart = 0, hourCount = 0;
  function alert(key: string, every: number, title: string, body: string) {
    if (!opts.notifyAdmins) return;
    const t = now();
    if (t - (lastAlert.get(key) ?? 0) < every) return;
    if (t - hourStart > 3600_000) { hourStart = t; hourCount = 0; }
    if (++hourCount > 30) return;
    lastAlert.set(key, t);
    if (lastAlert.size > 5000) lastAlert.clear();
    opts.notifyAdmins(title, body);
  }
  function attach(io: Server) {
    const ns: Namespace = io.of('/presence');
    ns.on('connection', (socket) => {
      const device = cleanDevice(socket.handshake.auth?.device) ?? `s-${socket.id}`;
      const user = opts.userFromToken(socket.handshake.auth?.token);
      const who = user?.username ?? 'Un visiteur';
      const quiet = isAdmin(user);
      presence.set(socket.id, { device, state: 'menu', name: user?.username, since: now() });
      checkPeak();
      const others = () => [...presence.values()].filter((x) => x.device !== device).length;
      if (!quiet) alert(`v:${device}`, 3 * 3600_000, `${who} est sur le jeu`, others() ? `${others() + 1} personnes connectées en ce moment.` : 'Personne d’autre en ligne : c’est le moment de le rejoindre !');
      socket.on('presence', (st: unknown) => {
        const p = presence.get(socket.id);
        if (p) p.state = st === 'solo' || st === 'online' ? st : 'menu';
        if (!quiet && (st === 'solo' || st === 'online')) {
          alert(`g:${device}`, 30 * 60_000, st === 'online' ? `${who} joue en ligne` : `${who} lance une partie solo`,
            st === 'online' ? 'Une table en ligne est ouverte : rejoins-la depuis l’accueil.' : 'Contre les habitués du bistrot.');
        }
      });
      socket.on('disconnect', () => { presence.delete(socket.id); });
    });
  }

  // --- Enregistrement des parties terminées -------------------------------------------------------
  function recordOnline(g: { startedAt: number; humans: { key: string; userId: string | null; won: boolean }[]; bots: number }) {
    if (!g.humans.length) return;
    const t = now();
    store.logGame({ id: `o:${randomUUID()}`, mode: 'online', humans: g.humans.length, bots: g.bots, startedAt: g.startedAt, endedAt: t, day: brusselsDay(t), players: g.humans });
  }
  /** Partie solo d'un compte (jeton de partie vérifié par les comptes). */
  function recordSolo(g: { id: string; userId: string; startedAt: number; opponents: number; won: boolean }) {
    const t = now();
    store.logGame({ id: `s:${g.id}`, mode: 'solo', humans: 1, bots: g.opponents, startedAt: g.startedAt, endedAt: t, day: brusselsDay(t),
      players: [{ key: `u:${g.userId}`, userId: g.userId, won: g.won }] });
  }

  // --- Calcul des statistiques publiques (mis en cache 5 secondes) --------------------------------
  let cache: { at: number; data: object } | null = null;
  function publicStats() {
    const t = now();
    const live = opts.live();
    const liveData = {
      online: devices().size,
      gamesInProgress: live.onlineGames + soloDevices().size,
      inRooms: live.inRooms,
    };
    if (!cache || t - cache.at > 5000) {
      const day = brusselsDay(t);
      const d = store.statsDay(day);
      const totals = store.statsTotals();
      const from = addDays(day, -29);
      const rows = new Map(store.statsDays(from, day).map((r) => [r.day, r]));
      const days = Array.from({ length: 30 }, (_, i) => {
        const k = addDays(from, i);
        const r = rows.get(k);
        return { day: k, games: r?.games ?? 0, players: r?.players ?? 0 };
      });
      cache = {
        at: t,
        data: {
          today: { day, games: d.games, players: d.players, wins: d.wins, signups: store.usersCreatedBetween(brusselsMidnight(day), brusselsMidnight(addDays(day, 1))) },
          totals: { users: totals.users, games: totals.games, multiplayer: totals.multi, vsAi: totals.vsAi, playSeconds: totals.seconds, since: totals.since },
          days,
        },
      };
    }
    return { ok: true, live: liveData, peak, ...cache.data, generatedAt: t };
  }

  // --- Routes ------------------------------------------------------------------------------------
  const router = express.Router();
  // Lecteur JSON limité à nos propres routes : ce routeur est monté sur /api, devant celui des
  // comptes, et ne doit pas imposer sa limite aux autres requêtes (photos, inscription…).
  const json = express.json({ limit: '4kb' });
  router.get('/stats', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(publicStats());
  });

  // Parties solo des invités : un jeton au début, la fin n'est acceptée qu'une fois et après
  // une durée minimale. Limites par adresse IP contre les envois en rafale.
  const guestSolo = new Map<string, { startedAt: number; ip: string }>();
  const perIpDay = new Map<string, number>();
  router.post('/stats/solo/start', json, (req, res) => {
    const ip = req.ip ?? '?';
    const t = now();
    for (const [k, v] of guestSolo) if (t - v.startedAt > 6 * 3600_000) guestSolo.delete(k);
    if ([...guestSolo.values()].filter((v) => v.ip === ip).length >= 20) return res.status(429).json({ ok: false, error: 'Trop de parties ouvertes.' });
    const token = randomUUID();
    guestSolo.set(token, { startedAt: t, ip });
    res.json({ ok: true, token });
  });
  router.post('/stats/solo/end', json, (req, res) => {
    const b = req.body ?? {};
    const g = typeof b.token === 'string' ? guestSolo.get(b.token) : undefined;
    if (!g) return res.status(400).json({ ok: false, error: 'Partie inconnue.' });
    const t = now();
    if (t - g.startedAt < MIN_SOLO) return res.status(400).json({ ok: false, error: 'Partie trop courte.' });
    guestSolo.delete(b.token);
    const key = `${brusselsDay(t)}|${g.ip}`;
    const n = (perIpDay.get(key) ?? 0) + 1;
    perIpDay.set(key, n);
    if (perIpDay.size > 5000) perIpDay.clear();
    if (n > 150) return res.status(429).json({ ok: false, error: 'Plafond atteint.' });
    const device = cleanDevice(b.device);
    const opponents = Math.min(5, Math.max(1, Math.floor(Number(b.opponents) || 1)));
    store.logGame({ id: `g:${b.token}`, mode: 'solo', humans: 1, bots: opponents, startedAt: g.startedAt, endedAt: t, day: brusselsDay(t),
      players: [{ key: device ? `d:${device}` : `g:${b.token}`, userId: null, won: !!b.won }] });
    res.json({ ok: true });
  });

  // Administration : contrôlée à chaque appel, côté serveur.
  const adminOf = (req: Request) => {
    const h = req.headers.authorization ?? '';
    const u = opts.userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    return isAdmin(u) ? u : undefined;
  };
  router.get('/admin/whoami', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, admin: !!adminOf(req) }); });
  router.get('/admin/stats', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!adminOf(req)) return res.status(403).json({ ok: false, error: 'Accès réservé à l’administration.' });
    const t = now();
    const day = brusselsDay(t);
    const since7 = addDays(day, -6);
    const since30 = addDays(day, -29);
    // Joueurs connectés en ce moment (un par appareil), comptes nommés et visiteurs.
    const byDevice = new Map<string, { name: string | null; state: string; since: number }>();
    for (const p of presence.values()) {
      const cur = byDevice.get(p.device);
      const rank = (st: string) => (st === 'online' ? 2 : st === 'solo' ? 1 : 0);
      if (!cur || rank(p.state) > rank(cur.state) || (!cur.name && p.name)) byDevice.set(p.device, { name: p.name ?? cur?.name ?? null, state: rank(p.state) >= rank(cur?.state ?? 'menu') ? p.state : cur!.state, since: Math.min(p.since ?? t, cur?.since ?? t) });
    }
    const connected = [...byDevice.values()].sort((a, b) => Number(!a.name) - Number(!b.name) || a.since - b.since);
    res.json({
      connected,
      ...publicStats(),
      presence: { menu: [...presence.values()].filter((p) => p.state === 'menu').length, solo: soloDevices().size, online: [...presence.values()].filter((p) => p.state === 'online').length },
      signups: store.usersCreatedSince(brusselsMidnight(since30)).map((u) => ({ username: u.username, at: u.created_at })),
      active: { today: store.activeAccounts(day), week: store.activeAccounts(since7), month: store.activeAccounts(since30) },
      mostActiveWeek: store.mostActive(since7, 20),
      mostActiveAll: store.mostActive('0000-00-00', 20),
      longest: store.longestGames(10).map((g) => ({ mode: g.mode, humans: g.humans, bots: g.bots, seconds: g.duration_s, at: g.ended_at, accounts: g.accounts })),
    });
  });

  return { router, attach, recordOnline, recordSolo, isAdmin };
}
