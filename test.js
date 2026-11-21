// 実行: node deep-sea-jellyfish/test.js（または フォルダ内で node test.js）
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRng } from './js/rng.js';
import { pulseCurve, thrust, PULSE } from './js/pulse.js';
import { TITLE, HOOK, TIERS, BLOOM } from './js/config.js';
import { PARTICLE_TIERS } from './js/config.js';
import { particleCounts, createParticles, updateParticles, KIND, Z_RANGE } from './js/particles.js';
import { SPECIES, pickTier, pixelRatioFor, placeJellies, halfExtent, viewExtent, thrustScale } from './js/species.js';

import { CAMERA, clamp, portraitFactor, driftOffset, cameraPosition, createCameraController } from './js/camera.js';

import { createEventController, EVENT } from './js/event.js';
import { PHOTO, easeToward, pickFocus, vignetteStops, vignetteCss, saveFilename } from './js/photo.js';

import { PERF, scaledCount, scaledTotal, createPerfMonitor } from './js/perf.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
}

test('同じシードなら同じ列', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
});
test('違うシードなら違う列', () => {
  assert.notStrictEqual(createRng(1).next(), createRng(2).next());
});
test('next は [0,1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 10000; i++) { const v = r.next(); assert(v >= 0 && v < 1); }
});
test('range / int / pick の範囲', () => {
  const r = createRng(3), arr = ['a', 'b', 'c'];
  for (let i = 0; i < 2000; i++) {
    const x = r.range(-2, 5); assert(x >= -2 && x < 5);
    const n = r.int(1, 6); assert(Number.isInteger(n) && n >= 1 && n <= 6);
    assert(arr.includes(r.pick(arr)));
  }
});
test('int は両端に届く', () => {
  const r = createRng(9), seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(r.int(1, 3));
  assert.deepStrictEqual([...seen].sort(), [1, 2, 3]);
});
test('index.html に OGP・importmap・タイトル・フックがある', () => {
  const h = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  for (const s of ['og:title', 'og:description', 'og:image', 'og:url', 'summary_large_image',
    'https://muse-motoko.github.io/deep-sea-jellyfish/', 'three@0.160.0', TITLE, HOOK]) {
    assert(h.includes(s), s + ' がありません');
  }
});

test('脈動カーブは 0..1 で周期的', () => {
  for (let i = 0; i <= 1000; i++) {
    const v = pulseCurve(i / 1000); assert(v >= 0 && v <= 1);
    assert(Math.abs(v - pulseCurve(i / 1000 + 3)) < 1e-9);
  }
});
test('脈動は 0 から始まり収縮完了で 1、一周で 0 に戻る', () => {
  assert(Math.abs(pulseCurve(0)) < 1e-9);
  assert(Math.abs(pulseCurve(PULSE.contractRatio) - 1) < 1e-9);
  assert(Math.abs(pulseCurve(0.999999)) < 1e-4);
});
test('収縮は弛緩より速い', () => {
  assert(PULSE.contractRatio < 0.5);
  assert(pulseCurve(PULSE.contractRatio / 2) > pulseCurve(PULSE.contractRatio + (1 - PULSE.contractRatio) / 2) + 0.2);
  assert(pulseCurve(0.15) > 0.7 && pulseCurve(0.65) > 0.3 && pulseCurve(0.65) < 0.7);
});
test('推進は収縮中だけ働く', () => {
  assert(thrust(0.1) > 0);
  assert.strictEqual(thrust(0.5), 0);
});

