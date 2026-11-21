// 設定値（DOM・three に依存しません）
export const TITLE = '深海クラゲ観察';
export const HOOK = '光る深海を、ただ眺める。クラゲが静かに、あなたの前を通り過ぎていく。';
export const SCENE = {
  background: 0x020b1f,
  fog: 0x031230,
  fogDensity: 0.035,
  fov: 60,
  near: 0.1,
  far: 200,
};

// 個体数ティア（PC 12匹／スマホ 7匹）とピクセル比の上限
export const TIERS = {
  pc: { total: 12, counts: { mizukurage: 6, karage: 4, giant: 2 }, maxPixelRatio: 2 },
  mobile: { total: 7, counts: { mizukurage: 4, karage: 2, giant: 1 }, maxPixelRatio: 1.5 },
};
export const BLOOM = { strength: 0.9, radius: 0.6, threshold: 0.15, resolutionScale: 0.5 };

// 粒子（プランクトン＋泡の合計数）
export const PARTICLE_TIERS = {
  pc: { total: 600, bubbleRatio: 0.2 },
  mobile: { total: 250, bubbleRatio: 0.2 },
};
