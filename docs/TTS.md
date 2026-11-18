# 对话语音（TTS）· 设计文档

状态：**M0 + M1 + 本地引擎（E）已实现**（2026-11-10）。M2（自动推进）/ M3（逐字高亮）未做。
默认音源已从 cloud 切到**本地 Kokoro**；落地清单与实测数据见 §14（云端/系统）与 §15（本地）。
与本文目标态有出入处以 §14 / §15 为准。

> 相关实现：`src/story/runtime.js`（台词来源）、`src/components/StoryMode.jsx`（推进与渲染）、
> `src/bgm.js` / `src/sfx.js`（现有音频链路）、`src/llm.js`（BYOK 绑定）、
> `backend/gitmon_api/llm.py`（模型代理）、`docs/STORY.md`（剧情模式设计）

## 1. 定位

给剧情模式的**对话台词**加语音：每屏 2–4 句，旁白 / 主角 / 引路人 / 宿敌各有固定声线，
点击推进时朗读当前句。它解决的是「读字累、沉浸感弱」，不是给全站加朗读器。

**非目标**（本期不做）：

- 不做全站通用朗读（图鉴 / 对战 / 设置页不朗读）
- 不做语音输入、语音控制（那是另一条链路）
- 不做角色专属音色克隆（需要素材与授权，成本高于收益）
- 不动 ink 结构：台词仍然是模型填的 `{say("key")}`，TTS 只消费最终文本

## 2. 现状与缺口

| 环节 | 现状 | 缺口 |
|---|---|---|
| 台词数据 | `runtime.enter()` 返回 `lines: [{key, who, text}]`，模型生成 + `lines.json` 兜底 | 无音频字段 |
| 推进 | `StoryMode` 的 `setLineIndex` 单条点击推进 | 点击只切文字 |
| 音频 | `bgm.js` / `sfx.js` 各自 `new AudioContext()`，8-bit 合成，零素材 | 没有语音通道、没有混音总线、说话时不压 BGM |
| 模型 | BYOK：`binding` 存 localStorage、`apiKey` 存 sessionStorage，后端转发即丢 | 未接 `/audio/speech` |
| 设置 | 只有总音量 `gitmon:volume` 与音乐开关 `gitmon:bgm-muted` | 无语音开关 / 音源 / 语速 |

**关键约束**：台词文本是**运行时才有的**（模型现生成），所以语音只能在拿到 `scene.lines` 之后合成，
不能预先生成音频包。这决定了必须有「预取 + 缓存 + 超时降级」三件套。

## 3. 三条硬约束

| 编号 | 约束 | 落地方式 |
|---|---|---|
| **T1** | **同一时刻只有一句在念** | 播放器串行化：新请求先 `stop()`，全局只有一个 `BufferSource` |
| **T2** | **任何失败都必须能出声或安静降级** | 云端失败 → 系统朗读 → 静音，全程不阻塞剧情推进 |
| **T3** | **语音不改变剧情节奏** | 是否推进由玩家点击决定；语音只跟随，不反过来驱动 `lineIndex` |

T3 是刻意的：剧情是「点击读字」的节奏，让语音驱动推进会在语速/断句不等长时把节奏搞乱。
自动推进只在 M2 作为**显式开关**提供，且只在「自动朗读」打开时可用。

## 4. 音源选型

| 方案 | 音质 | 成本 | 延迟 | 依赖 | 结论 |
|---|---|---|---|---|---|
| A 浏览器 `speechSynthesis` | 系统音色（macOS 婷婷 / Windows 慧慧），音色一般但清晰 | 0 | 首字 <150ms | 无（浏览器内置） | 兜底，永远可用 |
| B BYOK 云 TTS（OpenAI `/audio/speech`） | 好，可指定 6 种音色 | 按字符计费 | 0.8–2s，可缓存 | 需要已绑定 key 且端点支持 | 可选升级 |
| C 自托管 `edge-tts` | 很好（晓晓/云希/云扬/云野） | 0 | 0.6–1.5s | 第三方非公开接口，稳定性不可控 | 实验开关，默认关 |
| **E 本地 `sherpa-onnx` + Kokoro-82M** | 好（24kHz，中文 8 个音色） | 0 | **RTF≈0.5，2–4s/句**，可预取 | 一次性 405MB 模型 + 30MB wheel，无 torch | **默认（2026-11-10 起）** |
| D 本地 `piper` / GPT-SoVITS | piper 中文单音色；SoVITS 需 GPU | 0 | 取决于机器 | 模型与进程成本高 | piper 不做；SoVITS 只适合离线产素材 |

