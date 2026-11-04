/**
 * Pays d'un visiteur, sans adresse IP : d'après le fuseau horaire de l'appareil
 * (Intl…resolvedOptions().timeZone), sinon la région de la langue (fr-BE → Belgique).
 * Un en-tête de pays fourni par l'hébergeur (cf-ipcountry…) prime côté serveur.
 */

/** Fuseau horaire IANA → code pays (ISO 3166-1 alpha-2). */
export const TZ_COUNTRY: Record<string, string> = {
  // Europe
  'Europe/Brussels': 'BE', 'Europe/Paris': 'FR', 'Europe/Luxembourg': 'LU', 'Europe/Monaco': 'MC', 'Europe/Zurich': 'CH', 'Europe/Busingen': 'DE',
  'Europe/Vaduz': 'LI', 'Europe/Andorra': 'AD', 'Europe/Amsterdam': 'NL', 'Europe/Berlin': 'DE', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
  'Europe/Rome': 'IT', 'Europe/San_Marino': 'SM', 'Europe/Vatican': 'VA', 'Europe/Malta': 'MT', 'Europe/Vienna': 'AT', 'Europe/Prague': 'CZ',
  'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Warsaw': 'PL', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
  'Europe/Helsinki': 'FI', 'Europe/Mariehamn': 'AX', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Athens': 'GR',
  'Europe/Sofia': 'BG', 'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Minsk': 'BY',
  'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR', 'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI',
  'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK', 'Europe/Podgorica': 'ME', 'Europe/Tirane': 'AL', 'Atlantic/Reykjavik': 'IS', 'Asia/Nicosia': 'CY',
  'Europe/Nicosia': 'CY', 'Europe/Gibraltar': 'GI', 'Europe/Guernsey': 'GG', 'Europe/Jersey': 'JE', 'Europe/Isle_of_Man': 'IM',
  // Maghreb et Afrique
  'Africa/Casablanca': 'MA', 'Africa/El_Aaiun': 'EH', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Tripoli': 'LY', 'Africa/Cairo': 'EG',
  'Africa/Nouakchott': 'MR', 'Africa/Dakar': 'SN', 'Africa/Bamako': 'ML', 'Africa/Niamey': 'NE', 'Africa/Ouagadougou': 'BF', 'Africa/Abidjan': 'CI',
  'Africa/Conakry': 'GN', 'Africa/Lome': 'TG', 'Africa/Porto-Novo': 'BJ', 'Africa/Ndjamena': 'TD', 'Africa/Douala': 'CM', 'Africa/Libreville': 'GA',
  'Africa/Brazzaville': 'CG', 'Africa/Kinshasa': 'CD', 'Africa/Lubumbashi': 'CD', 'Africa/Bangui': 'CF', 'Africa/Malabo': 'GQ', 'Africa/Kigali': 'RW',
  'Africa/Bujumbura': 'BI', 'Africa/Djibouti': 'DJ', 'Indian/Antananarivo': 'MG', 'Indian/Comoro': 'KM', 'Indian/Mahe': 'SC', 'Indian/Mauritius': 'MU',
  'Africa/Banjul': 'GM', 'Africa/Bissau': 'GW', 'Africa/Freetown': 'SL', 'Africa/Monrovia': 'LR', 'Africa/Accra': 'GH', 'Africa/Lagos': 'NG',
  'Atlantic/Cape_Verde': 'CV', 'Africa/Sao_Tome': 'ST', 'Africa/Luanda': 'AO', 'Africa/Khartoum': 'SD', 'Africa/Juba': 'SS', 'Africa/Addis_Ababa': 'ET',
  'Africa/Asmara': 'ER', 'Africa/Mogadishu': 'SO', 'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Maputo': 'MZ',
  'Africa/Lusaka': 'ZM', 'Africa/Harare': 'ZW', 'Africa/Blantyre': 'MW', 'Africa/Gaborone': 'BW', 'Africa/Windhoek': 'NA', 'Africa/Johannesburg': 'ZA',
  'Africa/Maseru': 'LS', 'Africa/Mbabane': 'SZ',
  // France d'outre-mer
  'America/Guadeloupe': 'GP', 'America/Martinique': 'MQ', 'America/Cayenne': 'GF', 'Indian/Reunion': 'RE', 'Indian/Mayotte': 'YT',
  'America/Miquelon': 'PM', 'America/St_Barthelemy': 'BL', 'America/Marigot': 'MF', 'Pacific/Noumea': 'NC', 'Pacific/Tahiti': 'PF',
  'Pacific/Marquesas': 'PF', 'Pacific/Gambier': 'PF', 'Pacific/Wallis': 'WF', 'Indian/Kerguelen': 'TF',
  // Antilles et Amériques
  'America/Port-au-Prince': 'HT', 'America/Santo_Domingo': 'DO', 'America/Havana': 'CU', 'America/Jamaica': 'JM', 'America/Puerto_Rico': 'PR',
  'America/Barbados': 'BB', 'America/Port_of_Spain': 'TT', 'America/St_Lucia': 'LC', 'America/Dominica': 'DM', 'America/Grenada': 'GD',
  'America/Curacao': 'CW', 'America/Aruba': 'AW', 'America/Paramaribo': 'SR', 'America/Guyana': 'GY',
  'America/Toronto': 'CA', 'America/Montreal': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Moncton': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA', 'America/Iqaluit': 'CA', 'America/Whitehorse': 'CA', 'America/Yellowknife': 'CA',
  'America/Blanc-Sablon': 'CA', 'America/Glace_Bay': 'CA', 'America/Goose_Bay': 'CA', 'America/Swift_Current': 'CA', 'America/Dawson_Creek': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US',
  'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Boise': 'US', 'Pacific/Honolulu': 'US',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX', 'America/Monterrey': 'MX', 'America/Guatemala': 'GT', 'America/Panama': 'PA',
  'America/Costa_Rica': 'CR', 'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Bogota': 'CO', 'America/Caracas': 'VE',
  'America/Lima': 'PE', 'America/Guayaquil': 'EC', 'America/La_Paz': 'BO', 'America/Santiago': 'CL', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Buenos_Aires': 'AR', 'America/Montevideo': 'UY', 'America/Asuncion': 'PY', 'America/Sao_Paulo': 'BR', 'America/Fortaleza': 'BR',
  'America/Manaus': 'BR', 'America/Recife': 'BR', 'America/Bahia': 'BR', 'America/Belem': 'BR',
  // Proche-Orient, Asie, Océanie
  'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Amman': 'JO', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Gaza': 'PS', 'Asia/Hebron': 'PS',
  'Asia/Baghdad': 'IQ', 'Asia/Riyadh': 'SA', 'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA', 'Asia/Bahrain': 'BH', 'Asia/Dubai': 'AE', 'Asia/Muscat': 'OM',
  'Asia/Aden': 'YE', 'Asia/Tehran': 'IR', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Baku': 'AZ', 'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Saigon': 'VN', 'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID',
  'Asia/Manila': 'PH', 'Asia/Hong_Kong': 'HK', 'Asia/Shanghai': 'CN', 'Asia/Taipei': 'TW', 'Asia/Seoul': 'KR', 'Asia/Tokyo': 'JP',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Efate': 'VU', 'Pacific/Fiji': 'FJ', 'Indian/Maldives': 'MV',
};

