/**
 * Effets animés des dés de collection, ajoutés au matériau physique de three.js (un seul
 * programme pour tous les dés : les dés sans effet ont des intensités nulles).
 *
 * Carte d'effets (voir dieLooks.ts) : R = scintillement, G = phase, B = pulsation / reflet.
 * - scintillement : paillettes, étoiles et facettes s'allument brièvement, chacune à son tour,
 *   et selon l'orientation du dé (elles « accrochent » la lumière quand il roule) ;
 * - pulsation : lueur qui respire (lave, braise, aurore) ;
 * - reflet : bande de lumière qui glisse sur le cadre gravé ou les écailles ;
 * - bord : faux effet de translucidité (résine, verre, glace) éclairé de l'intérieur ;
 * - holo : éclat irisé des brillants, qui change avec l'angle de vue.
 */
import * as THREE from 'three';
import type { LookFinish } from './dieLooks';

export interface DiceFxUniforms {
  uFxMap: { value: THREE.Texture };
  uTime: { value: number };
  uSpark: { value: THREE.Color };
  uPulse: { value: THREE.Color };
  uPulseSpeed: { value: number };
  uGlint: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uHolo: { value: number };
}

let black: THREE.DataTexture | null = null;
const blackTex = () => {
  if (!black) { black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true; }
  return black;
};

/** Ajoute les effets à un matériau de dé ; `time` est partagé par tous les dés d'une scène. */
export function installDiceFx(m: THREE.MeshPhysicalMaterial, time: { value: number }): DiceFxUniforms {
  const u: DiceFxUniforms = {
    uFxMap: { value: blackTex() }, uTime: time,
    uSpark: { value: new THREE.Color(0, 0, 0) }, uPulse: { value: new THREE.Color(0, 0, 0) }, uPulseSpeed: { value: 2 },
    uGlint: { value: new THREE.Color(0, 0, 0) }, uRim: { value: new THREE.Color(0, 0, 0) }, uHolo: { value: 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uFxMap; uniform float uTime; uniform vec3 uSpark; uniform vec3 uPulse; uniform float uPulseSpeed;
uniform vec3 uGlint; uniform vec3 uRim; uniform float uHolo;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  float facing = clamp(dot(normal, V), 0.0, 1.0);
  float fres = pow(1.0 - facing, 3.0);
  vec4 fxs = texture2D(uFxMap, vMapUv);
  float ph = fxs.g * 6.2832;
  // Scintillement : éclairs brefs décalés + reflets qui dépendent de l'orientation du dé.
  float tw = pow(max(0.0, sin(uTime * 2.1 + ph * 9.0)), 14.0);
  float catchL = pow(0.5 + 0.5 * sin(dot(normal, vec3(3.1, 2.3, 1.7)) * 5.0 + ph * 3.0 + uTime * 0.6), 10.0);
  totalEmissiveRadiance += uSpark * fxs.r * (tw * 1.2 + catchL);
  totalEmissiveRadiance += uPulse * fxs.b * (0.5 + 0.5 * sin(uTime * uPulseSpeed + ph));
  float band = 1.0 - abs(fract(fxs.g * 0.8 - uTime * 0.16) * 2.0 - 1.0);
  totalEmissiveRadiance += uGlint * fxs.b * pow(band, 14.0);
  totalEmissiveRadiance += uRim * fres;
  vec3 hue = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + facing * 1.4 + vMapUv.x * 0.7 + vMapUv.y * 0.45 + uTime * 0.12));
  // Irisé : faible de face, plus franc sur la tranche ; dosé selon la clarté du dé pour ne pas le délaver.
  totalEmissiveRadiance += uHolo * hue * (0.015 + 0.28 * fres) * (0.35 + 0.65 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
}`);
  };
  m.customProgramCacheKey = () => 'dice-fx-1';
  return u;
}

/** Règle les effets d'un dé (carte d'effets, intensités selon la qualité). */
export function setDiceFx(u: DiceFxUniforms, fx: THREE.Texture | null, f: LookFinish | null, haute: boolean) {
  u.uFxMap.value = fx ?? blackTex();
  const k = haute ? 1 : 0.85;
  const c = (hex: string, s: number) => new THREE.Color(hex).multiplyScalar(s * k);
  u.uSpark.value = f ? c(f.spark[0], f.spark[1]) : new THREE.Color(0, 0, 0);
  u.uPulse.value = f ? c(f.pulse[0], f.pulse[1]) : new THREE.Color(0, 0, 0);
  u.uPulseSpeed.value = f ? f.pulse[2] : 2;
  u.uGlint.value = f ? c(f.glint[0], f.glint[1]) : new THREE.Color(0, 0, 0);
  u.uRim.value = f ? c(f.rim[0], f.rim[1]) : new THREE.Color(0, 0, 0);
  u.uHolo.value = f ? f.holo * k : 0;
}
