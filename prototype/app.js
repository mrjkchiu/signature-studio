import * as R from './renderer.js';
import * as PORT from './port/engine.js';
import { DECOS, DECO_SIZES, SEALS, decorTail, decoAnchor } from './decor.js';
import { exportGif, exportMp4Native, saveBytesNative, hasNativeVideo } from './exporter.js';

// ---------------- 状态 ----------------
const state = {
  tab: 'cn',
  // 中文引擎
  text: '张三', text2: '', couple: false,
  fontId: 'msz', paletteId: 'ink', backdropId: 'paper',
  fx: new Set(['write', 'enter']),
  duration: 0, theme: 'dark',
  deco: 'none', decoSize: 'm', decoPos: 'tr',
  seal: 'none', sealText: '签名', date: false, underline: false,
  comet: false, outro: false,
  custom: null,
  decoXY: { x: 0.80, y: 0.24 },
  // 移植版引擎
  port: {
    text: 'JKChiu', aspect: '16:9', couple: false, coupleName: '', coupleInk: '#FF8EC7',
    fontSize: 240, penWidth: 1, pressure: 1, initialScale: 1.3, terminalLength: 1,
    ink: '#F5FFFD', glowOn: true, glowColor: '#59E6D7',
    deco: 'sun', decoScale: 1, midDeco: 'heart', decoB: 'none', wink: true, earFold: true,
    underline: true, comet: true, duration: 5,
    bg: '#0B0B12', transparent: false,
  },
};

const SkeletonData = new Map();
const warmed = new Set();
const loadedFonts = new Set();
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

let scene = null, env = null, painter = null, particles = R.createParticleSystem();
let portScene = null;
let W = 0, H = 0, t0 = 0, fpsFrames = 0, fpsLast = 0, fps = 0, buildToken = 0, buildTimer = 0, frameNo = 0;

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

function hsl(h, s, l) { return `hsl(${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`; }
function activePalette() {
  const c = state.custom;
  if (!c) return paletteOf(state.paletteId);
  return {
    id: 'custom', label: '自定义',
    stops: [hsl(c.h, c.s, c.l), hsl((c.h + 26) % 360, Math.max(25, c.s - 12), Math.max(8, c.l - 26))],
    glow: hsl(c.h, Math.max(40, c.s), Math.max(18, c.l - 6)),
    glowR: 14,
  };
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.dataset.show = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.dataset.show = '0'; }, 2200);
}
function setBusy(on, text) {
  const el = $('busy');
  if (on) { el.hidden = false; el.textContent = text || '计算中…'; } else el.hidden = true;
}

// ---------------- 字体 / 笔顺 ----------------
async function ensureFont(font) {
  if (loadedFonts.has(font.id)) return true;
  try {
    const face = new FontFace(font.css, `url(${font.file})`);
    await face.load();
    document.fonts.add(face);
    loadedFonts.add(font.id);
    return true;
  } catch (e) { return false; }
}
async function ensureChar(ch) {
  if (SkeletonData.has(ch)) return;
  try {
    const res = await fetch(`data/strokes/${encodeURIComponent(ch)}.json`);
    if (!res.ok) throw new Error(res.status);
    SkeletonData.set(ch, await res.json());
  } catch (e) { SkeletonData.set(ch, null); }
}

// ---------------- 调色滑块 ----------------
function syncColorSliders() {
  const c = state.custom || { h: 210, s: 70, l: 70 };
  $('gifCnBtn').addEventListener('click', () => doExportGif('cn'));
  $('vidCnBtn').addEventListener('click', () => doExportVideo('cn'));
  $('gifPortBtn').addEventListener('click', () => doExportGif('port'));
  $('vidPortBtn').addEventListener('click', () => doExportVideo('port'));

  for (const [id, key] of [['hue', 'h'], ['sat', 's'], ['lum', 'l']]) {
    const el = $(id), out = $(id + 'Val');
    if (!el) continue;
    el.value = c[key];
    if (out) out.textContent = c[key];
  }
  paintColorPreview();
}
function paintColorPreview() {
  const el = $('colorPreview');
  if (!el) return;
  const p = activePalette();
  el.innerHTML = '';
  const sw = `background:linear-gradient(135deg,${p.stops.join(',')});`;
  el.appendChild(chip(`<i class="sw" style="${sw}"></i>当前色`, true, () => {}));
  el.appendChild(chip('恢复预设', false, () => {
    state.custom = null; syncColorSliders(); buildCnChips(); restyle();
  }));
}