**决策（现行）**：E 做默认（离线、免 key、四角色四嗓子），A 做兜底，B 做可选升级，C 留作实验位。
理由：项目的音频哲学是「零素材依赖」（`bgm.js` / `sfx.js` 都是现场合成），语音不能成为
「没配 key 就不能玩」的阻塞项。原来只有一个系统音色，四个角色只能靠 pitch 硬掰；
Kokoro 的中文音色让「四把嗓子」这件事第一次成立，但代价是 405MB 模型和 CPU 推理延迟——
这两个代价都由「一次性下载 + 首句预取」兜住，玩家侧零配置。

## 5. 架构

```
                 ┌─────────────────────────── StoryMode.jsx ───────────────────────────┐
  enter() ──────▶│ applyScene(scene)                                                    │
   scene.lines   │   ├─ tts.prefetch(scene.lines)   ← 整屏并行取音频（≤3 并发，可取消）  │
                 │   └─ setLineIndex(0)                                                 │
  点击推进 ─────▶│   tts.speak(lines[i])  ──▶ stop() 前一句 ──▶ play(当前句)            │
                 └───────────────────────────────┬─────────────────────────────────────┘
                                                 │
                                     ┌───────────▼────────────┐
                                     │       src/tts.js       │
                                     │  provider 抽象 + 播放器 │
                                     │  缓存(LRU) + 打断控制   │
                                     └───┬───────────┬────────┘
                          provider=system│           │provider=cloud
                                         ▼           ▼
                              speechSynthesis   POST /api/tts/speech
                              （浏览器内置）     （后端代理，key 只在内存）
                                                     │
                                        ┌────────────▼─────────────┐
                                        │ backend/api/tts.py       │
                                        │  sha1 缓存 → data/tts/   │
                                        │  httpx → {baseUrl}/audio │
                                        └──────────────────────────┘
```

**为什么 voice 传角色名（`pet` / `narrator` / `scout` / `boss`）而不是厂商 voice id**：
换音源时映射在表里改，调用方不用动；也避免前端知道 OpenAI 的 `alloy` 这类实现细节。

## 6. 接口契约

### 6.1 后端

```
POST /api/tts/speech
Content-Type: application/json

{
  "text": "那天夜里，整条榜单都在传一件事。",   // ≤200 字，超长截断
  "role": "narrator",                        // pet | narrator | scout | boss
  "rate": 1.0,                               // 0.6–1.6
  "llm": { "baseUrl": "...", "model": "...", "apiKey": "..." }   // 与 /api/story/text 同构
}
```

| 响应 | 说明 |
|---|---|
| `200 audio/mpeg` | 正常合成。响应头 `X-TTS-Cache: hit|miss`、`X-TTS-Provider: openai` |
| `400` | 参数不合法（空文本 / 白名单外的 role） |
| `404` | 当前端点没有 `/audio/speech`（不是语音服务商）→ 前端**本次会话永久切系统朗读** |
| `502` | 合成失败 / 超时（后端 8s 上限） |
| `503` | 无可用 key（未绑定模型） |

```
GET /api/tts/voices        → { roles: [{ role, label, voice, preview }] }
GET /api/tts/health        → { provider, cache_bytes, cache_files }   // 设置页诊断用
```

**404 单独成码**是吸取连接测试的教训：端点不支持语音时必须说清「这个 Base URL 不提供语音合成」，
不能吞成「合成失败」，否则用户只会反复点试听。

