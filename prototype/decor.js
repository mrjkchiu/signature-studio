// decor.js — 签名"周边"动效
// 装饰图案改为「用笔锋一笔一笔画出来」（参考 tangyx527/tyx-signature 的实现思路），
// 而不是贴 emoji；另外提供落款印章、落款日期、下划线、光点入场、彩色笔片收尾。
import { clamp, easeOutCubic, easeOutBack, easeInOutCubic } from './math.js';

export const DECOS = [
  { id: 'none', label: '无' },
  { id: 'sun', label: '☀ 太阳' },
  { id: 'cat', label: '🐱 猫猫' },
  { id: 'heart', label: '❤ 爱心' },
  { id: 'star', label: '★ 星星' },
  { id: 'cloud', label: '☁ 云朵' },
  { id: 'moon', label: '☾ 月牙' },
  { id: 'snow', label: '❄ 雪花' },
  { id: 'note', label: '♪ 音符' },
  { id: 'flower', label: '🌸 樱花' },
  { id: 'paw', label: '🐾 爪印' },
  { id: 'sparkle', label: '✦ 闪光' },
  { id: 'crown', label: '♛ 皇冠' },
];
export const DECO_DEFAULT_XY = { x: 0.80, y: 0.24 };

export const DECO_POSITIONS = [
  { id: 'tr', label: '右上' },
  { id: 'tl', label: '左上' },
  { id: 'bottom', label: '下方' },
];

export const DECO_SIZES = [
  { id: 's', label: '小', k: 0.60 },
  { id: 'm', label: '中', k: 0.86 },
  { id: 'l', label: '大', k: 1.15 },
];

export const SEALS = [
  { id: 'none', label: '无' },
  { id: 'square', label: '方章' },
  { id: 'round', label: '圆章' },
];

export function decorTail() { return 1500; }

// ---------- 几何工具 ----------
function cubic(p0, p1, p2, p3, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
    ]);
  }
  return out;
}
function circle(cx, cy, r, n = 56, from = 0, to = Math.PI * 2) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = from + (to - from) * (i / n);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * 用"变宽缎带"画一条笔触（局部坐标）
 * profile: 'brush' 两端收锋 / 'taper' 只收尾
 */
