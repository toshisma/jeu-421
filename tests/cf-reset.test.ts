/** Refonte des cartes (0.39) : remise à zéro des collections, une seule fois, avec sauvegarde. */
import { describe, expect, it } from 'vitest';
import { Store } from '../server/db';
import { cfAddCard, cfCollection } from '../server/cards';

describe('Coups Fourrés : remise à zéro des collections (refonte 0.39)', () => {
  it('sauvegarde, vide cartes et decks, garde capsules et légendaires au choix, une seule fois', () => {
    const store = new Store(':memory:');
    store.createUser({ id: 'u1', username: 'Ana', passHash: 'x', recoveryHash: 'y' });
    store.cfPlayer('u1', 1);
    store.cfPlayerSet('u1', { discovered: 1, capsules: 250, shards: 40, boosters: 2, legend_picks: 1, active_deck: 'd1' });
    cfAddCard(store, 'u1', 'pilier', 2);
    store.cfDeckSave({ id: 'd1', user_id: 'u1', name: 'Le Zinc', cards: '{"pilier":2}', created_at: 1, updated_at: 1 });
    // Simule une base d'avant la refonte : la marque n'existe pas encore.
    store.setMeta('cf:reset:v2', '');
    expect(store.cfResetCollectionsV2()).toBe(1);
    const p = store.cfPlayerFind('u1')!;
    expect(p).toMatchObject({ discovered: 0, capsules: 250, shards: 0, boosters: 0, legend_picks: 1, active_deck: null });
    expect(Object.values(cfCollection(store, 'u1')).filter((c) => c.count > 0)).toHaveLength(0);
    expect(store.cfDecks('u1')).toHaveLength(0);
    // Une seule fois : un redémarrage ne remet pas à zéro les nouvelles collections.
    cfAddCard(store, 'u1', 'patron', 1);
    expect(store.cfResetCollectionsV2()).toBe(0);
    expect(cfCollection(store, 'u1').patron.count).toBe(1);
  });

  it('0.40 : un booster offert, une seule fois, à ceux qui ont déjà tout ouvert', () => {
    const store = new Store(':memory:');
    for (const [id, name] of [['u1', 'Ana'], ['u2', 'Bob'], ['u3', 'Cleo']]) { store.createUser({ id, username: name, passHash: 'x', recoveryHash: 'y' }); store.cfPlayer(id, 1); }
    store.cfPlayerSet('u1', { discovered: 1, boosters: 0 }); // a tout ouvert
    store.cfPlayerSet('u2', { discovered: 1, boosters: 2 }); // en a encore : il les ouvrira avec les nouvelles cartes
    store.cfPlayerSet('u3', { discovered: 0, boosters: 0 }); // n'a pas encore découvert le mode
    store.setMeta('cf:gift:v40', '');
    expect(store.cfGiftBoosterV40()).toBe(1);
    expect(store.cfPlayerFind('u1')!.boosters).toBe(1);
    expect(store.cfPlayerFind('u2')!.boosters).toBe(2);
    expect(store.cfPlayerFind('u3')!.boosters).toBe(0);
    expect(store.cfGiftBoosterV40()).toBe(0);
    expect(store.cfPlayerFind('u1')!.boosters).toBe(1);
  });
});
