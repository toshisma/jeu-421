/**
 * Messages du serveur vers le joueur, traduits. Le serveur envoie son texte français (une même table peut
 * mêler plusieurs langues, et les notices lui sont communes) ; `translateServerText` le traduit avec les
 * mots du joueur. tests/i18n.test.ts vérifie que chaque message de server/dixmille-online.ts est couvert.
 * Ajouter un message : une ligne ici, avec en, de, nl.
 */
import { BARON, type Foreign } from './courtisan';
import { COMMON_RULES, translateCommonText } from './zones/serveur-commun';
import type { Lang } from './index';
import { translateG421 } from './zones/jeu421-server';

const N = '(.+)';
const RULES: [RegExp, Record<Foreign, string>][] = [
  ...COMMON_RULES,
  [/^Connexion au serveur impossible$/, { en: 'Can’t reach the server', de: 'Verbindung zum Server nicht möglich', nl: 'Kan de server niet bereiken' }],
  [/^Le serveur ne répond pas$/, { en: 'The server isn’t responding', de: 'Der Server antwortet nicht', nl: 'De server reageert niet' }],
  [/^Impossible de joindre le serveur de jeu$/, { en: 'Can’t reach the game server', de: 'Spielserver nicht erreichbar', nl: 'Kan de spelserver niet bereiken' }],
  [/^Aucune partie à reprendre\.$/, { en: 'No game to resume.', de: 'Kein Spiel zum Fortsetzen.', nl: 'Geen spel om te hervatten.' }],
  [/^Serveur injoignable\. Vérifiez votre connexion\.$/, { en: 'Server unreachable. Check your connection.', de: 'Server nicht erreichbar. Prüfe deine Verbindung.', nl: 'Server onbereikbaar. Controleer je verbinding.' }],
  [/^Réponse invalide du serveur$/, { en: 'Invalid server response', de: 'Ungültige Serverantwort', nl: 'Ongeldig antwoord van de server' }],
  [/^Erreur (\d+)$/, { en: 'Error $1', de: 'Fehler $1', nl: 'Fout $1' }],
  [/^Table de (.+)$/, { en: '$1’s table', de: 'Tisch von $1', nl: 'Tafel van $1' }],
  [/^Partie rapide de (.+)$/, { en: '$1’s quick game', de: 'Schnelles Spiel von $1', nl: 'Snel potje van $1' }],
  [/^Votre compte est suspendu\.$/, { en: 'Your account is suspended.', de: 'Dein Konto ist gesperrt.', nl: 'Je account is geschorst.' }],
  [/^Choisissez un nom$/, { en: 'Choose a name', de: 'Wähle einen Namen', nl: 'Kies een naam' }],
  [/^Ce nom est réservé, choisissez-en un autre\.$/, { en: 'That name is reserved. Choose another one.', de: 'Dieser Name ist reserviert. Wähle einen anderen.', nl: 'Deze naam is gereserveerd. Kies een andere.' }],
  [/^La partie a déjà commencé\.$/, { en: 'The game has already started.', de: 'Das Spiel hat schon begonnen.', nl: 'Het spel is al begonnen.' }],
  [/^L’hôte vous a retiré de cette table\.$/, { en: 'The host removed you from this table.', de: 'Der Gastgeber hat dich von diesem Tisch entfernt.', nl: 'De gastheer heeft je van deze tafel verwijderd.' }],
  [/^L’hôte vous a retiré de la table\.$/, { en: 'The host removed you from the table.', de: 'Der Gastgeber hat dich vom Tisch entfernt.', nl: 'De gastheer heeft je van de tafel verwijderd.' }],
  [/^Impossible de rejoindre cette table\.$/, { en: 'You can’t join this table.', de: 'Du kannst diesem Tisch nicht beitreten.', nl: 'Je kunt niet aan deze tafel meedoen.' }],
  [/^Table introuvable\. Vérifiez le code\.$/, { en: 'Table not found. Check the code.', de: 'Tisch nicht gefunden. Prüfe den Code.', nl: 'Tafel niet gevonden. Controleer de code.' }],
  [/^La table est complète \((\d+) joueurs\)\.$/, { en: 'The table is full ($1 players).', de: 'Der Tisch ist voll ($1 Spieler).', nl: 'De tafel is vol ($1 spelers).' }],
  [/^La table est complète\.$/, { en: 'The table is full.', de: 'Der Tisch ist voll.', nl: 'De tafel is vol.' }],
  [/^Cette partie est terminée\.$/, { en: 'This game is over.', de: 'Dieses Spiel ist beendet.', nl: 'Dit spel is afgelopen.' }],
  [/^La partie est terminée\.$/, { en: 'The game is over.', de: 'Das Spiel ist beendet.', nl: 'Het spel is afgelopen.' }],
  [/^La table a été fermée\.$/, { en: 'The table was closed.', de: 'Der Tisch wurde geschlossen.', nl: 'De tafel is gesloten.' }],
  [/^Action impossible$/, { en: 'You can’t do that', de: 'Das geht nicht', nl: 'Dat kan niet' }],
  [/^Seul l’hôte peut le faire\.$/, { en: 'Only the host can do that.', de: 'Nur der Gastgeber kann das.', nl: 'Alleen de gastheer kan dat.' }],
  [/^Joueur introuvable\.$/, { en: 'Player not found.', de: 'Spieler nicht gefunden.', nl: 'Speler niet gevonden.' }],
  [/^Pas de mise en partie rapide\.$/, { en: 'No stakes in quick games.', de: 'Keine Einsätze in schnellen Spielen.', nl: 'Geen inzet bij snelle potjes.' }],
  [/^Il faut au moins 2 joueurs$/, { en: 'You need at least 2 players', de: 'Es braucht mindestens 2 Spieler', nl: 'Er zijn minstens 2 spelers nodig' }],
  [/^Tous les joueurs doivent être prêts$/, { en: 'All players must be ready', de: 'Alle Spieler müssen bereit sein', nl: 'Alle spelers moeten klaar zijn' }],
  [/^Seul l’hôte peut proposer une revanche\.$/, { en: 'Only the host can offer a rematch.', de: 'Nur der Gastgeber kann eine Revanche vorschlagen.', nl: 'Alleen de gastheer kan een revanche voorstellen.' }],
  [/^La partie est en cours$/, { en: 'The game is in progress', de: 'Das Spiel läuft', nl: 'Het spel is bezig' }],
  [/^Vous regardez la partie : les spectateurs ne jouent pas\.$/, { en: 'You’re watching: spectators can’t play.', de: 'Du schaust zu: Zuschauer können nicht spielen.', nl: 'Je kijkt toe: toeschouwers kunnen niet spelen.' }],
  [/^Aucune partie en cours$/, { en: 'No game in progress', de: 'Kein laufendes Spiel', nl: 'Geen spel bezig' }],
  [/^Ce n’est pas votre tour\.$/, { en: 'It’s not your turn.', de: 'Du bist nicht dran.', nl: 'Je bent niet aan de beurt.' }],
  [/^Action ignorée \(déjà prise en compte\)$/, { en: 'Action ignored (already received)', de: 'Aktion ignoriert (schon erhalten)', nl: 'Actie genegeerd (al ontvangen)' }],
  [/^Action invalide$/, { en: 'Invalid action', de: 'Ungültige Aktion', nl: 'Ongeldige actie' }],
  [/^Aucune table$/, { en: 'No table', de: 'Kein Tisch', nl: 'Geen tafel' }],
  [/^Réaction inconnue$/, { en: 'Unknown reaction', de: 'Unbekannte Reaktion', nl: 'Onbekende reactie' }],
  [/^Doucement !$/, { en: 'Slow down!', de: 'Langsam!', nl: 'Rustig aan!' }],
  [/^Message vide$/, { en: 'Empty message', de: 'Leere Nachricht', nl: 'Leeg bericht' }],
  [/^Partie introuvable\. Elle est peut-être déjà terminée\.$/, { en: 'Game not found. It may be over already.', de: 'Spiel nicht gefunden. Es ist vielleicht schon beendet.', nl: 'Spel niet gevonden. Het is misschien al afgelopen.' }],
  [/^Quittez d’abord votre table pour regarder une partie\.$/, { en: 'Leave your table first to watch a game.', de: 'Verlasse zuerst deinen Tisch, um zuzuschauen.', nl: 'Verlaat eerst je tafel om toe te kijken.' }],
  [/^Aucune partie en cours à cette table pour l’instant\.$/, { en: 'No game in progress at this table right now.', de: 'Gerade kein Spiel an diesem Tisch.', nl: 'Op dit moment geen spel aan deze tafel.' }],
  [/^Partie contre l’ordinateur : elle ne se regarde pas\.$/, { en: 'Games against the computer can’t be watched.', de: 'Spiele gegen den Computer kann man nicht ansehen.', nl: 'Potjes tegen de computer kun je niet bekijken.' }],
  [/^Vous êtes joueur à cette table\.$/, { en: 'You’re a player at this table.', de: 'Du spielst an diesem Tisch mit.', nl: 'Je speelt aan deze tafel.' }],
  [/^Impossible de regarder cette partie\.$/, { en: 'You can’t watch this game.', de: 'Du kannst diesem Spiel nicht zuschauen.', nl: 'Je kunt dit spel niet bekijken.' }],
  [/^Partie privée : seuls les amis des joueurs peuvent la regarder \(connectez-vous à votre compte\)\.$/, { en: 'Private game: only the players’ friends can watch (log in to your account).', de: 'Privates Spiel: Nur Freunde der Spieler können zuschauen (melde dich an).', nl: 'Privéspel: alleen vrienden van de spelers kunnen toekijken (log in).' }],
  [/^Partie privée : seuls les amis des joueurs peuvent la regarder\.$/, { en: 'Private game: only the players’ friends can watch.', de: 'Privates Spiel: Nur Freunde der Spieler können zuschauen.', nl: 'Privéspel: alleen vrienden van de spelers kunnen toekijken.' }],
  [/^Les parties avec mise demandent un compte \(vos Groschen sont gardés sur le serveur\)\.$/, { en: 'Staked games need an account (your Groschen are kept on the server).', de: 'Spiele mit Einsatz brauchen ein Konto (deine Groschen liegen auf dem Server).', nl: 'Spellen met inzet vereisen een account (je Groschen staan op de server).' }],
  [/^Les parties avec mise demandent un compte\.$/, { en: 'Staked games need an account.', de: 'Spiele mit Einsatz brauchen ein Konto.', nl: 'Spellen met inzet vereisen een account.' }],
  [/^Il faut (\d+) Groschen pour cette mise \(vous en avez (\d+)\)\.$/, { en: 'You need $1 Groschen for this stake (you have $2).', de: 'Du brauchst $1 Groschen für diesen Einsatz (du hast $2).', nl: 'Je hebt $1 Groschen nodig voor deze inzet (je hebt er $2).' }],
  [/^Choisissez une mise\.$/, { en: 'Choose a stake.', de: 'Wähle einen Einsatz.', nl: 'Kies een inzet.' }],
  [new RegExp(`^${N} : solde insuffisant\\.$`), { en: '$1: not enough Groschen.', de: '$1: nicht genug Groschen.', nl: '$1: niet genoeg Groschen.' }],
  [/^Mettez d’abord des dés de côté\.$/, { en: 'Set some dice aside first.', de: 'Lege zuerst Würfel beiseite.', nl: 'Leg eerst stenen apart.' }],
  [/^Lancez d’abord les dés\.$/, { en: 'Roll the dice first.', de: 'Wirf zuerst die Würfel.', nl: 'Gooi eerst de stenen.' }],
  [/^Chaque dé mis de côté doit rapporter des points\.$/, { en: 'Every die you set aside must score.', de: 'Jeder beiseitegelegte Würfel muss punkten.', nl: 'Elke apart gelegde steen moet scoren.' }],
  [new RegExp(`^Temps écoulé pour ${N} : le serveur finit son tour\\.$`), { en: 'Time’s up for $1: the server finishes the turn.', de: 'Zeit abgelaufen für $1: Der Server beendet die Runde.', nl: 'Tijd om voor $1: de server maakt de beurt af.' }],
  [new RegExp(`^${N} ne répond pas : le serveur joue à sa place\\.$`), { en: '$1 isn’t responding: the server plays for them.', de: '$1 antwortet nicht: Der Server spielt weiter.', nl: '$1 reageert niet: de server speelt verder.' }],
  [new RegExp(`^${N} emporte le pot : (\\d+) Groschen !$`), { en: '$1 wins the pot: $2 Groschen!', de: '$1 gewinnt den Pott: $2 Groschen!', nl: '$1 wint de pot: $2 Groschen!' }],
  [new RegExp(`^${N} a quitté la table avant la fin : les joueurs restés récupèrent leur mise\\.$`), { en: '$1 left before the end: remaining players get their stake back.', de: '$1 ist vor dem Ende gegangen: Die übrigen Spieler bekommen ihren Einsatz zurück.', nl: '$1 is voor het einde weggegaan: de overige spelers krijgen hun inzet terug.' }],
  [new RegExp(`^${N} \\(ordinateur\\) gagne : les mises sont perdues\\.$`), { en: '$1 (computer) wins: the stakes are lost.', de: '$1 (Computer) gewinnt: Die Einsätze sind verloren.', nl: '$1 (computer) wint: de inzetten zijn verloren.' }],
  [new RegExp(`^${N} prend la place de ${N} \\(ordinateur\\)\\.$`), { en: '$1 takes the seat of $2 (computer).', de: '$1 übernimmt den Platz von $2 (Computer).', nl: '$1 neemt de plaats in van $2 (computer).' }],
  [new RegExp(`^${N} a rejoint la table\\.$`), { en: '$1 joined the table.', de: '$1 ist dem Tisch beigetreten.', nl: '$1 doet mee aan de tafel.' }],
  [new RegExp(`^${N} revient à la table\\.$`), { en: '$1 is back at the table.', de: '$1 ist zurück am Tisch.', nl: '$1 is terug aan tafel.' }],
  [new RegExp(`^${N} est de retour\\.$`), { en: '$1 is back.', de: '$1 ist zurück.', nl: '$1 is terug.' }],
  [new RegExp(`^${N} a été retiré de la table\\.$`), { en: '$1 was removed from the table.', de: '$1 wurde vom Tisch entfernt.', nl: '$1 is van de tafel verwijderd.' }],
  [new RegExp(`^${N} a quitté la partie : le serveur joue à sa place \\(il peut revenir\\)\\.$`), { en: '$1 left the game: the server plays for them (they can come back).', de: '$1 hat das Spiel verlassen: Der Server spielt weiter (Rückkehr möglich).', nl: '$1 heeft het spel verlaten: de server speelt verder (terugkomen kan).' }],
  [new RegExp(`^${N} a perdu la connexion\\.$`), { en: '$1 lost connection.', de: '$1 hat die Verbindung verloren.', nl: '$1 heeft de verbinding verloren.' }],
  [new RegExp(`^(.*) ${N} devient l'hôte\\.$`), { en: '$1 $2 is now the host.', de: '$1 $2 ist jetzt Gastgeber.', nl: '$1 $2 is nu gastheer.' }],
  [new RegExp(`^L’hôte ${N} est parti\\.$`), { en: 'The host $1 left.', de: 'Der Gastgeber $1 ist gegangen.', nl: 'De gastheer $1 is weggegaan.' }],
  [new RegExp(`^${N} a quitté la table\\.$`), { en: '$1 left the table.', de: '$1 hat den Tisch verlassen.', nl: '$1 heeft de tafel verlaten.' }],
  [/^Partie lancée : (\d+) Groschen dans le pot\. Le gagnant emporte tout\.$/, { en: 'Game on: $1 Groschen in the pot. Winner takes all.', de: 'Spiel läuft: $1 Groschen im Pott. Der Gewinner bekommt alles.', nl: 'Spel gestart: $1 Groschen in de pot. De winnaar krijgt alles.' }],
  [/^L’hôte propose une revanche : retour à la table\.$/, { en: 'The host offers a rematch: back to the table.', de: 'Der Gastgeber schlägt eine Revanche vor: zurück an den Tisch.', nl: 'De gastheer stelt een revanche voor: terug aan tafel.' }],
  [/^Trop de spectateurs pour cette partie \((\d+) au maximum\)\.$/, { en: 'Too many spectators for this game ($1 maximum).', de: 'Zu viele Zuschauer bei diesem Spiel (maximal $1).', nl: 'Te veel toeschouwers bij dit spel (maximaal $1).' }],
  [/^Un ordinateur complète la table\. Départ dans (\d+) s : un joueur qui arrive d’ici là prend la place d’un ordinateur\.$/, { en: 'A computer fills the table. Starting in $1s: a player arriving before then takes a computer’s seat.', de: 'Ein Computer füllt den Tisch auf. Start in $1 s: Wer bis dahin kommt, übernimmt den Platz eines Computers.', nl: 'Een computer vult de tafel aan. Start over $1 s: wie er voor die tijd bij komt, neemt de plaats van een computer in.' }],
  [/^(\d+) ordinateurs complètent la table\. Départ dans (\d+) s : un joueur qui arrive d’ici là prend la place d’un ordinateur\.$/, { en: '$1 computers fill the table. Starting in $2s: a player arriving before then takes a computer’s seat.', de: '$1 Computer füllen den Tisch auf. Start in $2 s: Wer bis dahin kommt, übernimmt den Platz eines Computers.', nl: '$1 computers vullen de tafel aan. Start over $2 s: wie er voor die tijd bij komt, neemt de plaats van een computer in.' }],
  [/^Vous ne pouvez plus écrire jusqu’au (.+) \(décision de la modération(?: : (.*))?\)\.$/, { en: 'You can’t post until $1 (moderation decision: $2).', de: 'Du kannst bis $1 nichts schreiben (Moderation: $2).', nl: 'Je kunt tot $1 niet schrijven (moderatie: $2).' }],
  [/^Pseudo : 3 à 20 caractères \(lettres latines, chiffres, _ \. -\)\.$/, { en: 'Username: 3 to 20 characters (Latin letters, digits, _ . -).', de: 'Benutzername: 3 bis 20 Zeichen (lateinische Buchstaben, Ziffern, _ . -).', nl: 'Gebruikersnaam: 3 tot 20 tekens (Latijnse letters, cijfers, _ . -).' }],
  [/^Ce pseudo est réservé, choisissez-en un autre\.$/, { en: 'That username is reserved. Choose another one.', de: 'Dieser Benutzername ist reserviert. Wähle einen anderen.', nl: 'Deze gebruikersnaam is gereserveerd. Kies een andere.' }],
  [/^Trop de tentatives, réessayez dans quelques minutes\.$/, { en: 'Too many attempts. Try again in a few minutes.', de: 'Zu viele Versuche. Versuch es in ein paar Minuten nochmal.', nl: 'Te veel pogingen. Probeer het over een paar minuten opnieuw.' }],
  [/^Mot de passe : au moins 8 caractères\.$/, { en: 'Password: at least 8 characters.', de: 'Passwort: mindestens 8 Zeichen.', nl: 'Wachtwoord: minstens 8 tekens.' }],
  [/^Ce pseudo est déjà pris\.$/, { en: 'That username is taken.', de: 'Dieser Benutzername ist vergeben.', nl: 'Deze gebruikersnaam is al bezet.' }],
  [/^Pseudo ou mot de passe incorrect\.$/, { en: 'Wrong username or password.', de: 'Falscher Benutzername oder falsches Passwort.', nl: 'Onjuiste gebruikersnaam of wachtwoord.' }],
  [/^Pseudo ou code de récupération incorrect\.$/, { en: 'Wrong username or recovery code.', de: 'Falscher Benutzername oder Wiederherstellungscode.', nl: 'Onjuiste gebruikersnaam of herstelcode.' }],
  [/^Session expirée : reconnectez-vous\.$/, { en: 'Session expired: log in again.', de: 'Sitzung abgelaufen: Melde dich neu an.', nl: 'Sessie verlopen: log opnieuw in.' }],
  [/^Vous ne pouvez inviter que vos amis\.$/, { en: 'You can only invite your friends.', de: 'Du kannst nur deine Freunde einladen.', nl: 'Je kunt alleen je vrienden uitnodigen.' }],
  [/^Ouvrez d’abord une table pour y inviter vos amis\.$/, { en: 'Open a table first to invite your friends.', de: 'Eröffne zuerst einen Tisch, um deine Freunde einzuladen.', nl: 'Open eerst een tafel om je vrienden uit te nodigen.' }],];

/** Texte du serveur dans la langue du joueur (français : rendu tel quel ; message inconnu : français). */
export function translateServerText(lang: Lang, text: string): string {
  if (lang === 'fr') return text;
  const g421 = translateG421(lang, text); if (g421 !== null) return g421;
  for (const [re, t] of RULES) {
    if (re.test(text)) {
      const out = text.replace(re, t[lang]).replace(/\bLe Baron\b/g, BARON[lang]);
      return out.replace(/ \((moderation decision|Moderation|moderatie)(: )?\)/, (_m, w) => ` (${w})`).replace(/ \((moderation decision|Moderation|moderatie): \)/, ' ($1)');
    }
  }
  const catalog = translateCommonText(lang, text);
  if (catalog) return catalog;
  // « Pseudo : problème » (un joueur ne peut pas payer sa mise) : la partie de droite est déjà un message connu.
  const m = /^(.+?) : (.+)$/.exec(text);
  if (m) { const right = translateServerText(lang, m[2]); if (right !== m[2]) return `${m[1]}: ${right}`; }
  return text;
}
