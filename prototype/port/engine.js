// port/engine.js — 移植版的场景布局与时间轴
// 结构对应参考项目：layout.ts（布局）+ timeline.ts（阶段）+ Preview 的绘制顺序。
import { buildBrush, drawStrokeRibbon, brushProgress, between, clamp, smooth } from './brush.js';
import { drawDecoration } from './decor.js';

const DEG = Math.PI / 180;
export const METRICS_DEFAULT = { xHeight: 300 };

export const PORT_DEFAULTS = {
  text: 'Chen Ming',
  font: { size: 240, penWidth: 1, pressure: 1, initialScale: 1.3, initialOffsetX: 0, initialOffsetY: 0, terminalLength: 1 },
  ink: '#F5FFFD',
  glow: { on: true, color: '#59E6D7', strength: 0.65, radius: 18 },
  decoration: { id: 'sun', scale: 1, offsetX: 0, offsetY: 0, action: 'wink', earFold: true },
  underline: { on: true, lift: true },
  comet: { on: true, color: '#F07CDA', size: 1.6 },
  timing: { mode: 'duration', duration: 5 },
  background: { mode: 'solid', color: '#0B0B12' },
};

function cubicPts(p0, p1, p2, p3, n = 60) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    });
  }
  return out;
}
function rotate(p, deg, around = { x: 0, y: 0 }) {
  const a = -deg * DEG;
  const dx = p.x - around.x, dy = p.y - around.y;
  return { x: around.x + dx * Math.cos(a) - dy * Math.sin(a), y: around.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** 构建场景：笔迹、装饰位置、下划线、阶段时间 */
export function buildPortScene(cfg, W, H) {
  const c = cfg || PORT_DEFAULTS;
  const brush = buildBrush({ text: c.text, font: c.font });
  const box = brush.box;
  const width = box.maxX - box.minX, height = box.maxY - box.minY;
  const rotation = 5;
  const pivot = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };

  // 装饰：放在字上方偏右
  const radius = width * (c.decoration.id === 'cat' ? 0.125 : 0.085) * c.decoration.scale * 2.2;
  const decoBottomBase = c.decoration.id === 'sun' ? 85 : c.decoration.id === 'cat' ? 38 : 58;
  const deco = {
    x: box.maxX + width * 0.04 + c.decoration.offsetX * width,
    y: box.minY - radius * (decoBottomBase / 50) * 0.55 + c.decoration.offsetY * height,
    radius,
  };

  // 下划线
  const base = box.maxY + Math.max(c.font.size * 0.14, height * 0.10);
  const line = cubicPts(
    { x: box.minX + width * 0.06, y: base + c.font.size * 0.02 },
    { x: box.minX + width * 0.38, y: base },
    { x: box.maxX - width * 0.18, y: base },
    { x: box.maxX + width * 0.02, y: base + c.font.size * 0.015 },
  );
  const exit = line[line.length - 1];
  const leaving = cubicPts(exit, { x: exit.x + 90, y: exit.y - 90 }, { x: exit.x + 50, y: deco.y - radius * 0.7 }, { x: deco.x + radius * 0.9, y: deco.y - radius * 0.6 });

  // 适配画布
  const glow = c.glow.on ? c.glow.radius * 2 : 0;
  let minX = box.minX, maxX = box.maxX, minY = box.minY, maxY = box.maxY;
  if (c.decoration.id !== 'none') {
    minX = Math.min(minX, deco.x - radius); maxX = Math.max(maxX, deco.x + radius);
    minY = Math.min(minY, deco.y - radius); maxY = Math.max(maxY, deco.y + radius * (decoBottomBase / 50));
  }
  if (c.underline.on) for (const p of line) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  if (c.comet.on && c.underline.on) for (const p of leaving) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); }
  const pad = glow + Math.max(c.font.size * 0.10, 18);
  const fitW = W - pad * 2, fitH = H - pad * 2;
  const bboxW = (maxX - minX) + pad * 2, bboxH = (maxY - minY) + pad * 2;
  const scale = Math.min(fitW / bboxW, fitH / bboxH, W * 0.92 / bboxW);
  const tx = W / 2 - ((minX + maxX) / 2) * scale;
  const ty = H / 2 - ((minY + maxY) / 2) * scale;

  // 阶段（对应 timeline.ts 的 makePlan）
  const natural = brush.duration;
  const lead = c.comet.on ? 0.15 : 0;
  const decoDur = c.decoration.id === 'none' ? 0 : 0.65;
  const lineDur = c.underline.on ? 0.35 : 0;
  const leave = c.comet.on && c.underline.on ? 0.35 : 0;
  const wink = c.decoration.action === 'wink' && ['sun', 'cat'].includes(c.decoration.id) ? 0.30 : 0;
  const hold = 0.35;
  const overhead = lead + decoDur + lineDur + leave + wink + hold;
  let draw;
  if (c.timing.mode === 'duration') draw = Math.max(0.4, c.timing.duration - overhead);
  else draw = natural / (c.timing.speed || 1);
  let clock = 0;
  const phase = (d) => { const p = { start: clock, end: clock + d }; clock += d; return p; };
  const leadP = phase(lead);
  const writeP = phase(draw);
  const decoP = phase(decoDur);
  const lineP = phase(lineDur);
  const leaveP = phase(leave);
  const winkP = phase(wink);
  const holdP = phase(hold);
  holdP.end = Math.max(holdP.start + hold, c.timing.mode === 'duration' ? c.timing.duration : clock);
  const total = c.timing.mode === 'duration' ? c.timing.duration : holdP.end;

  return {
    cfg: c, W, H, brush, box, rotation, pivot, deco, line, leaving,
    scale, tx, ty, natural,
    phases: { lead: leadP, writing: writeP, decoration: decoP, underline: lineP, leaving: leaveP, wink: winkP, hold: holdP },
    total,
  };
}

