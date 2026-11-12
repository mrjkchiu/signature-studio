// decor.js — 签名"周边"功能：装饰图案、落款印章、落款日期、下划线、情侣爱心
// 全部画在字形之上，时间轴排在书写完成之后。
// 思路参考 tangyx527/tyx-signature 的"装饰 + 首尾动画"，中文场景下做了简化。

import { clamp, easeOutCubic, easeOutBack } from './renderer.js';

export const DECOS = [
  { id: 'none', label: '无' },
  { id: 'sparkle', label: '✨ 点缀', emoji: '✨', motion: 'twinkle', count: 3 },
  { id: 'heart', label: '💖 爱心', emoji: '💖', motion: 'float', count: 1 },
  { id: 'paw', label: '🐾 爪爪', emoji: '🐾', motion: 'sway', count: 2 },
  { id: 'flower', label: '🌸 花朵', emoji: '🌸', motion: 'float', count: 2 },
  { id: 'star', label: '⭐ 星星', emoji: '⭐', motion: 'twinkle', count: 2 },
  { id: 'cat', label: '🐱 猫猫', emoji: '🐱', motion: 'sway', count: 1 },
];

export const DECO_POSITIONS = [
  { id: 'tr', label: '右上' },
  { id: 'tl', label: '左上' },
  { id: 'bottom', label: '下方' },
];

export const DECO_SIZES = [
  { id: 's', label: '小', k: 0.14 },
  { id: 'm', label: '中', k: 0.20 },
  { id: 'l', label: '大', k: 0.27 },
];

export const SEALS = [
  { id: 'none', label: '无' },
  { id: 'square', label: '方章' },
  { id: 'round', label: '圆章' },
];

/** 装饰总时长：书写结束后再留约 1.25s 给装饰和落款 */
export function decorTail() { return 1250; }

const EMOJI_FONT = '"Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';

