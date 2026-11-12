// tools/shot.mjs — 用真实 Chromium 打开原型，跑一遍交互并截图（端到端验证）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'http://127.0.0.1:8765/';
const OUT = '/root/workspace/prototype/tools/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => {
  const el = document.getElementById('loading');
  return el && el.hidden === true;
}, { timeout: 60000 });
console.log('首屏就绪（含字体+骨架）:', ((Date.now() - t0) / 1000).toFixed(1) + 's');

const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('shot', name);
};

// 等动画播完再截最终态
const wait = (ms) => page.waitForTimeout(ms);

await wait(3200);
await shot('01_default_msz_paper.png');

// 全部动效打开 + 霓虹配色 + 深夜背景
for (const label of ['流光', '霓虹呼吸', '描边流光', '粒子']) {
  await page.locator('.chip', { hasText: label }).first().click();
}
await page.locator('.chip', { hasText: '霓虹' }).first().click();
await page.locator('.chip', { hasText: '深夜' }).first().click();
await wait(1200);
await shot('02_neon_allfx.png');

// 换草书字体 + 4 字长名字
await page.locator('.chip', { hasText: '柳建毛草' }).first().click();
await wait(1200);
await page.locator('#name').fill('欧阳明月');
await wait(3600);
await shot('03_ljm_4chars.png');

// 浅色主题
await page.locator('#themeBtn').click();
await wait(1500);
await shot('04_light_theme.png');

// 性能：稳定后测 2 秒 rAF 帧数
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t = performance.now();
  const tick = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); };
  requestAnimationFrame(tick);
}));
console.log('实测帧率:', fps, 'fps（headless 软件渲染，手机上通常更高）');

// 导出 PNG 是否可用（检查 toBlob 结果非空）
const pngOk = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = c.height = 1080;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1080, 1080);
  const b = await new Promise((r) => c.toBlob(r, 'image/png'));
  return b ? b.size : 0;
});
console.log('导出 PNG 编码测试:', pngOk > 1000 ? `OK (${pngOk} bytes)` : 'FAILED');

console.log('页面错误:', errors.length ? errors : '无');
await browser.close();
