/**
 * Comptes joueurs (facultatifs) : inscription, connexion, progression, boutique, défis,
 * classement et amis. Le serveur est l'autorité : pièces, XP et achats sont calculés ici.
 *
 * Sécurité :
 *  - mots de passe et codes de récupération hachés avec scrypt (sel aléatoire) ;
 *  - jetons de session aléatoires (256 bits), seule leur empreinte SHA-256 est stockée ;
 *  - limite de tentatives par adresse IP sur l'inscription, la connexion et la récupération ;
 *  - entrées validées et bornées ; suppression complète du compte possible.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { INVITE_DICE, INVITE_SET_FRIENDS, INVITE_SET_GAMES } from '../shared/progress/dice-collection';
import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { Store, photoUrl, toPublic, type UserRow } from './db';
import { accessoryEmoji } from '../shared/progress/catalog';
import { challengeReward, playChallenge } from '../shared/challenge';
import { PHRASES } from '../shared/protocol';
import {
  adjustCoins, applyGameEnd, applyPot, applyTournament, buy, claimDaily, claimPassTier, completeTutorial, setTitle, titleLabel, addSeasonPoints, REWARDS,
  LEAGUES, LEAGUE_DEMOTE, LEAGUE_PRIZES, ALBUM_KEYS, CLUB_CHEST, CLUB_COST, CLUB_EMBLEMS, CLUB_MAX, doPrestige, PRESTIGE_LEVEL, LEAGUE_PROMOTE, LEAGUE_SIZE, REFERRAL_BONUS, REFERRAL_GAMES, REFERRAL_BAGS_MAX, RETURN_DAYS, openChest, claimQuest, equip, levelInfo, rewardFor, sanitizeProfile, newProfile,
  applyPlainReward, openBag, craftDie, setShowcase, collectionCount, equipFx, BAGS_MAX, capGuestImport, WELCOME_BAGS,
  type Profile, type RewardContext,
} from '../shared/progress/profile';
import { SEASONS } from '../shared/progress/dice-collection';
import { CAPSULES } from '../shared/cards/catalog';
import { createSocial } from './social';
import { createMessages } from './messages';
import { muteText } from '../shared/moderation';
import { createDiscord } from './discord';
import { createCards } from './cards';
import { createCfEnigme } from './cf-enigme';
import { cfCoinReward } from '../shared/cards/progress';
import type { CfLevel } from '../shared/cards/ai';
import { DIVISIONS, SEASON_DIE_FROM, SEASON_TITLE_FROM, divisionIndex, divisionOf, nextSeasonStart, seasonDelta, seasonOf } from '../shared/season';
import { today } from '../shared/progress/quests';
import type { ComboKind } from '../shared/combos';
import type { Difficulty } from '../shared/ai';
import { applyDixMilleGame, dixMilleBagRoll, dixMilleOnlineReward, dixMilleReward } from '../shared/dixmille/reward';
import type { DmLevel } from '../shared/dixmille/engine';

export interface AccountsOptions {
  /** Pour les tests : configuration et appel Discord simulés. */
  discord?: { env?: Record<string, string | undefined>; api?: (code: string, redirect: string) => Promise<{ id: string; guilds: string[] }> };
  /** Durée minimale d'une partie solo pour être récompensée (anti-triche basique). */
  minSoloMs?: number;
  /** Parties solo récompensées par jour et par compte. */
  soloDailyCap?: number;
  /** Tentatives d'authentification par IP et par fenêtre de 10 minutes. */
  authAttempts?: number;
  /** Tirage des boosters Coups Fourrés (tests) ; par défaut cryptographique. */
  cardsRng?: () => number;
  /** Horloge (tests des ligues). */
  now?: () => number;
  /** Partie solo d'un compte réellement terminée (statistiques). */
  onSoloFinished?: (g: { id: string; userId: string; startedAt: number; opponents: number; won: boolean }) => void;
}

const USERNAME = /^[\p{L}\p{N}_.-]{3,20}$/u;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function scryptHash(secret: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => scrypt(secret, salt, 64, (err, key) =>
    err ? reject(err) : resolve(`s1$${salt.toString('base64')}$${key.toString('base64')}`)));
}
function scryptVerify(secret: string, stored: string): Promise<boolean> {
  const [v, salt, hash] = stored.split('$');
  if (v !== 's1' || !salt || !hash) return Promise.resolve(false);
  const expected = Buffer.from(hash, 'base64');
  return new Promise((resolve) => scrypt(secret, Buffer.from(salt, 'base64'), expected.length, (err, key) =>
    resolve(!err && key.length === expected.length && timingSafeEqual(key, expected))));
}
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const newRecoveryCode = () => Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')).join('-');

/** Jour du joueur (AAAA-MM-JJ, son fuseau), accepté s'il est à ±1 jour de la date du serveur. */
export function clientDay(raw: unknown): string {
  const server = today();
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return server;
  const diff = Math.abs(Date.parse(raw) - Date.parse(server));
  return Number.isFinite(diff) && diff <= 86400_000 ? raw : server;
}

function publicProfile(u: UserRow, p: Profile) {
  return { user: toPublic(u), profile: p };
}

