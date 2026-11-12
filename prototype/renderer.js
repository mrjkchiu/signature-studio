// renderer.js — 动态签名渲染核心（浏览器与 Node 自检工具共用，不依赖 DOM）
//
// 管线（对应需求文档 §7.2 的"字形层 / 笔顺层解耦"）：
//   ① 字形层：艺术字体轮廓  → 决定"长什么样"
//   ② 笔顺层：每笔真实轮廓 + 笔尖中心线 → 决定"怎么写出来"
//   ③ 遮罩：笔尖沿中心线推进 ∩ 该笔轮廓 → 已写部分
//   ④ 着色：渐变 / 发光 / 流光 只作用于已写部分
//   ⑤ 合成到画布（背景 / 粒子）
//
// 换字体不影响动画结构：同一套笔顺数据可驱动任意艺术字体。

import { getSkeleton, rasterLayout } from './skeleton.js';

export const FONTS = [
  { id: 'msz', label: '马善政', inh: '毛笔楷', css: 'SignatureMSZ', file: 'fonts/mashanzheng.ttf', brush: 1.00 },
  { id: 'zmx', label: '志莽行书', inh: '行书', css: 'SignatureZMX', file: 'fonts/zhimangxing.ttf', brush: 0.96 },
  { id: 'ljm', label: '柳建毛草', inh: '毛草', css: 'SignatureLJM', file: 'fonts/liujianmaocao.ttf', brush: 0.98 },
  { id: 'lct', label: '龙藏体', inh: '行草', css: 'SignatureLCT', file: 'fonts/longcang.ttf', brush: 0.94 },
  { id: 'zkk', label: '站酷快乐', inh: '美术字', css: 'SignatureZKK', file: 'fonts/zcoolkuaile.ttf', brush: 0.90 },
  { id: 'lxgw', label: '霞鹜文楷', inh: '手写楷', css: 'SignatureLXGW', file: 'fonts/lxgwwenkailite.ttf', brush: 1.00 },
  { id: 'marker', label: '霞鹜漫黑', inh: '马克笔', css: 'SignatureMarker', file: 'fonts/markergothic.ttf', brush: 1.00 },
  { id: 'hy', label: '庆科黄油', inh: '圆黑', css: 'SignatureHY', file: 'fonts/zcoolhuangyou.ttf', brush: 1.00 },
  { id: 'yozai', label: '悠哉字体', inh: '硬笔手写', css: 'SignatureYozai', file: 'fonts/yozai.ttf', brush: 1.00 },
  { id: 'xw', label: '站酷小薇', inh: '清瘦宋', css: 'SignatureXW', file: 'fonts/zcoolxiaowei.ttf', brush: 1.00 },
  { id: 'smiley', label: '得意黑', inh: '潮流斜黑', css: 'SignatureSmiley', file: 'fonts/SmileySans-Oblique.ttf', brush: 1.00 },
];

export const PALETTES = [
  { id: 'ink', label: '墨黑', stops: ['#141418', '#5A4A3A'], glow: '#8A6A3A', glowR: 10 },
  { id: 'cinnabar', label: '朱砂', stops: ['#C62828', '#7E1414'], glow: '#C62828', glowR: 14 },
  { id: 'neon', label: '霓虹', stops: ['#22D3EE', '#A855F7'], glow: '#22D3EE', glowR: 22 },
  { id: 'metal', label: '金属', stops: ['#FFFFFF', '#B8BCC6', '#6A6E78', '#F2F4F8'], glow: '#DCE0E8', glowR: 12 },
  { id: 'blue', label: '蓝墨', stops: ['#1E3A8A', '#0EA5E9'], glow: '#3B82F6', glowR: 16 },
  { id: 'rose', label: '玫瑰金', stops: ['#F9A8D4', '#FBBF24'], glow: '#F472B6', glowR: 18 },
];

export const BACKDROPS = [
  { id: 'none', label: '透明' },
  { id: 'paper', label: '宣纸' },
  { id: 'dark', label: '深夜' },
  { id: 'grad', label: '极光' },
];

export const EFFECTS = [
  { id: 'write', label: '逐笔书写', lock: true },
  { id: 'enter', label: '入场' },
  { id: 'shine', label: '流光' },
  { id: 'neon', label: '霓虹呼吸' },
  { id: 'trail', label: '描边流光' },
  { id: 'particle', label: '粒子' },
];

// ---------- 小工具 ----------
import { clamp, easeOutCubic, easeInOutCubic, easeOutBack, brushProgress } from './math.js';
import { drawDecorations } from './decor.js';
export { clamp, easeOutCubic, easeInOutCubic, easeOutBack, brushProgress };

