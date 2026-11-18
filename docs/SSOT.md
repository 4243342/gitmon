# SSOT：图鉴与养成状态的统一真相源

状态：已定稿，作为前后端同步实现的唯一契约。实现分歧以本文为准。

## 1. 决策

**后端 SQLite `pets` 表是图鉴/养成状态的唯一真相源（SSOT）。**
`localStorage['gitmon:collection:v2']` 降级为「本地镜像 + 离线缓冲」：UI 永远先读本地（不等网络），
本地每次变更异步推送服务端；推送失败不丢数据，留在脏队列重试。

不属于本 SSOT（维持现状，本地存储）：

- 自定义立绘（IndexedDB）、扫描快照缓存（`gitmon:snap:*`）、令牌/登录态
- 战斗编队、开过的卡包、静音、训练打卡等轻 UI 状态
- 战斗过程与对手快照（rivals 生成即用即弃）

**背包余额与流水同样以服务端为唯一真相源**（表 `inventory_items` / `inventory_ledger`）。
前端每次打开仓库页或精灵详情页都重新拉 `/api/inventory`，不做本地镜像、不缓存：
两边各存一份账迟早会对不上，而玩家对不上账是零容忍的。
localStorage 里**不允许**出现余额副本。

## 2. 身份（owner_key 归属）

解析优先级（`api.py::owner_key`）：

1. 已登录（session cookie）→ `user:{provider}:{login}`（跨浏览器、跨设备一致）
2. 否则 `X-Gitmon-User` 请求头（前端 localStorage `gitmon:device` 生成一次的设备 ID）
3. 否则 `public`

前端**所有**对 `/api/*` 的 fetch 都必须带 `X-Gitmon-User` 头（登录态下由规则 1 覆盖，头仍发）。
现有测试只走 header 路径，行为不变。

**这个头同时也是服务端限流的分流键**（`main.py::_limit_identity`）：限流按
`ip + X-Gitmon-User` 记一份 60 秒滑动窗口，另有一份 `ip` 总桶（额度 ×4）防伪造头刷量。
漏带头不只影响图鉴归属 —— 请求会全部落进 `public` 桶，多个客户端共吃一份额度并提前撞 429。
新增 `/api/*` 请求时务必复用 `src/sync.js::ownerHeader()`，不要手写 `headers`。

不限流：`OPTIONS` 预检、`/api/health`、`/api/meta`、`/api/auth/me`、
`/api/auth/providers`、`/api/jobs/{id}`（轮询）。429 带真实 `Retry-After` 与
`X-RateLimit-Limit / Remaining / Reset`，详见 `backend/README.md`「服务端限流」。

## 3. 数据模型映射

前端 pet 对象（`engine.judge()` 产物 + 运行时字段）→ 服务端：

| 前端字段 | 去向 |
|---|---|
| `platform` `owner` `repo` `fullName` | 列 `platform/owner/repo/full_name` |
| `seed` `spriteSeed` | 列 `seed/sprite_seed` |
| `element.key` / `elementSecondary?.key` / `species.key` | 列 `element_key/element_secondary/species_key` |
| `quality.key`（或 `qualityKey`） | 列 `quality` |
| `qualityScore` `qualityDims` `engineeringScore` | 列 `quality_score/quality_dims/engineering_score` |
| `level` `exp` `evolutionStage` | 列 `level/exp/evolution_stage` |
| `stats` `skills` | 列 `stats/skills` |
| `foundation` `foundationDims` `traits` | 列 `foundation/foundation_dims/traits` |
| `aiRate` | 列 `ai_rate` |
| `bond` `status` `description` `notes` | 同名列 |
| `battles` `wins` | **新列 `battles/wins`（INTEGER DEFAULT 0）** |
| `id` `createdAt` `syncedAt` `spriteUrl` `htmlUrl` `spriteUrl` | 服务端管理，入站忽略 |
| **其余全部**（`ivs` `baseStats` `combatPower` `statCap` `maxHp` `milestones` `engineeringParts` `qualityKey` `traitHints` `xpMultiplier` `traitSummary` `foundationTier` `expToNext` `source` `aiEvaluated` …） | **新列 `client_state`（TEXT JSON `{}`）原样 round-trip** |

规则：

- 服务端**不解释** `client_state`，只存取；派生/展示字段由前端维护。
- 出站（`pet_to_api`）合并顺序：`{**client_state 展开, **列字段}` —— 列字段优先，`client_state` 补缺。
- 列字段走 `_ADDED_COLUMNS` 迁移（`battles` `wins` `client_state`），老库平滑升级。
- 行定位键：`(platform, full_name, owner_key)`；`id` 由服务端 `_pet_id` 计算，入站 `id` 忽略。

