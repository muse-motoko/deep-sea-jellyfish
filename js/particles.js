// 粒子の更新ロジック（DOM・three に依存しません）
import { PARTICLE_TIERS } from './config.js';
import { halfExtent } from './species.js';

export const KIND = { plankton: 0, bubble: 1 };
export const Z_RANGE = [-14, 3]; // 奥行きの範囲
const MARGIN = 1.15; // 画面外の余白（この外に出たら反対側へ回り込む）

export function particleCounts(tier) {
  const t = PARTICLE_TIERS[tier];
  const bubbles = Math.round(t.total * t.bubbleRatio);
  return { total: t.total, bubbles, plankton: t.total - bubbles };
}

// SoA 形式。positions は [x,y,z]*n。
export function createParticles(tier, rng, aspect = 16 / 9) {
  const { total, bubbles } = particleCounts(tier);
  const p = {
    count: total, aspect,
    pos: new Float32Array(total * 3),
    vel: new Float32Array(total * 3), // 基本速度（泡は y が上向き）
    kind: new Uint8Array(total),
    size: new Float32Array(total),
    phase: new Float32Array(total),
    freq: new Float32Array(total),
    amp: new Float32Array(total),
  };
  for (let i = 0; i < total; i++) {
    const bubble = i < bubbles;
    p.kind[i] = bubble ? KIND.bubble : KIND.plankton;
    const z = rng.range(Z_RANGE[0], Z_RANGE[1]);
    const e = halfExtent(z, aspect);
    p.pos[i * 3] = rng.range(-e.w, e.w) * MARGIN;
    p.pos[i * 3 + 1] = rng.range(-e.h, e.h) * MARGIN;
    p.pos[i * 3 + 2] = z;
    if (bubble) {
      p.vel[i * 3 + 1] = rng.range(0.35, 0.8);
      p.size[i] = rng.range(0.6, 1.4);
      p.amp[i] = rng.range(0.15, 0.4);
      p.freq[i] = rng.range(0.6, 1.4);
    } else {
      p.vel[i * 3] = rng.range(-0.05, 0.05);
      p.vel[i * 3 + 1] = rng.range(-0.04, 0.03);
      p.vel[i * 3 + 2] = rng.range(-0.03, 0.03);
      p.size[i] = rng.range(0.3, 0.8);
      p.amp[i] = rng.range(0.05, 0.15);
      p.freq[i] = rng.range(0.2, 0.6);
    }
    p.phase[i] = rng.range(0, Math.PI * 2);
  }
  return p;
}

// t: 経過秒、dt: 前フレームからの秒。位置を進め、画面外は反対側へ回り込ませます。
export function updateParticles(p, t, dt) {
  for (let i = 0; i < p.count; i++) {
    const k = i * 3;
    const sway = Math.sin(t * p.freq[i] + p.phase[i]) * p.amp[i];
    const sway2 = Math.cos(t * p.freq[i] * 0.8 + p.phase[i]) * p.amp[i];
    // ゆらぎは速度として加える（位置を直接ずらさないので連続的）
    p.pos[k] += (p.vel[k] + sway) * dt;
    p.pos[k + 1] += (p.vel[k + 1] + (p.kind[i] === KIND.plankton ? sway2 * 0.5 : 0)) * dt;
    p.pos[k + 2] += (p.vel[k + 2] + (p.kind[i] === KIND.plankton ? sway2 * 0.3 : 0)) * dt;

    const z = Math.min(Z_RANGE[1], Math.max(Z_RANGE[0], p.pos[k + 2]));
    p.pos[k + 2] = z;
    const e = halfExtent(z, p.aspect);
    const w = e.w * MARGIN, h = e.h * MARGIN;
    if (p.pos[k] > w) p.pos[k] = -w; else if (p.pos[k] < -w) p.pos[k] = w;
    if (p.pos[k + 1] > h) p.pos[k + 1] = -h; else if (p.pos[k + 1] < -h) p.pos[k + 1] = h;
  }
}

export function setParticleAspect(p, aspect) { p.aspect = aspect; }
