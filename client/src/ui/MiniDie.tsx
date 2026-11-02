const P: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/** Petit dé vectoriel pour l'historique, les cartes et la barre d'action. */
export function MiniDie({ value, size = 22, kept = false, dim = false, body, pip }: { value: number; size?: number; kept?: boolean; dim?: boolean; body?: string; pip?: string }) {
  return (
    <svg className={`mini-die${kept ? ' kept' : ''}${dim ? ' dim' : ''}`} width={size} height={size} viewBox="0 0 100 100" aria-label={value ? `dé ${value}` : 'dé'}>
      <rect x="4" y="4" width="92" height="92" rx="18" style={body ? { fill: body } : undefined} />
      {(P[value] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={value === 1 ? 12 : 9.5} style={pip ? { fill: pip } : undefined} />)}
    </svg>
  );
}

export function DiceRow({ dice, size = 20, kept }: { dice: number[]; size?: number; kept?: boolean[] }) {
  return (
    <span className="dice-row">
      {dice.map((d, i) => <MiniDie key={i} value={d} size={size} kept={kept?.[i]} />)}
    </span>
  );
}