// ---------------- 确认弹窗 ----------------
function confirmDialog(msg, okText = '确认') {
  return new Promise((resolve) => {
    const m = $('modal');
    $('modalMsg').textContent = msg;
    $('modalOk').textContent = okText;
    m.hidden = false;
    const done = (v) => {
      m.hidden = true;
      $('modalOk').onclick = null; $('modalCancel').onclick = null;
      resolve(v);
    };
    $('modalOk').onclick = () => done(true);
    $('modalCancel').onclick = () => done(false);
  });
}

// ---------------- 尺寸 ----------------
function currentAspect() {
  if (state.tab === 'cn') return 1;
  const a = state.port.aspect;
  if (a === '9:16') return 9 / 16;
  if (a === '1:1') return 1;
  return 16 / 9;
}
function applyStageSize() {
  const wrapW = Math.min(stage.parentElement.clientWidth || 360, 620);
  const ar = currentAspect();
  const maxH = Math.max(220, Math.round(window.innerHeight * 0.44));
  let h = wrapW / ar;
  if (h > maxH) h = maxH;
  stage.style.aspectRatio = String(ar);
  stage.style.height = Math.round(h) + 'px';
}
function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.min(1000, Math.max(240, Math.round(rect.width * dpr)));
  const h = Math.min(1000, Math.max(140, Math.round(rect.height * dpr)));
  if (w === W && h === H) return false;
  W = w; H = h;
  cv.width = W; cv.height = H;
  for (const c of [glyphCanvas, maskCanvas, tempCanvas]) { c.width = W; c.height = H; }
  return true;
}

// ---------------- 中文引擎 ----------------
/** 只更新装饰层，不重播书写动画 */
function updateDecor() {
  if (!env || !scene) { rebuildCn(); return; }
  env.decor = decorCfg();
  renderNow();
}

function decorCfg() {
  const isCouple = state.couple && !!state.text2;
  return {
    couple: isCouple, deco: state.deco, decoSize: state.decoSize, decoPos: state.decoPos,
    seal: state.seal, sealText: state.sealText, date: state.date, underline: state.underline,
    decoXY: state.decoXY,
  };
}
function restyle() {
  if (!env || !scene) { rebuildCn(); return; }
  const palette = activePalette();
  env.palette = palette;
  env.backdropId = state.backdropId;
  env.decor = decorCfg();
  env.params.enter = state.fx.has('enter');
  env.params.shine = state.fx.has('shine');
  env.params.neon = state.fx.has('neon');
  env.params.trail = state.fx.has('trail');
  env.params.particle = state.fx.has('particle');
  env.params.comet = state.comet;
  env.params.outro = state.outro;
  env._chips = null;
  R.renderGlyphLayer(glyphCanvas, scene, palette);
}

async function rebuildCn() {
  if (!W) return;
  const token = ++buildToken;
  const font = fontOf(state.fontId);
  const palette = activePalette();
  const fontStack = fontStackOf(font);
  const isCouple = state.couple && !!state.text2;
  const text = isCouple ? state.text + state.text2 : state.text;
  const coupleSplit = isCouple ? [...state.text].length : 0;
  const decorOn = state.deco !== 'none' || state.seal !== 'none' || state.date || state.underline || isCouple;
  const decorTailAdd = decorOn ? decorTail() : 0;

  const ok = await ensureFont(font);
  if (!ok) toast('字体加载失败');
  await Promise.all([...text].map(ensureChar));
  if (token !== buildToken) return;

  const warmKey = `${fontStack}|${text}`;
  if (!warmed.has(warmKey)) {
    setBusy(true, '逐笔分析中…');
    await new Promise((r) => requestAnimationFrame(() => r()));
    await R.prewarmSkeletons({ makeCanvas, text, fontStack, getCharData,
      onProgress: (p) => setBusy(true, `逐笔分析中 ${Math.round(p * 100)}%`) });
    warmed.add(warmKey);
    setBusy(false);
    if (token !== buildToken) return;
  }

  scene = R.buildScene({
    ctx: glyphCanvas.getContext('2d'), text, fontStack, W, H, font, getCharData, makeCanvas,
    duration: state.duration || 0, coupleSplit, decorTailAdd,
    comet: state.comet, outro: state.outro,
  });
  R.renderGlyphLayer(glyphCanvas, scene, palette);
  painter = R.createMaskPainter(maskCanvas.getContext('2d'), scene, W, H, { makeCanvas });
  painter.reset();
  particles = R.createParticleSystem();
  env = {
    ctx, scene, glyphCanvas, maskCanvas, tempCanvas, makeCanvas,
    painter, particles, palette, backdropId: state.backdropId, decor: decorCfg(),
    params: {
      enter: state.fx.has('enter'), shine: state.fx.has('shine'), neon: state.fx.has('neon'),
      trail: state.fx.has('trail'), particle: state.fx.has('particle'),
      comet: state.comet, outro: state.outro,
    },
  };
  t0 = performance.now();
  updateHud();
}

