/**
 * Simulation physique des dés (cannon-es), indépendante du rendu et des règles.
 *
 * Principe de fiabilité : le résultat officiel est fourni par le moteur de jeu (ou le serveur).
 * 1. On simule entièrement le lancer à l'avance (gravité, collisions, friction, restitution).
 * 2. On enregistre la trajectoire image par image (60 i/s) et les impacts (pour le son).
 * 3. On lit quelle face de chaque « corps physique » finit vers le haut.
 * 4. On applique au maillage du dé une rotation constante appartenant au groupe de symétrie
 *    du cube (24 rotations), telle que la face portant la valeur officielle soit celle qui
 *    finira en haut. Comme un cube est symétrique, la trajectoire physique est strictement la
 *    même : seule l'étiquetage des faces change. Aucun mouvement artificiel n'est ajouté.
 * 5. On rejoue la trajectoire enregistrée. La face visible correspond exactement au résultat.
 *
 * Un lancer dont un dé finit penché (contre une paroi ou un autre dé) est rejeté et
 * re-simulé avec d'autres paramètres. En dernier recours seulement (très rare), une
 * correction douce est appliquée sur les dernières images pour reposer le dé à plat.
 */
import * as CANNON from 'cannon-es';
import { Quaternion, Vector3 } from 'three';
import { mulberry32 } from '../../../shared/rng';
import { clampInside, getShape, insideShape, type TrayShape, type TrayShapeId } from './trayShapes';

/** Dimensions en « unités dé » (1 unité = arête d'un dé ≈ 16 mm). Formes : voir trayShapes.ts. */
export const TRAY = { width: 15, depth: 9.6, wallHeight: 1.7, wall: 0.9 };
const GRAVITY = 48;
const STEP = 1 / 120; // pas physique
const SUBSTEPS_PER_FRAME = 2; // => 60 images enregistrées par seconde
const MAX_FRAMES = 660; // 11 s maximum
export const PRELUDE_FRAMES = 27; // dés ramassés puis lancés (~0,45 s), raccord sans à-coup avec la physique
export const FPS = 60;

/** Normales locales des faces, dans l'ordre des groupes de BoxGeometry (+X, -X, +Y, -Y, +Z, -Z). */
export const FACE_NORMALS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
/** Valeur portée par chaque face (faces opposées : total 7). */
export const FACE_VALUES = [2, 5, 1, 6, 3, 4];

export type Vec3T = [number, number, number];
export type QuatT = [number, number, number, number];
export interface DiePose { p: Vec3T; q: QuatT }
export type ImpactKind = 'feutre' | 'paroi' | 'de';
import type { ThrowGesture } from '../../../shared/gesture';
export type { ThrowGesture };
export interface SimEvent { frame: number; kind: ImpactKind; strength: number; die: number; x: number }

export interface ThrowResult {
  /** frameCount * n dés * 7 flottants (px,py,pz,qx,qy,qz,qw) — poses des CORPS physiques. */
  frames: Float32Array;
  frameCount: number;
  /** Nombre de dés de la trajectoire. */
  dice: number;
  events: SimEvent[];
  finalPoses: DiePose[];
  /** Rotation à appliquer au maillage de chaque dé relancé (null = dé conservé, inchangé). */
  offsets: (QuatT | null)[];
  attempts: number;
  corrected: boolean;
}

// ---------------------------------------------------------------------------------------------
// Outils de faces

const tmpV = new Vector3();
const tmpQ = new Quaternion();
/** Valeur de la face supérieure pour une orientation visuelle donnée, et sa « planéité » (1 = à plat). */
export function topFace(q: Quaternion): { value: number; upness: number } {
  let best = -2;
  let value = 0;
  for (let i = 0; i < 6; i++) {
    tmpV.set(...FACE_NORMALS[i]).applyQuaternion(q);
    if (tmpV.y > best) { best = tmpV.y; value = FACE_VALUES[i]; }
  }
  return { value, upness: best };
}

function snapAxis(v: Vector3): Vector3 {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return new Vector3(Math.sign(v.x), 0, 0);
  if (ay >= az) return new Vector3(0, Math.sign(v.y), 0);
  return new Vector3(0, 0, Math.sign(v.z));
}

