// tools/charload.mjs — Node 侧按字加载笔顺数据（与浏览器行为一致：按需、带缓存）
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
const cache = new Map();

export function loadChar(ch) {
  if (cache.has(ch)) return cache.get(ch);
  let d = null;
  try {
    d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'strokes', `${ch}.json`), 'utf8'));
  } catch (e) { d = null; }
  cache.set(ch, d);
  return d;
}

export function loadAll(text) {
  const map = new Map();
  for (const ch of text) map.set(ch, loadChar(ch));
  return map;
}