### 6.2 前端模块 `src/tts.js`

```js
tts.speak({ who, text, key })      // 立即念这一句（会先 stop 上一句）
tts.prefetch(lines)                // 整屏预取，返回 Promise，离开场景自动 abort
tts.stop()                         // 停止并清空队列
tts.setEnabled(bool)               // 语音总开关
tts.setEngine('cloud' | 'edge' | 'system')  // 音源（三态，edge 为实验位）
tts.setVolume(0..1)                // 与 gitmon:volume 独立，默认 0.9
tts.setRate(0.6..1.6)              // 默认 1.0
tts.setAutoFirst(bool)             // 进场是否自动念第一句
tts.unlock()                       // 在用户手势里预热 AudioContext / speechSynthesis
tts.preview(who)                   // 设置页试听
```

配置存 `gitmon:tts`：`{ enabled, engine, volume, rate }`。**不存任何 key**，key 始终来自
`llm.js` 的 sessionStorage，与剧情/评测共用同一枚。

### 6.3 接入点（改动面）

| 文件 | 改动 |
|---|---|
| `src/tts.js` | 新增（约 260 行）：provider 分流、播放器、LRU、打断、清洗 |
| `src/components/StoryMode.jsx` | `applyScene` 里 `tts.prefetch`；推进/选择/战斗/离开四处 `tts.stop()`；点台词时 `tts.speak` |
| `src/components/Settings.jsx` | 新增「语音朗读」区块：开关 / 音源 / 语速 / 音量 / 试听 |
| `src/App.jsx` | 「进入剧情模式」点击里补 `tts.unlock()`（与 `bgm.unlock()` 并列） |
| `backend/gitmon_api/tts.py` | 新增：合成 + 磁盘缓存 + 角色声线表 |
| `backend/gitmon_api/main.py` | 挂载 `/api/tts` 路由 |
| `src/bgm.js` | 暴露 `duck(level, ms)`：说话时把 BGM 压到 35% |

## 7. 角色声线表

| 角色 | 定位 | system（pitch / rate） | cloud（OpenAI voice） | 备注 |
|---|---|---|---|---|
| `narrator` 旁白 | 中性、叙述、不抢戏 | `0.95 / 0.98` | `onyx` | 中文系统音取 `zh-*` 第一个 |
| `pet` 主角 | 少年感、紧绷、向上 | `1.15 / 1.05` | `alloy` | 语速略快，句尾不收 |
| `scout` 引路人 | 油滑、老江湖 | `0.88 / 1.0` | `echo` | 稍压低，带笑 |
| `boss` 宿敌 | 低沉、压迫、慢 | `0.75 / 0.92` | `fable` | 最慢，句读留白多 |

- system 引擎没有真正的「音色」，只能靠 pitch/rate 拉开差异；这是零成本方案的已知短板，
  设置页要直说「系统朗读只有音高差异，想要分角色声线请切在线音源」。
- cloud 引擎的 voice 映射写在后端 `ROLE_VOICES`，可热改。

## 8. 播放编排

### 8.1 状态机

```
idle ──speak()──▶ resolving ──命中缓存──▶ playing ──ended──▶ idle
                     │                       │
                     ├─未命中─▶ fetching ────┘
                     │            │
                     │            └─ 1.5s 未回 / 失败 ─▶ system 朗读 ─▶ idle
                     └─ stop() ─▶ idle（abort fetch）
```

### 8.2 打断规则（写死，避免叠音）

| 时机 | 行为 |
|---|---|
| 点击推进到下一句 | `stop()` 当前 → 播下一句（不等上一句念完） |
| 点选项 / 进入战斗 | `stop()`，不再播 |
| 切场景（`applyScene`） | `stop()` 清队列 → `prefetch` 新屏 → 自动念第 1 句（若开自动朗读） |
| 离开剧情 / 卸载 | `stop()` + abort 所有未完成 fetch |
| 同一句被重复触发 | 若正在播同一 `key`，忽略（防连点重播） |

