/**
 * Bistrots entre amis : messages de server/bistrots.ts (erreurs, notifications), traduits côté navigateur
 * et pour les notifications push. tests/i18n-clubs.test.ts vérifie que chaque message est couvert.
 * Vocabulaire : bistrot = bistro / Kneipe / café ; patron = owner / Wirt / baas.
 */
import type { Lang } from '../index';

type Foreign = Exclude<Lang, 'fr'>;
const N = '(.+)';

export const CLUB_RULES: [RegExp, Record<Foreign, string>][] = [
  [/^Nom du bistrot : (\d+) à (\d+) caractères \(lettres latines, chiffres, espaces, apostrophes\)\.$/, {
    en: 'Bistro name: $1 to $2 characters (Latin letters, digits, spaces, apostrophes).',
    de: 'Name der Kneipe: $1 bis $2 Zeichen (lateinische Buchstaben, Ziffern, Leerzeichen, Apostrophe).',
    nl: 'Naam van het café: $1 tot $2 tekens (Latijnse letters, cijfers, spaties, apostrofs).' }],
  [/^Ce nom de bistrot n’est pas accepté : choisissez-en un autre\.$/, { en: 'That bistro name isn’t allowed: choose another one.', de: 'Dieser Kneipenname ist nicht erlaubt: Wähle einen anderen.', nl: 'Deze cafénaam is niet toegestaan: kies een andere.' }],
  [/^Ce nom est réservé, choisissez-en un autre\.$/, { en: 'That name is reserved. Choose another one.', de: 'Dieser Name ist reserviert. Wähle einen anderen.', nl: 'Deze naam is gereserveerd. Kies een andere.' }],
  [/^Créez un compte \(gratuit\) pour ouvrir ou rejoindre un bistrot\.$/, { en: 'Create a (free) account to open or join a bistro.', de: 'Erstelle ein (kostenloses) Konto, um eine Kneipe zu eröffnen oder beizutreten.', nl: 'Maak een (gratis) account om een café te openen of erbij te komen.' }],
  [/^Bistrot introuvable\.$/, { en: 'Bistro not found.', de: 'Kneipe nicht gefunden.', nl: 'Café niet gevonden.' }],
  [/^Seul le patron du bistrot peut le faire\.$/, { en: 'Only the bistro’s owner can do that.', de: 'Nur der Wirt der Kneipe kann das.', nl: 'Alleen de baas van het café kan dat.' }],
  [/^Vous êtes déjà dans (\d+) bistrots : quittez-en un d’abord\.$/, { en: 'You’re already in $1 bistros: leave one first.', de: 'Du bist schon in $1 Kneipen: Verlasse zuerst eine.', nl: 'Je zit al in $1 cafés: verlaat er eerst een.' }],
  [/^Vous avez ouvert beaucoup de bistrots aujourd’hui : réessayez demain\.$/, { en: 'You’ve opened a lot of bistros today: try again tomorrow.', de: 'Du hast heute viele Kneipen eröffnet: Versuch es morgen wieder.', nl: 'Je hebt vandaag veel cafés geopend: probeer het morgen opnieuw.' }],
  [/^Ce bistrot n’existe plus ou le lien a changé\.$/, { en: 'This bistro no longer exists or the link has changed.', de: 'Diese Kneipe gibt es nicht mehr oder der Link hat sich geändert.', nl: 'Dit café bestaat niet meer of de link is veranderd.' }],
  [/^Le patron vous a retiré de ce bistrot\.$/, { en: 'The owner removed you from this bistro.', de: 'Der Wirt hat dich aus dieser Kneipe entfernt.', nl: 'De baas heeft je uit dit café verwijderd.' }],
  [/^Impossible de rejoindre ce bistrot\.$/, { en: 'You can’t join this bistro.', de: 'Du kannst dieser Kneipe nicht beitreten.', nl: 'Je kunt niet bij dit café.' }],
  [/^Ce bistrot est complet \((\d+) membres\)\.$/, { en: 'This bistro is full ($1 members).', de: 'Diese Kneipe ist voll ($1 Mitglieder).', nl: 'Dit café is vol ($1 leden).' }],
  [/^Vous ne pouvez inviter que vos amis\.$/, { en: 'You can only invite your friends.', de: 'Du kannst nur deine Freunde einladen.', nl: 'Je kunt alleen je vrienden uitnodigen.' }],
  [/^Cet ami est déjà dans le bistrot\.$/, { en: 'This friend is already in the bistro.', de: 'Dieser Freund ist schon in der Kneipe.', nl: 'Deze vriend zit al in het café.' }],
  [/^Le patron a retiré ce joueur : lui seul peut le réinviter\.$/, { en: 'The owner removed this player: only the owner can invite them again.', de: 'Der Wirt hat diesen Spieler entfernt: Nur er kann ihn wieder einladen.', nl: 'De baas heeft deze speler verwijderd: alleen de baas kan hem opnieuw uitnodigen.' }],
  [/^Ce joueur n’est pas dans le bistrot\.$/, { en: 'This player isn’t in the bistro.', de: 'Dieser Spieler ist nicht in der Kneipe.', nl: 'Deze speler zit niet in het café.' }],
  [/^Le patron ne peut pas se retirer lui-même : quittez le bistrot ou transmettez-le\.$/, { en: 'The owner can’t remove themselves: leave the bistro or hand it over.', de: 'Der Wirt kann sich nicht selbst entfernen: Verlasse die Kneipe oder übergib sie.', nl: 'De baas kan zichzelf niet verwijderen: verlaat het café of draag het over.' }],
  [/^Annonce introuvable\.$/, { en: 'Post not found.', de: 'Meldung nicht gefunden.', nl: 'Bericht niet gevonden.' }],
  [/^Réaction inconnue$/, { en: 'Unknown reaction', de: 'Unbekannte Reaktion', nl: 'Onbekende reactie' }],
  [/^Signalement impossible\.$/, { en: 'You can’t report this.', de: 'Melden nicht möglich.', nl: 'Melden niet mogelijk.' }],
  [/^Accès réservé à l’équipe de modération\.$/, { en: 'Moderation team only.', de: 'Nur für das Moderationsteam.', nl: 'Alleen voor het moderatieteam.' }],
  [/^Champion de la semaine !$/, { en: 'Champion of the week!', de: 'Champion der Woche!', nl: 'Kampioen van de week!' }],
  [new RegExp(`^Vous êtes le champion du bistrot « ${N} » avec (\\d+) points\\.$`), { en: 'You’re the champion of the bistro “$1” with $2 points.', de: 'Du bist Champion der Kneipe „$1“ mit $2 Punkten.', nl: 'Je bent kampioen van café ‘$1’ met $2 punten.' }],
  [/^Invitation au bistrot$/, { en: 'Bistro invitation', de: 'Einladung in die Kneipe', nl: 'Uitnodiging voor het café' }],
  [new RegExp(`^${N} vous invite au bistrot « ${N} »\\.$`), { en: '$1 invites you to the bistro “$2”.', de: '$1 lädt dich in die Kneipe „$2“ ein.', nl: '$1 nodigt je uit in café ‘$2’.' }],
  [/^Vous êtes le patron !$/, { en: 'You’re the owner!', de: 'Du bist der Wirt!', nl: 'Jij bent de baas!' }],
  [new RegExp(`^Le bistrot « ${N} » vous a été transmis\\.$`), { en: 'The bistro “$1” has been handed over to you.', de: 'Die Kneipe „$1“ wurde dir übergeben.', nl: 'Café ‘$1’ is aan jou overgedragen.' }],
  [new RegExp(`^Le bistrot « ${N} » a été fermé par la modération\\.$`), { en: 'The bistro “$1” was closed by the moderators.', de: 'Die Kneipe „$1“ wurde von der Moderation geschlossen.', nl: 'Café ‘$1’ is door de moderatie gesloten.' }],
];

/** Message des bistrots dans la langue du joueur, ou null s'il n'en est pas un. */
export function translateClubRule(lang: Foreign, text: string): string | null {
  for (const [re, t] of CLUB_RULES) if (re.test(text)) return text.replace(re, t[lang]);
  return null;
}
