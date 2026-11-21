// FPS 監視と自動減数のロジック（DOM・three に依存しません）
export const PERF = {
  levels: [1, 0.8, 0.6, 0.4],  // 個体数・粒子数の倍率（0 が通常、大きいほど減らす）
  lowFps: 40,                  // 平均 FPS がこれ未満なら減らす
  highFps: 56,                 // 平均 FPS がこれ以上が続けば戻す
  windowSec: 2,                // 判定に使う時間窓（秒）
  cooldownSec: 3,              // 段階を変えたあとの待ち時間（秒）
  recoverSec: 12,              // 戻すまでに良好が続くべき時間（秒）
  minPerSpecies: 1,            // 各種の最小個体数
  maxDt: 0.25,                 // これ以上のフレーム間隔（タブ切替など）は無視
};

// 倍率を個数に。0 になる種は出さず、最小個体数を守る（元が 0 の種は 0 のまま）
export function scaledCount(base, level, cfg = PERF) {
  if (base <= 0) return 0;
  const f = cfg.levels[Math.min(Math.max(level, 0), cfg.levels.length - 1)];
  return Math.min(base, Math.max(cfg.minPerSpecies, Math.round(base * f)));
}
export function scaledTotal(base, level, cfg = PERF) {
  const f = cfg.levels[Math.min(Math.max(level, 0), cfg.levels.length - 1)];
  return Math.max(1, Math.round(base * f));
}

// dt（秒）を渡し続けると level を返す。level は 0..levels.length-1
export function createPerfMonitor(cfg = PERF) {
  let level = 0, acc = 0, frames = 0, cool = cfg.cooldownSec, good = 0;
  const maxLevel = cfg.levels.length - 1;
  return {
    get level() { return level; },
    // 段階が変わったときだけ新しい level を、変わらなければ null を返す
    tick(dt) {
      if (!(dt > 0) || dt > cfg.maxDt) return null;
      acc += dt; frames++; cool -= dt;
      if (acc < cfg.windowSec) return null;
      const fps = frames / acc;
      acc = 0; frames = 0;
      if (cool > 0) return null;
      if (fps < cfg.lowFps && level < maxLevel) {
        level++; cool = cfg.cooldownSec; good = 0; return level;
      }
      if (fps >= cfg.highFps) {
        good += cfg.windowSec;
        if (good >= cfg.recoverSec && level > 0) {
          level--; cool = cfg.cooldownSec; good = 0; return level;
        }
      } else good = 0;
      return null;
    },
  };
}