// ---------------- 移植版引擎 ----------------
function portCfg() {
  const p = state.port;
  return {
    ...PORT.PORT_DEFAULTS,
    text: (p.text || '').trim() || 'JKChiu',
    couple: p.couple && !!(p.coupleName || '').trim(),
    coupleName: (p.coupleName || '').trim(),
    coupleInk: p.coupleInk || '#FF8EC7',
    coupleGap: 0.55,
    font: {
      size: p.fontSize, penWidth: p.penWidth, pressure: p.pressure,
      initialScale: p.initialScale, initialOffsetX: 0, initialOffsetY: 0, terminalLength: p.terminalLength,
    },
    ink: p.ink,
    glow: { on: p.glowOn, color: p.glowColor, strength: 0.65, radius: 18 },
    decoration: { id: p.deco, scale: p.decoScale, offsetX: 0, offsetY: 0, action: p.wink ? 'wink' : 'none', earFold: p.earFold },
    middleDeco: { id: p.midDeco !== 'none' ? p.midDeco : 'none', scale: p.decoScale },
    decoB: { id: p.decoB !== 'none' ? p.decoB : 'none', scale: p.decoScale },
    underline: { on: p.underline, lift: true },
    comet: { on: p.comet, color: p.glowColor, size: 1.6 },
    timing: { mode: 'duration', duration: p.duration },
    background: { mode: p.transparent ? 'transparent' : 'solid', color: p.bg },
  };
}
function rebuildPort() {
  if (!W) return;
  portScene = PORT.buildPortScene(portCfg(), W, H);
  t0 = performance.now();
  updateHud();
}

