// tools/diff.mjs — 像素级诊断：完整字形 vs 逐笔揭示结果
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

function build(text, fontId) {
  const font = R.FONTS.find((f) => f.id === fontId);
  const fontStack = `"${ALIAS[fontId]}"`;
  const g = makeCanvas(SIZE, SIZE);
  const t0 = Date.now();
  const scene = R.buildScene({
    ctx: g.getContext('2d'), text, fontStack, W: SIZE, H: SIZE, font,
    getCharData: (ch) => loadChar(ch), makeCanvas,
  });
  const ms = Date.now() - t0;
  return { scene, g, fontStack, ms };
}

function measure(text, fontId, saveTag) {
  const { scene, g, fontStack, ms } = build(text, fontId);
  R.renderGlyphLayer(g, scene, { id: 'x', stops: ['#000000', '#000000'], glow: '#000', glowR: 0 });
  const m = makeCanvas(SIZE, SIZE);
  const painter = R.createMaskPainter(m.getContext('2d'), scene, SIZE, SIZE, { makeCanvas });
  painter.reset();
  painter.paint(1e9);
  painter.paintFallback(scene, 1e9);

  const rev = makeCanvas(SIZE, SIZE);
  const rc = rev.getContext('2d');
  rc.drawImage(g, 0, 0);
  rc.globalCompositeOperation = 'destination-in';
  rc.drawImage(m, 0, 0);

  const gd = g.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const rd = rc.getImageData(0, 0, SIZE, SIZE).data;
  const diag = makeCanvas(SIZE, SIZE);
  const octx = diag.getContext('2d');
  const img = octx.createImageData(SIZE, SIZE);
  let miss = 0, hit = 0;
  for (let i = 0; i < gd.length; i += 4) {
    const ga = gd[i + 3], ra = rd[i + 3];
    let r = 255, gg = 255, b = 255;
    if (ga > 40 && ra > 40) { hit++; r = 90; gg = 90; b = 95; }
    else if (ga > 40) { miss++; r = 235; gg = 60; b = 60; }
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  if (saveTag) {
    fs.writeFileSync(path.join(OUT, `diag_${saveTag}.png`), diag.toBuffer('image/png'));
    const preview = makeCanvas(SIZE, SIZE);
    const pc = preview.getContext('2d');
    pc.fillStyle = '#F7F4EC'; pc.fillRect(0, 0, SIZE, SIZE);
    pc.drawImage(rev, 0, 0);
    fs.writeFileSync(path.join(OUT, `rev_${saveTag}.png`), preview.toBuffer('image/png'));
  }
  // 笔画数量 = 骨架段数量
  const segCount = {};
  for (const s of scene.strokes) segCount[s.charIndex] = (segCount[s.charIndex] || 0) + 1;
  const cov = (hit / Math.max(hit + miss, 1)) * 100;
  return { cov, segs: scene.strokes.length, ms, perChar: segCount, duration: scene.duration };
}

console.log('覆盖率 & 骨架性能：');
let min = 100, worst = '';
for (const text of ['张', '张三', '欧阳明月', '王小明', '李四']) {
  const row = [];
  for (const f of R.FONTS) {
    const r = measure(text, f.id, text === '张三' ? `${text}_${f.id}` : null);
    row.push(`${f.label} ${r.cov.toFixed(0)}%/${r.segs}段/${r.ms}ms`);
    if (r.cov < min) { min = r.cov; worst = `${text}/${f.label}`; }
  }
  console.log(`  ${text.padEnd(5)} ${row.join('  ')}`);
}
console.log(`\n最低覆盖率 ${min.toFixed(1)}%（${worst}）`);
