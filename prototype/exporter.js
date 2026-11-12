// exporter.js — 导出 GIF（纯 JS 编码）与 MP4（原生 MediaCodec）
// GIF：中位切分量化 + LZW，完全离线、可复现
// MP4：JS 逐帧渲染 → JPEG → 原生 MediaCodec 编码 H.264 → MediaStore

// ---------------- GIF（gifenc，MIT） ----------------
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.mjs';

function makeCanvas2(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/**
 * 导出 GIF
 * @param draw (ctx, tSeconds) => void
 */
export async function exportGif({ draw, width, height, fps, duration, maxColors = 256, onProgress }) {
  const w = width - (width % 2), h = height - (height % 2);
  const canvas = makeCanvas2(w, h);
  const ctx = canvas.getContext('2d');
  const frameCount = Math.max(2, Math.round(duration * fps));
  const delay = Math.max(20, Math.round(1000 / fps));

  // 采样中间几帧做调色板（画面内容最多的时候）
  let palette = null;
  for (let k = 0; k < 3; k++) {
    const t = duration * (0.45 + k * 0.2);
    draw(ctx, t);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    if (!palette) palette = quantize(rgba, maxColors);
    if (onProgress) onProgress(0.05 + k * 0.05);
  }

  const gif = GIFEncoder();
  for (let i = 0; i < frameCount; i++) {
    const t = (i / Math.max(1, frameCount - 1)) * duration;
    draw(ctx, t);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, w, h, {
      palette: i === 0 ? palette : undefined,
      delay,
      repeat: 0,
    });
    if (onProgress) onProgress(0.2 + ((i + 1) / frameCount) * 0.78);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  const bytes = gif.bytes();
  if (onProgress) onProgress(1);
  return { bytes, width: w, height: h, frames: frameCount, size: bytes.length };
}

// ---------------- MP4（原生编码） ----------------
export function hasNativeVideo() {
  return !!(window.AndroidVideo && typeof window.AndroidVideo.begin === 'function');
}

/**
 * 原生 MP4：JS 逐帧渲染 → JPEG → 原生 MediaCodec/MediaMuxer
 * @param draw (ctx, tSeconds) => void
 */
export async function exportMp4Native({ draw, width, height, fps, duration, onProgress }) {
  if (!hasNativeVideo()) throw new Error('native-video-unavailable');
  const w = width, h = height;
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  const frameCount = Math.max(2, Math.round(duration * fps));
  const begin = window.AndroidVideo.begin(w, h, fps);
  if (String(begin) !== 'ok') throw new Error('begin failed: ' + begin);
  try {
    for (let i = 0; i < frameCount; i++) {
      const t = (i / Math.max(1, frameCount - 1)) * duration;
      draw(ctx, t);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const res = window.AndroidVideo.push(dataUrl);
      if (String(res) !== 'ok') throw new Error('push failed: ' + res);
      if (onProgress) onProgress((i + 1) / frameCount);
      if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }
    const done = window.AndroidVideo.finish();
    return done;
  } catch (e) {
    try { window.AndroidVideo.cancel(); } catch (err) {}
    throw e;
  }
}

/** 把 Uint8Array 交给原生保存（GIF 走这里） */
export function saveBytesNative(bytes, mime, fileName) {
  if (!window.AndroidApp || typeof window.AndroidApp.saveBytes !== 'function') return 'unsupported';
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return window.AndroidApp.saveBytes(btoa(bin), mime, fileName);
}
