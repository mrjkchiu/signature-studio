// tools/icon-variants.mjs — 生成 8 个图标候选并拼成一张对比图
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'icon');
fs.mkdirSync(OUT, { recursive: true });
try { GlobalFonts.registerFromPath(path.join(ROOT, 'fonts', 'mashanzheng.ttf'), 'BrushKai'); } catch (e) {}
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };

function noise(ctx, S, alpha = 0.04) {
  for (let i = 0; i < S * S * 0.02; i++) {
    ctx.fillStyle = `rgba(255,240,210,${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.2, 1.2);
  }
}

function bgDark(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#1C1C26'); g.addColorStop(0.55, '#101018'); g.addColorStop(1, '#05050A');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const r = ctx.createRadialGradient(S * 0.42, S * 0.34, 0, S * 0.5, S * 0.5, S * 0.78);
  r.addColorStop(0, 'rgba(96,78,58,0.30)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  noise(ctx, S);
}
function bgPaper(ctx, S) {
  ctx.fillStyle = '#F7F3E8'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S * S * 0.03; i++) {
    ctx.fillStyle = `rgba(120,100,60,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
  }
  const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(150,130,90,0.16)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, S, S);
}
function bgIndigo(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#141C33'); g.addColorStop(0.6, '#0B1022'); g.addColorStop(1, '#05070F');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const r = ctx.createRadialGradient(S * 0.6, S * 0.4, 0, S * 0.6, S * 0.4, S * 0.7);
  r.addColorStop(0, 'rgba(56,120,255,0.25)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  noise(ctx, S, 0.03);
}

function gradient(ctx, S, stops, angle = 0) {
  const x0 = S * 0.5 - Math.cos(angle) * S * 0.5, y0 = S * 0.5 - Math.sin(angle) * S * 0.5;
  const g = ctx.createLinearGradient(x0, y0, S - x0, S - y0);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
const GOLD = ['#FBF0D6', '#E7C67C', '#BF8F33'];
const NEON = ['#67E8F9', '#818CF8', '#F0ABFC'];

function drawGlyph(ctx, S, { fill, glow, glowBlur = 0.09, sizeK = 0.62, rot = -0.05, txt = '签' }) {
  ctx.save();
  ctx.translate(S / 2, S / 2 + S * 0.02);
  ctx.rotate(rot);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${S * sizeK}px BrushKai`;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = S * glowBlur; }
  ctx.fillStyle = fill;
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

function drawSeal(ctx, S, { sizeK = 0.26, x = 0.30, y = 0.30, rot = -0.09, txt = '签' } = {}) {
  const seal = S * sizeK;
  ctx.save();
  ctx.translate(S / 2 + S * x, S / 2 + S * y);
  ctx.rotate(rot);
  ctx.fillStyle = gradient(ctx, S, ['#DC4038', '#A61D17']);
  ctx.shadowColor = 'rgba(200,40,32,0.45)';
  ctx.shadowBlur = S * 0.04;
  rr(ctx, -seal / 2, -seal / 2, seal, seal, seal * 0.13);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,235,225,0.6)';
  ctx.lineWidth = seal * 0.05;
  rr(ctx, -seal / 2 + seal * 0.12, -seal / 2 + seal * 0.12, seal * 0.76, seal * 0.76, seal * 0.08);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,246,240,0.96)';
  ctx.font = `${seal * 0.5}px BrushKai`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, 0, seal * 0.03);
  ctx.restore();
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
function brushRibbon(ctx, pts, widths, fill) {
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

function swoosh(ctx, S, { gold = true } = {}) {
  const c = S / 2, k = S;
  // 像真人签名的一笔：重起笔 → 下探 → 回环 → 长尾上扬
  const seg1 = sampleCubic([c - k*0.34, c - k*0.20], [c - k*0.20, c + k*0.16], [c + k*0.02, c + k*0.30], [c + k*0.10, c + k*0.10], 110);
  const seg2 = sampleCubic([c + k*0.10, c + k*0.10], [c + k*0.18, c - k*0.12], [c - k*0.02, c - k*0.26], [c + k*0.16, c - k*0.20], 100);
  const seg3 = sampleCubic([c + k*0.16, c - k*0.20], [c + k*0.32, c - k*0.14], [c + k*0.34, c + k*0.06], [c + k*0.46, c + k*0.02], 100);
  const pts = [...seg1, ...seg2.slice(1), ...seg3.slice(1)];
  const n = pts.length;
  const widths = pts.map((_, i) => {
    const u = i / (n - 1);
    const base = 0.145 - 0.085 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    const tail = u > 0.80 ? 1 - 0.90 * ((u - 0.80) / 0.20) : 1;
    return k * base * tail;
  });
  ctx.save();
  ctx.shadowColor = 'rgba(240,205,140,0.55)';
  ctx.shadowBlur = k * 0.10;
  brushRibbon(ctx, pts, widths, gradient(ctx, S, gold ? GOLD : NEON, -0.5));
  ctx.restore();
}

/** 8 个方案 */
export const VARIANTS = [
  { id: 'A', name: '金字印章', f: (ctx, S) => {
      bgDark(ctx, S);
      drawGlyph(ctx, S, { fill: gradient(ctx, S, GOLD, -0.6), glow: 'rgba(240,205,140,0.6)' });
      drawSeal(ctx, S);
    } },
  { id: 'B', name: '一笔签名', f: (ctx, S) => {
      bgDark(ctx, S);
      swoosh(ctx, S);
      drawSeal(ctx, S, { sizeK: 0.18, x: 0.36, y: 0.34 });
    } },
  { id: 'C', name: '印章主体', f: (ctx, S) => {
      bgDark(ctx, S);
      drawSeal(ctx, S, { sizeK: 0.58, x: 0, y: 0, rot: -0.07, txt: '签' });
    } },
  { id: 'D', name: '朱墨', f: (ctx, S) => {
      bgDark(ctx, S);
      drawGlyph(ctx, S, { fill: gradient(ctx, S, ['#E8574C', '#A61D17'], -0.6), glow: 'rgba(198,40,40,0.55)', glowBlur: 0.08 });
    } },
  { id: 'E', name: '素白', f: (ctx, S) => {
      bgDark(ctx, S);
      drawGlyph(ctx, S, { fill: '#F5F0E4', glow: null });
    } },
  { id: 'F', name: '霓虹', f: (ctx, S) => {
      bgIndigo(ctx, S);
      drawGlyph(ctx, S, { fill: gradient(ctx, S, ['#7DD3FC', '#818CF8', '#C4B5FD'], -0.7), glow: 'rgba(129,140,248,0.8)', glowBlur: 0.11 });
    } },
  { id: 'G', name: '宣纸墨字', f: (ctx, S) => {
      bgPaper(ctx, S);
      drawGlyph(ctx, S, { fill: gradient(ctx, S, ['#2A2620', '#4A4238'], -0.6), glow: null, rot: -0.04 });
      drawSeal(ctx, S, { sizeK: 0.24 });
    } },
  { id: 'H', name: '金环', f: (ctx, S) => {
      bgDark(ctx, S);
      ctx.save();
      ctx.strokeStyle = 'rgba(231,198,124,0.75)';
      ctx.lineWidth = S * 0.012;
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.395, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      drawGlyph(ctx, S, { fill: '#F5F0E4', glow: null, sizeK: 0.50 });
    } },
];

function renderIcon(S, variant, round = false) {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.save();
  if (round) { ctx.beginPath(); ctx.arc(S/2, S/2, S/2, 0, Math.PI*2); ctx.clip(); }
  else { rr(ctx, 0, 0, S, S, S * 0.225); ctx.clip(); }
  variant.f(ctx, S);
  ctx.restore();
  return c;
}

// 对比图
const tile = 300, cols = 4, rows = Math.ceil(VARIANTS.length / cols);
const sheet = createCanvas(cols * tile, rows * (tile + 34));
const sctx = sheet.getContext('2d');
sctx.fillStyle = '#1a1a20'; sctx.fillRect(0, 0, sheet.width, sheet.height);
VARIANTS.forEach((v, i) => {
  const cx = (i % cols) * tile, cy = Math.floor(i / cols) * (tile + 34);
  const ic = renderIcon(tile - 40, v);
  sctx.drawImage(ic, cx + 20, cy + 14, tile - 40, tile - 40);
  sctx.fillStyle = '#F2F0EA';
  sctx.font = 'bold 20px sans-serif';
  sctx.fillText(`${v.id}  ${v.name}`, cx + 20, cy + tile - 4);
  // 小尺寸样张
  const sm = renderIcon(40, v);
  sctx.drawImage(sm, cx + tile - 62, cy + 8, 40, 40);
});
fs.writeFileSync(path.join(OUT, 'variants-sheet.png'), sheet.toBuffer('image/png'));
// 每个方案单独 512 图，方便细看
for (const v of VARIANTS) {
  fs.writeFileSync(path.join(OUT, `icon-${v.id}.png`), renderIcon(512, v).toBuffer('image/png'));
}
console.log('生成', VARIANTS.length, '个方案 →', OUT);
