// tools/verify-port.mjs — 验证移植版各参数是否真的改变输出
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../port/engine.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'tools', 'frames');
fs.mkdirSync(OUT, { recursive: true });
const W = 640, H = 400;

function inkRatio(cfg) {
  const scene = E.buildPortScene(cfg, W, H);
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  E.renderPortFrame(ctx, scene, scene.total);
  const d = ctx.getImageData(0, 0, W, H).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    // 统计明显亮于背景的像素（笔画/装饰是浅色，背景接近黑）
    if (d[i] + d[i + 1] + d[i + 2] > 260) ink++;
  }
  return { ratio: ink / (W * H), scene, canvas: c };
}

const base = { ...E.PORT_DEFAULTS, text: 'Chen Ming', background: { mode: 'solid', color: '#0B0B12' } };
const withFont = (patch) => ({ ...base, font: { ...base.font, ...patch } });
const withDeco = (id) => ({ ...base, decoration: { ...base.decoration, id } });

const cases = [
  ['基线', base],
  ['笔压 低(0.2)', withFont({ pressure: 0.2 })],
  ['笔压 高(1.0)', withFont({ pressure: 1.0 })],
  ['首字母 1.0×', withFont({ initialScale: 1.0 })],
  ['首字母 1.6×', withFont({ initialScale: 1.6 })],
  ['笔宽 0.7', withFont({ penWidth: 0.7 })],
  ['笔宽 1.4', withFont({ penWidth: 1.4 })],
  ['字号 180', withFont({ size: 180 })],
  ['字号 300', withFont({ size: 300 })],
  ['收笔 0.6', withFont({ terminalLength: 0.6 })],
  ['收笔 1.5', withFont({ terminalLength: 1.5 })],
  ['墨色 粉', { ...base, ink: '#FF8EC7' }],
  ['发光 关', { ...base, glow: { ...base.glow, on: false } }],
  ['装饰 无', withDeco('none')],
  ['装饰 猫', withDeco('cat')],
  ['装饰 星星', withDeco('star')],
  ['下划线 关', { ...base, underline: { ...base.underline, on: false } }],
  ['光点 关', { ...base, comet: { ...base.comet, on: false } }],
  ['时长 3s', { ...base, timing: { mode: 'duration', duration: 3 } }],
  ['时长 8s', { ...base, timing: { mode: 'duration', duration: 8 } }],
];

const rows = [];
let baseline = null;
for (const [name, cfg] of cases) {
  const r = inkRatio(cfg);
  if (name === '基线') baseline = r.ratio;
  rows.push({ name, ratio: r.ratio, delta: r.ratio - baseline, total: r.scene.total, strokes: r.scene.brush.strokes.length, canvas: r.canvas });
}
console.log('参数               墨迹占比    相对基线      总时长  笔画');
for (const r of rows) {
  console.log(
    r.name.padEnd(16),
    (r.ratio * 100).toFixed(2).padStart(8) + '%',
    (r.delta >= 0 ? '+' : '') + (r.delta * 100).toFixed(2).padStart(8) + '%',
    r.total.toFixed(2).padStart(8) + 's',
    String(r.strokes).padStart(4),
  );
}

// 拼图：笔压 & 首字母 视觉对比
const picks = ['笔压 低(0.2)', '笔压 高(1.0)', '首字母 1.0×', '首字母 1.6×'];
const cols = 2, rowsN = 2;
const sheet = createCanvas(W * cols, H * rowsN);
const sctx = sheet.getContext('2d');
picks.forEach((name, i) => {
  const r = rows.find((x) => x.name === name);
  sctx.drawImage(r.canvas, (i % cols) * W, Math.floor(i / cols) * H);
  sctx.fillStyle = '#F2F0EA';
  sctx.font = 'bold 18px sans-serif';
  sctx.fillText(name, (i % cols) * W + 16, Math.floor(i / cols) * H + 30);
});
fs.writeFileSync(path.join(OUT, 'port-verify.png'), sheet.toBuffer('image/png'));
console.log('\n对比图:', path.join(OUT, 'port-verify.png'));
