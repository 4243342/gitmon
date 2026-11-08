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

## 三大判定体系

| 维度 | 由什么决定 | 说明 |
|---|---|---|
| **品种** | 技术栈 × 项目类型 | Python=水系、JS=雷系、Rust=钢系…；AI/数据=龙型、CLI=鸟型、Web=兽型 |
| **品质** | 代码质量 | 测试 25% + 工程质量 20% + 文档 20% + 维护健康 20% + 社区认可 15% → N / R / SR / SSR |
| **等级** | 工程量 | LOC + commits + 文件数 + 贡献者 + 活跃月数，对数归一化；上限 **Lv.999** |

> 关键设计：**同仓库必得同精灵**。以 `platform/owner/repo` 做种子，不能刷初始；但品质会随仓库兴衰动态升降——补测试、写文档，精灵当场变强。

## 玩法

- 🎴 **开包**：品质决定卡包外观，SSR 金光闪闪
- ⬆️ **养成**：commit +2 XP、合并 PR +10 XP、发 release +50 XP
- 🧬 **进化**：幼体 → 成长体（Lv.150+）→ 完全体（Lv.500+）
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
| `src/sprite.js` | 种子 → 像素精灵（对称轮廓 + 属性配色 + 进化阶段装饰） |
| `src/components/` | 卡包、精灵卡片、雷达图 |

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

## 路线图

- [x] 前端原型：孵化 → 开包 → 精灵卡片全链路
- [x] 后端：GitHub / Gitee 真实扫描 + 判定引擎 + SQLite 图鉴 + 养成结算
- [x] README 动态徽章 / 分享卡片 SVG 端点
- [ ] 前端切到真实 API（目前仍用 mock 引擎，可离线演示）
- [ ] 精灵成长与每日同步的前端展示
- [ ] 全服排行榜页面

## 设计文档

完整的产品设计（判定公式、玩法数值、架构、竞品分析）见 [`docs/DESIGN.md`](docs/DESIGN.md)。

---

<div align="center">
<sub>编码即养成 · Built with pixels and commits</sub>
</div>