/**
 * Rotation R (membre du groupe de symétrie du cube) telle qu'un maillage orienté par
 * bodyQ * R montre `value` sur la face supérieure.
 */
export function offsetForTop(bodyQ: Quaternion, value: number): Quaternion {
  const localUp = new Vector3(0, 1, 0).applyQuaternion(bodyQ.clone().invert());
  const nu = snapAxis(localUp);
  const nd = new Vector3(...FACE_NORMALS[FACE_VALUES.indexOf(value)]);
  return new Quaternion().setFromUnitVectors(nd, nu);
}

/** Disposition de repos initiale (dés à plat au centre du bac). */
export function restingLayout(seed = 7, count = 3): DiePose[] {
  const rng = mulberry32(seed);
  // 3 dés : disposition historique. Plus de dés : deux rangées.
  const xs = count === 3 ? [-1.8, 0.1, 1.9] : Array.from({ length: count }, (_, i) => (Math.floor(i / 2) - (Math.ceil(count / 2) - 1) / 2) * 1.9 + (i % 2) * 0.35);
  const zs = count === 3 ? [0.4, -0.5, 0.6] : Array.from({ length: count }, (_, i) => (i % 2 ? 0.9 : -0.9) + ((i * 37) % 5 - 2) * 0.08);
  return xs.map((x, i) => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (rng() - 0.5) * 1.2);
    return { p: [x, 0.5, zs[i]] as Vec3T, q: [q.x, q.y, q.z, q.w] as QuatT };
  });
}

// ---------------------------------------------------------------------------------------------
// Simulation

interface Attempt {
  frames: number[]; // poses par image (corps physiques), sans le prélude
  events: SimEvent[];
  ok: boolean;
  score: number;
  starts: DiePose[];
  /** Vitesse linéaire et angulaire (repère monde) de chaque dé au lâcher. */
  launch: ({ v: Vec3T; w: Vec3T } | null)[];
}