test('ティアは PC 12匹・スマホ 7匹で内訳が合計と一致', () => {
  assert.strictEqual(TIERS.pc.total, 12);
  assert.strictEqual(TIERS.mobile.total, 7);
  for (const t of Object.values(TIERS)) assert.strictEqual(Object.values(t.counts).reduce((a, b) => a + b, 0), t.total);
});
test('pickTier: 幅・タッチで判定', () => {
  assert.strictEqual(pickTier(1280, false), 'pc');
  assert.strictEqual(pickTier(390, false), 'mobile');
  assert.strictEqual(pickTier(1024, true), 'mobile');
});
test('ピクセル比は PC 最大2、スマホ 1.5', () => {
  assert.strictEqual(pixelRatioFor('pc', 3), 2);
  assert.strictEqual(pixelRatioFor('pc', 1), 1);
  assert.strictEqual(pixelRatioFor('mobile', 3), 1.5);
  assert.strictEqual(pixelRatioFor('mobile', 1), 1);
});
test('配置: 個体数と種類の内訳がティアどおり', () => {
  for (const tier of ['pc', 'mobile']) {
    const ps = placeJellies(tier, createRng(5));
    assert.strictEqual(ps.length, TIERS[tier].total);
    for (const [name, n] of Object.entries(TIERS[tier].counts)) {
      assert.strictEqual(ps.filter((p) => p.species === name).length, n);
    }
  }
});
test('配置: 同じシードで同じ結果、違うシードで違う結果', () => {
  assert.deepStrictEqual(placeJellies('pc', createRng(11)), placeJellies('pc', createRng(11)));
  assert.notDeepStrictEqual(placeJellies('pc', createRng(11)), placeJellies('pc', createRng(12)));
});
test('配置: 画面内・サイズが種ごとの範囲内', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const p of placeJellies('pc', createRng(seed), 16 / 9)) {
      const [lo, hi] = SPECIES[p.species].sizeRange;
      assert(p.size >= lo && p.size <= hi);
      const e = halfExtent(p.z, 16 / 9);
      assert(Math.abs(p.x) <= e.w && Math.abs(p.y) <= e.h);
      assert(p.z < 5);
    }
  }
});
test('配置: 巨大クラゲは最も大きく、最も奥側', () => {
  assert(SPECIES.giant.sizeRange[0] > SPECIES.mizukurage.sizeRange[1]);
  for (const p of placeJellies('pc', createRng(8))) if (p.species === 'giant') assert(p.z <= -9);
});
test('配置: 多くの個体が画面上で重ならない', () => {
  let bad = 0, total = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const ps = placeJellies('pc', createRng(seed));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], da = 5 - a.z, db = 5 - b.z;
      total++;
      if (Math.hypot(a.x / da - b.x / db, a.y / da - b.y / db) <= a.size / da + b.size / db) bad++;
    }
  }
  assert(bad / total < 0.03, `重なり率 ${(bad / total).toFixed(3)}`);
});
test('index.html に three/addons の importmap がある', () => {
  const h = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert(h.includes('three/addons/'));
});

test('粒子数: PC 600／スマホ 250（プランクトン＋泡の合計）', () => {
  assert.strictEqual(PARTICLE_TIERS.pc.total, 600);
  assert.strictEqual(PARTICLE_TIERS.mobile.total, 250);
  for (const t of ['pc', 'mobile']) {
    const c = particleCounts(t);
    assert.strictEqual(c.bubbles + c.plankton, c.total);
    const p = createParticles(t, createRng(1));
    assert.strictEqual(p.count, c.total);
    assert.strictEqual([...p.kind].filter((k) => k === KIND.bubble).length, c.bubbles);
  }
});
test('粒子: 同じシードで同じ初期配置', () => {
  assert.deepStrictEqual(createParticles('pc', createRng(4)).pos, createParticles('pc', createRng(4)).pos);
});
test('泡は上昇し、プランクトンはゆっくり漂う', () => {
  const p = createParticles('mobile', createRng(2));
  const y0 = Float32Array.from(p.pos);
  updateParticles(p, 0, 0.1);
  for (let i = 0; i < p.count; i++) {
    const dy = p.pos[i * 3 + 1] - y0[i * 3 + 1];
    if (Math.abs(dy) > 5) continue; // 回り込み
    if (p.kind[i] === KIND.bubble) assert(dy > 0, '泡が上昇していません');
    else assert(Math.abs(dy) < 0.05, 'プランクトンが速すぎます');
  }
});
test('泡は横にゆらぐ（x の移動方向が入れ替わる）', () => {
  const p = createParticles('mobile', createRng(3));
  p.vel[0] = 0; // 泡 0 番の基本横速度は 0 なので、横の動きはゆらぎだけ
  let t = 0, prev = p.pos[0], dirs = new Set();
  assert.strictEqual(p.kind[0], KIND.bubble);
  for (let s = 0; s < 400; s++) {
    updateParticles(p, t, 0.05); t += 0.05;
    const d = p.pos[0] - prev; prev = p.pos[0];
    if (Math.abs(d) < 1) dirs.add(Math.sign(d));
  }
  assert(dirs.has(1) && dirs.has(-1));
});
test('粒子は長時間動かしても範囲内に収まり、NaN にならない', () => {
  const p = createParticles('pc', createRng(6), 16 / 9);
  for (let s = 0; s < 3000; s++) updateParticles(p, s * 0.033, 0.033);
  for (let i = 0; i < p.count; i++) {
    const z = p.pos[i * 3 + 2];
    assert(Number.isFinite(p.pos[i * 3]) && Number.isFinite(p.pos[i * 3 + 1]));
    assert(z >= Z_RANGE[0] && z <= Z_RANGE[1]);
  }
});
test('泡は画面上端を越えたら下から再登場する', () => {
  const p = createParticles('mobile', createRng(9));
  let wrapped = false, prev = p.pos[1];
  for (let s = 0; s < 3000 && !wrapped; s++) {
    updateParticles(p, s * 0.05, 0.05);
    if (p.pos[1] < prev - 1) wrapped = true;
    prev = p.pos[1];
  }
  assert(wrapped);
});

