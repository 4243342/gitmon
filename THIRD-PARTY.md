# 第三方代码声明（Third-party notices)

本项目引入的第三方代码及其许可证。除下表所列，其余代码均为本项目自研（MIT，见 `LICENSE`）。

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
