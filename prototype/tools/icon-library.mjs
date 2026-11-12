// tools/icon-library.mjs — 从开源图标库抓「签名/笔/墨」类图形，做参考图 + 套现代底板
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'icon');
fs.mkdirSync(OUT, { recursive: true });
try { GlobalFonts.registerFromPath(path.join(ROOT, 'fonts', 'smileysans.ttf'), 'ModernBlack'); } catch (e) {}

const GLYPHS = [
  ['material-symbols', 'signature'],
  ['material-symbols', 'signature-rounded'],
  ['ph', 'signature-bold'],
  ['ph', 'signature'],
  ['mdi', 'signature'],
  ['tabler', 'signature'],
  ['lucide', 'signature'],
  ['mingcute', 'signature-fill'],
  ['material-symbols', 'ink-pen'],
  ['material-symbols', 'stylus-rounded'],
  ['ph', 'pen-nib-bold'],
  ['lucide', 'pen-tool'],
  ['tabler', 'fountain'],
  ['mdi', 'fountain-pen'],
  ['material-symbols', 'draw-rounded'],
  ['material-symbols', 'edit-rounded'],
  ['ph', 'scribble-loop-bold'],
  ['material-symbols', 'history-edu'],
];

async function svgOf(prefix, name, color = '%23FFFFFF') {
  const url = `https://api.iconify.design/${prefix}/${name}.svg?color=${color}&height=400`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return await r.text();
}
async function pngOf(prefix, name, px, color) {
  const svg = await svgOf(prefix, name, color);
  if (!svg) return null;
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: px } });
  return resvg.render().asPng();
}

// 许可信息
let licenses = {};
try {
  const r = await fetch('https://api.iconify.design/collections');
  const j = await r.json();
  for (const [k, v] of Object.entries(j)) licenses[k] = (v.license && (v.license.title || v.license.spdx)) || '?';
} catch (e) {}

// ---------- 参考图：库里长什么样 ----------
const tile = 210, cols = 6, rows = Math.ceil(GLYPHS.length / cols);
const sheet = createCanvas(cols * tile, rows * (tile + 46));
const sctx = sheet.getContext('2d');
sctx.fillStyle = '#15151B'; sctx.fillRect(0, 0, sheet.width, sheet.height);
for (let i = 0; i < GLYPHS.length; i++) {
  const [prefix, name] = GLYPHS[i];
  const png = await pngOf(prefix, name, 120, '%23F2F0EA');
  const cx = (i % cols) * tile, cy = Math.floor(i / cols) * (tile + 46);
  sctx.fillStyle = '#20202A';
  sctx.beginPath();
  if (sctx.roundRect) sctx.roundRect(cx + 16, cy + 14, tile - 32, tile - 32, 22);
  sctx.fill();
  if (png) {
    const img = (await import('@napi-rs/canvas')).loadImage ? undefined : undefined;
  }
  const img = await loadPng(png);
  if (img) sctx.drawImage(img, cx + (tile - 120) / 2, cy + 14 + (tile - 32 - 120) / 2, 120, 120);
  sctx.fillStyle = '#F2F0EA';
  sctx.font = 'bold 13px sans-serif';
  sctx.fillText(`${prefix}:${name}`.slice(0, 30), cx + 16, cy + tile + 4);
  sctx.fillStyle = '#8A8A94';
  sctx.font = '11px sans-serif';
  sctx.fillText(licenses[prefix] || '?', cx + 16, cy + tile + 20);
}
fs.writeFileSync(path.join(OUT, 'library-gallery.png'), sheet.toBuffer('image/png'));

async function loadPng(buf) {
  if (!buf) return null;
  const { loadImage } = await import('@napi-rs/canvas');
  return await loadImage(buf);
}

// ---------- 套现代底板 ----------
const PICKED = [
  ['ph', 'signature-bold'],
  ['material-symbols', 'signature'],
  ['material-symbols', 'signature-rounded'],
  ['mdi', 'signature'],
  ['mingcute', 'signature-fill'],
  ['ph', 'scribble-loop-bold'],
  ['material-symbols', 'ink-pen'],
  ['ph', 'pen-nib-bold'],
];

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function linGrad(ctx, S, stops, a = 0) {
  const c = S / 2, r = S * 0.75;
  const g = ctx.createLinearGradient(c - Math.cos(a) * r, c - Math.sin(a) * r, c + Math.cos(a) * r, c + Math.sin(a) * r);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  return g;
}
const BG = {
  T1: (ctx, S) => {
    const g = linGrad(ctx, S, ['#5B2CFF', '#FF2D95', '#FFB347', '#22D3EE'], -0.7);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const r = ctx.createRadialGradient(S * 0.3, S * 0.25, 0, S * 0.3, S * 0.25, S * 0.9);
    r.addColorStop(0, 'rgba(255,255,255,0.28)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  },
  T2: (ctx, S) => {
    const g = linGrad(ctx, S, ['#1147FF', '#0A2FD6'], -0.6);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const r = ctx.createRadialGradient(S * 0.28, S * 0.22, 0, S * 0.28, S * 0.22, S * 0.85);
    r.addColorStop(0, 'rgba(120,160,255,0.5)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  },
  T3: (ctx, S) => {
    const g = linGrad(ctx, S, ['#0B0F1E', '#1E3A8A', '#7C3AED'], -0.6);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const pad = S * 0.09;
    ctx.save();
    rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.24);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = S * 0.012;
    rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.24);
    ctx.stroke();
  },
  T4: (ctx, S) => {
    const g = linGrad(ctx, S, ['#F6F7FB', '#DCE3F0'], -0.5);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  },
};

const TILE = 300, C = 4, R = Math.ceil((PICKED.length * 4) / C);
const sheet2 = createCanvas(C * TILE, R * (TILE + 40));
const s2 = sheet2.getContext('2d');
s2.fillStyle = '#15151B'; s2.fillRect(0, 0, sheet2.width, sheet2.height);
let idx = 0;
for (const [prefix, name] of PICKED) {
  for (const t of ['T1', 'T2', 'T3', 'T4']) {
    const S = TILE - 40;
    const c = createCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.save(); rr(ctx, 0, 0, S, S, S * 0.225); ctx.clip();
    BG[t](ctx, S);
    ctx.restore();
    const color = t === 'T4' ? '%23111118' : '%23FFFFFF';
    const png = await pngOf(prefix, name, Math.round(S * 0.56), color);
    const img = await loadPng(png);
    if (img) {
      const gw = S * 0.56, gh = img.height * (gw / img.width);
      ctx.drawImage(img, (S - gw) / 2, (S - gh) / 2, gw, gh);
    }
    const cx = (idx % C) * TILE, cy = Math.floor(idx / C) * (TILE + 40);
    s2.drawImage(c, cx + 20, cy + 14, S, S);
    s2.fillStyle = '#F2F0EA'; s2.font = 'bold 13px sans-serif';
    s2.fillText(`${prefix}:${name} · ${t}`, cx + 20, cy + TILE + 2);
    s2.fillStyle = '#8A8A94'; s2.font = '11px sans-serif';
    s2.fillText(licenses[prefix] || '?', cx + 20, cy + TILE + 18);
    idx++;
  }
}
fs.writeFileSync(path.join(OUT, 'library-app-icons.png'), sheet2.toBuffer('image/png'));
console.log('参考图 + 应用图标图已生成');