// ---------------- 装饰拖动 ----------------
let dragDeco = false;
let dragging = false;
function canvasPoint(e) {
  const rect = cv.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / Math.max(rect.width, 1)) * W,
    y: ((e.clientY - rect.top) / Math.max(rect.height, 1)) * H,
  };
}
function setupDecoDrag() {
  const onMove = (e) => {
    if (!dragDeco || !env || !scene) return;
    const p = canvasPoint(e);
    state.decoXY = {
      x: Math.min(0.96, Math.max(0.04, p.x / W)),
      y: Math.min(0.96, Math.max(0.04, p.y / H)),
    };
    env.decor = { ...env.decor, decoXY: state.decoXY };
    renderNow();               // 拖动过程中立即重绘
    e.preventDefault();
  };
  const onUp = () => {
    dragDeco = false; dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  cv.addEventListener('pointerdown', (e) => {
    if (state.tab !== 'cn' || !env || !scene || state.deco === 'none') return;
    const p = canvasPoint(e);
    const a = decoAnchor(scene, env.decor);
    const hit = Math.max(a.base * 1.25, Math.min(W, H) * 0.10);
    if (Math.hypot(p.x - a.x, p.y - a.y) > hit) return;
    dragDeco = true; dragging = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    // 监听 window：手机上手指出画布也不会中断拖动
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
  });
}

// ---------------- 主循环 ----------------
function loop(now) {
  frameNo++;
  if (state.tab === 'port') {
    if (!portScene) { requestAnimationFrame(loop); return; }
    const t = Math.min((now - t0) / 1000, portScene.total + 0.6);
    PORT.renderPortFrame(ctx, portScene, t);
    $('bar').style.width = (PORT.portProgress(portScene, t) * 100).toFixed(1) + '%';
  } else {
    if (!env) { requestAnimationFrame(loop); return; }
    const t = now - t0;
    R.renderFrame(env, t);
    $('bar').style.width = (R.globalProgress(scene, t) * 100).toFixed(1) + '%';
  }
  fpsFrames++;
  if (now - fpsLast > 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
    fpsFrames = 0; fpsLast = now;
    $('hud').textContent = `${fps} fps`;
  }
  requestAnimationFrame(loop);
}

function updateHud() {
  if (state.tab === 'port') {
    $('hud').textContent = `${fps || '—'} fps`;
    return;
  }
  const n = [...(state.text || '')].filter((c) => c.trim()).length;
  const auto = R.autoDuration(n);
  const dur = state.duration || auto;
  $('durHint').textContent = state.duration
    ? `自定义 ${(dur / 1000).toFixed(1)}s（自动值 ${(auto / 1000).toFixed(1)}s）`
    : `自动 = 700 + 650 × ${n} = ${auto}ms`;
  $('note').innerHTML =
    `${scene ? scene.strokes.length : 0} 个骨架子笔画 · 时长 ${(dur / 1000).toFixed(2)}s · 字形 ${fontOf(state.fontId).label}<br/>` +
    `揭示形状来自艺术字体自身骨架，笔顺由楷书数据驱动。`;
  if (scene && scene.missing.length) {
    $('missing').hidden = false;
    $('missing').textContent = `「${[...new Set(scene.missing)].join('')}」缺笔顺数据，已用渐显替代`;
  } else $('missing').hidden = true;
}

// ---------------- 控件工具 ----------------
function chip(label, on, onClick) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.on = on ? '1' : '0';
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

// ---------------- 中文控件 ----------------
function buildCnChips() {
  const mc = $('modeChips');
  mc.innerHTML = '';
  mc.appendChild(chip('单人', !state.couple, () => { state.couple = false; buildCnChips(); rebuildCn(); }));
  mc.appendChild(chip('情侣', state.couple, () => {
    state.couple = true; if (!state.text2) state.text2 = '李四'; buildCnChips(); rebuildCn();
  }));
  $('name2').hidden = !state.couple;

  const fc = $('fontChips'); fc.innerHTML = '';
  for (const f of R.FONTS) {
    const b = chip(`${f.label}<span class="sub">${f.inh}</span>`, state.fontId === f.id, () => {
      state.fontId = f.id; buildCnChips(); rebuildCn();
    });
    b.style.fontFamily = `"${f.css}"`; b.style.fontSize = '15px';
    fc.appendChild(b);
  }

  const pc = $('palChips'); pc.innerHTML = '';
  for (const p of R.PALETTES) {
    const sw = `background:linear-gradient(135deg,${p.stops.join(',')});`;
    pc.appendChild(chip(`<i class="sw" style="${sw}"></i>${p.label}`, !state.custom && state.paletteId === p.id, () => {
      state.paletteId = p.id; state.custom = null; syncColorSliders(); buildCnChips(); restyle();
    }));
  }

  const bc = $('bgChips'); bc.innerHTML = '';
  for (const bd of R.BACKDROPS) bc.appendChild(chip(bd.label, state.backdropId === bd.id, () => {
    state.backdropId = bd.id; buildCnChips(); restyle();
  }));

  const xc = $('fxChips'); xc.innerHTML = '';
  for (const fx of R.EFFECTS) {
    const on = fx.lock || state.fx.has(fx.id);
    xc.appendChild(chip(fx.label + (fx.lock ? '<span class="sub">必开</span>' : ''), on, () => {
      if (fx.lock) return;
      if (state.fx.has(fx.id)) state.fx.delete(fx.id); else state.fx.add(fx.id);
      buildCnChips(); restyle();
    }));
  }

  const dc = $('decoChips'); dc.innerHTML = '';
  for (const d of DECOS) dc.appendChild(chip(d.label, state.deco === d.id, () => {
    state.deco = d.id; buildCnChips(); updateDecor();
  }));

  const dos = $('decoSizeChips'); dos.innerHTML = '';
  for (const o of DECO_SIZES) dos.appendChild(chip(o.label, state.decoSize === o.id, () => {
    state.decoSize = o.id; buildCnChips(); updateDecor();
  }));

  const sc = $('stampChips'); sc.innerHTML = '';
  for (const o of SEALS) sc.appendChild(chip(o.label, state.seal === o.id, () => { state.seal = o.id; buildCnChips(); updateDecor(); }));
  sc.appendChild(chip('落款日期', state.date, () => { state.date = !state.date; buildCnChips(); updateDecor(); }));

  const lc = $('lineChips'); lc.innerHTML = '';
  lc.appendChild(chip('下划线', state.underline, () => { state.underline = !state.underline; buildCnChips(); updateDecor(); }));

  const durc = $('durChips'); durc.innerHTML = '';
  for (const o of [{ v: 0, l: '自动' }, { v: 1500, l: '1.5s' }, { v: 3000, l: '3.0s' }, { v: 4500, l: '4.5s' }]) {
    durc.appendChild(chip(o.l, state.duration === o.v, () => { state.duration = o.v; buildCnChips(); rebuildCn(); }));
  }
}

// ---------------- 移植版控件 ----------------
function buildPortChips() {
  const p = state.port;
  const rep = (id, items, cur, fn) => {
    const el = $(id); el.innerHTML = '';
    for (const it of items) el.appendChild(chip(it.label, cur === it.v, () => { fn(it.v); buildPortChips(); rebuildPort(); }));
  };
  const pm = $('portMode');
  if (pm) {
    pm.innerHTML = '';
    pm.appendChild(chip('单人', !p.couple, () => { p.couple = false; buildPortChips(); rebuildPort(); }));
    pm.appendChild(chip('情侣', p.couple, () => {
      p.couple = true; buildPortChips(); rebuildPort();
      if (!(p.coupleName || '').trim()) toast('情侣模式：请在上方第二个输入框填写名字');
    }));
    const n2 = $('portName2');
    if (n2) { n2.value = p.couple ? (p.coupleName || '') : (p.coupleName || ''); }
  }
  const mh = $('portModeHint');
  if (mh) {
    if (p.couple && !(p.coupleName || '').trim()) {
      mh.textContent = '⚠️ 请在上方第二个输入框填写名字，否则只显示单人签名';
      mh.style.color = 'var(--accent)';
    } else {
      mh.textContent = '情侣模式：两个名字左右排列、同步书写，中间可加装饰';
      mh.style.color = '';
    }
  }
  const pi2 = $('portInk2');
  if (pi2) {
    pi2.innerHTML = '';
    for (const [c, l] of [['#FF8EC7', '粉'], ['#6EE7F5', '青'], ['#F4D58D', '金'], ['#F5FFFD', '白']]) {
      pi2.appendChild(chip(`<i class="sw" style="background:${c}"></i>${l}`, p.coupleInk === c, () => {
        p.coupleInk = c; buildPortChips(); rebuildPort();
      }));
    }
  }

  rep('portAspect', [
    { v: '16:9', label: '横 16:9' }, { v: '9:16', label: '竖 9:16' }, { v: '1:1', label: '方 1:1' },
  ], p.aspect, (v) => { p.aspect = v; applyStageSize(); resize(); });
  rep('portSize', [
    { v: 180, label: '小' }, { v: 240, label: '中' }, { v: 300, label: '大' },
  ], p.fontSize, (v) => { p.fontSize = v; });
  rep('portPen', [
    { v: 0.7, label: '细' }, { v: 1, label: '中' }, { v: 1.4, label: '粗' },
  ], p.penWidth, (v) => { p.penWidth = v; });
  rep('portPressure', [
    { v: 0.2, label: '低' }, { v: 0.55, label: '中' }, { v: 1, label: '高' },
  ], p.pressure, (v) => { p.pressure = v; });
  rep('portInitial', [
    { v: 1.0, label: '1.0×' }, { v: 1.3, label: '1.3×' }, { v: 1.6, label: '1.6×' },
  ], p.initialScale, (v) => { p.initialScale = v; });
  rep('portTerminal', [
    { v: 0.6, label: '短' }, { v: 1, label: '中' }, { v: 1.5, label: '长' },
  ], p.terminalLength, (v) => { p.terminalLength = v; });
  const inks = [['#F5FFFD', '白'], ['#6EE7F5', '青'], ['#FF8EC7', '粉'], ['#F4D58D', '金']];
  const inkEl = $('portInk'); inkEl.innerHTML = '';
  for (const [c, l] of inks) inkEl.appendChild(chip(`<i class="sw" style="background:${c}"></i>${l}`, p.ink === c, () => {
    p.ink = c; buildPortChips(); rebuildPort();
  }));
  const gl = $('portGlow'); gl.innerHTML = '';
  gl.appendChild(chip('发光关', !p.glowOn, () => { p.glowOn = false; buildPortChips(); rebuildPort(); }));
  for (const [c, l] of [['#59E6D7', '青'], ['#F07CDA', '粉'], ['#F4D58D', '金']]) {
    gl.appendChild(chip(`<i class="sw" style="background:${c}"></i>${l}`, p.glowOn && p.glowColor === c, () => {
      p.glowOn = true; p.glowColor = c; buildPortChips(); rebuildPort();
    }));
  }
  const DECO_OPTS = [
    { v: 'none', label: '无' }, { v: 'sun', label: '☀ 太阳' }, { v: 'cat', label: '🐱 猫猫' },
    { v: 'heart', label: '❤ 爱心' }, { v: 'star', label: '★ 星星' },
  ];
  rep('portDeco', DECO_OPTS, p.deco, (v) => { p.deco = v; });
  rep('portMidDeco', DECO_OPTS, p.midDeco, (v) => { p.midDeco = v; });
  rep('portDecoB', DECO_OPTS, p.decoB, (v) => { p.decoB = v; });
  rep('portDecoSize', [
    { v: 0.7, label: '小' }, { v: 1, label: '中' }, { v: 1.35, label: '大' },
  ], p.decoScale, (v) => { p.decoScale = v; });
  const ex = $('portExtras'); ex.innerHTML = '';
  ex.appendChild(chip('下划线', p.underline, () => { p.underline = !p.underline; buildPortChips(); rebuildPort(); }));
  ex.appendChild(chip('光点', p.comet, () => { p.comet = !p.comet; buildPortChips(); rebuildPort(); }));
  ex.appendChild(chip('眨眼', p.wink, () => { p.wink = !p.wink; buildPortChips(); rebuildPort(); }));
  ex.appendChild(chip('折耳', p.earFold, () => { p.earFold = !p.earFold; buildPortChips(); rebuildPort(); }));
  rep('portDur', [
    { v: 3, label: '3s' }, { v: 5, label: '5s' }, { v: 8, label: '8s' }, { v: 12, label: '12s' },
  ], p.duration, (v) => { p.duration = v; });
  // 背景互斥：透明与颜色不能同时选中
  const bgEl = $('portBg');
  if (bgEl) {
    bgEl.innerHTML = '';
    const BGS = [['#0B0B12', '墨黑'], ['#101A33', '深蓝'], ['#F7F4EC', '宣纸'], ['#000000', '纯黑']];
    for (const [c, l] of BGS) {
      bgEl.appendChild(chip(l, !p.transparent && p.bg === c, () => {
        p.bg = c; p.transparent = false;
        buildPortChips(); rebuildPort();
      }));
    }
    bgEl.appendChild(chip('透明', p.transparent, () => {
      p.transparent = !p.transparent;
      buildPortChips(); rebuildPort();
    }));
  }
}

// ---------------- Tab ----------------
function setTab(tab) {
  state.tab = tab;
  $('tabCn').dataset.on = tab === 'cn' ? '1' : '0';
  $('tabPort').dataset.on = tab === 'port' ? '1' : '0';
  $('cnPanel').style.display = tab === 'cn' ? 'flex' : 'none';
  $('portPanel').style.display = tab === 'port' ? 'flex' : 'none';
  applyStageSize();
  resize();
  if (tab === 'port') rebuildPort(); else rebuildCn();
  t0 = performance.now();
}

// ---------------- 导出 ----------------
function saveCanvas(canvas, filename) {
  if (window.AndroidApp && typeof window.AndroidApp.saveImage === 'function') {
    const res = window.AndroidApp.saveImage(canvas.toDataURL('image/png'), filename);
    toast(String(res).startsWith('ok') ? '已保存到相册 ✨' : '保存失败：' + res);
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) { toast('导出失败'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('已导出 PNG');
  }, 'image/png');
}

function exportCn(transparent) {
  try {
    const isCouple = state.couple && !!state.text2;
    const exportText = isCouple ? state.text + state.text2 : (state.text || '　');
    const decorOn = state.deco !== 'none' || state.seal !== 'none' || state.date || state.underline || isCouple;
    const size = 1080;
    const mk = () => makeCanvas(size, size);
    const c = mk(), g = mk(), m = mk(), tmp = mk();
    const font = fontOf(state.fontId);
    const palette = activePalette();
    const s = R.buildScene({
      ctx: g.getContext('2d'), text: exportText, fontStack: `"${font.css}"`, W: size, H: size, font,
      getCharData, makeCanvas, duration: state.duration || 0,
      coupleSplit: isCouple ? [...state.text].length : 0,
      decorTailAdd: decorOn ? decorTail() : 0,
      comet: state.comet, outro: state.outro,
    });
    R.renderGlyphLayer(g, s, palette);
    const p = R.createMaskPainter(m.getContext('2d'), s, size, size, { makeCanvas });
    p.reset();
    const e = {
      ctx: c.getContext('2d'), scene: s, glyphCanvas: g, maskCanvas: m, tempCanvas: tmp, makeCanvas,
      painter: p, particles: R.createParticleSystem(), palette,
      backdropId: transparent ? 'none' : state.backdropId, decor: decorCfg(),
      params: { enter: false, shine: state.fx.has('shine'), neon: state.fx.has('neon'), trail: state.fx.has('trail'), particle: false, comet: state.comet, outro: state.outro },
    };
    R.renderFrame(e, s.duration + 200);
    const nameText = isCouple ? state.text + state.text2 : (state.text || 'signature');
    saveCanvas(c, `签名_${nameText}${transparent ? '_透明' : ''}.png`);
  } catch (err) { toast('导出失败：' + err.message); }
}

function exportPort(transparent) {
  try {
    const p = portCfg();
    const ar = p.background.mode;
    const base = 1600;
    const Wp = state.port.aspect === '9:16' ? 900 : base;
    const Hp = state.port.aspect === '9:16' ? 1600 : state.port.aspect === '1:1' ? 1080 : 900;
    const s = PORT.buildPortScene({ ...p, background: { ...p.background, mode: transparent ? 'transparent' : ar } }, Wp, Hp);
    const c = makeCanvas(Wp, Hp);
    PORT.renderPortFrame(c.getContext('2d'), s, s.total);
    saveCanvas(c, `签名_${(state.port.text || 'signature').replace(/\s+/g, '_')}${transparent ? '_透明' : ''}.png`);
  } catch (err) { toast('导出失败：' + err.message); }
}

// ---------------- GIF / MP4 导出 ----------------
function progressToast(label, p) { toast(`${label} ${Math.round(p * 100)}%`); }

async function downloadBytes(bytes, mime, fileName) {
  const res = saveBytesNative(bytes, mime, fileName);
  if (res === 'ok') { toast('已保存到相册 ✨'); return; }
  if (res !== 'unsupported') { toast('保存失败：' + res); return; }
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('已导出文件');
}

/** 中文引擎导出环境（独立画布尺寸） */
function cnExportRig(size) {
  const g = makeCanvas(size, size), m = makeCanvas(size, size), tmp = makeCanvas(size, size);
  const font = fontOf(state.fontId), palette = activePalette();
  const isCouple = state.couple && !!state.text2;
  const text = isCouple ? state.text + state.text2 : (state.text || '　');
  const decorOn = state.deco !== 'none' || state.seal !== 'none' || state.date || state.underline || isCouple;
  const scene = R.buildScene({
    ctx: g.getContext('2d'), text, fontStack: fontStackOf(font), W: size, H: size, font,
    getCharData, makeCanvas, duration: state.duration || 0,
    coupleSplit: isCouple ? [...state.text].length : 0,
    decorTailAdd: decorOn ? decorTail() : 0, comet: false, outro: false,
  });
  R.renderGlyphLayer(g, scene, palette);
  const painter = R.createMaskPainter(m.getContext('2d'), scene, size, size, { makeCanvas });
  painter.reset();
  const env = {
    ctx: null, scene, glyphCanvas: g, maskCanvas: m, tempCanvas: tmp, makeCanvas,
    painter, particles: R.createParticleSystem(), palette,
    backdropId: state.backdropId === 'none' ? 'dark' : state.backdropId,
    decor: decorCfg(),
    params: {
      enter: state.fx.has('enter'), shine: state.fx.has('shine'), neon: state.fx.has('neon'),
      trail: state.fx.has('trail'), particle: state.fx.has('particle'), comet: false, outro: false,
    },
  };
  return {
    duration: scene.duration / 1000,
    draw: (ctx, t) => { env.ctx = ctx; R.renderFrame(env, t * 1000); },
  };
}

function portExportRig(w, h) {
  const cfg = portCfg();
  const scene = PORT.buildPortScene({ ...cfg, background: { ...cfg.background, mode: 'solid' } }, w, h);
  return {
    duration: scene.total,
    draw: (ctx, t) => PORT.renderPortFrame(ctx, scene, t),
  };
}

async function doExportGif(kind) {
  const ok = await confirmDialog(kind === 'cn' ? '导出中文签名的 GIF 动图（约 480px，保存到相册）？' : '导出移植版签名的 GIF 动图（约 480px）？');
  if (!ok) return;
  toast('正在生成 GIF…');
  try {
    const rig = kind === 'cn'
      ? cnExportRig(480)
      : (state.port.aspect === '9:16' ? portExportRig(360, 640) : state.port.aspect === '1:1' ? portExportRig(480, 480) : portExportRig(640, 360));
    const dur = Math.min(rig.duration, 12);
    const res = await exportGif({
      draw: rig.draw, width: kind === 'cn' ? 480 : (state.port.aspect === '9:16' ? 360 : state.port.aspect === '1:1' ? 480 : 640),
      height: kind === 'cn' ? 480 : (state.port.aspect === '9:16' ? 640 : state.port.aspect === '1:1' ? 480 : 360),
      fps: 15, duration: dur, maxColors: 256,
      onProgress: (p) => progressToast('GIF', p),
    });
    const name = `签名_${(kind === 'cn' ? state.text : state.port.text).replace(/\s+/g, '_') || 'signature'}.gif`;
    await downloadBytes(res.bytes, 'image/gif', name);
  } catch (e) {
    toast('GIF 导出失败：' + e.message);
  }
}

async function doExportVideo(kind) {
  if (!hasNativeVideo()) { toast('当前环境不支持视频编码（请用 App 内导出）'); return; }
  const ok = await confirmDialog(kind === 'cn' ? '导出中文签名的 MP4 视频（720p，保存到相册）？' : '导出移植版签名的 MP4 视频（720p）？');
  if (!ok) return;
  toast('正在生成视频…');
  try {
    const dims = kind === 'cn'
      ? { w: 720, h: 720 }
      : state.port.aspect === '9:16' ? { w: 540, h: 960 }
      : state.port.aspect === '1:1' ? { w: 720, h: 720 }
      : { w: 960, h: 540 };
    const rig = kind === 'cn' ? cnExportRig(dims.w) : portExportRig(dims.w, dims.h);
    const res = await exportMp4Native({
      draw: rig.draw, width: dims.w, height: dims.h, fps: 30,
      duration: Math.min(rig.duration, 15),
      onProgress: (p) => progressToast('视频', p),
    });
    if (String(res).startsWith('ok')) toast('视频已保存到相册 🎬');
    else toast('视频保存失败：' + res);
  } catch (e) {
    toast('视频导出失败：' + e.message);
  }
}

// ---------------- 主题 ----------------
function setupTheme() {
  const apply = () => {
    document.documentElement.dataset.theme = state.theme;
    $('themeBtn').textContent = state.theme === 'dark' ? '☾' : '☀';
  };
  $('themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark'; apply();
  });
  apply();
}

