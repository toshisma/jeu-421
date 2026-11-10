/** Partie contre le patron de la semaine : un ordinateur difficile, avec sa particularité. */
import { DEFAULT_CONFIG, sanitizeConfig } from '../../../shared/config';
import type { BossDef } from '../../../shared/progress/boss';
import { LocalController } from './localController';
import { PERSONAS, type Persona } from './personas';

const BOSS_DICE: Record<string, string> = { baron: 'dc-nacre', josiane: 'dc-lave', dede: 'dc-galaxie', simone: 'dc-givre', gege: 'dc-lave', lulu: 'dc-galaxie' };
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export class BossController extends LocalController {
  readonly boss: BossDef;
  /** Personnages à la table (ia-0 : le patron) : répliques et avatars de l'écran de partie. */
  readonly cast: Record<string, Persona>;
  /** `cast` : personnages imposés (adversaires spéciaux de Saint-Nicolas et des fêtes), sinon ceux du patron. */
  constructor(boss: BossDef, me: { name: string; avatar: string; photo?: string | null; account?: string; title?: string; accessory?: string }, cast?: Persona[]) {
    const main = cast?.[0] ?? PERSONAS.find((p) => p.id === boss.persona)!;
    const others = cast ? cast.slice(1, 1 + boss.sidekicks) : PERSONAS.filter((p) => p.id !== boss.persona).sort(() => rnd() - 0.5).slice(0, boss.sidekicks);
    super(sanitizeConfig({ ...DEFAULT_CONFIG, ...boss.config }), [
      { persona: main, difficulty: 'difficile' },
      ...others.map((persona) => ({ persona, difficulty: 'normal' as const })),
    ], me);
    this.boss = boss;
    this.cast = Object.fromEntries([main, ...others].map((p, i) => [`ia-${i}`, p]));
    // Le patron sort ses dés des grands soirs : un dé épique, pour donner envie.
    if (cast) this.meta = this.meta.map((m) => { const p = this.cast[m.id]; return p?.dice ? { ...m, dice: p.dice } : m; });
    else this.meta = this.meta.map((m) => (m.id === 'ia-0' ? { ...m, dice: BOSS_DICE[boss.id] ?? 'dc-galaxie', trail: 'fx-flammes', fete: 'fx-eclair' } : m));
  }
}
