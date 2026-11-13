/** Série de jours joués (barème, jokers, pause, reprise d'invité, serveur) et rappels par notification. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import {
  SERIE_JOKERS_MAX, capSerieImport, cleanSerie, serieRecord, serieReward, serieView, addDays, type SerieState,
} from '../shared/progress/serie';
import { DAILY_REWARDS, applySerieDay, capGuestImport, newProfile, sanitizeProfile } from '../shared/progress/profile';
import { DICTS } from '../shared/i18n';
import { serieFr } from '../shared/i18n/zones/serie.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { NOTIF_DAILY_CAP, brusselsHourAt, quietAt } from '../server/notifs';
import { nextSlots } from '../shared/scheduled';
import type { RewardContext } from '../shared/progress/profile';

/** Joue chaque jour de la liste (jours absents = manqués). */
function playDays(days: string[], s?: SerieState) {
  const out: { day: string; coins: number; bag: number; n: number; joker: boolean }[] = [];
  for (const d of days) {
    const r = serieRecord(s, d);
    if (!r) continue;
    s = r.state;
    out.push({ day: d, coins: r.reward.coins, bag: r.reward.bag, n: r.n, joker: r.joker });
  }
  return { s: s!, out };
}
const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe('série : barème et règles', () => {
  it('barème bas et croissant, plateau à 4 pièces, sac au 7e jour', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 30].map((n) => serieReward(n))).toEqual([
      { coins: 2, bag: 0 }, { coins: 2, bag: 0 }, { coins: 3, bag: 0 }, { coins: 3, bag: 0 }, { coins: 4, bag: 0 }, { coins: 4, bag: 0 },
      { coins: 0, bag: 1 }, { coins: 4, bag: 0 }, { coins: 4, bag: 0 }, { coins: 4, bag: 0 }, { coins: 0, bag: 1 }, { coins: 4, bag: 0 },
    ]);
    const { out } = playDays(run('2026-11-01', 28));
    const coins = (a: number, b: number) => out.slice(a, b).reduce((t, x) => t + x.coins, 0);
    expect(coins(0, 7)).toBe(18); // première semaine : 18 pièces + 1 sac
    expect(coins(7, 14)).toBe(24); // ensuite : 24 pièces + 1 sac par semaine
    expect(out.filter((x) => x.bag).length).toBe(4);
    // Comparaison : le cadeau du jour seul donne déjà 85 pièces + 1 sac par semaine.
    expect(DAILY_REWARDS.reduce((t, r) => t + r.coins, 0)).toBe(85);
  });

  it('une seule récompense par jour', () => {
    const a = serieRecord(undefined, '2026-11-10')!;
    expect(a.n).toBe(1);
    expect(serieRecord(a.state, '2026-11-10')).toBeNull();
    // Jour « dans le passé » (horloge reculée) : rien à gagner.
    expect(serieRecord(a.state, '2026-11-09')).toBeNull();
  });

  it('jokers : un tous les 7 jours, 2 au plus, protègent tout seuls un jour manqué', () => {
    let { s, out } = playDays(run('2026-11-01', 21));
    expect(out.filter((x) => x.joker).map((x) => x.n)).toEqual([7, 14]);
    expect(s.jokers).toBe(SERIE_JOKERS_MAX); // le 21e jour ne dépasse pas 2
    // Deux jours manqués : couverts par les deux jokers, la série continue au jour 22.
    const r = serieRecord(s, addDays(s.last, 3))!;
    expect(r.n).toBe(22);
    expect(r.state.jokers).toBe(0);
    expect(r.state.saved).toEqual([addDays(s.last, 1), addDays(s.last, 2)]);
    const v = serieView(r.state, r.state.last);
    expect(v.week.filter((c) => c.cell === 'joker')).toHaveLength(2);
    s = r.state;
    // Un jour manqué sans joker : série en pause, record et jokers gardés, on repart au jour 1.
    const v2 = serieView(s, addDays(s.last, 2));
    expect(v2.status).toBe('paused');
    expect(v2.count).toBe(0);
    expect(v2.best).toBe(22);
    const again = serieRecord(s, addDays(s.last, 2))!;
    expect(again.n).toBe(1);
    expect(again.state.best).toBe(22);
  });

  it('trop de jours manqués pour les jokers : pause, les jokers restent en réserve', () => {
    const { s } = playDays(run('2026-11-01', 7)); // 1 joker
    const v = serieView(s, addDays(s.last, 4));
    expect(v.status).toBe('paused');
    expect(v.jokers).toBe(1);
  });

  it('sac de série : une fois par semaine au plus', () => {
    // Profil trafiqué : sac de série touché hier, série au jour 6.
    const s: SerieState = { last: '2026-11-09', count: 6, best: 6, jokers: 0, days: [], saved: [], bagDay: '2026-11-09' };
    expect(serieRecord(s, '2026-11-10')!.reward).toEqual({ coins: 4, bag: 0 });
  });

  it('vue : prochaine récompense, calendrier de la semaine', () => {
    const { s } = playDays(['2026-11-08', '2026-11-09']);
    const v = serieView(s, '2026-11-10');
    expect(v).toMatchObject({ status: 'pending', count: 2, playedToday: false, next: { n: 3, coins: 3, bag: 0, tomorrow: false } });
    expect(v.week.map((c) => c.cell)).toEqual(['vide', 'vide', 'vide', 'vide', 'joue', 'joue', 'aujourdhui']);
    const v2 = serieView(serieRecord(s, '2026-11-10')!.state, '2026-11-10');
    expect(v2).toMatchObject({ status: 'today', count: 3, playedToday: true, next: { n: 4, tomorrow: true } });
    expect(v2.got).toMatchObject({ day: '2026-11-10', n: 3, coins: 3 });
  });

  it('profil : sanitize, pièces et sac crédités, pas d\'XP', () => {
    const p = newProfile();
    const r = applySerieDay(p, '2026-11-10')!;
    expect(r.profile.coins).toBe(2);
    expect(r.profile.xp).toBe(0);
    expect(sanitizeProfile(JSON.parse(JSON.stringify(r.profile))).serie).toEqual(r.profile.serie);
    expect(cleanSerie({ last: 'hier', count: 3 })).toBeUndefined();
    expect(cleanSerie({ last: '2026-11-10', count: 1e9, jokers: 50, days: ['x', '2026-11-10'] })).toMatchObject({ count: 100_000, jokers: 2, days: ['2026-11-10'] });
  });

  it('reprise d\'un invité : une semaine au plus, sans joker, rien dans le futur', () => {
    const fake: SerieState = { last: '2026-11-10', count: 400, best: 900, jokers: 2, days: ['2026-10-01', '2026-11-09', '2026-11-10'], saved: [] };
    expect(capSerieImport(fake, '2026-11-10')).toMatchObject({ count: 7, best: 7, jokers: 0, days: ['2026-11-09', '2026-11-10'], bagDay: '2026-11-10' });
    expect(capSerieImport({ ...fake, last: '2099-01-01' }, '2026-11-10')).toBeUndefined();
    const p = capGuestImport(sanitizeProfile({ ...newProfile(), serie: { ...fake, last: '2000-01-01' } }));
    expect(p.serie?.count).toBeLessThanOrEqual(7);
    expect(p.serie?.jokers).toBe(0);
  });
});

