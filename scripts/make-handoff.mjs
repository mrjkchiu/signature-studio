#!/usr/bin/env node
// 生成一份"发版前交接快照"：当前 code 状态 + HANDOFF.md 正文
// 用法：node scripts/make-handoff.mjs [--version vX.Y.Z]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'handoff');
fs.mkdirSync(OUT, { recursive: true });

const sh = (cmd, fallback = '') => {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { return fallback; }
};

const now = new Date();
const stamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
}).format(now).replace(' ', '-').replace(/:/g, '');

const sha = sh('git rev-parse --short HEAD', 'unknown');
const branch = sh('git rev-parse --abbrev-ref HEAD', 'unknown');
const tags = sh('git tag --list --sort=-creatordate | head -5');
const logs = sh('git log --oneline -8');
const dirty = sh('git status --short | head -20');
const ahead = sh('git rev-list --count @{u}..HEAD 2>/dev/null', '0');
const latestRemoteTag = sh('git ls-remote --tags origin 2>/dev/null | awk -F/ "{print \\$3}" | grep -v "\\^{}" | sort -V | tail -3');

const versionArg = process.argv.indexOf('--version');
const version = versionArg > -1 ? process.argv[versionArg + 1] : sh('git describe --tags --abbrev=0', 'unreleased');

const body = fs.readFileSync(path.join(ROOT, 'HANDOFF.md'), 'utf8');
const header = `<!-- 自动生成：node scripts/make-handoff.mjs -->

# 发版交接快照 · ${version}

| 项 | 值 |
| --- | --- |
| 生成时间 | ${stamp}（Asia/Shanghai） |
| 版本（git describe） | ${version} |
| 当前提交 | ${sha}（分支 ${branch}） |
| 未推送提交 | ${ahead} |
| 本地最近 tag | ${tags.split('\n').filter(Boolean).join(' / ') || '-'} |
| 远端最近 tag | ${latestRemoteTag.split('\n').filter(Boolean).join(' / ') || '-'} |

## 最近提交

\`\`\`
${logs}
\`\`\`

## 未提交改动

\`\`\`
${dirty || '(工作区干净)'}
\`\`\`

> ⚠️ 发版前请把本文件交给用户确认；未获确认不要打 tag。

---

`;
const file = path.join(OUT, `handoff-${stamp}-${sha}.md`);
fs.writeFileSync(file, header + body);
console.log(file);
console.log(`体积 ${(fs.statSync(file).size / 1024).toFixed(1)}KB`);
