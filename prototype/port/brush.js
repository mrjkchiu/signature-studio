// port/brush.js — TYX Brush 笔刷引擎（移植自 tangyx527/tyx-signature, MIT）
// 原实现是 React/SVG，这里改成 Canvas：曲线采样 → 变宽缎带填充。
import { initials, middle, endings, metrics } from './positional.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export const between = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : smooth((t - a) / (b - a)));

/** 书写速度微波动（原项目 brushProgress） */
export const brushProgress = (u) => { const t = clamp(u, 0, 1); return t - 0.065 * Math.sin(t * Math.PI * 2); };

function sampleCubic(p0, p1, p2, p3, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

/** 解析 M/L/C 路径 → 采样点数组（带累计长度） */
export function parseStroke(d) {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+/g) ?? [];
  let i = 0, x = 0, y = 0, length = 0;
  const points = [];
  const add = (p) => {
    const last = points[points.length - 1];
    if (last) length += Math.hypot(p.x - last.x, p.y - last.y);
    points.push({ x: p.x, y: p.y, length });
    x = p.x; y = p.y;
  };
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op === 'M') add({ x: num(), y: num() });
    else if (op === 'L') {
      const end = { x: num(), y: num() }, sx = x, sy = y;
      for (let k = 1; k <= 24; k++) add({ x: sx + (end.x - sx) * k / 24, y: sy + (end.y - sy) * k / 24 });
    } else if (op === 'C') {
      const p1 = { x: num(), y: num() }, p2 = { x: num(), y: num() }, p3 = { x: num(), y: num() };
      sampleCubic({ x, y }, p1, p2, p3, 64).slice(1).forEach(add);
    } else break;
  }
  return { points, length };
}

const mapCurve = (c, fn) => {
  let length = 0; const points = [];
  for (const p of c.points) {
    const v = fn(p); const prev = points[points.length - 1];
    if (prev) length += Math.hypot(v.x - prev.x, v.y - prev.y);
    points.push({ x: v.x, y: v.y, length });
  }
  return { points, length };
};

/**
 * 构建整段签名
 * cfg: { text, font:{size,penWidth,pressure,initialScale,terminalLength}, }
 */
export function buildBrush(cfg) {
  const strokes = [], deferred = [];
  const factor = cfg.font.size / 320;
  let cursor = 0, clock = 0;
  const letters = [...cfg.text];
  const isLatin = (ch) => /[A-Za-z]/.test(ch);
  const first = letters.findIndex(isLatin);
  const last = letters.map(isLatin).lastIndexOf(true);

  letters.forEach((char, i) => {
    if (char === ' ') { cursor += 62 * factor; return; }
    const cap = initials[char];
    const base = middle[char];
    const position = cap && i === first ? 'initial' : base && i === last ? 'terminal' : (cap || base ? 'medial' : 'punctuation');
    const glyph = cap ?? base ?? (char === "'"
      ? { advance: 38, paths: ['M 20 -157 C 28 -167 30 -181 29 -186'] }
      : { advance: 65, paths: ['M 0 -57 C 19 -60 44 -60 65 -57'] });
    const isLead = i === first;
    const capScale = isLead ? cfg.font.initialScale : (cap ? 0.79 : 1);
    const paths = [...((position === 'terminal' && glyph.terminalPaths) ? glyph.terminalPaths : glyph.paths)];
    // 签名首字母 T：加宽的字冠 + 长竖（原项目手写特例）
    if (isLead && char === 'T') {
      paths[0] = 'M -65 -120 C -206 -111 -230 -128 -153 -177 C -44 -242 149 -291 266 -292 C 318 -292 325 -272 295 -254';
      paths[1] = 'M 102 -244 C 62 -174 -17 -11 -50 74 C -58 95 -63 108 -62 113';
    }
    // 收笔花体：把 endings 的延伸接到最后一段
    if (position === 'terminal') {
      const ending = endings[char];
      if (ending) {
        const bare = parseStroke(paths[ending.stroke]);
        const anchor = bare.points[bare.points.length - 1];
        const letterCount = letters.filter(isLatin).length;
        const length = cfg.font.terminalLength * Math.min(1, 0.55 + letterCount * 0.075);
        const continuation = ending.continuation.replace(
          /C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/g,
          (_m, x1, y1, x2, y2, x3, y3) => 'C ' + [[x1, y1], [x2, y2], [x3, y3]]
            .map(([x, y]) => `${anchor.x + (Number(x) - anchor.x) * length} ${anchor.y + (Number(y) - anchor.y) * length}`)
            .join(' '));
        paths[ending.stroke] += continuation;
      }
    }
    paths.forEach((source, j) => {
      let d = source;
      if (position === 'medial') {
        d = d.replace(/C (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/,
          (match, a, b, _x, _y, x, y) => Number(y) === 0 ? `C ${a} ${b} ${Number(x) - 12} 7 ${x} ${y}` : match);
      }
      if (base && j === 0 && position === 'medial') d = d.replace(/^M 0 0 C -?[\d.]+ -?[\d.]+/, 'M 0 0 C 12 -7');
      const curve = mapCurve(parseStroke(d), (p) => ({
        x: cursor + p.x * factor * capScale + (isLead ? cfg.font.initialOffsetX : 0),
        y: p.y * factor * capScale + (isLead ? cfg.font.initialOffsetY : 0),
      }));
      const dot = glyph.dotIndices?.includes(j) ?? false;
      const stroke = {
        id: `brush-${i}-${j}`, char, index: j, curve,
        start: 0,
        duration: dot ? 0.10 : Math.max(0.08, Math.pow(curve.length, 0.8) / 360),
        width: cfg.font.size * (position === 'terminal' ? 0.065 : 0.085) * cfg.font.penWidth
          * (isLead ? Math.sqrt(cfg.font.initialScale) * 1.10 : 1),
        position, dot,
      };
      if (dot) deferred.push(stroke); else strokes.push(stroke);
    });
    cursor += (isLead && char === 'T' ? 18 : glyph.advance) * factor * capScale;
  });

  strokes.push(...deferred);
  for (const s of strokes) { s.start = clock; clock += s.duration + 0.006; }

  // 包围盒
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.curve.points) {
      minX = Math.min(minX, p.x - s.width / 2); maxX = Math.max(maxX, p.x + s.width / 2);
      minY = Math.min(minY, p.y - s.width / 2); maxY = Math.max(maxY, p.y + s.width / 2);
    }
  }
  const box = { minX, minY, maxX, maxY };
  return {
    strokes, box, duration: clock,
    guide: {
      baseline: 0,
      xHeight: metrics.xHeight * factor,
      hasDescenders: strokes.some((s) => /[fgjpqxyz]/.test(s.char) || (s.position === 'terminal' && s.char === 'b')),
      bodyStart: 0, bodyEnd: cursor,
    },
    cursor,
  };
}