// ---------------- 启动 ----------------
async function main() {
  setupTheme();
  applyStageSize();
  resize();
  buildCnChips();
  buildPortChips();
  await rebuildCn();
  rebuildPort();
  $('loading').hidden = true;

  $('tabCn').addEventListener('click', () => setTab('cn'));
  $('tabPort').addEventListener('click', () => setTab('port'));
  $('playBtn').addEventListener('click', () => { t0 = performance.now(); painter && painter.reset(); particles = R.createParticleSystem(); if (env) env.particles = particles; });
  $('portPlay').addEventListener('click', () => { t0 = performance.now(); });
  $('pngBtn').addEventListener('click', async () => {
    if (await confirmDialog('保存这张签名（当前背景）到相册？')) exportCn(false);
  });
  $('pngTBtn').addEventListener('click', async () => {
    if (await confirmDialog('保存透明底 PNG（适合当水印）到相册？')) exportCn(true);
  });
  $('portPngBtn').addEventListener('click', async () => {
    if (await confirmDialog('保存移植版签名到相册？')) exportPort(false);
  });
  $('portPngTBtn').addEventListener('click', async () => {
    if (await confirmDialog('保存移植版透明 PNG 到相册？')) exportPort(true);
  });

  $('gifCnBtn').addEventListener('click', () => doExportGif('cn'));
  $('vidCnBtn').addEventListener('click', () => doExportVideo('cn'));
  $('gifPortBtn').addEventListener('click', () => doExportGif('port'));
  $('vidPortBtn').addEventListener('click', () => doExportVideo('port'));

  for (const [id, key] of [['hue', 'h'], ['sat', 's'], ['lum', 'l']]) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      state.custom = { ...(state.custom || { h: 210, s: 70, l: 70 }), [key]: Number(el.value) };
      const out = $(id + 'Val');
      if (out) out.textContent = el.value;
      paintColorPreview();
      buildCnChips();
      restyle();
    });
  }
  syncColorSliders();
  setupDecoDrag();

  const nameInput = $('name');
  nameInput.value = state.text;
  const onName = () => {
    const v = [...nameInput.value.replace(/\s/g, '')].slice(0, 8).join('');
    if (v === state.text) return;
    state.text = v;
    clearTimeout(buildTimer); buildTimer = setTimeout(rebuildCn, 320);
  };
  nameInput.addEventListener('input', onName);
  nameInput.addEventListener('compositionend', onName);

  const name2 = $('name2');
  name2.addEventListener('input', () => {
    const v = [...name2.value.replace(/\s/g, '')].slice(0, 4).join('');
    if (v === state.text2) return;
    state.text2 = v;
    clearTimeout(buildTimer); buildTimer = setTimeout(rebuildCn, 320);
  });
  const sealInput = $('sealText');
  sealInput.addEventListener('input', () => {
    state.sealText = [...sealInput.value.replace(/\s/g, '')].slice(0, 2).join('') || '签名';
    clearTimeout(buildTimer); buildTimer = setTimeout(rebuildCn, 320);
  });

  const portName2 = $('portName2');
  if (portName2) {
    portName2.addEventListener('input', () => {
      const v = portName2.value.slice(0, 20);
      if (v === state.port.coupleName) return;
      state.port.coupleName = v;
      if (v.trim() && !state.port.couple) { state.port.couple = true; buildPortChips(); }
      clearTimeout(buildTimer);
      buildTimer = setTimeout(() => { if (state.tab === 'port') rebuildPort(); }, 280);
    });
  }
  const portName = $('portName');
  portName.value = state.port.text;
  portName.addEventListener('input', () => {
    const v = portName.value.slice(0, 24);
    if (v === state.port.text) return;
    state.port.text = v;
    clearTimeout(buildTimer);
    buildTimer = setTimeout(() => { if (state.tab === 'port') { rebuildPort(); t0 = performance.now(); } }, 280);
  });

  let rt = 0;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => { applyStageSize(); if (resize()) { if (state.tab === 'cn') rebuildCn(); else rebuildPort(); } }, 150);
  }).observe(stage.parentElement);

  loop(performance.now());
}

main();
