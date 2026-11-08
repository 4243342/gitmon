# GitMon Backend

把仓库孵化为精灵的后端：**扫描 → 判定 → 立绘 → 养成**。
FastAPI 单体，SQLite 单文件，进程内任务队列，无 Redis / 无 Celery / 无微服务。

```
backend/
├── gitmon_api/
│   ├── main.py          # 应用装配：CORS / 限流 / 静态托管 / 每日结算
│   ├── api.py           # REST 端点（只做校验与序列化）
│   ├── services.py      # 编排：扫描 → 判定 → 落库 → 结算
│   ├── engine.py        # 判定引擎（纯函数）：品种 / 品质 / 工程量 / 六维 / 技能
│   ├── growth.py        # 养成：XP 曲线、升级、进化、沉睡
│   ├── sprite.py        # 种子 → 像素 PNG（纯 stdlib，自写 PNG 编码）
│   ├── badge.py         # README 徽章 / 分享卡片 SVG
│   ├── db.py            # SQLite（WAL）：pets / growth_log / snapshots
│   ├── queue.py         # 进程内扫描队列（单 worker 串行）
│   ├── repo.py          # 仓库地址解析
│   └── scanner/         # GitHub / Gitee 扫描器 + 文件树分析 + 依赖清单解析
└── tests/               # 58 个用例：判定、养成、立绘、API 全链路
```

## 快速开始

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # 填 GITHUB_TOKEN（强烈建议）
.venv/bin/python -m uvicorn gitmon_api.main:app --host 127.0.0.1 --port 8000
# → http://127.0.0.1:8000/docs
```

首次真实孵化（同步接口，1~30 秒，取决于仓库规模与平台网络）：

```bash
curl -X POST localhost:8000/api/hatch/sync \
  -H 'content-type: application/json' \
  -d '{"repo":"https://github.com/facebook/react"}'
```

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/hatch` | 提交扫描任务，返回 `jobId`（202） |
| POST | `/api/hatch/sync` | 同步孵化，直接返回精灵 |
| GET | `/api/jobs/{jobId}` | 轮询任务状态（`queued` / `running` / `done` / `failed`） |
| GET | `/api/pets` | 我的图鉴（按 `X-Gitmon-User` 隔离，默认 public） |
| GET | `/api/pets/{id}` | 详情（含最近 20 条成长流水） |
| POST | `/api/pets/{id}/sync` | 重新扫描并结算 XP（返回 `sync.events`） |
| DELETE | `/api/pets/{id}` | 移出图鉴 |
| GET | `/api/pets/{id}/growth` | 成长流水 |
| GET | `/api/pets/{id}/sprite.png` | 立绘 PNG（永久缓存） |
| GET | `/api/sprites/{platform}/{owner}/{repo}.png` | 按仓库取立绘（未入库则自动登记） |
| GET | `/badge/{platform}/{owner}/{repo}.svg` | README 徽章，`Cache-Control: 6h` |
| GET | `/card/{platform}/{owner}/{repo}.svg` | 分享卡片 |
| GET | `/api/leaderboard` | 全服排行（按等级） |
| GET | `/api/health` `/api/meta` | 健康检查 / 判定常量 |

README 里直接嵌：

```markdown
[![GitMon](https://your-host/badge/github/facebook/react.svg)](https://github.com/facebook/react)
```

## 判定口径（与 DESIGN.md 对应）

| 维度 | 取值来源 | 实现位置 |
|---|---|---|
| 元素属性 | 文件树各语言体积占比 → 主语言；次语言 ≥30% 产出双属性 | `engine.derive_species` |
| 生态类型 | 依赖清单 + 目录结构 + topic + 描述关键词打分（Web/CLI/AI/移动/游戏/文档/库） | 同上 |
| 品质分 | 测试 25% · 工程 20% · 文档 20% · 维护 20% · 社区 15% | `engine.quality_dimensions` |
| 工程量分 | LOC 35% · 提交 20% · 文件 15% · 贡献者 15% · 年龄 15%，全部对数归一化 | `engine.engineering_score` |
| 初始等级 | 工程量分分段映射到 Lv.1–999（§5.2） | `engine.level_from_engineering` |
| 六维 | 提交频率 / CI+测试 / 活跃度 / 依赖广度 / 文档+复杂度 / 年龄 | `engine.stats_for` |
| XP | commit +2（日上限 20）、关 issue +5、合并 PR +10、release +50、star +1 | `growth.XP_RULES` |
| 进化 | Lv.150 且（有 release 或 ≥5 贡献者）→ 成长体；Lv.500 且（≥100 star 或 ≥10 release）→ 完全体 | `engine.evolution_stage` |
| 沉睡 | 30 天无提交 → `sleeping`，停止成长 | `growth.status_for` |

**确定性**：`seed = fnv1a("platform/owner/repo")`，`spriteSeed = fnv1a(seed + fullName)`，
与前端 `engine.js` 完全同算法。重新扫描只更新等级/品质，品种、种子、立绘永久锁定。

## 扫描是怎么做的

