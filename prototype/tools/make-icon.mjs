// tools/make-icon.mjs — 生成 App 图标（毛笔笔触 + 朱红印章）
// 用法：node tools/make-icon.mjs [输出目录]
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'tools', 'icon');
fs.mkdirSync(OUT, { recursive: true });
try { GlobalFonts.registerFromPath(path.join(ROOT, 'fonts', 'mashanzheng.ttf'), 'BrushKai'); } catch (e) {}

// ---------- 基础绘制 ----------
function inkBackground(ctx, S) {
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#1B1B24');
  g.addColorStop(0.55, '#101018');
  g.addColorStop(1, '#06060A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // 中心偏暖的微光
  const r = ctx.createRadialGradient(S * 0.42, S * 0.34, 0, S * 0.5, S * 0.5, S * 0.75);
  r.addColorStop(0, 'rgba(90,74,58,0.28)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, S, S);
  // 纸纹噪点
  for (let i = 0; i < S * S * 0.02; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    ctx.fillStyle = `rgba(255,240,210,${Math.random() * 0.045})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
}

/** 变宽笔触：沿贝塞尔采样，按宽度轮廓铺成缎带 */
function brushStroke(ctx, points, widths, fill) {
  const n = points.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = points[i1][0] - points[i0][0], dy = points[i1][1] - points[i0][1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const r = widths[i] / 2;
    L.push([points[i][0] + nx * r, points[i][1] + ny * r]);
    R.push([points[i][0] - nx * r, points[i][1] - ny * r]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  // 两端圆头
  for (const [i, sign] of [[0, 1], [n - 1, 1]]) {
    ctx.beginPath();
    ctx.arc(points[i][0], points[i][1], widths[i] / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function sampleCubic(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** 主视觉：一道连笔签名 + 朱红印章 */
function drawArtwork(ctx, S, opts = {}) {
  const cx = S / 2, cy = S / 2;
  const k = S;

  // ---- 签名主笔：起笔重、行笔提、收笔带锋 ----
  const seg1 = sampleCubic(
    [cx - k * 0.30, cy + k * 0.10],
    [cx - k * 0.16, cy - k * 0.28],
    [cx + k * 0.02, cy - k * 0.26],
    [cx + k * 0.07, cy - k * 0.02], 120);
  const seg2 = sampleCubic(
    [cx + k * 0.07, cy - k * 0.02],
    [cx + k * 0.12, cy + k * 0.18],
    [cx - k * 0.02, cy + k * 0.24],
    [cx + k * 0.14, cy + k * 0.26], 90);
  const seg3 = sampleCubic(
    [cx + k * 0.14, cy + k * 0.26],
    [cx + k * 0.26, cy + k * 0.28],
    [cx + k * 0.30, cy + k * 0.10],
    [cx + k * 0.34, cy - k * 0.10], 90);
  const pts = [...seg1, ...seg2.slice(1), ...seg3.slice(1)];
  const n = pts.length;
  const widths = pts.map((_, i) => {
    const u = i / (n - 1);
    // 起笔饱满 → 中段提细 → 收笔出锋
    const base = 0.155 - 0.085 * Math.sin(Math.PI * Math.min(1, u * 1.15));
    const tail = u > 0.86 ? 1 - 0.75 * ((u - 0.86) / 0.14) : 1;
    return k * base * tail;
  });

  // 外发光
  ctx.save();
  ctx.shadowColor = 'rgba(240,205,140,0.55)';
  ctx.shadowBlur = k * 0.10;
  const gold = ctx.createLinearGradient(cx - k * 0.34, cy + k * 0.26, cx + k * 0.34, cy - k * 0.26);
  gold.addColorStop(0, '#F6E7C4');
  gold.addColorStop(0.45, '#E9C97E');
  gold.addColorStop(1, '#C79A3E');
  brushStroke(ctx, pts, widths, gold);
  ctx.restore();

  // 高光细线（让笔触有墨的光泽）
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(255,250,235,0.9)';
  ctx.lineWidth = k * 0.006;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 2; i < Math.floor(n * 0.55); i++) {
    const p = pts[i];
    if (i === 2) ctx.moveTo(p[0], p[1] - widths[i] * 0.18);
    else ctx.lineTo(p[0], p[1] - widths[i] * 0.18);
  }
  ctx.stroke();
  ctx.restore();

  // ---- 朱红印章 ----
  const seal = k * 0.30;
  const sx = cx + k * 0.235, sy = cy + k * 0.255;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.08);
  const red = ctx.createLinearGradient(-seal / 2, -seal / 2, seal / 2, seal / 2);
  red.addColorStop(0, '#D93A32');
  red.addColorStop(1, '#A81E18');
  ctx.fillStyle = red;
  ctx.shadowColor = 'rgba(200,40,32,0.45)';
  ctx.shadowBlur = k * 0.045;
  const rr = seal * 0.12;
  ctx.beginPath();
  ctx.roundRect(-seal / 2, -seal / 2, seal, seal, rr);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,235,225,0.55)';
  ctx.lineWidth = seal * 0.045;
  ctx.beginPath();
  ctx.roundRect(-seal / 2 + seal * 0.11, -seal / 2 + seal * 0.11, seal * 0.78, seal * 0.78, rr * 0.6);
  ctx.stroke();
  // 印章里的字（大尺寸才画，小了当纹理也没关系）
  ctx.fillStyle = 'rgba(255,244,236,0.95)';
  ctx.font = `${seal * 0.46}px BrushKai`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('签', 0, seal * 0.04);
  ctx.restore();

  // ---- 右下角两粒小墨点 ----
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#E9C97E';
  ctx.beginPath();
  ctx.arc(cx + k * 0.40, cy + k * 0.34, k * 0.018, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + k * 0.44, cy + k * 0.27, k * 0.011, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGlyphArtwork(ctx, S, variant) {
  const cx = S / 2, cy = S / 2, k = S;
  if (variant === 'glyph') {
    // 方案 B：毛笔“签”字
    ctx.save();
    ctx.translate(cx, cy + k * 0.02);
    ctx.rotate(-0.05);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${k * 0.62}px BrushKai`;
    const gold = ctx.createLinearGradient(-k * 0.3, k * 0.3, k * 0.3, -k * 0.3);
    gold.addColorStop(0, '#FBF0D6');
    gold.addColorStop(0.5, '#E7C67C');
    gold.addColorStop(1, '#BF8F33');
    ctx.shadowColor = 'rgba(240,205,140,0.6)';
    ctx.shadowBlur = k * 0.09;
    ctx.fillStyle = gold;
    ctx.fillText('签', 0, 0);
    ctx.restore();
  } else if (variant === 'swoosh2') {
    // 方案 C：一笔行书式连笔 + 长尾
    const seg1 = sampleCubic(
      [cx - k * 0.30, cy - k * 0.16],
      [cx - k * 0.10, cy - k * 0.42],
      [cx + k * 0.16, cy - k * 0.30],
      [cx + k * 0.14, cy - k * 0.02], 110);
    const seg2 = sampleCubic(
      [cx + k * 0.14, cy - k * 0.02],
      [cx + k * 0.12, cy + k * 0.20],
      [cx - k * 0.10, cy + k * 0.24],
      [cx + k * 0.06, cy + k * 0.30], 90);
    const seg3 = sampleCubic(
      [cx + k * 0.06, cy + k * 0.30],
      [cx + k * 0.30, cy + k * 0.38],
      [cx + k * 0.30, cy + k * 0.06],
      [cx + k * 0.40, cy - k * 0.14], 110);
    const pts = [...seg1, ...seg2.slice(1), ...seg3.slice(1)];
    const n = pts.length;
    const widths = pts.map((_, i) => {
      const u = i / (n - 1);
      const base = 0.150 - 0.080 * Math.sin(Math.PI * Math.min(1, u * 1.2));
      const tail = u > 0.84 ? 1 - 0.82 * ((u - 0.84) / 0.16) : 1;
      return k * base * tail;
    });
    ctx.save();
    ctx.shadowColor = 'rgba(240,205,140,0.55)';
    ctx.shadowBlur = k * 0.10;
    const gold = ctx.createLinearGradient(cx - k * 0.34, cy + k * 0.3, cx + k * 0.34, cy - k * 0.24);
    gold.addColorStop(0, '#F9EFD8');
    gold.addColorStop(0.45, '#E8C87E');
    gold.addColorStop(1, '#C2943A');
    brushStroke(ctx, pts, widths, gold);
    ctx.restore();
  }
  drawSealSmall(ctx, S, variant === 'glyph' ? 0.24 : 0.26);
}

function drawSealSmall(ctx, S, sizeK) {
  const k = S, cx = S / 2, cy = S / 2;
  const seal = k * sizeK;
  const sx = cx + k * 0.30, sy = cy + k * 0.30;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.09);
  const red = ctx.createLinearGradient(-seal / 2, -seal / 2, seal / 2, seal / 2);
  red.addColorStop(0, '#DC4038');
  red.addColorStop(1, '#A61D17');
  ctx.fillStyle = red;
  ctx.shadowColor = 'rgba(200,40,32,0.5)';
  ctx.shadowBlur = k * 0.04;
  const rr = seal * 0.13;
  ctx.beginPath();
  ctx.roundRect(-seal / 2, -seal / 2, seal, seal, rr);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,235,225,0.6)';
  ctx.lineWidth = seal * 0.05;
  ctx.beginPath();
  ctx.roundRect(-seal / 2 + seal * 0.12, -seal / 2 + seal * 0.12, seal * 0.76, seal * 0.76, rr * 0.6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,246,240,0.96)';
  ctx.font = `${seal * 0.5}px BrushKai`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('签', 0, seal * 0.03);
  ctx.restore();
}

