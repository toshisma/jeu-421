/** Le Courtisan hors catalogue : règles, valeurs des combinaisons, phrases rapides, personnages. */
import type { Lang } from './index';

export type Foreign = Exclude<Lang, 'fr'>;

/** Règles affichées dans le jeu ; `**gras**`, `{target}`, `{daily}`. Le français reste le texte du composant. */
export interface DmRulesText {
  anyTarget: string; intro: string; steps: string[]; scoring: string; groschenTitle: string; groschen: string; tip: string;
}
export const DM_RULES: Record<Foreign, DmRulesText> = {
  en: {
    anyTarget: 'the target score',
    intro: '**The Courtier** is the traditional dice game known as **Farkle** (or Ten Thousand), for 2 to 6 players, with **6 dice**. Be the first to reach **{target}** points.',
    steps: ['On your turn, roll all 6 dice.', '**Tap the scoring dice** to set them aside (at least one). Every die you set aside must score: a 1, a 5, or a combination.', 'Then choose: **Roll again** with the remaining dice to score more, or **Bank** your turn points.', 'A roll with **no scoring dice** is a **Farkle!** You lose your turn points and play passes.', '**Hot dice:** all 6 dice set aside and scoring? You can roll all 6 again and keep building.', 'A combination only counts if its dice come up **in the same roll**.', 'The first player to reach the target score when banking **wins immediately**: the game ends there.'],
    scoring: 'Scoring', groschenTitle: 'Groschen',
    groschen: 'The Courtier’s currency (with a free account): **+{daily} Groschen** on your first visit each day. Play for free, or stake any amount: every player (computers included) stakes the same, and **the winner takes the whole pot**. Leaving a staked game means losing your stake. Game currency only, no real money.',
    tip: 'Tip: with many dice you rarely farkle (1 in 32 with 6 dice); with a single die, 2 in 3. Sometimes it’s better to keep just one 1 and roll more dice.',
  },
  de: {
    anyTarget: 'die Zielpunktzahl',
    intro: '**Der Höfling** ist das traditionelle Würfelspiel **Farkle** (auch Zehntausend), für 2 bis 6 Spieler, mit **6 Würfeln**. Wer zuerst **{target}** Punkte erreicht, gewinnt.',
    steps: ['Wirf in deiner Runde alle 6 Würfel.', '**Tippe die punktenden Würfel an**, um sie beiseitezulegen (mindestens einen). Jeder beiseitegelegte Würfel muss punkten: eine 1, eine 5 oder eine Kombination.', 'Dann entscheide: Mit den übrigen Würfeln **nochmal werfen**, um mehr zu holen, oder die Punkte der Runde **sichern**.', 'Ein Wurf **ohne punktende Würfel** ist ein **Farkle!** Die Punkte der Runde sind weg, der Nächste ist dran.', '**Hot Dice:** Alle 6 Würfel beiseitegelegt und alle punkten? Du darfst alle 6 nochmal werfen und weitersammeln.', 'Eine Kombination zählt nur, wenn ihre Würfel **im selben Wurf** fallen.', 'Wer beim Sichern zuerst die Zielpunktzahl erreicht, **gewinnt sofort**: Das Spiel ist zu Ende.'],
    scoring: 'Punktewertung', groschenTitle: 'Groschen',
    groschen: 'Die Währung des Höflings (mit kostenlosem Konto): **+{daily} Groschen** beim ersten Besuch jeden Tag. Spiel gratis oder setze einen beliebigen Betrag: Alle Spieler (auch Computer) setzen gleich viel, und **der Gewinner bekommt den ganzen Pott**. Wer ein Spiel mit Einsatz verlässt, verliert den Einsatz. Reine Spielwährung, kein echtes Geld.',
    tip: 'Tipp: Mit vielen Würfeln gibt es selten ein Farkle (1 von 32 bei 6 Würfeln), mit einem einzigen 2 von 3. Manchmal ist es besser, nur eine 1 zu behalten und mehr Würfel zu werfen.',
  },
  nl: {
    anyTarget: 'de doelscore',
    intro: '**De Hoveling** is het traditionele dobbelspel **Farkle** (ook Tienduizend), voor 2 tot 6 spelers, met **6 stenen**. Wie als eerste **{target}** punten haalt, wint.',
    steps: ['Gooi in je beurt alle 6 stenen.', '**Tik op de stenen die scoren** om ze apart te leggen (minstens één). Elke apart gelegde steen moet punten geven: een 1, een 5 of een combinatie.', 'Kies dan: **opnieuw gooien** met de overige stenen voor meer punten, of je beurtpunten **vastzetten**.', 'Een worp **zonder scorende stenen** is een **Farkle!** Je verliest je beurtpunten en de volgende is aan de beurt.', '**Hot dice:** alle 6 stenen apart gelegd en allemaal scorend? Je mag alle 6 opnieuw gooien en verder bouwen.', 'Een combinatie telt alleen als de stenen **in dezelfde worp** vallen.', 'Wie bij het vastzetten als eerste de doelscore haalt, **wint meteen**: het spel is afgelopen.'],
    scoring: 'Puntentelling', groschenTitle: 'Groschen',
    groschen: 'De munt van De Hoveling (met een gratis account): **+{daily} Groschen** bij je eerste bezoek van de dag. Speel gratis of zet een bedrag naar keuze in: iedereen (ook computers) zet evenveel in, en **de winnaar krijgt de hele pot**. Wie een spel met inzet verlaat, verliest zijn inzet. Alleen speelgeld, geen echt geld.',
    tip: 'Tip: met veel stenen krijg je zelden een farkle (1 op 32 met 6 stenen), met één steen 2 op 3. Soms is het beter om maar één 1 te houden en meer stenen te gooien.',
  },
};

