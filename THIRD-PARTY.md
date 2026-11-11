# 第三方代码声明（Third-party notices)

本项目引入的第三方代码及其许可证。除下表所列，其余代码均为本项目自研（MIT，见 `LICENSE`）。

## inkjs（ink 剧情脚本运行时）

- 来源：<https://github.com/y-lohse/inkjs>（通过 `npm i inkjs` 引入，v2.4.0）
- 许可证：MIT，Copyright (c) Yannick Lohse（ink 原作者 inkle 亦为 MIT）
- 引入方式：**运行时直接依赖**。`src/story/runtime.js` 用 `Story` 执行编译后的剧情 JSON，`story.state.ToJson()` / `LoadJson()` 直接用于存档与回滚；`scripts/story-build.mjs` 在构建期用 `inkjs/compiler/Compiler` 把 `src/story/story.ink` 编译成 `story.json` / `story-data.js`。
- 使用范围：剧情模式（`docs/STORY.md`）。路线、选项、变量、战斗分支、多结局全部由 ink 脚本表达；本项目只实现台词生成、战斗与 UI。

完整许可证文本见 <https://github.com/y-lohse/inkjs/blob/master/LICENSE.md>。

## ajv（JSON Schema 校验）

- 来源：<https://github.com/ajv-validator/ajv>（通过 `npm i ajv` 引入，v8.20.0）
- 许可证：MIT，Copyright (c) Evgeny Poberezkin
- 引入方式：**构建期依赖**。`scripts/story-build.mjs` 用 ajv 校验 `src/story/characters.json` 与 `src/story/lines.json`（角色字段、台词 fallback 的完整性与长度），校验失败直接中断构建，不进入浏览器包体。
- 使用范围：剧情内容库的结构校验，对应设计文档「结构错误必须在启动时暴露」。

完整许可证文本见 <https://github.com/ajv-validator/ajv/blob/master/LICENSE>。

## pokemon-cards-css（卡面全息材质库）

- 来源：<https://github.com/simeydotme/pokemon-cards-css>（npm 包已下架，2022 年后不再发布，故从 GitHub 直接 vendor）
- 许可证：**GPL-3.0**，Copyright (c) Simeon Gooch
- 引入方式：**源码内置（vendor）**。拼接 `public/css/cards/` 下的 `base.css`、`cards.css`、`basic.css`、`regular-holo.css`、`cosmos-holo.css`、`rainbow-holo.css` 为单文件 [`src/vendor/pokemon-cards.css`](src/vendor/pokemon-cards.css)，许可证原文见 [`src/vendor/LICENSE-pokemon-cards-css`](src/vendor/LICENSE-pokemon-cards-css)；材质贴图（grain / glitter / cosmos / illusion）在 `public/pkcss/img/`。
- 仅两处改动：① 贴图 URL 前缀改为 `/pkcss/img/`；② 原库 `.card__rotator *` 通配选择器收窄为 `.card__rotator > *, .card__front > *`，避免强制改写本项目富内容卡片子元素的布局。其余为原样拼接。
- 使用范围：`src/App.jsx` 引入该文件（先于项目样式），`src/components/PetCard.jsx` 以 `.card` 结构 + `data-rarity`（N/R/SR/SSR → basic / rare holo / rare holo cosmos / rare rainbow）挂载材质，`src/styles.css` 的 `.gm-holo` 段做尺寸与覆盖；原库的 Svelte 指针驱动由组件内原生 `pointermove` / `pointerleave` 等价换算 CSS 变量实现。
- **GPL-3.0 影响**：该文件为原库衍生作品，**对外分发本项目时须以 GPL-3.0 提供其对应源码**（本仓库已随附）。

完整许可证文本见 <https://github.com/simeydotme/pokemon-cards-css/blob/main/LICENSE>。

## monstrjs（精灵立绘部件库）

