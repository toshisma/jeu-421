/**
 * Annonces automatiques sur le serveur Discord du jeu, par « webhooks » (un lien secret par salon,
 * créé dans Discord : Paramètres du salon → Intégrations → Webhooks).
 *
 *   DISCORD_WEBHOOK_ANNONCES  nouveautés du jeu (journal shared/changelog.ts), postées après chaque mise à jour
 *   DISCORD_WEBHOOK_TOURNOIS  tournois de 11 h et 21 h : 30 minutes avant, ouverture du salon, départ ou annulation, vainqueur ;
 *                             tournoi Coups Fourrés du samedi (20 h 30) : 1 heure avant, ouverture du salon, annulation, vainqueur
 *
 * Sans ces variables, rien n'est envoyé. Chaque annonce est notée en base (table meta) : jamais deux fois,
 * même après un redémarrage du serveur. Un échec d'envoi ne gêne jamais le jeu.
 */
import type { Store } from './db';
import { CHANGELOG, type ChangelogEntry } from '../shared/changelog';
import { SCHED_FEE, SCHED_MIN } from '../shared/scheduled';

const SITE = 'https://421online.com';
const GOLD = 0xf1cc7d, BLUE = 0x2c54c2, GREEN = 0x3fbf8a, RED = 0xc8312b;

type Embed = { title: string; description?: string; url?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[]; footer?: { text: string } };

export interface HookDeps {
  store: Store;
  env?: Record<string, string | undefined>;
  /** Pour les tests : remplace l'envoi réel. */
  send?: (url: string, body: unknown) => Promise<void>;
}

export type TournamentEvent =
  | { kind: 'bientot'; slotId: string; hour: number; registered: number }
  | { kind: 'salon'; slotId: string; hour: number; registered: number; code: string }
  | { kind: 'depart'; slotId: string; hour: number; players: number; prizes: number[] }
  | { kind: 'annule'; slotId: string; hour: number; players: number }
  | { kind: 'fin'; slotId: string; hour: number; podium: string[]; bags: number };

/** Tournoi Coups Fourrés du samedi (salon à 20 h 30, départ à 20 h 40). */
export type CfTournamentEvent =
  | { kind: 'bientot'; id: string; registered: number }
  | { kind: 'salon'; id: string; registered: number }
  | { kind: 'annule'; id: string; players: number }
  | { kind: 'fin'; id: string; players: number; podium: string[]; boosters: number };