function runAttempt(poses: DiePose[], keep: boolean[], seed: number, shape: TrayShape, gesture?: ThrowGesture): Attempt {
  const rng = mulberry32(seed);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  world.allowSleep = true;
  (world.solver as CANNON.GSSolver).iterations = 20;
  world.broadphase = new CANNON.NaiveBroadphase();

  const feltMat = new CANNON.Material('feutre');
  const wallMat = new CANNON.Material('paroi');
  const diceMat = new CANNON.Material('de');
  // La feutrine absorbe : friction forte, rebond modéré. Le bois renvoie davantage.
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, feltMat, { friction: 0.32, restitution: 0.32 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, wallMat, { friction: 0.12, restitution: 0.55 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.15, restitution: 0.42 }));

  const kinds = new Map<CANNON.Body, ImpactKind | number>();

  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, material: feltMat, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  kinds.set(floor, 'feutre');

  // Parois physiques plus hautes que les rebords visuels : un dé ne peut jamais sortir du bac.
  const H = 10;
  const t = TRAY.wall;
  // Une paroi par arête de la forme, prolongée aux extrémités pour fermer les coins.
  shape.edges.forEach((e, i) => {
    const [x1, z1] = shape.verts[i];
    const [x2, z2] = shape.verts[(i + 1) % shape.verts.length];
    const half = Math.hypot(x2 - x1, z2 - z1) / 2 + t;
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMat, shape: new CANNON.Box(new CANNON.Vec3(half, H / 2, t / 2)) });
    b.position.set((x1 + x2) / 2 + e.nx * t / 2, H / 2, (z1 + z2) / 2 + e.nz * t / 2);
    // rotation autour de y amenant l'axe local z sur la normale (nx, nz)
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(e.nx, e.nz));
    world.addBody(b);
    kinds.set(b, 'paroi');
  });
  const ceiling = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMat, shape: new CANNON.Plane() });
  ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  ceiling.position.set(0, H, 0);
  world.addBody(ceiling);
  kinds.set(ceiling, 'paroi');

  // Paramètres du lancer : les dés partent du bord opposé à la direction du geste, vers le centre.
  let angle: number, power: number;
  if (gesture) {
    angle = gesture.angle + (rng() - 0.5) * 0.12;
    power = gesture.power;
  } else {
    angle = (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.3;
    power = 1;
  }
  const ux = Math.cos(angle), uz = Math.sin(angle); // direction du lancer
  const px = -uz, pz = ux; // perpendiculaire
  const back = Math.max(...shape.verts.map(([x, z]) => -(x * ux + z * uz)));
  const side = Math.max(...shape.verts.map(([x, z]) => Math.abs(x * px + z * pz)));
  // Moins de place dans la direction du lancer (petit côté) : élan proportionnellement réduit.
  const span = back + Math.max(...shape.verts.map(([x, z]) => x * ux + z * uz));
  const room = Math.min(1, Math.max(0.6, span / 15));
  const N = poses.length;
  const rolled = poses.map((_, i) => i).filter((i) => !keep[i]);
  const slots: number[] = [];
  for (const _ of rolled) {
    let o = 0;
    for (let k = 0; k < 30; k++) {
      o = (rng() - 0.5) * Math.max(1, Math.min(side * 2 - 3, 6.6));
      if (slots.every((v) => Math.abs(v - o) > 1.35)) break;
    }
    slots.push(o);
  }

  const bodies: CANNON.Body[] = [];
  const starts: DiePose[] = poses.map((p) => ({ p: [...p.p] as Vec3T, q: [...p.q] as QuatT }));
  const launch: Attempt['launch'] = poses.map(() => null);
  const events: SimEvent[] = [];
  let frame = 0;

  for (let i = 0; i < N; i++) {
    const box = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
    let body: CANNON.Body;
    if (keep[i]) {
      body = new CANNON.Body({ type: CANNON.Body.STATIC, material: diceMat, shape: box });
      body.position.set(...poses[i].p);
      body.quaternion.set(...poses[i].q);
    } else {
      const k = rolled.indexOf(i);
      body = new CANNON.Body({ mass: 1, material: diceMat, shape: box, linearDamping: 0.1, angularDamping: 0.1 });
      body.sleepSpeedLimit = 0.12;
      body.sleepTimeLimit = 0.35;
      // Départ près du bord opposé à la direction du lancer (rapproché du centre si la forme l'exige).
      const d = back - 1.7 - rng() * 0.6;
      const [x, z] = clampInside(shape, -ux * d + px * slots[k], -uz * d + pz * slots[k], 1.7);
      const y = 2.9 + rng() * 0.7 + k * 0.25;
      body.position.set(x, y, z);
      const q = new CANNON.Quaternion();
      q.setFromEuler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
      body.quaternion.copy(q);
      const speed = (10 + rng() * 6) * power * room;
      const lat = (rng() - 0.5) * 5 - slots[k] * 0.5; // léger resserrement vers l'axe du lancer
      body.velocity.set(ux * speed + px * lat, -1.5 + rng() * 2, uz * speed + pz * lat);
      const spin = 36 * (0.6 + 0.4 * power);
      body.angularVelocity.set((rng() - 0.5) * spin, (rng() - 0.5) * spin, (rng() - 0.5) * spin);
      starts[i] = { p: [x, y, z], q: [q.x, q.y, q.z, q.w] };
      launch[i] = {
        v: [body.velocity.x, body.velocity.y, body.velocity.z],
        w: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z],
      };
      // Enregistrement des impacts pour le son.
      body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        const other = kinds.get(e.body);
        const strength = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (strength < 0.7) return;
        let kind: ImpactKind;
        if (typeof other === 'number') {
          // Collision dé-dé : on ne l'enregistre qu'une fois.
          if (!keep[other] && other < i) return;
          kind = 'de';
        } else kind = other ?? 'feutre';
        events.push({ frame, kind, strength, die: i, x: body.position.x });
      });
    }
    kinds.set(body, i);
    world.addBody(body);
    bodies.push(body);
  }

  const frames: number[] = [];
  const pushFrame = () => {
    for (const b of bodies) frames.push(b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  };
  pushFrame();
  let still = 0;
  while (frame < MAX_FRAMES) {
    for (let s = 0; s < SUBSTEPS_PER_FRAME; s++) world.step(STEP);
    frame++;
    pushFrame();
    const moving = bodies.some((b, i) => !keep[i] && b.sleepState !== CANNON.Body.SLEEPING &&
      (b.velocity.length() > 0.06 || b.angularVelocity.length() > 0.08));
    still = moving ? 0 : still + 1;
    if (still >= 8) break;
  }

  // Validation : chaque dé relancé doit reposer à plat sur la feutrine, dans le bac.
  let ok = still >= 8;
  let score = ok ? 1 : 0;
  for (const i of rolled) {
    const b = bodies[i];
    const q = new Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const { upness } = topFace(q);
    // Un dé collé à une paroi serait en partie masqué par le rebord : on veut sa face lisible.
    const inside = insideShape(shape, b.position.x, b.position.z, 1.0);
    const onFloor = b.position.y < 0.62;
    if (upness < 0.985 || !inside || !onFloor) ok = false;
    score = Math.min(score + upness, score + upness - (onFloor ? 0 : 1));
  }
  return { frames, events, ok, score, starts, launch };
}

