// port/decor.js — 装饰图案（移植自 tangyx527/tyx-signature, MIT）
// 原实现输出 SVG path；这里采样成 Canvas 缎带/描边。
import { clamp, smooth } from './brush.js';

const between = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : smooth((t - a) / (b - a)));

function sampleCubic(p0, p1, p2, p3, n = 48) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    points.push({
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    });
  }
  return points;
}

function pointAt(curve, t) {
  const total = curve.length || 1;
  const target = clamp(t, 0, 1) * total;
  let i = 1;
  while (i < curve.points.length - 1 && curve.points[i].length < target) i++;
  const a = curve.points[i - 1], b = curve.points[i];
  const seg = (b.length - a.length) || 1;
  const k = clamp((target - a.length) / seg, 0, 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function curve(segments) {
 const points=[];let length=0;
 for(const s of segments){const sampled=sampleCubic({x:s[0],y:s[1]},{x:s[2],y:s[3]},{x:s[4],y:s[5]},{x:s[6],y:s[7]},48);
  for(const p of sampled){const last=points.at(-1);if(last)length+=Math.hypot(p.x-last.x,p.y-last.y);points.push({...p,length});}}
 return {points,length};
}

export const decorationPaths={
 sun:[{id:'face',d:'M 0 -48 C 31 -49 51 -22 49 7 C 47 38 25 50 -4 49 C -35 48 -50 28 -49 0 C -48 -28 -28 -49 0 -48',width:3.7},{id:'left-eye',d:'M -28 1 C -25 -11 -16 -12 -12 -1',width:3.2},{id:'right-eye',d:'M 13 -2 C 16 -14 25 -15 29 -4',width:3.2},{id:'smile',d:'M -10 17 C -3 29 13 29 18 15',width:3.4},...Array.from({length:8},(_,i)=>{const a=-Math.PI/2+i*Math.PI/4;return {id:`ray-${i}`,d:`M ${Math.cos(a)*65} ${Math.sin(a)*65} L ${Math.cos(a)*85} ${Math.sin(a)*85}`,width:5};})],
 cat:[
  {id:'left-ear',curve:curve([[-42,-4,-40,-19,-40,-42,-34,-43],[-34,-43,-29,-44,-11,-23,-5,-13]]),width:4.5},
  {id:'right-ear',curve:curve([[7,-11,16,-28,26,-45,30,-43],[30,-43,37,-42,41,-20,40,-8]]),width:4.4},
  {id:'left-eye',eye:{x:-10,y:5},width:6.5}, {id:'right-eye',eye:{x:15,y:4},width:6.5},
  {id:'whisker-left-up',curve:curve([[-65,4,-53,6,-29,12,-17,15]]),width:5.4,profile:'taper'},
  {id:'whisker-left-down',curve:curve([[-55,37,-43,31,-27,24,-18,20]]),width:5,profile:'taper'},
  {id:'whisker-right-up',curve:curve([[64,-5,54,0,36,8,22,14]]),width:5.9,profile:'taper'},
  {id:'whisker-right-down',curve:curve([[60,23,49,22,34,19,25,19]]),width:4.7,profile:'taper'},
 ],
 heart:[{id:'heart',curve:curve([[0,51,-18,32,-62,6,-53,-25],[-53,-25,-45,-55,-12,-56,0,-29],[0,-29,15,-59,48,-51,54,-25],[54,-25,63,6,18,34,0,51]]),width:4.8}],
 star:[
  {id:'wandering-star',curve:curve([[-8,-49,-5,-60,1,-56,6,-46],[6,-46,10,-35,15,-23,18,-16],[18,-16,31,-18,51,-25,54,-18],[54,-18,56,-14,35,2,28,8],[28,8,31,20,41,42,34,45],[34,45,29,48,12,34,0,29],[0,29,-10,39,-25,55,-30,51],[-30,51,-36,48,-28,22,-26,14],[-26,14,-36,8,-59,-3,-56,-9],[-56,-9,-54,-15,-29,-15,-21,-18],[-21,-18,-18,-31,-13,-45,-8,-49]]),width:5.4},
  {id:'star-smile',d:'M -9 8 Q -1 18 9 7',width:2.6},
  {id:'star-eye-left',eye:{x:-12,y:-3},width:2.3}, {id:'star-eye-right',eye:{x:11,y:-4},width:2.3},
  {id:'sparkle',curve:curve([[66,-44,64,-38,63,-33,61,-29],[61,-29,66,-30,70,-30,75,-29],[75,-29,70,-26,67,-22,65,-17],[65,-17,65,-23,63,-26,61,-29]]),width:2.5},
 ],
};

const foldedLeft=curve([[-42,-4,-40,-18,-35,-35,-27,-29],[-27,-29,-18,-22,-12,-13,-16,-9],[-16,-9,-20,-5,-31,-15,-32,-22]]);


// ---------- Canvas 绘制 ----------
function samplePathD(d, n = 36) {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+/g) || [];
  const out = [];
  let i = 0, x = 0, y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op === 'M' || op === 'L') { x = num(); y = num(); out.push({ x, y }); }
    else if (op === 'Z') break;
    else if (op === 'C') {
      const p1 = { x: num(), y: num() }, p2 = { x: num(), y: num() }, p3 = { x: num(), y: num() };
      sampleCubic({ x, y }, p1, p2, p3, n).slice(1).forEach((p) => out.push(p));
      x = p3.x; y = p3.y;
    } else if (op === 'Q') {
      const q1 = { x: num(), y: num() }, q2 = { x: num(), y: num() };
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        out.push({ x: u*u*x + 2*u*t*q1.x + t*t*q2.x, y: u*u*y + 2*u*t*q1.y + t*t*q2.y });
      }
      x = q2.x; y = q2.y;
    } else break;
  }
  return out;
}

