// 脈動カーブ（three に依存しません）
export const PULSE = { period: 3.2, contractRatio: 0.3 };

// phase(0..1) -> 収縮量(0..1)。0=弛緩、1=最大収縮。収縮は速く、弛緩は遅い
export function pulseCurve(phase, contractRatio = PULSE.contractRatio) {
  const p = ((phase % 1) + 1) % 1;
  if (p < contractRatio) {
    const t = p / contractRatio;
    return Math.sin(t * Math.PI / 2); // 速く立ち上がる
  }
  const t = (p - contractRatio) / (1 - contractRatio);
  return 0.5 * (1 + Math.cos(t * Math.PI)); // ゆっくり戻る
}

// 収縮中だけ上向きの推進力(0..1)。収縮の増加分に比例
export function thrust(phase, contractRatio = PULSE.contractRatio) {
  const p = ((phase % 1) + 1) % 1;
  if (p >= contractRatio) return 0;
  return Math.cos((p / contractRatio) * Math.PI / 2);
}