/** Valeurs des combinaisons (DM_VALUES du moteur) : libellé français → langue. */
export const DM_VALUE_LABELS: Record<Foreign, Record<string, string>> = {
  en: { 'Un 1': 'One 1', 'Un 5': 'One 5', 'Trois 1': 'Three 1s', 'Trois 2': 'Three 2s', 'Trois 3': 'Three 3s', 'Trois 4': 'Three 4s', 'Trois 5': 'Three 5s', 'Trois 6': 'Three 6s', 'Suite 1 à 5': 'Straight 1–5', 'Suite 2 à 6': 'Straight 2–6', 'Grande suite': 'Full straight 1–6' },
  de: { 'Un 1': 'Eine 1', 'Un 5': 'Eine 5', 'Trois 1': 'Drei 1er', 'Trois 2': 'Drei 2er', 'Trois 3': 'Drei 3er', 'Trois 4': 'Drei 4er', 'Trois 5': 'Drei 5er', 'Trois 6': 'Drei 6er', 'Suite 1 à 5': 'Straße 1–5', 'Suite 2 à 6': 'Straße 2–6', 'Grande suite': 'Große Straße 1–6' },
  nl: { 'Un 1': 'Eén 1', 'Un 5': 'Eén 5', 'Trois 1': 'Drie 1-en', 'Trois 2': 'Drie 2-en', 'Trois 3': 'Drie 3-en', 'Trois 4': 'Drie 4-en', 'Trois 5': 'Drie 5-en', 'Trois 6': 'Drie 6-en', 'Suite 1 à 5': 'Straat 1–5', 'Suite 2 à 6': 'Straat 2–6', 'Grande suite': 'Grote straat 1–6' },
};

