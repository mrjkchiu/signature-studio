// tools/make-icon-final.mjs — 最终版图标：流体渐变底 + 行草连笔（F7）
// 图形来源：Tabler Icons (MIT) 的 signature 图标；底色为程序化渐变。
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'icon');
const RES = path.join(ROOT, '..', 'android', 'app', 'src', 'main', 'res');
fs.mkdirSync(OUT, { recursive: true });

const GLYPH_CACHE = path.join(OUT, 'glyph-tabler-signature.svg');
async function glyphSvg() {
  if (fs.existsSync(GLYPH_CACHE)) return fs.readFileSync(GLYPH_CACHE, 'utf8');
  const r = await fetch('https://api.iconify.design/tabler/signature.svg?color=%23FFFFFF&height=400');
  const t = await r.text();
  fs.writeFileSync(GLYPH_CACHE, t);
  return t;
}
async function glyphPng(px, color = '#FFFFFF') {
  let svg = await glyphSvg();
  if (color !== '#FFFFFF') svg = svg.replace(/%23FFFFFF|#FFFFFF/gi, color.replace('#', '%23'));
  return new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

function gradientBg(ctx, S) {
  const c = S / 2, rad = S * 0.78;
  const a = -0.75;
  const g = ctx.createLinearGradient(
    c - Math.cos(a) * rad, c - Math.sin(a) * rad,
    c + Math.cos(a) * rad, c + Math.sin(a) * rad);
  ['#5B2CFF', '#FF2D95', '#FFB347', '#22D3EE'].forEach((col, i) => g.addColorStop(i / 3, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const r = ctx.createRadialGradient(S * 0.30, S * 0.22, 0, S * 0.30, S * 0.22, S * 0.95);
  r.addColorStop(0, 'rgba(255,255,255,0.30)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, S, S);
}

async function compose(S, { round = false, glyphScale = 0.54, drawGlyph = true } = {}) {
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.save();
  if (round) { ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip(); }
  else { rr(ctx, 0, 0, S, S, S * 0.225); ctx.clip(); }
  gradientBg(ctx, S);
  ctx.restore();
  if (drawGlyph) {
    const png = await glyphPng(Math.round(S * glyphScale));
    const img = await loadImage(png);
    const gw = S * glyphScale, gh = img.height * (gw / img.width);
    ctx.drawImage(img, (S - gw) / 2, (S - gh) / 2, gw, gh);
  }
  return c;
}

// ---- 预览 ----
for (const [file, S, opts] of [
  ['final-512.png', 512, {}],
  ['final-round-512.png', 512, { round: true }],
]) {
  fs.writeFileSync(path.join(OUT, file), (await compose(S, opts)).toBuffer('image/png'));
}

// ---- Android 资源 ----
const dens = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
const adens = [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]];
for (const [d, S] of dens) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), (await compose(S)).toBuffer('image/png'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), (await compose(S, { round: true })).toBuffer('image/png'));
}
for (const [d, S] of adens) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  // 背景层：纯渐变全填充
  fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'), (await compose(S, { drawGlyph: false })).toBuffer('image/png'));
  // 前景层：透明底 + 图形（缩到安全区 66% 内）
  const fg = createCanvas(S, S);
  const fctx = fg.getContext('2d');
  const png = await glyphPng(Math.round(S * 0.42));
  const img = await loadImage(png);
  const gw = S * 0.42, gh = img.height * (gw / img.width);
  fctx.drawImage(img, (S - gw) / 2, (S - gh) / 2, gw, gh);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg.toBuffer('image/png'));
}
console.log('图标资源已写入', RES);