/** 时长自动计算：700 + 650×字数，钳制 1500–4500ms */
export function autoDuration(n) {
  return clamp(700 + 650 * n, 1500, 4500);
}

// ---------- SVG 路径解析（hanzi-writer 数据只用 M/L/Q/C/Z 绝对指令） ----------
export function parsePathD(d) {
  const tok = d.trim().split(/[\s,]+/);
  const cmds = [];
  let i = 0;
  while (i < tok.length) {
    const t = tok[i++];
    if (t === 'M' || t === 'L') cmds.push([t, +tok[i++], +tok[i++]]);
    else if (t === 'Q') cmds.push(['Q', +tok[i++], +tok[i++], +tok[i++], +tok[i++]]);
    else if (t === 'C') cmds.push(['C', +tok[i++], +tok[i++], +tok[i++], +tok[i++], +tok[i++], +tok[i++]]);
    else if (t === 'Z' || t === 'z') cmds.push(['Z']);
    else i++;
  }
  return cmds;
}

function applyCmds(ctx, cmds) {
  for (const c of cmds) {
    if (c[0] === 'M') ctx.moveTo(c[1], c[2]);
    else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else ctx.closePath();
  }
}

function polyLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

// ---------- 布局 ----------
export function computeLayout({ ctx, text, fontStack, W, H, letterSpacing = 0.02, extraEm = 0 }) {
  const chars = [...text].filter((c) => c.trim().length > 0);
  const n = Math.max(chars.length, 1);
  const sizeByW = (W * 0.84) / ((n + extraEm) * (1 + letterSpacing));
  const sizeByH = H * 0.60;
  const fontSize = Math.min(sizeByW, sizeByH);
  ctx.font = `${fontSize}px ${fontStack}`;
  const advance = fontSize * (1 + letterSpacing);
  const totalW = advance * n;
  const startX = (W - totalW) / 2;
  // hanzi 数据：1024 em 盒，基线在 900 → 视觉居中下移 0.488em
  const baselineY = H / 2 + fontSize * 0.488;
  const items = chars.map((ch, i) => ({ ch, penX: startX + i * advance, baselineY }));
  return { fontSize, advance, items, startX, baselineY, totalW, n };
}

/** 单字几何映射：hanzi 坐标（1024 em / y 向上 / 基线 900）→ 艺术字形墨迹框 */
export function mapCharGeometry({ ctx, item, fontSize, charData }) {
  // 原始数据里 medians 是 [[x,y],...] 的嵌套格式，统一摊平为 [x,y,x,y,...]
  const medians = charData.medians.map((s) =>
    Array.isArray(s[0]) ? s.flatMap((p) => [p[0], p[1]]) : s
  );
  const m = ctx.measureText(item.ch);
  const inkX0 = item.penX - m.actualBoundingBoxLeft;
  const inkX1 = item.penX + m.actualBoundingBoxRight;
  const inkY0 = item.baselineY - m.actualBoundingBoxAscent;
  const inkY1 = item.baselineY + m.actualBoundingBoxDescent;
  const inkW = Math.max(inkX1 - inkX0, 1);
  const inkH = Math.max(inkY1 - inkY0, 1);

  let mx0 = Infinity, mx1 = -Infinity, my0 = Infinity, my1 = -Infinity;
  for (const s of medians) {
    for (let i = 0; i < s.length; i += 2) {
      if (s[i] < mx0) mx0 = s[i];
      if (s[i] > mx1) mx1 = s[i];
      if (s[i + 1] < my0) my0 = s[i + 1];
      if (s[i + 1] > my1) my1 = s[i + 1];
    }
  }
  // 中心线天然比墨迹窄一圈（半个笔宽），补回后与字形墨迹对齐
  const pad = 0.10 * Math.max(inkW, inkH);
  const mw = (mx1 - mx0) + 2 * pad;
  const mh = (my1 - my0) + 2 * pad;
  const sEm = fontSize / 1024;
  let s = Math.min(inkW / mw, inkH / mh);
  s = clamp(s, sEm * 0.70, sEm * 1.60);
  const mcx = (mx0 + mx1) / 2, mcy = (my0 + my1) / 2;
  const icx = (inkX0 + inkX1) / 2, icy = (inkY0 + inkY1) / 2;

  const tx = (x) => icx + (x - mcx) * s;
  const ty = (y) => icy - (y - mcy) * s;

  const mediansPx = medians.map((s2) => {
    const out = new Array(s2.length);
    for (let i = 0; i < s2.length; i += 2) { out[i] = tx(s2[i]); out[i + 1] = ty(s2[i + 1]); }
    return out;
  });

  const shapes = charData.strokes.map((dstr) => {
    const cmds = parsePathD(dstr);
    return cmds.map((c) => {
      if (c[0] === 'Z') return c;
      const out = [c[0]];
      for (let i = 1; i < c.length; i += 2) { out.push(tx(c[i]), ty(c[i + 1])); }
      return out;
    });
  });

  return { mediansPx, shapes, ink: { x0: inkX0, y0: inkY0, x1: inkX1, y1: inkY1 } };
}