function pressureFill(ctx, pts, progress, width, profile = 'brush') {
  if (progress <= 0 || pts.length < 2) return;
  let total = 0;
  const lengths = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) total += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    lengths.push(total);
  }
  const target = total * progress;
  const kept = [];
  for (let i = 0; i < pts.length; i++) { if (lengths[i] <= target) kept.push(pts[i]); }
  if (kept.length < pts.length) {
    for (let i = 1; i < pts.length; i++) {
      if (lengths[i] > target) {
        const a = pts[i-1], b = pts[i];
        const k = (lengths[i] - lengths[i-1]) ? (target - lengths[i-1]) / (lengths[i] - lengths[i-1]) : 0;
        kept.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        break;
      }
    }
  }
  const m = kept.length;
  if (m < 2) return;
  const L = [], R = [];
  for (let i = 0; i < m; i++) {
    const a = kept[Math.max(0, i-1)], b = kept[Math.min(m-1, i+1)];
    const dd = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = total > 0 ? lengths[Math.min(i, lengths.length - 1)] / total : 0;
    const w = width * 0.5 * (profile === 'taper'
      ? Math.max(0.025, Math.pow(1 - u, 0.7))
      : (0.28 + 0.72 * Math.pow(Math.sin(Math.PI * u), 0.7)));
    L.push([kept[i].x - (b.y - a.y) / dd * w, kept[i].y + (b.x - a.x) / dd * w]);
    R.push([kept[i].x + (b.y - a.y) / dd * w, kept[i].y - (b.x - a.x) / dd * w]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < m; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = m-1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** 画装饰：逐笔推进 + 眨眼(lid) / 折耳(ear) */
export function drawDecoration(ctx, id, time, phaseStart, phaseEnd, x, y, radius, lid, ear, color) {
  const paths = decorationPaths[id];
  if (!paths || time < phaseStart) return;
  const slot = (phaseEnd - phaseStart) / Math.max(1, paths.length);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radius / 50, radius / 50);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const progress = between(time, phaseStart + i * slot, phaseStart + (i + 1) * slot);
    if (progress <= 0) continue;
    if (p.eye) {
      const ry = p.width * 0.72 * Math.max(0.12, (p.id === 'right-eye' ? 1 - lid : 1)) * progress;
      ctx.beginPath();
      ctx.ellipse(p.eye.x, p.eye.y, p.width / 2, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (p.curve) {
      let c = p.curve;
      if (p.id === 'left-ear' && ear !== 0) {
        c = { ...p.curve, points: p.curve.points.map((v) => {
          const q = pointAt(foldedLeft, v.length / p.curve.length);
          return { ...v, x: v.x + (q.x - v.x) * ear, y: v.y + (q.y - v.y) * ear };
        }) };
      }
      pressureFill(ctx, c.points, progress, p.width, p.profile);
      continue;
    }
    const pts = samplePathD(p.d || '');
    if (pts.length < 2) continue;
    let total = 0;
    const acc = [0];
    for (let k = 1; k < pts.length; k++) { total += Math.hypot(pts[k].x - pts[k-1].x, pts[k].y - pts[k-1].y); acc.push(total); }
    const target = total * progress;
    ctx.lineWidth = p.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) {
      if (acc[k] > target) {
        const a = pts[k-1], b = pts[k];
        const kk = (acc[k] - acc[k-1]) ? (target - acc[k-1]) / (acc[k] - acc[k-1]) : 0;
        ctx.lineTo(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk);
        break;
      }
      ctx.lineTo(pts[k].x, pts[k].y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export { curve, foldedLeft };