function makeIcon(S, { round = false, fullBleed = false, scale = 1, variant = 'glyph' } = {}) {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  if (fullBleed) {
    inkBackground(ctx, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.scale(scale, scale);
    ctx.translate(-S / 2, -S / 2);
    if (variant === 'swoosh') drawArtwork(ctx, S); else drawGlyphArtwork(ctx, S, variant);
    ctx.restore();
  } else {
    // 圆角/圆形底板
    ctx.save();
    if (round) {
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      ctx.clip();
    } else {
      const r = S * 0.225;
      ctx.beginPath();
      ctx.roundRect(0, 0, S, S, r);
      ctx.clip();
    }
    inkBackground(ctx, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.scale(scale, scale);
    ctx.translate(-S / 2, -S / 2);
    if (variant === 'swoosh') drawArtwork(ctx, S); else drawGlyphArtwork(ctx, S, variant);
    ctx.restore();
    ctx.restore();
  }
  return c;
}

// ---------- 输出 ----------
const dens = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
const adens = [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]];
const RES = process.argv[3] || path.join(ROOT, '..', 'android', 'app', 'src', 'main', 'res');

// 预览大图
for (const variant of ['glyph']) {
  fs.writeFileSync(path.join(OUT, `cand-${variant}-512.png`), makeIcon(512, { variant }).toBuffer('image/png'));
  const small = makeIcon(96, { variant });
  const strip = createCanvas(96 * 4 + 30, 96);
  const sctx = strip.getContext('2d');
  sctx.fillStyle = '#14141a'; sctx.fillRect(0, 0, strip.width, strip.height);
  let x = 0;
  for (const sz of [96, 72, 48, 32]) {
    const ic = makeIcon(sz, { variant });
    sctx.drawImage(ic, x, (96 - sz) / 2, sz, sz);
    x += sz + 10;
  }
  fs.writeFileSync(path.join(OUT, `cand-${variant}-small.png`), strip.toBuffer('image/png'));
}
if (RES && fs.existsSync(RES)) {
  for (const [d, S] of dens) {
    const dir = path.join(RES, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), makeIcon(S).toBuffer('image/png'));
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), makeIcon(S, { round: true }).toBuffer('image/png'));
  }
  for (const [d, S] of adens) {
    const dir = path.join(RES, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    // 自适应前景：内容缩放后落在 66% 安全区内，其余透明
    const fg = createCanvas(S, S);
    const fctx = fg.getContext('2d');
    fctx.translate(S / 2, S / 2);
    fctx.scale(0.78, 0.78);
    fctx.translate(-S / 2, -S / 2);
    drawGlyphArtwork(fctx, S, 'glyph');
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg.toBuffer('image/png'));
    // 背景层：纯底纹，不含文字
    const bg = createCanvas(S, S);
    inkBackground(bg.getContext('2d'), S);
    fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'), bg.toBuffer('image/png'));
  }
  console.log('已写入 Android 资源:', RES);
}
console.log('预览图:', OUT);