describe('zone serie : traductions', () => {
  const keys = Object.keys(serieFr) as (keyof typeof serieFr)[];
  const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  it('chaque clé existe en en/de/nl, avec les mêmes trous, sans rester en français', () => {
    for (const l of ['en', 'de', 'nl'] as const) for (const k of keys) {
      const t = DICTS[l][k];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t!), `${l}:${k}`).toEqual(holes(serieFr[k]));
      if (serieFr[k].length > 12) expect(t, `${l}:${k}`).not.toBe(serieFr[k]);
    }
  });
  it('messages du serveur traduits', () => {
    for (const l of ['en', 'de', 'nl'] as const) expect(translateServerText(l, 'Réglage inconnu.')).not.toBe('Réglage inconnu.');
  });
});

// --- Serveur ----------------------------------------------------------------------------------------
type Srv = Awaited<ReturnType<typeof startServer>>;
let srv: Srv;
let base = '';
// Mardi 10 novembre 2026, 15 h à Bruxelles (UTC+1).
let clock = Date.parse('2026-11-10T14:00:00Z');
const at = (iso: string) => { clock = Date.parse(iso); };
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 5000, minSoloMs: 0, now: () => clock } });
  base = `http://127.0.0.1:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
const reg = async (username: string, extra: object = {}) => (await api('/register', { username, password: 'motdepasse1', ...extra })).token as string;
const idOf = (name: string) => srv.store.userByName(name)!.id;
const prof = (name: string) => srv.store.profileOf(srv.store.userByName(name)!);
const subscribe = (token: string, n = 1, lang = 'fr') => api('/push/subscribe', { subscription: { endpoint: `https://push.example/${token.slice(0, 8)}-${n}`, keys: { p256dh: 'p', auth: 'a' } }, lang }, token);
const ctx: RewardContext = { mode: 'online', opponents: 1, count421: 0, combos: {}, gestureThrows: 0 };
/** Partie en ligne de 421 terminée (arbitrée par le serveur). */
const onlineGame = (name: string, abandoned = false) => srv.accounts.onlineGameEnd(idOf(name), true, 8, { ...ctx, minutes: 10 }, '2026-11-10', abandoned);
const sentTo = (name: string) => srv.accounts.social.sent.filter((m) => m.userId === idOf(name));

