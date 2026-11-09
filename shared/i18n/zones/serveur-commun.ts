/**
 * Messages du serveur « commun » (comptes, amis, messages privés, modération, notifications) et textes
 * de catalogue envoyés tels quels (noms de défis, de ligues, titres). Voir shared/i18n/server-texts.ts.
 */
import type { Foreign } from '../courtisan';
import { LANG_LOCALE } from '../index';
import { communFr } from './commun.fr';
import { communEn } from './commun.en';
import { communDe } from './commun.de';
import { communNl } from './commun.nl';

export const COMMON_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^Session expirée : reconnectez-vous\.$/, { en: 'Session expired: log in again.', de: 'Sitzung abgelaufen: Melde dich neu an.', nl: 'Sessie verlopen: log opnieuw in.' }],
  [/^Trop de tentatives, réessayez dans quelques minutes\.$/, { en: 'Too many attempts, try again in a few minutes.', de: 'Zu viele Versuche, versuche es in ein paar Minuten noch einmal.', nl: 'Te veel pogingen, probeer het over een paar minuten opnieuw.' }],
  [/^Mot de passe : au moins 8 caractères\.$/, { en: 'Password: at least 8 characters.', de: 'Passwort: mindestens 8 Zeichen.', nl: 'Wachtwoord: minstens 8 tekens.' }],
  [/^Ce pseudo est déjà pris\.$/, { en: 'That username is already taken.', de: 'Dieser Name ist schon vergeben.', nl: 'Deze gebruikersnaam is al bezet.' }],
  [/^Pseudo ou mot de passe incorrect\.$/, { en: 'Wrong username or password.', de: 'Name oder Passwort falsch.', nl: 'Onjuiste gebruikersnaam of wachtwoord.' }],
  [/^Pseudo ou code de récupération incorrect\.$/, { en: 'Wrong username or recovery code.', de: 'Name oder Wiederherstellungscode falsch.', nl: 'Onjuiste gebruikersnaam of herstelcode.' }],
  [/^Mot de passe incorrect\.$/, { en: 'Wrong password.', de: 'Falsches Passwort.', nl: 'Onjuist wachtwoord.' }],
  [/^Achat impossible \(pièces ou niveau insuffisants\)\.$/, { en: 'Can’t buy (not enough coins or level too low).', de: 'Kauf nicht möglich (zu wenig Münzen oder Level).', nl: 'Kopen niet mogelijk (te weinig munten of niveau te laag).' }],
  [/^Objet non possédé\.$/, { en: 'Item not owned.', de: 'Gegenstand nicht im Besitz.', nl: 'Voorwerp niet in bezit.' }],
  [/^🎲 (.+) a sorti (\d+) fois 4-2-1 dans la même partie !$/, { en: '🎲 $1 rolled 4-2-1 $2 times in the same game!', de: '🎲 $1 hat $2-mal 4-2-1 im selben Spiel geworfen!', nl: '🎲 $1 gooide $2 keer 4-2-1 in hetzelfde spel!' }],
  [/^🎲 (.+) a gagné avec un 4-2-1 !$/, { en: '🎲 $1 won with a 4-2-1!', de: '🎲 $1 hat mit einem 4-2-1 gewonnen!', nl: '🎲 $1 won met een 4-2-1!' }],
  [/^🍻 (.+) a remporté une partie en ligne$/, { en: '🍻 $1 won an online game', de: '🍻 $1 hat ein Online-Spiel gewonnen', nl: '🍻 $1 won een online spel' }],
  [/^Aucun sac à ouvrir\.$/, { en: 'No bag to open.', de: 'Kein Beutel zu öffnen.', nl: 'Geen zak om te openen.' }],
  [/^✨ (.+) a trouvé un dé brillant !$/, { en: '✨ $1 found a shiny die!', de: '✨ $1 hat einen glänzenden Würfel gefunden!', nl: '✨ $1 vond een glanzende steen!' }],
  [/^✨ (.+) a sorti un dé légendaire d’un sac !$/, { en: '✨ $1 pulled a legendary die from a bag!', de: '✨ $1 hat einen legendären Würfel aus einem Beutel gezogen!', nl: '✨ $1 haalde een legendarische steen uit een zak!' }],
  [/^✨ (.+) a sorti un dé épique$/, { en: '✨ $1 pulled an epic die', de: '✨ $1 hat einen epischen Würfel gezogen', nl: '✨ $1 haalde een epische steen' }],
  [/^Pas assez d’éclats, ou dé déjà possédé\.$/, { en: 'Not enough shards, or die already owned.', de: 'Nicht genug Splitter oder Würfel schon im Besitz.', nl: 'Niet genoeg scherven, of steen al in bezit.' }],
  [/^Effet non possédé\.$/, { en: 'Effect not owned.', de: 'Effekt nicht im Besitz.', nl: 'Effect niet in bezit.' }],
  [/^Vitrine invalide\.$/, { en: 'Invalid showcase.', de: 'Ungültige Vitrine.', nl: 'Ongeldige vitrine.' }],
  [/^Défi non accompli\.$/, { en: 'Challenge not completed.', de: 'Aufgabe nicht erfüllt.', nl: 'Opdracht niet voltooid.' }],
  [/^Le prestige s'ouvre au niveau (\d+)\.$/, { en: 'Prestige opens at level $1.', de: 'Prestige gibt es ab Level $1.', nl: 'Prestige opent op niveau $1.' }],
  [/^Le coffre se recharge 24 h après chaque ouverture\.$/, { en: 'The chest refills 24 hours after each opening.', de: 'Die Truhe füllt sich 24 Stunden nach jedem Öffnen wieder.', nl: 'De kist vult zich 24 uur na elke opening.' }],
  [/^Récompense du jour déjà récupérée\.$/, { en: 'Daily reward already claimed.', de: 'Tagesbelohnung schon abgeholt.', nl: 'Dagbeloning al opgehaald.' }],
  [/^Palier pas encore atteint\.$/, { en: 'Tier not reached yet.', de: 'Stufe noch nicht erreicht.', nl: 'Trede nog niet bereikt.' }],
  [/^Titre non débloqué\.$/, { en: 'Title not unlocked.', de: 'Titel nicht freigeschaltet.', nl: 'Titel niet vrijgespeeld.' }],
  [/^Partie guidée déjà récompensée\.$/, { en: 'Guided game already rewarded.', de: 'Geführtes Spiel schon belohnt.', nl: 'Begeleid spel al beloond.' }],
  [/^Partie du défi invalide\.$/, { en: 'Invalid challenge game.', de: 'Ungültiges Herausforderungsspiel.', nl: 'Ongeldig uitdagingsspel.' }],
  [/^Vous avez déjà joué le défi du jour\.$/, { en: 'You’ve already played today’s challenge.', de: 'Du hast die heutige Herausforderung schon gespielt.', nl: 'Je hebt de uitdaging van vandaag al gespeeld.' }],
  [/^Partie inconnue\.$/, { en: 'Unknown game.', de: 'Unbekanntes Spiel.', nl: 'Onbekend spel.' }],
  [/^Partie trop courte pour être récompensée\.$/, { en: 'Game too short to be rewarded.', de: 'Spiel zu kurz für eine Belohnung.', nl: 'Spel te kort om beloond te worden.' }],
  [/^Plafond de parties solo récompensées atteint pour aujourd'hui\.$/, { en: 'Daily limit of rewarded solo games reached.', de: 'Tageslimit belohnter Solospiele erreicht.', nl: 'Daglimiet van beloonde solospellen bereikt.' }],
  [/^🎲 (.+) a remporté une partie du Courtisan$/, { en: '🎲 $1 won a game of The Courtier', de: '🎲 $1 hat ein Spiel Der Höfling gewonnen', nl: '🎲 $1 won een spel De Hoveling' }],
  [/^Quittez d’abord votre club actuel\.$/, { en: 'Leave your current club first.', de: 'Verlasse zuerst deinen aktuellen Club.', nl: 'Verlaat eerst je huidige club.' }],
  [/^Nom du club : 3 à 24 caractères \(lettres, chiffres, espaces\)\.$/, { en: 'Club name: 3 to 24 characters (letters, digits, spaces).', de: 'Clubname: 3 bis 24 Zeichen (Buchstaben, Ziffern, Leerzeichen).', nl: 'Clubnaam: 3 tot 24 tekens (letters, cijfers, spaties).' }],
  [/^Ce nom de club est déjà pris\.$/, { en: 'That club name is already taken.', de: 'Dieser Clubname ist schon vergeben.', nl: 'Deze clubnaam is al bezet.' }],
  [/^Créer un club coûte (\d+) pièces\.$/, { en: 'Creating a club costs $1 coins.', de: 'Einen Club zu gründen kostet $1 Münzen.', nl: 'Een club oprichten kost $1 munten.' }],
  [/^Club introuvable\.$/, { en: 'Club not found.', de: 'Club nicht gefunden.', nl: 'Club niet gevonden.' }],
  [/^Ce club est complet \((\d+) membres\)\.$/, { en: 'This club is full ($1 members).', de: 'Dieser Club ist voll ($1 Mitglieder).', nl: 'Deze club is vol ($1 leden).' }],
  [/^Impossible de rejoindre ce club\.$/, { en: 'You can’t join this club.', de: 'Du kannst diesem Club nicht beitreten.', nl: 'Je kunt niet bij deze club.' }],
  [/^Vous n’êtes dans aucun club\.$/, { en: 'You’re not in a club.', de: 'Du bist in keinem Club.', nl: 'Je zit in geen enkele club.' }],
  [/^Phrase inconnue\.$/, { en: 'Unknown phrase.', de: 'Unbekannter Satz.', nl: 'Onbekende zin.' }],
  [/^Aucun joueur avec ce pseudo\.$/, { en: 'No player with that username.', de: 'Kein Spieler mit diesem Namen.', nl: 'Geen speler met die gebruikersnaam.' }],
  [/^Vous ne pouvez pas vous bloquer vous-même\.$/, { en: 'You can’t block yourself.', de: 'Du kannst dich nicht selbst blockieren.', nl: 'Je kunt jezelf niet blokkeren.' }],
  [/^Format d’image non pris en charge \(JPEG, PNG ou WebP\)\.$/, { en: 'Image format not supported (JPEG, PNG or WebP).', de: 'Bildformat nicht unterstützt (JPEG, PNG oder WebP).', nl: 'Afbeeldingsformaat niet ondersteund (JPEG, PNG of WebP).' }],
  [/^Image trop lourde\.$/, { en: 'Image too large.', de: 'Bild zu groß.', nl: 'Afbeelding te groot.' }],
  [/^Fichier image invalide\.$/, { en: 'Invalid image file.', de: 'Ungültige Bilddatei.', nl: 'Ongeldig afbeeldingsbestand.' }],
  [/^(.+) vous invite au Courtisan$/, { en: '$1 invites you to The Courtier', de: '$1 lädt dich zu Der Höfling ein', nl: '$1 nodigt je uit voor De Hoveling' }],
  [/^Une table de dés vous attend : touchez pour la rejoindre\.$/, { en: 'A dice table is waiting: tap to join.', de: 'Ein Würfeltisch wartet: Tippe zum Beitreten.', nl: 'Er wacht een dobbeltafel: tik om mee te doen.' }],
  [/^(.+) vous invite à jouer$/, { en: '$1 invites you to play', de: '$1 lädt dich zum Spielen ein', nl: '$1 nodigt je uit om te spelen' }],
  [/^Une table vous attend : touchez pour la rejoindre\.$/, { en: 'A table is waiting: tap to join.', de: 'Ein Tisch wartet: Tippe zum Beitreten.', nl: 'Er wacht een tafel: tik om mee te doen.' }],
  [/^Signalement impossible\.$/, { en: 'Report not possible.', de: 'Meldung nicht möglich.', nl: 'Melden niet mogelijk.' }],
  [/^Photo de profil signalée$/, { en: 'Profile photo reported', de: 'Profilfoto gemeldet', nl: 'Profielfoto gemeld' }],
  [/^Set « Feu et Glace » débloqué !$/, { en: '“Fire and Ice” set unlocked!', de: 'Set „Feuer und Eis“ freigeschaltet!', nl: 'Set “Vuur en IJs” vrijgespeeld!' }],
  [/^(\d+) amis ont rejoint le comptoir : vos 3 dés légendaires vous attendent\.$/, { en: '$1 friends have joined the bar: your 3 legendary dice are waiting.', de: '$1 Freunde sind am Tresen: Deine 3 legendären Würfel warten.', nl: '$1 vrienden zijn aan de toog: je 3 legendarische stenen wachten.' }],
  [/^Parrainage réussi !$/, { en: 'Referral successful!', de: 'Einladung erfolgreich!', nl: 'Uitnodiging geslaagd!' }],
  [/^(.+) a joué (\d+) parties : un sac de dés vous attend\.$/, { en: '$1 played $2 games: a dice bag is waiting for you.', de: '$1 hat $2 Spiele gespielt: Ein Würfelbeutel wartet auf dich.', nl: '$1 speelde $2 spellen: er ligt een dobbelzak klaar.' }],
  [/^Abonnement invalide\.$/, { en: 'Invalid subscription.', de: 'Ungültiges Abonnement.', nl: 'Ongeldig abonnement.' }],
  [/^C'est vous !$/, { en: 'That’s you!', de: 'Das bist du!', nl: 'Dat ben jij!' }],
  [/^Impossible d’ajouter ce joueur\.$/, { en: 'You can’t add this player.', de: 'Du kannst diesen Spieler nicht hinzufügen.', nl: 'Je kunt deze speler niet toevoegen.' }],
  [/^Vous êtes déjà amis\.$/, { en: 'You’re already friends.', de: 'Ihr seid schon befreundet.', nl: 'Jullie zijn al vrienden.' }],
  [/^Ce joueur a refusé votre demande : réessayez dans quelques jours \((\d+) jours après le refus\)\.$/, { en: 'This player declined your request: try again in a few days ($1 days after the refusal).', de: 'Dieser Spieler hat abgelehnt: Versuche es in ein paar Tagen wieder ($1 Tage nach der Ablehnung).', nl: 'Deze speler heeft je verzoek geweigerd: probeer het over een paar dagen opnieuw ($1 dagen na de weigering).' }],
  [/^Trop de demandes d’amis aujourd’hui : réessayez demain\.$/, { en: 'Too many friend requests today: try again tomorrow.', de: 'Heute zu viele Freundschaftsanfragen: Versuche es morgen wieder.', nl: 'Te veel vriendschapsverzoeken vandaag: probeer het morgen opnieuw.' }],
  [/^Demande d’ami$/, { en: 'Friend request', de: 'Freundschaftsanfrage', nl: 'Vriendschapsverzoek' }],
  [/^(.+) veut être votre ami\.$/, { en: '$1 wants to be your friend.', de: '$1 möchte dein Freund sein.', nl: '$1 wil je vriend zijn.' }],
  [/^Nouvel ami$/, { en: 'New friend', de: 'Neuer Freund', nl: 'Nieuwe vriend' }],
  [/^(.+) a accepté votre demande d’ami\.$/, { en: '$1 accepted your friend request.', de: '$1 hat deine Freundschaftsanfrage angenommen.', nl: '$1 heeft je vriendschapsverzoek geaccepteerd.' }],
  [/^Demande introuvable\.$/, { en: 'Request not found.', de: 'Anfrage nicht gefunden.', nl: 'Verzoek niet gevonden.' }],
  [/^Joueur supprimé$/, { en: 'Deleted player', de: 'Gelöschter Spieler', nl: 'Verwijderde speler' }],
  [/^Défi expiré$/, { en: 'Challenge expired', de: 'Herausforderung abgelaufen', nl: 'Uitdaging verlopen' }],
  [/^(.+) n'a pas joué votre défi à temps\. Mise rendue\.$/, { en: '$1 didn’t play your challenge in time. Stake returned.', de: '$1 hat deine Herausforderung nicht rechtzeitig gespielt. Einsatz zurückerstattet.', nl: '$1 speelde je uitdaging niet op tijd. Inzet teruggegeven.' }],
  [/^(.+) n'a pas joué votre défi à temps\.$/, { en: '$1 didn’t play your challenge in time.', de: '$1 hat deine Herausforderung nicht rechtzeitig gespielt.', nl: '$1 speelde je uitdaging niet op tijd.' }],
  [/^Choisissez un ami à défier\.$/, { en: 'Choose a friend to challenge.', de: 'Wähle einen Freund zum Herausfordern.', nl: 'Kies een vriend om uit te dagen.' }],
  [/^Vous ne pouvez défier que vos amis\.$/, { en: 'You can only challenge your friends.', de: 'Du kannst nur deine Freunde herausfordern.', nl: 'Je kunt alleen je vrienden uitdagen.' }],
  [/^Impossible de défier ce joueur\.$/, { en: 'You can’t challenge this player.', de: 'Du kannst diesen Spieler nicht herausfordern.', nl: 'Je kunt deze speler niet uitdagen.' }],
  [/^Il vous faut (\d+) pièces pour cette mise\.$/, { en: 'You need $1 coins for this stake.', de: 'Du brauchst $1 Münzen für diesen Einsatz.', nl: 'Je hebt $1 munten nodig voor deze inzet.' }],
  [/^Défi introuvable\.$/, { en: 'Challenge not found.', de: 'Herausforderung nicht gefunden.', nl: 'Uitdaging niet gevonden.' }],
  [/^Ce défi est terminé\.$/, { en: 'This challenge is over.', de: 'Diese Herausforderung ist beendet.', nl: 'Deze uitdaging is afgelopen.' }],
  [/^Vous avez déjà joué ce défi\.$/, { en: 'You’ve already played this challenge.', de: 'Du hast diese Herausforderung schon gespielt.', nl: 'Je hebt deze uitdaging al gespeeld.' }],
  [/^Partie invalide\.$/, { en: 'Invalid game.', de: 'Ungültiges Spiel.', nl: 'Ongeldig spel.' }],
  [/^Il vous faut (\d+) pièces pour relever ce défi\.$/, { en: 'You need $1 coins to take this challenge.', de: 'Du brauchst $1 Münzen für diese Herausforderung.', nl: 'Je hebt $1 munten nodig voor deze uitdaging.' }],
  [/^Égalité contre (.+) \((\d+) points chacun\)\.$/, { en: 'Tie against $1 ($2 points each).', de: 'Unentschieden gegen $1 (je $2 Punkte).', nl: 'Gelijkspel tegen $1 ($2 punten elk).' }],
  [/^Vous avez battu (.+) : (\d+) à (\d+) !$/, { en: 'You beat $1: $2 to $3!', de: 'Du hast $1 geschlagen: $2 zu $3!', nl: 'Je hebt $1 verslagen: $2 tegen $3!' }],
  [/^(.+) vous a battu : (\d+) à (\d+)\.$/, { en: '$1 beat you: $2 to $3.', de: '$1 hat dich geschlagen: $2 zu $3.', nl: '$1 heeft je verslagen: $2 tegen $3.' }],
  [/^Résultat du défi$/, { en: 'Challenge result', de: 'Ergebnis der Herausforderung', nl: 'Resultaat van de uitdaging' }],
  [/^Nouveau défi !$/, { en: 'New challenge!', de: 'Neue Herausforderung!', nl: 'Nieuwe uitdaging!' }],
  [/^(.+) vous défie au 421 \(mise : (\d+) pièces\)\. Mêmes dés pour vous deux\.$/, { en: '$1 challenges you to 421 ($2-coin stake). Same dice for both of you.', de: '$1 fordert dich zu 421 heraus (Einsatz: $2 Münzen). Gleiche Würfel für euch beide.', nl: '$1 daagt je uit voor 421 (inzet: $2 munten). Dezelfde stenen voor jullie allebei.' }],
  [/^(.+) vous défie au 421\. Mêmes dés pour vous deux\.$/, { en: '$1 challenges you to 421. Same dice for both of you.', de: '$1 fordert dich zu 421 heraus. Gleiche Würfel für euch beide.', nl: '$1 daagt je uit voor 421. Dezelfde stenen voor jullie allebei.' }],
  [/^Défi refusé$/, { en: 'Challenge declined', de: 'Herausforderung abgelehnt', nl: 'Uitdaging geweigerd' }],
  [/^(.+) a refusé votre défi\. Mise rendue\.$/, { en: '$1 declined your challenge. Stake returned.', de: '$1 hat deine Herausforderung abgelehnt. Einsatz zurückerstattet.', nl: '$1 heeft je uitdaging geweigerd. Inzet teruggegeven.' }],
  [/^(.+) a refusé votre défi\.$/, { en: '$1 declined your challenge.', de: '$1 hat deine Herausforderung abgelehnt.', nl: '$1 heeft je uitdaging geweigerd.' }],
  [/^Happy hour !$/, { en: 'Happy hour!', de: 'Happy Hour!', nl: 'Happy hour!' }],
  [/^Pièces doublées sur toutes les parties pendant une heure\.$/, { en: 'Double coins on all games for one hour.', de: 'Doppelte Münzen bei allen Spielen für eine Stunde.', nl: 'Dubbele munten in alle spellen gedurende een uur.' }],
  [/^Votre série va se perdre$/, { en: 'Your streak is about to end', de: 'Deine Serie geht bald verloren', nl: 'Je reeks gaat verloren' }],
  [/^Votre série de (\d+) jours s'arrête à minuit : passez récupérer votre récompense\.$/, { en: 'Your $1-day streak ends at midnight: drop by to claim your reward.', de: 'Deine Serie von $1 Tagen endet um Mitternacht: Hol dir deine Belohnung ab.', nl: 'Je reeks van $1 dagen stopt om middernacht: haal je beloning op.' }],
  [/^Doucement ! Attendez quelques secondes avant le message suivant\.$/, { en: 'Slow down! Wait a few seconds before the next message.', de: 'Langsam! Warte ein paar Sekunden bis zur nächsten Nachricht.', nl: 'Rustig aan! Wacht een paar seconden voor het volgende bericht.' }],
  [/^Trop de messages envoyés : réessayez dans quelques minutes\.$/, { en: 'Too many messages sent: try again in a few minutes.', de: 'Zu viele Nachrichten: Versuche es in ein paar Minuten wieder.', nl: 'Te veel berichten: probeer het over een paar minuten opnieuw.' }],
  [/^Conversation introuvable\.$/, { en: 'Conversation not found.', de: 'Unterhaltung nicht gefunden.', nl: 'Gesprek niet gevonden.' }],
  [/^Vous ne pouvez écrire qu’à vos amis\.$/, { en: 'You can only write to your friends.', de: 'Du kannst nur deinen Freunden schreiben.', nl: 'Je kunt alleen naar je vrienden schrijven.' }],
  [/^Message vide\.$/, { en: 'Empty message.', de: 'Leere Nachricht.', nl: 'Leeg bericht.' }],
  [/^Message trop long \((\d+) caractères au plus\)\.$/, { en: 'Message too long ($1 characters at most).', de: 'Nachricht zu lang (höchstens $1 Zeichen).', nl: 'Bericht te lang (maximaal $1 tekens).' }],
  [/^Nouveau message de (.+)$/, { en: 'New message from $1', de: 'Neue Nachricht von $1', nl: 'Nieuw bericht van $1' }],
  [/^Message introuvable\.$/, { en: 'Message not found.', de: 'Nachricht nicht gefunden.', nl: 'Bericht niet gevonden.' }],
  [/^Message introuvable \(il est peut-être trop ancien\)\.$/, { en: 'Message not found (it may be too old).', de: 'Nachricht nicht gefunden (vielleicht zu alt).', nl: 'Bericht niet gevonden (misschien te oud).' }],
  [/^Vous ne pouvez pas signaler votre propre message\.$/, { en: 'You can’t report your own message.', de: 'Du kannst deine eigene Nachricht nicht melden.', nl: 'Je kunt je eigen bericht niet melden.' }],
  [/^Ce joueur n’existe plus\.$/, { en: 'This player no longer exists.', de: 'Dieser Spieler existiert nicht mehr.', nl: 'Deze speler bestaat niet meer.' }],
  [/^Ce message vient d’un invité sans compte : il ne peut pas être signalé\. Vous pouvez couper le tchat de la table\.$/, { en: 'This message comes from a guest without an account: it can’t be reported. You can mute the table chat.', de: 'Diese Nachricht stammt von einem Gast ohne Konto und kann nicht gemeldet werden. Du kannst den Tischchat stummschalten.', nl: 'Dit bericht komt van een gast zonder account: het kan niet gemeld worden. Je kunt de tafelchat uitzetten.' }],
  [/^Créez un compte \(gratuit\) pour signaler un joueur\.$/, { en: 'Create a (free) account to report a player.', de: 'Erstelle ein (kostenloses) Konto, um einen Spieler zu melden.', nl: 'Maak een (gratis) account om een speler te melden.' }],
  [/^Choisissez la raison du signalement\.$/, { en: 'Choose the reason for the report.', de: 'Wähle den Grund der Meldung.', nl: 'Kies de reden van de melding.' }],
  [/^Vous ne pouvez pas vous signaler vous-même\.$/, { en: 'You can’t report yourself.', de: 'Du kannst dich nicht selbst melden.', nl: 'Je kunt jezelf niet melden.' }],
  [/^Vous avez déjà signalé ce message\.$/, { en: 'You’ve already reported this message.', de: 'Du hast diese Nachricht schon gemeldet.', nl: 'Je hebt dit bericht al gemeld.' }],
  [/^Vous avez déjà signalé ce joueur : l’équipe de modération va examiner votre signalement\.$/, { en: 'You’ve already reported this player: the moderation team will review your report.', de: 'Du hast diesen Spieler schon gemeldet: Das Moderationsteam prüft deine Meldung.', nl: 'Je hebt deze speler al gemeld: het moderatieteam bekijkt je melding.' }],
  [/^Vous avez envoyé beaucoup de signalements : réessayez dans une heure\.$/, { en: 'You’ve sent a lot of reports: try again in an hour.', de: 'Du hast viele Meldungen gesendet: Versuche es in einer Stunde wieder.', nl: 'Je hebt veel meldingen verstuurd: probeer het over een uur opnieuw.' }],
  [/^Avertissement de la modération : (.+)\. Merci de respecter les autres joueurs, sinon des sanctions plus lourdes suivront\.$/, { en: 'Moderation warning: $1. Please respect other players, or heavier sanctions will follow.', de: 'Verwarnung der Moderation: $1. Bitte respektiere die anderen Spieler, sonst folgen härtere Strafen.', nl: 'Waarschuwing van de moderatie: $1. Respecteer de andere spelers, anders volgen zwaardere sancties.' }],
  [/^Vous ne pouvez plus écrire \(tchats et messages privés\) jusqu’au (.+)\. Motif : (.+)\.$/, { en: 'You can’t write anymore (chats and private messages) until $1. Reason: $2.', de: 'Du kannst bis $1 nicht mehr schreiben (Chats und private Nachrichten). Grund: $2.', nl: 'Je kunt tot $1 niet meer schrijven (chats en privéberichten). Reden: $2.' }],
  [/^Votre compte a été suspendu jusqu’au (.+)\. Motif : (.+)\.$/, { en: 'Your account has been suspended until $1. Reason: $2.', de: 'Dein Konto wurde bis $1 gesperrt. Grund: $2.', nl: 'Je account is geschorst tot $1. Reden: $2.' }],
  [/^Votre compte a été suspendu définitivement\. Motif : (.+)\.$/, { en: 'Your account has been permanently suspended. Reason: $1.', de: 'Dein Konto wurde dauerhaft gesperrt. Grund: $1.', nl: 'Je account is definitief geschorst. Reden: $1.' }],
  [/^Message de la modération$/, { en: 'Message from the moderation team', de: 'Nachricht der Moderation', nl: 'Bericht van de moderatie' }],
  [/^Signalement traité$/, { en: 'Report processed', de: 'Meldung bearbeitet', nl: 'Melding behandeld' }],
  [/^Vous ne pouvez plus écrire jusqu’au (.+) \(décision de la modération : (.+)\)\.$/, { en: 'You can’t write anymore until $1 (moderation decision: $2).', de: 'Du kannst bis $1 nicht mehr schreiben (Entscheidung der Moderation: $2).', nl: 'Je kunt tot $1 niet meer schrijven (beslissing van de moderatie: $2).' }],
  [/^Vous ne pouvez plus écrire jusqu’au (.+) \(décision de la modération\)\.$/, { en: 'You can’t write anymore until $1 (moderation decision).', de: 'Du kannst bis $1 nicht mehr schreiben (Entscheidung der Moderation).', nl: 'Je kunt tot $1 niet meer schrijven (beslissing van de moderatie).' }],
  [/^Merci pour votre signalement : une sanction a été prise contre un joueur que vous avez signalé\.$/, { en: 'Thanks for your report: a sanction has been taken against a player you reported.', de: 'Danke für deine Meldung: Gegen einen von dir gemeldeten Spieler wurde eine Strafe verhängt.', nl: 'Bedankt voor je melding: er is een sanctie genomen tegen een speler die je hebt gemeld.' }],
  [/^Merci, votre signalement a été transmis à l’équipe de modération\.$/, { en: 'Thanks, your report has been sent to the moderation team.', de: 'Danke, deine Meldung wurde an das Moderationsteam weitergeleitet.', nl: 'Bedankt, je melding is doorgestuurd naar het moderatieteam.' }],
  [/^Vous faites maintenant partie de l’équipe de modération : le menu « Plus » contient l’entrée « Modération »\.$/, { en: 'You’re now part of the moderation team: the “More” menu has a “Moderation” entry.', de: 'Du gehörst jetzt zum Moderationsteam: Im Menü „Mehr“ gibt es den Eintrag „Moderation“.', nl: 'Je maakt nu deel uit van het moderatieteam: in het menu “Meer” staat “Moderatie”.' }],
  [/^Le mot de passe et le code de récupération ne sont conservés que sous forme d’empreinte \(hachage\) et ne peuvent pas être exportés\.$/, { en: 'The password and recovery code are only kept as a fingerprint (hash) and can’t be exported.', de: 'Passwort und Wiederherstellungscode werden nur als Hash gespeichert und können nicht exportiert werden.', nl: 'Het wachtwoord en de herstelcode worden alleen als hash bewaard en kunnen niet geëxporteerd worden.' }],
  [/^Render Services, Inc\. \(render\.com\), serveurs situés à Francfort \(Allemagne\)$/, { en: 'Render Services, Inc. (render.com), servers located in Frankfurt (Germany)', de: 'Render Services, Inc. (render.com), Server in Frankfurt (Deutschland)', nl: 'Render Services, Inc. (render.com), servers in Frankfurt (Duitsland)' }],
  [/^2 novembre 2026$/, { en: 'November 2, 2026', de: '2. November 2026', nl: '2 november 2026' }],
  [/^Mort subite \(récompense réduite\)$/, { en: 'Sudden death (reduced reward)', de: 'Sudden Death (verringerte Belohnung)', nl: 'Sudden death (verlaagde beloning)' }],
  [/^Victoire$/, { en: 'Win', de: 'Sieg', nl: 'Winst' }],
  [/^(\d+)(?:e|re) place sur (\d+)$/, { en: 'Place $1 of $2', de: 'Platz $1 von $2', nl: 'Plaats $1 van $2' }],
  [/^Happy hour : pièces doublées$/, { en: 'Happy hour: double coins', de: 'Happy Hour: doppelte Münzen', nl: 'Happy hour: dubbele munten' }],
  [/^(.+), patron de la semaine, est battu$/, { en: '$1, boss of the week, is beaten', de: '$1, Boss der Woche, ist besiegt', nl: '$1, baas van de week, is verslagen' }],
  [/^Album : page « (.+) » complète$/, { en: 'Album: page “$1” complete', de: 'Album: Seite „$1“ vollständig', nl: 'Album: pagina “$1” compleet' }],
  [/^Album complet : dés « Collectionneur » débloqués$/, { en: 'Album complete: “Collector” dice unlocked', de: 'Album vollständig: „Sammler“-Würfel freigeschaltet', nl: 'Album compleet: “Verzamelaar”-stenen vrijgespeeld' }],
  [/^Collectionneur de combinaisons$/, { en: 'Combination collector', de: 'Kombinationssammler', nl: 'Combinatieverzamelaar' }],
  [/^Tombeur de (.+)$/, { en: 'Slayer of $1', de: 'Bezwinger von $1', nl: 'Bedwinger van $1' }],
  [/^Pièces ×1,5$/, { en: 'Coins ×1.5', de: 'Münzen ×1,5', nl: 'Munten ×1,5' }],
  [/^Premier week-end du mois : pièces doublées$/, { en: 'First weekend of the month: double coins', de: 'Erstes Wochenende des Monats: doppelte Münzen', nl: 'Eerste weekend van de maand: dubbele munten' }],
  [/^(.+) : pièces doublées le week-end$/, { en: '$1: double coins at the weekend', de: '$1: doppelte Münzen am Wochenende', nl: '$1: dubbele munten in het weekend' }],
  [/^(.+) : pièces ×1,5$/, { en: '$1: coins ×1.5', de: '$1: Münzen ×1,5', nl: '$1: munten ×1,5' }],
];

const DICT: Record<Foreign, Record<string, string>> = { en: communEn, de: communDe, nl: communNl };
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const OUTLOOK: Record<Foreign, { champion: string; rank: string }> = {
  en: { champion: 'Champion of', rank: 'of' }, de: { champion: 'Champion', rank: '' }, nl: { champion: 'Kampioen van', rank: 'van' },
};
const LEAGUE: Record<Foreign, string> = { en: 'League', de: 'Liga', nl: 'Competitie' };

/** Textes français figés (noms de défis, de succès, de ligues, de divisions) vers leur traduction. */
const INDEX = new Map<string, string>();
for (const [k, v] of Object.entries(communFr)) {
  if (/^app\.(q\.|a\.[^.]+$|series\.[^.]+\.t$|div\.|league\.|ev\.[^.]+$)/.test(k)) INDEX.set(v, k);
}
const lookup = (lang: Foreign, text: string): string | null => { const k = INDEX.get(text); return k ? DICT[lang][k] : null; };

function monthOf(lang: Foreign, m: string, y: string): string | null {
  const i = MONTHS.indexOf(m);
  if (i < 0) return null;
  return new Date(Date.UTC(Number(y), i, 15)).toLocaleDateString(LANG_LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Titres composés et textes de catalogue ; renvoie null si le texte n'en est pas un. */
export function translateCommonText(lang: Foreign, text: string): string | null {
  const whole = lookup(lang, text);
  if (whole) return whole;
  let m = /^Ligue (.+)$/.exec(text);
  if (m) return `${LEAGUE[lang]} ${lookup(lang, m[1]) ?? m[1]}`;
  m = /^(.+) (?:de |d’)(\p{L}+) (\d{4})$/u.exec(text);
  if (m) {
    const when = monthOf(lang, m[2], m[3]);
    if (when) {
      if (m[1] === 'Champion') return `${OUTLOOK[lang].champion} ${when}`.replace('  ', ' ');
      const d = lookup(lang, m[1]);
      if (d) return `${d} ${OUTLOOK[lang].rank} ${when}`.replace('  ', ' ');
    }
  }
  return null;
}