### 8.3 文本清洗 `sanitizeForSpeech(text)`

台词里会出现仓库名（`torvalds/linux`）和英文术语，中文音色读出来很怪。规则：

1. `owner/repo` → 「对手的项目」（Boss 台词）/ 「对手」（旁白），保留可读性
2. 纯 ASCII 片段连续 ≥12 字符 → 整段替换为「那个项目」，避免逐字母朗读
3. 中文占比 <30% 的整句 → 切英文音色（`en-*`），cloud 引擎用同 voice
4. 去掉 Markdown 残留（`**`、`#`、`>`）与省略号堆叠

清洗只影响朗读，**不改屏幕文本**。

## 9. 缓存与预取

| 层 | 键 | 位置 | 失效 |
|---|---|---|---|
| 前端内存 LRU | `sha1(engine|role|rate|text)` | `Map`，8 条 | 切 run / 刷新页面 |
| 前端 Cache Storage | 同上 | `caches.open('gitmon-tts-v1')`，上限 50MB | LRU 淘汰 |
| 后端磁盘 | `sha1(provider|voice|rate|text)` | `backend/data/tts/<sha1>.mp3`，上限 200MB | 超限删最旧 |

- **预取时机**：`applyScene` 拿到整屏 `lines` 后立刻并发预取（并发 3，`AbortController` 统一取消）。
  玩家读完第 1 句再点第 2 句通常 >2s，足够云端返回。
- **不为 system 引擎预取**（`speechSynthesis` 无网络成本）。
- 同一 run 内台词文本稳定（后端 `_TEXT_CACHE` 6 小时），所以同屏重播命中内存层。

## 10. 混音、成本与隐私

### 10.1 与 BGM / SFX

- 说话时 `bgm.duck(0.35, 200)`：BGM 在 200ms 内降到 35%，停止后 400ms 淡回
- SFX 不动：都是 <300ms 的短音，不与人声冲突
- 三路音量：`gitmon:volume`（BGM+SFX 共用，现状）与 `gitmon:tts.volume`（语音独立），
  设置页两个滑条分开，避免「关小音乐把人声也关没了」

### 10.2 成本（cloud 引擎）

一句台词约 18–25 字，OpenAI `tts-1` $15 / 1M 字符 ≈ **0.0004 元/句**；
一条完整剧情线约 40 句 ≈ **0.016 元**。缓存命中后为 0。

### 10.3 隐私

- 台词文本会发送到 TTS 服务（可能就是用户自己配的模型端点）。设置页在语音区块下方明写一句
- 不把 `apiKey` 写进任何缓存键 / 日志 / localStorage
- 缓存文件只存音频，不存原文（后端仅存 sha1 文件名）

## 11. 分阶段落地

### M0 · 系统朗读（0.5 天，零后端）

- `src/tts.js`：system provider + 播放器 + 打断 + LRU
- `StoryMode`：预制、推进时朗读、四处 stop
- 设置页开关 + 语速；剧情页头加 🔊 快捷开关（与 ♪ 并列）
- **验收**：不配 key 也能出声；连点 5 次不叠音；切场景立即停

### M1 · BYOK 云端（1 天）

- 后端 `tts.py` + `/api/tts/speech` + 磁盘缓存 + 404 语义
- 前端 cloud provider、预取、`bgm.duck`
- 设置页音源选择 + 试听按钮（失败要显示具体原因）
- **验收**：命中 <80ms；未命中 <2.5s；端点不支持 → 明确提示并切系统朗读

### M2 · 节奏（0.5 天）

- 「自动朗读」+「自动推进」双开关（默认都关）
- 语速对自动推进阈值的影响：`等待 = 语音时长 + 400ms`
- 剧情页头显示当前声线（小字），方便调试

### M3 · 可选（不强求）

- `boundary` 事件逐字高亮（仅 system / 部分云端支持）
- 战斗播报（「暴击」「闪避」）走同一通道，语速 ×1.2
- 多语言：`i18n` 英文模式时切 `en-*` 音色