describe('série : le serveur fait foi', () => {
  it('une partie terminée compte le jour (une fois), une partie abandonnée non', async () => {
    await reg('Serge');
    onlineGame('Serge', true);
    expect(prof('Serge').serie).toBeUndefined();
    onlineGame('Serge');
    const p1 = prof('Serge');
    expect(p1.serie).toMatchObject({ last: '2026-11-10', count: 1, got: { day: '2026-11-10', n: 1, coins: 2, bag: 0 } });
    onlineGame('Serge');
    onlineGame('Serge');
    // Deux parties de plus le même jour : pas de nouvelle récompense de série.
    expect(prof('Serge').serie).toEqual(p1.serie);
    expect(srv.accounts.serie.played(idOf('Serge'))).toBeNull();
  });

  it('jour suivant : jour 2 ; profil trafiqué à une date future : aucune récompense', async () => {
    at('2026-11-11T10:00:00Z');
    expect(srv.accounts.serie.played(idOf('Serge'))).toMatchObject({ n: 2, reward: { coins: 2, bag: 0 } });
    // Même jour, même si le profil était remis en arrière : la table serie_days bloque.
    const u = srv.store.userByName('Serge')!;
    srv.store.saveProfile(u.id, { ...srv.store.profileOf(u), serie: undefined });
    expect(srv.accounts.serie.played(u.id)).toBeNull();
  });

  it('concurrence : deux fins de partie simultanées (même deux serveurs) ne paient qu\'une fois', async () => {
    const { createSerie } = await import('../server/serie');
    await reg('Duo');
    at('2026-11-11T11:00:00Z');
    const a = createSerie({ store: srv.store, now: () => clock }), b = createSerie({ store: srv.store, now: () => clock });
    const res = await Promise.all([Promise.resolve().then(() => a.played(idOf('Duo'))), Promise.resolve().then(() => b.played(idOf('Duo'))), Promise.resolve().then(() => srv.accounts.serie.played(idOf('Duo')))]);
    expect(res.filter(Boolean)).toHaveLength(1);
    expect(prof('Duo').coins).toBe(2);
    expect(prof('Duo').serie?.count).toBe(1);
  });

  it('reprise d\'invité à l\'inscription plafonnée', async () => {
    await reg('Invitee', { guestProfile: { ...newProfile(), serie: { last: '2026-11-11', count: 500, best: 500, jokers: 2, days: ['2026-11-11'], saved: [] } } });
    expect(prof('Invitee').serie).toMatchObject({ count: 7, jokers: 0 });
    // Déjà compté aujourd'hui en invité : pas de seconde récompense le même jour.
    expect(srv.accounts.serie.played(idOf('Invitee'))).toBeNull();
  });
});

