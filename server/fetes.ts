/**
 * Saint-Nicolas et fêtes de fin d'année, côté serveur (comptes) :
 *  - POST /api/fetes/advent : ouvre la case du jour du calendrier de l'avent. Le jour est celui du
 *    serveur (Bruxelles) : impossible d'ouvrir la case de demain ou de rattraper une case manquée,
 *    et une seule ouverture par compte et par jour (cases ouvertes gardées dans le profil) ;
 *  - les défis d'événement et l'adversaire spécial sont calculés dans les fins de partie du serveur
 *    (applyGameEnd, applyDixMilleGame, récompense générale de Coups Fourrés) : voir shared/progress/fetes.ts.
 */
import type { NextFunction, Request, Response, Router } from 'express';
import type { Store, UserRow } from './db';
import { today } from '../shared/progress/quests';
import { adventDay, claimAdvent } from '../shared/progress/fetes';

export interface FetesDeps {
  router: Router;
  store: Store;
  auth: (req: Request, res: Response, next: NextFunction) => void;
  userOf: (req: Request) => UserRow;
  fail: (res: Response, status: number, error: string) => void;
  now: () => number;
}

export function createFetes(d: FetesDeps) {
  const { router, store, auth, userOf, fail } = d;
  const day = () => today(new Date(d.now()));

  router.post('/fetes/advent', auth, (req, res) => {
    const u = userOf(req);
    const dd = day();
    if (!adventDay(dd)) return fail(res, 400, 'Pas de case à ouvrir aujourd’hui.');
    const r = claimAdvent(store.profileOf(u), dd);
    if (!r) return fail(res, 409, 'Case du jour déjà ouverte.');
    store.saveProfile(u.id, r.profile);
    res.json({ ok: true, profile: r.profile, d: r.d, coins: r.coins, bag: r.bag, day: dd });
  });

  return { day };
}
