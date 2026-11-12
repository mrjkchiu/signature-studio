# 签名工坊 · 动态艺术签名（原型 + Android 包壳）

输入名字 → 逐笔"写"出来的艺术签名 → 导出图片/动图。当前是**可交互 Web 原型 + 可云端构建的 Android 包壳**。

## 先看哪里

| 想知道 | 看这个 |
| --- | --- |
| 需求、动效清单、技术方案、里程碑 | [docs/动态艺术签名App-需求文档-v0.1.md](docs/动态艺术签名App-需求文档-v0.1.md) |
| 页面线框、参数面板、交互规格 | [docs/动态艺术签名App-原型与交互规格-v0.1.md](docs/动态艺术签名App-原型与交互规格-v0.1.md) |
| 项目现状、已定决策、踩过的坑、下一步 | [HANDOFF.md](HANDOFF.md) |
| **云端怎么出 APK** | [CLOUD_BUILD.md](CLOUD_BUILD.md) |
| 原型怎么跑、验证了什么 | [prototype/README.md](prototype/README.md) |

## 本地/云端出包（三步）

```bash
node scripts/fetch-assets.mjs        # 拉 11 套 OFL 字体 + 9574 字笔顺数据
bash android/copy-assets.sh          # 把原型打进 Android assets
cd android && ./gradlew assembleDebug # 产物 app/build/outputs/apk/debug/app-debug.apk
```

> 代码库不含字体和笔顺数据（体积大），由 `scripts/fetch-assets.mjs` 按需拉取；
> 仓库只有几百 KB，clone 很快。

## 目录

```
android/        Android 包壳工程（Kotlin + WebView + WebViewAssetLoader，无 INTERNET 权限）
prototype/      Web 原型（渲染管线 / 骨架提取 / 装饰 / 界面）
scripts/        素材拉取脚本
docs/           需求文档、原型交互规格
```

## 许可证

字体均为 SIL OFL 1.1（见 `prototype/fonts/manifest.json`）；
笔顺数据来自 hanzi-writer-data（Arphic Public License），仅用于推导书写顺序，商用前需法务确认。