## 4. API 契约

### `PUT /api/pets`（新增，批量 upsert）

请求：`{"items": [<完整前端 pet 对象>, …]}`，上限 60 条/次。
响应：`{"items": [<pet_to_api 出站形态>, …], "saved": n}` —— 返回的是服务端权威版本。

语义：

- 按定位键逐条 upsert：存在则覆盖列字段与 `client_state`，不存在则新建（服务端算 `id`、`created_at`，`synced_at=now`）。
- **推送即覆盖**（last-push-wins）：客户端写入是明确意图，不做入站时间戳比较。
- 缺必填（platform/fullName）的条目跳过，不整体 4xx。

### `GET /api/pets`（已有）

`?limit≤200&offset` 返回 `{items, count}`，`items` 为出站形态（含 `battles/wins` 与 client_state 展开字段）。
按 `created_at DESC`。启动拉取用 `limit=200`。

`/api/hatch`、`/api/pets/{id}`、leaderboard 等现有接口不变。

### `GET /api/inventory`（新增，背包快照）

响应：`{"currency": "stardust", "items": [...目录], "balances": {item_key: count}, "offers": [...货架], "ledger": [...流水]}`

- `items` / `offers` 是商品目录（服务端常量），`balances` 是该 owner 的持有量。
- `ledger` 为最近流水，按时间倒序，每行 `{item_key, delta, reason, created_at, offer_key}`。
- `delta > 0` 是收入，`delta < 0` 是支出。

### `GET /api/shop`（新增，货架）

响应：`{"currency", "items", "offers": [...{"key","item_key","price","limit","sort","bought"}], "balances"}`。
`bought` 是该 owner 已兑次数（限购判定用）。

### `POST /api/shop/exchange`（新增，兑换）

请求：`{"offer_key": "bond_charm", "request_id": "<客户端生成>"}`

- **`request_id` 是幂等键**：同一个 id 重复提交只扣一次款，第二次返回 `{"duplicate": true}`。
  客户端在重试时必须复用同一个 id（`App.jsx::handleExchange` 用 `buyReqIds` ref 记住）。
- 扣款与发货在**同一个事务**里完成，余额不可能变负。
- 余额不足 / 买满限购 → `400 {"error": ..., "hint": ...}`。

### `POST /api/inventory/grant`（新增，发奖）

请求：`{"item_key", "count", "source_key", "reason"}`

- `source_key` 是幂等键：同一个 `source_key` 重复发放只发一次（`ux_ledger_source` 唯一索引）。
  战斗结算用 `battle:{ts}:{seq}`、剧情结算用 `story:{ts}:{seq}`，重放不会重复发奖。

### `POST /api/inventory/spend`（新增，消耗）

请求：`{"item_key", "count", "reason"}`。持有量不足 → `400`。

### 任务模式 `/api/quest/*`（新增）

任务实例（`quest_runs` 表）同样以服务端为唯一真相源：前端不存任务、
不缓存判定结果，只把服务端返回的 `result` / `evidence` / `reward` 原样显示。

#### `GET /api/quest/board`

响应：`{"goals": [{key, title, brief, accept[], verifyLevel, reward, quota, target, runs[]}], "time"}`

- `quota`：`{dailyLimit, issuedToday, slotsLimit, slotsUsed, cooldownDays}`。
  `issuedToday` 按**本地自然日**统计（服务端用 `time.mktime` 算当日纪元秒区间，
  不在 SQL 里写 `date(..., 'localtime')` —— 见 §7 附注）。
- `target`：**固定的目标**（活动任务只认配置里的那一个仓库），
  字段 `{petKey, platform, fullName, owner, repo, htmlUrl, stars, fixed}`。
  `stars` 取自快照缓存，**仅供展示**，不参与判定。
  注意是**单对象**，不是数组 —— 目标固定，没有得挑。
- `runs[]`：该 owner 还没复审完的任务实例（`status='fixing'`）。

#### `POST /api/quest/issue`

请求：`{"goal_key": "star", "target": "github-owner/repo"}`

- `target` **可留空**（后端按配置的目标走）；传了但跟配置不一致 → `409`，
  不静默替换（静默忽略会让人以为领到了别的仓库）。
- 目标来自环境变量 `GITMON_QUEST_TARGET`（默认 `4243342/gitmon`），
  格式 `owner/repo`（GitHub）或 `gitee/owner/repo`（Gitee）。
- 领取时后端**现拉一次**目标仓库的星数作为基线（`payload.starsBefore`），
  不用 6 小时快照缓存 —— 缓存里的星数是旧的，拿它当基线会误判。
