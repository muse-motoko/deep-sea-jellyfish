// カメラの動き（DOM・three に依存しません。テスト対象）
export const CAMERA = {
  baseDistance: 5,
  drift: { yaw: 0.14, yawPeriod: 70, pitch: 0.05, pitchPeriod: 41, bob: 0.35, bobPeriod: 53 },
  manual: { maxYaw: 0.35, maxPitch: 0.2, sensitivity: 0.0025, returnRate: 1.2 }, // rad／px、戻りの速さ（1/秒）
  zoom: { min: 0.8, max: 1.3 },
  portraitMax: 1.7,
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 縦持ち（aspect < 1）ではカメラを引いて、クラゲが画面幅に収まるようにする
export function portraitFactor(aspect) {
  if (!(aspect > 0) || aspect >= 1) return 1;
  return clamp(1 + (1 - aspect) * 1.2, 1, CAMERA.portraitMax);
}

// 自動の漂い（ゆるい周回と上下）
export function driftOffset(t) {
  const d = CAMERA.drift, tau = Math.PI * 2;
  return {
    yaw: Math.sin((t / d.yawPeriod) * tau) * d.yaw,
    pitch: Math.sin((t / d.pitchPeriod) * tau + 1) * d.pitch,
    y: Math.sin((t / d.bobPeriod) * tau + 2) * d.bob,
  };
}

// 球面座標からカメラ位置（原点を見る）
export function cameraPosition(yaw, pitch, distance, y = 0) {
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * distance,
    y: Math.sin(pitch) * distance + y,
    z: Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

export function createCameraController() {
  let yaw = 0, pitch = 0, zoom = 1, dragging = false, aspect = 16 / 9;
  const M = CAMERA.manual;
  return {
    setAspect(a) { aspect = a; },
    dragStart() { dragging = true; },
    drag(dx, dy) { // ピクセル単位。右ドラッグで被写体が右へ回り込む向き
      yaw = clamp(yaw - dx * M.sensitivity, -M.maxYaw, M.maxYaw);
      pitch = clamp(pitch + dy * M.sensitivity, -M.maxPitch, M.maxPitch);
    },
    release() { dragging = false; },
    zoomBy(factor) { zoom = clamp(zoom * factor, CAMERA.zoom.min, CAMERA.zoom.max); },
    update(t, dt) {
      if (!dragging) { // 離すとゆっくり戻る
        const k = Math.exp(-M.returnRate * dt);
        yaw *= k; pitch *= k;
      }
      const d = driftOffset(t);
      const distance = CAMERA.baseDistance * portraitFactor(aspect) * zoom;
      return { ...cameraPosition(d.yaw + yaw, d.pitch + pitch, distance, d.y), distance };
    },
    get state() { return { yaw, pitch, zoom, dragging }; },
  };
}