/** 压力模型：竖笔粗、横笔细（原项目 pressure） */
export function pressure(s, u, cfg) {
  const pointAt = (curve, t) => {
    const total = curve.length || 1;
    const target = clamp(t, 0, 1) * total;
    let i = 1;
    while (i < curve.points.length - 1 && curve.points[i].length < target) i++;
    const a = curve.points[i - 1], b = curve.points[i];
    const seg = (b.length - a.length) || 1;
    const k = clamp((target - a.length) / seg, 0, 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const before = pointAt(s.curve, Math.max(0, u - 0.014));
  const after = pointAt(s.curve, Math.min(1, u + 0.014));
  const dy = after.y - before.y;
  const len = Math.hypot(after.x - before.x, dy) || 1;
  const end = s.position === 'initial' && s.char === 'T' && s.index === 1 ? 0.72 : s.position === 'medial' ? 0.48 : 0.025;
  const start = s.position === 'initial' && s.char === 'T' && s.index === 0 ? 0.08 : 0.48;
  const taper = Math.min(1, start + u * 18, end + (1 - u) * 18);
  const nib = (0.48 + 0.52 * Math.max(0, dy / len)) * (0.95 + 0.05 * Math.sin(u * Math.PI * 3)) * taper;
  return (s.width / 2) * ((1 - cfg.font.pressure) * 0.78 + cfg.font.pressure * nib);
}

/** 把一笔画成变宽缎带（Canvas 填充多边形 + 两端圆头） */
export function drawStrokeRibbon(ctx, s, progress, cfg, color) {
  if (progress <= 0) return;
  const end = Math.min(1, brushProgress(progress));
  const pts = s.curve.points;
  // 取到进度对应的点
  const targetLen = s.curve.length * end;
  const kept = [];
  for (const p of pts) { if (p.length <= targetLen) kept.push(p); else break; }
  if (kept.length === pts.length) kept.pop();
  kept.push(pts[pts.length - 1].length <= targetLen ? pts[pts.length - 1] : interpolate(pts, targetLen));
  const m = kept.length;
  if (m < 2) {
    const p = kept[0] || pts[0];
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, pressure(s, end, cfg)), 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    return;
  }
  const L = [], R = [];
  for (let i = 0; i < m; i++) {
    const u = (i / (m - 1)) * end;
    const r = Math.max(0.5, pressure(s, u, cfg));
    const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
    const dx = kept[i1].x - kept[i0].x, dy = kept[i1].y - kept[i0].y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    L.push([kept[i].x + nx * r, kept[i].y + ny * r]);
    R.push([kept[i].x - nx * r, kept[i].y - ny * r]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < m; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = m - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // 圆头
  for (const [i, u] of [[0, 0], [m - 1, end]]) {
    ctx.beginPath();
    ctx.arc(kept[i].x, kept[i].y, Math.max(0.5, pressure(s, u, cfg)), 0, Math.PI * 2);
    ctx.fill();
  }
}

function interpolate(pts, len) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].length >= len) {
      const a = pts[i - 1], b = pts[i];
      const k = (b.length - a.length) ? (len - a.length) / (b.length - a.length) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, length: len };
    }
  }
  return pts[pts.length - 1];
}