- 拒绝条件（都返回 `{"error", "hint"}`）：
  - `409` 目标与配置不符 / 冷却期内（30 天）/ 手上还有没复审完的任务
  - `429` 今日额度用尽（1 个/天）

  判定顺序是**额度 → 冷却 → 未复审**：冷却期比额度长，
  反过来会让额度那条永远触发不到，规则成了死代码。
  两条条件同时成立时先报冷却（更根本，玩家才知道要等多久）。

#### `POST /api/quest/verify`

请求：`{"id": "<run_id>"}`

响应：`{"run", "result", "missing", "delta", "attributed", "reward"}`

三态判定：

| result | 条件 | 奖励 |
|---|---|---|
| `passed` | 星数上涨 **且** 归因核对确认是本人点的 | 全额（星尘 40 + 词条碎片 1）|
| `partial` | 星数上涨，但归因不足（没令牌 / 令牌说没收藏过） | 40%（星尘 16），可继续复审 |
| `failed` | 星数没涨 / 读不到星数 | 不发奖 |

- 复审上限 5 次，第 6 次返回 `429` 并把任务置为 `expired`。
- `partial` 升 `passed` 时**补发差额**（不重发）：`source_key=quest:{run_id}:{item}:{tier}`。
- 已通过的任务重复提交返回 `{"duplicate": true}`，**不重复发奖**。
- 归因核对用**玩家自己的**平台令牌（`X-GitHub-Token` / `X-Gitee-Token` 头，
  或登录会话令牌）：`GET /user/starred/{owner}/{repo}` 返回 204 = 已收藏、404 = 没收藏。
  服务端兜底令牌代表站点账号，不能用来归因。

#### `GET /api/quest/history`

响应：`{"items": [...], "stats": {total, done, passRate, passed, partial, failed}}`

## 5. SQLite 附注：`date()` 在索引里的坑

`quest_runs` 的唯一索引用 `date(issued_at, 'unixepoch')` 切自然日。三个实测结论：

1. `date(REAL)` 对 Unix 时间戳返回 `NULL` —— 必须带 `'unixepoch'` 修饰符。
2. `date('now','unixepoch')` **恒为 `NULL`**（`'now'` 是 UTC 字符串，`unixepoch` 只认纪元秒）。
   拿它当「今天」会让比较永不成立，每日额度直接失效。
3. 带 `'localtime'` 的 `date()` 在 SQLite 里是**非确定性函数**：索引能建出来，
   但 INSERT 会报 `non-deterministic use of date() in an index`。

所以索引只用纯 `date(issued_at, 'unixepoch')`（UTC 日界），
本地自然日切分全部交给业务层用纪元秒区间做（`quest._today_range`）。

## 6. 同步协议

### 启动（App 启动 effect 内，`loadCollection()` 之后）

1. `flushQueue()`：脏队列非空则先 `PUT /api/pets` 推送（失败则中止后续 pull，保留队列）。
2. `GET /api/pets?limit=200` 拉取服务端清单。
3. 合并（逐 pet，键 `platform|fullName`）：
   - 本地在脏队列中 → **本地赢**（等推送）；
   - 否则 → **服务端赢**；
   - 服务端有本地无 → 追加；本地有服务端无且不脏 → 丢弃（已被别端删除）；若服务端清单**整体为空**且本地非空 → 视为首次引导，本地全量入队推送。
4. 合并结果 `saveCollection()` 落本地（此写不重新入队）。

### 变更（任意本地 mutation：收图鉴、战斗结算、升级、喂养…）

1. 现有代码照常 `upsertPet/saveCollection` → localStorage 立即更新（UI 零延迟）。
2. `markDirty(fullNames)` 把变更键写入脏队列 `gitmon:sync_queue`。
3. debounce 600ms → `PUT /api/pets`（只发脏 pet 的完整对象）→ 成功：用响应覆盖本地对应条目、清队列；失败：保留队列，等下次启动或 30s 定时重试。

### 离线/降级

后端不可达时一切照旧写本地，静默重试；**任何同步失败都不得阻塞或回滚 UI 操作**。

### 引导迁移

老用户本地已有图鉴、服务端为空 → 按启动规则 3 的首次引导自动上云，无需手工迁移。

## 7. 非目标（本期不做）

- 战斗编队、开包记录、训练打卡的跨端同步
- 增量 diff / 版本向量 / 字段级三方合并（LWW 足够）
- 后端解释或校验 `client_state` 内容
- 自定义立绘上云
- 分页拉取超过 200 条的超大图鉴（如需再加 cursor）