## 12. 验收清单

1. 语音开关关闭 → 网络面板零 TTS 请求，点击仍是纯文字推进
2. 连续快速点击 5 次 → 任意时刻只有 1 路语音在播，无叠音、无异常
3. 切场景 / 选选项 / 进战斗 / 退出剧情 → 语音在 120ms 内停止
4. 云端 404（端点不支持语音）→ 本次会话不再重试，弹一次提示，改系统朗读
5. 云端超时 1.5s → 系统朗读兜底，剧情推进不被阻塞
6. 首句延迟：缓存命中 <80ms，未命中 <2.5s
7. 音量为 0 / 系统静音 → 不报错、不排队堆积
8. iOS Safari：首次进入剧情（用户手势内）后能正常出声
9. 后端：缓存命中返回同一字节，`X-TTS-Cache` 正确；越界参数 400
10. 台词含 `owner/repo` 时朗读为「对手的项目」，不逐字母念

## 13. 风险与开放问题

| 风险 | 影响 | 应对 |
|---|---|---|
| 浏览器自动播放策略 | 首次无声 | `tts.unlock()` 放在「进入剧情模式」点击内 |
| `speechSynthesis` 在部分 Linux/无音色环境为空 | 系统朗读不可用 | `getVoices()` 为空 → 只保留 cloud，UI 提示 |
| 中转站不实现 `/audio/speech` | 云端不可用 | 404 语义 + 会话级降级（已在契约里） |
| 云端首包慢于玩家点击 | 听到的是上一句 | 预取 + 1.5s 超时降级 + 播放前校验 `key` 是否仍为当前句 |
| 缓存膨胀 | 磁盘 | 前后端双上限 + LRU |

**待拍板（4 项，括号内是本文的推荐）**

1. 默认引擎：只给系统朗读，还是默认在线（需已绑定 key）？——**推荐默认系统，用户在设置里升**
2. 是否引入 `edge-tts` 作为免 key 高质量方案？——**推荐不引入**（非公开接口，风险大于收益）
3. 进场景是否自动念第 1 句？——**推荐是**（设置可关），否则玩家不知道有语音
4. 逐字高亮（M3）现在要不要？——**推荐不要**，先把出声与打断做稳

**已拍板（2026-11-10）**

| 决策 | 结论 |
|---|---|
| 默认引擎 | **在线（cloud）优先**，失败/无 key 自动退系统朗读（音色统一优先） |
| edge-tts | **做成后端可选开关**，默认关闭；装上 `edge-tts` 后设置里可切 |
| 本轮范围 | **M0 + M1 一起做**（系统朗读 + BYOK 云端） |
| 自动念第一句 | 开（设置里可关） |
| 逐字高亮 | 不做 |

## 14. 落地记录（2026-11-10）

### 新增文件

| 文件 | 作用 |
|---|---|
| `src/tts.js` | 双引擎播放器：cloud / edge / system、串行打断、内存 LRU + Cache Storage、`sanitizeForSpeech`、降级熔断 |
| `backend/gitmon_api/tts.py` | 角色声线表、`/audio/speech` 代理、edge-tts 可选引擎、sha1 磁盘缓存（200MB 上限）、404 语义 |
| `backend/gitmon_api/tts_api.py` | `POST /api/tts/speech`、`GET /api/tts/voices`、`GET /api/tts/health` |
| `backend/tests/test_tts.py` | 10 例：参数校验、缓存命中、改语速穿透缓存、404/401 语义、edge 未安装、health |
| `.dev/tts-logic.mjs` / `.dev/tts-ui.mjs` / `.dev/story-tts-e2e.mjs` | 逻辑 / 设置页 / 剧情端到端验证脚本 |

### 改动文件

