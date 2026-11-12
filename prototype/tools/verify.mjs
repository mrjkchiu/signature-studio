// tools/verify.mjs — 像素级诊断：完整字形 vs 遮罩揭示结果，量化漏墨率
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import * as R from '../renderer.js';
import { ROOT, loadChar } from './charload.mjs';

const OUT = path.join(ROOT, 'tools', 'frames');
fs.mkdirSync(OUT, { recursive: true });
const ALIAS = Object.fromEntries(R.FONTS.map((f) => [f.id, f.css]));
for (const f of R.FONTS) GlobalFonts.registerFromPath(path.join(ROOT, f.file), ALIAS[f.id]);

const makeCanvas = (w, h) => createCanvas(w, h);
const SIZE = 720;

/** 渲染一帧到画布（含背景），返回画布 */
function renderOne(text, fontId, t, opts = {}) {
  const font = R.FONTS.find((f) => f.id === fontId);
  const fontStack = `"${ALIAS[fontId]}"`;
  const mk = () => makeCanvas(SIZE, SIZE);
  const g = mk(), m = mk(), tmp = mk(), out = mk();
  const scene = R.buildScene({
    ctx: g.getContext('2d'), text, fontStack, W: SIZE, H: SIZE, font,
    getCharData: (ch) => loadChar(ch), makeCanvas,
  });
  const palette = R.PALETTES.find((p) => p.id === (opts.palette || 'ink'));
  R.renderGlyphLayer(g, scene, palette);
  const painter = R.createMaskPainter(m.getContext('2d'), scene, SIZE, SIZE, { makeCanvas });
  painter.reset();
  const env = {
    ctx: out.getContext('2d'), scene, glyphCanvas: g, maskCanvas: m, tempCanvas: tmp, makeCanvas,
    painter, particles: R.createParticleSystem(), palette,
    backdropId: opts.backdrop || 'paper',
    params: { enter: false, shine: true, neon: false, trail: false, particle: false },
  };
  R.renderFrame(env, t == null ? scene.writeEnd + 200 : t);
  return { canvas: out, scene };
}

// 1. 动态关键帧拼图：每套字体一行，取 25/50/75/100% 四个时刻
const tags = ['张三', '欧阳明月'];
const fontsToShow = ['msz', 'zmx', 'ljm', 'zkk'];
const tile = 320;
const cols = 4;
for (const text of tags) {
  const rows = fontsToShow.length;
  const sheet = makeCanvas(tile * cols, tile * rows);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#111114';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  fontsToShow.forEach((fid, ri) => {
    // 先建场景拿到时长
    const probe = renderOne(text, fid, 0);
    const end = probe.scene.writeEnd + 120;
    const times = [0.22, 0.5, 0.78, 1.0].map((p) => Math.max(140, end * p));
    times.forEach((t, ci2) => {
      const { canvas } = renderOne(text, fid, t);
      sctx.drawImage(canvas, ci2 * tile, ri * tile, tile, tile);
      sctx.fillStyle = '#fff';
      sctx.font = '13px sans-serif';
      sctx.fillText(`${R.FONTS.find(f=>f.id===fid).label} ${Math.round(t)}ms`, ci2 * tile + 8, ri * tile + 18);
    });
  });
  fs.writeFileSync(path.join(OUT, `sheet_${text}.png`), sheet.toBuffer('image/png'));
  console.log('sheet:', text);
}
