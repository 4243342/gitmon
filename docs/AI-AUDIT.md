# AI 模式真实审计（渐进式鉴定）设计

状态：已定稿（2026-11-09 拍板）：**深度审计默认开**；加级节奏采用**混合制**
（M1–M2 小涨、M3/M4 主涨，见 §5）。演出效果按高星开源仓库复刻，来源总表已写入
 [`README.md` · 参考与借鉴](../README.md#参考与借鉴来源总表)。
目标：把 AI 模式从「凭知识猜」升级为「真扫仓库 + 模型总评」，
全程 2–5 分钟，带里程碑弹幕、等级从 Lv.1 滚到审计完成等级、跨越进化节点触发进化演出。

## 1. 背景与问题

现状（见 `docs/DESIGN.md` §6.2 与 `backend/gitmon_api/llm.py`）：

- 普通模式：真抓 GitHub/Gitee 数据，规则引擎出结果，秒出，但技能是固定门槛模板。
- AI 模式：只把「仓库名 + 平台 + 补充说明」发给模型，**零真实数据**，模型凭训练知识推测。
  卡上盖「AI 推测 · 非真实扫描」章。冷门仓库结果不可信，也撑不起「鉴定」的仪式感。

用户诉求：AI 模式也要**真实审计仓库**，耗时 2–5 分钟；过程分里程碑（发现属性、……），
证据最终汇聚成一张卡；卡片出来后按项目情况弹窗 / 弹幕加等级，等级从 Lv.1 一路涨到
审计完成等级，途中触发进化过程。

## 2. 核心思路

**真实抓取负责「事实」，模型负责「解读与演绎」，前端流水线负责「演出」。**

1. 前端按阶段真实抓取仓库数据（复用 `src/scan.js` 已有的 GitHub/Gitee 请求、令牌、缓存、限流处理）。
2. 每完成一个阶段 = 一个里程碑：立即产出弹幕 + 关键发现弹窗 + 一段等级上涨。
3. 全部证据打包发给后端 `/api/llm/evaluate`（新增 `evidence` 参数），提示词明确
   「真实审计证据优先于你的推测」，模型据此汇聚成完整卡片（品质 / 六维 / 技能 / 词条 / 文案）。
4. 等级与进化全部在**审计台内**演出：M1–M4 加级实时滚动，M5 返回后台内一口气滚到
   审计完成等级；每跨过一次进化节点在台内播进化动画（白闪 → 形态切换 → 阶段名定格）。

架构选型：**前端流水线 + 后端总评**（不新增后端审计 job）。

- 理由：`scan.js` 已实现全部真实抓取能力（token、超时、缓存、ghRate 提示）；
  BYOK 密钥本就活在前端；`/api/hatch` 的 job 轮询范式对纯展示流水线是多余复杂度。
- 后端只改一处：`/api/llm/evaluate` 接受结构化审计证据并注入提示词。

## 3. 总体时间轴

```
0s            ~15s        ~40s        ~70s       ~110s      ~150-300s
│ M0 连接仓库 │ M1 发现属性 │ M2 生态位  │ M3 工程量 │ M4 质量检验 │ M5 模型总评（LLM）
│  光团呼吸   │ 属性弹窗    │ 弹幕+弹窗  │ 加级段A   │ 加级段B     │ 证据汇聚 → 卡片浮现
│  弹幕×2     │ →宠物显形   │  +加级段   │          │            │ → 台内终场滚 Lv.9→N
│             │ +加级段     │           │          │            │ → 跨阶进化演出 → 出卡
```

时间构成（2–5 分钟）：

- 真实抓取合计约 10–40s（并发请求 + GitHub 限流退避）。
- LLM 总评一次生成 2000+ token，约 20–60s；必要时拆两段（先品质六维、后技能词条文案）。
- 其余时间为**演出节拍**：每个里程碑有最小展示时长（约 15–25s），用打字机文案、
  进度格、弹幕填充，不允许纯黑屏干等。总时长落在 2–5 分钟由节拍控制器收敛
  （证据少时拉长节拍，LLM 慢时压缩弹幕间隔）。

## 4. 里程碑定义

| # | 阶段 | 真实数据源 | 产出 | 弹幕 / 弹窗示例 | 加级 |
|---|------|-----------|------|----------------|------|
| M0 | 连接仓库 | `GET /repos/{owner}/{repo}`（gh/gitee） | ref 锁定、stars、forks、license、created/pushed | 「档案库连接成功」「★ 12.4k 枚星」 | +0（仍在 Lv.1） |
| M1 | 发现属性 | `GET /repos/.../languages` | 主 / 副属性（真实语言占比，不再由模型猜） | 弹窗「**发现属性：水属性**（TypeScript 68%）」；弹幕「元素反应确认」 | +1 ~ +3 |
| M2 | 生态位 | 根目录清单 + README 首段（`scan.js inspectRoot` 已有） | 种族候选、项目类型（框架/工具/清单/游戏…） | 弹窗「**种族判定：飞鸟型**——清单型仓库」；弹幕「生态位：雏形」 | +3 ~ +8 |
| M3 | 工程量勘测 | commits 总数、contributors、代码体量、历史跨度 | 工程量原始值 → 等级主增量 | 弹幕「勘测工程量：37 万行足迹」「贡献者 214 人」 | 主要加级段 A |
| M4 | 质量检验 | CI 配置、tests/、docs/、releases、issue/PR 响应节奏 | qualityDims 五维证据 | 弹窗「**CI 徽章亮起**：测试完备度 +」；弹幕「文档完整度 82」 | 主要加级段 B |
| M5 | 模型总评 | M0–M4 证据包 → `/api/llm/evaluate` | 完整卡片 JSON（品质/六维/技能/词条/文案） | 弹幕「评测官正在落章…」 | 台内滚动至终值（跨阶进化演出） |

说明：

- **属性、种族、等级基数改为真实数据优先**：M1/M3 的结果直接进 pet，模型在总评时
  收到「已判定属性/等级基数」，只允许在证据不足处补充推测并标注。
- 每个里程碑事件结构统一为：
  `{ seq, kind: 'milestone'|'popup'|'barrage'|'levelup'|'spawn'|'final'|'skip'|'done'|'warn',
     title?, text?, level?, kindOf?, pet? }`，前端按 seq 顺序消费，跳帧/重复天然幂等
  （`popup` 用独立字段 `kindOf` 携带 element/species，不能占用 `kind`）。
- 加级节奏（已拍板·混合制）：M1–M2 各小幅加级（+1~3 / +3~8）制造前段反馈，
  M3/M4 是两大主加级段，M5 终场滚动到终值。

## 5. 等级与进化演出

- **宠物在审计台正中央**：M0 起是一团呼吸的光团（径向渐变能量球 + 双扫描环），
  spawn 事件已把完整 preview pet 送进舞台；M1「发现属性」弹窗到达 → 光团放大淡出，
  宠物在原位显形（brightness/blur 登场）。
- **等级与勘测同步滚动**，不等撕卡：M1–M4 每段加级触发 countUp 小滚
  （320–700ms，easeOutExpo），中途上限 Lv.9；M5 模型返回后在**台内**用
  `finalRollDuration(from, to)`（900–3600ms，跨度越大越久）滚到终值，
  App 等同一时长 + 550ms 才出卡——撕卡时等级已落定，揭晓页不再有覆盖层滚动。
- **跨阶进化动画**：`stageFromLevel(disp)` 每帧检测，跨过进化节点
  （Lv.10 / 50 / 100 / 200 / 300 / 500 / 800 / 999）即在台内播演出：
  白光爆闪（`.audit-evolve-flash`）→ 立绘随 `evolutionStage` 换形态 →
  「进化 · 成熟体」阶段名大字弹入（`.audit-evolve-tag`，2s 自收）+ 进化音。
  演出自收计时挂在 evolve 状态上（挂 disp 会被每帧滚动清掉）。
  效果对标 animate.css（flash/zoomIn）与 GSAP timeline 分段编排，见 §7.1。
- 终值对应的 `evolutionStage` 写入 pet，与 `SSOT.md` 的 `evolution_stage` 列对齐。
- 终值等级口径沿用 `DESIGN.md` §5.2 锚点（Dify 120 / Odoo 150 / 清单仓库 10–30），
  以真实工程量为第一依据，模型只能在证据不足时于锚点内微调。

## 6. 接口与提示词变更

### 6.1 `POST /api/llm/evaluate` 新增字段

```jsonc
{
  "repo": "facebook/react",
  "platform": "github",
  "hint": "……（原有，保留）",
  "evidence": {                    // 新增，前端 M0–M4 汇总，非空才注入
    "attrs": { "stars": 232000, "forks": 4000, "license": "MIT",
               "created": "2013-05", "pushed": "2026-10" },
    "languages": { "TypeScript": 68.2, "JavaScript": 27.1 },
    "scale": { "commits": 180000, "contributors": 214, "sizeKB": 950000, "spanYears": 13 },
    "quality": { "hasCI": true, "hasTests": true, "hasDocs": true,
                 "releases": 42, "openIssues": 260 },
    "rootHints": ["package.json", ".github", "docs", "examples"],
    "readmeHead": "（README 首 300 字）"
  }
}
```

约束：`evidence` 只放**事实**（数字/布尔/清单/README 摘录），单请求总大小 ≤ 8KB，
超出由前端截断；`llm_api.py` 的 `EvaluateRequest` 同步加字段与长度校验。

### 6.2 提示词变更（`llm.py::SYSTEM_PROMPT`）

- 新增第 0 条：**「若提供 evidence，其中的真实审计证据优先于你的记忆与推测」**；
  属性、种族、等级基数以证据为准，禁止另猜一套。
- `qualityDims / stats / stars` 要求引用证据中的具体数字做解释（`evidence` 字段里写清出处）。
- 技能仍由模型针对技术栈现编（保留第 7 条），但 `desc/reason` 鼓励挂钩证据
  （如「18 万次提交的调度历史 → 技能：…」）。
- 无 `evidence` 时行为与现状完全一致（向后兼容，旧测试不破）。

## 7. 弹幕 / 弹窗系统

- **弹幕（barrage）**：底部/侧边滚动短句，随里程碑持续冒出；文案由**真实证据模板**生成
  （含具体数字才真实感：「★ 12.4k」「停更 412 天」「贡献者 214 人」）。
- **弹窗（popup）**：低频、重磅，仅两类——发现属性、种族判定；进化不再走弹窗，
  改为台内白闪 + 阶段名大字（见 §5）。
- 文案风格沿用 `DIALOGS` 的图鉴体，克制、有画面感；禁止编造证据里没有的数字
  （模板只允许插值 evidence 中的字段）。
- 静音开关复用现有 `sfx` 总线；演出期间「跳过」按钮直接快进到 M5（见 §9）。

### 7.1 效果复刻的开源参考（高星仓库）

各类演出效果**对标高星开源仓库复刻**，只借思路 / 算法，一律不引运行时依赖
（沿用本项目「零依赖自研 + 逐条溯源」惯例）；来源、协议与落点已写入
 [`README.md` · 参考与借鉴](../README.md#参考与借鉴来源总表)：

| 效果 | 参考仓库 | 复刻什么 |
|---|---|---|
| 里程碑弹幕 | [jabbany/CommentCoreLibrary](https://github.com/jabbany/CommentCoreLibrary)（⭐约1.9k）、[zerosoul/rc-bullets](https://github.com/zerosoul/rc-bullets) | 弹幕轨道分配与防重叠调度、CSS3 Animation 弹幕的组件化封装 |
| 等级数字滚动 | [inorganik/countUp.js](https://github.com/inorganik/countUp.js)（⭐约8k） | rAF 计数 + easeOutExpo 缓动：里程碑小滚 320–700ms、台内终场滚 900–3600ms，先快后慢 |
| 进化白闪登场 | [daneden/animate.css](https://github.com/daneden/animate.css)（⭐约82.9k） | `flash`/`zoomIn`/`bounceIn` 关键帧思路 → 跨阶白光爆闪 + 立绘 brightness/blur 登场 + 阶段名弹入 |
| 进化序列时间轴 | [greensock/GSAP](https://github.com/greensock/GSAP)（⭐约26.4k） | timeline 分段编排 → 「白闪 → 形态切换 → 阶段名定格 → 自收」四拍串行（两段 effect 自研） |
| 演出节拍编排 | [juliangarnier/anime](https://github.com/juliangarnier/anime)（⭐约70k） | timeline + stagger 的多阶段编排思路 → 节拍控制器（WAAPI/CSS 自研） |
| 弹窗进出场 | [motiondivision/motion](https://github.com/motiondivision/motion)（⭐约32k，原 framer-motion） | 属性 / 种族弹窗的 spring 进出场节奏，React 侧自研实现 |

（进化与里程碑闪光不新增来源：复用已在用的 tsParticles 礼花，见 README 来源总表一。）

## 8. 失败与降级

| 情况 | 行为 |
|------|------|
| 单个阶段抓取失败（404/限流/超时） | 记 `warn` 里程碑，弹幕改口（「属性勘测受阻，改用推测」），流水线继续 |
| GitHub 限流（403 rate limit） | 沿用 `scan.js ghRateMessage()` 文案提示登录/令牌，缺的证据项由模型推测补位 |
| LLM 总评失败 | 卡片回退为「证据直出卡」：M1–M4 的真实数据走规则引擎最小映射出卡，标注「模型未落章」 |
| 全部抓取失败 | 自动回退**现有纯推测 AI 模式**（不阻断用户拿到卡） |
| 用户中途离开页面 | 流水线状态仅存内存，回来重跑；不做断点续传（非目标） |

## 9. 交互开关

- 高级模式面板新增「**深度审计（2–5 分钟）**」开关，**默认开**（已拍板）；关闭 = 现有即时推测模式（保底体验与回归路径）。
- 审计演出页提供「跳过」：立即并发拉完剩余证据 → 直接进 M5，跳过节拍等待。
- 揭晓页「重新鉴定」按钮在深度审计模式下同样走完整流水线（复用同一套演出组件）。

## 10. 实施拆分

| 期 | 内容 | 关键文件 |
|----|------|---------|
| P0 | 前端审计流水线 `src/audit.js`：分阶段抓取、事件序列、节拍控制器 | 新建 `src/audit.js`（抓取逻辑从 `scan.js` 提炼复用） |
| P0 | `evaluate` 透传 `evidence` + 提示词第 0 条 + 单测 | `llm.py` `llm_api.py` `tests/test_llm.py` |
| P1 | 审计演出 UI：弹幕层、三类弹窗、里程碑进度条 | `App.jsx`（scan 视图）、新组件 `AuditStage.jsx`、`styles.css` |
| P1 | 等级滚动 + 进化演出（复用 `evolution.js`） | `AuditStage.jsx` / `PetCard.jsx` |
| P2 | 跳过、深度审计开关、失败降级全链路测试 | `AdvancedPanel.jsx`、`tests/` |

## 11. 验收清单

- [ ] 真实仓库审计全程 2–5 分钟（节拍可控，非人为黑屏干等）。
- [ ] M1 属性来自真实 languages 占比；M3 等级增量来自真实工程量。
- [ ] 里程碑按序触发，弹幕文案中的数字全部能在 evidence 中找到出处。
- [ ] 等级随勘测实时滚动（M1–M4 小滚 + M5 台内终场滚）；途经进化节点在台内触发进化演出，撕卡时等级已落定、卡面 `evolutionStage` 正确。
- [ ] 宠物在审计台正中央：M0 光团 → M1 属性确定显形。
- [ ] LLM 总评失败 / 抓取失败各有可用降级，用户始终能拿到卡。
- [ ] 关闭「深度审计」后行为与现行 AI 模式完全一致；`pytest` 与 `npm run build` 全绿。

## 12. 非目标（本期不做）

- 后端审计 job / 断点续传 / 审计结果持久化缓存。
- 深度代码静态分析（clone 仓库跑 cloc/AST）——仍走平台 API 能拿到的范围。
- 普通模式（非 AI）接入本演出；普通模式保持秒出。
