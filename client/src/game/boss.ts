/** Partie contre le patron de la semaine : un ordinateur difficile, avec sa particularité. */
import { DEFAULT_CONFIG, sanitizeConfig } from '../../../shared/config';
import type { BossDef } from '../../../shared/progress/boss';
import { LocalController } from './localController';
import { PERSONAS } from './personas';

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export class BossController extends LocalController {
  readonly boss: BossDef;
  constructor(boss: BossDef, me: { name: string; avatar: string; photo?: string | null; account?: string; title?: string; accessory?: string }) {
    const main = PERSONAS.find((p) => p.id === boss.persona)!;
    const others = PERSONAS.filter((p) => p.id !== boss.persona).sort(() => rnd() - 0.5).slice(0, boss.sidekicks);
    super(sanitizeConfig({ ...DEFAULT_CONFIG, ...boss.config }), [
      { persona: main, difficulty: 'difficile' },
      ...others.map((persona) => ({ persona, difficulty: 'normal' as const })),
    ], me);
    this.boss = boss;
  }
}
