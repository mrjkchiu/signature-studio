# 云端出 APK 指南

给云端机器（Muse / 任何云主机 / CI）用的构建说明。**不需要这台手机参与**。

产物：`android/app/build/outputs/apk/debug/app-debug.apk`（可直接装机）。

---

## 0. 先把仓库交给云端

仓库只有 ~500KB（字体和笔顺数据由脚本拉，不进 git）。三种方式任选：

**A. 用 Git 托管（推荐，Muse 直接 clone）**
```bash
# 在 GitHub / Gitee 上先建一个空仓库（不要勾选初始化 README）
cd <仓库根目录>
git remote add origin https://github.com/<你的账号>/signature-studio.git
git push -u origin main
```
然后把仓库地址给 Muse，让它 `git clone <地址>`。
> 私有仓库要给 Muse 只读权限：GitHub 用 fine-grained token（只勾 repo 读），Gitee 用「只读部署公钥」。

**B. 没有远程仓库时，用 bundle 单文件**
```bash
# 仓库里已生成 dist/signature-studio.bundle
git clone dist/signature-studio.bundle signature-studio
cd signature-studio
git remote set-url origin <等你有远程后填>
```
把 `dist/signature-studio.bundle`（74KB）传给 Muse 即可，它用上面第一条命令就能还原出完整仓库。

**C. 直接给 zip**：`dist/signature-handoff.zip`（63KB），解压即可，但没有 git 历史。

---

## 0.1 方案选择

| 方案 | 做法 | 耗时 | 适合 |
| --- | --- | --- | --- |
| **A · WebView 包壳**（已就绪） | 把 Web 原型打进 assets，Kotlin 只写一个 WebView | 云端 ~5 分钟 | 先在真机上跑起来、验证触控和性能 |
| B · 原生 Kotlin 移植 | renderer/skeleton 用 Kotlin + Compose 重写 | 2–4 周 | 正式上架、要 60fps 与系统集成 |

现在仓库里方案 A 已完整可构建；方案 B 另开分支做。

---

## 1. 环境要求

- Linux 云主机（x86_64 或 arm64 均可），内存 ≥ 8GB，磁盘 ≥ 20GB
- Ubuntu 22.04 / 24.04
- 需要能访问 Google Maven（`dl.google.com`）；国内机器建议挂镜像或代理

```bash
# JDK 17 + Node + 解压工具
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk unzip curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 2. 拉素材

```bash
cd <仓库根目录>
node scripts/fetch-assets.mjs
```

会下载 11 套 OFL 字体（缺失会自动跳过，不阻塞）和 9574 字的笔顺数据。

> 笔顺数据来自 `hanzi-writer-data`，采用 Arphic Public License，这里只借"笔画顺序"，
> 字形来自艺术字体自身骨架。若要商用上架，这一步的授权需要法务确认（见 HANDOFF.md §3）。

## 3. 装 Android SDK

```bash
sudo mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
curl -fsSL -o cmdline.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
sudo unzip -q cmdline.zip -d /opt/android-sdk/cmdline-tools
sudo mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest

export ANDROID_HOME=/opt/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 4. 打包资源 + 构建

```bash
cd <仓库根目录>
bash android/copy-assets.sh        # 把 Web 原型 + 字体 + 笔顺数据拷进 app assets
cd android

# 装 Gradle 8.7（或系统已有 gradle 8.x 就用系统的）
curl -fsSL -o /tmp/gradle.zip https://services.gradle.org/distributions/gradle-8.7-bin.zip
sudo unzip -q /tmp/gradle.zip -d /opt && sudo ln -sf /opt/gradle-8.7/bin/gradle /usr/local/bin/gradle

gradle wrapper --gradle-version 8.7
./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`，`adb install -r` 或直接传手机安装。

## 5. 体积与瘦身

默认把 11 套字体全打进去，APK 约 **90–120MB**。想瘦身：

- 只复制需要的字体到 `android/app/src/main/assets/www/fonts/`，
  `copy-assets.sh` 会自动裁剪 `renderer.js` 里的 `FONTS` 列表
- 3 套字体（马善政 + 志莽行书 + 霞鹜文楷）+ 全部笔顺数据 ≈ **35MB**
- 笔顺数据已按字按需加载，但整个目录仍会打进 APK；后续可改成首次启动时按需下载

## 6. 为什么不需要网络权限

页面里用 `fetch()` 读笔顺 JSON、用 `FontFace` 加载 ttf。
WebView 默认不允许 `file://` 页面发 fetch，所以 `MainActivity` 用
**`WebViewAssetLoader`** 把 assets 挂到 `https://appassets.androidplatform.net/assets/www/`。
请求在客户端被拦截，没有真正出网，因此 **AndroidManifest 里没有 INTERNET 权限**，
"完全离线、名字不外传"这条卖点成立。

## 7. 常见坑

| 现象 | 原因 / 解决 |
| --- | --- |
| 白屏 | `index.html` 路径不对；确认 assets 里是 `www/index.html`，且 `loadUrl` 用 appassets 域名 |
| 字体不显示 | assets/www/fonts 里没有对应 ttf，或 `FONTS` 里还有已删字体的条目（跑 `copy-assets.sh` 会自动裁） |
| fetch 报 CORS/失败 | 用了 `file://`；必须走 WebViewAssetLoader |
| 构建报 AGP/Java 版本 | 需要 JDK 17（AGP 8.x 不支持 JDK 8/11） |
| 首次渲染慢 | 骨架计算是纯 JS，首字 ~50ms、4 字较长；已有缓存和「逐笔分析中」提示 |

## 8. 接入 Muse（或任何云端 Agent）

把整个仓库（或 `dist/signature-handoff.zip`）交给它的云电脑，让它按 §1–§4 执行即可。
需要确认的三件事见对话里的提问：
1. Muse 以什么形式收项目（git 仓库 / zip / 网盘链接 / API token）
2. 它的云电脑能否访问 `dl.google.com`（不能的话要换 Maven 镜像或让它在云端装 SDK 后缓存）
3. 是否允许它执行 sudo（装 JDK/SDK 需要）

## 9. 兜底：GitHub Actions 自动出包（不依赖 Muse）

仓库里已带 `.github/workflows/build-apk.yml`：
代码推到 GitHub 的 `main` 分支后，Actions 会自动拉素材、构建，并把 `app-debug.apk`
挂在本次运行的 **Artifacts** 里（保留 14 天）。
在 Actions 页面点开最近一次运行 → 页面底部 `signature-studio-debug-apk` 下载即可。
想手动触发：Actions → build-apk → Run workflow。

> 条件：仓库是 public，或你自己的账号跑的 Actions；免费额度对个人项目足够。
