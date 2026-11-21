import * as THREE from 'three';
import { PULSE, pulseCurve, thrust } from './pulse.js';
import { SPECIES, SPECIES_ORDER, halfExtent, viewExtent, thrustScale } from './species.js';

// 傘は1つのジオメトリ。脈動は頂点シェーダー（aContract）で行う
const BELL_VERT = /* glsl */`
attribute float aContract;
attribute float aGlow;
varying float vRim;
varying vec3 vNormal;
varying vec3 vView;
varying float vGlow;
uniform float uBellH;
void main() {
  vec3 p = position;
  float h = clamp(p.y, 0.0, 1.0);
  float rim = 1.0 - h;
  vRim = rim;
  p.xz *= 1.0 - aContract * (0.22 + 0.2 * rim);
  p.y *= (1.0 + aContract * 0.12) * uBellH;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vView = -mv.xyz;
  vGlow = aGlow;
  gl_Position = projectionMatrix * mv;
}`;

const BELL_FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uGlow;
varying float vRim;
varying vec3 vNormal;
varying vec3 vView;
varying float vGlow;
void main() {
  float fres = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  float edge = clamp(0.25 * fres + 0.75 * pow(vRim, 2.0), 0.0, 1.0);
  vec3 col = mix(uColor * 0.7, uRimColor, edge);
  float a = (0.08 + 0.7 * edge) * uGlow * vGlow;
  gl_FragColor = vec4(col * (0.6 + edge), a);
}`;

// 触手: 線分。個体ごとの位置・大きさ・収縮は instanced attribute
const TENT_VERT = /* glsl */`
attribute vec3 iPos;      // 個体の位置
attribute vec2 iSizeRoll; // 大きさ, z 回転
attribute float iContract;
uniform float uTime;
uniform float uLen;
uniform float uSway;
varying float vFade;
void main() {
  // position = (角度, 先端への割合 f, 触手番号)
  float a = position.x, f = position.y, i = position.z;
  float c = iContract;
  float r = 0.9 * (1.0 - c * 0.25);
  float sway = sin(uTime * 1.6 - f * 3.0 + i) * uSway * f;
  vec3 p = vec3(
    cos(a) * r * (1.0 - f * 0.4) + sway,
    -0.02 - f * uLen * (1.0 - c * 0.15),
    sin(a) * r * (1.0 - f * 0.4) + cos(uTime * 1.3 - f * 3.0 + i * 1.7) * uSway * f);
  float s = iSizeRoll.x, cr = cos(iSizeRoll.y), sr = sin(iSizeRoll.y);
  p *= s;
  p.xy = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);
  vec4 mv = modelViewMatrix * vec4(p + iPos, 1.0);
  vFade = (1.0 - f) * 0.7;
  gl_Position = projectionMatrix * mv;
}`;

const TENT_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vFade;
void main() { gl_FragColor = vec4(uColor * vFade, vFade); }`;

const SEG = 10;

function makeSpeciesGroup(name, list) {
  const sp = SPECIES[name];
  const n = list.length;
  const geo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const contract = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
  contract.setUsage(THREE.DynamicDrawUsage); glow.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aContract', contract);
  geo.setAttribute('aGlow', glow);
  const bellMat = new THREE.ShaderMaterial({
    uniforms: {
      uBellH: { value: sp.bellHeight }, uGlow: { value: sp.glow },
      uColor: { value: new THREE.Vector3(...sp.color) }, uRimColor: { value: new THREE.Vector3(...sp.rim) },
    },
    vertexShader: BELL_VERT, fragmentShader: BELL_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const bell = new THREE.InstancedMesh(geo, bellMat, n);
  bell.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bell.frustumCulled = false;

  // 触手ジオメトリ（全個体で共通の基本形を instanced で描く）
  const base = new Float32Array(sp.tentacles * SEG * 2 * 3);
  let k = 0;
  for (let i = 0; i < sp.tentacles; i++) {
    const a = (i / sp.tentacles) * Math.PI * 2;
    for (let s = 0; s < SEG; s++) for (let e = 0; e < 2; e++) {
      base[k++] = a; base[k++] = (s + e) / SEG; base[k++] = i;
    }
  }
  const tgeo = new THREE.InstancedBufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  tgeo.instanceCount = n;
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const iSizeRoll = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  iPos.setUsage(THREE.DynamicDrawUsage); iSizeRoll.setUsage(THREE.DynamicDrawUsage);
  tgeo.setAttribute('iPos', iPos);
  tgeo.setAttribute('iSizeRoll', iSizeRoll);
  tgeo.setAttribute('iContract', contract); // 傘と共有
  const tentMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: sp.tentacleLen }, uSway: { value: sp.sway },
      uColor: { value: new THREE.Vector3(...sp.color) } },
    vertexShader: TENT_VERT, fragmentShader: TENT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const tentacles = new THREE.LineSegments(tgeo, tentMat);
  tentacles.frustumCulled = false;
  return { name, sp, list, bell, tentacles, contract, glow, iPos, iSizeRoll, tentMat };
}

