<div align="center">

# GitMon

**你的仓库，是一只活着的精灵。**

把任意 GitHub / Gitee 仓库孵化成一只能升级、会进化的像素精灵。

[![Status](https://img.shields.io/badge/status-prototype%20%C2%B7%20v0.1-ffcb05?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-3da639?style=flat-square)](#)

</div>

---

## 这是什么

输入一个仓库地址，GitMon 会扫描它，然后交给你一个**卡包**。

打开卡包的瞬间，精灵破壳而出——它的**品种由技术栈决定**，**品质由代码质量决定**，**等级由工程量决定**。

```
┌─────────────────────────────────┐
│  GITMON              [ SSR ]    │
│                                 │
│         ▄▄▄▄▄▄▄▄▄               │
│       ▄█████████▄▄              │
│      ████  ●●  ████             │   ← 种子确定性像素立绘
│      ████  ●●  ████             │      同一仓库，永远同一只
│       ▀█████████▀               │
│                                 │
│  Lv.682  ▓▓▓▓▓▓▓▓░░  HP 940     │
│                                 │
│  攻击 82  防御 91  速度 74       │
│  特攻 88  特防 79  HP   94       │
│                                 │
│  ◈ 张量洪流   ◈ 梯度俯冲         │
└─────────────────────────────────┘
```

## 判定体系

| 维度 | 由什么决定 | 说明 |
|---|---|---|
| **品种** | 技术栈 × 项目类型 | Python=水系、JS=雷系、Rust=钢系…；AI/数据=龙型、CLI=鸟型、Web=兽型 |
| **品质** | 代码质量 | 测试 25% + 工程质量 20% + 文档 20% + 维护健康 20% + 社区认可 15% → N / R / SR / SSR |
| **等级** | 工程量 | LOC + commits + 文件数 + 贡献者 + 活跃月数，对数归一化；上限 **Lv.999** |
| **根基** | 底盘稳不稳 | 测试 30% + 提交粒度 20% + 时间沉淀 15% + 文档 20% + 真实性 15% → 稳固 / 尚可 / 松动 / 根基不稳 |
| **词条** | 脾气与代价 | 由信号判定（不是随机抽）：测试苦行僧、卷王、稳如老狗…／裸奔无测试、沉睡症、**根基不稳**… |

> 关键设计：**同仓库必得同精灵**。以 `platform/owner/repo` 做种子，不能刷初始；但品质会随仓库兴衰动态升降——补测试、写文档，精灵当场变强。
>
> **AI 率只压根基，不压品质**：AI 辅助写出来的仓库往往配置齐全、品质不低，代价在"改起来容易塌"。所以它不掉品质，而是压根基、给负面词条（六维 −8%、升级更慢）；想洗掉词条只有一条路——补测试、拆提交、人工重构。

## 玩法

- 🎴 **开包**：品质决定卡包外观，SSR 金光闪闪
- ⬆️ **养成**：commit +2 XP、合并 PR +10 XP、发 release +50 XP
- 🧬 **进化**：幼体 → 成长体（Lv.150+）→ 完全体（Lv.500+）
- ⚔️ **对战**：1–3 只组队上竞技场，属性克制 + 先制 + 异常状态 + 换人，3v3 回合制
- 😴 **沉睡**：30 天不维护，精灵会睡过去 —— 别让它睡
- 📇 **图鉴**：收集你所有仓库的精灵

## 快速开始

```bash
npm install
npm run dev
# → http://127.0.0.1:5173
```

输入任意仓库地址试试：

```
https://github.com/facebook/react
https://gitee.com/mirrors/vue
```

## 技术栈

```
React 18 · Vite 5 · 纯 CSS 动画 · Canvas 像素绘制
零运行时依赖的精灵生成器（种子确定性）
```

| 模块 | 职责 |
|---|---|
| `src/engine.js` | 判定引擎：仓库地址 → 品种 / 品质 / 等级 / 六维 / 技能（纯函数，可复现） |
| `src/battle.js` | 战斗引擎：属性克制 / 伤害公式 / 状态 / 先制 / AI（纯函数 + 显式种子，可复现） |
| `src/rivals.js` | 内置 19 个知名仓库的离线快照 → 对手精灵，按玩家强度匹配 |
| `src/sprite.js` | 种子 → 像素精灵（对称轮廓 + 属性配色 + 进化阶段装饰） |
| `src/components/` | 卡包、精灵卡片、雷达图、竞技场 |

## 后端（已实现）

`backend/` 是一个 FastAPI 单体服务：真实扫描 GitHub / Gitee、真判定、真养成、真立绘。

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
GITHUB_TOKEN=ghp_xxx .venv/bin/python -m uvicorn gitmon_api.main:app --port 8000
# 文档 → http://127.0.0.1:8000/docs
```

```bash
curl -X POST localhost:8000/api/hatch/sync -H 'content-type: application/json' \
  -d '{"repo":"https://github.com/facebook/react"}'
```

- 扫描：文件树 + 元数据 + 依赖清单，12~17 个请求，快照缓存 6 小时
- 判定：语言占比定属性、依赖/结构定生态类型、五维加权定品质、对数归一化定等级
- 养成：commit/issue/PR/release/star → XP，Lv.999 上限，30 天不动会沉睡
- 立绘：种子确定性 PNG（零依赖自写编码器）+ README 徽章 SVG + 分享卡片

端点清单、判定口径、部署与前端接入见 [`backend/README.md`](backend/README.md)。

## 竞技场对战

回合制 3v3（也支持 1v1 / 2v2）：9 元素克制表、Pokémon Showdown 同款伤害公式与能力等级、灼烧/中毒/麻痹/沉睡、先制技与换人、PP 用尽自动"挣扎"。对手由内置知名仓库离线生成，三档难度按你队伍的等级中位数匹配。机制细节与借鉴边界见 [`docs/BATTLE.md`](docs/BATTLE.md)。

引擎自检（不依赖浏览器）：

```bash
npm run test:battle   # 属性表合法性、伤害不变量、120 场对局收敛、同种子复现
npm run test:parity   # 与官方 Showdown 引擎逐项对拍：81 组克制 + 178 次伤害样本，差异 0
```

> `test:parity` 用 `@pkmn/sim`（Pokémon Showdown 官方模拟器，MIT）当标准答案：把我们的属性表和自定义种族/招式灌进它的 Dex 跑真实对局，再把同样输入喂给 `src/battle.js` 比对。它只在 devDependencies 里，不进前端包体——Showdown 解包 46MB，作为运行时引擎无法接受（原因见 `docs/BATTLE.md` §0）。

## 离线 AI 味检测（aitrace）

不联网、不调模型，只看本地代码的措辞 / 结构 / 命名 / 生成痕迹 / 提交历史，给一个 0–100 的"AI 味"区间。结果只喂给**根基**，不对外展示原始分。

```bash
cd backend
.venv/bin/python -m gitmon_api.aitrace ..              # 人读报告
.venv/bin/python -m gitmon_api.aitrace .. --json       # JSON
.venv/bin/python -m gitmon_api.aitrace .. --evidence   # 带行号与命中片段
```

线上孵化时打开开关即可顺带检测（复用 scc 的浅克隆）：

```bash
GITMON_USE_SCC=1 GITMON_AI_TRACE=1 .venv/bin/python -m uvicorn gitmon_api.main:app --port 8000
```

AI 味 ≥50 → 词条「根基不稳」，≥75 → 「生成体」；根基分别封顶 55 / 38。详见设计文档 §12。

## 路线图

- [x] 前端原型：孵化 → 开包 → 精灵卡片全链路
- [x] 后端：GitHub / Gitee 真实扫描 + 判定引擎 + SQLite 图鉴 + 养成结算
- [x] README 动态徽章 / 分享卡片 SVG 端点
- [x] 根基与性格词条（含"根基不稳"减益与修复提示）
- [x] 离线 AI 味检测 CLI + 扫描钩子
- [x] 竞技场对战：属性克制 / 伤害公式 / 状态 / AI / 三档难度（`docs/BATTLE.md`）
- [ ] 前端切到真实 API（目前仍用 mock 引擎，可离线演示）
- [ ] 精灵成长与每日同步的前端展示
- [ ] AI 率按最近 90 天提交加权，让"补课"真能把词条洗掉
- [ ] 全服排行榜页面

## 参考与借鉴

这个项目的视觉、玩法与工程实现站在不少开源项目肩上，特此注明。**所有引用均为思路与视觉参考；标 ⚠️ 的 GPL 项目未复制任何代码。**

| 项目 | 我们借鉴了什么 | 协议 |
|---|---|---|
| [pack-opener-js](https://www.npmjs.com/package/pack-opener-js) | 开包动画机制：撕口、卡包盖飞出、稀有度辉光、卡牌翻面 | MIT |
| [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) ⚠️ | 全息闪卡的视觉语言（渐变 + blend-mode + 滤镜）。**仅作视觉参考，代码全部自研** | GPL-3.0 |
| [hover-tilt](https://github.com/simeydotme/hover-tilt) | 卡片跟随鼠标倾斜 + 辉光 | MIT |
| [pixel-sprite-monster-generator](https://github.com/sempitern0/pixel-sprite-monster-generator) | 种子确定性像素怪兽的生成思路（体型族 × 调色板 × 变体） | MIT |
| [tsParticles](https://github.com/tsparticles/tsparticles) | 开包 / 升级的粒子氛围 | MIT |
| [scc](https://github.com/boyter/scc) | 代码行、注释行、圈复杂度统计（后端浅克隆后调用） | MIT |
| [Pokémon Showdown](https://github.com/smogon/pokemon-showdown)（[@pkmn/sim](https://www.npmjs.com/package/@pkmn/sim)） | **战斗系统**：伤害公式（Gen5）、能力等级 −6..+6 分数表、先制→速度的行动顺序、灼烧/麻痹/睡眠处理、PP 与「挣扎」。引擎代码未引入（其数据层绑定官方图鉴，与仓库精灵不匹配），机制骨架按其实现重写 | MIT |
| 《赛尔号》(Seer) | 对战的克制/微弱/无效三档呈现与直球技能节奏（商业作品，仅玩法借鉴） | — |
| [github-readme-stats](https://github.com/anuraghazra/github-readme-stats) | 无状态 SVG 卡片端点的架构（缓存头 + 纯函数渲染） | MIT |
| github-tamagotchi | "宠物情绪映射仓库健康度"的状态机设计；宠物由仓库哈希派生的确定性思路 | 参考 |
| Repup / cli-pet / pixel-tamagotchi | 极简养成循环与"状态 ↔ 工程信号"的四维映射 | 参考 |
| PokeToken | 性格 / 个体值 / 闪光率的数值设计参照 | 参考 |
| [github-profile-trophy](https://github.com/ryo-ma/github-profile-trophy) / [Platane/snk](https://github.com/Platane/snk) / GitHub Skyline | README 游戏化的表达方式（徽章墙、贡献动画、年度报告） | 参考 |

> 竞品分析（github-tamagotchi 的完成度、我们不打"健康监控"正面战的原因）见设计文档 §11。

## 设计文档

完整的产品设计（判定公式、玩法数值、架构、竞品分析）见 [`docs/DESIGN.md`](docs/DESIGN.md)。

---

<div align="center">
<sub>编码即养成 · Built with pixels and commits</sub>
</div>
