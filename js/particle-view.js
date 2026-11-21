// 粒子の描画（three.js Points）
import * as THREE from 'three';
import { createParticles, updateParticles, setParticleAspect, KIND } from './particles.js';

const vert = `
attribute float aSize; attribute float aKind; attribute float aPhase;
uniform float uTime; uniform float uScale;
varying float vKind; varying float vTw;
void main() {
  vKind = aKind;
  vTw = 0.6 + 0.4 * sin(uTime * 0.9 + aPhase * 3.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const frag = `
varying float vKind; varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  if (vKind < 0.5) { // プランクトン：小さく淡く光る
    float a = pow(1.0 - d * 2.0, 2.0) * vTw;
    gl_FragColor = vec4(vec3(0.35, 0.8, 0.9) * (0.7 + vTw * 0.6), a * 0.8);
  } else { // 泡：細い縁と淡い芯
    float rim = smoothstep(0.35, 0.48, d) * (1.0 - smoothstep(0.48, 0.5, d));
    float a = rim * 0.7 + (1.0 - d * 2.0) * 0.08;
    gl_FragColor = vec4(vec3(0.6, 0.85, 1.0), a);
  }
}`;

export function createParticleSystem(tier, rng, aspect, pixelRatio = 1) {
  const data = createParticles(tier, rng, aspect);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(data.pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aSize', new THREE.BufferAttribute(data.size, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(Float32Array.from(data.kind), 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(data.phase, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uTime: { value: 0 }, uScale: { value: 60 * pixelRatio } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    data,
    update(t, dt) {
      updateParticles(data, t, dt);
      posAttr.needsUpdate = true;
      mat.uniforms.uTime.value = t;
    },
    // 自動減数：先頭から n 個だけ描く（泡は先頭側に並ぶので、泡が先に残る）
    setActive(n) { geo.setDrawRange(0, Math.max(0, Math.min(data.count, n))); },
    setAspect(a) { setParticleAspect(data, a); },
  };
}
export { KIND };