function slerpQ(a: QuatT, b: QuatT, t: number): QuatT {
  const q = new Quaternion(...a).slerp(new Quaternion(...b), t);
  return [q.x, q.y, q.z, q.w];
}

/** Geste de ramassage puis lâcher (voir commentaire dans le corps). */
function buildPrelude(poses: DiePose[], keep: boolean[], att: Attempt): number[] {
  const prelude: number[] = [];
  // Prélude : les dés relancés sont ramassés puis lancés. La fin du prélude raccorde
  // exactement la position, la vitesse ET la rotation du premier instant de la simulation :
  // aucun arrêt en l'air, aucune accélération brutale au moment du lâcher.
  const T = PRELUDE_FRAMES / FPS;
  for (let f = 0; f < PRELUDE_FRAMES; f++) {
    const t = f / PRELUDE_FRAMES;
    const e = t * t * (3 - 2 * t); // vitesse nulle au départ et à l'arrivée
    for (let i = 0; i < poses.length; i++) {
      const from = poses[i];
      const L = keep[i] ? null : att.launch[i];
      if (!L) { prelude.push(...from.p, ...from.q); continue; }
      const to = att.starts[i];
      // Position : courbe d'Hermite quintique. Départ : immobile, sans accélération.
      // Arrivée : position, vitesse ET accélération (gravité) exactes du premier instant physique.
      const t3 = t ** 3, t4 = t ** 4, t5 = t ** 5;
      const hP0 = 1 - 10 * t3 + 15 * t4 - 6 * t5;
      const hP1 = 10 * t3 - 15 * t4 + 6 * t5;
      const hV1 = -4 * t3 + 7 * t4 - 3 * t5;
      const hA1 = 0.5 * t3 - t4 + 0.5 * t5;
      const acc = [0, -GRAVITY, 0];
      const pos = [0, 1, 2].map((k) => hP0 * from.p[k] + hP1 * to.p[k] + hV1 * L.v[k] * T + hA1 * acc[k] * T * T);
      // Rotation : un « fond » qui glisse du repos vers l'orientation de lancer (vitesse nulle aux
      // deux bouts), multiplié par une rotation autour de l'axe de lancer qui accélère depuis 0
      // jusqu'à la vitesse angulaire exacte du lâcher.
      const w = new Vector3(...L.w);
      const speed = w.length();
      const axis = speed > 1e-6 ? w.clone().divideScalar(speed) : new Vector3(0, 1, 0);
      const spin = (theta: number) => new Quaternion().setFromAxisAngle(axis, theta);
      const theta0 = -speed * T / 2; // θ(t) = speed·T·(t² − 1)/2 : θ'(0) = 0, θ'(1) = speed·T
      const base0 = spin(-theta0).multiply(new Quaternion(...from.q)); // pour que q(0) = repos
      const base = base0.slerp(new Quaternion(...to.q), e);
      const q = spin(speed * T * (t * t - 1) / 2).multiply(base);
      prelude.push(...pos, q.x, q.y, q.z, q.w);
    }
  }
  return prelude;
}

