import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SCENE, BLOOM, TIERS, PARTICLE_TIERS } from './config.js';
import { createPerfMonitor, scaledCount, scaledTotal } from './perf.js';
import { createRng } from './rng.js';
import { pickTier, pixelRatioFor, placeJellies, halfExtent, CAMERA_Z } from './species.js';
import { createEventController } from './event.js';
import { createJellies } from './jellyfish.js';
import { createParticleSystem } from './particle-view.js';
import { createCameraController } from './camera.js';
import { PHOTO, easeToward, pickFocus, vignetteCss, vignetteStops, saveFilename } from './photo.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const tier = pickTier(window.innerWidth, coarse);
const pixelRatio = pixelRatioFor(tier, window.devicePixelRatio); // PC 最大2、スマホ 1.5
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SCENE.background);
scene.fog = new THREE.FogExp2(SCENE.fog, SCENE.fogDensity);

const camera = new THREE.PerspectiveCamera(SCENE.fov, 1, SCENE.near, SCENE.far);
camera.position.set(0, 0, CAMERA_Z);
const cam = createCameraController();

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const aspect0 = window.innerWidth / window.innerHeight;
const jellies = createJellies(placeJellies(tier, createRng((Date.now() & 0xffffff) | 1), aspect0), aspect0);
scene.add(jellies.group);
const particles = createParticleSystem(tier, createRng(((Date.now() >> 3) & 0xffffff) | 1), aspect0, pixelRatio);
scene.add(particles.points);

// 巨大クラゲの横切りイベント（本体は専用の1匹。普段は見えない大きさにしておく）
const ev = createEventController(createRng(((Date.now() >> 5) & 0xffffff) | 1));
const giantEv = createJellies([{ species: 'giant', size: 0.0001, x: 0, y: 0, z: -20, phase: 0, drift: 1, fixed: true, visible: false }], aspect0);
scene.add(giantEv.group);
const evJelly = giantEv.items[0];
const veil = document.getElementById('veil');
const beam = document.getElementById('beam');
document.getElementById('summon').addEventListener('click', () => { ev.trigger(); });
let aspectNow = aspect0;

// 自動減数：FPS が下がったら個体数と粒子を段階的に減らし、安定したら戻す
const perf = createPerfMonitor();
function applyLevel(level) {
  const counts = {};
  for (const [name, n] of Object.entries(TIERS[tier].counts)) counts[name] = scaledCount(n, level);
  jellies.setActive(counts);
  particles.setActive(scaledTotal(PARTICLE_TIERS[tier].total, level));
}
applyLevel(0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  // ブルームの解像度は半分
  bloom.resolution.set(w * BLOOM.resolutionScale, h * BLOOM.resolutionScale);
  bloom.setSize(w * BLOOM.resolutionScale, h * BLOOM.resolutionScale);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  cam.setAspect(camera.aspect);
  jellies.setAspect(camera.aspect);
  giantEv.setAspect(camera.aspect);
  aspectNow = camera.aspect;
  particles.setAspect(camera.aspect);
}
window.addEventListener('resize', resize);
resize();

// 操作：ドラッグ／スワイプで少しだけ向きを変える、ピンチ・ホイールでズーム（すべて制限つき）
const pointers = new Map();
let tap = { x: 0, y: 0, ok: false };
let pinchDist = 0;
const pinchSpan = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { cam.dragStart(); tap = { x: e.clientX, y: e.clientY, ok: true }; }
  else tap.ok = false;
  if (pointers.size === 2) pinchDist = pinchSpan();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (tap.ok && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.ok = false;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) cam.drag(dx, dy);
  else if (pointers.size === 2) {
    const d = pinchSpan();
    if (pinchDist > 0 && d > 0) cam.zoomBy(pinchDist / d); // 指を広げると近づく
    pinchDist = d;
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) cam.release();
  else if (pointers.size === 1) pinchDist = 0;
};
canvas.addEventListener('pointerup', (e) => {
  if (tap.ok && pointers.size === 1 && photoMode) onPhotoTap(e.clientX, e.clientY);
  tap.ok = false;
  endPointer(e);
});
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.zoomBy(Math.exp(e.deltaY * 0.001));
}, { passive: false });

// 撮影モード：UI を隠し、時間を 0.5 倍にし、タップしたクラゲにピントを合わせる（暗いビネット）
const $ = (id) => document.getElementById(id);
const focusEl = $('focus'), toolbar = $('toolbar'), toast = $('toast');
let photoMode = false, timeScale = 1, simTime = 0;
let focusTarget = null, focusStrength = 0, fx = 0, fy = 0, uiTimer = 0, toastTimer = 0;

