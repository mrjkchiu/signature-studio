// tools/smooth.mjs — 书写顺滑度量化 + 胶片条（目测笔锋与连续性）
// 指标：
//   停顿率  = 笔尖几乎不动的帧占比（高 → 一顿一顿）
//   跳变率  = 笔尖瞬移超过字形 4% 的帧占比（高 → 不跟笔画走）
//   推进度  = 中途帧的实际覆盖率 / 时间进度（明显偏低 → 揭示滞后）
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import * as R from '../renderer.js';
import { ROOT, loadChar } from './charload.mjs';

const OUT = path.join(ROOT, 'tools', 'frames');
fs.mkdirSync(OUT, { recursive: true });
const ALIAS = Object.fromEntries(R.FONTS.map((f) => [f.id, f.css]));
for (const f of R.FONTS) {
  try { GlobalFonts.registerFromPath(path.join(ROOT, f.file), ALIAS[f.id]); } catch (e) { /* 字体未下载 */ }
}
const makeCanvas = (w, h) => createCanvas(w, h);
const SIZE = 720;

function build(text, fontId) {
  const font = R.FONTS.find((f) => f.id === fontId);
  const fontStack = `"${ALIAS[fontId]}"`;
  const g = makeCanvas(SIZE, SIZE);
  const scene = R.buildScene({
    ctx: g.getContext('2d'), text, fontStack, W: SIZE, H: SIZE, font,
    getCharData: (ch) => loadChar(ch), makeCanvas,
  });
  R.renderGlyphLayer(g, scene, R.PALETTES.find((p) => p.id === 'ink'));
  return { scene, g, font, fontStack };
}

function freshEnv(scene, g, fontStack) {
  const m = makeCanvas(SIZE, SIZE);
  const tmp = makeCanvas(SIZE, SIZE);
  const out = makeCanvas(SIZE, SIZE);
  const painter = R.createMaskPainter(m.getContext('2d'), scene, SIZE, SIZE, { makeCanvas });
  painter.reset();
  const env = {
    ctx: out.getContext('2d'), scene, glyphCanvas: g, maskCanvas: m, tempCanvas: tmp, makeCanvas,
    painter, particles: R.createParticleSystem(),
    palette: R.PALETTES.find((p) => p.id === 'ink'), backdropId: 'paper',
    params: { enter: false, shine: false, neon: false, trail: false, particle: false },
  };
  return env;
}

function analyze(text, fontId) {
  const { scene, g, fontStack } = build(text, fontId);
  const env = freshEnv(scene, g, fontStack);
  const maskCtx = env.maskCanvas.getContext('2d');
  const dt = 1000 / 60;
  const frames = Math.ceil(scene.writeEnd / dt);
  const areas = [];
  for (let f = 1; f <= frames; f++) {
    R.renderFrame(env, (f * 1000) / 60);
    const src = env.combCanvas || env.maskCanvas;
    const d = src.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    let a = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) a++;
    areas.push(a);
  }
  const deltas = [];
  for (let i = 1; i < areas.length; i++) deltas.push(areas[i] - areas[i - 1]);
  const positive = deltas.filter((v) => v > 0);
  const median = positive.length ? positive.sort((x, y) => x - y)[Math.floor(positive.length / 2)] : 0;
  const zeros = deltas.filter((v) => v <= 0).length;
  const bursts = deltas.filter((v) => v > median * 3).length;
  const still = deltas.length ? zeros / deltas.length : 0;
  const burstRate = deltas.length ? bursts / deltas.length : 0;
  return { scene, still, burstRate, grow: areas[areas.length - 1] };
}

// 胶片条：两行 × 6 帧
function filmstrip(text, fontId, tag) {
  const { scene, g, fontStack } = build(text, fontId);
  const cols = 6, rows = 2, tile = 320;
  const sheet = makeCanvas(tile * cols, tile * rows);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#0e0e12';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  const total = cols * rows;
  for (let i = 0; i < total; i++) {
    const t = scene.writeStart + ((scene.writeEnd - scene.writeStart) * (i + 1)) / total;
    const env = freshEnv(scene, g, fontStack);
    R.renderFrame(env, t);
    const cx = (i % cols) * tile, cy = Math.floor(i / cols) * tile;
    sctx.drawImage(env.ctx.canvas, cx, cy, tile, tile);
    sctx.fillStyle = 'rgba(255,255,255,.75)';
    sctx.font = '12px sans-serif';
    sctx.fillText(`${Math.round(t)}ms`, cx + 6, cy + 15);
  }
  fs.writeFileSync(path.join(OUT, `film_${tag}.png`), sheet.toBuffer('image/png'));
  console.log('film:', tag);
}

console.log('顺滑度指标（60fps 模拟，逐帧墨迹增量）：');
let worstStill = 0, worstTag = '';
for (const text of ['张三', '欧阳明月']) {
  for (const fid of ['msz', 'zmx', 'ljm', 'lct', 'zkk']) {
    try {
      const r = analyze(text, fid);
      const tag = `${text}/${R.FONTS.find((f) => f.id === fid).label}`;
      console.log(`  ${tag.padEnd(14)} 空帧 ${(r.still * 100).toFixed(1)}%  突增帧 ${(r.burstRate * 100).toFixed(1)}%  笔画段 ${r.scene.strokes.length}`);
      if (r.still > worstStill) { worstStill = r.still; worstTag = tag; }
    } catch (e) { console.log('  ' + text + '/' + fid + ' 跳过: ' + e.message); }
  }
}
console.log(`\n最差空帧率 ${(worstStill * 100).toFixed(1)}%（${worstTag}）`);

filmstrip('张三', 'msz', 'zhangsan_msz');
filmstrip('欧阳明月', 'zmx', 'ouyang_zmx');