function strokeRibbon(ctx, pts, width, profile = 'brush') {
  if (pts.length < 2) return;
  const n = pts.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = pts[i1][0] - pts[i0][0], dy = pts[i1][1] - pts[i0][1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const u = i / (n - 1);
    const k = profile === 'taper'
      ? Math.max(0.03, Math.pow(1 - u, 0.7))
      : 0.30 + 0.70 * Math.pow(Math.sin(Math.PI * u), 0.7);
    const r = (width / 2) * k;
    L.push([pts[i][0] + nx * r, pts[i][1] + ny * r]);
    R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();
}

// ---------- 装饰图形（局部坐标 ±50） ----------
const SHAPES = {
  sun: [
    { pts: circle(0, 0, 48, 56), w: 4.0 },
    { pts: cubic([-28, 1], [-25, -11], [-16, -12], [-12, -1]), w: 3.4 },
    { pts: cubic([13, -2], [16, -14], [25, -15], [29, -4]), w: 3.4 },
    { pts: cubic([-10, 17], [-3, 29], [13, 29], [18, 15]), w: 3.6 },
    ...Array.from({ length: 8 }, (_, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 4;
      return {
        pts: [[Math.cos(a) * 64, Math.sin(a) * 64], [Math.cos(a) * 86, Math.sin(a) * 86]],
        w: 5.2,
      };
    }),
  ],
  cat: [
    { pts: cubic([-42, -4], [-40, -19], [-40, -42], [-34, -43]).concat(cubic([-34, -43], [-29, -44], [-11, -23], [-5, -13]).slice(1)), w: 4.6 },
    { pts: cubic([7, -11], [16, -28], [26, -45], [30, -43]).concat(cubic([30, -43], [37, -42], [41, -20], [40, -8]).slice(1)), w: 4.5 },
    { pts: circle(-10, 5, 4.6, 20), w: 9.2, dot: true },
    { pts: circle(15, 4, 4.6, 20), w: 9.2, dot: true, eye: true },
    { pts: cubic([-65, 4], [-53, 6], [-29, 12], [-17, 15]), w: 5.2, profile: 'taper' },
    { pts: cubic([-55, 37], [-43, 31], [-27, 24], [-18, 20]), w: 4.8, profile: 'taper' },
    { pts: cubic([64, -5], [54, 0], [36, 8], [22, 14]), w: 5.6, profile: 'taper' },
    { pts: cubic([60, 23], [49, 22], [34, 19], [25, 19]), w: 4.6, profile: 'taper' },
  ],
  heart: [
    {
      pts: cubic([0, 49], [-18, 31], [-60, 6], [-52, -24])
        .concat(cubic([-52, -24], [-44, -54], [-12, -55], [0, -28]).slice(1))
        .concat(cubic([0, -28], [15, -58], [47, -50], [53, -24]).slice(1))
        .concat(cubic([53, -24], [62, 6], [18, 33], [0, 49]).slice(1)),
      w: 4.8,
    },
  ],
  star: [
    {
      pts: (() => {
        const pts = [];
        const R1 = 88, R2 = 36;
        for (let i = 0; i <= 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? R1 : R2;
          pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        return pts;
      })(),
      w: 4.6,
    },
  ],

  cloud: [
    { pts: cubic([-52, 12], [-58, -10], [-34, -26], [-14, -18]).concat(cubic([-14, -18], [-8, -44], [24, -46], [30, -24]).slice(1)).concat(cubic([30, -24], [52, -30], [64, -8], [54, 8]).slice(1)), w: 4.6 },
    { pts: cubic([-54, 12], [-30, 18], [-4, 18], [56, 10]), w: 4.2 },
  ],
  moon: [
    { pts: cubic([-18, -46], [22, -34], [30, 6], [4, 40]).concat(cubic([4, 40], [-20, 32], [-34, 4], [-26, -20]).slice(1)), w: 5.0 },
    { pts: cubic([18, -30], [44, -18], [44, 20], [20, 36]), w: 3.6, profile: 'taper' },
  ],
  snow: [
    { pts: [[0, -48], [0, 48]], w: 4.4 },
    { pts: [[-42, -24], [42, 24]], w: 4.4 },
    { pts: [[-42, 24], [42, -24]], w: 4.4 },
    { pts: [[0, -48], [-12, -36]], w: 3.2, profile: 'taper' },
    { pts: [[0, -48], [12, -36]], w: 3.2, profile: 'taper' },
    { pts: [[0, 48], [-12, 36]], w: 3.2, profile: 'taper' },
    { pts: [[0, 48], [12, 36]], w: 3.2, profile: 'taper' },
  ],
  note: [
    { pts: circle(-16, 30, 15, 28), w: 6.0 },
    { pts: [[-2, 30], [-2, -34]], w: 4.6 },
    { pts: cubic([-2, -34], [16, -40], [26, -28], [24, -10]), w: 4.4, profile: 'taper' },
  ],
  flower: [
    { pts: circle(0, 0, 13, 24), w: 5.0 },
    ...[0, 1, 2, 3, 4].map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const cx = Math.cos(a) * 30, cy = Math.sin(a) * 30;
      return { pts: circle(cx, cy, 15, 22), w: 4.2 };
    }),
  ],
  paw: [
    { pts: circle(0, 14, 20, 26), w: 7.0 },
    { pts: circle(-26, -14, 9, 18), w: 7.0 },
    { pts: circle(-9, -28, 9, 18), w: 7.0 },
    { pts: circle(10, -28, 9, 18), w: 7.0 },
    { pts: circle(26, -14, 9, 18), w: 7.0 },
  ],
  sparkle: [
    { pts: [[0, -48], [6, -6], [48, 0], [6, 6], [0, 48], [-6, 6], [-48, 0], [-6, -6], [0, -48]], w: 5.2, profile: 'taper' },
  ],
  crown: [
    { pts: [[-40, 26], [-44, -22], [-20, 0], [0, -34], [20, 0], [44, -22], [40, 26], [-40, 26]], w: 5.0 },
    { pts: [[-42, 34], [42, 34]], w: 4.2 },
    { pts: circle(-30, -20, 5, 14), w: 10 },
    { pts: circle(0, -34, 5, 14), w: 10 },
    { pts: circle(30, -20, 5, 14), w: 10 },
  ],
};

/** 装饰逐笔绘制 + 小动作（眨眼/折耳/摇摆） */
/** 装饰在画布中的锚点（可拖动，坐标按画布比例保存） */
export function decoAnchor(scene, cfg) {
  const f = scene.layout.fontSize;
  const sizeK = (DECO_SIZES.find((s) => s.id === (cfg.decoSize || 'm')) || DECO_SIZES[1]).k;
  const base = f * 0.26 * sizeK;
  const xy = cfg.decoXY || DECO_DEFAULT_XY;
  const margin = base * 0.62;
  return {
    x: clamp(xy.x * scene.W, margin, scene.W - margin),
    y: clamp(xy.y * scene.H, margin, scene.H - margin),
    base,
  };
}

