# 第三方代码声明（Third-party notices)

本项目引入的第三方代码及其许可证。除下表所列，其余代码均为本项目自研（MIT，见 `LICENSE`）。

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