describe('rappels par notification', () => {
  const T: Record<string, string> = {};
  it('heures calmes : jamais entre 22 h et 9 h à Bruxelles', () => {
    expect(brusselsHourAt(Date.parse('2026-11-10T20:59:00Z'))).toBe(21);
    expect(quietAt(Date.parse('2026-11-10T20:59:00Z'))).toBe(false);
    expect(quietAt(Date.parse('2026-11-10T21:00:00Z'))).toBe(true); // 22 h
    expect(quietAt(Date.parse('2026-11-11T07:59:00Z'))).toBe(true); // 8 h 59
    expect(quietAt(Date.parse('2026-11-11T08:00:00Z'))).toBe(false); // 9 h
    expect(quietAt(Date.parse('2026-07-10T19:30:00Z'))).toBe(false); // été (UTC+2) : 21 h 30
    expect(quietAt(Date.parse('2026-07-10T20:00:00Z'))).toBe(true); // été : 22 h
  });

  it('seulement avec notifications acceptées ; plafond de 2 par jour ; jamais deux fois', async () => {
    at('2026-11-12T14:00:00Z'); // 15 h
    T.Nina = await reg('Nina');
    const n = srv.accounts.social.notifs;
    const msg = { title: 'Happy hour !', body: 'Test' };
    expect(n.notify(idOf('Nina'), 'evenements', 'a', msg)).toBe('no-push');
    await subscribe(T.Nina);
    expect(n.notify(idOf('Nina'), 'evenements', 'a', msg)).toBe('sent');
    expect(n.notify(idOf('Nina'), 'evenements', 'a', msg)).toBe('already');
    expect(n.notify(idOf('Nina'), 'bistrot', 'b', msg)).toBe('sent');
    expect(n.notify(idOf('Nina'), 'tournoi', 'c', msg)).toBe('cap');
    expect(NOTIF_DAILY_CAP).toBe(2);
    expect(sentTo('Nina')).toHaveLength(2);
    // Le lendemain : de nouveau possible, mais jamais le même rappel.
    at('2026-11-13T14:00:00Z');
    expect(n.notify(idOf('Nina'), 'tournoi', 'c', msg)).toBe('sent');
    expect(n.notify(idOf('Nina'), 'evenements', 'a', msg)).toBe('already');
  });

  it('heures calmes et types désactivés dans les Réglages', async () => {
    T.Omar = await reg('Omar');
    await subscribe(T.Omar);
    const n = srv.accounts.social.notifs;
    at('2026-11-13T21:30:00Z'); // 22 h 30
    expect(n.notify(idOf('Omar'), 'serie', 'x', { title: 't', body: 'b' })).toBe('quiet');
    at('2026-11-14T07:30:00Z'); // 8 h 30
    expect(n.notify(idOf('Omar'), 'serie', 'x', { title: 't', body: 'b' })).toBe('quiet');
    at('2026-11-14T09:00:00Z'); // 10 h
    expect((await api('/notifs/prefs', { kind: 'serie', on: false }, T.Omar)).prefs).toMatchObject({ serie: false, bistrot: true, tournoi: true, evenements: true });
    expect((await api('/notifs/prefs', { kind: 'nimporte', on: false }, T.Omar)).code).toBe(400);
    expect(n.notify(idOf('Omar'), 'serie', 'x', { title: 't', body: 'b' })).toBe('off');
    expect((await api('/notifs/prefs', undefined, T.Omar))).toMatchObject({ push: true, prefs: { serie: false } });
    await api('/notifs/prefs', { kind: 'serie', on: true }, T.Omar);
    expect(n.notify(idOf('Omar'), 'serie', 'x', { title: 't', body: 'b' })).toBe('sent');
    expect(sentTo('Omar')).toHaveLength(1);
  });

  it('redémarrage : le marqueur en base empêche un second envoi ; texte dans la langue de l\'appareil', async () => {
    const { createNotifs } = await import('../server/notifs');
    const express = (await import('express')).default;
    const got: { title: string; de?: string }[] = [];
    const again = createNotifs({ store: srv.store, router: express.Router(), auth: (_q, _s, nx) => nx(), userOf: () => srv.store.userByName('Omar')!,
      fail: () => {}, now: () => clock, push: (_u, title, _b, _url, loc) => { got.push({ title, de: loc?.('de').title }); } });
    expect(again.notify(idOf('Omar'), 'serie', 'x', { title: 't', body: 'b' })).toBe('already');
    expect(again.notify(idOf('Omar'), 'serie', 'y', { key: 'ser.n.serieT', bodyKey: 'ser.n.serieB', vars: { n: 5 } })).toBe('sent');
    expect(got).toEqual([{ title: 'Votre série de 5 jours vous attend', de: 'Deine Serie von 5 Tagen wartet' }]);
    again.close();
  });

  it('tournoi : inscrits et « Me prévenir », 10 minutes avant, une seule fois', async () => {
    at('2026-11-14T15:00:00Z'); // 16 h : prochain tournoi à 21 h
    const slot = nextSlots(clock, 2)[0];
    expect(slot.hour).toBe(21);
    for (const u of ['Paul', 'Quentin', 'Rita', 'Sacha']) { T[u] = await reg(u); await subscribe(T[u]); }
    srv.store.schedEnsureSlot(slot.id, slot.startsAt);
    srv.store.schedAddReg(slot.id, idOf('Paul'), 10, clock); // inscrit
    expect((await api('/notifs/tournoi', { slot: slot.id }, T.Quentin)).watched).toEqual([slot.id]); // Me prévenir
    expect((await api('/notifs/tournoi', { slot: 'demain' }, T.Quentin)).code).toBe(404);
    await api('/notifs/tournoi', { slot: slot.id }, T.Sacha);
    await api('/notifs/tournoi', { slot: slot.id, on: false }, T.Sacha); // a changé d'avis
    const n = srv.accounts.social.notifs;
    clock = slot.startsAt - 11 * 60_000;
    n.tourneyTick(clock);
    expect(sentTo('Paul')).toHaveLength(0);
    clock = slot.startsAt - 10 * 60_000;
    n.tourneyTick(clock);
    n.tourneyTick(clock + 60_000);
    for (const u of ['Paul', 'Quentin']) expect(sentTo(u).map((m) => m.title)).toEqual(['Le tournoi de 21\u00a0h commence dans 10\u00a0min']);
    expect(sentTo('Rita')).toHaveLength(0);
    expect(sentTo('Sacha')).toHaveLength(0);
    expect(n.tourneyWarned(idOf('Paul'), slot.id)).toBe(true);
  });

  it('série du soir : vers 19 h, série ≥ 3 et rien joué ce jour-là', async () => {
    for (const u of ['Ugo', 'Vera', 'Wim']) { T[u] = await reg(u); await subscribe(T[u]); }
    const setSerie = (name: string, s: SerieState) => { const u = srv.store.userByName(name)!; srv.store.saveProfile(u.id, { ...srv.store.profileOf(u), serie: s }); };
    setSerie('Ugo', { last: '2026-11-14', count: 4, best: 4, jokers: 0, days: [], saved: [] }); // a joué hier
    setSerie('Vera', { last: '2026-11-15', count: 4, best: 4, jokers: 0, days: [], saved: [] }); // a déjà joué aujourd'hui
    setSerie('Wim', { last: '2026-11-14', count: 2, best: 9, jokers: 0, days: [], saved: [] }); // série trop courte
    const n = srv.accounts.social.notifs;
    at('2026-11-15T16:30:00Z'); // 17 h 30 : trop tôt
    n.serieTick(clock);
    expect(sentTo('Ugo')).toHaveLength(0);
    at('2026-11-15T18:05:00Z'); // 19 h 05
    n.serieTick(clock);
    n.serieTick(clock + 600_000);
    expect(sentTo('Ugo').map((m) => [m.title, m.body])).toEqual([['Votre série de 4 jours vous attend', 'Une partie aujourd’hui, de n’importe quel jeu, suffit pour la prolonger.']]);
    expect(sentTo('Vera')).toHaveLength(0);
    expect(sentTo('Wim')).toHaveLength(0);
  });

  it('bistrot : « X vous a dépassé », au plus une fois par jour et par bistrot', async () => {
    at('2026-11-16T10:00:00Z'); // lundi 11 h
    for (const u of ['Alix', 'Basile', 'Perdant1', 'Perdant2', 'Perdant3', 'Perdant4', 'Perdant5']) T[u] = await reg(u);
    await subscribe(T.Alix); await subscribe(T.Basile);
    const b = (await api('/bistrots', { name: 'Chez Alix' }, T.Alix)).bistrot;
    expect((await api('/bistrots/rejoindre', { code: b.code }, T.Basile)).ok).toBe(true);
    const win = (w: string, l: string) => srv.bistrots.recordGame({ game: '421', players: [{ userId: idOf(w), won: true }, { userId: idOf(l), won: false }] });
    win('Alix', 'Perdant1'); // Alix 3, Basile 0 : pas de notification (Basile n'a pas encore de points)
    expect(sentTo('Basile')).toHaveLength(0);
    win('Basile', 'Perdant2'); // 3 – 3 : égalité, pas dépassée
    expect(sentTo('Alix')).toHaveLength(0);
    win('Basile', 'Perdant3'); // Basile 6 > Alix 3
    expect(sentTo('Alix').map((m) => m.title)).toEqual(['Basile vous a dépassé dans votre bistrot']);
    expect(sentTo('Alix')[0].body).toBe('« Chez Alix » : une partie en ligne pour repasser devant ?');
    win('Alix', 'Perdant4'); win('Alix', 'Perdant5'); // Alix 9 > 6 : Basile prévenu
    expect(sentTo('Basile')).toHaveLength(1);
    win('Basile', 'Perdant1'); win('Basile', 'Perdant2'); // Basile repasse devant : Alix a déjà eu son rappel aujourd'hui
    expect(sentTo('Alix')).toHaveLength(1);
  });
});