/** 组装场景 */
export function buildScene({ ctx, text, fontStack, W, H, getCharData, font, letterSpacing = 0.02, duration, makeCanvas, skeletonSize = 220, coupleSplit = 0, gapEm = 0.9, decorTailAdd = 0, comet = false, outro = false }) {
  const layout = computeLayout({ ctx, text, fontStack, W, H, letterSpacing, extraEm: coupleSplit > 0 ? gapEm : 0 });
  ctx.font = `${layout.fontSize}px ${fontStack}`;
  // 情侣模式：两个名字之间空出一段，中间放爱心
  if (coupleSplit > 0 && coupleSplit < layout.items.length) {
    const shift = layout.advance * gapEm;
    for (let i = coupleSplit; i < layout.items.length; i++) layout.items[i].penX += shift;
    layout.totalW += shift;
    const first = layout.items[0].penX;
    const last = layout.items[layout.items.length - 1].penX + layout.advance;
    const off = W / 2 - (first + last) / 2;
    for (const it of layout.items) it.penX += off;
    layout.startX += off;
  }
  const lay = rasterLayout(skeletonSize);
  const measCtx = makeCanvas(8, 8).getContext('2d');
  measCtx.font = `${lay.size}px ${fontStack}`;

  const items = [];
  const strokes = [];
  const missing = [];

  layout.items.forEach((item, ci) => {
    const charData = getCharData(item.ch);
    const m = ctx.measureText(item.ch);
    const ink = {
      x0: item.penX - m.actualBoundingBoxLeft,
      x1: item.penX + m.actualBoundingBoxRight,
      y0: item.baselineY - m.actualBoundingBoxAscent,
      y1: item.baselineY + m.actualBoundingBoxDescent,
    };
    if (!charData || !charData.medians) {
      missing.push(item.ch);
      items.push({ ...item, strokeCount: 0, hasData: false, ink: null });
      return;
    }
    // 楷书中心线（栅格坐标系）只用来给骨架子笔画排序，不参与遮罩
    let kaiMedians = [];
    try {
      kaiMedians = mapCharGeometry({
        ctx: measCtx, item: { ch: item.ch, penX: lay.penX, baselineY: lay.baselineY },
        fontSize: lay.size, charData,
      }).mediansPx;
    } catch (e) { kaiMedians = []; }

    const sk = getSkeleton({ makeCanvas, fontStack, ch: item.ch, kaiMediansRaster: kaiMedians, size: skeletonSize });
    let count = 0;
    if (sk) {
      const scale = layout.fontSize / lay.size;
      for (const sg of sk.segs) {
        const n = sg.pts.length;
        const median = new Array(n * 2);
        const widths = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          median[i * 2] = item.penX + (sg.pts[i][0] - lay.penX) * scale;
          median[i * 2 + 1] = item.baselineY + (sg.pts[i][1] - lay.baselineY) * scale;
          widths[i] = clamp(sg.widths[i] * scale * 1.28, 1.4, layout.fontSize * 0.25);
        }
        const len = polyLength(median);
        if (len < 1.2) continue;
        // 累计弧长：笔尖按"走过多少距离"推进，才不会有阶梯感
        const cum = new Float32Array(n);
        for (let i = 1; i < n; i++) {
          cum[i] = cum[i - 1] + Math.hypot(median[i * 2] - median[(i - 1) * 2], median[i * 2 + 1] - median[(i - 1) * 2 + 1]);
        }
        const total = cum[n - 1] || 1;
        strokes.push({ median, widths, cum, total, len, charIndex: ci });
        count++;
      }
    }
    items.push({ ...item, strokeCount: count, hasData: count > 0, ink });
  });

  const totalLen = strokes.reduce((a, s) => a + s.len, 0) || 1;
  const n = Math.max([...text].filter((c) => c.trim()).length, 1);
  const dur = duration || autoDuration(n);
  const lead = comet ? 320 : 0;          // 光点入场阶段
  const writeStart = 140 + lead;
  const writeDur = Math.max(dur - writeStart, 200);
  let cursor = writeStart;
  const nStroke = Math.max(strokes.length, 1);
  const minDur = Math.max(45, writeDur * 0.02);
  const stepScale = 0.92;   // 相邻笔画轻微重叠，笔不停
  // 先按长度分配，再用固定步长推进，避免"碎笔吃掉全部时间"
  for (const s of strokes) {
    const share = s.len / totalLen;
    s.start = cursor;
    s.dur = Math.max(share * writeDur * 1.10, minDur);
    s.end = s.start + s.dur;
    cursor += Math.max(share * writeDur * stepScale, minDur * 0.55);
  }
  const writeEnd = strokes.length ? Math.max(...strokes.map((s) => s.end)) : writeStart + writeDur;

  let bx0, by0, bx1, by1;
  const inkAll = items.filter((i) => i.ink).map((i) => i.ink);
  if (inkAll.length) {
    bx0 = Math.min(...inkAll.map((k) => k.x0));
    by0 = Math.min(...inkAll.map((k) => k.y0));
    bx1 = Math.max(...inkAll.map((k) => k.x1));
    by1 = Math.max(...inkAll.map((k) => k.y1));
  } else {
    bx0 = layout.startX; bx1 = layout.startX + layout.totalW;
    by0 = H / 2 - layout.fontSize / 2; by1 = H / 2 + layout.fontSize / 2;
  }

  let couple = null;
  if (coupleSplit > 0 && layout.items.length > coupleSplit) {
    const a = layout.items[coupleSplit - 1], b = layout.items[coupleSplit];
    couple = { x: (a.penX + layout.advance + b.penX) / 2, y: a.baselineY };
  }
  const firstStrokePoint = strokes.length && strokes[0].median.length >= 2
    ? { x: strokes[0].median[0], y: strokes[0].median[1] }
    : { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2 };
  return {
    W, H, text, fontStack, font, layout, items, strokes, missing,
    duration: Math.max(dur + lead, writeEnd + decorTailAdd, writeEnd + (outro ? 1100 : 0)), lead, firstStrokePoint,
    writeStart, writeEnd, writeDur,
    couple,
    bbox: { x0: bx0, y0: by0, x1: bx1, y1: by1 },
  };
}

