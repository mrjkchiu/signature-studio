import * as R from './renderer.js';
import { DECOS, DECO_POSITIONS, DECO_SIZES, SEALS, decorTail } from './decor.js';

// ---------- 状态 ----------
const state = {
  text: '张三',
  fontId: 'msz',
  paletteId: 'ink',
  backdropId: 'paper',
  fx: new Set(['write', 'enter']),
  duration: 0, // 0 = 自动
  theme: 'dark',
  couple: false,
  text2: '',
  deco: 'none',
  decoSize: 'm',
  decoPos: 'tr',
  seal: 'none',
  sealText: '签名',
  date: false,
  underline: false,
};

const SkeletonData = new Map();   // 字 → 笔顺数据
const warmed = new Set();         // 已算过骨架的 (字体|文本)
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

let scene = null;
let env = null;
let painter = null;
let particles = R.createParticleSystem();
let W = 0, H = 0;
let t0 = 0;
let fpsFrames = 0, fpsLast = 0, fps = 0;
let rebuildTimer = 0;
let buildToken = 0;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const cv = $('cv');
const ctx = cv.getContext('2d');
const glyphCanvas = document.createElement('canvas');
const maskCanvas = document.createElement('canvas');
const tempCanvas = document.createElement('canvas');

const fontOf = (id) => R.FONTS.find((f) => f.id === id) || R.FONTS[0];
const paletteOf = (id) => R.PALETTES.find((p) => p.id === id) || R.PALETTES[0];
const fontStackOf = (f) => `"${f.css}"`;
const getCharData = (ch) => SkeletonData.get(ch) || null;

// ---------- 字体 / 笔顺数据（按需加载） ----------
// 10 套字体共 70MB+，全部预载会拖慢首屏；改成"用到哪套载哪套"
const loadedFonts = new Set();

async function ensureFont(font) {
  if (loadedFonts.has(font.id)) return true;
  $('loading').hidden = false;
  $('loading').textContent = `正在加载字体「${font.label}」…`;
  try {
    const face = new FontFace(font.css, `url(${font.file})`);
    await face.load();
    document.fonts.add(face);
    loadedFonts.add(font.id);
    return true;
  } catch (e) {
    console.warn('[font] 加载失败', font.id, e);
    return false;
  }
}

async function ensureChar(ch) {
  if (SkeletonData.has(ch)) return;
  try {
    const res = await fetch(`data/strokes/${encodeURIComponent(ch)}.json`);
    if (!res.ok) throw new Error(res.status);
    SkeletonData.set(ch, await res.json());
  } catch (e) {
    SkeletonData.set(ch, null); // 记录缺字，避免重复请求
  }
}

function setBusy(on, text) {
  const el = $('busy');
  if (on) { el.hidden = false; el.textContent = text || '计算中…'; }
  else el.hidden = true;
}

// ---------- 画布尺寸 ----------
function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(240, Math.round(Math.min(rect.width, rect.height || rect.width) * dpr));
  if (px === W) return false;
  W = H = px;
  cv.width = W; cv.height = H;
  for (const c of [glyphCanvas, maskCanvas, tempCanvas]) { c.width = W; c.height = H; }
  return true;
}

// ---------- 重建场景 ----------
async function rebuild() {
  if (!W || !state.text) return;
  const token = ++buildToken;
  const font = fontOf(state.fontId);
  const palette = paletteOf(state.paletteId);
  const fontStack = fontStackOf(font);
  const isCouple = state.couple && !!state.text2;
  const text = isCouple ? state.text + state.text2 : state.text;
  const coupleSplit = isCouple ? [...state.text].length : 0;
  const decorOn = state.deco !== 'none' || state.seal !== 'none' || state.date || state.underline || isCouple;
  const decorTailAdd = decorOn ? decorTail() : 0;

  const okFont = await ensureFont(font);
  if (token !== buildToken) return;
  if (okFont) $('loading').hidden = true;

  await Promise.all([...text].map(ensureChar));
  if (token !== buildToken) return;

  const warmKey = `${fontStack}|${text}`;
  if (!warmed.has(warmKey)) {
    setBusy(true, '逐笔分析中…');
    await new Promise((r) => requestAnimationFrame(() => r()));
    await R.prewarmSkeletons({
      makeCanvas, text, fontStack, getCharData,
      onProgress: (p) => setBusy(true, `逐笔分析中 ${Math.round(p * 100)}%`),
    });
    warmed.add(warmKey);
    setBusy(false);
    if (token !== buildToken) return;
  }

  const measureCtx = glyphCanvas.getContext('2d');
  scene = R.buildScene({
    ctx: measureCtx, text, fontStack, W, H, font,
    getCharData, makeCanvas,
    duration: state.duration || 0,
    coupleSplit, decorTailAdd,
  });
  R.renderGlyphLayer(glyphCanvas, scene, palette);

  painter = R.createMaskPainter(maskCanvas.getContext('2d'), scene, W, H);
  painter.reset();
  particles = R.createParticleSystem();

  env = {
    ctx, scene, glyphCanvas, maskCanvas, tempCanvas, makeCanvas,
    painter, particles, palette,
    backdropId: state.backdropId,
    decor: {
      couple: isCouple,
      deco: state.deco,
      decoSize: state.decoSize,
      decoPos: state.decoPos,
      seal: state.seal,
      sealText: state.sealText,
      date: state.date,
      underline: state.underline,
    },
    params: {
      enter: state.fx.has('enter'),
      shine: state.fx.has('shine'),
      neon: state.fx.has('neon'),
      trail: state.fx.has('trail'),
      particle: state.fx.has('particle'),
    },
  };
  t0 = performance.now();
  updateHUD();
}

