/**
 * 421 : textes du moteur (journal, combinaisons, erreurs) et messages de server/app.ts + server/scheduled.ts.
 * Ils partent en français (table mixte) ; chaque navigateur les traduit ici. tests/i18n-jeu421.test.ts vérifie
 * que chaque message est couvert. Marques dans les modèles : $1 brut, $c1 combinaison, $o1 place (1er → 1st), $h1 barrage, $r1 texte du périmètre, $p1 liste de gains,
 * $t1 jetons (« 3 tokens »), $m1 pièces, $b1 sacs de dés, $l1 liste « A et B ».
 */
import type { Lang } from '../index';
import { BARON } from '../courtisan';

type Foreign = Exclude<Lang, 'fr'>;
type T = Record<Foreign, string>;

const AND: Record<Foreign, string> = { en: 'and', de: 'und', nl: 'en' };

/** Libellé de combinaison (shared/combos.ts) dans la langue voulue. La Nénette garde son nom partout. */
export function comboIn(lang: Lang, label: string): string {
  if (lang === 'fr') return label;
  const T: Record<string, T> = {
    'Trois as': { en: 'Three aces', de: 'Drei Asse', nl: 'Drie azen' },
  };
  if (T[label]) return T[label][lang];
  let m: RegExpExecArray | null;
  if ((m = /^(\d)-1-1 \(deux as\)$/.exec(label))) return `${m[1]}-1-1 (${{ en: 'two aces', de: 'zwei Asse', nl: 'twee azen' }[lang]})`;
  if ((m = /^Brelan de (\d)$/.exec(label))) return { en: `Three ${m[1]}s`, de: `Drei ${m[1]}er`, nl: `Drie ${m[1]}-en` }[lang];
  if ((m = /^Suite (\d-\d-\d)$/.exec(label))) return `${{ en: 'Straight', de: 'Straße', nl: 'Straat' }[lang]} ${m[1]}`;
  if ((m = /^total (\d+)$/.exec(label))) return `${{ en: 'total', de: 'Summe', nl: 'totaal' }[lang]} ${m[1]}`;
  return label;
}

