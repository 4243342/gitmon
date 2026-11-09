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

## 2. 身份（owner_key 归属）

解析优先级（`api.py::owner_key`）：

1. 已登录（session cookie）→ `user:{provider}:{login}`（跨浏览器、跨设备一致）
2. 否则 `X-Gitmon-User` 请求头（前端 localStorage `gitmon:device` 生成一次的设备 ID）
3. 否则 `public`

前端**所有**对 `/api/*` 的 fetch 都必须带 `X-Gitmon-User` 头（登录态下由规则 1 覆盖，头仍发）。
现有测试只走 header 路径，行为不变。

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

## 5. 同步协议

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

## 6. 非目标（本期不做）

- 战斗编队、开包记录、训练打卡的跨端同步
- 增量 diff / 版本向量 / 字段级三方合并（LWW 足够）
- 后端解释或校验 `client_state` 内容
- 自定义立绘上云
- 分页拉取超过 200 条的超大图鉴（如需再加 cursor）