- 来源：<https://github.com/vcgtz/monstrjs>（通过 `npm i monstrjs` 引入，v1.0.0）
- 许可证：MIT，Copyright (c) Vicente Gutierrez (@vcgtz)
- 引入方式：**深路径引入纯 JS 核心**。`src/sprite.js` 只 import `monstrjs/dist/sprites/index.js`（8 种手绘体型位图 + 眼睛/嘴/腮红/耳/尾/四肢/配饰/花纹部件 + `composeMonster` 合成器）、`monstrjs/dist/core/prng.js`（Mulberry32）与 `monstrjs/dist/monster/grid.js`；CLI、sharp PNG 导出等 Node 侧代码不进入浏览器构建产物。
- 使用范围：`src/sprite.js` 用它的部件位图与合成器绘制精灵：游戏 6 种生态体型（兽/鸟/元素/龙/幻兽/精灵）映射到 monster 类型（bear/birdie/blob/dino/alien/bunny），调色板由属性双色派生成五色盘（主色/肚皮/点缀/描边/高光），部件按 `spriteSeed` 确定性抽取，进化阶段（1–3）控制配饰与花纹密度。选片顺序、对称化（`applySymmetry`）等合成流程与上游一致。

完整许可证文本见 <https://github.com/vcgtz/monstrjs/blob/main/LICENSE>。

## pixelfx（攻击特效库）

- 来源：<https://github.com/patch-gg/pixelfx>（通过 `npm i github:patch-gg/pixelfx` 引入，锁 v0.3.0）
- 许可证：MIT，Copyright (c) 2026 Patch
- 引入方式：**按模块引入**。Vite 只打包 `src/vfx.js` 里 import 的约 35 个特效模块与 `src/core`，整库（含图鉴/工具）不会进入构建产物，单独拆为 `vfx-*.js` chunk（gzip 约 94KB），进入竞技场时才加载。
- 使用范围：`src/vfx.js` 调用其 `createFrame / createFx / composite` API，把 `fx/fire`、`fx/water`、`fx/lightning`、`fx/impacts`、`fx/nature`、`fx/explosions`、`fx/projectiles`、`fx/spawn` 下的特效贴到对战精灵身上。特效绘制全部由 pixelfx 实现，本项目只做选片、定位与生命周期回收（`src/vfx.js`）。
- 上游说明（摘自 pixelfx `NOTICE.md`）：
  - **Hugo Duprez** — `src/core/sim.js` 及部分特效改写自 [Sprite Fusion 的像素特效](https://www.spritefusion.com/pixel-art-vfx)，Copyright (c) 2026 Hugo Duprez，MIT。
  - **rehan-remade** — `src/core/act.js` 借鉴 [Hollow Crown](https://github.com/rehan-remade/hollow-crown) 的技能演出时序（12fps 定格、命中停顿、弹性靶子），Copyright (c) 2026 rehan-remade，MIT。
- 上游 NOTICE：仓库 gallery 里的 Patch Pixel 字体不在 MIT 范围内——本项目未引用任何 gallery 字体/图片资源，不受影响。

完整许可证文本见 <https://github.com/patch-gg/pixelfx/blob/main/LICENSE>。

## 口袋宝贝（口袋精灵2）精灵立绘与图鉴数据

- 来源：<https://github.com/DD1323222/kdjl2>（「口袋精灵2 源码」，MySQL dump `kdjl_mysql_data.sql` 的 `bb` 表 + `kdjl/images/bb/` 精灵图）
- 许可证：**上游未声明开源许可证**（默认保留全部权利）；上游 README 声明「仅供个人学习使用，素材内容来源网络」，精灵美术素材疑为官方宝可梦系素材的同人沿用。
- 引入方式：**素材移植（转码，不引代码）**。`bb` 表 383 只精灵的名称 / 五行 / 六维 / 成长率 / 抗性 / 进化链 / 图鉴文案整理为 `src/story/packs/default/roster.json`；站立图（`z*.gif`）与头像（`t*.gif`）转为动态 WebP，放入 `src/story/packs/default/art/bb<id>.webp` / `bb<id>_face.webp`，由 `characters.json` 挂到剧本角色立绘槽（Boss 槽不挂图，用剧情选中的仓库精灵）。
- 使用范围：剧情模式「仓可梦」包（`docs/STORY.md`）的精灵立绘与随包图鉴。**对外分发前请自行清理或替换该批素材**；如需合规替代，可用本项目种子像素系统（monstrjs）重出立绘。
