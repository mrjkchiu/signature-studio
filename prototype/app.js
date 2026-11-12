import * as R from './renderer.js';
import * as PORT from './port/engine.js';
import { DECOS, DECO_POSITIONS, DECO_SIZES, SEALS, decorTail } from './decor.js';

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
  comet: true, outro: false,
  // 移植版引擎
  port: {
    text: 'Chen Ming', aspect: '16:9',
    fontSize: 240, penWidth: 1, pressure: 1, initialScale: 1.3, terminalLength: 1,
    ink: '#F5FFFD', glowOn: true, glowColor: '#59E6D7',
    deco: 'sun', decoScale: 1, wink: true, earFold: true,
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
function decorCfg() {
  const isCouple = state.couple && !!state.text2;
  return {
    couple: isCouple, deco: state.deco, decoSize: state.decoSize, decoPos: state.decoPos,
    seal: state.seal, sealText: state.sealText, date: state.date, underline: state.underline,
  };
}
function restyle() {
  if (!env || !scene) { rebuildCn(); return; }
  const palette = paletteOf(state.paletteId);
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
  const palette = paletteOf(state.paletteId);
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
    text: (p.text || '').trim() || 'Chen Ming',
    font: {
      size: p.fontSize, penWidth: p.penWidth, pressure: p.pressure,
      initialScale: p.initialScale, initialOffsetX: 0, initialOffsetY: 0, terminalLength: p.terminalLength,
    },
    ink: p.ink,
    glow: { on: p.glowOn, color: p.glowColor, strength: 0.65, radius: 18 },
    decoration: { id: p.deco, scale: p.decoScale, offsetX: 0, offsetY: 0, action: p.wink ? 'wink' : 'none', earFold: p.earFold },
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
    pc.appendChild(chip(`<i class="sw" style="${sw}"></i>${p.label}`, state.paletteId === p.id, () => {
      state.paletteId = p.id; buildCnChips(); restyle();
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

  const fx2 = $('fx2Chips'); fx2.innerHTML = '';
  fx2.appendChild(chip('光点入场', state.comet, () => { state.comet = !state.comet; buildCnChips(); rebuildCn(); }));
  fx2.appendChild(chip('彩色收尾', state.outro, () => { state.outro = !state.outro; buildCnChips(); rebuildCn(); }));

  const dc = $('decoChips'); dc.innerHTML = '';
  for (const d of DECOS) dc.appendChild(chip(d.label, state.deco === d.id, () => {
    state.deco = d.id; buildCnChips(); rebuildCn();
  }));

  const dopt = $('decoOptChips'); dopt.innerHTML = '';
  for (const o of DECO_SIZES) dopt.appendChild(chip('大小' + o.label, state.decoSize === o.id, () => { state.decoSize = o.id; buildCnChips(); rebuildCn(); }));
  for (const o of DECO_POSITIONS) dopt.appendChild(chip('位置' + o.label, state.decoPos === o.id, () => { state.decoPos = o.id; buildCnChips(); rebuildCn(); }));

  const sc = $('stampChips'); sc.innerHTML = '';
  for (const o of SEALS) sc.appendChild(chip(o.label, state.seal === o.id, () => { state.seal = o.id; buildCnChips(); rebuildCn(); }));
  sc.appendChild(chip('落款日期', state.date, () => { state.date = !state.date; buildCnChips(); rebuildCn(); }));

  const lc = $('lineChips'); lc.innerHTML = '';
  lc.appendChild(chip('下划线', state.underline, () => { state.underline = !state.underline; buildCnChips(); rebuildCn(); }));

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
  rep('portAspect', [
    { v: '16:9', label: '横 16:9' }, { v: '9:16', label: '竖 9:16' }, { v: '1:1', label: '方 1:1' },
  ], p.aspect, (v) => { p.aspect = v; applyStageSize(); resize(); });
  rep('portSize', [
    { v: 180, label: '字号 小' }, { v: 240, label: '字号 中' }, { v: 300, label: '字号 大' },
    { v: 0.7, label: '笔宽 细' }, { v: 1, label: '笔宽 中' }, { v: 1.4, label: '笔宽 粗' },
  ], p.fontSize, (v) => { if (v < 10) p.fontSize = v; else p.penWidth = v; });
  rep('portPressure', [
    { v: 0.4, label: '压力 低' }, { v: 0.7, label: '压力 中' }, { v: 1, label: '压力 高' },
    { v: 1.0, label: '首字母 1.0' }, { v: 1.3, label: '首字母 1.3' }, { v: 1.5, label: '首字母 1.5' },
  ], p.pressure, (v) => { if (v <= 1) p.pressure = v; else p.initialScale = v; });
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
  rep('portDeco', [
    { v: 'none', label: '无' }, { v: 'sun', label: '☀ 太阳' }, { v: 'cat', label: '🐱 猫猫' },
    { v: 'heart', label: '❤ 爱心' }, { v: 'star', label: '★ 星星' },
  ], p.deco, (v) => { p.deco = v; });
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
  rep('portBg', [
    { v: '#0B0B12', label: '墨黑' }, { v: '#101A33', label: '深蓝' }, { v: '#F7F4EC', label: '宣纸' },
    { v: '#000000', label: '纯黑' },
  ], p.bg, (v) => { p.bg = v; p.transparent = false; });
  const bgEl = $('portBg');
  bgEl.appendChild(chip('透明', p.transparent, () => { p.transparent = !p.transparent; buildPortChips(); rebuildPort(); }));
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
    const palette = paletteOf(state.paletteId);
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
  $('pngBtn').addEventListener('click', () => exportCn(false));
  $('pngTBtn').addEventListener('click', () => exportCn(true));
  $('portPngBtn').addEventListener('click', () => exportPort(false));
  $('portPngTBtn').addEventListener('click', () => exportPort(true));

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
