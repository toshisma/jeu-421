/**
 * Base de données des comptes (SQLite intégré à Node : aucun service à installer).
 * Le fichier est créé au premier lancement ; sur un hébergeur, placez-le sur un disque persistant
 * (variable DATABASE_PATH). ':memory:' sert aux tests.
 */
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import { createRequire } from 'node:module';
// Chargé via require : certains outils (Vite/Vitest) ne reconnaissent pas encore « node:sqlite ».
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = DatabaseSyncT;
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { newProfile, sanitizeProfile, type Profile } from '../shared/progress/profile';

export interface UserRow {
  id: string;
  username: string;
  pass_hash: string;
  recovery_hash: string;
  created_at: number;
  profile: string;
  online_games: number;
  online_wins: number;
  solo_day: string;
  solo_count: number;
  photo_version: number;
  photo_hidden: number;
  league: number;
  referred_by: string | null;
  referral_paid: number;
}

export interface PublicUser { id: string; username: string; onlineGames: number; onlineWins: number; createdAt: number; photo: string | null }

/** Adresse de la photo (le numéro de version évite les caches périmés). */
export const photoUrl = (u: UserRow) => (u.photo_version > 0 && !u.photo_hidden ? `/api/photos/${u.id}?v=${u.photo_version}` : null);

export function toPublic(u: UserRow): PublicUser {
  return { id: u.id, username: u.username, onlineGames: u.online_games, onlineWins: u.online_wins, createdAt: u.created_at, photo: photoUrl(u) };
}

export interface DuelRow {
  id: string; from_id: string; to_id: string; stake: number; created_at: number;
  from_points: number | null; from_throws: number | null; to_points: number | null; to_throws: number | null;
  status: 'ouvert' | 'fini' | 'refuse' | 'expire'; winner_id: string | null; from_seen: number; to_seen: number; ended_at: number | null;
}