function showToast(msg) {
  toast.textContent = msg; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}
function wakeToolbar() {
  toolbar.classList.remove('idle');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => toolbar.classList.add('idle'), PHOTO.uiHideMs);
}
function setPhotoMode(on) {
  photoMode = on;
  document.body.classList.toggle('photo-mode', on);
  toolbar.hidden = !on;
  focusTarget = null;
  if (on) wakeToolbar(); else { clearTimeout(uiTimer); toast.hidden = true; }
}
const screenOf = (j) => {
  const v = new THREE.Vector3(j.cx ?? j.x, j.yy ?? j.y, j.z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
};
function onPhotoTap(x, y) {
  wakeToolbar();
  const pts = jellies.activeItems().map((j) => ({ j, ...screenOf(j) })).filter((p) => p.x > -50 && p.x < window.innerWidth + 50);
  const hit = pickFocus(pts, x, y, Math.min(window.innerWidth, window.innerHeight));
  if (hit) { if (!focusTarget) { fx = hit.x; fy = hit.y; } focusTarget = hit.j; } else focusTarget = null;
}
$('photo').addEventListener('click', () => setPhotoMode(true));
$('exit').addEventListener('click', () => setPhotoMode(false));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && photoMode) setPhotoMode(false); });
canvas.addEventListener('pointermove', () => { if (photoMode) wakeToolbar(); });

// ビネットを重ねた画像を作る（保存の直前に1フレーム描画してから取得。preserveDrawingBuffer は使わない）
function captureBlob() {
  composer.render();
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const g = out.getContext('2d');
  g.drawImage(canvas, 0, 0);
  if (focusStrength > 0.001) {
    const k = out.width / window.innerWidth, r = Math.hypot(out.width, out.height) / 2;
    const grad = g.createRadialGradient(fx * k, fy * k, 0, fx * k, fy * k, r);
    for (const st of vignetteStops(focusStrength)) grad.addColorStop(st.at, `rgba(0,5,16,${st.alpha})`);
    g.fillStyle = grad; g.fillRect(0, 0, out.width, out.height);
  }
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}
$('save').addEventListener('click', async () => {
  wakeToolbar();
  const blob = await captureBlob();
  if (!blob) { showToast('保存できませんでした'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = saveFilename();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  showToast('画像を保存しました');
});
$('share').addEventListener('click', async () => {
  wakeToolbar();
  const data = { title: document.title, text: '光る深海を、ただ眺める。', url: location.href };
  try {
    if (navigator.share) { await navigator.share(data); return; }
  } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(location.href); showToast('URL をコピーしました'); }
  catch { showToast('コピーできませんでした'); }
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const rawDt = Math.min(clock.getDelta(), 0.1);
  timeScale = easeToward(timeScale, photoMode ? PHOTO.timeScale : 1, rawDt, PHOTO.timeRate);
  const lv = perf.tick(rawDt);
  if (lv !== null) applyLevel(lv);
  const dt = rawDt * timeScale;
  simTime += dt;
  const c = cam.update(simTime, dt);
  camera.position.set(c.x, c.y, c.z);
  camera.lookAt(0, 0, 0);
  jellies.update(simTime, dt);
  particles.update(simTime, dt);
  ev.update(dt);
  const pos = ev.position((z) => halfExtent(z, aspectNow).w);
  evJelly.visible = !!pos;
  if (pos) { evJelly.x = pos.x; evJelly.y = pos.y; evJelly.z = pos.z; evJelly.size = pos.size; }
  giantEv.update(simTime, dt);
  const w = ev.warnLevel();
  veil.style.opacity = (w * ev.cfg.dimMax).toFixed(3);
  beam.style.opacity = w.toFixed(3);
  if (focusTarget) { const p = screenOf(focusTarget); fx = easeToward(fx, p.x, rawDt, PHOTO.focusRate); fy = easeToward(fy, p.y, rawDt, PHOTO.focusRate); }
  focusStrength = easeToward(focusStrength, photoMode && focusTarget ? 1 : 0, rawDt, PHOTO.focusRate);
  focusEl.style.background = focusStrength > 0.001
    ? vignetteCss(fx, fy, Math.hypot(window.innerWidth, window.innerHeight) / 2, focusStrength) : 'none';
  composer.render();
});
