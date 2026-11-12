#!/usr/bin/env node
// 从零拉取原型依赖的素材：11 套 OFL 字体 + 9574 字笔顺数据。
// 云端机器上执行：node scripts/fetch-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const FONT_DIR = path.join(ROOT, 'prototype', 'fonts');
const STROKE_DIR = path.join(ROOT, 'prototype', 'data', 'strokes');

const CDN_GH = 'https://cdn.jsdelivr.net/gh';
const FONTS = [
  ['mashanzheng.ttf', `${CDN_GH}/google/fonts@main/ofl/mashanzheng/MaShanZheng-Regular.ttf`],
  ['zhimangxing.ttf', `${CDN_GH}/google/fonts@main/ofl/zhimangxing/ZhiMangXing-Regular.ttf`],
  ['liujianmaocao.ttf', `${CDN_GH}/google/fonts@main/ofl/liujianmaocao/LiuJianMaoCao-Regular.ttf`],
  ['longcang.ttf', `${CDN_GH}/google/fonts@main/ofl/longcang/LongCang-Regular.ttf`],
  ['zcoolkuaile.ttf', `${CDN_GH}/google/fonts@main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf`],
  ['zcoolxiaowei.ttf', `${CDN_GH}/google/fonts@main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf`],
  ['zcoolhuangyou.ttf', `${CDN_GH}/google/fonts@main/ofl/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf`],
  ['lxgwwenkailite.ttf', `${CDN_GH}/lxgw/LxgwWenKai-Lite@v1.530/fonts/TTF/LXGWWenKaiLite-Regular.ttf`],
  ['markergothic.ttf', `${CDN_GH}/lxgw/LxgwMarkerGothic@main/fonts/ttf/LXGWMarkerGothic-Regular.ttf`],
  ['smileysans.ttf', 'https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip'],
  ['yozai.ttf', 'https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Medium.ttf'],
];
const MIRRORS = ['', 'https://ghproxy.net/', 'https://gh-proxy.com/'];

async function download(url, dest, minBytes = 200000) {
  for (const prefix of MIRRORS) {
    try {
      const res = await fetch(prefix + url, { redirect: 'follow' });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < minBytes) continue;
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) {
      /* 换下一个镜像 */
    }
  }
  return 0;
}

fs.mkdirSync(FONT_DIR, { recursive: true });
for (const [name, url] of FONTS) {
  const dest = path.join(FONT_DIR, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 200000) {
    console.log('已存在', name);
    continue;
  }
  const size = await download(url, dest);
  console.log(size ? `✅ ${name} ${(size / 1048576).toFixed(1)}MB` : `❌ ${name} 下载失败（可跳过，字体少一套不影响运行）`);
}

// 得意黑来自 zip，需要解压
for (const zip of fs.readdirSync(FONT_DIR).filter((f) => f.endsWith('.zip'))) {
  try {
    execSync(`cd "${FONT_DIR}" && unzip -o -j "${zip}" "*SmileySans-Oblique.ttf" >/dev/null 2>&1 || true`);
    const p = path.join(FONT_DIR, 'SmileySans-Oblique.ttf');
    if (fs.existsSync(p)) { fs.renameSync(p, path.join(FONT_DIR, 'smileysans.ttf')); console.log('✅ 得意黑解压完成'); }
  } catch (e) { /* ignore */ }
}

// 笔顺数据：hanzi-writer-data（Arphic Public License，仅用于笔顺顺序参考）
fs.mkdirSync(STROKE_DIR, { recursive: true });
if (fs.readdirSync(STROKE_DIR).length < 1000) {
  console.log('下载笔顺数据…');
  const tgz = path.join(ROOT, '.cache-hwd.tgz');
  const ok = await download('https://registry.npmmirror.com/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz', tgz, 1000000);
  if (!ok) {
    console.error('❌ 笔顺数据下载失败');
    process.exit(1);
  }
  const tmp = path.join(ROOT, '.cache-hwd');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`tar -xzf "${tgz}" -C "${tmp}"`);
  const src = path.join(tmp, 'package');
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith('.json')) continue;
    const ch = f.slice(0, -5);
    if ([...ch].length !== 1) continue;
    fs.copyFileSync(path.join(src, f), path.join(STROKE_DIR, f));
    n++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(tgz, { force: true });
  console.log(`✅ 笔顺数据 ${n} 字`);
} else {
  console.log('笔顺数据已存在，跳过');
}
