// skeleton.js — 从艺术字体字形提取笔画骨架（核心：解决"楷书笔顺 ≠ 艺术字体结构"的问题）
//
// 思路：
//   ① 把艺术字体字形栅格化 → ② Zhang-Suen 细化得到 1px 骨架
//   ③ 骨架按分叉点拆成子笔画段 → ④ 用楷书笔顺数据给子笔画段排序
// 好处：揭示的区域永远是字形自身，覆盖率天然接近 100%；
//      笔顺顺序仍来自真实笔顺数据，所以"写"的顺序是对的。

const CACHE = new Map();
const CACHE_MAX = 240;

function keyOf(fontStack, ch, size) {
  return `${fontStack}|${ch}|${size}`;
}

export function rasterLayout(size = 260) {
  const pad = Math.ceil(size * 0.28);
  const W = size + pad * 2;
  return { pad, W, penX: W / 2 - size / 2, baselineY: W / 2 + size * 0.488, size };
}

/** 两遍倒角距离变换：得到每个墨迹像素到背景的距离（= 局部半笔宽） */
export function distanceTransform(bin, W, H) {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = bin[i] ? INF : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!bin[i]) continue;
      let m = d[i];
      if (x > 0 && d[i - 1] + 1 < m) m = d[i - 1] + 1;
      if (y > 0 && d[i - W] + 1 < m) m = d[i - W] + 1;
      if (x > 0 && y > 0 && d[i - W - 1] + 1.414 < m) m = d[i - W - 1] + 1.414;
      if (x < W - 1 && y > 0 && d[i - W + 1] + 1.414 < m) m = d[i - W + 1] + 1.414;
      d[i] = m;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!bin[i]) continue;
      let m = d[i];
      if (x < W - 1 && d[i + 1] + 1 < m) m = d[i + 1] + 1;
      if (y < H - 1 && d[i + W] + 1 < m) m = d[i + W] + 1;
      if (x < W - 1 && y < H - 1 && d[i + W + 1] + 1.414 < m) m = d[i + W + 1] + 1.414;
      if (x > 0 && y < H - 1 && d[i + W - 1] + 1.414 < m) m = d[i + W - 1] + 1.414;
      d[i] = m;
    }
  }
  return d;
}