/**
 * 逐字预热骨架缓存：每个字算完让出一次主线程，避免长任务卡住 UI
 * 与 buildScene 使用同一套坐标与缓存，不会重复计算
 */
export async function prewarmSkeletons({ makeCanvas, text, fontStack, getCharData, skeletonSize = 260, onProgress }) {
  const lay = rasterLayout(skeletonSize);
  const measCtx = makeCanvas(8, 8).getContext('2d');
  measCtx.font = `${lay.size}px ${fontStack}`;
  const chars = [...text].filter((c) => c.trim().length > 0);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const charData = getCharData(ch);
    if (charData && charData.medians) {
      let kai = [];
      try {
        kai = mapCharGeometry({ ctx: measCtx, item: { ch, penX: lay.penX, baselineY: lay.baselineY }, fontSize: lay.size, charData }).mediansPx;
      } catch (e) { kai = []; }
      getSkeleton({ makeCanvas, fontStack, ch, kaiMediansRaster: kai, size: skeletonSize });
    }
    if (onProgress) onProgress((i + 1) / chars.length);
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function globalProgress(scene, t) {
  const end = Math.max(scene.writeEnd, scene.duration);
  return clamp(t / end, 0, 1);
}

// ---------- 遮罩绘制 ----------
export function createMaskPainter(maskCtx, scene, W, H, opts = {}) {
  const finalized = scene.strokes.map(() => false);
  let last = { x: W / 2, y: H / 2, ok: false };

  // live 层：正在写的那一笔每帧重画，才能有真正的尖笔锋
  // （如果和已完成的笔画混在同一张遮罩里累积，笔尖会被反复叠加成圆头）
  const liveCanvas = opts.makeCanvas ? opts.makeCanvas(W, H) : null;
  const liveCtx = liveCanvas ? liveCanvas.getContext('2d') : null;

  /** 某一点的半径：基础笔宽 × 方向压力 × 起收笔收锋 */
  function radiusAt(s, i, progress, applyTaper) {
    const n = s.widths.length;
    let r = s.widths[i] * 0.5;
    // 方向压力：竖笔略粗、横笔略细，模拟毛笔侧锋
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = s.median[i1 * 2] - s.median[i0 * 2];
    const dy = s.median[i1 * 2 + 1] - s.median[i0 * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    r *= 0.97 + 0.03 * (Math.abs(dy) / len);
    if (!applyTaper) return Math.max(0.4, r);

    const target = s.total * brushProgress(progress);
    const back = target - s.cum[i];
    if (back < 0) return Math.max(0.4, r);
    // 笔尖收锋：离笔尖越近越细，形成尖而不钝的起收笔
    const tipLen = clamp(s.widths[i] * 2.6, 5, 40);
    if (back < tipLen) r *= 0.26 + 0.74 * (back / tipLen);
    // 起笔轻入
    const entry = Math.min(s.total * 0.10, 16);
    if (s.cum[i] < entry) r *= 0.62 + 0.38 * (s.cum[i] / entry);
    return Math.max(0.4, r);
  }

  function fillDisk(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 变宽缎带：沿笔画取点，左右各偏移半径，围成一条闭合多边形一次填充。
   * 单一路径 → 绕向一致，不会像"圆点拼接/分段四边形"那样出现自相交挖洞。
   */
  function ribbon(ctx, s, progress, applyTaper) {
    const n = s.widths.length;
    if (n < 2) return false;
    const pts = s.median, cum = s.cum;
    const target = s.total * brushProgress(progress);
    if (target <= 0) return false;

    const xs = [], ys = [], rs = [];
    for (let i = 0; i < n; i++) {
      const r = radiusAt(s, i, progress, applyTaper);
      if (cum[i] < target) {
        xs.push(pts[i * 2]); ys.push(pts[i * 2 + 1]); rs.push(r);
        continue;
      }
      // 收在段中间：插值到精确位置，笔尖不会一跳一跳
      const d0 = cum[i - 1];
      const k = cum[i] > d0 ? (target - d0) / (cum[i] - d0) : 0;
      const px = pts[(i - 1) * 2], py = pts[(i - 1) * 2 + 1];
      xs.push(px + (pts[i * 2] - px) * k);
      ys.push(py + (pts[i * 2 + 1] - py) * k);
      rs.push(Math.max(0.4, (rs[rs.length - 1] + r) * 0.5));
      break;
    }
    const m = xs.length;
    last = { x: xs[m - 1], y: ys[m - 1], ok: true };
    if (m < 2) { fillDisk(ctx, xs[0], ys[0], rs[0]); return true; }

    const lx = [], ly = [], rx = [], ry = [];
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
      const dx = xs[i1] - xs[i0], dy = ys[i1] - ys[i0];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      lx.push(xs[i] + nx * rs[i]); ly.push(ys[i] + ny * rs[i]);
      rx.push(xs[i] - nx * rs[i]); ry.push(ys[i] - ny * rs[i]);
    }
    ctx.beginPath();
    ctx.moveTo(lx[0], ly[0]);
    for (let i = 1; i < m; i++) ctx.lineTo(lx[i], ly[i]);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    // 两端圆帽（补齐转折处的缺口）
    fillDisk(ctx, xs[0], ys[0], rs[0]);
    fillDisk(ctx, xs[m - 1], ys[m - 1], rs[m - 1]);
    return true;
  }

  return {
    reset() {
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.clearRect(0, 0, W, H);
      if (liveCtx) { liveCtx.setTransform(1, 0, 0, 1, 0, 0); liveCtx.clearRect(0, 0, W, H); }
      for (let i = 0; i < finalized.length; i++) finalized[i] = false;
      last = { x: W / 2, y: H / 2, ok: false };
    },
    getLive() { return liveCanvas; },
    paint(t) {
      const tips = [];
      if (liveCtx) liveCtx.clearRect(0, 0, W, H);
      scene.strokes.forEach((s, si) => {
        if (t < s.start) return;
        const raw = clamp((t - s.start) / s.dur, 0, 1);
        if (raw >= 1) {
          if (!finalized[si]) {
            // 这一笔写完了：按满宽并入 done 层（不带收锋，保证不留缝）
            maskCtx.save();
            ribbon(maskCtx, s, 1, false);
            maskCtx.restore();
            finalized[si] = true;
          }
          return;
        }
        // 正在写：画在 live 层，带笔锋
        if (liveCtx) {
          ribbon(liveCtx, s, raw, true);
        } else {
          maskCtx.save();
          ribbon(maskCtx, s, raw, true);
          maskCtx.restore();
        }
        tips.push({ x: last.x, y: last.y, si });
      });
      return tips;
    },
    paintFallback(scene2, t) {
      scene2.items.forEach((it, ci) => {
        if (it.hasData || !it.ink) return;
        const n = Math.max(scene2.items.length, 1);
        const st = 140 + (ci / n) * (scene2.writeDur * 0.8);
        const p = clamp((t - st) / Math.max(scene2.writeDur * 0.5, 200), 0, 1);
        if (p <= 0) return;
        const k = it.ink;
        maskCtx.save();
        maskCtx.fillStyle = '#fff';
        maskCtx.fillRect(k.x0 - 4, k.y0 - 4, (k.x1 - k.x0 + 8) * p, k.y1 - k.y0 + 8);
        maskCtx.restore();
      });
    },
    lastTip() { return last; },
  };
}

// ---------- 字形层 ----------
export function renderGlyphLayer(glyphCanvas, scene, palette) {
  const ctx = glyphCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scene.W, scene.H);
  ctx.font = `${scene.layout.fontSize}px ${scene.fontStack}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const { x0, y0, x1, y1 } = scene.bbox;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = palette.stops;
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  ctx.fillStyle = g;
  for (const it of scene.layout.items) ctx.fillText(it.ch, it.penX, it.baselineY);
  return ctx;
}

// ---------- 背景 ----------
let noisePattern = null;
function ensureNoise(ctx) {
  if (noisePattern) return noisePattern;
  let src = null;
  try {
    if (ctx.canvas.ownerDocument) src = ctx.canvas.ownerDocument.createElement('canvas');
  } catch (e) { /* ignore */ }
  if (!src && typeof globalThis.__makeCanvas === 'function') src = globalThis.__makeCanvas(96, 96);
  if (!src) return null;
  src.width = 96; src.height = 96;
  const nctx = src.getContext('2d');
  const img = nctx.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 235 + Math.round(Math.random() * 18);
    img.data[i] = v; img.data[i + 1] = v - 4; img.data[i + 2] = v - 12;
    img.data[i + 3] = 26;
  }
  nctx.putImageData(img, 0, 0);
  noisePattern = ctx.createPattern(src, 'repeat');
  return noisePattern;
}

export function drawBackdrop(ctx, scene, backdropId) {
  const { W, H } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (backdropId === 'none') { ctx.clearRect(0, 0, W, H); return; }
  if (backdropId === 'paper') {
    ctx.fillStyle = '#F7F4EC';
    ctx.fillRect(0, 0, W, H);
    const p = ensureNoise(ctx);
    if (p) { ctx.fillStyle = p; ctx.fillRect(0, 0, W, H); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.18, W / 2, H / 2, W * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(120,100,60,0.10)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (backdropId === 'dark') {
    ctx.fillStyle = '#0D0D10';
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.75);
    rg.addColorStop(0, 'rgba(60,60,80,0.55)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const lg = ctx.createLinearGradient(0, 0, W, H);
  lg.addColorStop(0, '#16162A');
  lg.addColorStop(0.55, '#1B2340');
  lg.addColorStop(1, '#2A1030');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, W * 0.6);
  rg.addColorStop(0, 'rgba(80,160,255,0.18)');
  rg.addColorStop(1, 'rgba(80,160,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

// ---------- 合成 ----------
/**
 * 廉价的发光：先在 1/3 分辨率上做模糊再放大。
 * 手机上全分辨率逐帧 blur 是最大的性能杀手（824² 一次几十毫秒）。
 */
function blurredDraw(ctx, img, W, H, blurPx, alpha, env) {
  const sc = 3;
  const w = Math.max(1, Math.ceil(W / sc)), h = Math.max(1, Math.ceil(H / sc));
  if (!env._g1) {
    env._g1 = env.makeCanvas(w, h);
    env._g1c = env._g1.getContext('2d');
    env._g2 = env.makeCanvas(w, h);
    env._g2c = env._g2.getContext('2d');
  }
  const g1 = env._g1c, g2 = env._g2c;
  g1.setTransform(1, 0, 0, 1, 0, 0);
  g1.clearRect(0, 0, w, h);
  g1.drawImage(img, 0, 0, w, h);
  g2.setTransform(1, 0, 0, 1, 0, 0);
  g2.clearRect(0, 0, w, h);
  let filtered = false;
  try {
    g2.filter = `blur(${Math.max(0.5, blurPx / sc)}px)`;
    filtered = g2.filter.startsWith('blur');
  } catch (e) { filtered = false; }
  if (!filtered) g2.filter = 'none';
  g2.drawImage(env._g1, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(env._g2, 0, 0, w, h, 0, 0, W, H);
  ctx.restore();
}

/** 彩色笔片：把字形切成小色片（参考项目的“彩色收尾”） */
function ensureChips(env) {
  if (env._chips) return env._chips;
  const { scene, glyphCanvas } = env;
  const W = scene.W, H = scene.H;
  const c = env.makeCanvas(W, H);
  const cc = c.getContext('2d');
  const data = glyphCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const step = Math.max(5, Math.round(scene.layout.fontSize * 0.052));
  const hues = ['#FF4D8D', '#FFB84D', '#22D3EE', '#7C3AED', '#5BFF9F', '#F472B6'];
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const px = Math.min(W - 1, x + (step >> 1));
      const py = Math.min(H - 1, y + (step >> 1));
      if (data[(py * W + px) * 4 + 3] < 60) continue;
      cc.save();
      cc.translate(px, py);
      cc.rotate((Math.random() - 0.5) * 0.55);
      cc.fillStyle = hues[(Math.random() * hues.length) | 0];
      cc.fillRect(-step * 0.55, -step * 0.34, step * 1.1, step * 0.68);
      cc.restore();
    }
  }
  cc.globalCompositeOperation = 'destination-in';
  cc.drawImage(glyphCanvas, 0, 0);
  env._chips = c;
  return c;
}

/** 光点入场：一道带尾迹的光点飞入，落在第一笔起点 */
function drawComet(ctx, scene, palette, t) {
  if (!scene.lead || t > scene.lead + 80) return;
  const W = scene.W, H = scene.H;
  const from = { x: -W * 0.12, y: H * 0.16 };
  const to = scene.firstStrokePoint || { x: W * 0.3, y: H * 0.55 };
  const cx = (from.x + to.x) / 2 + W * 0.06;
  const cy = Math.min(from.y, to.y) - H * 0.10;
  const pt = (u) => ({
    x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * cx + u * u * to.x,
    y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * cy + u * u * to.y,
  });
  const head = clamp(t / scene.lead, 0, 1);
  const e = easeInOutCubic(head);
  const color = palette.glow || '#F0CD8C';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 尾迹
  for (let i = 13; i >= 0; i--) {
    const u = e - i * 0.032;
    if (u < 0) continue;
    const q = pt(u);
    const a = (1 - i / 14) * 0.55;
    const r = Math.max(1.2, (1 - i / 14) * scene.layout.fontSize * 0.035);
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 头部光点
  const hp = pt(e);
  const hr = scene.layout.fontSize * 0.05 * (1 + 0.15 * Math.sin(t / 90));
  ctx.globalAlpha = 0.95;
  ctx.shadowColor = color;
  ctx.shadowBlur = scene.layout.fontSize * 0.25;
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, hr * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderFrame(env, t) {
  const { ctx, scene, glyphCanvas, maskCanvas, tempCanvas, painter, params, palette, backdropId } = env;
  const { W, H } = scene;
  const tctx = tempCanvas.getContext('2d');

  // ---- 静止态快路径 ----
  // 写完后直接画完整字形：既保证"不出现笔画空缺"，也省掉每帧的遮罩合成与遮罩绘制。
  if (t >= scene.writeEnd + 360) {
    drawBackdrop(ctx, scene, backdropId);
    ctx.save();
    if (params.neon || palette.glowR > 0) {
      const pulse = params.neon ? 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t / 260)) : 1;
      ctx.globalCompositeOperation = 'lighter';
      const radius = (params.neon ? palette.glowR * 1.9 : palette.glowR * 0.55) * pulse;
      blurredDraw(ctx, glyphCanvas, W, H, radius, params.neon ? 0.9 : 0.28, env);
      ctx.globalCompositeOperation = 'source-over';
    }
    const outroP = env.params.outro ? clamp((t - (scene.writeEnd + 160)) / 700, 0, 1) : 0;
    ctx.drawImage(outroP >= 1 ? ensureChips(env) : glyphCanvas, 0, 0);
    ctx.restore();
    if (env.decor) drawDecorations({ ctx, scene, cfg: env.decor, t, palette, start: scene.writeEnd + 100 });
    return { tips: [] };
  }

  const tips = painter.paint(t);
  painter.paintFallback(scene, t);

  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'source-over';
  tctx.clearRect(0, 0, W, H);
  tctx.drawImage(glyphCanvas, 0, 0);
  tctx.globalCompositeOperation = 'destination-in';
  const live = painter.getLive && painter.getLive();
  if (live) {
    // 已完成笔画 ∪ 正在写的笔画，再与字形求交
    if (!env.combCanvas) {
      env.combCanvas = env.makeCanvas(scene.W, scene.H);
      env.combCtx = env.combCanvas.getContext('2d');
    }
    env.combCtx.setTransform(1, 0, 0, 1, 0, 0);
    env.combCtx.clearRect(0, 0, W, H);
    env.combCtx.drawImage(maskCanvas, 0, 0);
    env.combCtx.drawImage(live, 0, 0);
    tctx.drawImage(env.combCanvas, 0, 0);
  } else {
    tctx.drawImage(maskCanvas, 0, 0);
  }
  tctx.globalCompositeOperation = 'source-over';

  // 收笔补齐：骨架遮罩会漏掉极少数边缘细缝，末段淡入完整字形，保证成品 100% 完整
  const settleStart = scene.writeEnd - 140;
  if (t > settleStart) {
    const k = clamp((t - settleStart) / 260, 0, 1);
    tctx.save();
    tctx.globalAlpha = k;
    tctx.drawImage(glyphCanvas, 0, 0);
    tctx.restore();
  }

  if (params.outro) {
    const p = clamp((t - (scene.writeEnd + 160)) / 700, 0, 1);
    if (p > 0) {
      tctx.save();
      tctx.globalAlpha = p;
      tctx.drawImage(ensureChips(env), 0, 0);
      tctx.restore();
    }
  }

  if (params.shine && t > scene.writeStart) {
    const period = 2200;
    const ph = ((t - scene.writeStart) % period) / period;
    const cx = -0.3 * W + ph * 1.9 * W;
    const g = tctx.createLinearGradient(cx - W * 0.22, 0, cx + W * 0.22, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.44, 'rgba(255,255,255,0.58)');
    g.addColorStop(0.56, 'rgba(255,255,255,0.58)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.fillStyle = g;
    tctx.fillRect(0, 0, W, H);
    tctx.restore();
  }

  if (params.trail) {
    const ph = (t % 1800) / 1800;
    tctx.save();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.font = `${scene.layout.fontSize}px ${scene.fontStack}`;
    tctx.textBaseline = 'alphabetic';
    const g = tctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(clamp(ph - 0.18, 0, 1), 'rgba(255,255,255,0)');
    g.addColorStop(clamp(ph, 0.01, 0.99), 'rgba(255,255,255,0.95)');
    g.addColorStop(clamp(ph + 0.05, 0.01, 0.99), 'rgba(255,255,255,0.15)');
    g.addColorStop(clamp(ph + 0.25, 0, 1), 'rgba(255,255,255,0)');
    tctx.strokeStyle = g;
    tctx.lineWidth = Math.max(1.2, scene.layout.fontSize * 0.008);
    for (const it of scene.layout.items) tctx.strokeText(it.ch, it.penX, it.baselineY);
    tctx.restore();
  }

  drawBackdrop(ctx, scene, backdropId);

  // 光点入场画在背景之上、字形之下
  if (env.params.comet) drawComet(ctx, scene, palette, t);

  const entrance = params.enter ? easeOutCubic(clamp(t / 520, 0, 1)) : 1;
  const pulse = params.neon ? 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t / 260)) : 1;

  ctx.save();
  ctx.globalAlpha = entrance;
  if (params.enter) {
    const s = 0.965 + 0.035 * entrance;
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
  }
  if (params.neon || palette.glowR > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const radius = (params.neon ? palette.glowR * 1.9 : palette.glowR * 0.55) * pulse;
    blurredDraw(ctx, tempCanvas, W, H, radius, params.neon ? 0.9 : 0.28, env);
    ctx.restore();
  }
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();

  if (env.decor) {
    drawDecorations({ ctx, scene, cfg: env.decor, t, palette, start: scene.writeEnd + 100 });
  }
  if (params.particle) { env.nowT = t; updateAndDrawParticles(ctx, env, tips); }
  return { tips };
}

// ---------- 粒子 ----------
export function createParticleSystem() {
  return { list: [], lastSpawn: 0 };
}

export function updateAndDrawParticles(ctx, env, tips) {
  const ps = env.particles;
  if (!ps.list) ps.list = [];
  if (!tips.length) return;
  if (!ps.lastSpawn || env.nowT - ps.lastSpawn > 14) {
    ps.lastSpawn = env.nowT || 0;
    for (let k = 0; k < 2; k++) {
      const tip = tips[Math.floor(Math.random() * tips.length)];
      ps.list.push({
        x: tip.x + (Math.random() - 0.5) * 8,
        y: tip.y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.25 - Math.random() * 0.45,
        life: 0,
        max: 700 + Math.random() * 600,
        r: 0.8 + Math.random() * 2.2,
      });
    }
  }
  if (ps.list.length > 260) ps.list.splice(0, ps.list.length - 260);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = ps.list.length - 1; i >= 0; i--) {
    const p = ps.list[i];
    p.life += 16;
    if (p.life > p.max) { ps.list.splice(i, 1); continue; }
    p.x += p.vx; p.y += p.vy; p.vy += 0.004;
    const a = 1 - p.life / p.max;
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = env.palette.glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
