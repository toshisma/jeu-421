/**
 * Les Groschen : la monnaie du Courtisan (séparée des pièces du 421, comme les capsules de Coups
 * Fourrés). Monnaie de jeu, sans argent réel. Comptes seulement : le solde vit sur le serveur, qui
 * fait foi (aucun solde ni résultat n'est jamais lu chez le joueur).
 *
 * - Cadeau de connexion : +20 une fois par jour, jour de Bruxelles calculé par l'horloge du SERVEUR.
 * - Mises : prélevées au lancement d'une partie et bloquées (table dm_escrow) ; versées au gagnant
 *   ou remboursées. Au démarrage du serveur, toute mise encore bloquée est remboursée.
 * - Journal de chaque mouvement (dm_ledger) pour l'administration.
 *
 * Routes (/api) : GET /dixmille/wallet (solde, cadeau du jour), GET /admin/groschen (admin).
 */
import express from 'express';
import type { Store, UserRow } from './db';
import { GROSCHEN_DAILY } from '../shared/dixmille/groschen';

const brusselsDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

export interface GroschenApi {
  router: express.Router;
  balance: (userId: string) => number;
  /** Prélève une mise et la bloque. Faux si le solde ne suffit pas. */
  stake: (userId: string, amount: number, ref: string) => boolean;
  /** Verse le pot au gagnant et lève tous les blocages de la partie. */
  payWinner: (ref: string, userId: string | null, pot: number) => void;
  /** Rembourse les mises bloquées (tous, ou seulement ces comptes) ; les autres sont perdues. */
  refund: (ref: string, only?: string[]) => void;
  /** Jour de Bruxelles selon l'horloge du serveur. */
  today: () => string;
}

export function createGroschen(o: { store: Store; userFromToken: (t: unknown) => UserRow | undefined; isAdmin: (u: UserRow | undefined) => boolean; now?: () => number }): GroschenApi {
  const { store } = o;
  const now = o.now ?? Date.now;
  const today = () => brusselsDay(now());
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
      return res.json({ ok: true, balance: store.dmBalance(u.id), giftReady: store.dmGiftReady(u.id, day), day });
    }
    const gift = store.dmDailyGift(u.id, day, GROSCHEN_DAILY, now());
    res.json({ ok: true, balance: store.dmBalance(u.id), gift, day, history: store.dmLedgerOf(u.id, 20) });
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
    payWinner(ref, userId, pot) {
      store.dmEscrowRelease(ref);
      if (userId && pot > 0) store.dmMove(userId, pot, 'gain', ref, now());
    },
    refund(ref, only) {
      for (const e of store.dmEscrowRelease(ref)) if (!only || only.includes(e.user_id)) store.dmMove(e.user_id, e.amount, 'remboursement', ref, now());
    },
  };
}
