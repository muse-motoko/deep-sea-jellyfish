// 巨大クラゲの横切りイベント（DOM・three に依存しません。テスト対象）
export const EVENT = {
  intervalRange: [60, 120], // 発生間隔（秒）
  warnSeconds: 4,           // 発生直前の予兆（暗転＋光）
  crossSeconds: 20,         // 横切る時間
  size: 3.2,
  zStart: -20, zEnd: -3,    // 奥 → 手前
  xMargin: 1.3,             // 画面端からの余白（傘サイズ倍率）
  dimMax: 0.4,              // 画面が暗くなる最大の度合い
};

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// rng: createRng の戻り値。状態: 'idle' | 'warn' | 'cross'
export function createEventController(rng, opts = {}) {
  const cfg = { ...EVENT, ...opts };
  const nextInterval = () => rng.range(cfg.intervalRange[0], cfg.intervalRange[1]);
  let phase = 'idle';
  let timer = nextInterval(); // idle: 次の発生まで／warn・cross: 経過秒
  let dir = 1;
  let count = 0;

  function begin() {
    phase = 'warn'; timer = 0;
    dir = rng.next() < 0.5 ? -1 : 1;
    count++;
  }
  // 手動発生。すでに進行中（同時に1匹まで）なら false
  function trigger() {
    if (phase !== 'idle') return false;
    begin();
    return true;
  }
  function update(dt) {
    if (!(dt > 0)) return;
    if (phase === 'idle') {
      timer -= dt;
      if (timer <= 0) begin();
    } else if (phase === 'warn') {
      timer += dt;
      if (timer >= cfg.warnSeconds) { phase = 'cross'; timer -= cfg.warnSeconds; }
    } else if (phase === 'cross') {
      timer += dt;
      if (timer >= cfg.crossSeconds) { phase = 'idle'; timer = nextInterval(); }
    }
  }
  // 暗転と光の強さ（0〜1）。予兆で上がり、クラゲの登場とともに消える
  function warnLevel() {
    if (phase === 'warn') return smooth(clamp01(timer / cfg.warnSeconds));
    if (phase === 'cross') return 1 - smooth(clamp01(timer / 3));
    return 0;
  }
  // 横切り中の進行度 0〜1（横切り中以外は null）
  function progress() {
    return phase === 'cross' ? clamp01(timer / cfg.crossSeconds) : null;
  }
  // クラゲの位置。横切り中以外は null。半幅は画面幅に合わせて呼び出し側が渡す
  function position(halfWidthAt) {
    const p = progress();
    if (p === null) return null;
    const z = cfg.zStart + (cfg.zEnd - cfg.zStart) * p;
    const reach = halfWidthAt(z) + cfg.size * cfg.xMargin;
    return { x: dir * (-reach + 2 * reach * p), y: 0.6 * Math.sin(p * Math.PI), z, size: cfg.size, progress: p };
  }
  return {
    update, trigger, warnLevel, progress, position, cfg,
    get phase() { return phase; },
    get active() { return phase !== 'idle'; },
    get count() { return count; },
    get untilNext() { return phase === 'idle' ? timer : null; },
  };
}