/** Le geste reste-t-il à l'écart des rebords ? */
function preludeInside(prelude: number[], shape: TrayShape): boolean {
  for (let o = 0; o < prelude.length; o += 7) if (!insideShape(shape, prelude[o], prelude[o + 2], 0.45)) return false;
  return true;
}

/**
 * Simule un lancer. `poses` = poses actuelles des corps des 3 dés, `keep` = dés conservés
 * (immobiles), `values` = valeurs officielles à obtenir, `seed` = graine de la trajectoire
 * (identique pour tous les joueurs en ligne : tout le monde voit le même lancer).
 */
export function simulateThrow(poses: DiePose[], keep: boolean[], values: number[], seed: number, shapeId: TrayShapeId = 'rectangle', gesture?: ThrowGesture): ThrowResult {
  const shape = getShape(shapeId);
  let best: Attempt | null = null;
  let attempts = 0;
  for (let a = 0; a < 14; a++) {
    attempts++;
    const att = runAttempt(poses, keep, (seed + a * 7919) >>> 0, shape, gesture);
    if (att.ok && !preludeInside(buildPrelude(poses, keep, att), shape)) att.ok = false;
    if (att.ok) { best = att; break; }
    if (!best || att.score > best.score) best = att;
  }
  const att = best!;
  const N = poses.length, W = N * 7;
  const simFrames = att.frames.length / W;
  let corrected = false;

  // Correction de dernier recours : on repose doucement à plat les dés mal posés.
  const tail: number[] = [];
  if (!att.ok) {
    corrected = true;
    const last = att.frames.slice((simFrames - 1) * W);
    const target = [...last];
    for (let i = 0; i < N; i++) {
      if (keep[i]) continue;
      const o = i * 7;
      const q = new Quaternion(last[o + 3], last[o + 4], last[o + 5], last[o + 6]);
      // Rotation minimale amenant la face la plus haute exactement vers le haut.
      let bestN = new Vector3();
      let by = -2;
      for (const n of FACE_NORMALS) {
        const w = new Vector3(...n).applyQuaternion(q);
        if (w.y > by) { by = w.y; bestN = w; }
      }
      const fix = new Quaternion().setFromUnitVectors(bestN.normalize(), new Vector3(0, 1, 0));
      const flat = fix.multiply(q);
      [target[o], target[o + 2]] = clampInside(shape, last[o], last[o + 2], 1.05);
      target[o + 1] = 0.5;
      [target[o + 3], target[o + 4], target[o + 5], target[o + 6]] = [flat.x, flat.y, flat.z, flat.w];
    }
    const STEPS = 14;
    for (let f = 1; f <= STEPS; f++) {
      const t = f / STEPS;
      const e = t * t * (3 - 2 * t);
      for (let i = 0; i < N; i++) {
        const o = i * 7;
        tail.push(
          last[o] + (target[o] - last[o]) * e,
          last[o + 1] + (target[o + 1] - last[o + 1]) * e,
          last[o + 2] + (target[o + 2] - last[o + 2]) * e,
          ...slerpQ([last[o + 3], last[o + 4], last[o + 5], last[o + 6]], [target[o + 3], target[o + 4], target[o + 5], target[o + 6]], e),
        );
      }
    }
  }

  const prelude = buildPrelude(poses, keep, att);

  const all = new Float32Array(prelude.length + att.frames.length + tail.length);
  all.set(prelude, 0);
  all.set(att.frames, prelude.length);
  all.set(tail, prelude.length + att.frames.length);
  const frameCount = all.length / W;

  const lastOff = (frameCount - 1) * W;
  const finalPoses: DiePose[] = poses.map((_, i) => {
    const o = lastOff + i * 7;
    return { p: [all[o], all[o + 1], all[o + 2]], q: [all[o + 3], all[o + 4], all[o + 5], all[o + 6]] };
  });
  const offsets = finalPoses.map((pose, i) => {
    if (keep[i]) return null;
    const r = offsetForTop(new Quaternion(...pose.q), values[i]);
    return [r.x, r.y, r.z, r.w] as QuatT;
  });

  return {
    frames: all,
    frameCount,
    dice: N,
    events: att.events.map((e) => ({ ...e, frame: e.frame + PRELUDE_FRAMES })),
    finalPoses,
    offsets,
    attempts,
    corrected,
  };
}

