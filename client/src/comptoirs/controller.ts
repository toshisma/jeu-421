/** Partie de la Tournée des comptoirs : le moteur du solo, avec les règles maison et les gens du bistrot. */
import { tdcConfig, tdcPatron, type TdcBistro } from '../../../shared/progress/comptoirs';
import type { MessageKey } from '../../../shared/i18n';
import { tr } from '../i18n/lang';
import { LocalController } from '../game/localController';
import { PERSONAS, type Persona } from '../game/personas';

/** Personnage d'un patron de bistrot (ses phrases dans la langue du joueur). */
export function patronPersona(id: string): Persona | undefined {
  const p = tdcPatron(id);
  if (!p) return undefined;
  const k = (s: string) => tr(`tdc.p.${id}.${s}` as MessageKey);
  return {
    id: p.id, name: p.name, avatar: p.avatar, color: p.color, tempo: p.tempo, style: { caution: p.caution }, dice: p.dice,
    tagline: tr(`tdc.p.${id}` as MessageKey),
    lines: { big: [k('big')], good: [k('good')], bad: [k('bad')], think: [k('think')] },
  };
}
/** Personnage d'un adversaire : patron de bistrot ou habitué du 421. */
export const tdcPersona = (id: string): Persona => patronPersona(id) ?? PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];

export class TdcController extends LocalController {
  readonly bistro: TdcBistro;
  readonly personas: Record<string, Persona>;
  constructor(b: TdcBistro, me: { name: string; avatar: string; photo?: string | null; account?: string; title?: string; accessory?: string }) {
    const opps = b.opponents.map((o) => ({ persona: tdcPersona(o.persona), difficulty: o.difficulty }));
    super(tdcConfig(b), opps, me);
    this.bistro = b;
    this.personas = Object.fromEntries(opps.map((o, i) => [`ia-${i}`, o.persona]));
    // Les patrons lancent leurs propres dés.
    this.meta = this.meta.map((m, i) => (i > 0 && opps[i - 1].persona.dice ? { ...m, dice: opps[i - 1].persona.dice } : m));
  }
}
