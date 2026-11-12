# 第三方资源声明

## 字体（SIL Open Font License 1.1）
马善政毛笔楷书 / 志莽行书 / 柳建毛草 / 龙藏体 / 站酷快乐 / 站酷小薇 / 站酷庆科黄油体 /
霞鹜文楷 Lite / 霞鹜漫黑 / 悠哉字体 / 得意黑
—— 逐字体来源见 `prototype/fonts/manifest.json`。OFL 允许商用，需保留本声明。

## 图标
App 图标中的「签名」图形取自 **Tabler Icons**（MIT License）
- 图形：`tabler:signature`
- 来源：https://github.com/tabler/tabler-icons
- 许可：MIT，允许商用与修改，需保留版权与许可声明

生成脚本：`prototype/tools/make-icon-final.mjs`（渐变底色为程序化生成，非第三方素材）。

## 笔顺数据
`hanzi-writer-data`（项目内已移除，仅由 `scripts/fetch-assets.mjs` 拉取）
- 来源：https://github.com/chanind/hanzi-writer-data
- 许可：Arphic Public License
- 用途：**仅借用"笔画书写顺序"**，字形轮廓与笔锋来自艺术字体自身的骨架提取
- ⚠️ 商用上架前需法务确认该许可的衍生作品条款

## 构建期依赖
- @napi-rs/canvas（MPL-2.0，仅开发/构建期用于生成图标与自查）
- @resvg/resvg-js（MPL-2.0，仅构建期）
- AndroidX WebKit（Apache-2.0）