| 文件 | 改动 |
|---|---|
| `StoryMode.jsx` | `applyScene` 停播 + 预取 + 自动念首句；`nextLine` 替代内联推进；`choose` / `fight` / `finishRun` / 卸载四处 `stop()`；页头 `语音` 开关；降级提示条 `story-voice-note` |
| `App.jsx` | 三个「进入剧情模式」入口都补 `unlockTts()` |
| `bgm.js` | `duckFactor` 参与 `lvl()`；新增 `duck(level, ms)` / `unduck(ms)` / `ducked` |
| `Settings.jsx` | 音频页新增「语音朗读」区块（开关 / 三档音源 / 自动首句 / 语速 / 音量 / 四角色试听 / 降级说明 / 隐私提示） |
| `game-theme.css` | `.set-block + .set-block` 分隔线与间距（一个 tab 里两块内容不再粘在一起） |
| `story.css` | `.story-voice`、`.story-voice-dot`、`.story-voice-note` |

### 实现细节（与目标态的差异）

- **三态引擎**而不是两态：`cloud`（默认）/ `edge`（可选）/ `system`，设置页直选。
- **失败熔断**：连续 3 次 5xx / 超时后，本次会话不再尝试在线音源（避免每句都卡 1.6s 超时），
  切引擎或重新绑定 key 后自动解除。
- **云端请求超时 1.6s**（首字节），超时即用系统朗读补位；后端合成继续跑完并落盘缓存，
  下一句同样的文本会命中。
- **文本清洗在前端**：`owner/repo` → 「对手的项目」，≥12 字符的拉丁串 → 「那个项目」，
  Markdown 符号与省略号堆叠一并清掉；只影响朗读，屏幕文本不变。
- **edge 依赖**：`pip install edge-tts` 后重启后端即可，`/api/tts/health` 会报 `edge: true`；
  未安装时选 edge 会拿到 503 + 明确提示，不会静默失败。

### 实测

- 后端 pytest：**176 passed**（新增 10 例 TTS）。
- 前端 `npm run build` 通过。
- 设置页（无头 Edge）：语音区块 2 个开关 / 3 档音源 / 2 个滑条 / 4 个试听按钮全部渲染，零控制台错误。
- 云端成功路径（桩 AudioContext）：1 次请求 → 1 次 decode → 1 次播放，**0 次系统朗读**（没有误降级）。
- 云端 404 路径：首次请求后置 `unsupported`，只发 1 次提示；之后连点三句 → 3 次系统朗读、**0 次额外请求**。
- 剧情端到端：建线进 play → 自动念第 1 句（1 次 decode）→ 点击推进第 2 句（缓存命中，请求数不增）
  → 关掉语音后再点击 → **0 次播放**；全程零 pageerror。

## 15. 本地引擎（sherpa-onnx + Kokoro-82M）

2026-11-10 追加：把「本地」做成默认音源，解决系统朗读「四个角色只有音高差异」的根本问题。

### 15.1 为什么是这套

- **Apache-2.0**（代码与权重），可商用、可改；不是 edge-tts 那种非公开接口，发行不押第三方。
- **不需要 torch**：`sherpa-onnx` 单个 wheel（约 30MB，内含 onnxruntime），装进现有 venv 不污染依赖树。
  本机 Python 3.13.12 / macOS arm64 有 `cp313-macosx_11_0_arm64` 轮子（2.0.1），实测可装。
- **中文音色够分角色**：`kokoro-multi-lang-v1_1` 共 103 speakers，其中 sid 45–52 是官方文档列的八个中文音色
  （4 女 4 男）。四角色按「两女两男、音区拉开」配，不再靠 pitch 冒充。
- **不选谁**：MeloTTS 中文只有 1–2 个嗓子（但中英混读最强）；piper 中文 `zh_CN-huayan` 单音色；
  CosyVoice2 / IndexTTS2 / GPT-SoVITS 质量更高但要 GPU、冷启动分钟级，只适合离线产素材，不适合运行时。

### 15.2 安装（两步，一次性）

```bash
bash scripts/fetch-tts-model.sh                              # 348MB → backend/models/kokoro-multi-lang-v1_1（解压后 405MB）
cd backend && .venv/bin/python -m pip install sherpa-onnx     # 约 30MB
```