export interface PmRow { id: number; from_id: string; to_id: string; text: string; created_at: number; read_at: number | null }

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_hash TEXT NOT NULL,
        recovery_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        profile TEXT NOT NULL,
        online_games INTEGER NOT NULL DEFAULT 0,
        online_wins INTEGER NOT NULL DEFAULT 0,
        solo_day TEXT NOT NULL DEFAULT '',
        solo_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS friends (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wins ON users(online_wins DESC, online_games ASC);
      CREATE TABLE IF NOT EXISTS photos (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        data BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reports (
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (reporter_id, target_id)
      );
      CREATE TABLE IF NOT EXISTS blocks (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, blocked_id)
      );
      -- Mises engagées dans une partie ou un tournoi en cours : remboursées si le serveur redémarre.
      CREATE TABLE IF NOT EXISTS escrow (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        context TEXT NOT NULL,
        amount INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_escrow_ctx ON escrow(context);
      -- Défi du jour : un seul essai classé par joueur et par jour.
      CREATE TABLE IF NOT EXISTS challenge (
        day TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER NOT NULL,
        throws INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (day, user_id)
      );
      -- Ligues hebdomadaires : XP gagnée dans la semaine, par groupe de 20 joueurs d'une même ligue.
      CREATE TABLE IF NOT EXISTS league_xp (
        week TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        league INTEGER NOT NULL,
        grp INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        PRIMARY KEY (week, user_id)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      -- Rivalités : bilan des parties en ligne entre deux comptes (a < b).
      CREATE TABLE IF NOT EXISTS h2h (
        a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        a_wins INTEGER NOT NULL DEFAULT 0,
        b_wins INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (a, b)
      );
      -- Clubs : 30 membres au plus, victoires de la semaine (coffre commun), discussion en phrases rapides.
      CREATE TABLE IF NOT EXISTS clubs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        emblem TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS club_members (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        joined_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS club_wins (
        week TEXT NOT NULL,
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wins INTEGER NOT NULL,
        PRIMARY KEY (week, club_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS club_chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        phrase TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      -- Parties réellement terminées (statistiques). Une ligne par partie : l'identifiant unique
      -- empêche de compter deux fois la même partie.
      CREATE TABLE IF NOT EXISTS games_log (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,            -- 'online' ou 'solo'
        humans INTEGER NOT NULL,       -- joueurs humains
        bots INTEGER NOT NULL,         -- adversaires ordinateur
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        duration_s INTEGER NOT NULL,
        day TEXT NOT NULL              -- jour de fin, fuseau Europe/Brussels
      );
      CREATE INDEX IF NOT EXISTS idx_games_day ON games_log(day);
      -- Participants humains : clé opaque (compte ou invité de la partie), victoire.
      CREATE TABLE IF NOT EXISTS game_players (
        game_id TEXT NOT NULL REFERENCES games_log(id) ON DELETE CASCADE,
        player_key TEXT NOT NULL,
        user_id TEXT,
        won INTEGER NOT NULL,
        PRIMARY KEY (game_id, player_key)
      );
      CREATE INDEX IF NOT EXISTS idx_gp_user ON game_players(user_id);
      CREATE TABLE IF NOT EXISTS ranked (
        season TEXT NOT NULL, user_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (season, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ranked ON ranked(season, points DESC);
      CREATE TABLE IF NOT EXISTS friend_requests (
        from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL, PRIMARY KEY (from_id, to_id)
      );
      CREATE TABLE IF NOT EXISTS duels (
        id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, stake INTEGER NOT NULL, created_at INTEGER NOT NULL,
        from_points INTEGER, from_throws INTEGER, to_points INTEGER, to_throws INTEGER,
        status TEXT NOT NULL, winner_id TEXT, from_seen INTEGER NOT NULL DEFAULT 1, to_seen INTEGER NOT NULL DEFAULT 0, ended_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_duels_from ON duels(from_id, status);
      CREATE INDEX IF NOT EXISTS idx_duels_to ON duels(to_id, status);
      CREATE TABLE IF NOT EXISTS push_subs (
        endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS solo_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, started_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_challenge_rank ON challenge(day, points DESC, throws ASC, created_at ASC);
    `);
    // Migrations douces : colonnes ajoutées après la première version.
    for (const col of ['photo_version INTEGER NOT NULL DEFAULT 0', 'photo_hidden INTEGER NOT NULL DEFAULT 0',
      'league INTEGER NOT NULL DEFAULT 0', 'referred_by TEXT', 'referral_paid INTEGER NOT NULL DEFAULT 0']) {
      try { this.db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch { /* déjà présente */ }
    }
    // Messages privés entre amis (read_at : lu par le destinataire, NULL sinon).
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_pm_pair ON private_messages(from_id, to_id, id);
      CREATE INDEX IF NOT EXISTS idx_pm_unread ON private_messages(to_id, read_at);
    `);
  }

  createUser(u: { id: string; username: string; passHash: string; recoveryHash: string; profile?: Profile }): UserRow {
    this.db.prepare(`INSERT INTO users (id, username, pass_hash, recovery_hash, created_at, profile) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(u.id, u.username, u.passHash, u.recoveryHash, Date.now(), JSON.stringify(u.profile ?? newProfile()));
    return this.userById(u.id)!;
  }
  userById(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }
  userByName(name: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(name) as UserRow | undefined;
  }
  profileOf(u: UserRow): Profile { return sanitizeProfile(JSON.parse(u.profile)); }
  saveProfile(id: string, p: Profile) {
    this.db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(p), id);
  }
  setPassword(id: string, passHash: string, recoveryHash: string) {
    this.db.prepare('UPDATE users SET pass_hash = ?, recovery_hash = ? WHERE id = ?').run(passHash, recoveryHash, id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  addOnlineResult(id: string, won: boolean) {
    this.db.prepare('UPDATE users SET online_games = online_games + 1, online_wins = online_wins + ? WHERE id = ?').run(won ? 1 : 0, id);
  }
  /** Compteur de parties solo récompensées aujourd'hui (plafond anti-abus). */
  bumpSolo(id: string, day: string): number {
    const u = this.userById(id)!;
    const n = u.solo_day === day ? u.solo_count + 1 : 1;
    this.db.prepare('UPDATE users SET solo_day = ?, solo_count = ? WHERE id = ?').run(day, n, id);
    return n;
  }
  deleteUser(id: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id); // sessions et amis : ON DELETE CASCADE
    this.db.prepare('DELETE FROM ranked WHERE user_id = ?').run(id);
    // Statistiques : la partie reste comptée, mais plus aucun lien avec le compte supprimé.
    this.db.prepare(`UPDATE game_players SET user_id = NULL, player_key = 'x:' || lower(hex(randomblob(8))) WHERE user_id = ?`).run(id);
  }

  createSession(tokenHash: string, userId: string) {
    const now = Date.now();
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)').run(tokenHash, userId, now, now);
  }
  sessionUser(tokenHash: string): UserRow | undefined {
    const s = this.db.prepare('SELECT user_id, last_seen FROM sessions WHERE token_hash = ?').get(tokenHash) as { user_id: string; last_seen: number } | undefined;
    if (!s) return undefined;
    // Session valable 180 jours sans utilisation.
    if (Date.now() - s.last_seen > 180 * 86400_000) { this.deleteSession(tokenHash); return undefined; }
    this.db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(Date.now(), tokenHash);
    return this.userById(s.user_id);
  }
  deleteSession(tokenHash: string) { this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); }

  /** Classement : victoires en ligne (vérifiées par le serveur), puis le moins de parties jouées. */
  leaderboard(limit = 50): UserRow[] {
    return this.db.prepare('SELECT * FROM users WHERE online_games > 0 ORDER BY online_wins DESC, online_games ASC, created_at ASC LIMIT ?').all(limit) as unknown as UserRow[];
  }
  rankOf(u: UserRow): number | null {
    if (u.online_games === 0) return null;
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE online_games > 0 AND (online_wins > ? OR (online_wins = ? AND (online_games < ? OR (online_games = ? AND created_at < ?))))`)
      .get(u.online_wins, u.online_wins, u.online_games, u.online_games, u.created_at) as { n: number };
    return r.n + 1;
  }
  addFriend(userId: string, friendId: string) {
    this.db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(userId, friendId, Date.now());
  }
  removeFriend(userId: string, friendId: string) {
    this.db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(userId, friendId);
  }
  /** Dernière activité d'un compte (toutes sessions confondues). */
  lastSeenOf(userId: string): number {
    const r = this.db.prepare('SELECT MAX(last_seen) AS t FROM sessions WHERE user_id = ?').get(userId) as { t: number | null } | undefined;
    return r?.t ?? 0;
  }
  friendsOf(userId: string): UserRow[] {
    return this.db.prepare('SELECT u.* FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.online_wins DESC, u.username').all(userId) as unknown as UserRow[];
  }
  setPhoto(id: string, type: string, data: Uint8Array) {
    this.db.prepare('INSERT OR REPLACE INTO photos (user_id, type, data) VALUES (?, ?, ?)').run(id, type, data);
    // Nouvelle photo : les anciens signalements ne la concernent plus.
    this.db.prepare('DELETE FROM reports WHERE target_id = ?').run(id);
    this.db.prepare('UPDATE users SET photo_version = photo_version + 1, photo_hidden = 0 WHERE id = ?').run(id);
  }
  removePhoto(id: string) {
    this.db.prepare('DELETE FROM photos WHERE user_id = ?').run(id);
    this.db.prepare('UPDATE users SET photo_version = 0, photo_hidden = 0 WHERE id = ?').run(id);
  }
  photo(id: string): { type: string; data: Uint8Array } | undefined {
    const u = this.userById(id);
    if (!u || u.photo_hidden) return undefined;
    return this.db.prepare('SELECT type, data FROM photos WHERE user_id = ?').get(id) as { type: string; data: Uint8Array } | undefined;
  }
  /** Signalement d'une photo ; au-delà de 3 joueurs différents, elle est masquée en attendant une vérification. */
  report(reporterId: string, targetId: string, reason: string): number {
    this.db.prepare('INSERT OR IGNORE INTO reports (reporter_id, target_id, reason, created_at) VALUES (?, ?, ?, ?)').run(reporterId, targetId, reason, Date.now());
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE target_id = ?').get(targetId) as { n: number }).n;
    if (n >= 3) this.db.prepare('UPDATE users SET photo_hidden = 1 WHERE id = ?').run(targetId);
    return n;
  }
  // --- Blocages ---
  block(userId: string, blockedId: string) {
    this.db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)').run(userId, blockedId, Date.now());
    this.removeFriend(userId, blockedId);
    this.removeFriend(blockedId, userId);
    this.deleteFriendRequest(userId, blockedId);
    this.deleteFriendRequest(blockedId, userId);
  }
  unblock(userId: string, blockedId: string) { this.db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(userId, blockedId); }
  blockedBy(userId: string): UserRow[] {
    return this.db.prepare('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY u.username').all(userId) as unknown as UserRow[];
  }
  /** L'un des deux a-t-il bloqué l'autre ? */
  isBlocked(a: string, b: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').get(a, b, b, a);
  }

  // --- Méta ---
  getMeta(key: string): string | null { return (this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null; }
  setMeta(key: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value); }

  // --- Ligues ---
  leagueRow(week: string, userId: string) {
    return this.db.prepare('SELECT * FROM league_xp WHERE week = ? AND user_id = ?').get(week, userId) as { week: string; user_id: string; league: number; grp: number; xp: number } | undefined;
  }
  leagueJoin(week: string, userId: string, league: number, size: number) {
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM league_xp WHERE week = ? AND league = ?').get(week, league) as { n: number }).n;
    this.db.prepare('INSERT OR IGNORE INTO league_xp (week, user_id, league, grp, xp) VALUES (?, ?, ?, ?, 0)').run(week, userId, league, Math.floor(n / size));
  }
  leagueAdd(week: string, userId: string, xp: number) { this.db.prepare('UPDATE league_xp SET xp = xp + ? WHERE week = ? AND user_id = ?').run(xp, week, userId); }
  leagueGroup(week: string, league: number, grp: number) {
    return this.db.prepare('SELECT l.user_id, l.xp, u.username FROM league_xp l JOIN users u ON u.id = l.user_id WHERE l.week = ? AND l.league = ? AND l.grp = ? ORDER BY l.xp DESC, u.username')
      .all(week, league, grp) as unknown as { user_id: string; xp: number; username: string }[];
  }
  leagueWeeksBefore(week: string): string[] {
    return (this.db.prepare('SELECT DISTINCT week FROM league_xp WHERE week < ? ORDER BY week').all(week) as unknown as { week: string }[]).map((r) => r.week);
  }
  leagueGroups(week: string) {
    return this.db.prepare('SELECT DISTINCT league, grp FROM league_xp WHERE week = ?').all(week) as unknown as { league: number; grp: number }[];
  }
  setLeague(userId: string, league: number) { this.db.prepare('UPDATE users SET league = ? WHERE id = ?').run(league, userId); }

  // --- Parrainage ---
  setReferrer(userId: string, referrerId: string) { this.db.prepare('UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL').run(referrerId, userId); }
  markReferralPaid(userId: string) { this.db.prepare('UPDATE users SET referral_paid = 1 WHERE id = ?').run(userId); }
  referralsPaidSince(referrerId: string, since: number): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND referral_paid = 1 AND created_at >= ?').get(referrerId, since) as { n: number }).n;
  }
  /** Filleuls d'un parrain (les plus récents d'abord). */
  referees(referrerId: string, limit = 30): UserRow[] {
    return this.db.prepare('SELECT * FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT ?').all(referrerId, limit) as unknown as UserRow[];
  }
  referralCount(referrerId: string): { invited: number; paid: number } {
    const r = this.db.prepare('SELECT COUNT(*) AS invited, SUM(referral_paid) AS paid FROM users WHERE referred_by = ?').get(referrerId) as { invited: number; paid: number | null };
    return { invited: r.invited, paid: r.paid ?? 0 };
  }

  // --- Rivalités ---
  h2hRecord(winnerId: string, loserId: string) {
    const [a, b] = winnerId < loserId ? [winnerId, loserId] : [loserId, winnerId];
    this.db.prepare('INSERT OR IGNORE INTO h2h (a, b) VALUES (?, ?)').run(a, b);
    this.db.prepare(`UPDATE h2h SET ${winnerId === a ? 'a_wins = a_wins + 1' : 'b_wins = b_wins + 1'} WHERE a = ? AND b = ?`).run(a, b);
  }
  h2h(me: string, other: string): { mine: number; theirs: number } | null {
    const [a, b] = me < other ? [me, other] : [other, me];
    const r = this.db.prepare('SELECT a_wins, b_wins FROM h2h WHERE a = ? AND b = ?').get(a, b) as { a_wins: number; b_wins: number } | undefined;
    if (!r) return null;
    return me === a ? { mine: r.a_wins, theirs: r.b_wins } : { mine: r.b_wins, theirs: r.a_wins };
  }

  // --- Clubs ---
  clubOf(userId: string) {
    return this.db.prepare('SELECT c.* FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ?').get(userId) as { id: string; name: string; emblem: string; owner_id: string; created_at: number } | undefined;
  }
  clubById(id: string) { return this.db.prepare('SELECT * FROM clubs WHERE id = ?').get(id) as { id: string; name: string; emblem: string; owner_id: string; created_at: number } | undefined; }
  clubByName(name: string) { return this.db.prepare('SELECT * FROM clubs WHERE name = ?').get(name) as { id: string } | undefined; }
  clubCreate(id: string, name: string, emblem: string, ownerId: string) {
    this.db.prepare('INSERT INTO clubs (id, name, emblem, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, emblem, ownerId, Date.now());
    this.clubJoin(id, ownerId);
  }
  clubJoin(clubId: string, userId: string) { this.db.prepare('INSERT OR REPLACE INTO club_members (user_id, club_id, joined_at) VALUES (?, ?, ?)').run(userId, clubId, Date.now()); }
  clubLeave(userId: string) { this.db.prepare('DELETE FROM club_members WHERE user_id = ?').run(userId); }
  clubDelete(id: string) { this.db.prepare('DELETE FROM clubs WHERE id = ?').run(id); }
  clubSetOwner(id: string, userId: string) { this.db.prepare('UPDATE clubs SET owner_id = ? WHERE id = ?').run(userId, id); }
  clubMembers(clubId: string, week: string) {
    return this.db.prepare(`SELECT u.id, u.username, u.profile, m.joined_at, COALESCE(w.wins, 0) AS wins FROM club_members m JOIN users u ON u.id = m.user_id
      LEFT JOIN club_wins w ON w.user_id = m.user_id AND w.club_id = m.club_id AND w.week = ? WHERE m.club_id = ? ORDER BY wins DESC, m.joined_at`).all(week, clubId) as unknown as { id: string; username: string; profile: string; joined_at: number; wins: number }[];
  }
  clubSize(clubId: string): number { return (this.db.prepare('SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?').get(clubId) as { n: number }).n; }
  clubAddWin(week: string, clubId: string, userId: string) {
    this.db.prepare('INSERT INTO club_wins (week, club_id, user_id, wins) VALUES (?, ?, ?, 1) ON CONFLICT(week, club_id, user_id) DO UPDATE SET wins = wins + 1').run(week, clubId, userId);
  }
  clubWeekWins(week: string, clubId: string): number {
    return (this.db.prepare('SELECT COALESCE(SUM(wins), 0) AS n FROM club_wins WHERE week = ? AND club_id = ?').get(week, clubId) as { n: number }).n;
  }
  clubTop(week: string, q: string, limit = 30) {
    return this.db.prepare(`SELECT c.id, c.name, c.emblem, (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS members,
      (SELECT COALESCE(SUM(wins), 0) FROM club_wins w WHERE w.club_id = c.id AND w.week = ?) AS wins
      FROM clubs c WHERE c.name LIKE ? ORDER BY wins DESC, members DESC, c.created_at LIMIT ?`).all(week, `%${q}%`, limit) as unknown as { id: string; name: string; emblem: string; members: number; wins: number }[];
  }
  clubWeeksBefore(week: string): string[] {
    return (this.db.prepare('SELECT DISTINCT week FROM club_wins WHERE week < ? ORDER BY week').all(week) as unknown as { week: string }[]).map((r) => r.week);
  }
  clubContributors(week: string) {
    return this.db.prepare('SELECT club_id, user_id, wins FROM club_wins WHERE week = ?').all(week) as unknown as { club_id: string; user_id: string; wins: number }[];
  }
  clubChatAdd(clubId: string, userId: string, phrase: string) {
    this.db.prepare('INSERT INTO club_chat (club_id, user_id, phrase, created_at) VALUES (?, ?, ?, ?)').run(clubId, userId, phrase, Date.now());
    this.db.prepare('DELETE FROM club_chat WHERE club_id = ? AND id NOT IN (SELECT id FROM club_chat WHERE club_id = ? ORDER BY id DESC LIMIT 50)').run(clubId, clubId);
  }
  clubChat(clubId: string) {
    return this.db.prepare('SELECT u.username, c.phrase, c.created_at FROM club_chat c JOIN users u ON u.id = c.user_id WHERE c.club_id = ? ORDER BY c.id DESC LIMIT 30').all(clubId) as unknown as { username: string; phrase: string; created_at: number }[];
  }

  // --- Défi du jour ---
  challengeAdd(day: string, userId: string, points: number, throws: number): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO challenge (day, user_id, points, throws, created_at) VALUES (?, ?, ?, ?, ?)').run(day, userId, points, throws, Date.now());
    return Number(r.changes) > 0;
  }
  challengeOf(day: string, userId: string): { points: number; throws: number; created_at: number } | undefined {
    return this.db.prepare('SELECT points, throws, created_at FROM challenge WHERE day = ? AND user_id = ?').get(day, userId) as { points: number; throws: number; created_at: number } | undefined;
  }
  challengeTop(day: string, limit = 20): { username: string; points: number; throws: number }[] {
    return this.db.prepare('SELECT u.username, c.points, c.throws FROM challenge c JOIN users u ON u.id = c.user_id WHERE c.day = ? ORDER BY c.points DESC, c.throws ASC, c.created_at ASC LIMIT ?')
      .all(day, limit) as unknown as { username: string; points: number; throws: number }[];
  }
  challengeRank(day: string, userId: string): { rank: number; total: number } | null {
    const me = this.challengeOf(day, userId);
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM challenge WHERE day = ?').get(day) as { n: number }).n;
    if (!me) return null;
    const better = (this.db.prepare('SELECT COUNT(*) AS n FROM challenge WHERE day = ? AND (points > ? OR (points = ? AND (throws < ? OR (throws = ? AND created_at < ?))))')
      .get(day, me.points, me.points, me.throws, me.throws, me.created_at) as { n: number }).n;
    return { rank: better + 1, total };
  }
  challengeCount(day: string): number { return (this.db.prepare('SELECT COUNT(*) AS n FROM challenge WHERE day = ?').get(day) as { n: number }).n; }

  // --- Mises en séquestre ---
  escrowAdd(userId: string, context: string, amount: number) {
    this.db.prepare('INSERT INTO escrow (user_id, context, amount, created_at) VALUES (?, ?, ?, ?)').run(userId, context, amount, Date.now());
  }
  escrowRelease(context: string) { this.db.prepare('DELETE FROM escrow WHERE context = ?').run(context); }
  escrowAll(): { user_id: string; context: string; amount: number }[] {
    return this.db.prepare('SELECT user_id, context, amount FROM escrow').all() as unknown as { user_id: string; context: string; amount: number }[];
  }
  escrowClear() { this.db.prepare('DELETE FROM escrow').run(); }

  // --- Demandes d'amis ---
  friendRequest(fromId: string, toId: string) { this.db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').run(fromId, toId, Date.now()); }
  hasFriendRequest(fromId: string, toId: string): boolean { return !!this.db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(fromId, toId); }
  deleteFriendRequest(fromId: string, toId: string) { this.db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?').run(fromId, toId); }
  incomingRequests(userId: string) {
    return this.db.prepare('SELECT u.username AS username, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at DESC').all(userId) as unknown as { username: string; at: number }[];
  }
  outgoingRequests(userId: string) {
    return this.db.prepare('SELECT u.username AS username, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC').all(userId) as unknown as { username: string; at: number }[];
  }
  isFriend(a: string, b: string): boolean { return !!this.db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(a, b); }

  // --- Défis entre amis ---
  duelCreate(d: { id: string; from: string; to: string; stake: number; at: number }) {
    this.db.prepare(`INSERT INTO duels (id, from_id, to_id, stake, created_at, status) VALUES (?, ?, ?, ?, ?, 'ouvert')`).run(d.id, d.from, d.to, d.stake, d.at);
  }
  duel(id: string) { return this.db.prepare('SELECT * FROM duels WHERE id = ?').get(id) as DuelRow | undefined; }
  duelUpdate(id: string, f: Partial<DuelRow>) {
    const keys = Object.keys(f);
    if (!keys.length) return;
    this.db.prepare(`UPDATE duels SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => (f as Record<string, string | number | null>)[k]), id);
  }
  duelsOf(userId: string, now: number, limit = 40) {
    return this.db.prepare(`SELECT * FROM duels WHERE (from_id = ? OR to_id = ?) AND (status = 'ouvert' OR ended_at > ?) ORDER BY created_at DESC LIMIT ?`)
      .all(userId, userId, now - 14 * 86400_000, limit) as unknown as DuelRow[];
  }
  duelsOpenBefore(t: number) { return this.db.prepare(`SELECT * FROM duels WHERE status = 'ouvert' AND created_at < ?`).all(t) as unknown as DuelRow[]; }

  // --- Notifications push ---
  pushAdd(userId: string, endpoint: string, p256dh: string, auth: string) {
    this.db.prepare('INSERT OR REPLACE INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)').run(endpoint, userId, p256dh, auth, Date.now());
  }
  pushRemove(endpoint: string) { this.db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint); }
  pushOf(userId: string) { return this.db.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').all(userId) as unknown as { endpoint: string; p256dh: string; auth: string }[]; }
  pushUsers(): string[] { return (this.db.prepare('SELECT DISTINCT user_id FROM push_subs').all() as unknown as { user_id: string }[]).map((r) => r.user_id); }

  // --- Saisons classées ---
  rankedAdd(season: string, userId: string, delta: number, won: boolean) {
    this.db.prepare(`INSERT INTO ranked (season, user_id, points, games, wins) VALUES (?, ?, MAX(0, ?), 1, ?)
      ON CONFLICT(season, user_id) DO UPDATE SET points = MAX(0, points + ?), games = games + 1, wins = wins + ?`)
      .run(season, userId, delta, won ? 1 : 0, delta, won ? 1 : 0);
  }
  rankedOf(season: string, userId: string) {
    return this.db.prepare('SELECT points, games, wins FROM ranked WHERE season = ? AND user_id = ?').get(season, userId) as { points: number; games: number; wins: number } | undefined;
  }
  rankedRank(season: string, points: number): number {
    return 1 + (this.db.prepare('SELECT COUNT(*) AS n FROM ranked WHERE season = ? AND points > ?').get(season, points) as { n: number }).n;
  }
  rankedTop(season: string, limit: number) {
    return this.db.prepare(`SELECT u.username AS username, r.points AS points, r.games AS games, r.wins AS wins FROM ranked r JOIN users u ON u.id = r.user_id
      WHERE r.season = ? ORDER BY r.points DESC, r.wins DESC, r.games ASC LIMIT ?`).all(season, limit) as unknown as { username: string; points: number; games: number; wins: number }[];
  }
  rankedAll(season: string) {
    return this.db.prepare('SELECT user_id, points FROM ranked WHERE season = ?').all(season) as unknown as { user_id: string; points: number }[];
  }
  rankedSeasonsBefore(season: string): string[] {
    return (this.db.prepare('SELECT DISTINCT season FROM ranked WHERE season < ? ORDER BY season').all(season) as unknown as { season: string }[]).map((r) => r.season);
  }

  // --- Parties solo en cours (jetons) ---
  soloTokenSet(token: string, userId: string, startedAt: number) {
    this.db.prepare('INSERT OR REPLACE INTO solo_tokens (token, user_id, started_at) VALUES (?, ?, ?)').run(token, userId, startedAt);
  }
  soloTokenGet(token: string): { userId: string; startedAt: number } | undefined {
    const r = this.db.prepare('SELECT user_id, started_at FROM solo_tokens WHERE token = ?').get(token) as { user_id: string; started_at: number } | undefined;
    return r ? { userId: r.user_id, startedAt: r.started_at } : undefined;
  }
  soloTokenDelete(token: string) { this.db.prepare('DELETE FROM solo_tokens WHERE token = ?').run(token); }
  soloTokenPrune(before: number) { this.db.prepare('DELETE FROM solo_tokens WHERE started_at < ?').run(before); }

  // --- Statistiques ---
  /** Enregistre une partie terminée. Renvoie false si elle était déjà enregistrée. */
  /** Dernières parties jouées sur le site, avec les pseudos des comptes (invités comptés à part). */
  recentGames(limit = 20): { mode: string; humans: number; bots: number; endedAt: number; duration: number; players: { username: string; won: boolean }[]; guests: number }[] {
    const games = this.db.prepare('SELECT id, mode, humans, bots, ended_at AS endedAt, duration_s AS duration FROM games_log ORDER BY ended_at DESC LIMIT ?').all(limit) as { id: string; mode: string; humans: number; bots: number; endedAt: number; duration: number }[];
    const q = this.db.prepare('SELECT u.username, p.won FROM game_players p JOIN users u ON u.id = p.user_id WHERE p.game_id = ?');
    return games.map(({ id, ...g }) => {
      const players = (q.all(id) as { username: string; won: number }[]).map((r) => ({ username: r.username, won: !!r.won }));
      return { ...g, players, guests: Math.max(0, g.humans - players.length) };
    });
  }
  /** Dernières parties d'un compte (historique du profil). */
  historyOf(userId: string, limit = 15): { mode: string; humans: number; bots: number; endedAt: number; duration: number; won: boolean }[] {
    return (this.db.prepare(`SELECT g.mode, g.humans, g.bots, g.ended_at AS endedAt, g.duration_s AS duration, p.won FROM game_players p
      JOIN games_log g ON g.id = p.game_id WHERE p.user_id = ? ORDER BY g.ended_at DESC LIMIT ?`).all(userId, limit) as { mode: string; humans: number; bots: number; endedAt: number; duration: number; won: number }[])
      .map((r) => ({ ...r, won: !!r.won }));
  }
  logGame(g: { id: string; mode: 'online' | 'solo'; humans: number; bots: number; startedAt: number; endedAt: number; day: string;
    players: { key: string; userId: string | null; won: boolean }[] }): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO games_log (id, mode, humans, bots, started_at, ended_at, duration_s, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id, g.mode, g.humans, g.bots, g.startedAt, g.endedAt, Math.max(0, Math.round((g.endedAt - g.startedAt) / 1000)), g.day);
    if (!r.changes) return false;
    const ins = this.db.prepare('INSERT OR IGNORE INTO game_players (game_id, player_key, user_id, won) VALUES (?, ?, ?, ?)');
    for (const p of g.players) ins.run(g.id, p.key, p.userId, p.won ? 1 : 0);
    return true;
  }
  statsDay(day: string) {
    const g = this.db.prepare('SELECT COUNT(*) AS games FROM games_log WHERE day = ?').get(day) as { games: number };
    const p = this.db.prepare(`SELECT COUNT(DISTINCT gp.player_key) AS players, COALESCE(SUM(gp.won), 0) AS wins
      FROM game_players gp JOIN games_log g ON g.id = gp.game_id WHERE g.day = ?`).get(day) as { players: number; wins: number };
    return { games: g.games, players: p.players, wins: p.wins };
  }
  statsDays(from: string, to: string) {
    return this.db.prepare(`SELECT g.day AS day, COUNT(DISTINCT g.id) AS games, COUNT(DISTINCT gp.player_key) AS players
      FROM games_log g LEFT JOIN game_players gp ON gp.game_id = g.id WHERE g.day BETWEEN ? AND ? GROUP BY g.day`).all(from, to) as unknown as { day: string; games: number; players: number }[];
  }
  statsTotals() {
    const t = this.db.prepare(`SELECT COUNT(*) AS games, COALESCE(SUM(CASE WHEN humans >= 2 THEN 1 ELSE 0 END), 0) AS multi,
      COALESCE(SUM(CASE WHEN humans < 2 THEN 1 ELSE 0 END), 0) AS vsAi, COALESCE(SUM(duration_s), 0) AS seconds, MIN(day) AS since FROM games_log`).get() as
      { games: number; multi: number; vsAi: number; seconds: number; since: string | null };
    const users = (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    return { ...t, users };
  }
  usersCreatedBetween(from: number, to: number): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?').get(from, to) as { n: number }).n;
  }
  usersCreatedSince(from: number) {
    return this.db.prepare('SELECT username, created_at FROM users WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100').all(from) as unknown as { username: string; created_at: number }[];
  }
  /** Admin : comptes les plus actifs (parties terminées) depuis une date. */
  mostActive(sinceDay: string, limit: number) {
    return this.db.prepare(`SELECT u.username AS username, COUNT(*) AS games, SUM(gp.won) AS wins, MAX(g.ended_at) AS last
      FROM game_players gp JOIN games_log g ON g.id = gp.game_id JOIN users u ON u.id = gp.user_id
      WHERE g.day >= ? GROUP BY u.id ORDER BY games DESC, wins DESC LIMIT ?`).all(sinceDay, limit) as unknown as { username: string; games: number; wins: number; last: number }[];
  }
  activeAccounts(sinceDay: string): number {
    return (this.db.prepare(`SELECT COUNT(DISTINCT gp.user_id) AS n FROM game_players gp JOIN games_log g ON g.id = gp.game_id
      WHERE gp.user_id IS NOT NULL AND g.day >= ?`).get(sinceDay) as { n: number }).n;
  }
  longestGames(limit: number) {
    const rows = this.db.prepare('SELECT id, mode, humans, bots, duration_s, ended_at FROM games_log ORDER BY duration_s DESC LIMIT ?').all(limit) as unknown as
      { id: string; mode: string; humans: number; bots: number; duration_s: number; ended_at: number }[];
    const names = this.db.prepare(`SELECT u.username AS username FROM game_players gp JOIN users u ON u.id = gp.user_id WHERE gp.game_id = ?`);
    return rows.map((r) => ({ ...r, accounts: (names.all(r.id) as unknown as { username: string }[]).map((x) => x.username) }));
  }

  // --- Messages privés ---
  /** Nouveau message ; on garde au plus `keep` messages par conversation. */
  pmAdd(fromId: string, toId: string, text: string, at: number, keep = 500): PmRow {
    const r = this.db.prepare('INSERT INTO private_messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(fromId, toId, text, at);
    this.db.prepare(`DELETE FROM private_messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id <= (
      SELECT id FROM private_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 1 OFFSET ?)`)
      .run(fromId, toId, toId, fromId, fromId, toId, toId, fromId, keep);
    return this.db.prepare('SELECT * FROM private_messages WHERE id = ?').get(Number(r.lastInsertRowid)) as unknown as PmRow;
  }
  /** Fil d'une conversation, du plus ancien au plus récent (les `limit` derniers avant `beforeId`). */
  pmThread(a: string, b: string, limit = 50, beforeId = Number.MAX_SAFE_INTEGER): PmRow[] {
    return (this.db.prepare(`SELECT * FROM private_messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id < ?
      ORDER BY id DESC LIMIT ?`).all(a, b, b, a, beforeId, limit) as unknown as PmRow[]).reverse();
  }
  /** Marque comme lus les messages reçus de `fromId`. Renvoie le nombre de messages marqués. */
  pmMarkRead(meId: string, fromId: string, at: number): number {
    return Number(this.db.prepare('UPDATE private_messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at IS NULL').run(at, meId, fromId).changes);
  }
  pmUnread(meId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM private_messages WHERE to_id = ? AND read_at IS NULL').get(meId) as { n: number }).n;
  }
  /** Conversations d'un compte : dernier message et non-lus par interlocuteur, la plus récente d'abord. */
  pmConversations(meId: string, limit = 50): { other: UserRow; last: PmRow; unread: number }[] {
    const rows = this.db.prepare(`SELECT other, MAX(id) AS last_id FROM (
        SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS other, id FROM private_messages WHERE from_id = ? OR to_id = ?
      ) GROUP BY other ORDER BY last_id DESC LIMIT ?`).all(meId, meId, meId, limit) as unknown as { other: string; last_id: number }[];
    const msg = this.db.prepare('SELECT * FROM private_messages WHERE id = ?');
    const unread = this.db.prepare('SELECT COUNT(*) AS n FROM private_messages WHERE to_id = ? AND from_id = ? AND read_at IS NULL');
    return rows.flatMap((r) => {
      const other = this.userById(r.other);
      if (!other) return [];
      return [{ other, last: msg.get(r.last_id) as unknown as PmRow, unread: (unread.get(meId, r.other) as { n: number }).n }];
    });
  }

  close() { this.db.close(); }
}