export function createAccounts(store: Store, opts: AccountsOptions = {}) {
  const MIN_SOLO = opts.minSoloMs ?? 20_000;
  const SOLO_CAP = opts.soloDailyCap ?? 40;
  const ATTEMPTS = opts.authAttempts ?? 12;
  const router = express.Router();
  // Parties solo en cours : gardées en base, pour survivre à un redémarrage du serveur (mise à jour).
  const soloGames = {
    set: (token: string, v: { userId: string; startedAt: number }) => store.soloTokenSet(token, v.userId, v.startedAt),
    get: (token: string) => store.soloTokenGet(token),
    delete: (token: string) => store.soloTokenDelete(token),
    prune: (before: number) => store.soloTokenPrune(before),
  };
  const attempts = new Map<string, { n: number; since: number }>();

  // CORS : l'application mobile appelle l'API depuis une autre origine. Les jetons voyagent dans
  // l'en-tête Authorization (pas de cookie), donc autoriser toutes les origines est sans risque.
  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Day');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  // Photos de profil (256 × 256, en base64) : jusqu'à 200 ko ; le reste : 32 ko.
  const jsonSmall = express.json({ limit: '32kb' }), jsonPhoto = express.json({ limit: '200kb' });
  router.use((req, res, next) => (req.path === '/me/photo' ? jsonPhoto : jsonSmall)(req, res, next));

  const fail = (res: Response, status: number, error: string) => { res.status(status).json({ ok: false, error }); };

  function limited(req: Request): boolean {
    const ip = req.ip ?? 'inconnu';
    const now = Date.now();
    const a = attempts.get(ip);
    if (!a || now - a.since > 10 * 60_000) { attempts.set(ip, { n: 1, since: now }); return false; }
    a.n++;
    return a.n > ATTEMPTS;
  }

  function userFromToken(token: unknown): UserRow | undefined {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return undefined;
    return store.sessionUser(sha(token));
  }
  function auth(req: Request, res: Response, next: NextFunction) {
    const h = req.headers.authorization ?? '';
    const u = userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!u) return fail(res, 401, 'Session expirée : reconnectez-vous.');
    (req as Request & { user: UserRow }).user = u;
    next();
  }
  const userOf = (req: Request) => (req as Request & { user: UserRow }).user;
  const startSession = (userId: string) => {
    const token = randomBytes(32).toString('base64url');
    store.createSession(sha(token), userId);
    return token;
  };

  // --- Inscription / connexion ---------------------------------------------------------------
  /**
   * Progression d'invité reprise à l'inscription. Elle vient du navigateur, donc elle est plafonnée
   * (capGuestImport : pièces, niveau, objets, statistiques, sacs…). Les dés de collection, eux, ne se
   * créent que sur le serveur (un invité garde ses sacs, il les ouvre avec son compte) : on ne reprend
   * ni dés de collection ni éclats d'un appareil.
   */
  const importGuest = (p: Profile): Profile => capGuestImport(p);
  router.post('/register', async (req, res) => {
    if (limited(req)) return fail(res, 429, 'Trop de tentatives, réessayez dans quelques minutes.');
    const { username, password, guestProfile } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME.test(username.trim()))
      return fail(res, 400, 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -).');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200)
      return fail(res, 400, 'Mot de passe : au moins 8 caractères.');
    const name = username.trim();
    if (store.userByName(name)) return fail(res, 409, 'Ce pseudo est déjà pris.');
    const recoveryCode = newRecoveryCode();
    // La progression d'invité de cet appareil est reprise une fois, à la création du compte.
    const imported = guestProfile ? importGuest(sanitizeProfile(guestProfile)) : newProfile();
    // Cadeau de bienvenue : 3 sacs de dés (en plus des sacs repris, ≤ 10 + 3, loin du plafond de 99).
    // Les 3 boosters de Coups Fourrés sont donnés à la découverte du mode (server/cards.ts, discover).
    const profile: Profile = { ...imported, bags: Math.min(BAGS_MAX, (imported.bags ?? 0) + WELCOME_BAGS) };
    const u = store.createUser({ id: randomUUID(), username: name, passHash: await scryptHash(password), recoveryHash: await scryptHash(recoveryCode), profile });
    // Parrainage : pseudo de l'ami qui a invité (facultatif).
    const ref = typeof req.body?.referrer === 'string' ? store.userByName(req.body.referrer.trim()) : undefined;
    if (ref && ref.id !== u.id) {
      store.setReferrer(u.id, ref.id);
      // Seules les parties jouées avec le compte comptent pour le parrainage (pas la progression d'invité reprise).
      store.saveProfile(u.id, { ...profile, refBase: profile.stats.played });
    }
    res.json({ ok: true, token: startSession(u.id), recoveryCode, welcome: { bags: WELCOME_BAGS, boosters: CAPSULES.welcomeBoosters }, ...publicProfile(u, profile) });
  });

  router.post('/login', async (req, res) => {
    if (limited(req)) return fail(res, 429, 'Trop de tentatives, réessayez dans quelques minutes.');
    const { username, password } = req.body ?? {};
    const u = typeof username === 'string' ? store.userByName(username.trim()) : undefined;
    // Même délai et même message que le compte existe ou non.
    const ok = await scryptVerify(typeof password === 'string' ? password : '', u?.pass_hash ?? 's1$AAAA$AAAA');
    if (!u || !ok) return fail(res, 401, 'Pseudo ou mot de passe incorrect.');
    res.json({ ok: true, token: startSession(u.id), ...publicProfile(u, store.profileOf(u)) });
  });

  router.post('/recover', async (req, res) => {
    if (limited(req)) return fail(res, 429, 'Trop de tentatives, réessayez dans quelques minutes.');
    const { username, recoveryCode, newPassword } = req.body ?? {};
    const u = typeof username === 'string' ? store.userByName(username.trim()) : undefined;
    const code = typeof recoveryCode === 'string' ? recoveryCode.trim().toUpperCase() : '';
    const ok = await scryptVerify(code, u?.recovery_hash ?? 's1$AAAA$AAAA');
    if (!u || !ok) return fail(res, 401, 'Pseudo ou code de récupération incorrect.');
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200)
      return fail(res, 400, 'Mot de passe : au moins 8 caractères.');
    const fresh = newRecoveryCode(); // un code ne sert qu'une fois
    store.setPassword(u.id, await scryptHash(newPassword), await scryptHash(fresh));
    res.json({ ok: true, token: startSession(u.id), recoveryCode: fresh, ...publicProfile(u, store.profileOf(u)) });
  });

  router.post('/logout', auth, (req, res) => {
    store.deleteSession(sha((req.headers.authorization ?? '').slice(7)));
    res.json({ ok: true });
  });

  router.get('/me', auth, (req, res) => {
    rollSeasons(); // fin de saison éventuelle : récompenses versées avant de renvoyer le profil
    const u = store.userById(userOf(req).id)!;
    let p = store.profileOf(u);
    // Retour après quelques jours d'absence : un sac de dés offert. La visite est notée au plus une fois par heure.
    const t = opts.now?.() ?? Date.now();
    const welcomeBack = !!p.lastVisit && t - p.lastVisit >= RETURN_DAYS * 86400_000;
    if (welcomeBack || !p.lastVisit || t - p.lastVisit > 3600_000) {
      p = { ...p, lastVisit: t, ...(welcomeBack ? { bags: Math.min(BAGS_MAX, (p.bags ?? 0) + 1) } : {}) };
      store.saveProfile(u.id, p);
    }
    res.json({ ok: true, ...publicProfile(u, p), rank: store.rankOf(u), welcomeBack });
  });

  /** Suppression définitive et immédiate du compte et de toutes ses données. */
  router.delete('/me', auth, async (req, res) => {
    const u = userOf(req);
    if (!(await scryptVerify(String(req.body?.password ?? ''), u.pass_hash))) return fail(res, 401, 'Mot de passe incorrect.');
    store.deleteUser(u.id);
    res.json({ ok: true });
  });

  // --- Boutique et défis -------------------------------------------------------------------------
  const mutate = (req: Request, res: Response, fn: (p: Profile) => Profile | null, error: string) => {
    const u = userOf(req);
    const next = fn(store.profileOf(u));
    if (!next) return fail(res, 400, error);
    store.saveProfile(u.id, next);
    res.json({ ok: true, profile: next });
  };
  router.post('/shop/buy', auth, (req, res) => mutate(req, res, (p) => {
    const b = buy(p, String(req.body?.id ?? ''), clientDay(req.headers['x-day']));
    return b ? equip(b, String(req.body.id)) : null;
  }, 'Achat impossible (pièces ou niveau insuffisants).'));
  router.post('/shop/equip', auth, (req, res) => mutate(req, res, (p) => equip(p, String(req.body?.id ?? '')), 'Objet non possédé.'));

  // --- Dés de collection : tirage fait ici (hasard cryptographique), jamais par le navigateur ---
  // --- Fil d'actualité : les beaux moments du comptoir, gardés en base (30 derniers). -------------
  let feed: { text: string; at: number }[] = (() => { try { return JSON.parse(store.getMeta('feed') ?? '[]'); } catch { return []; } })();
  const news = (text: string) => {
    feed = [{ text, at: Date.now() }, ...feed].slice(0, 30);
    store.setMeta('feed', JSON.stringify(feed));
  };
  router.get('/feed', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, feed: feed.slice(0, 12) }); });
  const gameNews = (name: string, won: boolean, mode: 'solo' | 'online', count421: number, boss?: string) => {
    if (boss && won) news(`🏆 ${name} a battu le Patron de la semaine !`);
    else if (count421 >= 2) news(`🎲 ${name} a sorti ${count421} fois 4-2-1 dans la même partie !`);
    else if (count421 === 1 && won) news(`🎲 ${name} a gagné avec un 4-2-1 !`);
    else if (won && mode === 'online') news(`🍻 ${name} a remporté une partie en ligne`);
  };

  router.post('/bags/open', auth, (req, res) => {
    const u = userOf(req);
    const r = openBag(store.profileOf(u));
    if (!r) return fail(res, 400, 'Aucun sac à ouvrir.');
    store.saveProfile(u.id, r.profile);
    if (r.result.shiny) news(`✨ ${u.username} a trouvé un dé brillant !`);
    else if (r.result.rarity === 'legendaire') news(`✨ ${u.username} a sorti un dé légendaire d’un sac !`);
    else if (r.result.rarity === 'epique') news(`✨ ${u.username} a sorti un dé épique`);
    res.json({ ok: true, profile: r.profile, result: r.result });
  });
  router.post('/collection/craft', auth, (req, res) =>
    mutate(req, res, (p) => craftDie(p, String(req.body?.id ?? '')), 'Pas assez d’éclats, ou dé déjà possédé.'));
  router.post('/collection/fx', auth, (req, res) => {
    const kind = req.body?.kind === 'fete' ? 'fete' : 'trainee';
    const id = req.body?.id == null ? null : String(req.body.id);
    mutate(req, res, (p) => equipFx(p, kind, id), 'Effet non possédé.');
  });
  router.post('/collection/showcase', auth, (req, res) =>
    mutate(req, res, (p) => setShowcase(p, Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []), 'Vitrine invalide.'));
  router.post('/quests/claim', auth, (req, res) =>
    mutate(req, res, (p) => claimQuest(p, String(req.body?.id ?? ''), clientDay(req.headers['x-day']))?.profile ?? null, 'Défi non accompli.'));

  router.post('/prestige', auth, (req, res) =>
    mutate(req, res, (p) => doPrestige(p), `Le prestige s'ouvre au niveau ${PRESTIGE_LEVEL}.`));

  // --- Série de connexions, pass de saison, titres, partie guidée ---------------------------------
  router.post('/chest/open', auth, (req, res) => {
    const u = userOf(req);
    const r = openChest(store.profileOf(u));
    if (!r) return fail(res, 409, 'Le coffre se recharge 24 h après chaque ouverture.');
    store.saveProfile(u.id, r.profile);
    res.json({ ok: true, coins: r.coins, bag: r.bag, profile: store.profileOf(store.userById(u.id)!) });
  });
  router.post('/daily/claim', auth, (req, res) =>
    mutate(req, res, (p) => claimDaily(p, clientDay(req.headers['x-day']))?.profile ?? null, 'Récompense du jour déjà récupérée.'));
  router.post('/season/claim', auth, (req, res) =>
    mutate(req, res, (p) => claimPassTier(p, Number(req.body?.tier), clientDay(req.headers['x-day']))?.profile ?? null, 'Palier pas encore atteint.'));
  router.post('/title', auth, (req, res) =>
    mutate(req, res, (p) => setTitle(p, req.body?.id == null ? null : String(req.body.id)), 'Titre non débloqué.'));
  router.post('/tutorial/done', auth, (req, res) =>
    mutate(req, res, (p) => completeTutorial(p), 'Partie guidée déjà récompensée.'));

  // --- Défi du jour : le serveur rejoue les décisions et calcule le score officiel ---------------
  router.post('/challenge/submit', auth, (req, res) => {
    const u = userOf(req);
    const day = clientDay(req.headers['x-day']);
    const result = playChallenge(day, req.body?.decisions);
    if (!result) return fail(res, 400, 'Partie du défi invalide.');
    if (!store.challengeAdd(day, u.id, result.points, result.throws)) return fail(res, 409, 'Vous avez déjà joué le défi du jour.');
    const r = challengeReward(result.points);
    const p0 = store.profileOf(u);
    const before = levelInfo(p0.xp).level, after = levelInfo(p0.xp + r.xp).level;
    let bonus = 0;
    for (let l = before + 1; l <= after; l++) bonus += REWARDS.levelBonus(l);
    const profile = addSeasonPoints({ ...p0, xp: p0.xp + r.xp, coins: p0.coins + r.coins + bonus }, r.xp, day);
    store.saveProfile(u.id, profile);
    leagueGain(u.id, r.xp);
    res.json({ ok: true, result, reward: r, profile, ...store.challengeRank(day, u.id) });
  });
  router.get('/challenge/board', auth, (req, res) => {
    const u = userOf(req);
    const day = clientDay(req.headers['x-day']);
    const mine = store.challengeOf(day, u.id);
    res.json({ ok: true, day, top: store.challengeTop(day), total: store.challengeCount(day), mine: mine ? { points: mine.points, throws: mine.throws, ...store.challengeRank(day, u.id) } : null });
  });

  // --- Parties solo (jouées sur l'appareil) ------------------------------------------------------
  // Le serveur ne voit pas la partie solo : il exige un jeton de début de partie, une durée minimale,
  // borne les valeurs et plafonne le nombre de parties récompensées par jour. Le classement, lui,
  // ne compte que les parties en ligne, vérifiées par le serveur.
  router.post('/solo/start', auth, (req, res) => {
    const token = randomBytes(18).toString('base64url');
    soloGames.set(token, { userId: userOf(req).id, startedAt: Date.now() });
    soloGames.prune(Date.now() - 12 * 3600_000);
    res.json({ ok: true, gameToken: token });
  });
  router.post('/solo/end', auth, (req, res) => {
    const u = userOf(req);
    const b = req.body ?? {};
    const g = typeof b.gameToken === 'string' ? soloGames.get(b.gameToken) : undefined;
    if (!g || g.userId !== u.id) return fail(res, 400, 'Partie inconnue.');
    if (Date.now() - g.startedAt < MIN_SOLO) return fail(res, 400, 'Partie trop courte pour être récompensée.');
    soloGames.delete(b.gameToken);
    // La partie est terminée : elle compte dans les statistiques, même au-delà du plafond de récompenses.
    opts.onSoloFinished?.({ id: b.gameToken, userId: u.id, startedAt: g.startedAt, opponents: Math.min(5, Math.max(1, Math.floor(Number(b.opponents) || 1))), won: !!b.won });
    const day = clientDay(req.headers['x-day']);
    if (store.bumpSolo(u.id, day) > SOLO_CAP) return fail(res, 429, 'Plafond de parties solo récompensées atteint pour aujourd\'hui.');
    const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));
    const diffs: Difficulty[] = ['facile', 'normal', 'difficile'];
    const combos: Partial<Record<ComboKind, number>> = {};
    for (const k of ['421', '111', '11x', 'brelan', 'suite', 'nenette', 'autre'] as ComboKind[]) combos[k] = int(b.combos?.[k], 0, 60);
    const ctx: RewardContext = {
      mode: 'solo',
      opponents: int(b.opponents, 1, 5),
      difficulty: diffs.includes(b.difficulty) ? b.difficulty : 'normal',
      count421: Math.min(int(b.count421, 0, 60), combos['421'] ?? 0),
      combos,
      gestureThrows: int(b.gestureThrows, 0, 300),
      rounds: int(b.rounds, 1, 200),
      roundsLost: b.roundsLost === undefined || b.roundsLost === null ? undefined : int(b.roundsLost, 0, 200),
      maxTokens: int(b.maxTokens, 0, 99),
      day,
      suddenDeath: !!b.suddenDeath || int(b.rounds, 1, 200) <= 1,
      comboKeys: Array.isArray(b.comboKeys) ? b.comboKeys.filter((k: unknown) => typeof k === 'string' && ALBUM_KEYS.includes(k)).slice(0, 30) : [],
      best: b.best && typeof b.best.label === 'string' ? { label: String(b.best.label).slice(0, 30), rank: int(b.best.rank, 0, 2000) } : undefined,
      opponentNames: Array.isArray(b.opponentNames) ? b.opponentNames.filter((n: unknown) => typeof n === 'string').map((n: string) => n.slice(0, 20)).slice(0, 5) : [],
      hour: brusselsHour(),
      boss: typeof b.boss === 'string' ? b.boss.slice(0, 20) : undefined,
      // Place annoncée (bornée) ; durée mesurée par le serveur, depuis le début de la partie.
      place: b.won ? 1 : int(b.place, 2, int(b.opponents, 1, 5) + 1),
      minutes: (Date.now() - g.startedAt) / 60000,
      now: Date.now(),
    };
    const reward = rewardFor(!!b.won, int(b.rounds, 1, 200), ctx);
    const applied = applyGameEnd(store.profileOf(u), reward, ctx, day);
    store.saveProfile(u.id, applied.profile);
    if (!ctx.suddenDeath) { leagueGain(u.id, reward.xp); checkReferral(u.id); if (b.won) clubWin(u.id); }
    gameNews(u.username, !!b.won, 'solo', ctx.count421 ?? 0, ctx.boss);
    res.json({ ok: true, reward, applied: { ...applied, profile: store.profileOf(store.userById(u.id)!) } });
  });

  // --- Le Dix mille contre l'ordinateur (joué sur l'appareil) : même principe que le solo du 421 --
  // (jeton de début, durée minimale, plafond quotidien partagé avec le solo), barème du solo.
  const clock = () => opts.now?.() ?? Date.now();
  router.post('/dixmille/start', auth, (req, res) => {
    const token = randomBytes(18).toString('base64url');
    soloGames.set(token, { userId: userOf(req).id, startedAt: clock() });
    soloGames.prune(clock() - 12 * 3600_000);
    res.json({ ok: true, gameToken: token });
  });
  router.post('/dixmille/end', auth, (req, res) => {
    const u = userOf(req);
    const b = req.body ?? {};
    const g = typeof b.gameToken === 'string' ? soloGames.get(b.gameToken) : undefined;
    if (!g || g.userId !== u.id) return fail(res, 400, 'Partie inconnue.');
    if (clock() - g.startedAt < MIN_SOLO) return fail(res, 400, 'Partie trop courte pour être récompensée.');
    soloGames.delete(b.gameToken);
    const day = clientDay(req.headers['x-day']);
    if (store.bumpSolo(u.id, day) > SOLO_CAP) return fail(res, 429, 'Plafond de parties solo récompensées atteint pour aujourd\'hui.');
    const levels: DmLevel[] = ['debutant', 'habitue', 'fouine'];
    const opponents = Math.min(3, Math.max(1, Math.floor(Number(b.opponents) || 1)));
    const reward = dixMilleReward({
      won: !!b.won, place: Math.floor(Number(b.place) || opponents + 1), opponents,
      level: levels.includes(b.level) ? b.level : 'habitue', minutes: (clock() - g.startedAt) / 60000, day, now: clock(),
    });
    // Sac de dés : durée mesurée ici ; le résultat annoncé par le téléphone ne change pas la chance.
    const level: DmLevel = levels.includes(b.level) ? b.level : 'habitue';
    const applied = applyDixMilleGame(store.profileOf(u), reward, day, {
      won: !!b.won, players: opponents + 1, minutes: (clock() - g.startedAt) / 60000, mode: 'solo', level,
      bestTurn: Number(b.bestTurn) || 0, declared: true,
    });
    store.saveProfile(u.id, applied.profile);
    leagueGain(u.id, reward.xp);
    res.json({ ok: true, reward, applied: { ...applied, profile: store.profileOf(store.userById(u.id)!) } });
  });

  /**
   * Fin d'une partie du Courtisan en ligne (appelée par le serveur de jeu) : récompense calculée ici.
   * Un joueur parti ne touche rien. Avec des ordinateurs : plafond quotidien des parties contre l'ordinateur.
   */
  function dixMilleOnlineEnd(userId: string, o: { won: boolean; place: number; players: number; humans: number; botLevels: DmLevel[]; minutes: number; day: string; abandoned: boolean; bestTurn?: number; potWon?: number }) {
    const u = store.userById(userId);
    if (!u || o.abandoned) return null;
    if (o.botLevels.length && store.bumpSolo(userId, o.day) > SOLO_CAP) return null;
    const reward = dixMilleOnlineReward({ ...o, now: Date.now() });
    // Partie jouée par le serveur : résultat, durée et pot sont les siens (sac de dés au barème du 421).
    const easiest = (['debutant', 'habitue', 'fouine'] as DmLevel[]).find((l) => o.botLevels.includes(l));
    const applied = applyDixMilleGame(store.profileOf(u), reward, o.day, {
      won: o.won, players: o.players, minutes: o.minutes, mode: o.humans >= 2 ? 'online' : 'solo', level: o.humans >= 2 ? undefined : easiest,
      bestTurn: o.bestTurn, potWon: o.potWon,
    });
    store.saveProfile(userId, applied.profile);
    leagueGain(userId, reward.xp);
    if (o.won && o.humans >= 2) news(`🎲 ${u.username} a remporté une partie du Courtisan`);
    return { reward, applied: { ...applied, profile: store.profileOf(store.userById(userId)!) } };
  }

  /** Où se trouve un compte en ce moment (fourni par le serveur de jeu ; `game` : le Courtisan). */
  let presence: (userId: string) => { code: string; status: 'salon' | 'partie'; joinable: boolean; watchable?: boolean; game?: 'courtisan' } | null = () => null;
  const setPresence = (f: typeof presence) => { presence = f; };
  /** Présence dans « Coups Fourrés » (menu du mode, ou partie qu'on peut regarder). */
  let cfPresence: (userId: string) => { status: 'menu' | 'partie'; code?: string; watchable?: boolean } | null = () => null;
  const setCfPresence = (f: typeof cfPresence) => { cfPresence = f; };
  const ONLINE_MS = 90_000;

  // --- Classement et amis -----------------------------------------------------------------------
  const row = (u: UserRow, rank: number | null) => ({
    rank, username: u.username, onlineWins: u.online_wins, onlineGames: u.online_games,
    level: levelInfo(store.profileOf(u).xp).level,
  });
  router.get('/leaderboard', auth, (req, res) => {
    const me = userOf(req);
    const top = store.leaderboard(50).map((u, i) => row(u, i + 1));
    res.json({ ok: true, top, me: row(me, store.rankOf(me)) });
  });
  router.get('/friends', auth, (req, res) => {
    const me = userOf(req);
    const t = Date.now(); // même horloge que les sessions
    const list = [me, ...store.friendsOf(me.id)]
      .sort((a, b) => b.online_wins - a.online_wins || a.online_games - b.online_games)
      .map((u, i) => {
        // Présence façon Steam : en partie / dans un salon (qu'on peut rejoindre) / en ligne / vu il y a…
        const room = presence(u.id);
        const cf = u.id === me.id ? null : cfPresence(u.id);
        const lastSeen = store.lastSeenOf(u.id);
        return { ...row(u, i + 1), me: u.id === me.id, lastSeen, online: !!room || !!cf || t - lastSeen < ONLINE_MS, room, cf };
      });
    res.json({ ok: true, friends: list });
  });

  // Droit d'accès (RGPD) : tout ce que le serveur garde sur le compte, dans un fichier lisible.
  router.get('/me/export', auth, (req, res) => {
    const u = userOf(req);
    res.setHeader('Content-Disposition', `attachment; filename="421-${u.username}.json"`);
    res.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      account: { username: u.username, createdAt: new Date(u.created_at).toISOString(), onlineGames: u.online_games, onlineWins: u.online_wins, hasPhoto: u.photo_version > 0 },
      progress: store.profileOf(u),
      friends: store.friendsOf(u.id).map((f) => f.username),
      blocked: store.blockedBy(u.id).map((f) => f.username),
      privateMessages: store.pmConversations(u.id, 500).map((x) => ({ with: x.other.username, messages: store.pmThread(u.id, x.other.id, 500).map((m) => ({ mine: m.from_id === u.id, text: m.text, at: new Date(m.created_at).toISOString() })) })),
      note: 'Le mot de passe et le code de récupération ne sont conservés que sous forme d’empreinte (hachage) et ne peuvent pas être exportés.',
    });
  });

  // --- Ligues hebdomadaires -------------------------------------------------------------------
  router.get('/league', auth, (req, res) => {
    const u = userOf(req);
    rollLeagues();
    const week = weekId();
    const fresh = store.userById(u.id)!;
    const row = store.leagueRow(week, u.id);
    const group = row ? store.leagueGroup(week, row.league, row.grp) : [];
    res.json({
      ok: true, week, endsAt: weekEnd(), league: fresh.league, name: LEAGUES[fresh.league],
      promote: LEAGUE_PROMOTE, demote: fresh.league > 0 ? LEAGUE_DEMOTE : 0, prizes: LEAGUE_PRIZES,
      group: group.map((g, i) => ({ rank: i + 1, username: g.username, xp: g.xp, me: g.user_id === u.id })),
    });
  });

  // --- Clubs ---------------------------------------------------------------------------------
  const CLUB_NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’.-]{1,22}[\p{L}\p{N}.]$/u;
  const chatLimit = new Map<string, number>();
  function clubInfo(clubId: string, viewer: string) {
    rollClubs();
    const c = store.clubById(clubId)!;
    const week = weekId();
    const members = store.clubMembers(clubId, week).map((m) => ({
      username: m.username, wins: m.wins, level: levelInfo(sanitizeProfile(JSON.parse(m.profile)).xp).level, owner: m.id === c.owner_id, me: m.id === viewer,
    }));
    return {
      id: c.id, name: c.name, emblem: c.emblem, members, max: CLUB_MAX, wins: store.clubWeekWins(week, clubId), chest: CLUB_CHEST, endsAt: weekEnd(),
      chat: store.clubChat(clubId).map((x) => ({ id: x.id, username: x.username, phrase: x.phrase, at: x.created_at })),
    };
  }
  router.get('/clubs', auth, (req, res) => {
    const u = userOf(req);
    rollClubs();
    const mine = store.clubOf(u.id);
    const q = String(req.query.q ?? '').slice(0, 24).replace(/[%_]/g, '');
    res.json({ ok: true, mine: mine ? clubInfo(mine.id, u.id) : null, top: store.clubTop(weekId(), q), cost: CLUB_COST, emblems: CLUB_EMBLEMS });
  });
  router.post('/clubs', auth, (req, res) => {
    const u = userOf(req);
    if (store.clubOf(u.id)) return fail(res, 400, 'Quittez d’abord votre club actuel.');
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    if (!CLUB_NAME.test(name)) return fail(res, 400, 'Nom du club : 3 à 24 caractères (lettres, chiffres, espaces).');
    if (store.clubByName(name)) return fail(res, 409, 'Ce nom de club est déjà pris.');
    const emblem = CLUB_EMBLEMS.includes(req.body?.emblem) ? req.body.emblem : CLUB_EMBLEMS[0];
    const p = adjustCoins(store.profileOf(u), -CLUB_COST);
    if (!p) return fail(res, 400, `Créer un club coûte ${CLUB_COST} pièces.`);
    store.saveProfile(u.id, p);
    const id = randomUUID();
    store.clubCreate(id, name, emblem, u.id);
    res.json({ ok: true, club: clubInfo(id, u.id), profile: p });
  });
  router.post('/clubs/join', auth, (req, res) => {
    const u = userOf(req);
    if (store.clubOf(u.id)) return fail(res, 400, 'Quittez d’abord votre club actuel.');
    const c = typeof req.body?.id === 'string' ? store.clubById(req.body.id) : undefined;
    if (!c) return fail(res, 404, 'Club introuvable.');
    if (store.clubSize(c.id) >= CLUB_MAX) return fail(res, 400, `Ce club est complet (${CLUB_MAX} membres).`);
    if (store.isBlocked(c.owner_id, u.id)) return fail(res, 403, 'Impossible de rejoindre ce club.');
    store.clubJoin(c.id, u.id);
    res.json({ ok: true, club: clubInfo(c.id, u.id) });
  });
  router.post('/clubs/leave', auth, (req, res) => {
    const u = userOf(req);
    const c = store.clubOf(u.id);
    if (!c) return fail(res, 400, 'Vous n’êtes dans aucun club.');
    store.clubLeave(u.id);
    const rest = store.clubMembers(c.id, weekId());
    if (!rest.length) store.clubDelete(c.id);
    else if (c.owner_id === u.id) store.clubSetOwner(c.id, [...rest].sort((a, b) => a.joined_at - b.joined_at)[0].id);
    res.json({ ok: true });
  });
  router.post('/clubs/chat', auth, (req, res) => {
    const u = userOf(req);
    const c = store.clubOf(u.id);
    if (!c) return fail(res, 400, 'Vous n’êtes dans aucun club.');
    if (!PHRASES.includes(req.body?.phrase)) return fail(res, 400, 'Phrase inconnue.');
    const mute = store.modMuteOf(u.id, opts.now?.() ?? Date.now());
    if (mute) return fail(res, 403, muteText(mute));
    if (Date.now() - (chatLimit.get(u.id) ?? 0) < 3000) return fail(res, 429, 'Doucement !');
    chatLimit.set(u.id, Date.now());
    store.clubChatAdd(c.id, u.id, req.body.phrase);
    res.json({ ok: true, club: clubInfo(c.id, u.id) });
  });

  // --- Parrainage ------------------------------------------------------------------------------
  router.get('/referral', auth, (req, res) => {
    const u = userOf(req);
    const p = store.profileOf(store.userById(u.id)!);
    res.json({
      ok: true, code: u.username, bonus: REFERRAL_BONUS, inviteSet: { friends: INVITE_SET_FRIENDS, games: INVITE_SET_GAMES, done: Math.min(INVITE_SET_FRIENDS, inviteProgress(u.id)) }, gamesNeeded: REFERRAL_GAMES, bagsMax: REFERRAL_BAGS_MAX, bagsEarned: p.referralBags ?? 0,
      ...store.referralCount(u.id),
      referees: store.referees(u.id).map((f) => ({ username: f.username, played: Math.min(REFERRAL_GAMES, store.profileOf(f).stats.played - (store.profileOf(f).refBase ?? 0)), done: !!f.referral_paid })),
    });
  });

  // --- Joueurs bloqués : leurs photos et réactions sont masquées, ils ne rejoignent pas vos tables ---
  router.get('/blocks', auth, (req, res) => {
    res.json({ ok: true, blocked: store.blockedBy(userOf(req).id).map((u) => u.username) });
  });
  router.post('/blocks', auth, (req, res) => {
    const me = userOf(req);
    const t = typeof req.body?.username === 'string' ? store.userByName(req.body.username.trim()) : undefined;
    if (!t) return fail(res, 404, 'Aucun joueur avec ce pseudo.');
    if (t.id === me.id) return fail(res, 400, 'Vous ne pouvez pas vous bloquer vous-même.');
    store.block(me.id, t.id);
    res.json({ ok: true, blocked: store.blockedBy(me.id).map((u) => u.username) });
  });
  router.delete('/blocks/:username', auth, (req, res) => {
    const me = userOf(req);
    const t = store.userByName(String(req.params.username));
    if (t) store.unblock(me.id, t.id);
    res.json({ ok: true, blocked: store.blockedBy(me.id).map((u) => u.username) });
  });

  // --- Photo de profil ---------------------------------------------------------------------------
  // L'image est réduite sur l'appareil (256 × 256) avant l'envoi ; le serveur vérifie le format
  // réel (signature du fichier) et la taille, puis la sert avec un type fixe (pas d'exécution possible).
  const MAGIC: [string, number[]][] = [['image/jpeg', [0xff, 0xd8, 0xff]], ['image/png', [0x89, 0x50, 0x4e, 0x47]], ['image/webp', [0x52, 0x49, 0x46, 0x46]]];
  router.post('/me/photo', auth, (req, res) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl ?? ''));
    if (!m) return fail(res, 400, 'Format d’image non pris en charge (JPEG, PNG ou WebP).');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 120_000) return fail(res, 413, 'Image trop lourde.');
    const type = MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
    if (!type || (type === 'image/webp' && buf.subarray(8, 12).toString('latin1') !== 'WEBP')) return fail(res, 400, 'Fichier image invalide.');
    const u = userOf(req);
    store.setPhoto(u.id, type, buf);
    res.json({ ok: true, photo: photoUrl(store.userById(u.id)!) });
  });
  router.delete('/me/photo', auth, (req, res) => {
    store.removePhoto(userOf(req).id);
    res.json({ ok: true });
  });
  router.get('/photos/:id', (req, res) => {
    const p = store.photo(String(req.params.id));
    if (!p) { res.status(404).end(); return; }
    res.setHeader('Content-Type', p.type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.end(Buffer.from(p.data));
  });

  // --- Profils publics ---------------------------------------------------------------------------
  router.get('/players/:username/history', (req, res) => {
    const u = store.userByName(String(req.params.username));
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    res.json({ ok: true, games: store.historyOf(u.id) });
  });

  // --- Invitations en partie : un ami invite un autre à rejoindre sa table, d'un clic. ---------------
  const invites = new Map<string, { from: string; code: string; at: number; game?: 'courtisan' }[]>();
  const INVITE_MS = 10 * 60_000;
  const invitesOf = (userId: string) => {
    const t = Date.now();
    const list = (invites.get(userId) ?? []).filter((i) => t - i.at < INVITE_MS && presence(store.userByName(i.from)?.id ?? '')?.code === i.code);
    invites.set(userId, list);
    return list;
  };
  router.post('/invites', auth, (req, res) => {
    const me = userOf(req);
    const to = store.userByName(String(req.body?.username ?? ''));
    if (!to || !store.friendsOf(me.id).some((f) => f.id === to.id)) return fail(res, 403, 'Vous ne pouvez inviter que vos amis.');
    const room = presence(me.id);
    if (!room?.joinable) return fail(res, 409, 'Ouvrez d’abord une table pour y inviter vos amis.');
    const list = invitesOf(to.id).filter((i) => i.from !== me.username);
    list.push({ from: me.username, code: room.code, at: Date.now(), ...(room.game ? { game: room.game } : {}) });
    invites.set(to.id, list.slice(-5));
    if (room.game === 'courtisan') void social.push(to.id, `${me.username} vous invite au Courtisan`, 'Une table de dés vous attend : touchez pour la rejoindre.', `/?courtisan=${room.code}`);
    else void social.push(to.id, `${me.username} vous invite à jouer`, 'Une table vous attend : touchez pour la rejoindre.', `/?rejoindre=${room.code}`);
    res.json({ ok: true });
  });
  router.get('/invites', auth, (req, res) => {
    res.json({ ok: true, invites: invitesOf(userOf(req).id).map((i) => ({ from: i.from, code: i.code, ...(i.game ? { game: i.game } : {}) })) });
  });
  router.post('/invites/decline', auth, (req, res) => {
    const me = userOf(req);
    invites.set(me.id, invitesOf(me.id).filter((i) => i.code !== String(req.body?.code ?? '')));
    res.json({ ok: true });
  });

  router.get('/players/:username', (req, res) => {
    const u = store.userByName(String(req.params.username));
    if (!u) return fail(res, 404, 'Joueur introuvable.');
    const h = req.headers.authorization ?? '';
    const viewer = userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    const p = store.profileOf(u);
    const li = levelInfo(p.xp);
    res.json({
      ok: true,
      player: {
        username: u.username, photo: photoUrl(u), createdAt: u.created_at, rank: store.rankOf(u),
        level: li.level, xp: p.xp, into: li.into, need: li.need,
        onlineGames: u.online_games, onlineWins: u.online_wins,
        stats: { played: p.stats.played, won: p.stats.won, total421: p.stats.total421, bestStreak: p.stats.bestStreak },
        achievements: p.achievements,
        equipped: p.equipped,
        title: titleLabel(p.title),
        accessory: accessoryEmoji(p.equipped.accessoire),
        league: LEAGUES[u.league],
        prestige: p.prestige ?? 0,
        album: (p.album ?? []).length,
        showcase: p.showcase ?? [],
        collection: collectionCount(p),
        rivalry: viewer && viewer.id !== u.id ? store.h2h(viewer.id, u.id) : null,
      },
    });
  });
  router.post('/report', auth, (req, res) => {
    const me = userOf(req);
    const t = typeof req.body?.username === 'string' ? store.userByName(req.body.username) : undefined;
    if (!t || t.id === me.id) return fail(res, 400, 'Signalement impossible.');
    store.report(me.id, t.id, String(req.body?.reason ?? 'photo').slice(0, 200));
    // Visible aussi dans le panel de modération (une fois par joueur tant que ce n'est pas traité).
    if (!store.modDuplicate(me.id, t.id, null)) {
      store.modAddReport({ reporter_id: me.id, reporter_name: me.username, target_id: t.id, target_name: t.username, kind: 'joueur', reason: 'profil',
        comment: 'Photo de profil signalée', created_at: opts.now?.() ?? Date.now(), msg_ref: null, msg_place: null, msg_where: null, msg_text: null, msg_at: null, msg_context: null });
    }
    res.json({ ok: true });
  });

  /** Fin d'une partie en ligne : récompense calculée et enregistrée par le serveur. */
  function onlineGameEnd(userId: string, won: boolean, rounds: number, ctx: RewardContext, day: string, abandoned: boolean) {
    const u = store.userById(userId);
    if (!u) return null;
    // Avec des ordinateurs à la table (ctx.botLevel) : hors classement, et la partie compte dans le
    // plafond quotidien des parties contre l'ordinateur (pas de « ferme » à pièces).
    if (!ctx.suddenDeath && !ctx.botLevel) store.addOnlineResult(userId, won && !abandoned); // la mort subite ne compte pas au classement
    if (abandoned) return null; // partie quittée : comptée comme perdue, sans récompense
    if (ctx.botLevel && store.bumpSolo(userId, day) > SOLO_CAP) return null;
    const reward = rewardFor(won, rounds, { ...ctx, day, now: Date.now() });
    const applied = applyGameEnd(store.profileOf(u), reward, { ...ctx, day, hour: brusselsHour() }, day);
    store.saveProfile(userId, applied.profile);
    if (!ctx.suddenDeath) { leagueGain(userId, reward.xp); checkReferral(userId); if (won && !abandoned) clubWin(userId); }
    gameNews(u.username, won, 'online', ctx.count421 ?? 0);
    return { reward, applied: { ...applied, profile: store.profileOf(store.userById(userId)!) } };
  }

  /** Solde actuel d'un compte (vérification des mises). */
  const coinsOf = (userId: string) => { const u = store.userById(userId); return u ? store.profileOf(u).coins : 0; };
  /** Débite ou crédite des pièces (mise, remboursement). Renvoie le profil, ou null si le solde ne suffit pas. */
  function adjust(userId: string, delta: number) {
    const u = store.userById(userId);
    if (!u) return null;
    const next = adjustCoins(store.profileOf(u), delta);
    if (next) store.saveProfile(userId, next);
    return next;
  }
  /** Mise prélevée et mise en séquestre (remboursée si le serveur redémarre avant la fin). */
  function stake(userId: string, amount: number, context: string) {
    const p = adjust(userId, -amount);
    if (p) store.escrowAdd(userId, context, amount);
    return p;
  }
  /** Fin de la partie ou du tournoi : les mises ont été redistribuées, le séquestre est levé. */
  const release = (context: string, userId?: string) => (userId ? store.escrowReleaseUser(context, userId) : store.escrowRelease(context));
  // Démarrage : toute mise encore en séquestre appartient à une partie interrompue → remboursement.
  {
    const left = store.escrowAll();
    for (const e of left) adjust(e.user_id, e.amount);
    store.escrowClear();
    if (left.length && !process.env.VITEST) console.log(`Mises remboursées après redémarrage : ${left.length}`);
  }
  const isBlocked = (a: string, b: string) => store.isBlocked(a, b);

  /** Cagnotte d'une table remportée. */
  function winPot(userId: string, amount: number) {
    const u = store.userById(userId);
    if (!u) return null;
    const out = applyPot(store.profileOf(u), amount);
    store.saveProfile(userId, out.profile);
    return out;
  }
  /** Fin de tournoi : statistiques, succès et gain. */
  function tournamentEnd(userId: string, place: number, prize: number) {
    const u = store.userById(userId);
    if (!u) return null;
    const out = applyTournament(store.profileOf(u), place, prize);
    store.saveProfile(userId, out.profile);
    return out;
  }

  // --- Ligues : semaine du lundi au dimanche (heure de Bruxelles) ------------------------------
  const brusselsHour = () => Number(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', hour12: false }).format(new Date())) % 24;
  const brusselsDate = (now: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  function weekId(now = opts.now?.() ?? Date.now()): string {
    const d = brusselsDate(now);
    const t = Date.parse(`${d}T12:00:00Z`);
    const dow = (new Date(t).getUTCDay() + 6) % 7; // lundi = 0
    return new Date(t - dow * 86400_000).toISOString().slice(0, 10);
  }
  const weekEnd = () => new Date(Date.parse(`${weekId()}T00:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  /** Clôture des semaines passées : montées, descentes, récompenses et titres. */
  function rollLeagues() {
    const cur = weekId();
    const last = store.getMeta('league_rolled');
    if (last === cur) return;
    for (const week of store.leagueWeeksBefore(cur)) {
      if (last && week < last) continue;
      for (const { league, grp } of store.leagueGroups(week)) {
        const rows = store.leagueGroup(week, league, grp);
        rows.forEach((r, i) => {
          const u = store.userById(r.user_id);
          if (!u) return;
          let p = store.profileOf(u);
          if (i < LEAGUE_PRIZES.length && r.xp > 0) p = { ...p, coins: p.coins + LEAGUE_PRIZES[i] };
          if (i < LEAGUE_PROMOTE && r.xp > 0 && u.league < LEAGUES.length - 1) {
            store.setLeague(u.id, u.league + 1);
            p = { ...p, titles: [...new Set([...(p.titles ?? []), `ligue:${LEAGUES[u.league + 1]}`])] };
          } else if (rows.length >= 8 && i >= rows.length - LEAGUE_DEMOTE && u.league > 0) {
            store.setLeague(u.id, u.league - 1);
          }
          store.saveProfile(u.id, p);
        });
      }
    }
    store.setMeta('league_rolled', cur);
  }
  // --- Saisons classées ---------------------------------------------------------------------------
  const currentSeason = () => seasonOf(brusselsDate(opts.now?.() ?? Date.now()));
  /** Fin de saison : dé de saison, titre et sacs selon la division atteinte (une seule fois). */
  function rollSeasons(): string[] {
    const cur = currentSeason();
    const last = store.getMeta('season_rolled');
    const done: string[] = [];
    if (last === cur) return done;
    for (const season of store.rankedSeasonsBefore(cur)) {
      if (last && season < last) continue;
      for (const r of store.rankedAll(season)) {
        const u = store.userById(r.user_id);
        if (!u) continue;
        const div = divisionOf(r.points);
        let p = store.profileOf(u);
        const owned = [...p.owned];
        if (divisionIndex(div.id) >= divisionIndex(SEASON_DIE_FROM) && SEASONS.includes(season)) owned.push(`ds-${season}`);
        const titles = divisionIndex(div.id) >= divisionIndex(SEASON_TITLE_FROM) ? [...(p.titles ?? []), `saison:${season}_${div.id}`] : p.titles;
        p = { ...p, owned: [...new Set(owned)], titles: titles ? [...new Set(titles)] : undefined, bags: Math.min(BAGS_MAX, (p.bags ?? 0) + div.bags) };
        store.saveProfile(u.id, p);
        done.push(u.id);
      }
    }
    store.setMeta('season_rolled', cur);
    return done;
  }
  /** Partie classée terminée : points selon la place parmi les humains. */
  function seasonGame(results: { userId: string; place: number; won: boolean }[], humans: number) {
    rollSeasons();
    const season = currentSeason();
    for (const r of results) store.rankedAdd(season, r.userId, seasonDelta(r.place, humans), r.won);
  }
  router.get('/season', (req, res) => {
    rollSeasons();
    const season = currentSeason();
    const h = req.headers.authorization ?? '';
    const viewer = userFromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    const mine = viewer ? store.rankedOf(season, viewer.id) : undefined;
    res.json({
      ok: true, season, endsOn: nextSeasonStart(season), divisions: DIVISIONS, dieFrom: SEASON_DIE_FROM, titleFrom: SEASON_TITLE_FROM, die: `ds-${season}`,
      me: viewer ? { points: mine?.points ?? 0, games: mine?.games ?? 0, wins: mine?.wins ?? 0, division: divisionOf(mine?.points ?? 0).id, rank: mine ? store.rankedRank(season, mine.points) : null } : null,
      top: store.rankedTop(season, 50).map((t, i) => ({ rank: i + 1, ...t, division: divisionOf(t.points).id })),
    });
  });

  /** XP gagnée : comptée pour la ligue de la semaine. */
  function leagueGain(userId: string, xp: number) {
    if (xp <= 0) return;
    rollLeagues();
    const week = weekId();
    const u = store.userById(userId);
    if (!u) return;
    if (!store.leagueRow(week, userId)) store.leagueJoin(week, userId, u.league, LEAGUE_SIZE);
    store.leagueAdd(week, userId, xp);
  }
  /** Clubs : chaque victoire d'un membre remplit le coffre commun de la semaine. */
  function clubWin(userId: string) {
    rollClubs();
    const c = store.clubOf(userId);
    if (c) store.clubAddWin(weekId(), c.id, userId);
  }
  /** Fin de semaine : chaque membre qui a contribué reçoit le palier atteint par le coffre du club. */
  function rollClubs() {
    const cur = weekId();
    const last = store.getMeta('clubs_rolled');
    if (last === cur) return;
    for (const week of store.clubWeeksBefore(cur)) {
      if (last && week < last) continue;
      const rows = store.clubContributors(week);
      const total = new Map<string, number>();
      for (const r of rows) total.set(r.club_id, (total.get(r.club_id) ?? 0) + r.wins);
      for (const r of rows) {
        const tier = [...CLUB_CHEST].reverse().find((t) => (total.get(r.club_id) ?? 0) >= t.wins);
        const u = tier && store.userById(r.user_id);
        if (u) { const p = store.profileOf(u); store.saveProfile(u.id, { ...p, coins: p.coins + tier!.coins }); }
      }
    }
    store.setMeta('clubs_rolled', cur);
  }

  const inviteProgress = (referrerId: string) =>
    store.referees(referrerId, 500).filter((f) => { const fp = store.profileOf(f); return fp.stats.played - (fp.refBase ?? 0) >= INVITE_SET_GAMES; }).length;
  /** Set « Feu et Glace » : offert quand INVITE_SET_FRIENDS filleuls ont joué INVITE_SET_GAMES parties. */
  function checkInviteSet(referrerId: string) {
    const r = store.userById(referrerId);
    if (!r) return;
    const rp = store.profileOf(r);
    const missing = INVITE_DICE.map((c) => c.id).filter((id) => !rp.owned.includes(id));
    if (!missing.length || inviteProgress(r.id) < INVITE_SET_FRIENDS) return;
    store.saveProfile(r.id, { ...rp, owned: [...rp.owned, ...missing] });
    void social.push(r.id, 'Set « Feu et Glace » débloqué !', `${INVITE_SET_FRIENDS} amis ont rejoint le comptoir : vos 3 dés légendaires vous attendent.`, '/');
  }

  /**
   * Parrainage : quand un filleul a joué REFERRAL_GAMES parties (vérifiées par le serveur), il reçoit
   * des pièces de bienvenue et son parrain un sac de dés, au plus REFERRAL_BAGS_MAX sacs par parrain.
   */
  function checkReferral(userId: string) {
    const u = store.userById(userId);
    if (u?.referred_by) checkInviteSet(u.referred_by);
    if (!u?.referred_by || u.referral_paid) return;
    const p = store.profileOf(u);
    if (p.stats.played - (p.refBase ?? 0) < REFERRAL_GAMES) return;
    store.markReferralPaid(u.id);
    store.saveProfile(u.id, { ...p, coins: p.coins + REFERRAL_BONUS });
    const r = store.userById(u.referred_by);
    if (!r) return;
    const rp = store.profileOf(r);
    if ((rp.referralBags ?? 0) >= REFERRAL_BAGS_MAX) return;
    store.saveProfile(r.id, { ...rp, bags: Math.min(BAGS_MAX, (rp.bags ?? 0) + 1), referralBags: (rp.referralBags ?? 0) + 1 });
    void social.push(r.id, 'Parrainage réussi !', `${u.username} a joué ${REFERRAL_GAMES} parties : un sac de dés vous attend.`, '/');
  }
  /** Rivalités : chaque partie en ligne compte pour chaque paire de comptes de la table. */
  function recordRivalry(rankedUserIds: string[]) {
    for (let i = 0; i < rankedUserIds.length; i++)
      for (let j = i + 1; j < rankedUserIds.length; j++)
        if (rankedUserIds[i] !== rankedUserIds[j]) store.h2hRecord(rankedUserIds[i], rankedUserIds[j]);
  }

  /** Pseudo et photo d'un compte (cartes des joueurs en partie). */
  const publicInfo = (userId: string) => {
    const u = store.userById(userId);
    if (!u) return null;
    const p = store.profileOf(u);
    return { account: u.username, photo: photoUrl(u), title: titleLabel(p.title) ?? undefined, accessory: accessoryEmoji(p.equipped.accessoire) || undefined, prestige: p.prestige || undefined, dice: p.equipped.dice, trail: p.fx?.trainee, fete: p.fx?.fete };
  };
  const social = createSocial({ router, store, auth, userOf, fail, adjust, coinsOf, brusselsDate, brusselsHour, now: () => opts.now?.() ?? Date.now() });
  const messages = createMessages({ router, store, auth, userOf, fail, push: social.push, userFromToken, now: () => opts.now?.() ?? Date.now() });
  createDiscord({ router, store, auth, userOf, userFromToken, now: () => opts.now?.() ?? Date.now(), env: opts.discord?.env, discordApi: opts.discord?.api });
  // Coups Fourrés (mode cartes) : collection, decks, boosters, ligue et missions.
  /**
   * Coups Fourrés : pièces et XP (monnaie générale) d'une partie terminée, au barème du 421 ; contre
   * l'ordinateur, plafond quotidien commun avec le solo du 421 et du Courtisan.
   */
  const cfGeneralReward = (userId: string, o: { won: boolean; place: number; players: number; minutes: number; botLevel?: CfLevel | null; day: string }) => {
    const u = store.userById(userId);
    if (!u) return null;
    if (o.botLevel && store.bumpSolo(userId, o.day) > SOLO_CAP) return null;
    const reward = cfCoinReward({ ...o, now: opts.now?.() ?? Date.now() });
    const applied = applyPlainReward(store.profileOf(u), reward, o.day);
    // Sac de dés : la règle du 421 et du Courtisan (même chance, sac garanti au bout de 10 parties,
    // compteur commun), tirée ici ; rien pour une partie de moins de 1 min 30.
    const bag = dixMilleBagRoll(applied.profile, { won: o.won, players: o.players, minutes: o.minutes, mode: o.botLevel ? 'solo' : 'online' });
    store.saveProfile(userId, bag.profile);
    leagueGain(userId, reward.xp);
    return { coins: reward.coins + applied.levelBonusCoins, xp: reward.xp, bags: bag.found };
  };
  const cards = createCards({ router, store, auth, userOf, fail, now: () => opts.now?.() ?? Date.now(), push: (u, t, b, url) => void social.push(u, t, b, url), rng: opts.cardsRng, generalReward: cfGeneralReward });
  // Coups Fourrés : l'énigme du jour (score recalculé ici, une validation par jour).
  const enigme = createCfEnigme({ router, store, auth, userOf, fail, now: () => opts.now?.() ?? Date.now() });

  return { social, messages, cards, enigme, router, dixMilleOnlineEnd, setPresence, setCfPresence, seasonGame, rollSeasons, userFromToken, recordRivalry, rollLeagues, weekId, onlineGameEnd, publicInfo, coinsOf, adjust, stake, release, winPot, tournamentEnd, isBlocked };
}