/** Noms français des pays les plus probables (repli : Intl.DisplayNames, puis le code). */
const NAMES: Record<string, string> = {
  BE: 'Belgique', FR: 'France', LU: 'Luxembourg', MC: 'Monaco', CH: 'Suisse', DE: 'Allemagne', NL: 'Pays-Bas', GB: 'Royaume-Uni', IE: 'Irlande',
  ES: 'Espagne', PT: 'Portugal', IT: 'Italie', AT: 'Autriche', PL: 'Pologne', RO: 'Roumanie', GR: 'Grèce', TR: 'Turquie', SE: 'Suède', NO: 'Norvège',
  DK: 'Danemark', FI: 'Finlande', CZ: 'Tchéquie', HU: 'Hongrie', BG: 'Bulgarie', UA: 'Ukraine', RU: 'Russie', AD: 'Andorre', MT: 'Malte', IS: 'Islande',
  MA: 'Maroc', DZ: 'Algérie', TN: 'Tunisie', LY: 'Libye', EG: 'Égypte', MR: 'Mauritanie', SN: 'Sénégal', ML: 'Mali', NE: 'Niger', BF: 'Burkina Faso',
  CI: 'Côte d’Ivoire', GN: 'Guinée', TG: 'Togo', BJ: 'Bénin', TD: 'Tchad', CM: 'Cameroun', GA: 'Gabon', CG: 'Congo', CD: 'RD Congo',
  CF: 'Centrafrique', RW: 'Rwanda', BI: 'Burundi', DJ: 'Djibouti', MG: 'Madagascar', KM: 'Comores', SC: 'Seychelles', MU: 'Maurice', GQ: 'Guinée équatoriale',
  GP: 'Guadeloupe', MQ: 'Martinique', GF: 'Guyane', RE: 'La Réunion', YT: 'Mayotte', PM: 'Saint-Pierre-et-Miquelon', BL: 'Saint-Barthélemy',
  MF: 'Saint-Martin', NC: 'Nouvelle-Calédonie', PF: 'Polynésie française', WF: 'Wallis-et-Futuna', TF: 'Terres australes françaises',
  HT: 'Haïti', CA: 'Canada', US: 'États-Unis', MX: 'Mexique', BR: 'Brésil', AR: 'Argentine', LB: 'Liban', IL: 'Israël', AE: 'Émirats arabes unis',
  SA: 'Arabie saoudite', QA: 'Qatar', IN: 'Inde', CN: 'Chine', JP: 'Japon', VN: 'Viêt Nam', TH: 'Thaïlande', AU: 'Australie', NZ: 'Nouvelle-Zélande', VU: 'Vanuatu',
};

const OK = /^[A-Z]{2}$/;
export function countryName(code: string | null | undefined): string {
  if (!code || !OK.test(code)) return 'Inconnu';
  if (NAMES[code]) return NAMES[code];
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
/** Drapeau (lettres régionales Unicode). */
export function flag(code: string | null | undefined): string {
  if (!code || !OK.test(code)) return '🏳️';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export type CountrySource = 'entete' | 'fuseau' | 'langue';
export const COUNTRY_SOURCE_LABEL: Record<CountrySource, string> = {
  entete: 'd’après l’hébergeur', fuseau: 'd’après le fuseau horaire', langue: 'd’après la langue du navigateur',
};

/**
 * Pays déduit du fuseau horaire, sinon de la région de la langue. « UTC » et les fuseaux
 * génériques ne disent rien : on passe à la langue. Langue sans région : pays inconnu.
 */
export function guessCountry(tz: string | null | undefined, lang: string | null | undefined): { country: string | null; source: CountrySource | null } {
  const byTz = tz ? TZ_COUNTRY[tz] : undefined;
  if (byTz) return { country: byTz, source: 'fuseau' };
  const m = typeof lang === 'string' ? /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(lang) : null;
  if (m) return { country: m[1].toUpperCase(), source: 'langue' };
  return { country: null, source: null };
}