function drawEmojiDecor(ctx, scene, cfg, t, start) {
  const def = DECOS.find((d) => d.id === cfg.deco);
  if (!def || def.id === 'none') return;
  const f = scene.layout.fontSize;
  const sizeK = (DECO_SIZES.find((s) => s.id === (cfg.decoSize || 'm')) || DECO_SIZES[1]).k;
  const base = f * sizeK;
  const { x0, y0, x1, y1 } = scene.bbox;
  const pos = cfg.decoPos || 'tr';
  let cx, cy;
  if (pos === 'tl') { cx = x0 - base * 0.25; cy = y0 + base * 0.15; }
  else if (pos === 'bottom') { cx = (x0 + x1) / 2; cy = y1 + base * 0.95; }
  else { cx = x1 + base * 0.30; cy = y0 + base * 0.20; }

  const count = Math.max(1, def.count || 1);
  for (let i = 0; i < count; i++) {
    const popStart = start + 260 + i * 140;
    const p = clamp((t - popStart) / 340, 0, 1);
    if (p <= 0) continue;
    const pop = easeOutBack(p);
    // 各自的小动作
    let dx = 0, dy = 0, rot = 0, sc = pop;
    const ph = t / 620 + i * 1.7;
    if (def.motion === 'twinkle') { sc *= 0.85 + 0.15 * Math.sin(ph * 1.6); dy = Math.sin(ph) * base * 0.05; }
    else if (def.motion === 'float') { dy = Math.sin(ph) * base * 0.12; rot = Math.sin(ph * 0.7) * 0.08; }
    else { rot = Math.sin(ph * 1.1) * 0.18; dx = Math.cos(ph * 0.8) * base * 0.06; }
    const ox = i === 0 ? 0 : (i % 2 ? 1 : -1) * base * 0.85;
    const oy = i === 0 ? 0 : (i === 1 ? -0.7 : 0.75) * base;
    ctx.save();
    ctx.globalAlpha = clamp(p * 1.4, 0, 1);
    ctx.translate(cx + ox + dx, cy + oy + dy);
    ctx.rotate(rot);
    const sz = base * (0.75 + 0.35 * sc);
    ctx.font = `${sz}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji, 0, 0);
    ctx.restore();
  }
}

function drawUnderline(ctx, scene, cfg, t, start, palette) {
  const p = clamp((t - start) / 460, 0, 1);
  if (p <= 0) return;
  const f = scene.layout.fontSize;
  const { x0, x1, y1 } = scene.bbox;
  const ax = x0 - f * 0.02, bx = x1 + f * 0.01;
  const y = y1 + f * 0.10;
  const xEnd = ax + (bx - ax) * easeOutCubic(p);
  ctx.save();
  ctx.lineCap = 'round';
  // 主笔
  ctx.strokeStyle = palette.glow || palette.stops[0];
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = f * 0.016;
  ctx.shadowColor = palette.glow || palette.stops[0];
  ctx.shadowBlur = f * 0.09;
  ctx.beginPath();
  ctx.moveTo(ax, y);
  ctx.quadraticCurveTo((ax + xEnd) / 2, y + f * 0.018, xEnd, y);
  ctx.stroke();
  // 细高光
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = f * 0.005;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(ax, y - f * 0.004);
  ctx.quadraticCurveTo((ax + xEnd) / 2, y + f * 0.014, xEnd, y - f * 0.004);
  ctx.stroke();
  ctx.restore();
}

function drawSeal(ctx, scene, cfg, t, start) {
  if (!cfg.seal || cfg.seal === 'none') return;
  const p = clamp((t - (start + 520)) / 360, 0, 1);
  if (p <= 0) return;
  const f = scene.layout.fontSize;
  const s = f * 0.36;                    // 章面尺寸
  const cx = scene.bbox.x1 + s * 0.30;
  const cy = scene.bbox.y1 + s * 0.42;
  const press = 1.45 - 0.45 * easeOutCubic(clamp(p * 1.25, 0, 1));
  const alpha = clamp(p * 1.6, 0, 1);
  const text = (cfg.sealText || '签名').slice(0, 2);
  const red = '#C62828';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  ctx.scale(press, press);
  // 章印外框（阴文：红底白字）
  ctx.fillStyle = red;
  ctx.shadowColor = 'rgba(198,40,40,0.35)';
  ctx.shadowBlur = s * 0.28;
  if (cfg.seal === 'round') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = s * 0.045;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const r = s * 0.06;
    const w = s * 0.92, h = s * 0.92;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, r) : ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-w / 2 + s * 0.07, -h / 2 + s * 0.07, w - s * 0.14, h - s * 0.14, r * 0.7)
      : ctx.rect(-w / 2 + s * 0.07, -h / 2 + s * 0.07, w - s * 0.14, h - s * 0.14);
    ctx.stroke();
  }
  // 章内文字（竖排两字）
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `${s * 0.34}px ${scene.fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  if (chars.length === 1) {
    ctx.fillText(chars[0], 0, 0);
  } else {
    ctx.fillText(chars[0], 0, -s * 0.20);
    ctx.fillText(chars[1], 0, s * 0.20);
  }
  ctx.restore();
}

function drawDate(ctx, scene, cfg, t, start) {
  if (!cfg.date) return;
  const p = clamp((t - (start + 660)) / 320, 0, 1);
  if (p <= 0) return;
  const f = scene.layout.fontSize;
  const text = cfg.dateText || new Date().toISOString().slice(0, 7).replace('-', '.');
  ctx.save();
  ctx.globalAlpha = p * 0.72;
  ctx.fillStyle = '#5A4A3A';
  ctx.font = `${f * 0.105}px ${scene.fontStack}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, scene.bbox.x0, scene.bbox.y1 + f * 0.34);
  ctx.restore();
}

function drawCoupleHeart(ctx, scene, cfg, t, start) {
  if (!cfg.couple || !scene.couple) return;
  const p = clamp((t - (scene.writeEnd + 220)) / 420, 0, 1);
  if (p <= 0) return;
  const f = scene.layout.fontSize;
  const beat = 1 + 0.09 * Math.max(0, Math.sin((t - start) / 340));
  const sz = f * 0.34 * easeOutBack(p) * beat;
  ctx.save();
  ctx.globalAlpha = clamp(p * 1.5, 0, 1);
  ctx.font = `${sz}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('❤️', scene.couple.x, scene.couple.y - f * 0.30);
  ctx.restore();
}

/** 统一入口：所有装饰都画在字形之上 */
export function drawDecorations({ ctx, scene, cfg, t, palette, start }) {
  if (!cfg) return;
  const s0 = start != null ? start : scene.writeEnd + 100;
  if (cfg.couple) drawCoupleHeart(ctx, scene, cfg, t, s0);
  if (cfg.deco && cfg.deco !== 'none') drawEmojiDecor(ctx, scene, cfg, t, s0);
  if (cfg.underline) drawUnderline(ctx, scene, cfg, t, s0, palette);
  if (cfg.seal && cfg.seal !== 'none') drawSeal(ctx, scene, cfg, t, s0);
  if (cfg.date) drawDate(ctx, scene, cfg, t, s0);
}
