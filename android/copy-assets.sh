#!/usr/bin/env bash
# 把 Web 原型打包进 Android assets：
#  - 只拷贝 FONTS 列表里真正启用的字体
#  - 笔顺数据只保留中心线（medians）
#  - FONT_WOFF2=1 且有 fonttools 时：字体子集化 + 转 WOFF2（约 1/3 体积）
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

# 1) 启用字体列表（来自 renderer.js 的 FONTS）
FONT_LIST=$(node - "$SRC" <<'JS'
const fs = require('fs'), path = require('path');
const src = process.argv[2];
const js = fs.readFileSync(path.join(src, 'renderer.js'), 'utf8');
const block = (js.match(/export const FONTS = \[[\s\S]*?\];/) || [''])[0];
console.log([...block.matchAll(/file: '([^']+)'/g)].map((m) => m[1].split('/').pop()).join('\n'));
JS
)

# 2) 可选：字体子集化 + WOFF2
EXT=ttf
# 需要时（FONT_WOFF2=1）现场重新生成本地 WOFF2；否则直接用仓库里已生成的
if [ "${FONT_WOFF2:-0}" = "1" ]; then
  if python3 -c "import fontTools, brotli" 2>/dev/null; then
    python3 ../scripts/subset-fonts.py --src "$SRC/fonts" --dest "$SRC/fonts-woff2" \
      --strokes "$SRC/data/strokes" --fonts $FONT_LIST || echo "⚠ 字体转换失败"
    python3 -c "import fontTools; print('fontTools', fontTools.version)" || true
  else
    echo "ℹ 环境没有 fontTools/brotli，直接使用仓库内已生成的 WOFF2"
  fi
fi
TOTAL=$(echo "$FONT_LIST" | wc -l)
GOT=$(ls "$SRC"/fonts-woff2/*.woff2 2>/dev/null | wc -l)
if [ "$GOT" -ge "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
  EXT=woff2
else
  echo "⚠ 仓库内 WOFF2 不完整（$GOT/$TOTAL），回退 TTF"
fi

# 3) 拷贝字体（WOFF2 优先，缺哪个就回退那个 TTF）
COPIED=0
for f in $FONT_LIST; do
  base="${f%.ttf}"
  if [ "$EXT" = "woff2" ] && [ -f "$SRC/fonts-woff2/$base.woff2" ]; then
    cp "$SRC/fonts-woff2/$base.woff2" "$DEST/fonts/$base.woff2"
    COPIED=$((COPIED+1))
  elif [ -f "$SRC/fonts/$f" ]; then
    cp "$SRC/fonts/$f" "$DEST/fonts/$f"
    COPIED=$((COPIED+1))
  else
    echo "⚠ 缺字体: $f"
  fi
done
echo "字体格式: $EXT，打包 $COPIED 套"

# 4) 重写 renderer.js：裁 FONTS 到实际打包的字体，并按需改扩展名
node - "$SRC" "$DEST" "$EXT" <<'JS'
const fs = require('fs'), path = require('path');
const [src, dest, ext] = process.argv.slice(2);
const js = fs.readFileSync(path.join(src, 'renderer.js'), 'utf8');
const shipped = new Set(fs.readdirSync(path.join(dest, 'fonts')));
const out = js.replace(/export const FONTS = \[([\s\S]*?)\];/, (m, body) => {
  const keep = body.split('\n').filter((line) => {
    const mm = line.match(/file: '([^']+)'/);
    if (!mm) return line.trim() === '';
    const file = mm[1].split('/').pop();
    const base = file.replace(/\.ttf$/, '');
    return shipped.has(file) || (ext === 'woff2' && shipped.has(base + '.woff2'));
  }).map((line) => {
    if (ext !== 'woff2') return line;
    return line.replace(/file: 'fonts\/([^']+)\.ttf'/, "file: 'fonts/$1.woff2'");
  });
  return `export const FONTS = [${keep.join('\n')}\n];`;
});
fs.writeFileSync(path.join(dest, 'renderer.js'), out);
console.log('renderer.js FONTS 已按打包字体重写');
JS

# 5) 笔顺数据保险：若还是全量则剥成只含 medians
node - "$DEST" <<'JS'
const fs = require('fs'), path = require('path');
const dir = path.join(process.argv[2], 'data', 'strokes');
let n = 0, saved = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(dir, f);
  const b = fs.readFileSync(p, 'utf8');
  if (!b.includes('"strokes"')) continue;
  const out = JSON.stringify({ medians: JSON.parse(b).medians || [] });
  saved += b.length - out.length; n++;
  fs.writeFileSync(p, out);
}
console.log(`笔顺瘦身: ${n} 字, 省 ${(saved / 1048576).toFixed(1)}MB`);
JS

echo "assets 就绪: $(du -sh "$DEST" | cut -f1)"
