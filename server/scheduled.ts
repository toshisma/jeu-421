/**
 * Tournois programmés (11h et 21h, heure de Bruxelles) : inscriptions payantes, remboursements,
 * gains en sacs de dés. Tout passe par la base (tables sched_slots et sched_regs), dans des
 * transactions : un redémarrage du serveur ne perd ni une inscription ni un remboursement.
 *
 * États d'un rendez-vous : a-venir → salon (H à H+5 min) → en-cours → termine,
 * ou annule (moins de 4 présents, serveur indisponible à l'heure du départ, redémarrage en cours de tournoi).
 * États d'une inscription : inscrit → joue → fini, ou rembourse (absent, annulation, redémarrage).
 * Une désinscription avant l'ouverture du salon efface la ligne (et rembourse).
 */
import type { Router } from 'express';
import type { Store, UserRow } from './db';
import { BAGS_MAX } from '../shared/progress/profile';
import {
  SCHED_FEE, SCHED_LOBBY_MS, SCHED_MAX, SCHED_MIN, SCHED_REMIND_MS, bagPrizes, hourLabel, nextSlots,
  type LastResult, type ProgrammeView, type SlotStatus, type SlotView,
} from '../shared/scheduled';

export interface SchedDeps {
  store: Store;
  router: Router;
  now: () => number;
  userFromToken: (token: unknown) => UserRow | undefined;
  push: (userId: string, title: string, body: string, url?: string) => void;
  /** Profil modifié (pièces, sacs) : à transmettre au joueur s'il est connecté. */
  onProfile: (userId: string) => void;
  /** Salon en mémoire pour un rendez-vous (code, présents), ou null. */
  live: (slotId: string) => { code: string; status: SlotStatus } | null;
  /** Tournoi programmé en cours (ou tout juste fini) où joue ce compte. */
  mine: (userId: string) => { code: string; hour: number; status: SlotStatus } | null;
}

const hourOf = (slotId: string) => Number(slotId.slice(11, 13));
export const slotLabel = (slotId: string) => `tournoi de ${hourLabel(hourOf(slotId))}`;

