# 给 Muse 的现成提示词（复制粘贴）

```
任务：把这个仓库打成 Android debug APK，我要装到手机上看效果。

仓库：<你的仓库地址>
说明文档：CLOUD_BUILD.md（仓库根目录）
一键脚本：muse/signature-apk-builder/bin/build-apk.sh

请执行：
git clone <你的仓库地址> ~/workspace/signature-studio
cd ~/workspace/signature-studio
bash muse/signature-apk-builder/bin/build-apk.sh

要求：
1. 缺 JDK17 / Android SDK 就装（脚本会自动处理）
2. 构建成功后，把 app-debug.apk 的体积和绝对路径告诉我
3. 如果失败，把完整报错贴出来，不要自己改项目代码
4. 不要给 AndroidManifest 加 INTERNET 权限
```

更省事的话，把 `muse/signature-apk-builder/` 整个目录放到 Muse 的
`~/workspace/custom-skills/signature-apk-builder/`，它以后就能按技能调用。