test('カメラ: 自動の漂いは範囲内で、周期的に動く', () => {
  const ys = new Set();
  for (let t = 0; t < 300; t += 0.5) {
    const d = driftOffset(t);
    assert(Math.abs(d.yaw) <= CAMERA.drift.yaw + 1e-9 && Math.abs(d.pitch) <= CAMERA.drift.pitch + 1e-9 && Math.abs(d.y) <= CAMERA.drift.bob + 1e-9);
    ys.add(Math.sign(d.yaw));
  }
  assert(ys.has(1) && ys.has(-1));
});
test('カメラ: ドラッグしても角度が制限内', () => {
  const c = createCameraController();
  c.dragStart(); c.drag(-100000, 100000);
  assert(Math.abs(c.state.yaw) <= CAMERA.manual.maxYaw && Math.abs(c.state.pitch) <= CAMERA.manual.maxPitch);
  c.drag(200000, -200000);
  assert(Math.abs(c.state.yaw) <= CAMERA.manual.maxYaw && Math.abs(c.state.pitch) <= CAMERA.manual.maxPitch);
});
test('カメラ: ズームは制限内', () => {
  const c = createCameraController();
  for (let i = 0; i < 100; i++) c.zoomBy(0.5);
  assert.strictEqual(c.state.zoom, CAMERA.zoom.min);
  for (let i = 0; i < 100; i++) c.zoomBy(2);
  assert.strictEqual(c.state.zoom, CAMERA.zoom.max);
});
test('カメラ: 距離が常に許容範囲内（手動・縦持ち含む）', () => {
  for (const a of [0.4, 0.56, 1, 1.78]) {
    const c = createCameraController(); c.setAspect(a);
    for (const z of [0.01, 100]) { for (let i = 0; i < 50; i++) c.zoomBy(z); const r = c.update(10, 0.016);
      const lo = CAMERA.baseDistance * CAMERA.zoom.min * portraitFactor(a) - 1e-6;
      const hi = CAMERA.baseDistance * CAMERA.zoom.max * portraitFactor(a) + 1e-6;
      assert(r.distance >= lo && r.distance <= hi);
      assert(Math.abs(Math.hypot(r.x, r.y - driftOffset(10).y, r.z) - r.distance) < 1e-6); }
  }
});
test('カメラ: 離すとゆっくり元に戻る（ドラッグ中は戻らない）', () => {
  const c = createCameraController();
  c.dragStart(); c.drag(-100, 50);
  const y0 = c.state.yaw;
  c.update(0, 1);
  assert.strictEqual(c.state.yaw, y0);
  c.release();
  c.update(0, 0.1);
  assert(Math.abs(c.state.yaw) < Math.abs(y0) && Math.abs(c.state.yaw) > Math.abs(y0) * 0.5, 'ゆっくり');
  for (let i = 0; i < 600; i++) c.update(0, 0.016);
  assert(Math.abs(c.state.yaw) < 1e-3 && Math.abs(c.state.pitch) < 1e-3);
});
test('カメラ: 縦持ちでは引き、横長では変わらない', () => {
  assert.strictEqual(portraitFactor(16 / 9), 1);
  assert.strictEqual(portraitFactor(1), 1);
  assert(portraitFactor(9 / 19.5) > portraitFactor(0.75) && portraitFactor(0.75) > 1);
  assert(portraitFactor(0.1) <= CAMERA.portraitMax);
  assert.strictEqual(portraitFactor(NaN), 1);
});
test('カメラ: 位置は有限で、clamp が働く', () => {
  const p = cameraPosition(0.3, 0.1, 5, 0.2);
  assert(Number.isFinite(p.x + p.y + p.z));
  assert.strictEqual(clamp(5, 0, 1), 1);
});

