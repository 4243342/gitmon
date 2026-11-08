<div align="center">

# GitMon

**你的仓库，是一只活着的精灵。**

把任意 GitHub / Gitee 仓库孵化成一只能升级、会进化的像素精灵。

[![Status](https://img.shields.io/badge/status-prototype%20%C2%B7%20v0.1-ffcb05?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-3da639?style=flat-square)](#)
[![Third-party](https://img.shields.io/badge/third--party-notices-8b8b8b?style=flat-square)](THIRD-PARTY.md)

</div>

---

## 这是什么

输入一个仓库地址，GitMon 会扫描它，然后交给你一个**卡包**。

打开卡包的瞬间，精灵破壳而出——它的**品种由技术栈决定**，**品质由代码质量决定**，**等级由工程量决定**。

输入一个**账号主页**（或组织主页），得到的则是**一整箱卡包**：该账号拥有的每个项目各一包，品质各算各的——SSR 包金光闪闪，N 包灰头土脸。

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
- 🔊 **过场音效**：双层音轨——pack-opener-js 的礼成采样（指尖铝箔、掀盖、抽卡风声、落地一击，SSR 落得最重）+ WebAudio 合成的芯片音（卡包登场、整箱琶音、翻格连打、收图鉴铃音）
- 📦 **整箱**：输入账号主页 = 该账号每个项目一包，一键全开、批量收图鉴
- ⬆️ **养成**：commit +2 XP、合并 PR +10 XP、发 release +50 XP
- 🧬 **进化**：8 个节点、9 个形态，Lv.10 起每跨一个台阶换一次外形，**Lv.500 起化为人形态**（详见下节）
- ⚔️ **对战**：1–3 只组队上竞技场，属性克制 + 先制 + 异常状态 + 换人，3v3 回合制
- 🏋️ **训练场**：竞技场下方的 AI 编程工具入口，六款软件点一下直达，去过自动打卡（详见下节）
- 💥 **攻击特效**：pixelfx 代码绘制的像素特效——9 属性 × 4 档威力各有一套，会心有整屏冲击帧
- 😴 **沉睡**：30 天不维护，精灵会睡过去 —— 别让它睡
- 🖼️ **自定义形象**：不喜欢默认立绘？在卡片上直接上传 / 拖一张图（GIF 动图也行）换成你想要的形象，卡面、图鉴、对战、分享卡全场景生效，IndexedDB 本地保存，一键还原
- 📇 **图鉴**：收集你所有仓库的精灵

## 进化系统

进化**只看等级**，不看仓库大小也不看 star —— 养它就变强。8 个节点、9 个形态：

| 阶段 | 起始等级 | 形态名 | 形态 |
| --- | --- | --- | --- |
| 1 | Lv.1 | 幼体 | 兽形 / 元素形（种族决定，见下） |
| 2 | **Lv.10** | 初生体 | 同上，体型长大一号 |
| 3 | **Lv.50** | 成长体 | 同上，长出耳 / 角 / 尾等特征 |
| 4 | **Lv.100** | 成熟体 | 同上，配饰与花纹开始密集 |
| 5 | **Lv.200** | 强化体 | 同上，体型接近成体 |
| 6 | **Lv.300** | 完全体 | 同上，兽形最终阶 |
| 7 | **Lv.500** | 人形态 | **开始直立人形**：人类身体 + 种族/属性特征（兽耳、龙角、羽翼、元素光环…） |
| 8 | **Lv.800** | 人形态·觉醒 | 人形态 + 强化装束 / 光效 |
| 9 | **Lv.999** | 人形态·神话 | 满级终形 |

- **Lv.500 以上一律是人形态**，只有华丽度差异；**500 以下是自由形态**——具体长相由「种族 × 属性」组合决定（7 种族 × 9 属性，见 [`docs/ASSETS.md`](docs/ASSETS.md)），不逐阶固定
- 卡片上的进化条显示 `当前阶/9` 与下一节点等级；进度条是**当前阶段内**的进度，不是全局等级
- 立绘规则：自备素材按 `<种族>/<属性>-s<阶>.png` 命名，没有就逐级回落到通用图，再没有就用生成的像素精灵
- 阶段只由等级推导（`src/evolution.js` / 后端 `engine.evolution_stage`），后端每日结算**只会升不会降**

## 快速开始

```bash
npm install
npm run dev
# → http://127.0.0.1:5173
```

首屏是**登录授权页**：三种进法——GitHub、Gitee、游客。匿名接口只有 60 次/小时（扫四个仓库就用完），
登录后额度高得多，而且**不用再填仓库地址**：登录哪个平台，就自动读你名下每个项目，一箱卡包直接摆出来。

游客进法和以前一样：自己贴地址，单仓库是一包，账号主页是一整箱：

```
https://github.com/facebook/react      ← 一个卡包
https://github.com/4243342             ← 一整箱
https://gitee.com/mirrors/vue          ← Gitee 也行
```

## 登录授权

三个入口：GitHub / Gitee / 游客。登录后首页变成「我的卡箱」，不再有仓库输入框。

| 方式 | 怎么做 | 适合 |
|---|---|---|
| **GitHub OAuth** | 后端配 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`，点「用 GitHub 授权登录」 | 正式部署 / 任何设备 |
| **GitHub 本机登录** | 本机已 `gh auth login` 且后端跑在 `127.0.0.1`，点「用本机已登录的 @xxx 直接进入」 | 本地开发，不用建 OAuth App |
| **Gitee OAuth** | 后端配 `GITEE_CLIENT_ID` / `GITEE_CLIENT_SECRET`，点「用 Gitee 授权登录」 | Gitee 用户 |
| **私人令牌（兜底）** | 平台没配 OAuth 应用时，页签里才出现令牌输入框（[一分钟生成](https://gitee.com/profile/personal_access_tokens)） | 没建应用时 |
| **游客** | 直接进入，手填仓库 / 账号地址 | 只想试玩 |

规则很简单：**配了 OAuth 就只走授权，没配才露出令牌输入框**，不会让人在两条路之间犹豫。
本机 `backend/.env` 里 GitHub、Gitee 两个应用都已配好，所以两个页签现在都只有授权按钮。
Gitee 的 `access_token` **只有 1 天有效期**：后端把 `refresh_token` 一起加密存库，
取令牌时校验一次（缓存 10 分钟），过期就静默刷新；刷新不了才让你重新点一次授权。

GitHub 在 <https://github.com/settings/developers>，Gitee 在 <https://gitee.com/oauth/applications>。
两个应用后台都有两栏，**只有「回调地址」这一栏有硬性要求**：

| 平台 · 字段 | 填什么 |
|---|---|
| GitHub · Homepage URL | `http://127.0.0.1:8000`（填仓库地址也行，只是展示链接） |
| GitHub · Authorization callback URL | `http://127.0.0.1:8000/api/auth/github/callback` |
| Gitee · 应用主页 | `http://127.0.0.1:8000`（同样可填仓库地址） |
| Gitee · 应用回调地址 | `http://127.0.0.1:8000/api/auth/gitee/callback` |
| Gitee · 权限 | `user_info` + `projects` |

> ⚠️ **回调地址不能填 `https://github.com/4243342/gitmon` 这类仓库地址。** 授权成功后平台会跳到
> 那个地址并附加 `?code=...&state=...`，仓库页面不会把授权码交回后端，code 直接丢失；而且平台
> 做的是**整串精确匹配**（`localhost` ≠ `127.0.0.1`，多一个斜杠也不行），对不上就直接报
> 「无效的登录回调地址 / redirect_uri_mismatch」。

本机 `backend/.env` 已用 `GITHUB_CALLBACK_URL` / `GITEE_CALLBACK_URL` 把回调固定成上表两个值，
所以用 `127.0.0.1` 还是 `localhost` 打开都不会漂移，登录页上显示的就是可直接复制的正确值。
改完后台可以跑 `node scripts/check-oauth.mjs` 自检：它会比对后端报的回调地址与授权跳转实际带的
`redirect_uri` 是否一致。部署到公网时把这两行换成 `https://你的域名/...`，并在两个平台后台同步改。
（不建应用也能用私人令牌登录：把 `.env` 里该平台两行留空，页签会自动切回令牌框。）

凭证写进 `backend/.env`（启动时自动加载，不用 export）：

```ini
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITEE_CLIENT_ID=...        # 留空则页签回退到私人令牌
GITEE_CLIENT_SECRET=...    # 同上
```

登录后令牌分别写在 `localStorage['gitmon:gh_token']` / `['gitmon:gitee_token']`，
`src/scan.js` 自动带上它直连对应平台；后端会把令牌用 HMAC 流加密后存进本地 SQLite，
浏览器只留一个 HttpOnly 会话 cookie。后端不可用时自动降级为"本地令牌"模式，扫描仍在浏览器里完成。

## 技术栈

```
React 18 · Vite 5 · PixiJS 8（开包舞台）· tsParticles 4（粒子）
纯 CSS 动画 · Canvas 像素绘制 · WebAudio 芯片音效（零音频素材）
monstrjs 手绘部件拼装精灵（种子确定性）· 自研战斗引擎（纯函数，可与官方 Showdown 对拍）
```

| 模块 | 职责 |
|---|---|
| `src/auth.js` | 登录授权：GitHub / Gitee OAuth → 会话、令牌落地、离线降级 |
| `src/components/AuthPage.jsx` | 首屏登录授权页（额度说明、双平台切换、游客入口） |
| `src/engine.js` | 判定引擎：仓库地址 → 品种 / 品质 / 等级 / 六维 / 技能（纯函数，可复现） |
| `src/battle.js` | 战斗引擎：属性克制 / 伤害公式 / 状态 / 先制 / AI（纯函数 + 显式种子，可复现） |
| `src/rivals.js` | 内置 36 个知名仓库的离线快照 → 对手精灵；在线扫描 / 同类型 / 随机三种挑选 |
| `src/vfx.js` | 攻击特效层：按属性×威力选 [pixelfx](https://github.com/patch-gg/pixelfx) 特效并贴到精灵身上（懒加载分包） |
| `src/sprite.js` | 种子 → 像素精灵（[monstrjs](https://github.com/vcgtz/monstrjs) 手绘部件拼装：8 体型 × 眼嘴腮红耳尾四肢配饰，双属性配色 + 进化阶段配饰） |
| `src/customSprite.js` | 每只精灵的自定义形象：上传 / 拖拽 → 方形裁剪 → IndexedDB，全场景优先显示 |
| `src/assets/species/` | 种族立绘素材（可选）：`<种族>/<属性>.png` 放进去自动生效，规格见 [`docs/ASSETS.md`](docs/ASSETS.md) |
| `src/components/` | 卡包、精灵卡片、雷达图、竞技场、训练场 |

> 每个库与每份素材的出处、许可证、以及"取了哪一部分"都在下方 [参考与借鉴（来源总表）](#参考与借鉴来源总表) 里逐条列出。

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

三种挑战：**在线对手**（单项目 1v1：填对方仓库按真实强度打；整仓：填对方账号让它的项目排队上，最多 3v3；命中内置快照可离线打）、**同类型对战**（只从和先发同属性的仓库里挑，克制关系清楚）、**随机宠物**（36 只内置对手随机抽）。后两种可调三档难度（对手六维 ×0.65 / ×1 / ×1.35）。9 元素克制表、Pokémon Showdown 同款伤害公式与能力等级、灼烧/中毒/麻痹/沉睡、先制技与换人、PP 用尽自动"挣扎"。机制细节与借鉴边界见 [`docs/BATTLE.md`](docs/BATTLE.md)。

引擎自检（不依赖浏览器）：

```bash
npm run test:battle   # 属性表合法性、伤害不变量、120 场对局收敛、同种子复现
npm run test:parity   # 与官方 Showdown 引擎逐项对拍：81 组克制 + 178 次伤害样本，差异 0
```

> `test:parity` 用 `@pkmn/sim`（Pokémon Showdown 官方模拟器，MIT）当标准答案：把我们的属性表和自定义种族/招式灌进它的 Dex 跑真实对局，再把同样输入喂给 `src/battle.js` 比对。它只在 devDependencies 里，不进前端包体——Showdown 解包 46MB，作为运行时引擎无法接受（原因见 `docs/BATTLE.md` §0）。

## 训练场

首页「竞技场」入口正下方的功能区：把常用的 AI 编程工具当成教练，点卡片在**新标签页**直达对应软件。不消耗体力、不写入对战战绩；点过的工具会在本机 `localStorage` 记一次打卡，页面顶部显示 `已打卡 N / 6`。

| 工具 | 厂商 | 形态 | 直达地址 |
| --- | --- | --- | --- |
| Trae | 字节跳动 | AI IDE（国内版） | `https://www.trae.cn/`（卡片附国际版） |
| WorkBuddy | 腾讯 | AI 工作台 | `https://www.workbuddy.cn/`（附产品文档） |
| Codex | OpenAI | 编程智能体 | `https://chatgpt.com/codex`（附产品页） |
| Cursor | Anysphere | AI 编辑器 | `https://www.cursor.com/` |
| Claude Code | Anthropic | 终端 Agent | `https://claude.ai/code`（附官方文档） |
| Grok Bot | xAI | 云端 Bot | `https://x.ai/bot`（附上手指南） |

实现：`src/training-tools.js`（链接清单，改地址只动这一个文件）、`src/components/Training.jsx`、`src/training.css`；`src/App.jsx` 增加 `training` 视图与首页入口。所有外链都带 `target="_blank" rel="noopener noreferrer"`。

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
- [x] 账号整箱孵化：账号主页 → 每个项目一个卡包（`docs/DESIGN.md` §2.3）
- [x] 后端：GitHub / Gitee 真实扫描 + 判定引擎 + SQLite 图鉴 + 养成结算
- [x] README 动态徽章 / 分享卡片 SVG 端点
- [x] 根基与性格词条（含"根基不稳"减益与修复提示）
- [x] 离线 AI 味检测 CLI + 扫描钩子
- [x] 竞技场对战：在线对手 / 同类型 / 随机宠物三种挑战 + 三档难度（`docs/BATTLE.md`）
- [x] 训练场：六款 AI 编程工具直达入口 + 本机打卡（`src/training-tools.js`）
- [x] GitHub 登录授权：首屏授权页 + OAuth / 本机 gh 登录态（60 → 5000 次/小时）
- [x] 三选一登录：GitHub / Gitee / 游客；登录后自动读账号全部项目开除整箱，不再手填仓库
- [ ] 前端切到真实 API（判定仍在前端跑，扫描已用真实数据）
- [x] Gitee OAuth 应用已配置：授权码换 token + refresh_token 静默续期（1 天有效期）
- [ ] 精灵成长与每日同步的前端展示
- [ ] AI 率按最近 90 天提交加权，让"补课"真能把词条洗掉
- [ ] 全服排行榜页面

## 参考与借鉴（来源总表）

这个项目的每一个视觉细节、玩法机制和工程取舍都站在开源项目肩上，逐项列清来源、协议、**我们具体取了什么**、**落在哪个文件**。没有列在下表的代码与素材，均为本项目自研。

### 一、直接引入的代码与素材（会进构建产物）

| 来源 | 我们用了什么 | 落点 | 协议 |
|---|---|---|---|
| [pack-opener-js](https://www.npmjs.com/package/pack-opener-js) `0.5` | **开包动画引擎**：手指划开撕口 → 卡包盖飞出 → 卡牌带品质辉光翻面；slice / burst / carousel 三种机制、稀有度辉光色随品质切换 | [`src/components/PackOpening.jsx`](src/components/PackOpening.jsx) | MIT |
| [PixiJS](https://github.com/pixijs/pixijs) `8` | pack-opener-js 的 WebGL 渲染后端（我们只做实例配置与素材喂入） | 随 pack-opener-js 间接引入 | MIT |
| [tsParticles](https://github.com/tsparticles/tsparticles) `4`（`@tsparticles/react` + `slim`） | 开包揭晓与升级的粒子氛围，配色按 N / R / SR / SSR 参数化 | [`src/components/RevealBurst.jsx`](src/components/RevealBurst.jsx) | MIT |
| [pixelfx](https://github.com/patch-gg/pixelfx) `0.3` | **对战攻击特效**：按模块引入约 35 个程序化像素特效（火 / 水 / 雷 / 冲击 / 爆裂 / 投射 / 生成），按招式属性与威力选片，单独打包、进竞技场才加载 | [`src/vfx.js`](src/vfx.js) | MIT |
| ↳ [Sprite Fusion Pixel Art VFX](https://www.spritefusion.com/pixel-art-vfx)（Hugo Duprez） | pixelfx 的 `core/sim.js` 与部分特效改写自此，为本项目的粒子物理/光照缓冲提供底层 | 间接依赖 | MIT |
| ↳ [Hollow Crown](https://github.com/rehan-remade/hollow-crown)（rehan-remade） | pixelfx 的 `core/act.js` 借了它"技能演出"的节奏（12fps 定格、命中停顿、弹性靶子），本项目的特效时序即走这条链路 | 间接依赖 | MIT |
| [Kenney Pixel UI Pack](https://kenney.nl/assets/pixel-ui-pack) | **整套 UI 图块**：9-slice 像素按钮（5 色 × 常态 / 按下）、面板、品质盾徽（N / R / SR / SSR）、剑（技能）、胶囊条（属性条）、箭头 / 手型 / 菱形指针 | [`src/assets/kenney/`](src/assets/kenney/) → 由 [`src/game-theme.css`](src/game-theme.css) 消费 | **CC0** |
| [monstrjs](https://github.com/vcgtz/monstrjs) `1.0` | **精灵立绘部件库**：8 种手绘怪物体型（blob / bunny / kitty / birdie / puppy / bear / dino / alien）+ 眼睛 / 嘴 / 腮红 / 鼻子 / 眉毛 / 耳朵 / 尾巴 / 四肢 / 配饰 / 花纹位图与拼装合成器 | [`src/sprite.js`](src/sprite.js)：取其纯 JS 核心（`dist/sprites` / `dist/core/prng` / `dist/monster/grid`，CLI 与 sharp 渲染不进包）；6 生态体型映射怪物类型，调色板换成双属性五色盘，进化阶段控制配饰密度 | MIT |
| [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（TakWolf） | 12px 中文像素字体，全量汉字 woff2（940 KB），界面正文与战报 | [`src/assets/fonts/`](src/assets/fonts/) | **OFL-1.1** |
| [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)（via [@fontsource](https://fontsource.org/fonts/press-start-2p)） | 街机标题字体：等级数字、品质徽标、按钮大写标签 | `src/main.jsx` 引入 `400.css` | **OFL-1.1** |
| [scc](https://github.com/boyter/scc) | 后端浅克隆后统计 LOC / 注释行 / **圈复杂度** / COCOMO → 喂给工程量与「特防（可维护性）」维度 | `backend/`（`GITMON_USE_SCC=1`） | MIT |
| [@pkmn/sim](https://www.npmjs.com/package/@pkmn/sim) | **只在测试里用**：把我们的属性表与自定义种族灌进官方 Dex 当"标准答案"，对拍 81 组克制 + 178 次伤害样本 | [`scripts/showdown-parity.mjs`](scripts/showdown-parity.mjs)（devDependency） | MIT |

### 二、只借思路，代码全部自研

| 来源 | 借了什么 | 边界 | 协议 |
|---|---|---|---|
| [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) | **战斗系统骨架**：Gen5 伤害公式、能力等级 −6..+6 分数表、先制 → 速度的行动顺序、灼烧 / 麻痹 / 睡眠的处理方式、PP 与「挣扎」、STAB 与会心框架 | 图鉴数据与招式全自研；机制按其实现重写，未引入代码（原因见 [`docs/BATTLE.md` §0](docs/BATTLE.md)） | MIT |
| 《赛尔号》(Seer) | 「克制 / 微弱 / 无效」三档克制呈现、以属性技能为核心的直球节奏 | 商业作品，零素材零代码 | — |
| [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) ⚠️ | **全息闪卡的视觉语言**：多层渐变 + `blend-mode` + 滤镜，高光随指针位置移动 | GPL-3.0 有传染性 → 仅作视觉参考，CSS 全自研（`PetCard.jsx` 的 `--mx` / `--my` / `--rx` / `--ry` + `.holo-layer` / `.glare`） | GPL-3.0 |
| [hover-tilt](https://github.com/simeydotme/hover-tilt) | 指针归一化到 −0.5..0.5 再映射倾斜角的换算方式与阻尼手感 | 自研 `useState` 实现，**未装依赖** | MIT |
| [pixel-sprite-monster-generator](https://github.com/sempitern0/pixel-sprite-monster-generator) | **种子确定性立绘**：体型族 × 调色板 × 变体（心情 / 史诗）的三层生成结构 | v0.5 前的立绘方案（32×32 程序化绘制）；观感不佳，已被 monstrjs 部件拼装替代（见上表），保留致谢 | MIT |
| [gen_me_a_pixamon](https://github.com/pixmusix/gen_me_a_pixamon) | 单 u64 种子 → 确定性 PNG 的极简路线（服务端预生成的取舍依据） | 未移植代码，只定架构方向 | MIT |
| [github-readme-stats](https://github.com/anuraghazra/github-readme-stats) | 无状态 SVG 卡片端点架构：纯函数渲染 + 缓存头 + 主题参数 | SVG 渲染自研 | MIT |
| github-tamagotchi | 「情绪状态机映射仓库健康度」的设计；宠物由仓库哈希派生的确定性思路 | 我们做的是品种 / 品质 / 等级，不做健康监控（见 [`docs/DESIGN.md` §11](docs/DESIGN.md)） | 参考 |
| Repup / cli-pet / pixel-tamagotchi | 极简养成循环的可行性、"状态 ↔ 工程信号"的四维映射、git hook 即时同步 | 工程信号口径与数值全自定 | 参考 |
| PokeToken | 性格 / 个体值 / 闪光率的数值设计与孵蛋加权 | 替换为「根基 + 词条」双轨，弱化随机 | 参考 |
| [Platane/snk](https://github.com/Platane/snk) / [GitHub Skyline](https://skyline.github.com/) / [github-profile-trophy](https://github.com/ryo-ma/github-profile-trophy) | README 游戏化的表达方式：Action 定时生成 + 稳定 URL、年度仪式感、成就墙 | 徽章与卡片端点自研 | 参考 |

### 三、调研过、最终没有采用

| 来源 | 为什么没要 | 协议 |
|---|---|---|
| [canvas-confetti](https://github.com/catdad/canvas-confetti) | tsParticles 一个库就覆盖了礼花 + 星光 + 烟花，少一个依赖 | MIT |
| [tokei](https://github.com/XAMPPRocky/tokei) | 语言识别准、速度也不错，但**没有圈复杂度**——而复杂度正是我们要喂给「特防」的输入 | MIT / Apache-2.0 |
| [cloc](https://github.com/AlDanial/cloc) | 大仓库实测慢 10–20 倍，只留作交叉验证 | GPL-2.0 |
| [OctoCounts](https://octocounts.com/) | 封装 tokei 的在线服务；自建 scc 后不需要 | 商用服务 |
| [Pokemon-Pack-Sim](https://github.com/jaip18/Pokemon-Pack-Sim) | React Three Fiber 的 3D 翻卡很漂亮，但强耦合 Pokémon TCG API，只当**动画编排**参考 | MIT |
| [pokemon-card-game](https://github.com/trungLyDal/pokemon-card-game) | 开包 + 收藏全套实现，架构可看，代码质量一般 | MIT |
| [procedural-pixel-creatures](https://github.com/idlerunner00/procedural-pixel-creatures) | Godot / C# 耦合重，立绘质量虽高但移植成本不划算 | 待核实 |
| [github-readme-streak-stats](https://github.com/DenverCoder1/github-readme-streak-stats) | 连续贡献卡片的展示形式参考，暂未实现 | MIT |

### 协议与合规

- 本项目自身以 **MIT** 发布（见 [`LICENSE`](LICENSE)）。
- **GPL 项目零代码复用**：`pokemon-cards-css` 只提供视觉参考，仓库内没有任何其代码片段；如未来需要可原地替换掉自研全息层。
- **素材许可原文随仓库**：[`src/assets/kenney/LICENSE.txt`](src/assets/kenney/LICENSE.txt)（CC0）、[`src/assets/fonts/LICENSE-fusion-pixel.txt`](src/assets/fonts/LICENSE-fusion-pixel.txt)（OFL-1.1）。
- **复制的第三方代码**单独声明在 [`THIRD-PARTY.md`](THIRD-PARTY.md)（当前为 pixelfx 与 monstrjs，含打包范围说明）。
- 更细的选型评估见 [`docs/DESIGN.md` §10 开源资源调研](docs/DESIGN.md)，竞品分析见 §11，对战借鉴边界见 [`docs/BATTLE.md` §0](docs/BATTLE.md)。

## 设计文档

完整的产品设计（判定公式、玩法数值、架构、竞品分析）见 [`docs/DESIGN.md`](docs/DESIGN.md)。

---

<div align="center">
<sub>编码即养成 · Built with pixels and commits</sub>
</div>
