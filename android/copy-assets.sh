#!/usr/bin/env bash
# 把 Web 原型打包进 Android assets：
#  - 只拷贝 FONTS 列表里真正启用的字体（避免把已删除的字体也打进去）
#  - 笔顺数据只保留中心线（medians），去掉未使用的轮廓字段
set -euo pipefail
cd "$(dirname "$0")"

SRC=../prototype
DEST=app/src/main/assets/www

rm -rf "$DEST"
mkdir -p "$DEST/fonts"

for f in index.html app.js renderer.js skeleton.js decor.js math.js exporter.js; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DEST/"
done
cp -r "$SRC/data" "$DEST/data"
cp -r "$SRC/port" "$DEST/port"
cp -r "$SRC/vendor" "$DEST/vendor"

node - "$SRC" "$DEST" <<'JS'
const fs = require('fs');
const path = require('path');
const [src, dest] = process.argv.slice(2);
const js = fs.readFileSync(path.join(src, 'renderer.js'), 'utf8');
const block = (js.match(/export const FONTS = \[[\s\S]*?\];/) || [''])[0];
const files = [...block.matchAll(/file: '([^']+)'/g)].map((m) => m[1].split('/').pop());
let copied = 0, bytes = 0;
for (const f of files) {
  const p = path.join(src, 'fonts', f);
  if (!fs.existsSync(p)) { console.warn('⚠ 缺字体文件:', f); continue; }
  fs.copyFileSync(p, path.join(dest, 'fonts', f));
  bytes += fs.statSync(p).size;
  copied++;
}
// 保险：把打包后的 renderer.js 里 FONTS 裁到实际存在的字体
const out = js.replace(/export const FONTS = \[([\s\S]*?)\];/, (m, body) => {
  const lines = body.split('\n').filter((line) => {
    const mm = line.match(/file: '([^']+)'/);
    if (!mm) return line.trim() === '';
    return files.includes(mm[1].split('/').pop());
  });
  return `export const FONTS = [${lines.join('\n')}\n];`;
});
fs.writeFileSync(path.join(dest, 'renderer.js'), out);
console.log(`打包字体: ${copied} 套 (${(bytes / 1048576).toFixed(1)}MB) → ${files.join(' / ')}`);
JS

node - "$DEST" <<'JS'
const fs = require('fs');
const path = require('path');
const dest = process.argv[2];
const dir = path.join(dest, 'data', 'strokes');
let n = 0, saved = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(dir, f);
  const b = fs.readFileSync(p, 'utf8');
  if (!b.includes('"strokes"')) continue;
  const d = JSON.parse(b);
  const out = JSON.stringify({ medians: d.medians || [] });
  saved += b.length - out.length;
  n++;
  fs.writeFileSync(p, out);
}
console.log(`笔顺瘦身: ${n} 字, 省 ${(saved / 1048576).toFixed(1)}MB`);
JS

echo "assets 就绪: $(du -sh "$DEST" | cut -f1)"