function run(ev, sec, step = 0.1, onStep) {
  for (let t = 0; t < sec; t += step) { ev.update(step); if (onStep) onStep(t); }
}
test('イベント: 最初の発生は60〜120秒の間', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const ev = createEventController(createRng(seed));
    assert(ev.untilNext >= 60 && ev.untilNext < 120);
  }
});
test('イベント: 間隔どおりに繰り返し発生し、間隔は60〜120秒', () => {
  const ev = createEventController(createRng(5));
  const starts = []; let was = false, t = 0;
  while (t < 1500) { ev.update(0.1); t += 0.1; if (ev.active && !was) starts.push(t); was = ev.active; }
  assert(starts.length >= 8, '発生回数 ' + starts.length);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1] - EVENT.warnSeconds - EVENT.crossSeconds;
    assert(gap >= 59.5 && gap <= 120.5, '間隔 ' + gap);
  }
});
test('イベント: 予兆4秒のあと20秒かけて横切る', () => {
  const ev = createEventController(createRng(2));
  assert(ev.trigger());
  assert.strictEqual(ev.phase, 'warn');
  run(ev, 4.05); assert.strictEqual(ev.phase, 'cross');
  run(ev, 19.0); assert.strictEqual(ev.phase, 'cross');
  run(ev, 1.2); assert.strictEqual(ev.phase, 'idle');
});
test('イベント: 同時に1匹まで（進行中の手動発生は無効）', () => {
  const ev = createEventController(createRng(3));
  assert(ev.trigger()); assert.strictEqual(ev.trigger(), false);
  run(ev, 10); assert.strictEqual(ev.trigger(), false);
  assert.strictEqual(ev.count, 1);
  run(ev, 20); assert(ev.trigger()); assert.strictEqual(ev.count, 2);
});
test('イベント: 奥から手前へ、画面の端から端まで通る', () => {
  const ev = createEventController(createRng(4)); ev.trigger();
  const half = (z) => 2 + (z + 20) * 0.2;
  run(ev, 4.05);
  let first = null, last = null, prevZ = -Infinity;
  run(ev, 19.9, 0.1, () => {
    const p = ev.position(half); if (!p) return;
    assert(p.z >= prevZ); prevZ = p.z;
    assert(p.z >= EVENT.zStart && p.z <= EVENT.zEnd);
    first = first || p; last = p;
  });
  assert(first.z < -18 && last.z > -4.5);
  assert(Math.abs(first.x) > half(first.z) && Math.abs(last.x) > half(last.z) * 0.8);
  assert(first.x * last.x < 0, '反対側へ抜ける');
});
test('イベント: 予兆の暗転は 0 から上がり、横切り中以外は位置なし', () => {
  const ev = createEventController(createRng(6));
  assert.strictEqual(ev.warnLevel(), 0); assert.strictEqual(ev.position(() => 5), null);
  ev.trigger(); run(ev, 2); const mid = ev.warnLevel(); assert(mid > 0 && mid < 1);
  run(ev, 2.05); assert(ev.warnLevel() > 0.9);
  run(ev, 5); assert.strictEqual(ev.warnLevel(), 0);
});
test('イベント: dt が 0・負・NaN でも壊れない', () => {
  const ev = createEventController(createRng(8));
  ev.update(0); ev.update(-1); ev.update(NaN);
  assert.strictEqual(ev.phase, 'idle');
});

test('撮影: 時間は 0.5 倍、easeToward は目標へ近づき dt 不正では動かない', () => {
  assert.strictEqual(PHOTO.timeScale, 0.5);
  let v = 1; for (let i = 0; i < 200; i++) v = easeToward(v, 0.5, 0.05, PHOTO.timeRate);
  assert(Math.abs(v - 0.5) < 0.01);
  assert.strictEqual(easeToward(1, 0, 0, 3), 1); assert.strictEqual(easeToward(1, 0, NaN, 3), 1);
});
test('撮影: pickFocus は最も近いクラゲ、遠すぎれば null', () => {
  const pts = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 300, y: 300 }];
  assert.strictEqual(pickFocus(pts, 290, 310, 600).id, 'b');
  assert.strictEqual(pickFocus(pts, 900, 900, 600), null);
  assert.strictEqual(pickFocus([], 1, 1, 600), null);
});
test('撮影: ビネットは中心が透明で外側ほど暗く、強さ0なら全部透明', () => {
  const s = vignetteStops(1);
  assert.strictEqual(s[0].alpha, 0); assert(s[3].alpha > 0 && s[3].alpha <= 1);
  assert(vignetteStops(0).every((x) => x.alpha === 0));
  assert(vignetteCss(10, 20, 500, 0.5).startsWith('radial-gradient('));
});
test('撮影: ファイル名は .png', () => {
  assert.strictEqual(saveFilename(new Date(2026, 0, 2, 3, 4, 5)), 'deep-sea-jellyfish-20260102-030405.png');
});