/** Phrases rapides (liste fermée partagée) : traduites à l'affichage seulement. */
export const PHRASE_LABELS: Record<Foreign, Record<string, string>> = {
  en: { 'Belle main !': 'Nice hand!', 'Bien joué !': 'Well played!', 'Tu paies ta tournée !': 'Next round’s on you!', 'Revanche ?': 'Rematch?', 'Pas de chance…': 'Tough luck…', 'Allez, un 4-2-1 !': 'Come on, a 4-2-1!', 'Je le sens bien.': 'Feeling good about this.', 'Trop fort !': 'Too good!', 'Santé !': 'Cheers!', 'Merci pour la partie !': 'Thanks for the game!' },
  de: { 'Belle main !': 'Schöner Wurf!', 'Bien joué !': 'Gut gespielt!', 'Tu paies ta tournée !': 'Die nächste Runde geht auf dich!', 'Revanche ?': 'Revanche?', 'Pas de chance…': 'Pech gehabt…', 'Allez, un 4-2-1 !': 'Los, eine 4-2-1!', 'Je le sens bien.': 'Ich hab ein gutes Gefühl.', 'Trop fort !': 'Zu stark!', 'Santé !': 'Prost!', 'Merci pour la partie !': 'Danke fürs Spiel!' },
  nl: { 'Belle main !': 'Mooie worp!', 'Bien joué !': 'Goed gespeeld!', 'Tu paies ta tournée !': 'De volgende ronde is van jou!', 'Revanche ?': 'Revanche?', 'Pas de chance…': 'Pech…', 'Allez, un 4-2-1 !': 'Kom op, een 4-2-1!', 'Je le sens bien.': 'Ik heb er een goed gevoel over.', 'Trop fort !': 'Te sterk!', 'Santé !': 'Proost!', 'Merci pour la partie !': 'Bedankt voor het potje!' },
};

/** Personnages (ordinateurs) : ce qui s'en affiche dans Le Courtisan. Le nom reste celui du comptoir. */
type P = { tagline: string; good: string; bad: string };
export const PERSONA_LABELS: Record<Foreign, Record<string, P>> = {
  en: { marcel: { tagline: 'Runs the counter', good: 'Not bad, not bad.', bad: 'Well… we’ll do better.' }, josiane: { tagline: 'Playing since 1962', good: 'I’ll keep that, dear.', bad: 'These dice are loaded…' }, baron: { tagline: 'Cool and calculating', good: 'Adequate.', bad: 'How tiresome.' }, lulu: { tagline: 'Quick and cunning', good: 'That’ll do!', bad: 'Oops.' }, dede: { tagline: 'Always one more', good: 'Works for me!', bad: 'Next time…' }, simone: { tagline: 'Elegant and fearsome', good: 'Perfect.', bad: 'Never mind.' }, gege: { tagline: 'A regular at the bar', good: 'That’ll do.', bad: 'Pfff…' } },
  de: { marcel: { tagline: 'Der Wirt am Tresen', good: 'Nicht schlecht, nicht schlecht.', bad: 'Na ja… das geht besser.' }, josiane: { tagline: 'Spielt seit 1962', good: 'Das behalte ich, mein Kind.', bad: 'Diese Würfel sind gezinkt…' }, baron: { tagline: 'Kühl und berechnend', good: 'Akzeptabel.', bad: 'Wie lästig.' }, lulu: { tagline: 'Schnell und schlau', good: 'Passt!', bad: 'Ups.' }, dede: { tagline: 'Immer noch eine Runde', good: 'Passt mir!', bad: 'Nächstes Mal…' }, simone: { tagline: 'Elegant und gefürchtet', good: 'Perfekt.', bad: 'Macht nichts.' }, gege: { tagline: 'Stammgast an der Bar', good: 'Das reicht.', bad: 'Pfff…' } },
  nl: { marcel: { tagline: 'De baas van de toog', good: 'Niet slecht, niet slecht.', bad: 'Tja… dat kan beter.' }, josiane: { tagline: 'Speelt sinds 1962', good: 'Die houd ik, kind.', bad: 'Deze stenen zijn vals…' }, baron: { tagline: 'Koel en berekenend', good: 'Aanvaardbaar.', bad: 'Wat vervelend.' }, lulu: { tagline: 'Snel en sluw', good: 'Dat lukt!', bad: 'Oeps.' }, dede: { tagline: 'Altijd nog eentje', good: 'Goed voor mij!', bad: 'Volgende keer…' }, simone: { tagline: 'Elegant en gevreesd', good: 'Perfect.', bad: 'Jammer dan.' }, gege: { tagline: 'Vaste klant aan de bar', good: 'Dat is goed.', bad: 'Pfff…' } },
};

/** Le Baron : seul nom d'ordinateur qui a un article français. */
export const BARON: Record<Lang, string> = { fr: 'Le Baron', en: 'The Baron', de: 'Der Baron', nl: 'De Baron' };
