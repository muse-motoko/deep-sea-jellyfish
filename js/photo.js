// 撮影モードの計算（DOM・three に依存しません。テスト対象）
export const PHOTO = {
  timeScale: 0.5,      // 撮影モード中の時間の速さ
  timeRate: 2.5,       // 時間の速さが切り替わる速さ（1/秒）
  focusRate: 4,        // ビネットが寄る・濃くなる速さ（1/秒）
  tapRadius: 0.35,     // タップからクラゲまでの許容距離（画面の短辺に対する比）
  vignette: { inner: 0.18, outer: 0.75, maxAlpha: 0.8 }, // 半径は画面対角線の半分に対する比
  uiHideMs: 3000,
  filenamePrefix: 'deep-sea-jellyfish',
};

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 現在値を目標値へなめらかに寄せる（dt が不正でも壊れない）
export function easeToward(cur, target, dt, rate) {
  if (!(dt > 0)) return cur;
  return target + (cur - target) * Math.exp(-rate * dt);
}

// タップ位置に最も近いクラゲを選ぶ。points: [{ id, x, y }]（画面px）。範囲外なら null
export function pickFocus(points, tapX, tapY, minSide) {
  const limit = PHOTO.tapRadius * minSide;
  let best = null, bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - tapX, p.y - tapY);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best && bestD <= limit ? best : null;
}

// ビネットのグラデーション停止点（中心は透明、外側へ向けて暗く）。strength は 0〜1
export function vignetteStops(strength) {
  const v = PHOTO.vignette, a = clamp01(strength) * v.maxAlpha;
  return [
    { at: 0, alpha: 0 },
    { at: v.inner, alpha: 0 },
    { at: v.outer, alpha: a },
    { at: 1, alpha: a },
  ];
}

export function vignetteCss(cx, cy, radius, strength) {
  const stops = vignetteStops(strength)
    .map((s) => `rgba(0,5,16,${s.alpha.toFixed(3)}) ${(s.at * 100).toFixed(1)}%`).join(', ');
  return `radial-gradient(circle ${Math.max(1, radius).toFixed(0)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, ${stops})`;
}

export function saveFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${PHOTO.filenamePrefix}-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.png`;
}
