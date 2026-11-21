// 種類・ティア・配置ロジック（DOM・three に依存しません）
import { TIERS, SCENE } from './config.js';
import { portraitFactor } from './camera.js';

// size: 傘の半径の基準（ワールド単位）。tentacle: 本数・長さ（傘半径に対する倍率）
export const SPECIES = {
  mizukurage: { // ミズクラゲ型：丸い傘、短めの触手
    id: 0, sizeRange: [0.35, 0.6], bellHeight: 0.8, tentacles: 20, tentacleLen: 1.0, sway: 0.12,
    color: [0.35, 0.7, 1.0], rim: [0.8, 0.95, 1.0], glow: 1.0, pulseScale: 1.0,
  },
  karage: { // カラゲ型：小さめの傘に長い触手
    id: 1, sizeRange: [0.25, 0.4], bellHeight: 0.65, tentacles: 14, tentacleLen: 4.5, sway: 0.25,
    color: [1.0, 0.45, 0.65], rim: [1.0, 0.85, 0.9], glow: 1.1, pulseScale: 1.2,
  },
  giant: { // 巨大クラゲ型：大きく、ゆっくり、太く淡く
    id: 2, sizeRange: [1.3, 1.8], bellHeight: 0.9, tentacles: 28, tentacleLen: 1.8, sway: 0.1,
    color: [0.5, 0.4, 1.0], rim: [0.8, 0.75, 1.0], glow: 0.75, pulseScale: 0.55,
  },
};
export const SPECIES_ORDER = ['mizukurage', 'karage', 'giant'];

export const CAMERA_Z = 5;
const Z_RANGE = [-16, -1];

// スマホ判定: 幅が狭い、または粗いポインタ（タッチ）
export function pickTier(width, coarsePointer = false) {
  return (coarsePointer || width < 768) ? 'mobile' : 'pc';
}

export function pixelRatioFor(tier, devicePixelRatio) {
  return Math.min(devicePixelRatio || 1, TIERS[tier].maxPixelRatio);
}

// 奥行き z での画面の半分の高さ・幅
export function halfExtent(z, aspect, fov = SCENE.fov) {
  const h = Math.tan((fov * Math.PI / 180) / 2) * (CAMERA_Z - z);
  return { h, w: h * aspect };
}

// 縦持ちではカメラが引かれる（portraitFactor）ので、実際に見える範囲はこちら。横長では halfExtent と同じ
export function viewExtent(z, aspect, fov = SCENE.fov) {
  const h = Math.tan((fov * Math.PI / 180) / 2) * (CAMERA_Z * portraitFactor(aspect) - z);
  return { h, w: h * aspect };
}

// 縦持ちの初見：最初の約20秒は上昇を弱めて、高さ方向の散らばりを保つ
export const PORTRAIT_CALM = { hold: 20, fade: 6, thrust: 0.15 };
export function thrustScale(time, aspect) {
  if (!(aspect < 1)) return 1;
  const k = Math.min(1, Math.max(0, (time - PORTRAIT_CALM.hold) / PORTRAIT_CALM.fade));
  return PORTRAIT_CALM.thrust + (1 - PORTRAIT_CALM.thrust) * k;
}

// 個体を配置する。rng は createRng の戻り値。
export function placeJellies(tier, rng, aspect = 16 / 9) {
  const { counts } = TIERS[tier];
  const out = [];
  const portrait = aspect < 1;
  let k = 0;
  // 大きい種から置くと、重なり回避が成立しやすい
  for (const name of [...SPECIES_ORDER].reverse()) {
    const sp = SPECIES[name];
    for (let n = 0; n < counts[name]; n++) {
      let best = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const z = name === 'giant' ? rng.range(-16, -9) : rng.range(Z_RANGE[0] + 3, Z_RANGE[1]);
        const ext = portrait ? viewExtent(z, aspect) : halfExtent(z, aspect);
        const size = rng.range(sp.sizeRange[0], sp.sizeRange[1]);
        const c = {
          species: name, size, z,
          x: rng.range(-ext.w * 0.85, ext.w * 0.85),
          y: rng.range(-ext.h, ext.h),
          phase: rng.next(), drift: rng.range(0, Math.PI * 2),
        };
        // 画面上でおおよそ重ならない（角度サイズで比較）
        const clear = out.every((o) => {
          const sx = (c.x / (CAMERA_Z - c.z)) - (o.x / (CAMERA_Z - o.z));
          const sy = (c.y / (CAMERA_Z - c.z)) - (o.y / (CAMERA_Z - o.z));
          return Math.hypot(sx, sy) > (c.size / (CAMERA_Z - c.z) + o.size / (CAMERA_Z - o.z)) * 1.1;
        });
        // 縦持ち：y を上から下まで均等に割り当てる（黄金比で散らす）
        if (portrait) c.y = (((k * 0.618034) % 1) * 2 - 1) * ext.h * 0.8;
        best = c;
        if (clear) break;
      }
      k++;
      out.push(best);
    }
  }
  return out;
}
