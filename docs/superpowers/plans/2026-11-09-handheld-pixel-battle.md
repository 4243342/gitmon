# 对战页/结算页 掌机像素风重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把竞技场战斗页与结算页从「暗蓝科技感」重做为掌机像素风（GBA 式 HP 角框、像素对话框、CRT 扫描线、S/A/B 评级结算），并把参考来源写进 README。

**Architecture:** 改动集中在 `src/battle-arena.css`（视觉主体重写）与 `src/components/Battle.jsx`（HP 面板移位、日志指示、结算结构）；新增本地像素字体资源；styles.css/顶栏（并发会话 lane）不动。验证用已有的 Playwright 脚本（桌面截图 + 390/430 溢出断言）+ `npm run build`。

**Tech Stack:** React + 纯 CSS（battle-arena.css）、GSAP（保留现有）、Playwright + Edge（验证）、本地 woff2 像素字体。

**Spec:** `docs/superpowers/specs/2026-11-09-handheld-pixel-battle-design.md`

---

### Task 1: 像素字体落地

**Files:**
- Create: `public/fonts/` 下中文像素字体 woff2（如「缝合像素字体 / Fusion Pixel」SIL OFL 授权）
- Modify: `src/battle-arena.css`（头部 @font-face + 变量）

- [ ] **Step 1:** 尝试获取字体：优先 `npm view`/CDN 下载 woff2 到 `public/fonts/`；网络不可用则 fallback：`font-family: "Courier New", monospace` + `text-shadow` 1px 错位模拟像素感，计划后续替换。
- [ ] **Step 2:** 在 battle-arena.css 添加：

```css
@font-face {
  font-family: 'PixelCN';
  src: url('/fonts/fusion-pixel-12px-proportional-zh_hans.woff2') format('woff2');
  font-display: swap;
}
.battle-stage { --font-pixel: 'PixelCN', 'Courier New', monospace; }
```

- [ ] **Step 3:** `npm run build` 确认资源打进 dist。Commit: `feat(battle): 引入像素字体基座`

### Task 2: 战场掌机屏幕感 + 像素描边体系

**Files:**
- Modify: `src/battle-arena.css`（`.battle-field`、新增 `.px-box` 工具类、单位面板/顶栏框体）

- [ ] **Step 1:** `.battle-field` 覆盖为掌机屏幕：背景改像素草地/竞技场分层（保留现有 radial 底色但加地平线分层）、加 CRT 扫描线与暗角：

```css
.battle-stage .battle-field::after {
  content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 2px, transparent 2px 4px),
    radial-gradient(120% 90% at 50% 50%, transparent 60%, rgba(0,0,0,.45) 100%);
}
```

- [ ] **Step 2:** 新增像素双线框工具类并替换 `.unit-panel`/`.battle-topbar`/`.battle-log` 圆角边框为硬边框：

```css
.battle-stage .px-box {
  border: 2px solid #f4ecd8; border-radius: 0;
  box-shadow: 0 0 0 2px #0b0f1a, inset 0 0 0 2px #0b0f1a;
  background: rgba(11, 15, 26, .92);
}
```

- [ ] **Step 3:** 桌面截图对比检查 → Commit: `feat(battle): 掌机屏幕感与像素描边`

### Task 3: GBA 式 HP 角框 + 分段血条

**Files:**
- Modify: `src/components/Battle.jsx`（UnitPanel 移到角落容器 / HPBar 分段渲染）
- Modify: `src/battle-arena.css`（`.hp-corner` 布局、分段格）

- [ ] **Step 1:** HPBar 改分段格渲染：`Array.from({length: 20})` 每格一个 `<i>`，按 hp 比例点亮；掉血格加 `flash` 动画（红一闪后消失）。保留 `hpPercent` 逻辑。
- [ ] **Step 2:** 布局：我方角框 `left/bottom`、敌方 `right/top` 绝对定位于 `.battle-field`；精灵对角站位不变。窄屏（≤560px）角框改回随行流避免重叠。
- [ ] **Step 3:** 截图核对：HP 框常驻、分段格掉血动效正常 → Commit: `feat(battle): GBA 式 HP 角框与分段血条`

### Task 4: 像素对话框战报 + 招式横幅演出

**Files:**
- Modify: `src/components/Battle.jsx`（`.battle-log` 结构、新增 `.move-banner`）
- Modify: `src/battle-arena.css`

- [ ] **Step 1:** `.battle-log` 改双线像素对话框 + 最新行 `▼` 指示 + 打字机动画（CSS `steps()` width 动画仅对 latest 行）。
- [ ] **Step 2:** 新增招式横幅：回合演出开始时顶部闪 `「精灵」使出「招式」！` 属性色大字（复用现有 log 首行数据驱动，200ms 进/800ms 停/300ms 出）。
- [ ] **Step 3:** 命中方形像素粒子：vfx-layer 粒子由圆点改 `width/height 4px` 方块 + `image-rendering: pixelated`；暴击闪白关键帧。Commit: `feat(battle): 像素对话框与招式演出`

### Task 5: 结算页重做（徽章 + S/A/B 评级 + 经验条）

**Files:**
- Modify: `src/components/Battle.jsx`（result 结构、grade 计算）
- Modify: `src/battle-arena.css`（结算样式 + keyframes）

- [ ] **Step 1:** 评级计算（纯函数放 Battle.jsx 顶部）：

```js
function battleGrade(winner, turn, alive, total) {
  if (winner !== 'player') return 'B'
  const score = (alive / total) * 60 + Math.max(0, 40 - turn * 3)
  return score >= 85 ? 'S' : score >= 60 ? 'A' : 'B'
}
```

- [ ] **Step 2:** 结算结构：像素五彩纸屑（20 个 `<i>` 随机延迟下落 keyframes）、中央像素徽章（✦ 换像素描边章：胜/负两版）、评级字母砸入（scale 3→1 + steps()）、统计行、经验条（20 格逐格点亮 + 数字滚动 rAF）、四个像素按键（`transform: translateY(2px)` :active）。
- [ ] **Step 3:** 走通完整流程截图验证 + 快进验证 → Commit: `feat(battle): 掌机风结算页与 S/A/B 评级`

### Task 6: README 参考章节

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** 在视觉/设计相关章节后追加：

```markdown
### 视觉风格与参考

对战页与结算页采用「掌机像素风」（2026-11 设计决策，设计文档见
`docs/superpowers/specs/2026-11-09-handheld-pixel-battle-design.md`）：

- **Shattered Pixel Dungeon**（GitHub ~7k★）— 像素面板、硬边双线描边框、整体像素质感
- **Pokémon Showdown**（GitHub ~9k★）— 对战信息分层原则：HP 常驻、日志独立、演出不遮挡信息
- **GBA 世代 HP 框设计语言** — 角落常驻 HP 框、分段血条、像素对话框 + ▼ 翻页指示
```

- [ ] **Step 2:** Commit: `docs: README 补充对战页掌机像素风参考来源`

### Task 7: 综合验证

- [ ] **Step 1:** 桌面 1280×900：战斗中 + 结算页截图视觉复核。
- [ ] **Step 2:** 390 与 430 视口：竞技场流程 `scrollWidth == vw` 断言（改 `/tmp/gitmon_arena_verify.py` 复用）。
- [ ] **Step 3:** `npm run build` 通过；`git status` 确认未误改 styles.css/game-theme.css（另一会话 lane）。