/** Texte Discord sans mentions ni mise en forme involontaire (pseudos des joueurs). */
const safe = (s: string) => s.replace(/[\\*_~`|>#@[\]()]/g, (c) => `\\${c}`).slice(0, 40);
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

export function changelogEmbed(e: ChangelogEntry): Embed {
  return {
    title: `🎲 Nouveautés ${e.version} : ${e.title}`,
    url: SITE,
    color: GOLD,
    description: e.items.map((i) => `• ${i}`).join('\n').slice(0, 3800),
    footer: { text: '421online.com · rechargez la page pour en profiter' },
  };
}

export function tournamentEmbed(ev: TournamentEvent): Embed {
  const h = `${ev.hour} h`;
  const link = `${SITE}/?tournois=1`;
  switch (ev.kind) {
    case 'bientot': return {
      title: `🏆 Tournoi de ${h} dans 30 minutes`, url: link, color: BLUE,
      description: `${ev.registered ? `${plural(ev.registered, 'joueur')} déjà ${ev.registered > 1 ? 'inscrits' : 'inscrit'}.` : 'Personne n’est encore inscrit : prenez la première place !'} Il faut au moins ${SCHED_MIN} joueurs.\nInscription : ${SCHED_FEE} pièces, remboursées si le tournoi n’a pas lieu. Jusqu’à 5 sacs de dés pour le vainqueur.\n👉 ${link}`,
    };
    case 'salon': return {
      title: `🔔 Le salon du tournoi de ${h} est ouvert`, url: link, color: BLUE,
      description: `Départ dans 5 minutes, ${plural(ev.registered, 'inscrit')} pour l’instant. Il est encore temps de s’inscrire !\n👉 ${link}`,
    };
    case 'depart': return {
      title: `🎲 C’est parti pour le tournoi de ${h} !`, url: `${SITE}/?tournois=1`, color: GREEN,
      description: `${ev.players} joueurs au départ. À gagner : ${ev.prizes.map((b, i) => `${i === 0 ? '1er' : `${i + 1}e`} ${plural(b, 'sac')}`).join(', ')}.`,
    };
    case 'annule': return {
      title: `Tournoi de ${h} annulé`, color: RED,
      description: `${plural(ev.players, 'joueur')} au départ, il en fallait ${SCHED_MIN}. Tout le monde est remboursé. Rendez-vous au prochain !`,
    };
    case 'fin': return {
      title: `🥇 ${safe(ev.podium[0] ?? '?')} remporte le tournoi de ${h} !`, url: SITE, color: GOLD,
      description: [ev.bags ? `${plural(ev.bags, 'sac')} de dés pour le vainqueur.` : '', ev.podium[1] ? `🥈 ${safe(ev.podium[1])}` : '', ev.podium[2] ? `🥉 ${safe(ev.podium[2])}` : ''].filter(Boolean).join('\n'),
    };
  }
}

const VIOLET = 0x5a3b85;
export function cfTournamentEmbed(ev: CfTournamentEvent): Embed {
  const link = `${SITE}/?cf-tournoi=1`;
  switch (ev.kind) {
    case 'bientot': return {
      title: '🃏 Tournoi Coups Fourrés ce soir à 20 h 30', url: link, color: VIOLET,
      description: `Élimination directe en duels, inscription gratuite. ${ev.registered ? `${plural(ev.registered, 'joueur')} déjà ${ev.registered > 1 ? 'inscrits' : 'inscrit'}.` : 'Personne n’est encore inscrit : prenez la première place !'} Il faut au moins 4 joueurs.\nDes boosters pour le vainqueur, le finaliste et les demi-finalistes.\n👉 ${link}`,
    };
    case 'salon': return {
      title: '🔔 Le salon du tournoi Coups Fourrés est ouvert', url: link, color: VIOLET,
      description: `Départ à 20 h 40, ${plural(ev.registered, 'inscrit')} pour l’instant. Il est encore temps de s’inscrire !\n👉 ${link}`,
    };
    case 'annule': return {
      title: 'Tournoi Coups Fourrés annulé', color: RED,
      description: `${plural(ev.players, 'joueur')} au départ, il en fallait 4. Rendez-vous samedi prochain !`,
    };
    case 'fin': return {
      title: `🥇 ${safe(ev.podium[0] ?? '?')} remporte le tournoi Coups Fourrés !`, url: link, color: GOLD,
      description: [`${ev.players} joueurs au départ.${ev.boosters ? ` ${plural(ev.boosters, 'booster')} pour le vainqueur.` : ''}`, ev.podium[1] ? `🥈 ${safe(ev.podium[1])}` : ''].filter(Boolean).join('\n'),
    };
  }
}

async function realSend(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Discord ${r.status}`);
}

export function createDiscordHooks(d: HookDeps) {
  const env = d.env ?? process.env;
  const send = d.send ?? realSend;
  const hooks = { annonces: env.DISCORD_WEBHOOK_ANNONCES?.trim() || '', tournois: env.DISCORD_WEBHOOK_TOURNOIS?.trim() || '' };
  const post = async (where: keyof typeof hooks, key: string, embeds: Embed[]) => {
    const url = hooks[where];
    if (!url || !/^https:\/\/(discord\.com|discordapp\.com|canary\.discord\.com|ptb\.discord\.com)\/api\/webhooks\//.test(url)) return false;
    if (d.store.getMeta(key)) return false;
    d.store.setMeta(key, String(Date.now())); // noté avant l'envoi : jamais de doublon
    try { await send(url, { username: 'Le comptoir 421', embeds, allowed_mentions: { parse: [] } }); return true; }
    catch (e) { console.warn('[discord] annonce non envoyée', key, e); return false; }
  };

  return {
    enabled: { annonces: !!hooks.annonces, tournois: !!hooks.tournois },
    /** Nouveautés pas encore annoncées (au plus 3 d'un coup ; la toute première fois, seulement la dernière). */
    async news() {
      if (!hooks.annonces || !CHANGELOG.length) return 0;
      const last = d.store.getMeta('discord:news:last');
      let fresh = CHANGELOG;
      if (last) { const i = CHANGELOG.findIndex((e) => e.version === last); fresh = i < 0 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, i); }
      else fresh = CHANGELOG.slice(0, 1);
      d.store.setMeta('discord:news:last', CHANGELOG[0].version);
      let n = 0;
      for (const e of fresh.slice(0, 3).reverse()) if (await post('annonces', `discord:news:${e.version}`, [changelogEmbed(e)])) n++;
      return n;
    },
    tournament(ev: TournamentEvent) {
      return post('tournois', `discord:sched:${ev.slotId}:${ev.kind}`, [tournamentEmbed(ev)]);
    },
    /** Tournoi Coups Fourrés du samedi (même salon Discord que les tournois du 421 classique). */
    cfTournament(ev: CfTournamentEvent) {
      return post('tournois', `discord:cf:${ev.id}:${ev.kind}`, [cfTournamentEmbed(ev)]);
    },
  };
}
