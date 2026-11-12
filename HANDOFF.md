# 交接文档 · 签名工坊（动态艺术签名 App）

> 给任何接手的 AI / 开发者。读完即可继续，不需要翻聊天记录。
> 当前版本：**v0.3.9**（2026-11-13）
> ⚠️ **发版规则（用户明确要求）**：任何 tag / Release **必须先给出 handoff 并征得用户同意**，不得擅自发版。

---

## 1. 一句话

Android 上"输入名字 → 逐笔写出来的艺术签名 → 导出 PNG/GIF/MP4"的 App。
**Web 原型 + WebView 包壳**，由 GitHub Actions 云端构建 APK，手机端不参与编译。

- 仓库：https://github.com/mrjkchiu/signature-studio
- 最新 APK：https://github.com/mrjkchiu/signature-studio/releases/latest/download/signature-studio-latest.apk
- 本地工作区：`/root/workspace`（Android proot 环境，无 JDK/SDK，靠云端构建）

## 2. 两个 Tab（产品形态）

| Tab | 引擎 | 能力 |
| --- | --- | --- |
| **中文签名** | 自研：艺术字体 → 骨架提取 → 笔顺排序 | 11→7 套 OFL 字体、逐笔书写、笔锋缎带、13 种笔绘装饰（可拖动）、印章/落款日期/下划线、情侣双人、12 种背景、HSL 滑杆调色、PNG/透明 PNG/GIF/MP4 |
| **英文签名 · 移植版** | 移植 tyx-signature（MIT） | TYX Brush 笔刷、压力模型、收笔花体、太阳/猫/爱心/星星装饰（眨眼/折耳）、光点入场/离场、下划线 lift、**情侣横排（装饰一/中间/装饰二）**、画幅 16:9·9:16·1:1、PNG/GIF/MP4 |

## 3. 架构与关键路径

```
prototype/
  index.html        两个 Tab 的 UI（原生控件 + 画布）
  app.js            状态机、控件、导出编排、拖拽
  renderer.js       中文引擎：布局/遮罩/缎带笔锋/背景/合成
  skeleton.js       Zhang-Suen 细化 + 骨架拆段 + 楷书笔顺排序 + 距离变换笔宽
  decor.js          中文版装饰矢量图形（13 种）+ 印章/日期/下划线/情侣心
  exporter.js       GIF（内置 gifenc）与 MP4（调原生桥）
  vendor/gifenc.mjs 内置 gifenc（MIT），离线可用
  port/             英文引擎：positional.js（笔画数据）brush.js engine.js decor.js
  data/strokes/     9574 字笔顺数据（按字按需 fetch，不进 git）
  fonts/            7 套 OFL 字体（不进 git，由脚本拉取）
android/
  app/src/main/java/com/dsh/signature/
    MainActivity.kt   WebView + WebViewAssetLoader + 三个 JS 桥
    VideoEncoder.kt   MediaCodec H.264 + MediaMuxer（逐帧 JPEG → MP4 → 相册）
  copy-assets.sh      把 prototype 打包进 assets，并自动裁剪字体列表
scripts/fetch-assets.mjs  拉字体 + 笔顺数据（带镜像回退）
.github/workflows/   build-apk.yml（push main 构建）· release-apk.yml（tag 发版）
```

**渲染管线（中文）**：字体轮廓 → 骨架(1px) → 拆段/合并 → 楷书数据仅用于排序 →
逐点笔宽（距离变换）→ 变宽缎带 ∩ 字形 → 着色/发光/流光 → 合成。
核心结论：**不要用楷书轮廓当遮罩**（覆盖率仅 31–76%，草书会碎），必须用字体自身骨架。

**无网络权限**：页面资源全部走 `WebViewAssetLoader`（`https://appassets.androidplatform.net`），
请求在客户端被拦截，所以 Manifest 里**没有 INTERNET 权限**（隐私卖点，勿加）。

**导出**：PNG → `AndroidApp.saveImage`（MediaStore 相册）；GIF → JS 编码后 `AndroidApp.saveBytes`；
MP4 → `AndroidVideo.begin/push/finish` → 原生 MediaCodec → 相册 Movies。

## 4. 构建与发版

```bash
# 本地预览（原型）
cd prototype && python3 -m http.server 8765 --bind 0.0.0.0

# 构建 APK（云端）：push main 或 tag，Actions 自动构建
# 发版（需用户同意后）：
git tag -a vX.Y.Z -m "说明" && git push origin vX.Y.Z
```

- Release 同时产出 `signature-studio-vX.Y.Z.apk` 与固定名 `signature-studio-latest.apk`
- **发版前必须先出交接快照**：`node scripts/make-handoff.mjs --version vX.Y.Z`
  → 生成 `docs/handoff/handoff-<时间>-<sha>.md`，把路径发给用户确认，**得到同意才打 tag**