不克隆代码。GitHub / Gitee 都取递归文件树（含每个 blob 的字节数），据此算出语言占比、
代码文件数、测试文件占比、CI/lint/类型配置文件、文档完备度，再叠加仓库元信息、
贡献者数、提交活跃度（GitHub 用 `/stats/participation`，Gitee 按周分桶）、release、
issue / PR 计数与依赖清单（最多 6 份）——单次扫描 12~17 个请求，快照缓存 6 小时。

想让 LOC 和复杂度变成精确值：装好 [`scc`](https://github.com/boyter/scc) 后设 `GITMON_USE_SCC=1`，
会浅克隆后跑 `scc --format json`，覆盖树体积估算值。

配额提示：GitHub 匿名 60 次/小时，大约只够 4 次扫描；**务必配 `GITHUB_TOKEN`**（5000 次/小时）。
Gitee 匿名配额更紧，建议配 `GITEE_TOKEN`。配额耗尽会返回 429 并附带 `Retry-After` 与配置提示。

## 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` / `GITEE_TOKEN` | 空 | 平台令牌，强烈建议配置 |
| `GITMON_DATA_DIR` | `./data` | SQLite 与立绘目录 |
| `GITMON_CACHE_TTL` | `21600` | 快照缓存（秒） |
| `GITMON_DAILY_SYNC` | `0` | 开 1 后每天定时结算一批精灵 |
| `GITMON_CORS_ORIGINS` | `http://127.0.0.1:5173` | 允许的前端来源，逗号分隔 |
| `GITMON_RATE_LIMIT` | `120` | 单 IP 每分钟请求上限（0 = 不限） |
| `GITMON_SPRITE_STYLE` | `rich` | `rich` 32×32 分层立绘；`classic` 16×16（与旧版 canvas 逐像素一致） |
| `GITMON_USE_SCC` | `0` | 是否浅克隆 + scc 精确统计 |
| `GITMON_STATIC_DIR` | 自动探测 `../dist` | 前端构建产物目录 |

`X-Gitmon-User` 头是匿名设备标识（前端 localStorage 生成），用来隔离每个人的图鉴；
不传就落到公共图鉴 `public`。私有仓库需要 OAuth，当前明确不支持。

## 部署

单容器即可（前端产物由后端直接托管，构建上下文是仓库根目录）：

```bash
npm run build                                   # 先产出 dist/
docker build -f backend/Dockerfile -t gitmon .
docker run -p 8000:8000 -e GITHUB_TOKEN=xxx -v gitmon-data:/app/data gitmon
```

## 前端接入

前端当前是纯 mock 引擎（`src/engine.js`），换成真实数据只需两步：

```js
// src/api.js
const BASE = import.meta.env.VITE_API_BASE ?? ''
const user = localStorage.getItem('gitmon-user') ?? (() => {
  const id = crypto.randomUUID().slice(0, 12)
  localStorage.setItem('gitmon-user', id)
  return id
})()

export async function hatchRepo(repo) {
  const created = await fetch(`${BASE}/api/hatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Gitmon-User': user },
    body: JSON.stringify({ repo }),
  }).then((r) => r.json())

  for (let i = 0; i < 90; i++) {
    const job = await fetch(`${BASE}/api/jobs/${created.jobId}`).then((r) => r.json())
    if (job.status === 'done') return job.pet     // 字段与现有 hatch() 返回值同构
    if (job.status === 'failed') throw new Error(job.error || '扫描失败')
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  throw new Error('扫描超时')
}
```

返回的精灵对象字段与前端 mock 完全一致（`element` / `species` / `quality` / `stats` / `skills` /
`level` / `evolutionStage` / `spriteSeed` / `qualityScore` / `engineeringScore`），额外带
`id`、`spriteUrl`、`qualityDims`、`expToNext`、`notes` 等。开发期在 `vite.config.js` 里加代理即可：

```js
server: { proxy: { '/api': 'http://127.0.0.1:8000', '/badge': 'http://127.0.0.1:8000' } }
```

离线/无后端时前端 mock 引擎仍然可用，不影响原型演示。

## 测试

```bash
.venv/bin/python -m pytest        # 58 passed
```

覆盖：地址解析、判定确定性、品种识别、品质单调性、工程量/等级映射、XP 上限与升级、
沉睡与进化门槛、立绘确定性、徽章/卡片 SVG 转义、API 全链路（孵化 / 缓存命中 / 任务流 /
用户隔离 / 同步加 XP / 立绘 / 徽章 / 删除 / 排行 / 静态托管）。

## 已知边界

- **私有仓库**不支持（需 OAuth，见 DESIGN.md §12）。
- **立绘与前端 canvas 不再逐像素一致**：前端已在做自己的 32×32 生成器，后端默认 `rich`
  风格是独立实现，靠同一个 `spriteSeed` 保持"同仓库同精灵"的确定性与可复现；
  若要复刻旧版 16×16 外观，设 `GITMON_SPRITE_STYLE=classic`。
- **Gitee 的提交总量**没有总数接口，最多翻 3 页（300）封顶；日常 XP 用 `since` 精确数增量，不受影响。
- **首屏延迟**：未缓存仓库一次扫描 10~30 秒，所以 `/api/hatch` 走队列 + 轮询；
  `/api/hatch/sync` 只建议脚本或预热使用。
- SQLite 单写多读，单机够用；真要横向扩容，按 DESIGN.md §8.7 换 Postgres 并拆扫描 worker。
