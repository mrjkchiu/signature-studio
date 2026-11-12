# 签名工坊 · 云端出 APK

## 什么时候用

用户要把「动态艺术签名 App」的原型打成 Android 安装包（APK），用于真机体验/验收。
仓库是 Kotlin + WebView 包壳，资源（字体、笔顺数据）由脚本拉取，**仓库本身只有几百 KB**。

## 先要的信息

1. 仓库地址（公开仓库最好；私有仓库需要只读凭证——这种情况才需要走 connector/credential 流程）
2. 是否要瘦身：默认 11 套字体全打进去，APK 约 100–120MB；只留 3 套约 35MB

## 一条命令

```bash
git clone <仓库地址> ~/workspace/signature-studio
cd ~/workspace/signature-studio
bash muse/signature-apk-builder/bin/build-apk.sh
```

脚本会：装 JDK17（缺则装）→ 装 Android SDK 34 → `fetch-assets` 拉 11 套 OFL 字体 +
9574 字笔顺数据 → 打进 assets → Gradle 构建 → 打印 APK 绝对路径。

**已验证**：`copy-assets.sh` 在本地实跑通过（116MB assets / 11 套字体 / 9575 字笔顺）；
`build-apk.sh` 已完成语法检查，尚未在真实云端跑过完整流程（标为未验证）。

## 产物

`android/app/build/outputs/apk/debug/app-debug.apk`
脚本最后一行输出 `APK_ABS_PATH=/...`，把这个路径作为交付。

## 常见失败与处理

| 现象 | 处理 |
| --- | --- |
| 缺 node | 按脚本提示装 Node 20+ |
| `dl.google.com` 不通 | 换镜像或预置 SDK；报错原文给人看 |
| gradle 构建报 AGP/JDK 版本 | 必须 JDK17（AGP 8.5 不支持 8/11） |
| 字体不显示 | 跑 `copy-assets.sh`，它会自动裁剪 `renderer.js` 的 FONTS 到实际存在的字体 |
| 白屏 | assets 里必须是 `www/index.html`；入口走 WebViewAssetLoader 的 appassets 域名 |
| APK 太大 | 只保留 `prototype/fonts/` 里需要的字体再跑 `copy-assets.sh` |

## 交付方式

- 最省事：APK 留在云端 workspace，把路径给用户，用户自己下载
- 需要长期分发：上传到 GitHub Releases 或网盘 → 这一步涉及第三方 API 凭证，
  才需要按 Muse 的 custom-connector 流程建 connector（`credentials.request_api_access`）

## 不要做的事

- 不要把 APK 或字体提交回仓库（`.gitignore` 已排除）
- 不要改 `android/app/src/main/AndroidManifest.xml` 加 INTERNET 权限——
  项目卖点是「完全离线、名字不外传」，资源由 WebViewAssetLoader 本地拦截