- **CI 失败排查**：工作流带失败兜底，会把 Gradle 日志提交到 `ci-logs` 分支。
  读取用 **raw.githubusercontent**（jsdelivr 对分支文件有缓存，会拿到旧内容）：
  `https://raw.githubusercontent.com/mrjkchiu/signature-studio/ci-logs/ci-build-error.log`

## 5. 踩过的坑（别重复）

| 坑 | 结论 |
| --- | --- |
| Kotlin `= try {}` 里写 `return` | 编译报 "Returns are prohibited..." → 改成块体 `fun x(): T { return try {...} }` |
| 仓库没有 gradlew | CI 里用 `gradle`，不要 `./gradlew` |
| GitHub API 匿名限流 60/h | 查状态失败时用 Releases 页 HEAD 或 raw 文件判断 |
| jsdelivr 缓存分支文件 | 读最新日志用 raw.githubusercontent |
| apt 源（ports.ubuntu.com）不通 | 装不了 openssh-client → 用 pip 的 paramiko 包装 SSH（`~/.ssh/git-ssh`，已配好，走 ssh.github.com:443） |
| 推送偶发失败 | 重试循环（DNS 抖动），`git push` 重试 5–8 次通常成功 |
| WebView 不支持 `<a download>` | 保存必须走原生桥，否则"点了没反应" |
| 手机拖动装饰卡顿/断 | canvas 需 `touch-action:none`；用 window 级 pointer 事件；拖动时立即重绘 |
| 移植版字号/笔宽串台 | 不同功能的按钮**不要共用一组与同一个选中值**（1 与 1.0 相等会互串） |
| 字体/笔顺数据大 | 不进 git，`node scripts/fetch-assets.mjs` 拉取；CI 里也执行 |
| 旧版 APK 覆盖安装失败 | CI debug 签名每次不同 → 先卸载再装 |

## 6. 验证工具（改完必跑）

```bash
cd prototype
node tools/diff.mjs        # 中文引擎覆盖率（当前最低 ~71%，末帧补全 100%）
node tools/smooth.mjs      # 书写顺滑度（空帧率应 ≤10%）
node tools/verify-port.mjs # 移植版 20 个参数是否真实生效（墨迹占比对比）
```

## 6.5 包体优化（v0.3.10 已做 P0）

- 打包只带 FONTS 列表里的 7 套字体（之前 `cp fonts/*.ttf` 把已删的 4 套也打进去，白占 10.5MB）
- 笔顺数据只保留 `medians`（引擎只用中心线排序，轮廓从未参与渲染）→ 30.8M → 6.3M
- 顺手修了得意黑字体路径错误（此前一直加载失败）
- 预期 APK 64.4M → ~41M；下一步 WOFF2 可到 ~20M（报告：`docs/包体与性能优化评估.md`）

## 7. 已知问题 / 待办

1. **MP4 尚未真机验证**（MediaCodec 路径只保证编译通过）；失败时把 toast 文案发回来
2. GIF 为 256 色量化，深色渐变背景会有轻微色带（可加抖色）
3. 中文引擎中途覆盖率 71–99%，靠"收笔补齐"保证末帧完整
4. 移植版只有 TYX Brush 一套笔刷（参考项目另有 3 套轮廓字体未移植）
5. 背景音乐、播放进度拖动、"完整预览"静态模式未做
6. 中文版音乐/导出视频的进度体验较粗（toast 百分比）

## 8. 下一步建议（按优先级）

1. 真机验证 MP4 并修复编码问题（最高风险项）
2. GIF 加 Floyd–Steinberg 抖动，提升渐变观感
3. 中文版装饰拖动在低端机上做节流（每 2 帧重绘一次）
4. 模板体系（需求文档 P0 里 24 套）与竖排排版
5. 字体子集化（APK 可从 64MB 降到 ~30MB）

## 9. 用户偏好（重要）

- 说话直接、要结果；不接受"差不多"的观感
- 中文界面；发版前必须先出 handoff 并等确认
- 审美偏现代（2026 风格），嫌弃"老气"的传统样式
- 明确要求过：不要擅自发版；保存类操作要有确认弹窗

## 10. 文档

- 需求文档（v0.3）：`docs/动态艺术签名App-需求文档-v0.1.md`
- 原型交互规格（v0.2）：`docs/动态艺术签名App-原型与交互规格-v0.1.md`
- 云端构建指南：`CLOUD_BUILD.md`
- 原型说明：`prototype/README.md`
- 第三方许可：`THIRD_PARTY_NOTICES.md`