function replay() {
  if (!scene) return;
  painter.reset();
  particles = R.createParticleSystem();
  env.particles = particles;
  t0 = performance.now();
}

// ---------- 主循环 ----------
function loop(now) {
  if (!env) { requestAnimationFrame(loop); return; }
  const t = now - t0;
  R.renderFrame(env, t);
  $('bar').style.width = (R.globalProgress(scene, t) * 100).toFixed(1) + '%';
  fpsFrames++;
  if (now - fpsLast > 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
    fpsFrames = 0; fpsLast = now;
    $('hud').textContent = `${fps} fps`;
  }
  requestAnimationFrame(loop);
}

function updateHUD() {
  const n = [...(state.text || '')].filter((c) => c.trim()).length;
  const auto = R.autoDuration(n);
  const dur = state.duration || auto;
  $('durHint').textContent = state.duration
    ? `自定义 ${(dur / 1000).toFixed(1)}s（自动值 ${(auto / 1000).toFixed(1)}s）`
    : `自动 = 700 + 650 × ${n} = ${auto}ms`;
  $('note').innerHTML =
    `${scene ? scene.strokes.length : 0} 个骨架子笔画 · 时长 ${(dur / 1000).toFixed(2)}s · 字形 ${fontOf(state.fontId).label}<br/>` +
    `揭示形状来自艺术字体自身骨架（覆盖率 ≈95%），笔画顺序由楷书笔顺数据驱动。`;
  if (scene && scene.missing.length) {
    $('missing').hidden = false;
    $('missing').textContent = `「${[...new Set(scene.missing)].join('')}」缺笔顺数据，已用渐显替代`;
  } else {
    $('missing').hidden = true;
  }
}

// ---------- 控件 ----------
function chip(label, on, onClick) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.on = on ? '1' : '0';
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

function buildChips() {
  const fc = $('fontChips');
  fc.innerHTML = '';
  for (const f of R.FONTS) {
    const b = chip(`${f.label}<span class="sub">${f.inh}</span>`, state.fontId === f.id, () => {
      state.fontId = f.id; buildChips(); rebuild();
    });
    b.style.fontFamily = `"${f.css}"`;
    b.style.fontSize = '16px';
    fc.appendChild(b);
  }

  const pc = $('palChips');
  pc.innerHTML = '';
  for (const p of R.PALETTES) {
    const sw = `background:linear-gradient(135deg,${p.stops.join(',')});`;
    pc.appendChild(chip(`<i class="sw" style="${sw}"></i>${p.label}`, state.paletteId === p.id, () => {
      state.paletteId = p.id; buildChips(); rebuild();
    }));
  }

  const bc = $('bgChips');
  bc.innerHTML = '';
  for (const bd of R.BACKDROPS) {
    bc.appendChild(chip(bd.label, state.backdropId === bd.id, () => {
      state.backdropId = bd.id; buildChips(); rebuild();
    }));
  }

  const xc = $('fxChips');
  xc.innerHTML = '';
  for (const fx of R.EFFECTS) {
    const on = fx.lock || state.fx.has(fx.id);
    xc.appendChild(chip(fx.label + (fx.lock ? '<span class="sub">必开</span>' : ''), on, () => {
      if (fx.lock) return;
      if (state.fx.has(fx.id)) state.fx.delete(fx.id); else state.fx.add(fx.id);
      buildChips();
      if (env) {
        env.params.enter = state.fx.has('enter');
        env.params.shine = state.fx.has('shine');
        env.params.neon = state.fx.has('neon');
        env.params.trail = state.fx.has('trail');
        env.params.particle = state.fx.has('particle');
      }
    }));
  }

  const mc = $('modeChips');
  if (mc) {
    mc.innerHTML = '';
    mc.appendChild(chip('单人', !state.couple, () => { state.couple = false; buildChips(); rebuild(); }));
    mc.appendChild(chip('情侣', state.couple, () => { state.couple = true; if (!state.text2) state.text2 = '李四'; buildChips(); rebuild(); }));
    const n2 = $('name2');
    if (n2) { n2.hidden = !state.couple; if (!n2.value) n2.value = state.text2 || '李四'; }
  }

  const dc2 = $('decoChips');
  if (dc2) {
    dc2.innerHTML = '';
    for (const d of DECOS) {
      dc2.appendChild(chip(d.label, state.deco === d.id, () => { state.deco = d.id; buildChips(); rebuild(); }));
    }
  }
  const dopt = $('decoOptChips');
  if (dopt) {
    dopt.innerHTML = '';
    for (const o of DECO_SIZES) dopt.appendChild(chip('大小' + o.label, state.decoSize === o.id, () => { state.decoSize = o.id; buildChips(); rebuild(); }));
    for (const o of DECO_POSITIONS) dopt.appendChild(chip('位置' + o.label, state.decoPos === o.id, () => { state.decoPos = o.id; buildChips(); rebuild(); }));
  }
  const sc = $('stampChips');
  if (sc) {
    sc.innerHTML = '';
    for (const o of SEALS) sc.appendChild(chip(o.label, state.seal === o.id, () => { state.seal = o.id; buildChips(); rebuild(); }));
    sc.appendChild(chip('落款日期', state.date, () => { state.date = !state.date; buildChips(); rebuild(); }));
    const si = $('sealText');
    if (si) { si.hidden = state.seal === 'none'; if (!si.value) si.value = state.sealText; }
  }
  const lc = $('lineChips');
  if (lc) {
    lc.innerHTML = '';
    lc.appendChild(chip('下划线', state.underline, () => { state.underline = !state.underline; buildChips(); rebuild(); }));
  }

  const dc = $('durChips');
  dc.innerHTML = '';
  for (const o of [{ v: 0, l: '自动' }, { v: 1500, l: '1.5s 快' }, { v: 3000, l: '3.0s 慢' }, { v: 4500, l: '4.5s 更慢' }]) {
    dc.appendChild(chip(o.l, state.duration === o.v, () => {
      state.duration = o.v; buildChips(); rebuild();
    }));
  }
}