// --- S8 ---
const feed = (m, fps, sec) => { let last = null; for (let i = 0; i < Math.round(fps * sec); i++) { const r = m.tick(1 / fps); if (r !== null) last = r; } return last; };
test('減数: 低 FPS が続くと段階的に減り、最大段階で止まる', () => {
  const m = createPerfMonitor();
  assert.strictEqual(m.level, 0);
  feed(m, 20, 6); assert(m.level >= 1);
  feed(m, 20, 60); assert.strictEqual(m.level, PERF.levels.length - 1);
});
test('減数: 十分な FPS なら減らない', () => {
  const m = createPerfMonitor(); feed(m, 60, 30); assert.strictEqual(m.level, 0);
});
test('減数: 起動直後はクールダウンで減らない', () => {
  const m = createPerfMonitor(); feed(m, 20, PERF.cooldownSec - 0.5); assert.strictEqual(m.level, 0);
});
test('減数: 回復が続けば1段階ずつ戻る。途中で揺らぐと戻らない', () => {
  const m = createPerfMonitor(); feed(m, 20, 6);
  const lv = m.level; assert(lv >= 1);
  feed(m, 60, 4); assert.strictEqual(m.level, lv);
  feed(m, 60, 60); assert.strictEqual(m.level, 0);
  const m2 = createPerfMonitor(); feed(m2, 20, 6); const l2 = m2.level;
  for (let i = 0; i < 10; i++) { feed(m2, 60, 8); feed(m2, 48, 2); }
  assert.strictEqual(m2.level, l2);
});
test('減数: タブ切替などの巨大な dt・不正値は無視', () => {
  const m = createPerfMonitor();
  for (let i = 0; i < 50; i++) { assert.strictEqual(m.tick(5), null); m.tick(NaN); m.tick(-1); }
  assert.strictEqual(m.level, 0);
});
test('減数: 個体数は段階で単調減少、各種の最小1匹、元の数を超えない', () => {
  for (const tr of Object.values(TIERS)) for (const n of Object.values(tr.counts)) {
    let prev = Infinity;
    for (let l = 0; l < PERF.levels.length; l++) {
      const c = scaledCount(n, l); assert(c <= prev && c >= 1 && c <= n); prev = c;
    }
    assert.strictEqual(scaledCount(n, 0), n);
  }
  assert.strictEqual(scaledCount(0, 3), 0);
});
test('減数: 粒子数は段階で減り、レベル0で全数', () => {
  for (const t of Object.values(PARTICLE_TIERS)) {
    assert.strictEqual(scaledTotal(t.total, 0), t.total);
    assert(scaledTotal(t.total, PERF.levels.length - 1) < t.total * 0.5);
  }
});
test('スマホ: viewport・touch-action: none・ブルーム半分・ピクセル比1.5', () => {
  const h = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const c = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert(/name="viewport"[^>]*width=device-width/.test(h));
  assert(/touch-action:s*none/.test(c));
  assert(c.includes('safe-area-inset-bottom'));
  assert.strictEqual(pixelRatioFor('mobile', 3), 1.5);
  assert.strictEqual(BLOOM.resolutionScale, 0.5);
});


test('縦持ち配置: 画面の上・中央・下にクラゲが散らばる', () => {
  const a = 390 / 844;
  for (let seed = 1; seed <= 20; seed++) {
    const ps = placeJellies('mobile', createRng(seed), a);
    const fr = ps.map((p) => p.y / viewExtent(p.z, a).h);
    assert(fr.every((f) => Math.abs(f) <= 0.8 + 1e-9), '画面内');
    assert(fr.filter((f) => f < -0.2).length >= 2, '下側に2匹以上');
    assert(fr.filter((f) => Math.abs(f) <= 0.2).length >= 1, '中央に1匹以上');
    assert(fr.filter((f) => f > 0.2).length >= 2, '上側に2匹以上');
  }
});
test('縦持ち: 横長の配置・上昇は変わらない', () => {
  assert.deepStrictEqual(viewExtent(-5, 16 / 9), halfExtent(-5, 16 / 9));
  assert.strictEqual(thrustScale(5, 16 / 9), 1);
  assert(thrustScale(5, 0.46) < 0.2);
  assert.strictEqual(thrustScale(30, 0.46), 1);
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
