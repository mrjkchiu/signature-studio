// math.js — 公共数学/缓动工具（拆出来避免 renderer 与 decor 循环依赖）
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
/** 书写速度轻微波动：匀速太机械，笔尖速度要有呼吸感 */
export const brushProgress = (u) => {
  const t = clamp(u, 0, 1);
  return t - 0.055 * Math.sin(t * Math.PI * 2);
};