function drawVectorDeco(ctx, scene, cfg, t, start, palette) {
  const def = SHAPES[cfg.deco];
  if (!def) return;
  const sizeK = (DECO_SIZES.find((s) => s.id === (cfg.decoSize || 'm')) || DECO_SIZES[1]).k;
  const { x: cx, y: cy, base } = decoAnchor(scene, cfg);

  const drawStart = start + 180;
  const per = 90;                       // 每一小笔的时长
  const total = def.length * per;
  const appear = clamp((t - drawStart) / total, 0, 1);
  const idle = Math.max(0, t - (drawStart + total));
  const sway = Math.sin(idle / 700) * 0.05;
  const scale = base / 50;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06 + sway);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#D8A94E';
  ctx.globalAlpha = 0.95;
  def.forEach((piece, i) => {
    const p = clamp((t - (drawStart + i * per)) / per, 0, 1);
    if (p <= 0) return;
    let pts = piece.pts;
    // 眨眼：猫/太阳的右眼周期性压扁
    if (piece.eye) {
      const blink = ((idle + 400) % 2400) / 2400;
      const lid = blink < 0.06 ? 1 - Math.abs(blink / 0.06 - 0.5) * 2 : 0;
      ctx.save();
      ctx.translate(15, 4);
      ctx.scale(1, Math.max(0.12, 1 - lid * 0.9));
      ctx.translate(-15, -4);
      strokeRibbon(ctx, pts, piece.w, piece.profile || 'brush');
      ctx.restore();
      return;
    }
    // 折耳：左耳周期性内折（简化为缩放）
    if (cfg.deco === 'cat' && i === 0) {
      const fold = Math.max(0, Math.sin(idle / 1800)) * 0.18;
      ctx.save();
      ctx.translate(-36, -24);
      ctx.rotate(-fold);
      ctx.translate(36, 24);
    }
    // 逐笔推进
    const n = Math.max(2, Math.floor(pts.length * easeInOutCubic(p)));
    strokeRibbon(ctx, pts.slice(0, n), piece.w, piece.profile || 'brush');
    if (cfg.deco === 'cat' && i === 0) ctx.restore();
  });
  ctx.restore();
}

// ---------- 下划线 / 印章 / 日期 / 情侣心（保持原有实现） ----------
function drawUnderline(ctx, scene, cfg, t, start, palette) {
  const p = clamp((t - start) / 460, 0, 1);
  if (p <= 0) return;
  const f = scene.layout.fontSize;
  const { x0, x1, y1 } = scene.bbox;
  const ax = x0 - f * 0.02, bx = x1 + f * 0.01;
  const lift = cfg.underlineLift ? Math.sin(clamp(p, 0, 1) * Math.PI) * f * 0.02 : 0;
  const y = y1 + f * 0.10 - lift;
  const xEnd = ax + (bx - ax) * easeOutCubic(p);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.glow || palette.stops[0];
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = f * 0.016;
  ctx.shadowColor = palette.glow || palette.stops[0];
  ctx.shadowBlur = f * 0.09;
  ctx.beginPath();
  ctx.moveTo(ax, y);
  ctx.quadraticCurveTo((ax + xEnd) / 2, y + f * 0.018, xEnd, y);
  ctx.stroke();
  ctx.restore();
}

function drawSeal(ctx, scene, cfg, t, start) {
  if (!cfg.seal || cfg.seal === 'none') return;
  const p = clamp((t - (start + 520)) / 360, 0, 1);
  if (p <= 0) return;
  const f = scene.layout.fontSize;
  const s = f * 0.36;
  const cx = scene.bbox.x1 + s * 0.30;
  const cy = scene.bbox.y1 + s * 0.42;
  const press = 1.45 - 0.45 * easeOutCubic(clamp(p * 1.25, 0, 1));
  const alpha = clamp(p * 1.6, 0, 1);
  const text = (cfg.sealText || '签名').slice(0, 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  ctx.scale(press, press);
  ctx.fillStyle = '#C62828';
  ctx.shadowColor = 'rgba(198,40,40,0.35)';
  ctx.shadowBlur = s * 0.28;
  if (cfg.seal === 'round') {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.56, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = s * 0.045;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.stroke();
  } else {
    const w = s * 0.92, h = s * 0.92, r = s * 0.06;
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
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `${s * 0.34}px ${scene.fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  if (chars.length === 1) ctx.fillText(chars[0], 0, 0);
  else { ctx.fillText(chars[0], 0, -s * 0.20); ctx.fillText(chars[1], 0, s * 0.20); }
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
  const beat = 1 + 0.10 * Math.max(0, Math.sin((t - start) / 320));
  const sz = f * 0.34 * easeOutBack(p) * beat;
  ctx.save();
  ctx.globalAlpha = clamp(p * 1.5, 0, 1);
  ctx.translate(scene.couple.x, scene.couple.y - f * 0.30);
  ctx.scale(sz / 50, sz / 50);
  ctx.fillStyle = '#FF4D7D';
  ctx.shadowColor = 'rgba(255,77,125,0.55)';
  ctx.shadowBlur = 12;
  const heart = SHAPES.heart[0];
  strokeRibbon(ctx, heart.pts, heart.w * 3.4, 'brush');
  ctx.restore();
}

export function drawDecorations({ ctx, scene, cfg, t, palette, start }) {
  if (!cfg) return;
  const s0 = start != null ? start : scene.writeEnd + 100;
  if (cfg.couple) drawCoupleHeart(ctx, scene, cfg, t, s0);
  if (cfg.deco && cfg.deco !== 'none') drawVectorDeco(ctx, scene, cfg, t, s0, palette);
  if (cfg.underline) drawUnderline(ctx, scene, cfg, t, s0, palette);
  if (cfg.seal && cfg.seal !== 'none') drawSeal(ctx, scene, cfg, t, s0);
  if (cfg.date) drawDate(ctx, scene, cfg, t, s0);
}
