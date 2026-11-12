// tools/icon-modern.mjs — 2026 风格图标候选：流体渐变 / 液态玻璃 / 液态金属 / 3D 软材质
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'icon');
fs.mkdirSync(OUT, { recursive: true });
// 现代粗体（得意黑）+ 毛笔字
try { GlobalFonts.registerFromPath(path.join(ROOT, 'fonts', 'smileysans.ttf'), 'ModernBlack'); } catch (e) {}
try { GlobalFonts.registerFromPath(path.join(ROOT, 'fonts', 'mashanzheng.ttf'), 'BrushKai'); } catch (e) {}

const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };

// ---------- 通用工具 ----------
function grain(ctx, S, alpha = 0.06) {
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function meshGradient(ctx, S, stops) {
  ctx.fillStyle = stops[0][0];
  ctx.fillRect(0, 0, S, S);
  for (const [color, x, y, r] of stops.slice(1)) {
    const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
}
function linGrad(ctx, S, stops, a = 0) {
  const cx = S / 2, r = S * 0.75;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cx - Math.sin(a) * r, cx + Math.cos(a) * r, cx + Math.sin(a) * r);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
function sampleCubic(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
              u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]);
  }
  return out;
}
function ribbon(ctx, pts, widths, fill) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = pts[i1][0] - pts[i0][0], dy = pts[i1][1] - pts[i0][1];
    const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, r = widths[i] / 2;
    L.push([pts[i][0] + nx * r, pts[i][1] + ny * r]);
    R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  for (const i of [0, n - 1]) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], widths[i] / 2, 0, Math.PI * 2); ctx.fill(); }
}
/** 现代签名笔触路径 */
function signaturePoints(S, k = 1) {
  const c = S / 2, s = S;
  const a = sampleCubic([c - s*0.32, c + s*0.10], [c - s*0.16, c - s*0.28], [c + s*0.10, c - s*0.30], [c + s*0.12, c - s*0.02], 110);
  const b = sampleCubic([c + s*0.12, c - s*0.02], [c + s*0.14, c + s*0.22], [c - s*0.08, c + s*0.24], [c + s*0.14, c + s*0.26], 90);
  const d = sampleCubic([c + s*0.14, c + s*0.26], [c + s*0.32, c + s*0.28], [c + s*0.34, c + s*0.02], [c + s*0.42, c - s*0.14], 100);
  const pts = [...a, ...b.slice(1), ...d.slice(1)];
  const n = pts.length;
  const widths = pts.map((_, i) => {
    const u = i / (n - 1);
    const base = 0.115 - 0.058 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    const tail = u > 0.80 ? 1 - 0.85 * ((u - 0.80) / 0.20) : 1;
    return s * base * tail * k;
  });
  return { pts, widths };
}
/** 现代字体 glyph */
function glyph(ctx, S, { txt = '签', font = 'ModernBlack', sizeK = 0.62, color, glow, glowBlur = 0.06, rot = -0.07, weight = '' } = {}) {
  ctx.save();
  ctx.translate(S / 2, S / 2 + S * 0.01);
  ctx.rotate(rot);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${S * sizeK}px ${font}`;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = S * glowBlur; }
  ctx.fillStyle = color;
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

// ---------- 8 个现代方案 ----------
export const VARIANTS = [
  {
    id: 'M1', name: '流体渐变',
    f: (ctx, S) => {
      meshGradient(ctx, S, [
        ['#5B2CFF', 0, 0, 0],
        ['#FF2D95', 0.85, 0.12, 0.75],
        ['#FFB347', 0.12, 0.92, 0.80],
        ['#22D3EE', 0.55, 0.55, 0.65],
      ]);
      grain(ctx, S, 0.05);
      glyph(ctx, S, { color: 'rgba(255,255,255,0.97)', sizeK: 0.60, glow: 'rgba(0,0,0,0.18)', glowBlur: 0.05 });
    },
  },
  {
    id: 'M2', name: '渐变笔锋',
    f: (ctx, S) => {
      meshGradient(ctx, S, [
        ['#2B1B6E', 0, 0, 0], ['#7C3AED', 0.8, 0.15, 0.8], ['#FF3D8B', 0.15, 0.9, 0.85], ['#3B82F6', 0.5, 0.5, 0.7],
      ]);
      grain(ctx, S, 0.05);
      const { pts, widths } = signaturePoints(S, 1.05);
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.45)';
      ctx.shadowBlur = S * 0.08;
      ribbon(ctx, pts, widths, '#FFFFFF');
      ctx.restore();
    },
  },
  {
    id: 'M3', name: '液态玻璃',
    f: (ctx, S) => {
      meshGradient(ctx, S, [
        ['#0B0F1E', 0, 0, 0], ['#1E3A8A', 0.85, 0.1, 0.8], ['#7C3AED', 0.1, 0.9, 0.85], ['#06B6D4', 0.5, 0.5, 0.6],
      ]);
      // 玻璃面板
      const pad = S * 0.09, r = S * 0.24;
      ctx.save();
      rr(ctx, pad, pad, S - pad * 2, S - pad * 2, r);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, 0, S, S);
      const spec = ctx.createLinearGradient(0, 0, S, S);
      spec.addColorStop(0, 'rgba(255,255,255,0.42)');
      spec.addColorStop(0.45, 'rgba(255,255,255,0.06)');
      spec.addColorStop(1, 'rgba(255,255,255,0.18)');
      ctx.fillStyle = spec;
      ctx.fillRect(0, 0, S, S);
      ctx.restore();
      // 玻璃边
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = S * 0.012;
      rr(ctx, pad, pad, S - pad * 2, S - pad * 2, r);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = S * 0.03;
      rr(ctx, pad * 0.6, pad * 0.6, S - pad * 1.2, S - pad * 1.2, r);
      ctx.stroke();
      ctx.restore();
      glyph(ctx, S, { color: '#FFFFFF', sizeK: 0.50 });
    },
  },
  {
    id: 'M4', name: '液态金属',
    f: (ctx, S) => {
      const bg = linGrad(ctx, S, ['#EEF2F9', '#D6DEEC'], -0.5);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
      const { pts, widths } = signaturePoints(S, 1.0);
      ctx.save();
      ctx.shadowColor = 'rgba(40,55,90,0.30)';
      ctx.shadowBlur = S * 0.07;
      ctx.shadowOffsetY = S * 0.02;
      ribbon(ctx, pts, widths, '#B9C3D6');
      ctx.restore();
      // 铬面
      ctx.save();
      ribbon(ctx, pts, widths.map((w) => w * 0.86), linGrad(ctx, S, ['#FFFFFF', '#BFC9DA', '#5B6579', '#E9EFF9', '#8E9AAE'], -0.6));
      ctx.restore();
      // 高光条
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(-S * 0.02, -S * 0.02);
      ribbon(ctx, pts, widths.map((w) => w * 0.26), 'rgba(255,255,255,0.9)');
      ctx.restore();
    },
  },
  {
    id: 'M5', name: '3D 软陶',
    f: (ctx, S) => {
      const bg = linGrad(ctx, S, ['#F3E8FF', '#E0C7FF'], -0.5);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
      const c = S / 2;
      // 阴影
      ctx.save();
      ctx.shadowColor = 'rgba(90,40,140,0.28)';
      ctx.shadowBlur = S * 0.12;
      ctx.shadowOffsetY = S * 0.05;
      ctx.fillStyle = '#A855F7';
      ctx.beginPath(); ctx.arc(c, c + S * 0.02, S * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 球体渐变
      const g = ctx.createRadialGradient(c - S * 0.10, c - S * 0.12, S * 0.02, c, c, S * 0.30);
      g.addColorStop(0, '#E9C7FF');
      g.addColorStop(0.45, '#B36BFF');
      g.addColorStop(1, '#6B21A8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, S * 0.26, 0, Math.PI * 2); ctx.fill();
      // 高光
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(c - S * 0.10, c - S * 0.13, S * 0.075, S * 0.045, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 小墨滴
      ctx.save();
      ctx.shadowColor = 'rgba(90,40,140,0.30)';
      ctx.shadowBlur = S * 0.06;
      ctx.shadowOffsetY = S * 0.025;
      const g2 = ctx.createRadialGradient(c + S * 0.24, c + S * 0.22, 0, c + S * 0.26, c + S * 0.24, S * 0.10);
      g2.addColorStop(0, '#F0D9FF');
      g2.addColorStop(1, '#7E22CE');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(c + S * 0.26, c + S * 0.24, S * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      glyph(ctx, S, { color: 'rgba(255,255,255,0.95)', font: 'BrushKai', sizeK: 0.30, rot: 0, glow: 'rgba(60,20,100,0.35)', glowBlur: 0.03 });
    },
  },
  {
    id: 'M6', name: '电光',
    f: (ctx, S) => {
      const bg = linGrad(ctx, S, ['#05060C', '#0B1024'], -0.5);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
      const { pts, widths } = signaturePoints(S, 1.0);
      const grad = linGrad(ctx, S, ['#22D3EE', '#818CF8', '#F472B6'], -0.7);
      ctx.save();
      ctx.shadowColor = 'rgba(99,102,241,0.95)';
      ctx.shadowBlur = S * 0.16;
      ribbon(ctx, pts, widths, grad);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.9;
      ribbon(ctx, pts, widths.map((w) => w * 0.45), 'rgba(255,255,255,0.85)');
      ctx.restore();
    },
  },
  {
    id: 'M7', name: '高对比',
    f: (ctx, S) => {
      const bgBlue = linGrad(ctx, S, ['#1147FF', '#0A2FD6'], -0.6);
      ctx.fillStyle = bgBlue; ctx.fillRect(0, 0, S, S);
      const hl = ctx.createRadialGradient(S * 0.28, S * 0.22, 0, S * 0.28, S * 0.22, S * 0.8);
      hl.addColorStop(0, 'rgba(120,160,255,0.45)');
      hl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hl; ctx.fillRect(0, 0, S, S);
      glyph(ctx, S, { color: '#F7F4EC', sizeK: 0.66, rot: -0.08 });
      ctx.save();
      ctx.fillStyle = '#F7F4EC';
      ctx.beginPath(); ctx.arc(S * 0.74, S * 0.76, S * 0.028, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'M8', name: '酸性颗粒',
    f: (ctx, S) => {
      meshGradient(ctx, S, [
        ['#04231B', 0, 0, 0], ['#0E7A5F', 0.9, 0.1, 0.8], ['#B4F461', 0.1, 0.95, 0.75], ['#22D3EE', 0.55, 0.45, 0.6],
      ]);
      grain(ctx, S, 0.09);
      const { pts, widths } = signaturePoints(S, 0.9);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = S * 0.06;
      ribbon(ctx, pts, widths, '#04120E');
      ctx.restore();
    },
  },
];

export function renderIcon(S, variant) {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.save();
  rr(ctx, 0, 0, S, S, S * 0.225);
  ctx.clip();
  variant.f(ctx, S);
  ctx.restore();
  return c;
}

const tile = 300, cols = 4, rows = Math.ceil(VARIANTS.length / cols);
const sheet = createCanvas(cols * tile, rows * (tile + 34));
const sctx = sheet.getContext('2d');
sctx.fillStyle = '#15151b'; sctx.fillRect(0, 0, sheet.width, sheet.height);
VARIANTS.forEach((v, i) => {
  const cx = (i % cols) * tile, cy = Math.floor(i / cols) * (tile + 34);
  sctx.drawImage(renderIcon(tile - 40, v), cx + 20, cy + 14, tile - 40, tile - 40);
  sctx.fillStyle = '#F2F0EA';
  sctx.font = 'bold 20px sans-serif';
  sctx.fillText(`${v.id}  ${v.name}`, cx + 20, cy + tile - 6);
  sctx.drawImage(renderIcon(40, v), cx + tile - 62, cy + 8, 40, 40);
});
fs.writeFileSync(path.join(OUT, 'modern-sheet.png'), sheet.toBuffer('image/png'));
for (const v of VARIANTS) fs.writeFileSync(path.join(OUT, `modern-${v.id}.png`), renderIcon(512, v).toBuffer('image/png'));
console.log('现代风格候选:', VARIANTS.map((v) => v.id + ' ' + v.name).join(' / '));