// placements: placeJellies の戻り値
export function createJellies(placements, aspect) {
  const root = new THREE.Group();
  const groups = SPECIES_ORDER.map((name) => {
    const list = placements.filter((p) => p.species === name).map((p) => ({
      ...p, y0: p.y, vy: 0, yy: p.y,
    }));
    if (!list.length) return null;
    const g = makeSpeciesGroup(name, list);
    root.add(g.bell, g.tentacles);
    return g;
  }).filter(Boolean);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(),
    sv = new THREE.Vector3(), ez = new THREE.Vector3(0, 0, 1);
  let asp = aspect;
  function update(time, dt) {
    for (const g of groups) {
      const { sp, list } = g;
      const act = g.active ?? list.length;
      g.bell.count = act; g.tentacles.geometry.instanceCount = act;
      list.forEach((j, i) => {
        if (i >= act && !j.fixed) return; // 自動減数：先頭から active 個だけ描く
        const period = PULSE.period / sp.pulseScale;
        const phase = time / period + j.phase;
        const c = pulseCurve(phase);
        // 収縮で上へ押され、抵抗で減速、ゆっくり沈む（サイズが大きいほど控えめ）
        if (j.fixed) { // 外部制御（イベント用）：位置は j.x / j.y / j.z をそのまま使う
          if (!j.visible) { j.size = 0.0001; }
          const rollF = Math.sin(time * 0.23 + j.drift) * 0.05;
          q.setFromAxisAngle(ez, rollF);
          pv.set(j.x, j.y, j.z); sv.set(j.size, j.size, j.size);
          m.compose(pv, q, sv);
          g.bell.setMatrixAt(i, m);
          g.contract.setX(i, c); g.glow.setX(i, 0.85 + 0.3 * c);
          g.iPos.setXYZ(i, j.x, j.y, j.z); g.iSizeRoll.setXY(i, j.size, rollF);
          return;
        }
        j.vy += thrust(phase) * thrustScale(time, asp) * 2.2 * dt * sp.pulseScale * (0.6 + 0.4 * j.size) - 0.12 * dt;
        j.vy *= Math.exp(-1.1 * dt);
        j.yy += j.vy * dt;
        const ext = asp < 1 ? viewExtent(j.z, asp) : halfExtent(j.z, asp);
        const lim = ext.h + j.size * (1 + sp.tentacleLen) + 0.5;
        if (j.yy > lim) j.yy = -lim;
        const x = j.x + Math.sin(time * 0.17 + j.drift) * 0.6 * j.size * 2;
        const roll = Math.sin(time * 0.23 + j.drift) * 0.08;
        q.setFromAxisAngle(ez, roll);
        pv.set(x, j.yy, j.z);
        sv.set(j.size, j.size, j.size);
        m.compose(pv, q, sv);
        g.bell.setMatrixAt(i, m);
        g.contract.setX(i, c);
        g.glow.setX(i, 0.85 + 0.3 * c);
        j.cx = x; // 現在の描画位置（撮影モードのピント判定用）
        g.iPos.setXYZ(i, x, j.yy, j.z);
        g.iSizeRoll.setXY(i, j.size, roll);
      });
      g.bell.instanceMatrix.needsUpdate = true;
      g.contract.needsUpdate = true; g.glow.needsUpdate = true;
      g.iPos.needsUpdate = true; g.iSizeRoll.needsUpdate = true;
      g.tentMat.uniforms.uTime.value = time;
    }
  }
  return { group: root, items: groups.flatMap((g) => g.list),
    // 自動減数：種ごとの表示数を { mizukurage: n, ... } で指定する
    setActive(counts) { for (const g of groups) g.active = Math.min(g.list.length, counts[g.name] ?? g.list.length); },
    activeItems() { return groups.flatMap((g) => g.list.slice(0, g.active ?? g.list.length)); },
    update, setAspect: (a) => { asp = a; } };
}
