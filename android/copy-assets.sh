#!/usr/bin/env bash
# 把 Web 原型拷进 Android assets，并按实际存在的字体裁剪 FONTS 列表。
# 用法（在仓库根目录）：bash android/copy-assets.sh
set -euo pipefail
cd "$(dirname "$0")"

SRC=../prototype
DEST=app/src/main/assets/www

rm -rf "$DEST"
mkdir -p "$DEST/fonts"

for f in index.html app.js renderer.js skeleton.js decor.js math.js; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DEST/"
done
cp -r "$SRC/data" "$DEST/data"

# 字体：默认全带（体积大）。想瘦身就只复制需要的几套，脚本会自动裁剪 FONTS。
cp "$SRC"/fonts/*.ttf "$DEST/fonts/" 2>/dev/null || true

node - "$DEST" <<'JS'
const fs = require('fs');
const path = require('path');
const dest = process.argv[2];
const have = new Set(fs.readdirSync(path.join(dest, 'fonts')));
const file = path.join(dest, 'renderer.js');
let s = fs.readFileSync(file, 'utf8');
s = s.replace(/export const FONTS = \[([\s\S]*?)\n\];/, (m, body) => {
  const lines = body.split('\n').filter((line) => {
    const mm = line.match(/file: '([^']+)'/);
    if (!mm) return line.trim() === '';
    return have.has(mm[1].split('/').pop());
  });
  return `export const FONTS = [${lines.join('\n')}\n];`;
});
fs.writeFileSync(file, s);
const fontsBlock = (s.match(/export const FONTS = \[[\s\S]*?\];/) || [''])[0];
const kept = [...fontsBlock.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
console.log('已打入字体:', kept.join(' / '));
JS

echo "assets 就绪：$(du -sh "$DEST" | cut -f1)"