/** Lit une pose (corps) à un instant fractionnaire de la trajectoire, avec interpolation. */
export function samplePose(r: ThrowResult, frame: number, die: number, outP: Vector3, outQ: Quaternion): void {
  const f = Math.max(0, Math.min(r.frameCount - 1, frame));
  const i0 = Math.floor(f);
  const i1 = Math.min(r.frameCount - 1, i0 + 1);
  const t = f - i0;
  const W = r.dice * 7;
  const a = i0 * W + die * 7;
  const b = i1 * W + die * 7;
  const F = r.frames;
  outP.set(F[a] + (F[b] - F[a]) * t, F[a + 1] + (F[b + 1] - F[a + 1]) * t, F[a + 2] + (F[b + 2] - F[a + 2]) * t);
  outQ.set(F[a + 3], F[a + 4], F[a + 5], F[a + 6]);
  if (t > 0) outQ.slerp(tmpQ.set(F[b + 3], F[b + 4], F[b + 5], F[b + 6]), t);
}

/**
 * Dés gardés posés au bord du bac (paroi du fond, côté −z : bien visible), alignés côte à côte.
 * Calcul déterministe à partir des positions de repos : tous les joueurs obtiennent exactement
 * les mêmes positions, donc la même trajectoire pour le lancer suivant. Les dés relancés restent
 * à leur place. Les emplacements évitent les dés non gardés.
 */
export function parkPoses(home: DiePose[], keep: boolean[], shapeId: TrayShapeId = 'rectangle'): DiePose[] {
  const shape = getShape(shapeId);
  const all = home.map((_, i) => i);
  const kept = all.filter((i) => keep[i]);
  const out = home.map((p) => ({ p: [...p.p] as Vec3T, q: [...p.q] as QuatT }));
  if (!kept.length) return out;
  const others = all.filter((i) => !keep[i]).map((i) => home[i].p);
  const GAP = 1.3;
  const MARGIN = 0.62; // le dé touche presque la paroi
  const slotZ = (x: number) => {
    let z = -(shape.halfZ - MARGIN);
    while (z < 0 && !insideShape(shape, x, z, MARGIN)) z += 0.05;
    return z;
  };
  for (const shift of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6]) {
    const xs = kept.map((_, k) => shift + (k - (kept.length - 1) / 2) * GAP);
    const slots = xs.map((x) => [x, slotZ(x)] as const);
    const fits = slots.every(([x, z]) => z < 0 && insideShape(shape, x, z, MARGIN - 0.01))
      && slots.every(([x, z]) => others.every((o) => Math.hypot(o[0] - x, o[2] - z) > 1.2));
    if (!fits) continue;
    kept.forEach((i, k) => {
      // Le dé glisse sans basculer : même face sur le dessus, simplement tourné pour s'aligner.
      const q = new Quaternion(...home[i].q);
      const up = new Vector3(0, 1, 0);
      let best = new Vector3(); let by = -2;
      for (const n of FACE_NORMALS) { const w = new Vector3(...n).applyQuaternion(q); if (w.y > by) { by = w.y; best = w; } }
      const flat = new Quaternion().setFromUnitVectors(best.normalize(), up).multiply(q);
      // alignement sur l'axe x : on annule la rotation autour de la verticale (par pas de 90°)
      const side = new Vector3(1, 0, 0).applyQuaternion(flat);
      const yaw = Math.atan2(-side.z, side.x);
      const snap = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
      const aligned = new Quaternion().setFromAxisAngle(up, snap - yaw).multiply(flat);
      out[i] = { p: [slots[k][0], 0.5, slots[k][1]], q: [aligned.x, aligned.y, aligned.z, aligned.w] };
    });
    return out;
  }
  return out; // aucune place libre : les dés gardés restent où ils sont
}