const apply = (scene, ctx, fn) => {
  ctx.save();
  ctx.translate(scene.tx, scene.ty);
  ctx.scale(scene.scale, scene.scale);
  ctx.translate(scene.pivot.x, scene.pivot.y);
  ctx.rotate(-scene.rotation * DEG);
  ctx.translate(-scene.pivot.x, -scene.pivot.y);
  fn();
  ctx.restore();
};

export function renderPortFrame(ctx, scene, time) {
  const c = scene.cfg, p = scene.phases, brush = scene.brush;
  const W = scene.W, H = scene.H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // 背景
  if (c.background.mode === 'solid') {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    g.addColorStop(0, c.background.color);
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- 光点入场 ----------
  if (c.comet.on && time < p.lead.end + 0.12) {
    const u = clamp((time - p.lead.start) / Math.max(p.lead.end - p.lead.start, 0.001), 0, 1);
    const e = smooth(u);
    const first = brush.strokes[0];
    const startPt = first ? first.curve.points[0] : { x: scene.box.minX, y: 0 };
    const from = { x: startPt.x - scene.box.maxX * 0.7 - 420, y: startPt.y - 260 };
    const mid = { x: startPt.x - 220, y: startPt.y - 320 };
    const head = { x: from.x + (startPt.x - from.x) * e, y: (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * mid.y + e * e * startPt.y };
    apply(scene, ctx, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 12; i >= 0; i--) {
        const uu = e - i * 0.04;
        if (uu < 0) continue;
        const q = { x: from.x + (startPt.x - from.x) * uu, y: (1 - uu) * (1 - uu) * from.y + 2 * (1 - uu) * uu * mid.y + uu * uu * startPt.y };
        ctx.globalAlpha = (1 - i / 13) * 0.6;
        ctx.fillStyle = c.comet.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, (1 - i / 13) * c.font.size * 0.05 * c.comet.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = c.comet.color;
      ctx.shadowBlur = 30 * c.comet.size;
      ctx.beginPath();
      ctx.arc(head.x, head.y, c.font.size * 0.055 * c.comet.size, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
    });
  }

  // ---------- 书写 ----------
  const writeTime = clamp((time - p.writing.start) / Math.max(p.writing.end - p.writing.start, 0.001), 0, 1);
  // 阶段按自然时长映射到书写阶段
  const scaleT = (p.writing.end - p.writing.start) / Math.max(brush.duration, 0.001);
  apply(scene, ctx, () => {
    const glowOn = c.glow.on && c.glow.strength > 0;
    for (const s of brush.strokes) {
      const st = s.start * scaleT, du = s.duration * scaleT;
      const prog = clamp((time - p.writing.start - st) / Math.max(du, 0.001), 0, 1);
      if (prog <= 0) continue;
      if (glowOn) {
        ctx.save();
        ctx.shadowColor = c.glow.color;
        ctx.shadowBlur = c.glow.radius * c.glow.strength * 1.6;
        ctx.globalAlpha = 0.55;
        drawStrokeRibbon(ctx, s, prog, c, c.glow.color);
        ctx.restore();
      }
      drawStrokeRibbon(ctx, s, prog, c, c.ink);
    }
  });

  // ---------- 装饰 ----------
  if (c.decoration.id !== 'none') {
    const blinkPhase = 0.028;
    const t2 = time - p.decoration.start;
    const blinkCycle = 2.4;
    const bt = ((time + 0.4) % blinkCycle) / blinkCycle;
    const lid = bt < blinkPhase ? 1 - Math.abs(bt / blinkPhase - 0.5) * 2 : 0;
    const ear = (() => { // 在装饰阶段后段发生一次折耳
      const u = clamp((time - (p.decoration.end + 0.05)) / Math.max(p.wink.end - p.decoration.end, 0.001), 0, 1);
      return Math.sin(u * Math.PI) * (c.decoration.earFold ? 1 : 0);
    })();
    apply(scene, ctx, () => {
      drawDecoration(ctx, c.decoration.id, t2, 0, Math.max(p.decoration.end - p.decoration.start, 0.001), scene.deco.x, scene.deco.y, scene.deco.radius, lid, ear, c.ink);
    });
  }

  // ---------- 下划线（含 lift 起伏） ----------
  if (c.underline.on) {
    const u = clamp((time - p.underline.start) / Math.max(p.underline.end - p.underline.start, 0.001), 0, 1);
    if (u > 0) {
      const pts = scene.line;
      const total = pts.length - 1;
      const upTo = Math.max(1, Math.floor(total * smooth(u)));
      apply(scene, ctx, () => {
        ctx.save();
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = c.font.size * 0.055;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= upTo; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      });
    }
  }

  // ---------- 光点离场（沿 leaving 曲线飞向装饰并淡出） ----------
  if (c.comet.on && c.underline.on && time >= p.leaving.start && time < p.leaving.end + 0.2) {
    const u = clamp((time - p.leaving.start) / Math.max(p.leaving.end - p.leaving.start, 0.001), 0, 1);
    const e = smooth(u);
    const pts = scene.leaving;
    const idx = Math.min(pts.length - 1, Math.floor(e * (pts.length - 1)));
    const head = pts[idx];
    apply(scene, ctx, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 10; i >= 0; i--) {
        const k = Math.max(0, idx - i * 2);
        ctx.globalAlpha = (1 - i / 11) * 0.5 * (1 - u * 0.6);
        ctx.fillStyle = c.comet.color;
        ctx.beginPath();
        ctx.arc(pts[k].x, pts[k].y, (1 - i / 11) * c.font.size * 0.05 * c.comet.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1 - u * 0.5;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = c.comet.color;
      ctx.shadowBlur = 26 * c.comet.size;
      ctx.beginPath();
      ctx.arc(head.x, head.y, c.font.size * 0.05 * c.comet.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  return { writeTime };
}

export function portProgress(scene, time) {
  return clamp(time / Math.max(scene.total, 0.001), 0, 1);
}
