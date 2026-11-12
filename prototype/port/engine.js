// port/engine.js — 移植版：场景布局 + 时间轴 + 渲染（基于 tangyx527/tyx-signature, MIT）
import { buildBrush, drawStrokeRibbon, clamp, smooth } from './brush.js';
import { drawDecoration } from './decor.js';

const DEG = Math.PI / 180;

export const PORT_DEFAULTS = {
  text: 'JKChiu',
  font: { size: 240, penWidth: 1, pressure: 1, initialScale: 1.3, initialOffsetX: 0, initialOffsetY: 0, terminalLength: 1 },
  ink: '#F5FFFD',
  glow: { on: true, color: '#59E6D7', strength: 0.65, radius: 18 },
  decoration: { id: 'sun', scale: 1, offsetX: 0, offsetY: 0, action: 'wink', earFold: true },
  underline: { on: true, lift: true },
  comet: { on: true, color: '#F07CDA', size: 1.6 },
  timing: { mode: 'duration', duration: 5 },
  background: { mode: 'solid', color: '#0B0B12' },
  // 情侣
  couple: false,
  coupleName: '',
  coupleInk: '#FF8EC7',
  coupleFont: null,
  middleDeco: { id: 'heart', scale: 1 },
  decoB: { id: 'none', scale: 1 },
  decoGap: 0,
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

const decoBottomBase = (id) => (id === 'sun' ? 85 : id === 'cat' ? 38 : 58);

/** 构建场景：单人一条、情侣横排两条 + 三个装饰位 */
export function buildPortScene(cfg, W, H) {
  const c = { ...PORT_DEFAULTS, ...(cfg || {}) };
  const couple = !!(c.couple && (c.coupleName || '').trim());
  const fontB = c.coupleFont || c.font;

  const brushA = buildBrush({ text: (c.text || 'JKChiu'), font: c.font });
  const brushB = couple ? buildBrush({ text: c.coupleName.trim(), font: fontB }) : null;

  const bA = brushA.box, bB = brushB ? brushB.box : null;
  const wA = bA.maxX - bA.minX, wB = bB ? bB.maxX - bB.minX : 0;
  const hA = bA.maxY - bA.minY, hB = bB ? bB.maxY - bB.minY : 0;

  // 中间装饰先定尺寸，再据此留出两名字的间距
  const midSpec = couple ? (c.middleDeco || { id: 'heart', scale: 1 }) : null;
  const midRadius = (midSpec && midSpec.id !== 'none')
    ? Math.max(22, Math.min(wA, wB) * 0.075 * (midSpec.scale || 1) * 2.2)
    : 0;
  const gap = couple ? (midRadius > 0 ? midRadius * 2.4 : c.font.size * 0.35) : 0;

  const offA = { dx: -bA.minX, dy: -bA.minY };
  const offB = bB ? { dx: wA + gap - bB.minX, dy: (hA - hB) / 2 - bB.minY } : null;

  const box = bB
    ? { minX: 0, maxX: wA + gap + wB, minY: 0, maxY: Math.max(hA, hB) }
    : { minX: 0, maxX: wA, minY: 0, maxY: hA };

  const placeDeco = (spec, localBox, off) => {
    if (!spec || spec.id === 'none') return null;
    const id = spec.id;
    const wLocal = Math.max(localBox.maxX - localBox.minX, 1);
    const radius = Math.max(24, wLocal * (id === 'cat' ? 0.11 : 0.075) * (spec.scale || 1) * 2.2);
    return {
      id,
      x: localBox.maxX + off.dx + radius * 0.10,
      y: localBox.minY + off.dy - radius * (decoBottomBase(id) / 50) * 0.60,
      radius,
    };
  };

  const decoA = placeDeco(c.decoration, bA, offA);
  const decoB = bB ? placeDeco(c.decoB, bB, offB) : null;
  const midDeco = (couple && midSpec && midSpec.id !== 'none') ? (() => {
    const id = midSpec.id;
    const radius = Math.max(22, Math.min(wA, wB) * 0.075 * (midSpec.scale || 1) * 2.2);
    return {
      id,
      x: wA + gap / 2,
      y: Math.max(hA, hB) / 2 - radius * (decoBottomBase(id) / 50) * 0.35,
      radius,
    };
  })() : null;
  const decos = [decoA, midDeco, decoB].filter(Boolean);

  const lines = [{ brush: brushA, ink: c.ink, glowColor: c.glow.color, off: offA, fontCfg: c }];
  if (brushB) {
    lines.push({
      brush: brushB,
      ink: c.coupleInk || c.ink,
      glowColor: c.coupleGlow || c.glow.color,
      off: offB,
      fontCfg: { ...c, font: fontB },
    });
  }

  // 画布包围盒（含装饰、下划线、光点）
  let minX = box.minX, maxX = box.maxX, minY = box.minY, maxY = box.maxY;
  for (const d of decos) {
    minX = Math.min(minX, d.x - d.radius);
    maxX = Math.max(maxX, d.x + d.radius);
    minY = Math.min(minY, d.y - d.radius);
    maxY = Math.max(maxY, d.y + d.radius);
  }

  const width = box.maxX - box.minX, height = box.maxY - box.minY;
  const base = box.maxY + Math.max(c.font.size * 0.16, height * 0.12);
  const line = cubicPts(
    { x: box.minX + width * 0.05, y: base + c.font.size * 0.02 },
    { x: box.minX + width * 0.38, y: base },
    { x: box.maxX - width * 0.18, y: base },
    { x: box.maxX + width * 0.02, y: base + c.font.size * 0.015 },
  );
  if (c.underline.on) for (const p of line) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }

  const exit = line[line.length - 1];
  const leaveTarget = midDeco || decoA || { x: maxX, y: minY, radius: 30 };
  const leaving = cubicPts(
    exit,
    { x: exit.x + 90, y: exit.y - 90 },
    { x: exit.x + 50, y: leaveTarget.y - leaveTarget.radius * 0.7 },
    { x: leaveTarget.x + leaveTarget.radius * 0.9, y: leaveTarget.y - leaveTarget.radius * 0.6 },
  );
  if (c.comet.on && c.underline.on) for (const p of leaving) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); }

  const glow = c.glow.on ? c.glow.radius * 2 : 0;
  const pad = glow + Math.max(c.font.size * 0.10, 18);
  const bboxW = (maxX - minX) + pad * 2;
  const bboxH = (maxY - minY) + pad * 2;
  const scale = Math.min((W - pad * 2) / bboxW, (H - pad * 2) / bboxH, W * 0.94 / bboxW);
  const tx = W / 2 - ((minX + maxX) / 2) * scale;
  const ty = H / 2 - ((minY + maxY) / 2) * scale;

  // 时间轴（两人同步书写：按各自自然时长归一化到同一段书写时间）
  const natural = Math.max(brushA.duration, brushB ? brushB.duration : 0);
  const lead = c.comet.on ? 0.15 : 0;
  const decoDur = decos.length ? 0.65 : 0;
  const lineDur = c.underline.on ? 0.35 : 0;
  const leave = c.comet.on && c.underline.on ? 0.35 : 0;
  const wink = c.decoration.action === 'wink' && ['sun', 'cat'].includes(c.decoration.id) ? 0.30 : 0;
  const hold = 0.35;
  const overhead = lead + decoDur + lineDur + leave + wink + hold;
  const draw = c.timing.mode === 'duration'
    ? Math.max(0.4, c.timing.duration - overhead)
    : natural / (c.timing.speed || 1);
  let clock = 0;
  const phase = (d) => { const p = { start: clock, end: clock + d }; clock += d; return p; };
  const phases = {
    lead: phase(lead),
    writing: phase(draw),
    decoration: phase(decoDur),
    underline: phase(lineDur),
    leaving: phase(leave),
    wink: phase(wink),
    hold: phase(hold),
  };
  phases.hold.end = Math.max(phases.hold.start + hold, c.timing.mode === 'duration' ? c.timing.duration : clock);
  const total = c.timing.mode === 'duration' ? c.timing.duration : phases.hold.end;

  const s0 = brushA.strokes[0];
  const firstStrokePoint = s0
    ? { x: s0.curve.points[0].x + offA.dx, y: s0.curve.points[0].y + offA.dy }
    : { x: box.minX, y: box.minY };

  return {
    cfg: c, W, H, couple, brush: brushA, lines, box, decos, decoA, midDeco, decoB,
    line, leaving, scale, tx, ty, natural, firstStrokePoint,
    rotation: 5, pivot: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    phases, total,
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
  const c = scene.cfg, p = scene.phases;
  const W = scene.W, H = scene.H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (c.background.mode === 'solid') {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    g.addColorStop(0, c.background.color);
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 光点入场
  if (c.comet.on && time < p.lead.end + 0.12) {
    const u = clamp((time - p.lead.start) / Math.max(p.lead.end - p.lead.start, 0.001), 0, 1);
    const e = smooth(u);
    const startPt = scene.firstStrokePoint;
    const from = { x: startPt.x - 420, y: startPt.y - 240 };
    const mid = { x: startPt.x - 200, y: startPt.y - 300 };
    const at = (uu) => ({
      x: from.x + (startPt.x - from.x) * uu,
      y: (1 - uu) * (1 - uu) * from.y + 2 * (1 - uu) * uu * mid.y + uu * uu * startPt.y,
    });
    const head = at(e);
    apply(scene, ctx, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 12; i >= 0; i--) {
        const uu = e - i * 0.04;
        if (uu < 0) continue;
        const q = at(uu);
        ctx.globalAlpha = (1 - i / 13) * 0.6;
        ctx.fillStyle = c.comet.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, (1 - i / 13) * c.font.size * 0.05 * c.comet.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = c.comet.color;
      ctx.shadowBlur = 30 * c.comet.size;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(head.x, head.y, c.font.size * 0.055 * c.comet.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // 书写（情侣：两行同时写）
  const writeSpan = Math.max(p.writing.end - p.writing.start, 0.001);
  apply(scene, ctx, () => {
    for (const lineDef of scene.lines) {
      const brush = lineDef.brush;
      const durScale = writeSpan / Math.max(brush.duration, 0.001);
      const glowOn = c.glow.on && c.glow.strength > 0;
      ctx.save();
      ctx.translate(lineDef.off.dx, lineDef.off.dy);
      for (const st of brush.strokes) {
        const st0 = st.start * durScale;
        const du = st.duration * durScale;
        const prog = clamp((time - p.writing.start - st0) / Math.max(du, 0.001), 0, 1);
        if (prog <= 0) continue;
        if (glowOn) {
          ctx.save();
          ctx.shadowColor = lineDef.glowColor;
          ctx.shadowBlur = c.glow.radius * c.glow.strength * 1.6;
          ctx.globalAlpha = 0.55;
          drawStrokeRibbon(ctx, st, prog, lineDef.fontCfg, lineDef.glowColor);
          ctx.restore();
        }
        drawStrokeRibbon(ctx, st, prog, lineDef.fontCfg, lineDef.ink);
      }
      ctx.restore();
    }
  });

  // 装饰（装饰一 / 中间装饰 / 装饰二）
  if (scene.decos.length) {
    const blinkPhase = 0.028;
    const cycle = 2.4;
    const bt = ((time + 0.4) % cycle) / cycle;
    const lid = bt < blinkPhase ? 1 - Math.abs(bt / blinkPhase - 0.5) * 2 : 0;
    const winkU = clamp((time - (p.decoration.end + 0.05)) / Math.max(p.wink.end - p.decoration.end, 0.001), 0, 1);
    const ear = Math.sin(winkU * Math.PI) * (c.decoration.earFold ? 1 : 0);
    const decoDur = Math.max(p.decoration.end - p.decoration.start, 0.001);
    apply(scene, ctx, () => {
      for (const d of scene.decos) {
        drawDecoration(ctx, d.id, time - p.decoration.start, 0, decoDur, d.x, d.y, d.radius, lid, ear, c.ink);
      }
    });
  }

  // 下划线
  if (c.underline.on) {
    const u = clamp((time - p.underline.start) / Math.max(p.underline.end - p.underline.start, 0.001), 0, 1);
    if (u > 0) {
      const pts = scene.line;
      const upTo = Math.max(1, Math.floor((pts.length - 1) * smooth(u)));
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

  // 光点离场
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

  return { time };
}

export function portProgress(scene, time) {
  return clamp(time / Math.max(scene.total, 0.001), 0, 1);
}
