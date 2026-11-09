/** Traductions du 421 : messages du serveur et du moteur, combinaisons, clés et composés. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translateServerText } from '../shared/i18n/server-texts';
import { comboIn, ordinalIn } from '../shared/i18n/zones/jeu421-server';
import { g421Fr } from '../shared/i18n/zones/jeu421.fr';
import { DICTS } from '../shared/i18n';
import { COMBO_SAMPLES } from './i18n-jeu421.samples';

const FOREIGN = ['en', 'de', 'nl'] as const;
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const sample = (t: string) => t.replace(/\$\{[^}]*\}/g, (m) => (/(stake|have|pot|MAX|FEE|MIN|hour|length|\bn\b|taken|QUICK|share|place|finishPos|count|bags|missing)/i.test(m) ? '7' : 'Xy'));

function harvest(src: string): string[] {
  const out: string[] = [];
  for (const re of [/error: '([^']+)'/g, /error: `([^`]+)`/g, /error: "([^"]+)"/g, /notice\([^,]+, `([^`]+)`/g, /notice\([^,]+, '([^']+)'/g, /tNotice\(\w+, `([^`]+)`/g, /tNotice\(\w+, '([^']+)'/g, /return '([^']+)'/g, /return `([^`]+)`/g, /fail\(`([^`]+)`/g, /fail\('([^']+)'/g])
    for (const m of src.matchAll(re)) out.push(sample(m[1]));
  return out.filter((t) => /[a-zà-ÿ]{2} /.test(t) && !t.includes('${') && !t.includes('\\') && !t.startsWith('Xy ?') && !/^[a-z-]+$/.test(t) && !/^(SELECT|UPDATE|INSERT|DM:)/i.test(t) && t !== 'Xy. Bonne chance !' && t !== 'Xy Xy devient l\'hôte.');
}

describe('messages du 421', () => {
  const files = ['server/app.ts', 'server/scheduled.ts'];
  it('chaque message serveur se traduit dans chaque langue', () => {
    const texts = files.flatMap((f) => harvest(read(f)));
    expect(texts.length).toBeGreaterThan(50);
    const missing: string[] = [];
    for (const l of FOREIGN) for (const t of texts) if (translateServerText(l, t) === t) missing.push(`${l}: ${t}`);
    expect(missing).toEqual([]);
  });
  it('journal du moteur', () => {
    const lines = [
      'La charge commence : 21 jetons dans le pot.', 'La partie commence.', 'Manche 3 : meilleure combinaison pour Sam (Brelan de 5).',
      'Encore égalité entre Sam, Léa : nouveau barrage pour savoir qui donne !', 'Égalité pour la dernière place entre Sam, Léa : barrage à la figure !',
      'Égalité pour la meilleure combinaison (Trois as) entre Sam, Léa : barrage à l’addition pour savoir qui donne !',
      'Sam prend 1 jeton au pot (6-1-1 (deux as) de Léa).', 'Léa donne 3 jetons à Sam (Suite 6-5-4).',
      "Sam n'a plus de jetons et sort de la partie.", 'Le pot est vide : place à la décharge !',
      'Limite de 40 manches atteinte : classement au nombre de jetons restants.', 'Partie terminée : Sam a perdu. Bravo à Léa et Le Baron !',
      'Partie terminée : égalité parfaite entre Sam et Léa !', 'Partie terminée : victoire de Léa !',
      'Égalité parfaite entre Sam, Léa : tirage au sort du serveur, Léa passe devant.',
      "La partie est terminée", "Ce n'est pas votre tour", 'Plus aucun lancer disponible', 'Sélection de dés invalide', 'Sélectionnez au moins un dé à relancer', 'Lancez les dés au moins une fois',
      '2e place sur 4', 'Victoire',
    ];
    for (const l of FOREIGN) for (const t of lines) expect(translateServerText(l, t), `${l}: ${t}`).not.toBe(t);
    expect(translateServerText('en', 'Partie terminée : Sam a perdu. Bravo à Léa et Le Baron !')).toBe('Game over: Sam lost. Congrats to Léa and The Baron!');
    expect(translateServerText('en', 'Léa donne 1 jeton à Sam (Brelan de 5).')).toBe('Léa gives 1 token to Sam (Three 5s).');
    expect(translateServerText('de', 'Sam prend 3 jetons au pot (Suite 6-5-4 de Léa).')).toBe('Sam nimmt 3 Jetons aus dem Pott (Straße 6-5-4 von Léa).');
    expect(translateServerText('nl', "L'hôte Sam a quitté la table. Léa devient l'hôte.")).toContain('gastheer');
    expect(translateServerText('fr', 'Sam a rejoint le salon.')).toBe('Sam a rejoint le salon.');
  });
  it('messages composés (ordinateurs, tournoi programmé, remboursement)', () => {
    for (const l of FOREIGN) {
      for (const t of ['Un ordinateur complète la table : un joueur qui arrive avant le départ prend la place d’un ordinateur.', '3 ordinateurs complètent la table : un joueur qui arrive avant le départ prend la place d’un ordinateur.', 'Sam remporte le tournoi de 21 h et 3 sacs de dés !', 'Sam remporte le tournoi !', 'Sam remporte le tournoi et 40 pièces !', 'Tour 1 : 4 tables. Bonne chance !', 'La finale commence. Bonne chance !', 'Tournoi de Sam', 'Tournoi de 21 h'])
        expect(translateServerText(l, t), `${l}: ${t}`).not.toBe(t);
    }
    expect(translateServerText('en', 'Départ avec 5 joueurs. À gagner : 1er 3 sacs, 2e 1 sac.')).toBe('Starting with 5 players. Prizes: 1st 3 dice bags, 2nd 1 dice bag.');
    expect(translateServerText('en', 'Sam finit 1er et empoche 40 pièces de la cagnotte.')).toBe('Sam finishes 1st and pockets 40 coins from the pot.');
    expect(translateServerText('en', 'Le tournoi est complet (16 joueurs).')).toBe('The tournament is full (16 players).');
    expect(translateServerText('de', 'Sam remporte le tournoi de 21 h et 1 sac de dés !')).toBe('Sam gewinnt das 21-Uhr-Turnier und 1 Würfelbeutel!');
  });
  it('combinaisons et places', () => {
    for (const l of FOREIGN) for (const [fr] of COMBO_SAMPLES) expect(comboIn(l, fr).length).toBeGreaterThan(0);
    expect(comboIn('en', 'Brelan de 6')).toBe('Three 6s');
    expect(comboIn('de', '6-1-1 (deux as)')).toBe('6-1-1 (zwei Asse)');
    expect(comboIn('nl', 'Suite 3-2-1')).toBe('Straat 3-2-1');
    expect(comboIn('en', 'Nénette')).toBe('Nénette');
    expect(comboIn('fr', 'Nénette')).toBe('Nénette');
    expect(ordinalIn('en', 2)).toBe('2nd');
    expect(ordinalIn('en', 12)).toBe('12th');
    expect(ordinalIn('de', 3)).toBe('3.');
  });
  it('toutes les clés du 421 existent en en, de, nl', () => {
    for (const l of FOREIGN) for (const k of Object.keys(g421Fr)) expect(DICTS[l][k as keyof typeof g421Fr], `${l}:${k}`).toBeTruthy();
  });
});
