// tools/icon-finalists.mjs — 从图标库图形 × 现代底板里挑终选组合
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'icon');

const PICKS = [
  ['F1', 'ph', 'signature-bold', 'T1', '渐变签名'],
  ['F2', 'ph', 'signature-bold', 'T2', '电光蓝签名'],
  ['F3', 'ph', 'signature-bold', 'T4', '浅色签名'],
  ['F4', 'ph', 'signature-bold', 'T3', '玻璃签名'],
  ['F5', 'mdi', 'fountain-pen', 'T1', '渐变钢笔'],
  ['F6', 'material-symbols', 'ink-pen', 'T2', '电光墨笔'],
  ['F7', 'tabler', 'signature', 'T1', '渐变行草'],
  ['F8', 'ph', 'pen-nib-bold', 'T4', '浅色笔尖'],
  ['F9', 'mingcute', 'signature-fill', 'T2', '电光连笔'],
  ['F10', 'ph', 'scribble-loop-bold', 'T3', '玻璃笔迹'],
];
const LIC = { ph: 'MIT', mdi: 'Apache-2.0', 'material-symbols': 'Apache-2.0', tabler: 'MIT', mingcute: 'Apache-2.0' };

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function linGrad(ctx, S, stops, a = 0) {
  const c = S / 2, r = S * 0.75;
  const g = ctx.createLinearGradient(c - Math.cos(a) * r, c - Math.sin(a) * r, c + Math.cos(a) * r, c + Math.sin(a) * r);
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
  return g;
}
const BG = {
  T1: (ctx, S) => {
    ctx.fillStyle = linGrad(ctx, S, ['#5B2CFF', '#FF2D95', '#FFB347', '#22D3EE'], -0.75);
    ctx.fillRect(0, 0, S, S);
    const r = ctx.createRadialGradient(S * 0.3, S * 0.22, 0, S * 0.3, S * 0.22, S * 0.9);
    r.addColorStop(0, 'rgba(255,255,255,0.30)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  },
  T2: (ctx, S) => {
    ctx.fillStyle = linGrad(ctx, S, ['#1147FF', '#0A2FD6'], -0.6);
    ctx.fillRect(0, 0, S, S);
    const r = ctx.createRadialGradient(S * 0.28, S * 0.2, 0, S * 0.28, S * 0.2, S * 0.85);
    r.addColorStop(0, 'rgba(130,170,255,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  },
  T3: (ctx, S) => {
    ctx.fillStyle = linGrad(ctx, S, ['#0B0F1E', '#1E3A8A', '#7C3AED'], -0.6);
    ctx.fillRect(0, 0, S, S);
    const pad = S * 0.09;
    ctx.save(); rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.24); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, 0, S, S);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = S * 0.012;
    rr(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.24); ctx.stroke();
  },
  T4: (ctx, S) => {
    ctx.fillStyle = linGrad(ctx, S, ['#F7F8FC', '#D9E0EE'], -0.5);
    ctx.fillRect(0, 0, S, S);
  },
};
async function glyphPng(prefix, name, px, color) {
  const r = await fetch(`https://api.iconify.design/${prefix}/${name}.svg?color=${color}&height=400`);
  if (!r.ok) return null;
  const svg = await r.text();
  return new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
}

const TILE = 300, C = 5, R = Math.ceil(PICKS.length / C);
const sheet = createCanvas(C * TILE, R * (TILE + 44));
const s = sheet.getContext('2d');
s.fillStyle = '#15151B'; s.fillRect(0, 0, sheet.width, sheet.height);
for (let i = 0; i < PICKS.length; i++) {
  const [id, prefix, name, t, label] = PICKS[i];
  const S = TILE - 36;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.save(); rr(ctx, 0, 0, S, S, S * 0.225); ctx.clip();
  BG[t](ctx, S);
  ctx.restore();
  const color = t === 'T4' ? '%23101118' : '%23FFFFFF';
  const png = await glyphPng(prefix, name, Math.round(S * 0.54), color);
  if (png) {
    const img = await loadImage(png);
    const gw = S * 0.54, gh = img.height * (gw / img.width);
    ctx.drawImage(img, (S - gw) / 2, (S - gh) / 2, gw, gh);
  }
  const cx = (i % C) * TILE, cy = Math.floor(i / C) * (TILE + 44);
  s.drawImage(c, cx + 18, cy + 14, S, S);
  s.fillStyle = '#F2F0EA'; s.font = 'bold 15px sans-serif';
  s.fillText(`${id} ${label}`, cx + 18, cy + TILE + 2);
  s.fillStyle = '#8A8A94'; s.font = '11px sans-serif';
  s.fillText(`${prefix}:${name} · ${LIC[prefix] || '?'}`, cx + 18, cy + TILE + 18);
}
fs.writeFileSync(path.join(OUT, 'finalists.png'), sheet.toBuffer('image/png'));
console.log('终选 10 个组合 →', path.join(OUT, 'finalists.png'));
