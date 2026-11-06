/**
 * Coups Fourrés : « l'énigme du jour » côté serveur (comptes seulement ; les invités jouent sur
 * l'appareil, sans classement ni récompense).
 *
 * Le serveur fait foi : il reconstruit l'énigme du jour (heure de Bruxelles), rejoue les actions
 * envoyées avec le moteur, calcule le score lui-même, n'accepte qu'une validation par jour et par
 * compte, et crédite la petite récompense en capsules.
 *
 * Routes (préfixe /api) : GET /cf/enigme, POST /cf/enigme.
 */
import type { NextFunction, Request, Response, Router } from 'express';
import type { Store, UserRow } from './db';
import { ENIGME_CAPSULES, ENIGME_MAX_ACTIONS, dailyPuzzle, enigmeDay, enigmeStreak, replayPuzzle } from '../shared/cards/puzzles';
import type { CfAction } from '../shared/cards/engine';

/** Validation de l'énigme de la veille acceptée encore ce temps après minuit (énigme commencée avant). */
export const ENIGME_GRACE_MS = 30 * 60_000;

export interface CfEnigmeDeps {
  store: Store;
  now: () => number;
  router?: Router;
  auth?: (req: Request, res: Response, next: NextFunction) => void;
  userOf?: (req: Request) => UserRow;
  fail?: (res: Response, status: number, error: string) => void;
}

export interface CfEnigmeBoard {
  day: string;
  top: { rank: number; username: string; score: number; cards: number }[];
  total: number;
  best: number;
  mine: { score: number; best: number; cards: number; capsules: number; actions: CfAction[]; rank: number; total: number } | null;
  streak: number;
}

export function createCfEnigme(d: CfEnigmeDeps) {
  const { store } = d;
  const today = () => enigmeDay(d.now());

  function board(userId: string, day = today()): CfEnigmeBoard {
    const row = store.cfEnigmeOf(day, userId);
    const rank = row ? store.cfEnigmeRank(day, userId) : null;
    let actions: CfAction[] = [];
    if (row) { try { actions = JSON.parse(row.actions); } catch { /* */ } }
    return {
      day,
      top: store.cfEnigmeTop(day, 20).map((r, i) => ({ rank: i + 1, username: r.username, score: r.score, cards: r.cards })),
      total: store.cfEnigmeCount(day),
      best: dailyPuzzle(day).best,
      mine: row && rank ? { score: row.score, best: row.best, cards: row.cards, capsules: row.capsules, actions, ...rank } : null,
      streak: enigmeStreak(store.cfEnigmeDays(userId), today()),
    };
  }

  /** Valide la réponse du jour (une fois par jour) : score recalculé ici, récompense en capsules. */
  function submit(userId: string, rawDay: unknown, actions: unknown): { error: string; status: number } | (CfEnigmeBoard & { score: number; capsules: number }) {
    const t = d.now();
    const day = today();
    // Énigme commencée juste avant minuit : celle de la veille reste acceptée un court moment.
    const target = rawDay === enigmeDay(t - ENIGME_GRACE_MS) ? (rawDay as string) : day;
    if (rawDay !== undefined && rawDay !== target) return { error: 'L’énigme a changé : une nouvelle énigme vous attend.', status: 409 };
    if (!Array.isArray(actions) || actions.length > ENIGME_MAX_ACTIONS) return { error: 'Réponse invalide.', status: 400 };
    if (store.cfEnigmeOf(target, userId)) return { error: 'Vous avez déjà validé l’énigme du jour. Revenez demain !', status: 409 };
    const p = dailyPuzzle(target);
    const r = replayPuzzle(p, actions);
    if (!r.ok) return { error: r.error ?? 'Réponse invalide.', status: 400 };
    const capsules = r.score >= p.best ? ENIGME_CAPSULES.best : ENIGME_CAPSULES.played;
    const ok = store.cfTx(() => {
      if (!store.cfEnigmeAdd({ day: target, user_id: userId, score: r.score, best: p.best, cards: r.cards, capsules, actions: JSON.stringify(actions), created_at: t })) return false;
      const pl = store.cfPlayer(userId, t);
      store.cfPlayerSet(userId, { capsules: pl.capsules + capsules });
      return true;
    });
    if (!ok) return { error: 'Vous avez déjà validé l’énigme du jour. Revenez demain !', status: 409 };
    return { ...board(userId, target), score: r.score, capsules };
  }

  if (d.router && d.auth && d.userOf && d.fail) {
    const { router, auth, userOf, fail } = d;
    router.get('/cf/enigme', auth, (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...board(userOf(req).id) });
    });
    router.post('/cf/enigme', auth, (req, res) => {
      const out = submit(userOf(req).id, req.body?.day, req.body?.actions);
      if ('error' in out) return fail(res, out.status, out.error);
      res.json({ ok: true, ...out });
    });
  }
  return { board, submit };
}
