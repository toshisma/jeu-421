/**
 * Les Groschen : la monnaie du Courtisan (séparée des pièces du 421, comme les capsules de Coups
 * Fourrés). Monnaie de jeu, sans argent réel. Comptes seulement : le solde vit sur le serveur, qui
 * fait foi (aucun solde ni résultat n'est jamais lu chez le joueur).
 *
 * - Cadeau de connexion : +20 une fois par jour, jour de Bruxelles calculé par l'horloge du SERVEUR.
 * - Bonus de bienvenue (0.53) : +80 une seule fois par compte (marqueur dans la table dm_once), versé à
 *   la première visite du Courtisan : un nouveau compte part avec 80 + 20 = 100 Groschen ; un compte
 *   existant les reçoit à sa prochaine visite. Rejouer la requête ne les verse pas deux fois.
 * - Contre les ordinateurs : leur part d'un pot emporté est plafonnée par jour (DM_BOT_GAIN_DAILY).
 * - Mises : prélevées au lancement d'une partie et bloquées (table dm_escrow) ; versées au gagnant
 *   ou remboursées. Au démarrage du serveur, toute mise encore bloquée est remboursée.
 * - Journal de chaque mouvement (dm_ledger) pour l'administration.
 *
 * Routes (/api) : GET /dixmille/wallet (solde, cadeau du jour), GET /admin/groschen (admin).
 */
import express from 'express';
import type { Store, UserRow } from './db';
import { DM_BOT_GAIN_DAILY, GROSCHEN_DAILY, GROSCHEN_WELCOME_EXTRA } from '../shared/dixmille/groschen';

const brusselsDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

export interface GroschenApi {
  router: express.Router;
  balance: (userId: string) => number;
  /** Prélève une mise et la bloque. Faux si le solde ne suffit pas. */
  stake: (userId: string, amount: number, ref: string) => boolean;
  /**
   * Verse le pot au gagnant et lève tous les blocages de la partie. `fromBots` : la part du pot misée
   * par les ordinateurs, plafonnée par jour ; renvoie ce qui a vraiment été versé.
   */
  payWinner: (ref: string, userId: string | null, pot: number, fromBots?: number) => { paid: number; capped: boolean };
  /** Rembourse les mises bloquées (tous, ou seulement ces comptes) ; les autres sont perdues. */
  refund: (ref: string, only?: string[]) => void;
  /** Jour de Bruxelles selon l'horloge du serveur. */
  today: () => string;
}

export function createGroschen(o: { store: Store; userFromToken: (t: unknown) => UserRow | undefined; isAdmin: (u: UserRow | undefined) => boolean; now?: () => number }): GroschenApi {
  const { store } = o;
  const now = o.now ?? Date.now;
  const today = () => brusselsDay(now());
  // Cadeaux uniques par compte (bonus de bienvenue…) : une ligne par compte et par cadeau.
  store.dmBalance(''); // crée les tables du mode si besoin
  store.sqlite.exec(`CREATE TABLE IF NOT EXISTS dm_once (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, key)
  )`);
  /** Vrai la première fois seulement (insertion indivisible). */
  const once = (userId: string, key: string) => Number(store.sqlite.prepare('INSERT OR IGNORE INTO dm_once (user_id, key, at) VALUES (?, ?, ?)').run(userId, key, now()).changes) === 1;
  const onceDone = (userId: string, key: string) => !!store.sqlite.prepare('SELECT 1 FROM dm_once WHERE user_id = ? AND key = ?').get(userId, key);
  /** Part des ordinateurs déjà touchée aujourd'hui (journal : motif « gain-ordi », référence préfixée du jour). */
  const botGainToday = (userId: string, day: string) => Number((store.sqlite.prepare(
    "SELECT COALESCE(SUM(delta), 0) AS n FROM dm_ledger WHERE user_id = ? AND reason = 'gain-ordi' AND ref LIKE ?").get(userId, `${day} %`) as { n: number }).n);
  // Redémarrage : les mises d'une partie interrompue sont rendues.
  for (const e of store.dmEscrowAll()) store.dmMove(e.user_id, e.amount, 'remboursement', e.ref);
  for (const ref of new Set(store.dmEscrowAll().map((e) => e.ref))) store.dmEscrowRelease(ref);

  const router = express.Router();
  const tokenOf = (req: express.Request) => { const h = req.headers.authorization ?? ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
  router.get('/dixmille/wallet', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const u = o.userFromToken(tokenOf(req));
    if (!u) return res.status(401).json({ ok: false, error: 'Les Groschen demandent un compte (gratuit).' });
    const day = today();
    // Aperçu (menu principal) : solde et cadeau du jour disponible, sans le verser (il l'est à l'ouverture du mode).
    if (req.query.peek) {
      const welcomeReady = !onceDone(u.id, 'welcome');
      const giftReady = store.dmGiftReady(u.id, day);
      return res.json({ ok: true, balance: store.dmBalance(u.id), giftReady: giftReady || welcomeReady, giftAmount: (giftReady ? GROSCHEN_DAILY : 0) + (welcomeReady ? GROSCHEN_WELCOME_EXTRA : 0), day });
    }
    // Nouveau venu (aucun mouvement de Groschen) ou ancien joueur : le message n'est pas le même.
    const newcomer = store.dmLedgerOf(u.id, 1).length === 0;
    const welcome = once(u.id, 'welcome') ? GROSCHEN_WELCOME_EXTRA : 0;
    if (welcome) store.dmMove(u.id, welcome, 'bienvenue', null, now());
    const gift = store.dmDailyGift(u.id, day, GROSCHEN_DAILY, now());
    res.json({ ok: true, balance: store.dmBalance(u.id), gift, ...(welcome ? { welcome, newcomer } : {}), day, history: store.dmLedgerOf(u.id, 20) });
  });
  router.get('/admin/groschen', (req, res) => {
    const u = o.userFromToken(tokenOf(req));
    if (!o.isAdmin(u)) return res.status(403).json({ ok: false, error: 'Réservé à l’administration.' });
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    res.json({ ok: true, ...store.dmEconomy(now() - days * 86400_000) });
  });

  return {
    router,
    today,
    balance: (userId) => store.dmBalance(userId),
    stake(userId, amount, ref) {
      if (!Number.isInteger(amount) || amount <= 0) return amount === 0;
      if (store.dmMove(userId, -amount, 'mise', ref, now()) === null) return false;
      store.dmEscrowAdd(userId, ref, amount);
      return true;
    },
    payWinner(ref, userId, pot, fromBots = 0) {
      store.dmEscrowRelease(ref);
      if (!userId || pot <= 0) return { paid: 0, capped: false };
      const bots = Math.min(pot, Math.max(0, Math.floor(fromBots)));
      const humans = pot - bots;
      const day = today();
      const allowed = Math.min(bots, Math.max(0, DM_BOT_GAIN_DAILY - botGainToday(userId, day)));
      if (humans > 0) store.dmMove(userId, humans, 'gain', ref, now());
      if (allowed > 0) store.dmMove(userId, allowed, 'gain-ordi', `${day} ${ref}`, now());
      return { paid: humans + allowed, capped: allowed < bots };
    },
    refund(ref, only) {
      for (const e of store.dmEscrowRelease(ref)) if (!only || only.includes(e.user_id)) store.dmMove(e.user_id, e.amount, 'remboursement', ref, now());
    },
  };
}