/** 栅格化单字到独立画布，返回二值图与坐标系信息 */
export function rasterizeGlyph({ makeCanvas, fontStack, ch, size = 260 }) {
  const pad = Math.ceil(size * 0.28);
  const W = size + pad * 2;
  const canvas = makeCanvas(W, W);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);
  ctx.font = `${size}px ${fontStack}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const penX = W / 2 - size / 2;
  const baselineY = W / 2 + size * 0.488;
  ctx.fillStyle = '#fff';
  ctx.fillText(ch, penX, baselineY);

  const img = ctx.getImageData(0, 0, W, W);
  const data = img.data;
  const bin = new Uint8Array(W * W);
  let x0 = W, y0 = W, x1 = -1, y1 = -1;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 120) {
        bin[y * W + x] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { bin, W, H: W, bbox: { x0, y0, x1, y1 }, penX, baselineY, size };
}

/** Zhang-Suen 细化（原地修改 bin） */
export function zhangSuen(bin, W, H) {
  const idx = (x, y) => y * W + x;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : bin[idx(x, y)]);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 60) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (!bin[idx(x, y)]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y),
            p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1),
            p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A =
            (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) + (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0);
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          del.push(idx(x, y));
        }
      }
      if (del.length) {
        changed = true;
        for (const i of del) bin[i] = 0;
      }
    }
  }
  return bin;
}

const NB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** 骨架拆段：以端点和分叉点为节点，走出一条条子笔画 */
export function traceSegments(skel, W, H) {
  const idx = (x, y) => y * W + x;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && skel[idx(x, y)] === 1;
  const deg = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!skel[idx(x, y)]) continue;
      let d = 0;
      for (const [dx, dy] of NB) if (on(x + dx, y + dy)) d++;
      deg[idx(x, y)] = d;
    }
  }
  const isNode = (x, y) => deg[idx(x, y)] !== 2;
  const visited = new Uint8Array(W * H);
  const segs = [];

  const walk = (sx, sy, fx, fy) => {
    const pts = [[sx, sy]];
    let px = sx, py = sy, cx = fx, cy = fy;
    let guard = 0;
    while (guard++ < 4000) {
      pts.push([cx, cy]);
      if (isNode(cx, cy)) break;
      visited[idx(cx, cy)] = 1;
      let next = null;
      for (const [dx, dy] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (nx === px && ny === py) continue;
        if (!on(nx, ny)) continue;
        if (!isNode(nx, ny) && visited[idx(nx, ny)]) continue;
        next = [nx, ny];
        break;
      }
      if (!next) break;
      px = cx; py = cy; cx = next[0]; cy = next[1];
    }
    return pts;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!skel[idx(x, y)]) continue;
      if (!isNode(x, y) || visited[idx(x, y)]) continue;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (!on(nx, ny)) continue;
        if (!isNode(nx, ny) && visited[idx(nx, ny)]) continue;
        const pts = walk(x, y, nx, ny);
        if (pts.length >= 2) segs.push(pts);
      }
      visited[idx(x, y)] = 1;
    }
  }
  // 没有节点的孤立环 / 独立段：兜底扫一遍未访问像素
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!skel[idx(x, y)] || visited[idx(x, y)] || isNode(x, y)) continue;
      const pts = walk(x, y, x + 1, y);
      if (pts.length >= 3) segs.push(pts);
    }
  }
  return segs;
}

function dirAt(pts, atEnd) {
  const n = pts.length;
  if (n < 2) return [1, 0];
  const i = atEnd ? n - 1 : 0;
  const j = atEnd ? Math.max(0, n - 3) : Math.min(n - 1, 2);
  const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
}

/**
 * 合并碎段：把同一笔、首尾相连、走向连续的骨架子段接成一条长笔画。
 * 这是"书写顺畅"的关键——原来 40+ 个碎段各自缓动，看起来就是一顿一顿的。
 */
export function mergeSegments(items) {
  const out = [];
  for (const it of items) {
    const prev = out.length ? out[out.length - 1] : null;
    if (prev) {
      const pe = prev.pts[prev.pts.length - 1];
      const cs = it.pts[0];
      const d = Math.hypot(pe[0] - cs[0], pe[1] - cs[1]);
      const sameGroup = it.order === prev.order;
      let ok = sameGroup && d < 9.0;
      if (ok) {
        const a = dirAt(prev.pts, true);
        const b = dirAt(it.pts, false);
        ok = a[0] * b[0] + a[1] * b[1] > -0.25;  // 拐太急就断开，保留自然的顿笔
      }
      if (ok) {
        for (let i = 1; i < it.pts.length; i++) prev.pts.push([...it.pts[i]]);
        continue;
      }
    }
    out.push({ pts: it.pts.map((q) => [...q]), order: it.order, sub: it.sub });
  }
  return out;
}

/** Catmull-Rom 加密：把折线变成顺滑曲线，笔尖走弧线才不抖 */
export function smoothPolyline(pts, step = 2) {
  if (pts.length < 3) return pts.map((q) => [...q]);
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.min(10, Math.round(segLen / step)));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push([...pts[pts.length - 1]]);
  return out;
}

/** 逐点笔宽：沿骨架取距离变换的局部半宽，就是这一点的真实笔宽（笔锋的基础） */
export function widthsAlong(pts, dt, W, H) {
  const raw = pts.map(([x, y]) => {
    const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(H - 1, Math.round(y)));
    const v = dt[yi * W + xi];
    return Math.max(1.0, (isFinite(v) ? v : 2) * 2);
  });
  return raw.map((_, i) => {
    let sum = 0, cnt = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < raw.length) { sum += raw[j]; cnt++; }
    }
    return sum / cnt;
  });
}

function polyLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** 简化折线（RDP），减少笔尖轨迹点数 */
export function simplify(pts, eps = 1.2) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let last = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[last], [bx, by] = pts[i + 1], [px, py] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > eps) { out.push(pts[i]); last = i; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * 用楷书笔顺给骨架子段排序
 * @param segments 骨架子段（栅格坐标）
 * @param kaiMedians 楷书中心线（同一栅格坐标系）
 */
export function orderSegmentsByKai(segments, kaiMedians) {
  // 展平楷书点为带顺序索引的数组
  const kai = [];
  kaiMedians.forEach((m, si) => {
    for (let i = 0; i < m.length; i++) {
      kai.push({ x: m[i][0], y: m[i][1], si, t: i / Math.max(m.length - 1, 1) });
    }
  });
  if (!kai.length) return segments.map((pts) => ({ pts, order: 0, sub: 0 }));

  const nearest = (x, y) => {
    let best = null, bd = Infinity;
    for (const k of kai) {
      const d = (k.x - x) * (k.x - x) + (k.y - y) * (k.y - y);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };

  const items = segments.map((pts) => {
    const mid = pts[Math.floor(pts.length / 2)];
    const a = nearest(pts[0][0], pts[0][1]);
    const b = nearest(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    const m = nearest(mid[0], mid[1]);
    let anchor = m;
    let orientStart = pts[0];
    let orientEnd = pts[pts.length - 1];
    // 方向：取两端中在楷书笔顺中更早的一端作为起点
    if (a && b && (a.si > b.si || (a.si === b.si && a.t > b.t))) {
      orientStart = pts[pts.length - 1];
      orientEnd = pts[0];
      anchor = b;
    }
    return { pts, order: anchor ? anchor.si : 0, sub: anchor ? anchor.t : 0, start: orientStart, end: orientEnd };
  });

  items.sort((p, q) => (p.order - q.order) || (p.sub - q.sub));
  return items.map((it) => ({
    pts: it.start === it.pts[0] ? it.pts : [...it.pts].reverse(),
    order: it.order, sub: it.sub,
  }));
}

/** 无楷书数据时的兜底排序：上→下、左→右 */
export function orderSegmentsSimple(segments) {
  const items = segments.map((pts) => {
    const s = pts[0], e = pts[pts.length - 1];
    // 起点取更靠上（其次靠左）的一端
    const flip = e[1] < s[1] - 2 || (Math.abs(e[1] - s[1]) <= 2 && e[0] < s[0]);
    const start = flip ? e : s;
    return { pts: flip ? [...pts].reverse() : pts, key: start[1] * 10000 + start[0] };
  });
  items.sort((a, b) => a.key - b.key);
  return items.map((it) => ({ pts: it.pts, order: 0, sub: 0 }));
}

/**
 * 主入口：取某字在某字体下的骨架笔画（栅格坐标），带缓存
 * 返回 { segs: [ [[x,y],...] ], raster: {...} }
 */
function lsKey(fontStack, ch, size) { return `sk1|${fontStack}|${ch}|${size}`; }

export function getSkeleton({ makeCanvas, fontStack, ch, kaiMediansRaster, size = 220 }) {
  const key = keyOf(fontStack, ch, size);
  const hit = CACHE.get(key);
  if (hit) return hit;

  // 本地持久化：同名同字体再进来直接命中，不用再算骨架（手机上这是最大的卡顿来源）
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(lsKey(fontStack, ch, size));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.segs) { CACHE.set(key, parsed); return parsed; }
      }
    }
  } catch (e) { /* 隐私模式等情况忽略 */ }

  const raster = rasterizeGlyph({ makeCanvas, fontStack, ch, size });
  if (!raster) { CACHE.set(key, null); return null; }
  const { bin, W } = raster;

  // 只在墨迹外扩 2px 的窗口内细化，省时间
  const b = raster.bbox;
  const pad = 2;
  const wx0 = Math.max(0, b.x0 - pad), wy0 = Math.max(0, b.y0 - pad);
  const wx1 = Math.min(W - 1, b.x1 + pad), wy1 = Math.min(W - 1, b.y1 + pad);
  const ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1;
  const crop = new Uint8Array(ww * wh);
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) crop[y * ww + x] = bin[(y + wy0) * W + (x + wx0)];
  }
  zhangSuen(crop, ww, wh);
  let segs = traceSegments(crop, ww, wh);
  // 转回原图坐标 + 简化 + 过滤碎段
  segs = segs.map((pts) => pts.map(([x, y]) => [x + wx0, y + wy0]));
  segs = segs.map((pts) => simplify(pts)).filter((pts) => polyLen(pts) >= 2.5);

  if (!segs.length) { CACHE.set(key, null); return null; }
  // 关键顺序：先按连通性把碎段合并成完整笔画（此时还不知道笔顺），再排序。
  // 否则同一笔会被拆成几段、分别排到不同时间，画面上就会出现"孤立的小点"。
  let merged = mergeSegments(segs.map((pts) => ({ pts, order: 0, sub: 0 })))
    .filter((it) => polyLen(it.pts) >= 6.0);
  if (!merged.length) merged = segs.map((pts) => ({ pts, order: 0, sub: 0 }));

  const ptsList = merged.map((m) => m.pts);
  let ordered;
  if (kaiMediansRaster && kaiMediansRaster.length) {
    ordered = orderSegmentsByKai(ptsList, kaiMediansRaster);
  } else {
    ordered = orderSegmentsSimple(ptsList);
  }
  merged = ordered;

  const dt = distanceTransform(bin, W, W);
  const segsOut = merged.map((it) => {
    const dense = smoothPolyline(it.pts, 2);
    return { pts: dense, widths: widthsAlong(dense, dt, W, W), order: it.order };
  });

  const result = { segs: segsOut, raster };
  if (CACHE.size > CACHE_MAX) CACHE.clear();
  CACHE.set(key, result);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(lsKey(fontStack, ch, size), JSON.stringify({ segs: result.segs }));
    }
  } catch (e) { /* 配额满就放弃持久化 */ }
  return result;
}

export function clearSkeletonCache() { CACHE.clear(); }

/** 供浏览器把骨架缓存到 localStorage（同名字下次秒开） */
export function peekSkeleton(fontStack, ch, size = 220) {
  return CACHE.get(keyOf(fontStack, ch, size)) || null;
}
export function seedSkeleton(fontStack, ch, size, result) {
  CACHE.set(keyOf(fontStack, ch, size), result);
}
