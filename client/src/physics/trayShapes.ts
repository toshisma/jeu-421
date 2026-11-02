/**
 * Formes de plateau. Une forme est un polygone convexe (vu de dessus, plan x/z) décrit par
 * ses sommets intérieurs. La physique en tire les parois, le rendu en tire la géométrie 3D.
 * Le rond est un polygone à 32 côtés pour la physique (invisible à l'œil) et un vrai cercle à l'écran.
 */
export type TrayShapeId = 'rectangle' | 'octogone' | 'hexagone' | 'rond' | 'ovale' | 'stade';

export interface TrayShape {
  id: TrayShapeId;
  /** Sommets intérieurs (x, z), sens trigonométrique. */
  verts: [number, number][];
  /** Arêtes : normale sortante (nx, nz) et distance au centre. */
  edges: { nx: number; nz: number; d: number }[];
  /** Demi-étendues (pour cadrer la caméra). */
  halfX: number;
  halfZ: number;
  /** Rayon du cercle visuel (forme ronde uniquement). */
  circleRadius?: number;
}

function fromVerts(id: TrayShapeId, verts: [number, number][], circleRadius?: number): TrayShape {
  const edges = verts.map(([x1, z1], i) => {
    const [x2, z2] = verts[(i + 1) % verts.length];
    // normale sortante d'un polygone parcouru dans le sens trigonométrique (plan x/z)
    let nx = z2 - z1, nz = -(x2 - x1);
    const l = Math.hypot(nx, nz);
    nx /= l; nz /= l;
    if (nx * (x1 + x2) + nz * (z1 + z2) < 0) { nx = -nx; nz = -nz; }
    return { nx, nz, d: nx * x1 + nz * z1 };
  });
  return {
    id, verts, edges, circleRadius,
    halfX: Math.max(...verts.map((v) => Math.abs(v[0]))),
    halfZ: Math.max(...verts.map((v) => Math.abs(v[1]))),
  };
}

/** Polygone régulier de n côtés, d'apothème a, avec un côté plat face à la caméra (+z). */
function regular(id: TrayShapeId, n: number, apothem: number, circle = false): TrayShape {
  const R = apothem / Math.cos(Math.PI / n);
  const off = Math.PI / 2 - Math.PI / n; // un côté perpendiculaire à l'axe z
  const verts = Array.from({ length: n }, (_, k) => {
    const a = off + (k * 2 * Math.PI) / n;
    return [R * Math.cos(a), R * Math.sin(a)] as [number, number];
  });
  return fromVerts(id, verts, circle ? apothem : undefined);
}

/** Ellipse (ovale) approchée par 40 côtés. */
function ellipse(id: TrayShapeId, a: number, b: number, n = 40): TrayShape {
  return fromVerts(id, Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return [a * Math.cos(t), b * Math.sin(t)] as [number, number];
  }));
}
/** Stade : rectangle aux deux bouts arrondis. */
function stadium(id: TrayShapeId, half: number, r: number, seg = 14): TrayShape {
  const v: [number, number][] = [];
  for (let k = 0; k <= seg; k++) { const t = -Math.PI / 2 + (k / seg) * Math.PI; v.push([half + r * Math.cos(t), r * Math.sin(t)]); }
  for (let k = 0; k <= seg; k++) { const t = Math.PI / 2 + (k / seg) * Math.PI; v.push([-half + r * Math.cos(t), r * Math.sin(t)]); }
  return fromVerts(id, v);
}

const HW = 7.5, HD = 4.8;
export const TRAY_SHAPES: Record<TrayShapeId, TrayShape> = {
  rectangle: fromVerts('rectangle', [[-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]]),
  octogone: regular('octogone', 8, 5.7),
  hexagone: regular('hexagone', 6, 5.5),
  rond: regular('rond', 32, 5.8, true),
  ovale: ellipse('ovale', 7.4, 5.1),
  stade: stadium('stade', 3.2, 4.7),
};

export function getShape(id: TrayShapeId | undefined): TrayShape {
  return TRAY_SHAPES[id ?? 'rectangle'] ?? TRAY_SHAPES.rectangle;
}

/** Le point (x, z) est-il à l'intérieur avec au moins `margin` de distance à chaque paroi ? */
export function insideShape(s: TrayShape, x: number, z: number, margin: number): boolean {
  return s.edges.every((e) => e.nx * x + e.nz * z <= e.d - margin);
}

/** Rapproche (x, z) du centre jusqu'à respecter la marge. */
export function clampInside(s: TrayShape, x: number, z: number, margin: number): [number, number] {
  let k = 1;
  while (k > 0 && !insideShape(s, x * k, z * k, margin)) k -= 0.02;
  return [x * Math.max(0, k), z * Math.max(0, k)];
}

/** Contour décalé vers l'extérieur de `off` (même nombre de sommets). */
export function offsetVerts(s: TrayShape, off: number): [number, number][] {
  const n = s.verts.length;
  return s.verts.map((_, i) => {
    // intersection des deux arêtes adjacentes décalées
    const e1 = s.edges[(i - 1 + n) % n], e2 = s.edges[i];
    const d1 = e1.d + off, d2 = e2.d + off;
    const det = e1.nx * e2.nz - e1.nz * e2.nx;
    return [(d1 * e2.nz - d2 * e1.nz) / det, (e1.nx * d2 - e2.nx * d1) / det] as [number, number];
  });
}
