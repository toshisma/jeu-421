/** Annonces Discord automatiques : nouveautés et tournois, jamais en double, rien sans lien configuré. */
import { afterAll, describe, expect, it } from 'vitest';
import { Store } from '../server/db';
import { createDiscordHooks, tournamentEmbed } from '../server/discord-hooks';
import { startServer } from '../server/app';
import { CHANGELOG } from '../shared/changelog';

const HOOK = 'https://discord.com/api/webhooks/1/abc';
const capture = () => { const sent: { url: string; body: { embeds: { title: string; description?: string }[]; allowed_mentions: unknown } }[] = []; return { sent, send: async (url: string, body: unknown) => { sent.push({ url, body: body as never }); } }; };

describe('annonces Discord', () => {
  it('rien sans lien configuré', async () => {
    const c = capture();
    const h = createDiscordHooks({ store: new Store(':memory:'), env: {}, send: c.send });
    expect(await h.news()).toBe(0);
    expect(await h.tournament({ kind: 'bientot', slotId: 's', hour: 21, registered: 0 })).toBe(false);
    expect(c.sent).toHaveLength(0);
  });

  it('nouveautés : la dernière la première fois, puis seulement les nouvelles', async () => {
    const c = capture();
    const store = new Store(':memory:');
    const h = createDiscordHooks({ store, env: { DISCORD_WEBHOOK_ANNONCES: HOOK }, send: c.send });
    expect(await h.news()).toBe(1);
    expect(c.sent[0].body.embeds[0].title).toContain(CHANGELOG[0].version);
    expect(c.sent[0].body.allowed_mentions).toEqual({ parse: [] });
    expect(await h.news()).toBe(0); // redémarrage sans nouvelle version
    store.setMeta('discord:news:last', CHANGELOG[2].version); // deux versions publiées depuis
    expect(await h.news()).toBe(1); // seule celle qui n'avait pas été annoncée part
    expect(c.sent[1].body.embeds[0].title).toContain(CHANGELOG[1].version);
    expect(await h.news()).toBe(0);
    expect(c.sent).toHaveLength(2);
  });

  it('tournois : une seule annonce par étape, pseudos neutralisés', async () => {
    const c = capture();
    const h = createDiscordHooks({ store: new Store(':memory:'), env: { DISCORD_WEBHOOK_TOURNOIS: HOOK }, send: c.send });
    const ev = { kind: 'bientot' as const, slotId: '2026-11-05-21h', hour: 21, registered: 2 };
    expect(await h.tournament(ev)).toBe(true);
    expect(await h.tournament(ev)).toBe(false);
    expect(c.sent[0].body.embeds[0].title).toBe('🏆 Tournoi de 21 h dans 30 minutes');
    expect(tournamentEmbed({ kind: 'fin', slotId: 'x', hour: 11, podium: ['@everyone', 'Lulu'], bags: 3 }).title).toContain('\\@everyone');
  });

  it('lien qui n’est pas un webhook Discord : ignoré', async () => {
    const c = capture();
    const h = createDiscordHooks({ store: new Store(':memory:'), env: { DISCORD_WEBHOOK_TOURNOIS: 'https://exemple.com/x' }, send: c.send });
    expect(await h.tournament({ kind: 'annule', slotId: 'y', hour: 11, players: 2 })).toBe(false);
    expect(c.sent).toHaveLength(0);
  });
});

describe('annonces Discord : horloge des tournois', () => {
  const c = capture();
  let t = Date.parse('2026-11-05T19:31:00Z'); // 20 h 31 à Bruxelles : tournoi de 21 h dans 29 minutes
  let srv: Awaited<ReturnType<typeof startServer>>;
  afterAll(async () => { await srv?.close(); });
  it('annonce 30 minutes avant, puis à l’ouverture du salon', async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', now: () => t, schedTickMs: 0, discordHooks: { env: { DISCORD_WEBHOOK_TOURNOIS: HOOK }, send: c.send } });
    srv.schedTick(); srv.schedTick();
    await new Promise((r) => setTimeout(r, 20));
    expect(c.sent.map((x) => x.body.embeds[0].title)).toEqual(['🏆 Tournoi de 21 h dans 30 minutes']);
    t = Date.parse('2026-11-05T20:00:10Z');
    srv.schedTick();
    await new Promise((r) => setTimeout(r, 20));
    expect(c.sent.map((x) => x.body.embeds[0].title)[1]).toBe('🔔 Le salon du tournoi de 21 h est ouvert');
  });
});