模型目录可用 `GITMON_TTS_MODEL_DIR` 指到别处；`backend/models/` 已在 `.gitignore` 里。
**注意国内网络**：`huggingface.co` / `hf-mirror.com` 常常直接超时，模型走 GitHub release
（`github.com` 可达），别写成 HF 下载。

### 15.3 角色声线

| 角色 | sid | 音色名 | 定位 |
|---|---|---|---|
| narrator 旁白 | 47 | `zf_xiaoxiao` | 女声，叙述最稳 |
| pet 主角 | 50 | `zm_yunxi` | 年轻男声 |
| scout 引路人 | 46 | `zf_xiaoni` | 清亮女声 |
| boss 宿敌 | 49 | `zm_yunjian` | 低沉男声 |

映射写在 `tts.py` 的 `LOCAL_SPEAKERS`，改一行就能换；`/api/tts/voices` 会把 `local` 音色名一起吐给前端。

### 15.4 实现要点（踩过的坑）

- **合成必须进线程池**：`asyncio.to_thread` 包住 `OfflineTts.generate()`，否则 2–4s 的阻塞调用会把
  事件循环一起冻住（剧情接口同时在线）。实测 pybind 并不独占 GIL（ticker 最大间隔 14ms），
  所以线程方案够用，不需要上多进程。
- **实例要常驻并串行**：模型加载 1.2s、占 320MB，`_load_local()` 加锁只建一次；
  `_synth_lock` 串行化，避免两个请求抢 6 个 ONNX 线程把 CPU 打满。
- **线程数不是越多越快**：2/4/6/8 线程实测 RTF = 0.58 / 0.49 / **0.43** / 0.69（M 系列），选 6。
- **输出是 wav**：sherpa 给 float32 PCM，用 `wave` 包 16bit 单声道；响应 `Content-Type: audio/wav`，
  缓存后缀 `.wav`（`_prune` 同时扫 mp3 与 wav）。浏览器 `decodeAudioData` 对 wav 无需额外库。
- **前端超时按引擎分**：本地 15s、在线 1.6s。本地沿用 1.6s 会在冷启动时被自己掐断，
  然后静默降级成系统朗读——这正是「接了本地却听起来没变」的原因。
- **预取顺序**：先开口念第一句，`speak()` 之后再 `prefetch(lines.slice(1))`。
  原来是先 prefetch 再 speak，而 `speak()` 内部的 `stop()` 会 abort 预取队列，预取等于白做；
  现在拆成 `stopVoice()`（只掐当前句）与 `stop()`（停播 + 放弃预取），预取才真正生效。
- **启动预热**：`main.py` 的 lifespan 起一个 daemon 线程 `tts.warm()`（1.2s 加载 + 首句开销），
  测试环境（检测到 `pytest`）与 `GITMON_TTS_WARM=0` 时跳过，避免 pytest 里加载 320MB。
  前端 `unlockTts()` / 切到本地音源时也会 `POST /api/tts/warm`。

### 15.5 实测

- 后端 pytest：**180 passed**（TTS 14 例，新增本地引擎 4 例：缺模型 503、wav 缓存、无 key 可用、system 被拒）。
- 冷启动（未命中缓存）36 字台词：**4.08s** 出音频（7.4s 音频，RTF≈0.55）；命中缓存 **0.01s**。
- 四角色各一句：pet / scout / boss 均走各自 speaker，解码时长 3.2–3.4s，控制台零报错。
- 设置页：音源四档「本地 / 在线 / edge / 系统」，本地默认高亮，文案不溢出。
- 剧情端到端（真后端 + 真 WebAudio 解码）：进 play 自动念第 1 句（解码 5.92s 音频，0 次系统朗读，
  请求全部 `engine=local`）→ 点击推进第 2 句 **0 次新请求**（预取命中，解码 6.56s）。
- 切到系统音源后：`speechSynthesis` 被调用 1 次，**0 次新请求**。