/** Place dans un classement (1 = premier) : « 1er », « 1st », « 1. », « 1e ». */
export function ordinalIn(lang: Lang, n: number): string {
  if (lang === 'fr') return n === 1 ? '1er' : `${n}e`;
  if (lang === 'de') return `${n}.`;
  if (lang === 'nl') return `${n}e`;
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const count = (lang: Foreign, n: string, words: T, sg: T) => `${n} ${Number(n) === 1 ? sg[lang] : words[lang]}`;
const TOKENS: T = { en: 'tokens', de: 'Jetons', nl: 'fiches' }, TOKEN: T = { en: 'token', de: 'Jeton', nl: 'fiche' };
const COINS: T = { en: 'coins', de: 'Münzen', nl: 'munten' }, COIN: T = { en: 'coin', de: 'Münze', nl: 'munt' };
const BAGS: T = { en: 'dice bags', de: 'Würfelbeutel', nl: 'dobbelzakjes' }, BAG: T = { en: 'dice bag', de: 'Würfelbeutel', nl: 'dobbelzakje' };

const N = '(.+)';
const HOW = '(à la figure|à l’addition)';

/** « à la figure » / « à l’addition » (barrages). */
const HOW_LABEL: Record<string, T> = {
  'à la figure': { en: 'by hand', de: 'nach Wurf', nl: 'op worp' },
  'à l’addition': { en: 'by total', de: 'nach Summe', nl: 'op totaal' },
};

const RULES: [RegExp, T][] = [
  // --- Journal du moteur ---------------------------------------------------------------------
  [/^La charge commence : (\d+) jetons dans le pot\.$/, { en: 'Loading begins: $t1 in the pot.', de: 'Das Aufladen beginnt: $t1 im Pott.', nl: 'Het laden begint: $t1 in de pot.' }],
  [/^La partie commence\.$/, { en: 'The game begins.', de: 'Das Spiel beginnt.', nl: 'Het spel begint.' }],
  [/^La partie est terminée$/, { en: 'The game is over', de: 'Das Spiel ist beendet', nl: 'Het spel is afgelopen' }],
  [/^Ce n'est pas votre tour$/, { en: 'It’s not your turn', de: 'Du bist nicht dran', nl: 'Je bent niet aan de beurt' }],
  [/^Plus aucun lancer disponible$/, { en: 'No rolls left', de: 'Keine Würfe mehr', nl: 'Geen worpen meer' }],
  [/^Sélection de dés invalide$/, { en: 'Invalid dice selection', de: 'Ungültige Würfelauswahl', nl: 'Ongeldige selectie' }],
  [/^Sélectionnez au moins un dé à relancer$/, { en: 'Select at least one die to reroll', de: 'Wähle mindestens einen Würfel zum Nachwürfeln', nl: 'Kies minstens één steen om opnieuw te gooien' }],
  [/^Lancez les dés au moins une fois$/, { en: 'Roll the dice at least once', de: 'Würfle mindestens einmal', nl: 'Gooi minstens één keer' }],
  [/^Manche (\d+) : meilleure combinaison pour (.+) \((.+)\)\.$/, { en: 'Round $1: best hand for $2 ($c3).', de: 'Runde $1: beste Kombination für $2 ($c3).', nl: 'Ronde $1: beste combinatie voor $2 ($c3).' }],
  [new RegExp(`^Encore égalité entre ${N} : nouveau barrage pour savoir qui donne !$`), { en: 'Still tied between $1: another tiebreak to decide who gives!', de: 'Wieder Gleichstand zwischen $1: neues Stechen, wer gibt!', nl: 'Weer gelijk tussen $1: nieuwe barrage om te bepalen wie geeft!' }],
  [new RegExp(`^Égalité pour la dernière place entre ${N} : barrage ${HOW} !$`), { en: 'Tie for last place between $1: tiebreak $h2!', de: 'Gleichstand um den letzten Platz zwischen $1: Stechen $h2!', nl: 'Gelijkspel om de laatste plaats tussen $1: barrage $h2!' }],
  [new RegExp(`^Égalité pour la meilleure combinaison \\((.+)\\) entre ${N} : barrage ${HOW} pour savoir qui donne !$`), { en: 'Tie for best hand ($c1) between $2: tiebreak $h3 to decide who gives!', de: 'Gleichstand um die beste Kombination ($c1) zwischen $2: Stechen $h3, wer gibt!', nl: 'Gelijkspel om de beste combinatie ($c1) tussen $2: barrage $h3 om te bepalen wie geeft!' }],
  [new RegExp(`^${N} prend (\\d+) jetons? au pot \\((.+) de ${N}\\)\\.$`), { en: '$1 takes $t2 from the pot ($c3 by $4).', de: '$1 nimmt $t2 aus dem Pott ($c3 von $4).', nl: '$1 pakt $t2 uit de pot ($c3 van $4).' }],
  [new RegExp(`^${N} donne (\\d+) jetons? à ${N} \\((.+)\\)\\.$`), { en: '$1 gives $t2 to $3 ($c4).', de: '$1 gibt $3 $t2 ($c4).', nl: '$1 geeft $t2 aan $3 ($c4).' }],
  [new RegExp(`^${N} n'a plus de jetons et sort de la partie\\.$`), { en: '$1 has no tokens left and is out.', de: '$1 hat keine Jetons mehr und ist raus.', nl: '$1 heeft geen fiches meer en is uit het spel.' }],
  [/^Le pot est vide : place à la décharge !$/, { en: 'The pot is empty: time to unload!', de: 'Der Pott ist leer: jetzt wird abgeladen!', nl: 'De pot is leeg: tijd om te lossen!' }],
  [/^Limite de (\d+) manches atteinte : classement au nombre de jetons restants\.$/, { en: '$1-round limit reached: ranked by tokens left.', de: 'Limit von $1 Runden erreicht: Wertung nach verbliebenen Jetons.', nl: 'Limiet van $1 rondes bereikt: rangschikking op resterende fiches.' }],
  [new RegExp(`^Partie terminée : ${N} a perdu\\. Bravo à ${N} !$`), { en: 'Game over: $1 lost. Congrats to $l2!', de: 'Spiel vorbei: $1 hat verloren. Glückwunsch an $l2!', nl: 'Spel voorbij: $1 heeft verloren. Proficiat aan $l2!' }],
  [new RegExp(`^Partie terminée : égalité parfaite entre ${N} !$`), { en: 'Game over: a perfect tie between $l1!', de: 'Spiel vorbei: perfekter Gleichstand zwischen $l1!', nl: 'Spel voorbij: perfect gelijkspel tussen $l1!' }],
  [new RegExp(`^Partie terminée : victoire de ${N} !$`), { en: 'Game over: $1 wins!', de: 'Spiel vorbei: $1 gewinnt!', nl: 'Spel voorbij: $1 wint!' }],
  [new RegExp(`^Égalité parfaite entre ${N} : tirage au sort du serveur, ${N} passe devant\\.$`), { en: 'Perfect tie between $1: server draw, $2 goes first.', de: 'Perfekter Gleichstand zwischen $1: Losentscheid, $2 liegt vorn.', nl: 'Perfect gelijkspel tussen $1: de server loot, $2 gaat voor.' }],
  [/^Aucune partie à reprendre\.?$/, { en: 'No game to resume.', de: 'Kein Spiel zum Fortsetzen.', nl: 'Geen spel om te hervatten.' }],
  [/^Aucun tournoi à reprendre\.?$/, { en: 'No tournament to resume.', de: 'Kein Turnier zum Fortsetzen.', nl: 'Geen toernooi om te hervatten.' }],
  // --- Récompenses de fin de partie ------------------------------------------------------------
  [/^Victoire$/, { en: 'Victory', de: 'Sieg', nl: 'Overwinning' }],
  [/^(\d+)(?:re|e) place sur (\d+)$/, { en: '$o1 of $2', de: '$o1 von $2', nl: '$o1 van $2' }],
  [/^4-2-1 × (\d+)$/, { en: '4-2-1 × $1', de: '4-2-1 × $1', nl: '4-2-1 × $1' }],
  [/^Mort subite \(récompense réduite\)$/, { en: 'Sudden death (reduced reward)', de: 'Plötzlicher Tod (reduzierte Belohnung)', nl: 'Sudden death (lagere beloning)' }],
  [/^Premier week-end du mois : pièces doublées$/, { en: 'First weekend of the month: double coins', de: 'Erstes Wochenende im Monat: doppelte Münzen', nl: 'Eerste weekend van de maand: dubbele munten' }],
  [new RegExp(`^${N} : pièces doublées le week-end$`), { en: '$1: double coins on weekends', de: '$1: doppelte Münzen am Wochenende', nl: '$1: dubbele munten in het weekend' }],
  [new RegExp(`^${N} : pièces ×1,5$`), { en: '$1: coins ×1.5', de: '$1: Münzen ×1,5', nl: '$1: munten ×1,5' }],
  [/^Happy hour : pièces doublées$/, { en: 'Happy hour: double coins', de: 'Happy Hour: doppelte Münzen', nl: 'Happy hour: dubbele munten' }],
  // --- Salons et parties ------------------------------------------------------------------------
  [/^Aucune table ni aucun tournoi avec ce code\. Vérifiez-le\.$/, { en: 'No table or tournament with that code. Check it.', de: 'Kein Tisch oder Turnier mit diesem Code. Prüfe ihn.', nl: 'Geen tafel of toernooi met die code. Controleer de code.' }],
  [new RegExp(`^Temps écoulé pour ${N} : son tour est terminé automatiquement\\.$`), { en: 'Time’s up for $1: the turn ended automatically.', de: 'Zeit abgelaufen für $1: Der Zug endet automatisch.', nl: 'Tijd om voor $1: de beurt is automatisch afgelopen.' }],
  [new RegExp(`^${N} finit (\\d+)(?:er|e) et empoche (\\d+) pièces? de la cagnotte\\.$`), { en: '$1 finishes $o2 and pockets $m3 from the pot.', de: '$1 wird $o2 und kassiert $m3 aus dem Pott.', nl: '$1 eindigt als $o2 en krijgt $m3 uit de pot.' }],
  [/^Tous les joueurs ont abandonné : les mises sont remboursées\.$/, { en: 'All players gave up: stakes refunded.', de: 'Alle haben aufgegeben: Einsätze erstattet.', nl: 'Iedereen heeft opgegeven: inzetten terugbetaald.' }],
  [/^Cagnotte de (\d+) pièces : (.*)\.$/, { en: 'Pot of $1 coins: $2.', de: 'Pott von $1 Münzen: $2.', nl: 'Pot van $1 munten: $2.' }],
  [/^Les parties avec mise demandent un compte \(vos pièces sont gardées sur le serveur\)\.$/, { en: 'Staked games need an account (your coins are kept on the server).', de: 'Spiele mit Einsatz brauchen ein Konto (deine Münzen liegen auf dem Server).', nl: 'Spellen met inzet vereisen een account (je munten staan op de server).' }],
  [/^Il faut (\d+) pièces pour cette mise\.$/, { en: 'You need $1 coins for this stake.', de: 'Du brauchst $1 Münzen für diesen Einsatz.', nl: 'Je hebt $1 munten nodig voor deze inzet.' }],
  [/^Partie avec des ordinateurs : sans mise et hors classement, récompenses comme contre l’ordinateur\.$/, { en: 'Game with computers: no stakes and unranked, rewards as against the computer.', de: 'Spiel mit Computern: ohne Einsatz, nicht gewertet, Belohnungen wie gegen den Computer.', nl: 'Spel met computers: zonder inzet en niet gerangschikt, beloningen zoals tegen de computer.' }],
  [/^Un ordinateur complète la table : un joueur qui arrive avant le départ prend la place d’un ordinateur\.$/, { en: 'A computer fills the table: a player who arrives before the start takes a computer’s seat.', de: 'Ein Computer füllt den Tisch auf: Wer vor dem Start kommt, übernimmt den Platz eines Computers.', nl: 'Een computer vult de tafel aan: wie voor de start komt, neemt de plaats van een computer in.' }],
  [/^(\d+) ordinateurs complètent la table : un joueur qui arrive avant le départ prend la place d’un ordinateur\.$/, { en: '$1 computers fill the table: a player who arrives before the start takes a computer’s seat.', de: '$1 Computer füllen den Tisch auf: Wer vor dem Start kommt, übernimmt den Platz eines Computers.', nl: '$1 computers vullen de tafel aan: wie voor de start komt, neemt de plaats van een computer in.' }],
  [/^Le salon est complet \((\d+) joueurs\)\.$/, { en: 'The lobby is full ($1 players).', de: 'Die Lobby ist voll ($1 Spieler).', nl: 'De lobby is vol ($1 spelers).' }],
  [new RegExp(`^${N} a rejoint le salon\\.$`), { en: '$1 joined the lobby.', de: '$1 ist der Lobby beigetreten.', nl: '$1 is de lobby binnengekomen.' }],
  [/^Salon introuvable\. Vérifiez le code\.$/, { en: 'Lobby not found. Check the code.', de: 'Lobby nicht gefunden. Prüfe den Code.', nl: 'Lobby niet gevonden. Controleer de code.' }],
  [/^Ce code est celui d’un tournoi\.$/, { en: 'That code is for a tournament.', de: 'Dieser Code gehört zu einem Turnier.', nl: 'Die code hoort bij een toernooi.' }],
  [/^Vous avez déjà empoché vos gains et quitté cette partie\.$/, { en: 'You already cashed out and left this game.', de: 'Du hast deinen Gewinn schon kassiert und dieses Spiel verlassen.', nl: 'Je hebt je winst al geïnd en dit spel verlaten.' }],
  [/^Cette table fait partie d’un tournoi\.$/, { en: 'This table is part of a tournament.', de: 'Dieser Tisch gehört zu einem Turnier.', nl: 'Deze tafel hoort bij een toernooi.' }],
  [/^Seul l'hôte ajoute des ordinateurs$/, { en: 'Only the host can add computers', de: 'Nur der Gastgeber kann Computer hinzufügen', nl: 'Alleen de gastheer kan computers toevoegen' }],
  [/^Pas d’ordinateur aux tables avec mise\.$/, { en: 'No computers at staked tables.', de: 'Keine Computer an Tischen mit Einsatz.', nl: 'Geen computers aan tafels met inzet.' }],
  [/^Seul l'hôte complète la table$/, { en: 'Only the host can fill the table', de: 'Nur der Gastgeber kann den Tisch auffüllen', nl: 'Alleen de gastheer kan de tafel aanvullen' }],
  [/^Seul l'hôte modifie les règles$/, { en: 'Only the host can change the rules', de: 'Nur der Gastgeber kann die Regeln ändern', nl: 'Alleen de gastheer kan de regels wijzigen' }],
  [/^Il y a déjà (\d+) joueurs à la table\.$/, { en: 'There are already $1 players at the table.', de: 'Es sitzen schon $1 Spieler am Tisch.', nl: 'Er zitten al $1 spelers aan tafel.' }],
  [/^Retirez les ordinateurs avant de fixer une mise\.$/, { en: 'Remove the computers before setting a stake.', de: 'Entferne die Computer, bevor du einen Einsatz festlegst.', nl: 'Verwijder de computers voordat je een inzet kiest.' }],
  [/^Seul l'hôte lance la partie$/, { en: 'Only the host can start the game', de: 'Nur der Gastgeber kann das Spiel starten', nl: 'Alleen de gastheer kan het spel starten' }],
  [/^Indiquez les trois dés$/, { en: 'Enter all three dice', de: 'Gib alle drei Würfel ein', nl: 'Geef alle drie de stenen in' }],
  [/^Temps écoulé$/, { en: 'Time’s up', de: 'Zeit abgelaufen', nl: 'Tijd om' }],
  [/^Aucune partie$/, { en: 'No game', de: 'Kein Spiel', nl: 'Geen spel' }],
  [/^Action déjà prise en compte$/, { en: 'Action already received', de: 'Aktion schon erhalten', nl: 'Actie al ontvangen' }],
  [/^Vous regardez la partie\.$/, { en: 'You’re watching the game.', de: 'Du schaust zu.', nl: 'Je kijkt toe.' }],
  [/^Envoi impossible$/, { en: 'Couldn’t send', de: 'Senden nicht möglich', nl: 'Verzenden mislukt' }],
  [/^Seul l'hôte peut relancer$/, { en: 'Only the host can restart', de: 'Nur der Gastgeber kann neu starten', nl: 'Alleen de gastheer kan opnieuw starten' }],
  [/^L'hôte propose une revanche : retour au salon\.$/, { en: 'The host offers a rematch: back to the lobby.', de: 'Der Gastgeber schlägt eine Revanche vor: zurück in die Lobby.', nl: 'De gastheer stelt een revanche voor: terug naar de lobby.' }],
  [new RegExp(`^${N} a empoché ses gains et quitté la table\\.$`), { en: '$1 cashed out and left the table.', de: '$1 hat kassiert und den Tisch verlassen.', nl: '$1 heeft geïnd en de tafel verlaten.' }],
  [new RegExp(`^${N} a quitté la partie : le serveur jouera à sa place\\.$`), { en: '$1 left the game: the server will play for them.', de: '$1 hat das Spiel verlassen: Der Server spielt weiter.', nl: '$1 heeft het spel verlaten: de server speelt verder.' }],
  [/^Seul l’hôte peut retirer un joueur\.$/, { en: 'Only the host can remove a player.', de: 'Nur der Gastgeber kann Spieler entfernen.', nl: 'Alleen de gastheer kan een speler verwijderen.' }],
  [/^Tous les joueurs ont quitté la table\.$/, { en: 'All players left the table.', de: 'Alle Spieler haben den Tisch verlassen.', nl: 'Alle spelers hebben de tafel verlaten.' }],
  // --- Tournois ---------------------------------------------------------------------------------
  [/^Tournoi de (\d+) h$/, { en: '$1:00 tournament', de: '$1-Uhr-Turnier', nl: 'Toernooi van $1 uur' }],
  [/^Le tournoi a déjà commencé\.?$/, { en: 'The tournament has already started.', de: 'Das Turnier hat schon begonnen.', nl: 'Het toernooi is al begonnen.' }],
  [/^Il faut au moins (\d+) joueurs$/, { en: 'You need at least $1 players', de: 'Es braucht mindestens $1 Spieler', nl: 'Er zijn minstens $1 spelers nodig' }],
  [new RegExp(`^${N} n'a plus assez de pièces : désinscrit\\.$`), { en: '$1 is short of coins: unregistered.', de: '$1 hat nicht genug Münzen: abgemeldet.', nl: '$1 heeft te weinig munten: uitgeschreven.' }],
  [/^Il faut (\d+) pièces pour ce tournoi\.$/, { en: 'You need $1 coins for this tournament.', de: 'Du brauchst $1 Münzen für dieses Turnier.', nl: 'Je hebt $1 munten nodig voor dit toernooi.' }],
  [new RegExp(`^${N} remporte le tournoi de (\\d+) h( et (\\d+) sacs? de dés)? !$`), { en: '$1 wins the $2:00 tournament$3!', de: '$1 gewinnt das $2-Uhr-Turnier$3!', nl: '$1 wint het toernooi van $2 uur$3!' }],
  [new RegExp(`^${N} remporte le tournoi( et (\\d+) pièces)? !$`), { en: '$1 wins the tournament$2!', de: '$1 gewinnt das Turnier$2!', nl: '$1 wint het toernooi$2!' }],
  [/^Le tournoi est terminé\.$/, { en: 'The tournament is over.', de: 'Das Turnier ist beendet.', nl: 'Het toernooi is afgelopen.' }],
  [/^Absent au départ : vous êtes remboursé\.$/, { en: 'Absent at the start: you’re refunded.', de: 'Beim Start abwesend: Du bekommst dein Geld zurück.', nl: 'Afwezig bij de start: je wordt terugbetaald.' }],
  [/^Départ avec (\d+) joueurs\. À gagner : (.+)\.$/, { en: 'Starting with $1 players. Prizes: $p2.', de: 'Start mit $1 Spielern. Zu gewinnen: $p2.', nl: 'Start met $1 spelers. Te winnen: $p2.' }],
  [/^Tournoi introuvable\. Vérifiez le code\.$/, { en: 'Tournament not found. Check the code.', de: 'Turnier nicht gefunden. Prüfe den Code.', nl: 'Toernooi niet gevonden. Controleer de code.' }],
  [/^Les inscriptions sont closes\.$/, { en: 'Registration is closed.', de: 'Die Anmeldung ist geschlossen.', nl: 'De inschrijving is gesloten.' }],
  [/^Le tournoi est complet( \((\d+) joueurs\))?\.$/, { en: 'The tournament is full$1.', de: 'Das Turnier ist voll$1.', nl: 'Het toernooi is vol$1.' }],
  [/^Ce compte est déjà inscrit\.$/, { en: 'This account is already registered.', de: 'Dieses Konto ist schon angemeldet.', nl: 'Dit account is al ingeschreven.' }],
  [/^Impossible de rejoindre ce tournoi\.$/, { en: 'You can’t join this tournament.', de: 'Du kannst diesem Turnier nicht beitreten.', nl: 'Je kunt niet aan dit toernooi meedoen.' }],
  [/^Les tournois programmés demandent un compte \(gratuit\)\. Créez-en un depuis l’accueil\.$/, { en: 'Scheduled tournaments need a (free) account. Create one from the home screen.', de: 'Geplante Turniere brauchen ein (kostenloses) Konto. Erstelle eins im Hauptmenü.', nl: 'Geplande toernooien vereisen een (gratis) account. Maak er een aan via het hoofdmenu.' }],
  [/^Les tournois programmés demandent un compte \(gratuit\) : vos pièces y sont gardées\.$/, { en: 'Scheduled tournaments need a (free) account: your coins are kept there.', de: 'Geplante Turniere brauchen ein (kostenloses) Konto: Dort liegen deine Münzen.', nl: 'Geplande toernooien vereisen een (gratis) account: daar staan je munten.' }],
  [/^Inscrivez-vous d’abord \((\d+) pièces\)\.$/, { en: 'Register first ($1 coins).', de: 'Melde dich zuerst an ($1 Münzen).', nl: 'Schrijf je eerst in ($1 munten).' }],
  [/^Seul l'organisateur complète le tournoi$/, { en: 'Only the organiser can fill the tournament', de: 'Nur der Veranstalter kann das Turnier auffüllen', nl: 'Alleen de organisator kan het toernooi aanvullen' }],
  [/^Pas d’ordinateur dans un tournoi avec mise\.$/, { en: 'No computers in a staked tournament.', de: 'Keine Computer in Turnieren mit Einsatz.', nl: 'Geen computers in een toernooi met inzet.' }],
  [/^Le tournoi est complété par des ordinateurs\.$/, { en: 'Computers fill out the tournament.', de: 'Computer füllen das Turnier auf.', nl: 'Computers vullen het toernooi aan.' }],
  [/^Seul l'organisateur modifie le tournoi$/, { en: 'Only the organiser can change the tournament', de: 'Nur der Veranstalter kann das Turnier ändern', nl: 'Alleen de organisator kan het toernooi wijzigen' }],
  [/^Il y a déjà (\d+) inscrits\.$/, { en: 'There are already $1 registered.', de: 'Es sind schon $1 angemeldet.', nl: 'Er zijn al $1 inschrijvingen.' }],
  [/^La mise ne change plus une fois des joueurs inscrits\.$/, { en: 'The stake can’t change once players have registered.', de: 'Der Einsatz kann nicht mehr geändert werden, wenn sich Spieler angemeldet haben.', nl: 'De inzet kan niet meer veranderen zodra er spelers zijn ingeschreven.' }],
  [/^Seul l'organisateur lance le tournoi$/, { en: 'Only the organiser can start the tournament', de: 'Nur der Veranstalter kann das Turnier starten', nl: 'Alleen de organisator kan het toernooi starten' }],
  [new RegExp(`^${N} s'est inscrit\\.$`), { en: '$1 registered.', de: '$1 hat sich angemeldet.', nl: '$1 heeft zich ingeschreven.' }],
  [new RegExp(`^${N} s'est désinscrit\\.$`), { en: '$1 unregistered.', de: '$1 hat sich abgemeldet.', nl: '$1 heeft zich uitgeschreven.' }],
  [new RegExp(`^${N} a quitté le salon\\.$`), { en: '$1 left the lobby.', de: '$1 hat die Lobby verlassen.', nl: '$1 heeft de lobby verlaten.' }],
  [new RegExp(`^${N} a fini sa partie et quitté la table\\.$`), { en: '$1 finished and left the table.', de: '$1 hat das Spiel beendet und den Tisch verlassen.', nl: '$1 is klaar en heeft de tafel verlaten.' }],
  [new RegExp(`^${N} abandonne le tournoi : le serveur jouera à sa place\\.$`), { en: '$1 quits the tournament: the server will play for them.', de: '$1 gibt das Turnier auf: Der Server spielt weiter.', nl: '$1 geeft het toernooi op: de server speelt verder.' }],
  [/^Tour (\d+) : (\d+) tables\. Bonne chance !$/, { en: 'Round $1: $2 tables. Good luck!', de: 'Runde $1: $2 Tische. Viel Glück!', nl: 'Ronde $1: $2 tafels. Veel succes!' }],
  [/^La finale commence\. Bonne chance !$/, { en: 'The final begins. Good luck!', de: 'Das Finale beginnt. Viel Glück!', nl: 'De finale begint. Veel succes!' }],
  // --- Tournois programmés (server/scheduled.ts) -------------------------------------------------
  [/^Ce tournoi n’est plus ouvert aux inscriptions\.$/, { en: 'This tournament is no longer open for registration.', de: 'Für dieses Turnier kann man sich nicht mehr anmelden.', nl: 'Dit toernooi is niet meer open voor inschrijving.' }],
  [/^Vous êtes déjà inscrit à ce tournoi\.$/, { en: 'You’re already registered for this tournament.', de: 'Du bist schon für dieses Turnier angemeldet.', nl: 'Je bent al ingeschreven voor dit toernooi.' }],
  [/^Il faut (\d+) pièces pour s’inscrire\.$/, { en: 'You need $1 coins to register.', de: 'Du brauchst $1 Münzen zum Anmelden.', nl: 'Je hebt $1 munten nodig om in te schrijven.' }],
  [/^Vous n’êtes pas inscrit à ce tournoi\.$/, { en: 'You’re not registered for this tournament.', de: 'Du bist nicht für dieses Turnier angemeldet.', nl: 'Je bent niet ingeschreven voor dit toernooi.' }],
  [/^Le salon est ouvert : la désinscription n’est plus possible\.$/, { en: 'The lobby is open: you can no longer unregister.', de: 'Die Lobby ist offen: Abmelden ist nicht mehr möglich.', nl: 'De lobby is open: uitschrijven kan niet meer.' }],
  [/^Tournoi remboursé$/, { en: 'Tournament refunded', de: 'Turnier erstattet', nl: 'Toernooi terugbetaald' }],
  [/^(.*) Vos (\d+) pièces vous sont rendues\.$/, { en: '$r1 Your $2 coins are returned.', de: '$r1 Deine $2 Münzen sind zurück.', nl: '$r1 Je krijgt je $2 munten terug.' }],
  [/^Vous n’étiez pas dans le salon au départ du tournoi de (\d+) h\.$/, { en: 'You weren’t in the lobby at the start of the $1:00 tournament.', de: 'Du warst beim Start des $1-Uhr-Turniers nicht in der Lobby.', nl: 'Je was niet in de lobby bij de start van het toernooi van $1 uur.' }],
  [/^Le tournoi de (\d+) h est annulé : (\d+) joueurs? présents?, il en faut au moins (\d+)\.$/, { en: 'The $1:00 tournament is cancelled: $2 present, at least $3 needed.', de: 'Das $1-Uhr-Turnier fällt aus: $2 anwesend, mindestens $3 nötig.', nl: 'Het toernooi van $1 uur is afgelast: $2 aanwezig, minstens $3 nodig.' }],
  [/^Le tournoi de (\d+) h a été interrompu par une mise à jour du serveur\.$/, { en: 'The $1:00 tournament was interrupted by a server update.', de: 'Das $1-Uhr-Turnier wurde durch ein Server-Update unterbrochen.', nl: 'Het toernooi van $1 uur is onderbroken door een serverupdate.' }],
  [/^Le tournoi de (\d+) h n’a pas pu avoir lieu \(serveur indisponible\)\.$/, { en: 'The $1:00 tournament couldn’t take place (server unavailable).', de: 'Das $1-Uhr-Turnier konnte nicht stattfinden (Server nicht erreichbar).', nl: 'Het toernooi van $1 uur kon niet doorgaan (server niet beschikbaar).' }],
  [/^Tournoi de (\d+) h dans 5 minutes$/, { en: '$1:00 tournament in 5 minutes', de: '$1-Uhr-Turnier in 5 Minuten', nl: 'Toernooi van $1 uur over 5 minuten' }],
  [/^Le salon ouvre bientôt : soyez là pour le départ, 5 minutes après l’ouverture\.$/, { en: 'The lobby opens soon: be there for the start, 5 minutes after opening.', de: 'Die Lobby öffnet bald: Sei beim Start dabei, 5 Minuten nach der Öffnung.', nl: 'De lobby gaat bijna open: wees erbij voor de start, 5 minuten na opening.' }],
  [/^Le salon du tournoi de (\d+) h est ouvert$/, { en: 'The $1:00 tournament lobby is open', de: 'Die Lobby des $1-Uhr-Turniers ist offen', nl: 'De lobby van het toernooi van $1 uur is open' }],
  [/^Rejoignez-le maintenant : le tournoi commence dans 5 minutes\.$/, { en: 'Join now: the tournament starts in 5 minutes.', de: 'Komm jetzt: Das Turnier beginnt in 5 Minuten.', nl: 'Doe nu mee: het toernooi begint over 5 minuten.' }],
  [/^Tournoi de (\d+) h terminé$/, { en: '$1:00 tournament over', de: '$1-Uhr-Turnier beendet', nl: 'Toernooi van $1 uur afgelopen' }],
  [/^Tournoi de (.+)$/, { en: '$1’s tournament', de: 'Turnier von $1', nl: 'Toernooi van $1' }],
];

function fill(lang: Foreign, tpl: string, groups: string[]): string {
  return tpl.replace(/\$([a-z]?)(\d)/g, (_m, t: string, d: string) => {
    const v = groups[Number(d)] ?? '';
    switch (t) {
      case 'c': return comboIn(lang, v);
      case 'o': return ordinalIn(lang, Number(v));
      case 't': return count(lang, v, TOKENS, TOKEN);
      case 'm': return count(lang, v, COINS, COIN);
      case 'b': return count(lang, v, BAGS, BAG);
      case 'h': return HOW_LABEL[v]?.[lang] ?? v;
      case 'l': return v.replace(/ et /g, ` ${AND[lang]} `);
      case 'r': return translateG421(lang, v) ?? v;
      case 'p': return v.replace(/(\d+)(?:er|e) (\d+) sacs?/g, (_x, pl: string, b: string) => `${ordinalIn(lang, Number(pl))} ${count(lang, b, BAGS, BAG)}`);
      default: return v;
    }
  });
}

/** Rend le morceau optionnel d'une règle : « et 5 pièces », « (16 joueurs) », etc. */
function extras(lang: Foreign, re: RegExp, groups: string[]): string[] {
  const out = [...groups];
  const src = re.source;
  if (src.includes('sacs? de dés)')) out[3] = groups[3] ? ` ${{ en: 'and', de: 'und', nl: 'en' }[lang]} ${count(lang, groups[4], BAGS, BAG)}` : '';
  else if (src.includes(' pièces)?')) out[2] = groups[2] ? ` ${AND[lang]} ${count(lang, groups[3], COINS, COIN)}` : '';
  else if (src.includes('(\\d+) joueurs\\))?')) out[1] = groups[1] ? ` (${groups[2]} ${{ en: 'players', de: 'Spieler', nl: 'spelers' }[lang]})` : '';
  return out;
}

/** Texte du jeu 421 (journal ou message du serveur) traduit, ou null s'il n'est pas de ce périmètre. */
export function translateG421(lang: Foreign, text: string): string | null {
  // Départ d'un hôte + son remplaçant (fusion de deux phrases, voir transferHost).
  let m = /^(?:L'hôte (.+) a quitté la (table|partie)\.) (.+) devient l'hôte\.$/.exec(text);
  if (m) {
    const part = { en: `The host ${m[1]} left. ${m[3]} is now the host.`, de: `Der Gastgeber ${m[1]} ist gegangen. ${m[3]} ist jetzt Gastgeber.`, nl: `De gastheer ${m[1]} is weg. ${m[3]} is nu gastheer.` }[lang];
    return part;
  }
  for (const [re, t] of RULES) {
    const g = re.exec(text);
    if (g) {
      const groups = extras(lang, re, [...g]);
      return fill(lang, t[lang], groups).replace(/\bLe Baron\b/g, BARON[lang]);
    }
  }
  return null;
}