function setupTheme() {
  const apply = () => {
    document.documentElement.dataset.theme = state.theme;
    $('themeBtn').textContent = state.theme === 'dark' ? '☾' : '☀';
  };
  $('themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    apply();
  });
  apply();
}

// ---------- 导出 ----------
function makeExportEnv(background) {
  const size = 1080;
  const mk = () => makeCanvas(size, size);
  const c = mk(), g = mk(), m = mk(), tmp = mk();
  const font = fontOf(state.fontId);
  const palette = paletteOf(state.paletteId);
  const isCouple = state.couple && !!state.text2;
  const exportText = isCouple ? state.text + state.text2 : (state.text || '　');
  const decorOn = state.deco !== 'none' || state.seal !== 'none' || state.date || state.underline || isCouple;
  const s = R.buildScene({
    ctx: g.getContext('2d'), text: exportText,
    fontStack: fontStackOf(font), W: size, H: size, font,
    getCharData, makeCanvas, duration: state.duration || 0,
    coupleSplit: isCouple ? [...state.text].length : 0,
    decorTailAdd: decorOn ? decorTail() : 0,
  });
  R.renderGlyphLayer(g, s, palette);
  const p = R.createMaskPainter(m.getContext('2d'), s, size, size, { makeCanvas });
  p.reset();
  return {
    ctx: c.getContext('2d'), scene: s, glyphCanvas: g, maskCanvas: m, tempCanvas: tmp, makeCanvas,
    painter: p, particles: R.createParticleSystem(), palette, backdropId: background,
    decor: {
      couple: isCouple, deco: state.deco, decoSize: state.decoSize, decoPos: state.decoPos,
      seal: state.seal, sealText: state.sealText, date: state.date, underline: state.underline,
    },
    params: { enter: false, shine: state.fx.has('shine'), neon: state.fx.has('neon'), trail: state.fx.has('trail'), particle: false },
  };
}

function exportPNG(transparent) {
  try {
    const e = makeExportEnv(transparent ? 'none' : state.backdropId);
    R.renderFrame(e, e.scene.duration + 200);
    e.ctx.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `签名_${state.text || 'untitled'}${transparent ? '_透明' : ''}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  } catch (err) {
    console.error(err);
    alert('导出失败：' + err.message);
  }
}

// ---------- 启动 ----------
async function main() {
  setupTheme();
  resize();
  buildChips();
  await rebuild();
  $('loading').hidden = true;

  $('playBtn').addEventListener('click', replay);
  $('pngBtn').addEventListener('click', () => exportPNG(false));
  $('pngTBtn').addEventListener('click', () => exportPNG(true));

  const nameInput = $('name');
  nameInput.value = state.text;
  const onName = () => {
    const v = [...nameInput.value.replace(/\s/g, '')].slice(0, 8).join('');
    if (v === state.text) return;
    state.text = v;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 350);
  };
  nameInput.addEventListener('input', onName);
  nameInput.addEventListener('compositionend', onName);

  const name2 = $('name2');
  if (name2) {
    name2.addEventListener('input', () => {
      const v = [...name2.value.replace(/\s/g, '')].slice(0, 4).join('');
      if (v === state.text2) return;
      state.text2 = v;
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 350);
    });
  }
  const sealInput = $('sealText');
  if (sealInput) {
    sealInput.addEventListener('input', () => {
      state.sealText = [...sealInput.value.replace(/\s/g, '')].slice(0, 2).join('') || '签名';
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 350);
    });
  }

  let rt = 0;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (resize()) rebuild(); }, 150);
  }).observe(stage);

  loop(performance.now());
}

main();