export function createScheduled(d: SchedDeps) {
  const { store } = d;
  const fail = (msg: string) => { throw Object.assign(new Error(msg), { user: true }); };
  const credit = (userId: string, delta: number) => {
    const u = store.userById(userId);
    if (!u) return false;
    const p = store.profileOf(u);
    if (p.coins + delta < 0) return false;
    store.saveProfile(userId, { ...p, coins: p.coins + delta });
    return true;
  };

  /** Rendez-vous ouvert aux inscriptions (un des deux prochains, départ pas encore passé). */
  function openSlot(slotId: string, now = d.now()) {
    const s = nextSlots(now, 2).find((x) => x.id === slotId);
    if (!s) return null;
    store.schedEnsureSlot(s.id, s.startsAt);
    return { ...s, row: store.schedSlot(s.id)! };
  }

  /** Inscription payante (10 pièces), transactionnelle. Renvoie un message d'erreur, ou null. */
  function register(userId: string, slotId: string): string | null {
    const now = d.now();
    const s = openSlot(slotId, now);
    if (!s) return 'Ce tournoi n’est plus ouvert aux inscriptions.';
    if (!['a-venir', 'salon'].includes(s.row.status) || now >= s.startsAt + SCHED_LOBBY_MS) return 'Les inscriptions sont closes.';
    try {
      store.tx(() => {
        const r = store.schedReg(slotId, userId);
        if (r && r.status !== 'rembourse') fail('Vous êtes déjà inscrit à ce tournoi.');
        if (store.schedCount(slotId) >= SCHED_MAX) fail(`Le tournoi est complet (${SCHED_MAX} joueurs).`);
        if (!credit(userId, -SCHED_FEE)) fail(`Il faut ${SCHED_FEE} pièces pour s’inscrire.`);
        if (r) store.schedDeleteReg(slotId, userId);
        store.schedAddReg(slotId, userId, SCHED_FEE, now);
      });
    } catch (e) {
      if ((e as { user?: boolean }).user) return (e as Error).message;
      throw e;
    }
    d.onProfile(userId);
    return null;
  }

  /** Désinscription avant l'ouverture du salon : remboursement intégral. */
  function unregister(userId: string, slotId: string): string | null {
    const now = d.now();
    const row = store.schedSlot(slotId);
    const r = store.schedReg(slotId, userId);
    if (!row || !r || r.status !== 'inscrit') return 'Vous n’êtes pas inscrit à ce tournoi.';
    if (row.status !== 'a-venir' || now >= row.starts_at) return 'Le salon est ouvert : la désinscription n’est plus possible.';
    store.tx(() => { credit(userId, r.paid); store.schedDeleteReg(slotId, userId); });
    d.onProfile(userId);
    return null;
  }

  /** Remboursement d'une inscription (absent, annulation, redémarrage). */
  function refund(slotId: string, userId: string, reason: string, notify = true) {
    let done = false;
    store.tx(() => {
      const r = store.schedReg(slotId, userId);
      if (!r || !['inscrit', 'joue'].includes(r.status)) return;
      credit(userId, r.paid);
      store.schedSetReg(slotId, userId, { status: 'rembourse', reason, seen: 0 });
      done = true;
    });
    if (!done) return;
    d.onProfile(userId);
    if (notify) d.push(userId, 'Tournoi remboursé', `${reason} Vos ${SCHED_FEE} pièces vous sont rendues.`, '/?tournois=1');
  }

  /** Annule un rendez-vous et rembourse tous ses inscrits. */
  function cancel(slotId: string, reason: string, players: number | null = null) {
    for (const r of store.schedRegs(slotId)) refund(slotId, r.user_id, reason);
    store.schedSetSlot(slotId, { status: 'annule', reason, players });
  }

  /** Comptes inscrits (payés) à un rendez-vous. */
  const registered = (slotId: string) => store.schedRegs(slotId, 'inscrit').map((r) => r.user_id);

  /** Départ : les présents jouent, les absents sont remboursés. Renvoie les comptes au départ. */
  function begin(slotId: string, present: string[]): { ok: true; players: string[] } | { ok: false; reason: string } {
    const regs = registered(slotId);
    const here = regs.filter((u) => present.includes(u));
    for (const u of regs) if (!here.includes(u)) refund(slotId, u, `Vous n’étiez pas dans le salon au départ du ${slotLabel(slotId)}.`);
    if (here.length < SCHED_MIN) {
      const reason = `Le ${slotLabel(slotId)} est annulé : ${here.length} joueur${here.length > 1 ? 's' : ''} présent${here.length > 1 ? 's' : ''}, il en faut au moins ${SCHED_MIN}.`;
      cancel(slotId, reason, here.length);
      return { ok: false, reason };
    }
    store.tx(() => {
      for (const u of here) store.schedSetReg(slotId, u, { status: 'joue' });
      store.schedSetSlot(slotId, { status: 'en-cours', players: here.length });
    });
    return { ok: true, players: here };
  }

  /** Fin : places et sacs de dés (le contenu des sacs reste du pur hasard, à l'ouverture). */
  function finish(slotId: string, standings: string[]): number[] {
    const row = store.schedSlot(slotId);
    const bags = bagPrizes(row?.players ?? standings.length);
    store.tx(() => {
      standings.forEach((userId, place) => {
        const n = bags[place] ?? 0;
        store.schedSetReg(slotId, userId, { status: 'fini', place, bags: n, seen: 0 });
        if (n > 0) {
          const u = store.userById(userId);
          if (u) { const p = store.profileOf(u); store.saveProfile(userId, { ...p, bags: Math.min(BAGS_MAX, (p.bags ?? 0) + n) }); }
        }
      });
      store.schedSetSlot(slotId, { status: 'termine' });
    });
    for (const u of standings) d.onProfile(u);
    return bags;
  }

  const markSlot = (slotId: string, status: SlotStatus) => store.schedSetSlot(slotId, { status });

  /**
   * Démarrage du serveur : un tournoi en cours a été interrompu → tout le monde est remboursé.
   * (Les salons encore ouverts sont recréés par l'horloge ; les départs manqués sont annulés.)
   */
  function recover() {
    for (const s of store.schedSlotsByStatus(['en-cours']))
      cancel(s.id, `Le ${slotLabel(s.id)} a été interrompu par une mise à jour du serveur.`, s.players);
  }

  /** Rappels : 5 minutes avant l'ouverture, puis à l'ouverture du salon. */
  function remind(slotId: string, startsAt: number, now: number) {
    const row = store.schedSlot(slotId);
    if (!row) return;
    const label = hourLabel(hourOf(slotId));
    if (row.reminded < 1 && now >= startsAt - SCHED_REMIND_MS && now < startsAt) {
      store.schedSetSlot(slotId, { reminded: 1 });
      for (const u of registered(slotId)) d.push(u, `Tournoi de ${label} dans 5 minutes`, 'Le salon ouvre bientôt : soyez là pour le départ, 5 minutes après l’ouverture.', '/?tournois=1');
    }
    if (row.reminded < 2 && now >= startsAt && now < startsAt + SCHED_LOBBY_MS) {
      store.schedSetSlot(slotId, { reminded: 2 });
      for (const u of registered(slotId)) d.push(u, `Le salon du tournoi de ${label} est ouvert`, 'Rejoignez-le maintenant : le tournoi commence dans 5 minutes.', '/?tournois=1');
    }
  }

  function lastResult(userId: string): LastResult | null {
    const r = store.schedLastResult(userId);
    if (!r) return null;
    const slot = store.schedSlot(r.slot_id);
    return {
      slot: r.slot_id, hour: hourOf(r.slot_id), status: r.status === 'fini' ? 'joue' : slot?.status === 'annule' ? 'annule' : 'rembourse',
      reason: r.reason, place: r.place, bags: r.bags, refunded: r.status === 'rembourse' ? r.paid : 0, players: slot?.players ?? null,
    };
  }

  function programme(userId: string | undefined): ProgrammeView {
    const now = d.now();
    const slots: SlotView[] = nextSlots(now, 2).map((s) => {
      const row = store.schedSlot(s.id);
      const live = d.live(s.id);
      const reg = userId ? store.schedReg(s.id, userId) : undefined;
      const status: SlotStatus = live?.status ?? (row?.status as SlotStatus | undefined) ?? 'a-venir';
      const isReg = !!reg && ['inscrit', 'joue', 'fini'].includes(reg.status);
      return {
        id: s.id, hour: s.hour, startsAt: s.startsAt, beginsAt: s.startsAt + SCHED_LOBBY_MS, status, count: store.schedCount(s.id), registered: isReg,
        code: live && isReg ? live.code : null,
      };
    });
    return { now, fee: SCHED_FEE, min: SCHED_MIN, max: SCHED_MAX, lobbyMs: SCHED_LOBBY_MS, slots, last: userId ? lastResult(userId) : null, playing: userId ? d.mine(userId) : null };
  }

  // --- API ------------------------------------------------------------------------------------
  const bearer = (h: unknown) => (typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : '');
  d.router.get('/tournois/programme', (req, res) => {
    const u = d.userFromToken(bearer(req.headers.authorization));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...programme(u?.id) });
  });
  const withUser = (fn: (u: UserRow, slot: string) => string | null) => (req: { headers: { authorization?: string }; body?: { slot?: unknown } }, res: { status: (n: number) => { json: (b: object) => void }; json: (b: object) => void }) => {
    const u = d.userFromToken(bearer(req.headers.authorization));
    if (!u) return res.status(401).json({ ok: false, error: 'Les tournois programmés demandent un compte (gratuit) : vos pièces y sont gardées.' });
    const slot = typeof req.body?.slot === 'string' ? req.body.slot.slice(0, 20) : '';
    const err = fn(u, slot);
    if (err) return res.status(400).json({ ok: false, error: err });
    res.json({ ok: true, ...programme(u.id), profile: store.profileOf(store.userById(u.id)!) });
  };
  d.router.post('/tournois/inscription', withUser((u, slot) => register(u.id, slot)));
  d.router.post('/tournois/desinscription', withUser((u, slot) => unregister(u.id, slot)));
  d.router.post('/tournois/vu', withUser((u, slot) => { if (store.schedReg(slot, u.id)) store.schedSetReg(slot, u.id, { seen: 1 }); return null; }));

  return { register, unregister, refund, cancel, begin, finish, recover, remind, registered, programme, markSlot, lastResult };
}
