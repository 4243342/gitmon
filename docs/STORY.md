# 剧情模式 · 设计文档

状态：已评审，进入实现。实现以本文为准；与现状代码冲突处以本文为目标态。

> 相关实现：`src/App.jsx`（入口与条件弹层，当前为占位）、`src/deskPet.js`（桌宠）、
> `src/llm.js`（模型绑定）、`src/rivals.js`（对手供给）、`docs/SSOT.md`（同步契约）
>
> 并列模式：可重复的日常副本见 `docs/QUEST.md`（任务模式）。两者可同时进行，互不占用。

## 1. 定位

剧情模式是**单项目养成线**：挑一只 AI 认证精灵当主角，AI 按它的赛道找出三个顶级项目当三条可选方向，
你从中选一个作为最终方向，一路打完三章。它不是竞技场的替代品——竞技场是随时可打的沙盒，
剧情模式是有始有终、且需要做一次不可逆选择的一次远征。

## 2. 三条硬性约束

| 编号 | 约束 | 落地方式 |
|---|---|---|
| **C1** | **同一时间只允许一个项目** | 后端唯一索引保证（见 §5），前端切换需显式结案 |
| **C2** | **项目与桌宠绑定** | 激活时把桌宠锁为该主角精灵，剧情结束才解除 |
| **C3** | **项目精灵必须 AI 认证，且账号已绑定模型** | 入口与建线双重校验，两者缺一不可 |

### C1 一个项目

- 一个 owner（登录账号 / 设备）同时只能有 **1 条 `active` 剧情线**
- 想开新项目，必须先对旧线做「结案」或「放弃」，旧线转为 `cleared` / `abandoned` 存档
- 这条约束写在数据库层，不是前端按钮层——避免多端同时操作造出两条线

### C2 桌宠绑定

- 建线时自动把桌宠切到该主角（`deskPet.key = petKey(pet)`），并置 `locked: true`
- 锁定期间桌面宠物面板不能切到其他精灵，尝试切换时提示「剧情进行中」
- 剧情结案 / 放弃后解除锁定，桌宠保留在当前精灵但可自由切换
- 反向不成立：**换桌宠不会改变剧情线**，剧情只认 `story_run.pet_key`

### C3 资格

| 条件 | 判定 | 不满足时 |
|---|---|---|
| 项目精灵已 AI 认证 | `pet.aiEvaluated === true` | 该精灵不出现在可选列表 |
| 账号已绑定模型 | `llmConfig.binding` 存在且 `verified !== false` | 入口点击弹出条件面板，提供「去开启 AI 高级模式」 |

**为什么要求绑定模型**：选 Boss、章节文本、结算评语都由模型生成，每次推进消耗额度。
没有绑定就无法推进，允许先看入口但不允许建线。

> 与现状差异：现在 `App.jsx` 判的是 `advanced`（高级模式开关）。目标态改为判 `binding` ——
> 开关可能开着但密钥已失效，绑定态才是「真的能调模型」。

## 3. 建线：先选 Boss，再选剧本

进入剧情模式后有两步选择：**先定打谁，再定这个故事怎么讲**。选对手是「三选一 + 右上角自选对手」；
选剧本是**来源三选一**（系统模板 / 自定义 / AI 生成），不再是抽完对手就自动花一次模型调用。
先选 Boss 是有意的——剧本要围绕你已经选中的对手来写，否则两边容易各说各话。

### 3.1 流程

```
选主角项目
   ↓
第一步：AI 出 GitHub 检索条件
   ↓
后端执行检索，拿到真实候选
   ↓
模型挑 3 个 Boss + 写解释 ──右上角「自选 Boss」──▶ 输入仓库地址
   ↓ 选一个作为最终方向（不可逆，其余丢弃）
第二步：剧本来源三选一（系统模板 / 自定义 / AI 生成）
   ├─ 系统剧本 ──▶ 内置三套模板，秒出，不调模型
   ├─ 自定义   ──▶ 输入小说名 / 梗概，照它写三案
   └─ AI 生成  ──▶ 围绕这只对手的调研现场写三案
   ↓ 选一个（不可逆）
建线（写入 story_runs）
```

### 3.2 候选来源：模型直接去 GitHub 找

**不查内置离线池**。Boss 全部来自 GitHub 实时搜索——「同赛道同行业的顶级项目」这个标准
内置池覆盖不了（116 只只是对战样本，不是行业全集）。

模型不能直接访问网络，所以由它**出检索策略**，后端代为执行：

```
① 模型读主角仓库的 description / topics / languages / 规模
   ↓
② 模型输出一组 GitHub 检索条件（3–6 条）
   language:Rust topic:database stars:>10000 pushed:>2026-01-01
   language:Go topic:storage     stars:>5000
   ↓
③ 后端调 GitHub Search API 执行，每条取前 20 条真实结果
   ↓
④ 去重、剔除归档 / fork / 空描述，合成候选集（约 15–25 只）
   ↓
⑤ 模型从候选里选 3 只并写理由
```

- 检索条件由模型生成，保证「同赛道」是语义判断而不是关键词硬匹配
- 结果一律以 GitHub 返回的真实仓库为准，模型只在真实结果上挑选与解释
- 内置池退为**断网兜底**（见 §3.7），不再是主路径

### 3.3 模型输出

```json
{
  "track": "前端框架",
  "queries": [
    "language:TypeScript topic:framework stars:>10000",
    "language:JavaScript topic:ui stars:>5000"
  ],
  "bosses": [
    { "full_name": "vuejs/core", "reason": "同为渐进式框架，星标与生态都与你的项目同量级" },
    { "full_name": "facebook/react", "reason": "..." },
    { "full_name": "sveltejs/svelte", "reason": "..." }
  ],
  "rationale": "三只对应你项目要走的三条路：同赛道正面竞争、生态规模压制、后来者范式挑战。"
}
```

- `track`：模型判定的赛道，展示在解释框标题
- `queries`：本轮实际使用的检索条件，落库便于复盘
- `reason`：单只入选理由，一句话，卡片下方
- `rationale`：总述，解释框正文；必须回答「为什么是这三只，而不是别的」

### 3.4 选一个作为最终方向，其余丢弃

三个 Boss 是**三条可选的发展方向**，但只有一条会真正展开：看完解释框后选一个，
**另外两只直接丢弃**，不进入剧情线、不成为关卡、不落库。

| 选择结果 | 作用 |
|---|---|
| 选中的那只 | 这条线唯一的具名 Boss，坐镇终章，并决定结算称号 |
| 落选的两只 | 丢弃。下次换一批或换项目时重新检索，不保留、不复用 |

规则：

- **选择即锁定**：选中的 Boss 写入 `story_runs.boss`，本次剧情线不可更改；
  想换方向等于换项目，需先结案（受 C1 约束）
- 未选择前不允许建线，`start` 必须带 `boss`
- **候选卡必须显示真实量级**：星级、判定后的等级、主要语言。Boss 按真实数值入场（§4.1），
  所以三张卡就是三档难度的明示——选之前就知道自己要打多大的怪
- 解释框在选中后追加一段「你选择了 X 方向」的确认文案，说明这个方向意味着什么
- 结算称号按方向生成，例如「走向 React 生态的人」

为什么只留一个：三个方向同时展开会让剧情线失去焦点，也会让"选择"变成没代价的浏览。
现在选了就只剩这一条路，落选的选项直接消失——选择才有重量。

### 3.5 自选 Boss（右上角入口）

选 Boss 页**右上角**固定一个「自选 Boss」按钮，允许玩家跳过 AI 推荐，直接指定一个仓库作为最终方向。

流程：

1. 点「自选 Boss」→ 弹出输入框，支持 `owner/repo` 与完整 URL（GitHub / Gitee）
2. 后端校验：仓库存在、非归档、非空仓库，并生成标准快照与判定后的等级 / 星级层
3. 校验通过 → 该仓库作为一张额外候选卡插入，并**自动选中**为最终方向
4. 校验失败 → 输入框下方直接给原因（不存在 / 已归档 / 无权限访问 / 地址无法识别）

规则：

- 自选 Boss **不要求同赛道**，玩家想打谁打谁——这是逃离 AI 判定的唯一出口
- 自选不消耗 GitHub Search 配额，只做 1 次仓库详情请求
- 选中后其余候选（含 AI 推荐的 3 只）全部丢弃，与 §3.4 一致
- 解释框的 `reason` 换成「你的自选方向」；总述由模型补一段「这个方向意味着什么」，
  模型不可用时退化为模板文案
- `selection_source` 记为 `manual`

### 3.6 第二步：选剧本（来源三选一：系统 / 自定义 / AI）

Boss 定下来之后，才轮到写「这个故事怎么讲」——因为剧本要围绕**你已经选中的那个对手**来编，
天然避免「剧本和 Boss 各说各话」。

进 03 步**不会自动生成任何东西**，先让玩家选来源（三张并排的来源卡，可随时改选）：

| 来源 | 行为 | 成本 | 标记 |
|---|---|---|---|
| **系统剧本** | 读某个剧本包内置的三套模板，立刻出卡 | 0 调用、0 等待 | `source='system'`，界面注明「不含本次调研」 |
| **自定义** | 输入小说名 / 梗概，模型围绕它写三案 | 1 次模型调用 | `source='llm' / 'manual'`，卡上带桥接说明 |
| **AI 生成** | 模型读调研现场写三案 | 1 次模型调用，约 20–40s | `source='llm'`；失败降级为 `rule` 并显式告警 |

选「系统剧本」后会出现**剧本包选择器**（见 §3.9）：包决定正片跑哪条路线，先选包再选包里的方案。

「AI 生成」读三样东西：主角仓库的定位（是什么项目、解决什么问题、什么量级）、选中 Boss 的身份与赛道、
以及两者的关系（同赛道竞争 / 跨量级挑战 / 生态上下游），产出 **3 个剧本名**。

每个方案包含三样：

| 字段 | 说明 |
|---|---|
| `title` | 片名，4–10 字，短剧腔（如《千星逆袭：我从小工具开始》） |
| `logline` | 一句话：谁、想要什么、被什么挡住 |
| `beats` | 三个节拍预演：开局钩子 / 中段反转 / 收束方式（必须点名 Boss） |

**自定义**：输入你喜欢的小说名，或一句故事梗概，用它替代 AI 的三个方案。

规则：

- **来源三选一 + 方案选中即锁定**：选中方案写进 `story_runs.script_title` 与 `script_brief`
- 换对手会清空上一只对手的来源与方案，避免「卡是旧的、对手是新的」
- 剧本只影响叙事骨架与结局文案，**不改战斗数值**（战斗仍由真实战报决定）
- 自选输入 ≤40 字按书名处理，由模型补全设定；>40 字按梗概处理，直接作为故事前提
- 自选同样要过校验：空白、纯符号、敏感内容要求重填
- 自选小说要先过一次**桥接测试**：模型必须用一句话把小说的冲突引擎映射到 Boss 的领域。
  映射得出来就放行（哪怕题材看起来毫不相干）；映射不出来才提示「契合度偏低」，且不禁止，
  此时结局文案标注「强行演绎」

#### 契合度怎么判：看冲突引擎能不能落地，不看题材像不像

「搭」不等于题材相同。判据是：小说的**冲突引擎**（谁压迫谁、主角靠什么翻盘）能否落到 Boss 的
**领域事实**上（它是什么项目、什么量级、卡在什么位置）。

以《赘婿》× 数据库内核 为例——题材上毫不相干，但可以桥接：

| 小说母题 | 映射到仓库战场 |
|---|---|
| 入赘、身份低微 | 项目被并入大厂生态，或长期活在巨头阴影下 |
| 家族轻视、被当废物 | 榜单排名靠后、被质疑性能与工程能力 |
| 隐忍攒底牌 | 默默补测试、补文档、熬版本 |
| 一朝亮剑 | 在某个基准上反超，逼对手正面回应 |

桥接句：*「它入赘的是整个数据库生态，被当成玩具内核，直到一次基准测试把所有质疑打了回去。」*

反过来，如果模型只能写出「主角很努力，最后赢了」这种跟 Boss 无关的空话，那才是真的不搭。
所以判定发生在生成阶段，而不是靠关键词比对题材。

#### 短剧知识库：自建，不引现成库

调研结论——**没有可直接引用的高星中文短剧知识库**：

| 来源 | 现状 | 能否直接用 |
|---|---|---|
| Drama Skills / 短剧写作 skill 类仓库 | 是提示词与教学模板，星标很低 | 借鉴结构，不能作为数据集 |
| [MovieSum](https://github.com/saxenarohit/MovieSum)（2,200 部电影剧本） | 20 星，以英文电影剧本为主 | 语料太重、语言不匹配 |
| [STAGE](https://github.com/roytian1992/STAGE_v0)（151 部完整剧本基准） | 0 星，评测用 | 只能做评测，不能做生成 |

所以做法是**自建轻量节拍库**：30–60 条 JSON，字段为
`{ 节拍类型, 作用, 时长占比, 示例句式, 适用赛道 }`，覆盖短剧的固定骨架：

```
0–3s    钩子      直接甩冲突，不铺垫
3–15s   立人设    用动作交代身份落差
15–45s  冲突升级  压力连加两级
45–75s  打脸反转  一次性把憋的情绪还回去
75–90s  新钩子    留一个未解的问题
```

生成时只注入与当前赛道相关的 3–5 条作为 few-shot，**不整库塞进 prompt**——否则 token 成本失控且
模型容易照抄模板。

### 3.7 兜底

| 情况 | 处理 |
|---|---|
| 模型不可用 / 超时 | 规则检索：用主角的 `language` + 主 `topic` 拼查询，按 star 降序取前三，解释框退化为模板文案，标 `selection_source='rule'` |
| GitHub Search 限流 / 不可达 | 退回内置池按同语言 + 同量级挑，标 `selection_source='fallback_pool'`，解释框注明「离线兜底」 |
| 模型挑了搜索结果里没有的项目 | 丢弃该条，用规则检索的结果补齐到 3 只 |
| 候选不足 3 只 | 放宽 `stars` 下限或去掉 `pushed` 条件重搜一次；仍不足走兜底池 |

### 3.8 随机性

- 每条检索带 `seed` 派生的抽样偏移，同 seed 结果可复现
- 「换一批」换 seed 重新检索，模型调用计入限额（见 §8）

### 3.9 剧本包（pack）：一个包 = 一条完整路线

「系统剧本」不是一个三段模板，而是**可独立装载的剧本包**。一个包自带五样东西，
互相绑定、绝不混用：

| 组成 | 文件 | 作用 |
|---|---|---|
| 路线 | `story.ink` | 场景 / 选项 / 变量 / 跳转 / 结局，发布前定稿 |
| 角色表 | `characters.json` | 这一包里登场的人（名字 / 颜色 / 定位） |
| 台词兜底 | `lines.json` | 模型不可用时这一包每句 key 的中文台词 |
| 背景地点牌 | `meta.json` → `bgs` | 这一包每个背景 key 的地点名 |
| 结局标题 | `meta.json` → `endings` | 这一包每个结局 id 的标题 |
| 路线名 | `meta.json` → `routes` | 这一包每条路线（`insider` / `solo`）的显示名 |

```
src/story/packs/<id>/
  ├── story.ink        # 路线
  ├── lines.json       # 台词兜底
  ├── characters.json  # 角色表
  ├── meta.json        # 标题 / 标签 / 世界观 / 文风 / bgs / endings / routes / variants
  ├── art/             # 角色立绘（可选；声明了就必须真有图）
  └── roster.json      # 随包图鉴数据（可选；仓可梦包放口袋宝贝全量精灵）
```

#### 已有两个包

| 包 id | 名称 | 定位 |
|---|---|---|
| `default` | 仓可梦 | 兜底包，也是**自带正片的包**：包元信息声明 `game.entry = /pokerogue/`，选它直接进开源宝可梦同人游戏 **PokéRogue**（整包静态嵌入 `public/pokerogue/`，构建成品 + 素材一起入库），不再走占位剧情；AI 生成与自定义剧本也落在这条兜底路线，老存档同理。另随包带 383 只精灵立绘 + `roster.json` 图鉴，主角/引路人挂精灵立绘，Boss 用剧情选中的那只 |
| `douma` | 斗码苍穹 | 第一条专属包。斗破苍穹骨架 + 三年之约主线：项目即宗门，star 是香火，fork 是分家，release 是境界 |

`default` 不是「没人要的包」，它是**兼容层**：所有非系统剧本的路径都落到它，
所以任何一次改动都不会波及原有行为。

`douma` 是一条完整主线：**三年之约**。
三年前主角被宗门名册除名，与云岚宗立下三年之期——期满之日上云岚宗山门，在**名碑**上刻下自己的名字，
谁的名字留在碑上，往后三年的规矩就由谁定。药老留下半卷**焚决**：口诀不是秘籍，
得有人照着复现一遍才炼得成；魂殿是专抄作业的组织，也正是主角必须把东西摊开的原因。

路线结构：

```
序章（递上战书，立下三年之约）
  → 成长章 × (chapter_count - 1)：坊市公开复现焚决 + 杂兵战
      （chapter == 1 时插入魂殿追杀 → 魂殿场景）
  → 终章分流：trust >= 7 走「有人作证线」，否则「独自赴约线」
  → 立约（名碑就在阶前，规矩由谁定，看这一战）
  → Boss 战
  → 四个结局
     ending_flame   焚决线 · 名碑换名，规矩由你定
     ending_withered 陨落线 · 约期未至，先折在山门下
     ending_lone    独行线 · 一个人刻上名碑，无人作证
     ending_steady  正线 · 各守一寸，规矩未改
```

> 结局 id 是**跨周目**的（`story_endings` 表按 id 落库），改标题可以，改 id 会破坏结局收集册。

> **方案卡不是剧情本身。** 方案卡只影响台词生成的 prompt（`script_title` / `script_brief` /
> `script_beats` 注入 LLM 的 user 段），路线结构由 `story.ink` 独占。
> 所以「换一张卡 = 换一条故事线」是做不到的——想换剧情就得改 ink。
> 斗码苍穹主线只有一条，因此也只提供**一张卡**（《三年之约：{boss}》）：
> 它的三个角度（《三年之约》/《焚决》/《名碑》）本来讲的是同一条线的不同侧面，
> 拆成三张卡只会让玩家以为能选三条路线，实际正片一模一样。
>
> 通用包（`default`）现在是「仓可梦」包——它自带正片，同时也是 AI / 自定义剧本的兜底路线。
>
> **正片 = 开源宝可梦同人游戏 PokéRogue**（<https://github.com/pagefaultgames/pokerogue>）：
> 整包静态嵌入 `public/pokerogue/`，构建成品（`index.html` + `assets/` 打包 JS + 素材目录）
> 约 744MB / 3.4 万个文件，一起提交入库，入口写在包元信息 `game.entry = "/pokerogue/"`。
> 全屏 iframe 内原样运行，不改玩法、不写剧情——它本身就是像素风、草丛遇敌、捕捉、进化、
> 道具叠加、多生态区连打的 Roguelike。构建时只设 `VITE_BYPASS_LOGIN=1` 走上游自带的离线模式
> （否则会停在 Login / Register 并连官方账号服务器，iframe 里跨站 cookie 拿不到就进不去），
> 存档落 `localStorage`。来源、提交号、AGPL-3.0 / CC-BY-NC-SA-4.0 许可与分发限制见 `THIRD-PARTY.md`。
>
> **上手这块有个坑必须替玩家填**：PokéRogue 是纯键盘驱动的，开场提示、模式菜单、性别、图鉴教程
> 都只认回车 / Z，**点画面中间毫无反应**（只有底部那条对话框区域接鼠标）。玩家照着「点一下继续」去点，
> 就会永远停在第一条提示上，看着就是「没法玩」。所以宿主在游戏层左上角常驻一块操作条
> （`.story-game-pad`）：`↵ 继续 / 确认`、`Z 选择`、`X 返回` 三个键帽，点了就往 iframe 的 `window`
> 派发同域 `KeyboardEvent`，发完把焦点还给游戏（否则方向键会落在宿主按钮上）。
> 正常开局是：继续 ×4 过开场 → 回车进「经典模式」→ 选性别 → Z 选初始精灵 → 点右下「开始」。
>
> **备用形态 = 内置像素版**（`src/cangke/`，纯 canvas，不依赖任何第三方素材）：走草丛遇野怪 →
> 回合制对战 → 打残了扔球收服 → 升级进化，野生池用包内 `roster.json` 的 383 只精灵，
> 精灵图由 `sprite.js` 按种族 id 生成。`meta.json` 里把 `game.mode` 设成 `"pixel"` 才会跑它；
> 与 `game.entry` 那条 iframe 分支互斥。当前 `default` 包走的是 PokéRogue，所以它处于备用状态。
>
> 交互上不是「旁边的按钮」：01 步选主角时有直达条（不需要 AI 认证精灵），
> 剧情页头部常驻「进游戏」，03 步在包清单里选中仓可梦也会**直接切进正片**
> （`choosePack` 见到包自带游戏就不进方案卡流程）。
>
> 另外口袋宝贝素材已移植进包：`roster.json` 收全量 383 只精灵（五行 / 六维 / 成长率 / 进化链 / 图鉴文案），
> `art/` 下 `bb<id>.webp` 立绘 + `bb<id>_face.webp` 头像（由原素材 GIF 转动态 WebP）。
> 角色立绘只挂精灵图（主角=金波姆、引路人=黄金鸟），**Boss 不配静态立绘**——
> 它走剧情里选中的那只仓库精灵。
>
> 方案卡数量按包走，界面不能写死「三套模板」：`/api/story/packs` 的 `variant_count`
> 告诉前端这个包有几张，系统剧本那张卡的描述按它显示。
>
> **《口袋精灵2》（pet-atlas-game）已不再被引用**：它是一款独立的国产网页养成游戏
> （五行属性、383 只波姆家族），和宝可梦没有任何关系。整包仍留在 `public/petgame/`
> 作留档，唯一入口 `game.entry` 已经指向 `/pokerogue/`，删掉 `public/petgame/` 不影响任何玩法。

> **静态目录索引的坑**：`vite dev` / `preview` 的 SPA 兜底会把 `/pokerogue/` 这类子目录
> 也返回成宿主 `index.html`，iframe 里看到的就成了 GitMon 自己（看着像「游戏没接进去」）。
> `vite.config.js` 的 `static-app-directory-index` 插件把「`public/` 下确实有 `index.html` 的目录」
> 补成 `index.html`，和 nginx / GitHub Pages 的行为对齐。

#### 单一真相源

包内容只写在 `src/story/packs/` 下，两个消费者各取所需，不会出现两份内容对不上：

| 消费者 | 读什么 | 怎么读 |
|---|---|---|
| 前端构建产物 | ink 路线 + 角色表 + 台词兜底 + meta | `scripts/story-build.mjs` 编译成单个 `src/story/packs.js` |
| 后端 | meta（方案卡 / 世界观 / 文风 / 结局标题） | 直接读磁盘上的 `meta.json`，带 mtime 缓存自动重载 |

后端**不需要额外一步构建**：改完 `meta.json` 不用重启后端。
（部署只带 `dist/` 时 `packs/` 目录读不到，后端退回内置的 default 模板，功能不挂。）

#### 运行时按 pack 装载

```js
const runtime = createStoryRuntime({ vars, pack: 'douma' })
```

`StoryRuntime` 构造时把路线 / 角色 / 台词兜底绑成一体（`this.pack.characters` / `this.lines` /
`new Story(this.pack.story)`），`enter()` 的返回值带上 `packId` / `characters` / `bgLabels` /
`endingTitles` / `routeLabels`，界面必须按这些渲染——**不能用全局的通用角色表去画一个玄幻包的场景**。
路线名同理：「内应线 / 独行线」是通用包的词，斗码苍穹那条是「有人作证线 / 独自赴约线」，
写死在界面里就会对新包说错话；包里没定义 `routes` 时才回落到通用文案。

未知的 pack id 一律退回 `default`，绝不让正片因为一个写错的 id 整个挂掉。

#### 一条线从头到尾必须是同一个包

这是最容易出错的地方。建线、读档、续跑、重同步、读档槽、终章结算——六条路径
全都要按这条线自己的 `script_pack` 装载：

| 路径 | 取包来源 |
|---|---|
| 建线 | 服务端落库的 `run.script_pack`（权威） |
| 读档 / 续跑 | `run.script_pack` |
| 409 后重同步 | 服务端返回的 `run.script_pack` |
| 读档槽 | `res.run.script_pack` |

漏掉任何一处都会导致「建线时选了斗码苍穹，读档后却跑成通用路线」——正片串包，
而且很难被察觉（画面能看，故事不对）。

#### 包要影响的不只是路线

- **台词**：后端按包把 `meta.world` / `meta.style` 注入 prompt；台词缓存键必须含 pack id，
  否则同一个 scene 在不同包之间会复用旧台词（换包等于没换）
- **结局标题**：`progress()` 结算时按 `run.script_pack` 取标题，斗码苍穹的
  `ending_flame` 与通用包的 `ending_trust` 不是同一套
- **路线名**：结局屏显示的路线名按包取（`meta.routes`），不写死在前端
- **界面**：角色名 / 颜色、背景地点牌、结局标题、路线名全部按包渲染

#### 构建期守卫

`npm run story:build` 会逐包校验，任何一条不过就中止构建：

- `meta.id` 必须等于目录名
- `meta.endings` 必须覆盖该包 ink 里出现的所有结局 id
- `meta.variants` 不能为空
- 台词 key 全覆盖，且说话人存在于该包的角色表里

## 4. 章节：差距越大，关卡越多

### 4.1 章节数由实力差决定

不再固定三章。**差距越大，关卡越多**——给玩家足够的成长空间，而不是让一个小工具直接撞上 Linux。

差距用战力比衡量：

```
gap = boss.combatPower / median(playerTeam.combatPower)
```

| gap | 章节数 | 含义 |
|---|---|---|
| ≤ 1.2 | 3 | 势均力敌，短平快 |
| 1.2 – 2.0 | 4 | 明显劣势，需要一轮成长 |
| 2.0 – 3.5 | 5 | 跨层挑战 |
| > 3.5 | 6（上限） | 越级挑战，长线磨 |

- 前 **N−1 章是成长章**：杂兵从同属性同层池抽，难度随章序递增
- **第 N 章是终章**：2 场杂兵 → 选中的 Boss（强化版）
- 章节越多，总经验与掉落越高（按 `1 + 0.25 × (N − 3)` 补偿），长线不至于白磨

**内容怎么落地**：不为 3/4/5/6 各写一套场景图，而是写一个 `growth_chapter` 模板，
运行时按 `chapter_count` 实例化成 `growth_1 … growth_{N-1}`，再接固定终章。

```json
{ "id": "growth_loop", "type": "repeat",
  "template": "growth_chapter",
  "count": "vars.chapter_count - 1",
  "next": "finale" }
```

这仍然是「路线离线」——离线的是**模板**，运行时只是按参数展开实例，不涉及模型决策。

- 杂兵从同属性同层池抽（复用 `sameTypePool` + `tierOfPet`），Boss 固定为选中的那只
- **Boss 按真实数值入场，不做等级校准**：它是多少级、多少六维就打多少
- 章节数只影响「有多少成长机会」，**不改变 Boss 的强度**
- 落选的两只不会出现在任何章节里
- Boss 战失败可重试，不扣进度、不消耗次数
- 走到结局节点 → 进入 §4.2 的 `ending`，不是直接结算

### 4.2 剧情层：复刻 Ren'Py 的场景图（galgame 结构）

原来的「章节 → 战斗 → 结局」是一条直线，没有选项、没有好感度、没有多结局。
改成**场景图**：剧情是一张由节点和跳转组成的图，玩家在选项处分叉，最终落到不同结局。

#### A. 五种节点（对应 Ren'Py 的 label / menu / jump）

> 实现载体见 §11：节点用 **ink 脚本**离线编写，由 **inkjs** 运行时执行；下列概念与字段不变，只是写法换成 ink 语法。

| 节点 | Ren'Py 对应 | 作用 | 关键字段 |
|---|---|---|---|
| `scene` | `label` | 一屏：背景 + 登场角色 + 台词序列 | `id / bg / cast / lines / next` |
| `line` | say 语句 | 一句台词 | `who / sprite / text` |
| `choice` | `menu` | 选项组，每个选项可带条件与效果 | `options[{ text, requires, effects, goto }]` |
| `battle` | 无（本作扩展） | 进入战斗，胜负写变量并跳转 | `enemy / win{effects,goto} / lose{effects,goto}` |
| `ending` | `label` + `return` | 结局，按变量匹配 | `id / requires / title` |

```json
{
  "id": "ch1_tavern",
  "bg": "tavern_night",
  "cast": ["pet", "keeper"],
  "lines": [
    { "who": "keeper", "sprite": "keeper_neutral", "text": "又一个想登榜的？" },
    { "who": "pet", "sprite": "pet_determined", "text": "我来找一个人。" }
  ],
  "choice": {
    "prompt": "掌柜的把账本推过来",
    "options": [
      { "text": "先交钱", "effects": ["trust += 1"], "goto": "ch1_pay" },
      { "text": "先问人", "requires": "vars.trust >= 3", "effects": ["trust += 2", "affection.keeper += 1"], "goto": "ch1_ask" },
      { "text": "掀桌子", "effects": ["trust -= 2", "flag.rude = true"], "goto": "ch1_rude" }
    ]
  }
}
```

#### B. 变量：galgame 的核心不是「打过没」，而是「你怎么选的」

| 变量 | 范围 | 影响 |
|---|---|---|
| `affection.<character>` | −10 ~ +30 | 解锁角色专属场景与结局 |
| `trust` | 0 ~ 10 | 掌柜是否给你关键情报 |
| `deaths` | 0 ~ n | 失败越多，结局文案越冷 |

变量只由 `effects` 写入，不做隐式修改——这保证每次变化都能在存档里追溯。

#### C. 路线与多结局

- **路线分流**：章节末的 `route` 节点按变量阈值跳到不同场景（如 `trust >= 7` 分流到两条路线；
  路线在界面上叫什么由包的 `meta.routes` 决定，见 §3.9）
- **结局匹配**：结局表按顺序取第一条 `requires` 命中的，最后一条是兜底
- **结局收集册**：跨周目持久，已解锁的结局在相册里可回看，未解锁的显示问号

#### D. 战斗嵌入场景图

每章的 3 场战斗就是图中的 `battle` 节点：

- **失败不阻断剧情**：跳到 `lose` 分支，扣 `trust`、`deaths += 1`，可以回上一个 `scene` 再战
- **Boss 战失败进特殊分支**：掌柜的嘲讽、主角沉默，之后仍可重试
- **战斗结果写变量**：全胜 `trust += 2`，惨胜 `trust += 0`，失败 `trust -= 1`

#### E. 存档、回滚、已读

| 功能 | 做法 |
|---|---|
| 存档 | 5 个槽，快照 = `{ scene_id, vars, visited }`，存后端 |
| 回滚 | 回到上一个 `choice` 之前（Ren'Py 的 rollback） |
| 已读 | `visited` 集合，二周目可跳过已读文本 |
| 回想 | 读过的台词进历史记录，可翻页回看 |

#### F. 路线离线，文本实时

这是本设计最核心的分工：**结构在发布前定稿，台词在运行时现写**。

| 内容 | 何时确定 | 谁负责 |
|---|---|---|
| 场景、选项、跳转、结局、变量 | **发布前离线** | 人写，离线生成器辅助 |
| 每屏台词、旁白、结局文案 | **运行时实时** | 模型生成 |
| 进度、变量、已读、存档 | 运行时写入 | 服务端裁决 |

**为什么路线不实时生成**：分支是结构，结构一旦实时生成就无法校验、无法存档、无法测试。
10 个选择点 × 3 选项就是 5 万条路径，没有任何模型能保持一致。

**为什么文本要实时生成**：每个玩家的主力精灵、Boss、战报都不一样，写死台词会立刻对不上；
实时写才能让「这场仗」和「这段话」是同一场仗。

#### G. 实时生成的四条硬约束

1. **只填空，不改结构**：模型输出只能落到当前 `scene` 已有的 `line.text` 上，
   不能新增选项、不能改 `goto`、不能跳场景
2. **上下文最小化**：只传「当前 scene + 变量 + 上一屏摘要」，不传整部剧情。
   既省 token，也避免模型被远期剧情带偏
3. **每屏 2–4 句**，单屏生成超过 8s 直接降级到该 scene 自带的 `fallback` 文案，不让玩家等
4. **引用白名单**：只能提主角、Boss、本章杂兵与已登场角色；出现其他仓库名视为幻觉，整段重写

```json
{
  "id": "ch1_tavern",
  "lines": [
    { "who": "keeper", "sprite": "keeper_neutral",
      "text": "{{gen:keeper_greet}}",
      "fallback": "又一个想登榜的？" }
  ]
}
```

`{{gen:key}}` 是占位符，运行时由模型填充；`fallback` 是超时或失败时的兜底文本。
**每个 `line` 必须有 fallback**——没有兜底就不允许进内容库。

#### H. 缓存与预取

| 机制 | 做法 | 收益 |
|---|---|---|
| 文本缓存 | 键 `(scene_id, vars_hash, model)` | 同状态二周目直接复用，不再调用 |
| 预取 | 进入 scene 时预取下一屏 | 点选项不等待 |
| 落库 | 生成结果写入 `history` | 回想、重看不重复生成 |

成本估算：一次通关约 25 屏 → 25 次调用；缓存命中后，后续周目接近 0 次。

#### 参考项目

| 项目 | 星标 | 复刻了什么 | 协议 |
|---|---|---|---|
| [renpy/renpy](https://github.com/renpy/renpy) | 3.8k | `label / menu / jump / rollback / 已读 / 存档槽` 整套 VN 运行时语义；本设计的节点类型与回滚规则照此对齐 | MIT |
| [Monogatari/monogatari](https://github.com/Monogatari/monogatari) | 895 | Web 端 VN 引擎的 JSON 脚本结构：`scene / choice / if / jump / 角色定义`，与本设计的 JSON 形状几乎一一对应 | MIT |
| [inkle/ink](https://github.com/inkle/ink) | 5.0k | 条件表达式的极简子集与「一次性内容」，用于控制文本变体数量 | MIT |

#### 为什么不是「选一次 Boss 然后一路打」

那是关卡制，不是剧情。galgame 的体验来自**选择有代价**：现在选「先问人」要 3 点信任，
掀桌子会永久扣分并改变后续可达场景——同一场 Boss 战，路线不同，看到的结局也不同。

### 4.3 状态机

```
idle ──建线──▶ active ──走到 ending 节点──▶ finish ──发奖──▶ cleared
                 │
                 └──放弃 / 主角被删──▶ abandoned
```

## 5. 数据模型

新增表 `story_runs`（后端 SQLite，属 SSOT；前端只做镜像与离线缓冲，遵循 `docs/SSOT.md`）：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 剧情线 ID |
| `owner_key` | TEXT | 归属，与 `pets.owner_key` 同规则 |
| `pet_key` | TEXT | 主角，`platform-fullName` |
| `script_title` | TEXT | 选中的剧本名，或自选小说的归一化标题 |
| `script_brief` | TEXT | 故事前提（AI 生成的 logline，或玩家输入的梗概） |
| `script_source` | TEXT | `ai` / `manual` / `system` / `rule` / `mixed`，标识剧本来源（模型没写成时记 `rule`，不许冒充 `ai`） |
| `track` | TEXT | 模型判定的赛道 |
| `boss` | TEXT | JSON：`{full_name, stars, tier, reason, snapshot}`，只有一个；`snapshot` 是开打时用的仓库快照，保证离线可复现 |
| `rationale` | TEXT | 解释框总述（含「你选择了 X 方向」的确认文案） |
| `queries` | TEXT | JSON：本轮用过的 GitHub 检索条件，便于复盘与重放 |
| `selection_source` | TEXT | `ai` / `rule` / `fallback_pool` / `manual`，标识 Boss 来源 |
| `seed` | INTEGER | 检索抽样种子，保证同线可复现 |
| `gap` | REAL | 建线时的战力比 `boss.cp / 队伍中位 cp`，决定章节数 |
| `chapter_count` | INTEGER | 动态章节数 3–6，建线时按 `gap` 落库，后续不再变 |
| `scene_id` | TEXT | 当前所在场景节点 |
| `vars` | TEXT | JSON 变量：`{ affection, trust, deaths, flags }`，只由 effects 写入 |
| `visited` | TEXT | JSON 数组：已读节点，用于跳过与回想 |
| `history` | TEXT | JSON：最近 100 句台词，供回想翻页 |
| `route` | TEXT | 当前路线标识，由 `route` 节点写入 |
| `script_pack` | TEXT | 剧本包 id（`douma` 等），决定正片跑哪条路线；老数据为 `default` |
| `ending` | TEXT | 已达成的结局 ID |
| `status` | TEXT | `active` / `finish` / `cleared` / `abandoned` |
| `created_at` / `updated_at` / `closed_at` | REAL | 时间戳 |

**C1 的数据库级保证**：

```sql
CREATE UNIQUE INDEX ux_story_active
  ON story_runs(owner_key) WHERE status = 'active';
```

第二条 `active` 插入直接失败，服务端返回 `409 story_active_exists`。

**存档表**（复刻 Ren'Py 的存档槽）：

```sql
CREATE TABLE story_saves (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  slot       INTEGER NOT NULL,      -- 1–5
  scene_id   TEXT NOT NULL,
  vars       TEXT NOT NULL,         -- 快照，恢复时不回溯其他表
  visited    TEXT NOT NULL,
  created_at REAL NOT NULL,
  UNIQUE (run_id, slot)             -- 同槽覆盖写
);
```

**剧情内容是文件，不是数据表**：`src/story/packs/<id>/story.ink` 定义场景图，
`characters.json` 定义角色与表情映射，`lines.json` 是台词兜底，`meta.json` 是元信息；
用 **ajv** 做 schema 校验。
启动时检查：`->` 指向不存在的 knot、`EXTERNAL` 未注册、ending 表为空，都会直接报错而不是运行时崩。
这与 Ren'Py 的 `.rpy` 编译期检查同一个思路——**结构错误必须在启动时暴露**。
详见 §3.9（剧本包）。

**桌宠状态归属**：`deskPet` 仍属轻 UI 状态（只存本地，见 SSOT §1 的排除项）。
但存在 `active` 剧情线时，桌宠显示以 `story_run.pet_key` 为准，本地 `deskPet.key` 被覆盖且不可改。

## 6. 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/api/story/preview` | 选 Boss 预演 `{ pet }`，返回 track / bosses / rationale，不落库 |
| `POST` | `/api/story/boss/check` | 自选 Boss 校验 `{ full_name }`，返回标准化候选或 4xx 原因 |
| `GET` | `/api/story/packs` | 剧本包清单（id / 标题 / 标签 / 结局表 / 方案数），`default` 排最后 |
| `POST` | `/api/story/scripts` | 剧本方案 `{ pet, boss, research, mode, pack }`：`mode=system` 只读指定包内置的模板（零模型调用），`mode=auto` 才让模型写，返回 3 个 `{title, logline, beats, pack}`，不落库 |
| `POST` | `/api/story/scripts/custom` | 自选剧本校验 `{ pet, boss, input }`，返回归一化标题与梗概 |
| `POST` | `/api/story/start` | 建线 `{ pet, script, boss, seed, selection_source }`；缺 `script` 或 `boss` 返回 400，已有 active 返回 409 |
| `GET` | `/api/story/current` | 当前状态：`scene_id` / `vars` / `route` / 主角 / Boss / 桌宠锁定态 |
| `GET` | `/api/story/scene` | 当前场景渲染数据：背景、登场角色与表情、台词、选项（含 `requires` 求值结果） |
| `POST` | `/api/story/text` | 实时生成 / 取缓存当前屏文本 `{ scene_id, vars_hash }`；命中缓存不调模型 |
| `POST` | `/api/story/choose` | 提交选项 `{ option }`；服务端校验 `requires`、执行 `effects`、跳到 `goto` |
| `POST` | `/api/story/battle-result` | 战斗结果 `{ win, battle }`；按 `battle` 节点的 win/lose 分支跳转并写变量 |
| `POST` | `/api/story/save` | 存档 `{ slot }`，快照写入 `story_saves` |
| `POST` | `/api/story/load` | 读档 `{ slot }`，恢复到该快照 |
| `POST` | `/api/story/rollback` | 回滚到上一个 `choice` 之前 |
| `GET` | `/api/story/endings` | 结局收集册（跨周目） |
| `POST` | `/api/story/close` | 结案 / 放弃 `{ reason }` |
| `GET` | `/api/story/archive` | 历史存档列表 |

`preview` 与 `start` 分开，是为了让「换一批」不产生脏记录。
身份沿用 `owner_key` 解析规则（session cookie → `X-Gitmon-User` → `public`）。

> **实现说明（v1）**：inkjs 是 JS 运行时，路线在浏览器端执行。`/api/story/scene` / `choose` /
> `battle-result` 由前端 ink 运行时等价完成，不单独暴露；服务端改用 `POST /api/story/progress`
> 持久化「本屏开始前的 ink 快照 + 变量 + 已读 + 历史 + 回滚点」，并用 `step` 做乐观锁。
> `save` / `load` / `rollback` 直接存 / 取 ink 快照，服务端不重放路线。C1、C2、C3 与结局收集
> 仍全部由服务端裁决。

## 7. 与现有模块的关系

- **Boss 候选**：GitHub Search API 实时检索（模型出查询条件）；`rivals.js` 只在断网时兜底
- **战斗**：复用 `battle.js` 引擎与 `Battle` 组件，新增 `channel='story'` 走剧情结算（不改现有 classic / ai 通道）；Boss 的 `snapshot` 由 `judge()` 转成精灵，与在线对手同一条路径
- **模型**：出检索条件、挑 Boss、写解释走现有 `llm.js` 绑定；无绑定则拒绝建线
- **桌宠**：`deskPet.js` 增加 `locked` 字段与拦截逻辑
- **入口**：`App.jsx` 现有条件弹层文案与判定改为 C3 口径（`binding` + 该精灵 `aiEvaluated`）

## 8. 边界与异常

| 场景 | 行为 |
|---|---|
| 密钥被删除 / 绑定失效 | 剧情转只读：可查看、可重玩已解锁章节，不可推进 |
| 主角精灵被删除 | 自动 `abandoned`，弹层告知，桌宠解除锁定 |
| 离线 | 可查看与重玩，推进请求进脏队列，联网后服务端裁决（不本地先行推进） |
| 多端同时推进 | 以 `updated_at` 与 `stage` 做乐观锁，落后一端返回 409 并要求拉取最新 |
| 建线时已存在 active | 返回 409，前端提示先结案旧线 |
| Boss 仓库后来被归档 / 删除 | 结算照常，但卡面标注「已归档」，不影响奖励 |

**模型调用限额**：`preview` 每次消耗 1 次模型调用；同一 `pet_key` 在 10 分钟内重复 preview 走缓存，
避免「换一批」被刷成额度黑洞。

**GitHub 配额**：一次 preview 会执行 3–6 条 Search 查询。匿名 Search 限 10 次/分钟、
60 次/小时，够 10 次左右 preview；配置 GitHub Token 后为 30 次/分钟、5000 次/小时，基本无感。
查询结果按 `query + stars 区间` 缓存 30 分钟，同赛道多玩家共享缓存。

## 9. 验收标准

1. 无模型绑定时点击入口 → 弹条件面板，两项状态正确，不建线
2. 非 AI 认证精灵不出现在可选列表；伪造请求建线返回 403
3. Boss 恰好 3 只候选全部来自 GitHub 实时检索结果，不在检索结果里的仓库名被丢弃
4. 未选最终方向时 `start` 返回 400；选中后 `story_runs.boss` 只存 1 条
5. 落选的两只不进任何章节、不落库、不可被后续战斗复用
6. 解释框展示 track、三只候选的 reason 与总述 rationale，并标注 Boss 来源（`ai` / `rule` / `fallback_pool` / `manual`）
7. 自选 Boss 校验通过后自动选中并落库，`selection_source='manual'`，其余候选丢弃
8. 自选 Boss 输入不存在的仓库 / 已归档仓库时，输入框下方给出对应原因且不建线
9. Boss 选定后进入 03 步，**不自动请求剧本**：先显示「系统剧本 / 自定义 / AI 生成」三张来源卡，此时无剧本方案、`start` 按钮不出现
10. 选「系统剧本」返回 3 个内置模板方案且**零模型调用**；选「自定义」可输入小说名或梗概（≤40 字按书名补全，>40 字按梗概处理）；选「AI 生成」才请求模型，返回 3 个剧本名，每个含 title / logline / beats 且 beats 点名 Boss
11. 三种来源互斥：改选会清掉上一来源的方案与选中态，不允许「旧卡配新来源」
12. 未选剧本时 `start` 返回 400
13. 已有 active 线时再次建线返回 409
14. 建线后桌宠切到主角且切换被拦截；结案后可自由切换
15. 模型不可用时自动降级为规则检索，`selection_source='rule'`
16. GitHub 不可达时退回内置池，`selection_source='fallback_pool'`，界面有明确标注
17. 删除主角精灵后，剧情线自动转 `abandoned` 且桌宠解锁
18. 同一 seed 下 Boss 三人组可复现
19. 离线推进不改变本地 `scene_id` 与 `vars`
19. 进入剧情模式渲染一个 `scene` 节点：背景 + 登场角色 + ≥1 句台词
20. 选项 `requires` 不满足时前端置灰，服务端对伪造提交返回 403
21. 选择后 `effects` 只改声明过的变量，未声明变量保持不变
22. 战斗失败按 `battle.lose` 分支跳转，不阻断剧情线
23. 结局按 `ending` 表顺序取第一条 `requires` 命中的；全部不命中时落到兜底结局
24. 存档 → 继续推进 → 读档，能完整恢复 `scene_id / vars / visited`
25. 回滚回到上一个 `choice` 之前，且不改变 `visited`
26. 场景 JSON 引用不存在的 `goto` 时，启动即报错
27. 同一结局重复解锁，收集册不重复计数
28. 模型返回的文本里出现非白名单仓库名时，整段作废并重写
29. 单屏生成超过 8s，返回该 `line.fallback`，界面不出现空白或无限加载
30. 同 `(scene_id, vars_hash, model)` 第二次请求命中缓存，模型调用次数不增加
31. 内容库里存在没有 `fallback` 的 `line` 时，启动校验直接报错
32. `gap ≤ 1.2` 生成 3 章，`gap > 3.5` 生成 6 章，且章节数永不超过 6
33. 成长章实例数 = `chapter_count − 1`，终章固定 1 章
34. `repeat` 节点的 `count` 表达式非法或求值结果 ≤ 0 时，启动或建线阶段报错
35. 章节数落库后不再随玩家练级变化（中途变强也不会砍掉已定的关卡）
36. `GET /api/story/packs` 返回全部包；`default` 排最后（它是 AI / 自定义剧本的兜底路线）
37. `mode=system` + `pack=douma` 返回的是斗码苍穹的方案（玄幻语汇），与 `pack=default` 的方案不同
38. 选了斗码苍穹后，正片的角色名、背景地点牌、结局标题都来自这个包，不出现通用包的文案
39. 建线 → 存档 → 重新进页面续跑，仍跑同一个包（不串回 default）
40. 同一个场景在两个包里各自生成台词（缓存键含 pack id），不互相复用
41. `meta.endings` 漏掉该包 ink 里出现的结局 id 时，`npm run story:build` 直接报错中止
42. 未知 pack id 退回 default，不让正片整个挂掉
43. 斗码苍穹正片跑的是「三年之约」骨架（含立约场景），不是旧的「被逐出宗门」骨架
44. 斗码苍穹的结局屏显示的路线名是包内的「有人作证线 / 独自赴约线」，不是通用包的「内应线 / 独行线」
45. 方案卡只是台词生成的 prompt，路线由 `story.ink` 独占——改卡不改 ink，玩家看到的正片不变
46. `mode=system` + `pack=douma` 只返回一张方案卡（《三年之约：{boss}》），界面上不出现《焚决》《名碑》
47. 方案卡数量按包走：`/api/story/packs` 的 `variant_count` 是真实卡数，界面描述按它显示，
    不能对只有一案的包说「内置三套模板」
48. 系统剧本（`script_source=system`）的每一屏台词都不调模型：前端 `isSystemScript()` 直接返回
    `source:'script'`，后端 `generate_text` 也守一道（且守卫在缓存查询之前，避免命中 AI 时期的旧缓存）；
    界面上的来源标记显示「剧本定稿」而不是「台词兜底」
49. 阶段化角色（`characters.json` 的 `stages`）按 ink 的 `# stage:` 标签取图；
    ink 用了角色表没声明的阶段时，`npm run story:build` 直接报错
50. 过场（ink 的 `# transform:`）的素材必须在包里：`meta.transforms.<key>.orb` 走 `fx/`，
    `.hero` 走 `art/`；缺文件时构建报错，不会出现「过场一片黑」

## 10.5 三年之约主线的三块特殊机制

「斗码苍穹」这条主线（剧本内容见 `src/story/packs/douma/STORY.md`）比通用包多三样东西。

### 10.5.1 解说屏（narration）

解说屏不是对话，是**片头解说**：旁白独占屏幕中央，成品配音，逐字显现
（GSAP stagger 按音频时长摊平，每个字的出现点正好落在音频结束前）。

一个包可以有多段解说，每段一屏：

```
story.ink:
  === opening ===            # 开章第一段（老写法，向后兼容）
  # opening: opening.mp3
  {say("narrator.opening")}

  === origin_a ===           # 后续解说段
  # narration: narrator_origin_a.m4a
  {say("narrator.origin_a")}
```

- ink 侧：`# opening: <文件>`（开章段）与 `# narration: <文件>`（后续段），
  值是包内 `audio/` 下的文件名；值为空就是纯字幕往下走
- runtime 侧：`scene.narration`（是不是解说屏）、`scene.narrationAudio`（这一段的音频）
- 组件：`src/components/StoryOpening.jsx`
- 配音是**包内成品**而不是运行时 TTS：解说屏一进来就要响，运行时合成要等十几秒。
  重录链路：`scripts/tts-narration.py`（见 §10.5.4）
- 玩家点画面可跳过（字全亮 + 音频快进），一次点击只往前推一格

**两个必须记住的坑：**

- **换屏时组件要重挂**：React 复用同一位置的组件，`key` 不变的话
  「只推进一格」的那道闸会从上一屏带过来，第二屏点不动 → `key={scene.sceneId}`
- **一屏别超过 120 字**：154 字会排到 8 行、约 850px，撑破解说屏。
  宁可拆成两屏（一屏讲强、一屏讲跌），两拍比一段更有分量

### 10.5.2 角色阶段（stage）

同一个角色在不同剧情阶段是不同形象。斗码苍穹里主角先是人形态（蓝发男），
云岚宗前期是白发青衣的女修，后期才现出宗主真身。

```
characters.json:
  "boss": { "stages": { "early": { "art": "boss_early.png", "face": "boss_early_face.png" } } }

story.ink:
  === vow_scene ===
  # stage: early
```

- 阶段由 ink 声明（`# stage:`），因为「这一屏用哪个阶段的形象」是剧本的事，不是界面的事
- 阶段化角色**顶层不写 `art` / `face`** —— 没有阶段信息时界面退回无阶段的图
- 文件名必须带阶段后缀（`<角色>_<阶段>.png` / `<角色>_<阶段>_face.png`）
- 加载器：`src/story/packArt.js` 的 `packStageArtUrl` / 带 `stage` 的 `packFaceUrl`

### 10.5.3 变身过场

身世两屏之后、正片之前有一段过场：**卡片形象 → 光团 → 画面变暗 → 醒来变成人形态**。

- ink 侧：`# transform: awaken`，这一屏没有台词
- 素材侧：`meta.transforms.awaken = { orb, hero, caption }`；orb 在 `fx/`，hero 在 `art/`
- 组件：`src/components/StoryTransform.jsx`，GSAP 时间轴四段
- **用 portal 挂到 body 上**：剧情模式容器一带 CSS 带 transform / filter，
  会把 `position: fixed` 的定位基准从视口改成那个容器，过场被压成一小块
- **根元素类名要用独立前缀**（`story-tf-phase-*`）：直接拼 phase 值会和子元素类名
  （`story-tf-card` 等）撞车，把根元素的 `position: fixed` 覆盖成 `absolute`
- **压暗层在舞台层之下**：z-index 反了的话，「黑暗里亮出人形」就永远看不见

### 10.5.4 成品配音的重录链路

`scripts/tts-narration.py` 把「改台词 → 重录」做成一���命令：

```bash
backend/.venv/bin/python scripts/tts-narration.py douma narrator.origin_a narrator.origin_b --speed 1.18
```

- 走本地 Kokoro（`backend/models/kokoro-multi-lang-v1_1`），免 key 免联网
- 默认音色 `sid=52`（zm_yunyang，低沉男声解说腔），避开宠物 / boss 的音
- 输出 m4a（macOS 自带 `afconvert` 转的）；转不了就留 wav，浏览器一样能播
- **不要把 m4a 改名成 mp3** —— 容器和扩展名对不上，某些浏览器会拒播
- Kokoro 中文词典认不出的写法（`GitHub`、`「」`、`——`）在合成时会被跳过，
  脚本里做了替换；显示给玩家看的文案仍保留原来的写法

## 11. 开源组件选型：能直接套的都套

原则：**通用引擎与校验直接引依赖，剧情内容与 UI 自研。** MIT 优先，引入前核对许可。

| 环节 | 选型 | 版本 / 许可 | 套用方式 |
|---|---|---|---|
| 场景图运行时（节点、选项、变量、条件） | [inkjs](https://github.com/y-lohse/inkjs) | 2.4.0 / MIT | **直接依赖**：路线用 ink 脚本离线写，运行时由 inkjs 执行 |
| 存档 / 回滚 | inkjs `state.ToJson()` / `LoadJson()` | 同上 | **直接用**：快照原样存 `story_saves` |
| 内容结构校验 | [ajv](https://github.com/ajv-validator/ajv) | 8.20 / MIT | **直接依赖**：校验 `characters.json` 与 `story_runs.payload` |
| 台词实时生成 | 自研 `llm.js` | — | 经 ink 的 `EXTERNAL` 回注 |
| Boss 检索 | 自研 `scan.js` + GitHub Search | — | 已有能力 |
| 剧情 UI（对话框 / 立绘 / 选项） | 自研 | — | [Monogatari](https://github.com/Monogatari/monogatari) 仅参考结构 |
| 短剧节拍库 | 自建 | — | 无高星可引库 |

### 采用 ink 后，设计上的三处变化

1. **场景格式从 JSON 改为 `.ink`**：`scene` → `knot`、`choice` → 选项块、`goto` → `->`、`ending` → `END`
2. **条件与变量用 ink 原生语法**，不再自研 `requires` 求值器（也就不引 json-logic-js）
3. **战斗与实时文本都走 `EXTERNAL`**：`EXTERNAL fight(id)` 返回胜负，`EXTERNAL say(key)` 返回模型文本；
   两者都有兜底字面量，ink 侧不依赖外部服务可用

### 动态章节数用 ink 表达

```ink
=== growth_loop ===
~ temp i = 0
- (loop)
  ~ i++
  -> growth_chapter(i)
  {i < chapter_count - 1: -> loop}
-> finale
```

### 为什么不全套 Monogatari

它把剧本、UI、存档全包了，套进来会替换掉现有大厅、卡面、像素风与 React 结构。
我们只需要「运行时」这一层，所以选 headless 的 inkjs。

### 许可证

inkjs 与 ajv 均为 MIT，可商用。**依赖已安装并锁定**（`package.json`：`inkjs@2.4.0`、`ajv@8.20.0`），
许可证条目见 [`THIRD-PARTY.md`](../THIRD-PARTY.md)。构建期用 ajv 校验内容库；
`npm run story:build` 负责编译与校验，`npm run test:story` 跑路线自检。

### 剧情模式的四层测试

| 命令 | 覆盖 |
|---|---|
| `npm run story:build` | 逐包编译 + 构建期守卫（结局表覆盖、台词 key 全覆盖、说话人存在） |
| `npm run test:story` | 路线自检：场景进入、选项、变量、战斗分支、动态章节数、存档回滚、多结局、**多包隔离**（两个包的路线 / 结局 / 角色表互不串） |
| `cd backend && .venv/bin/python -m pytest tests/ -q` | 后端：包注册表、系统剧本读包、世界观注入、缓存键按包隔离、pack 落库、结局标题按包取 |
| `node scripts/story-pack-check.mjs` | 浏览器端：包选择器 → 方案卡 → 建线 → 正片渲染 → **重新进页面续跑不串包**（需前后端已启动） |
| `node scripts/story-transform-check.mjs` | 浏览器端：开章解说 → **身世旁白两屏** → **变身过场四段顺序**（卡片 → 光团 → 变暗 → 人形态）→ 自动进正片；含解说屏配音/逐字显现、过场层布局与层序断言 |
| `backend/.venv/bin/python scripts/tts-narration.py douma narrator.origin_a` | 重录解说屏成品配音（本地 Kokoro） |

## 12. 未决问题

1. **赛道判定的稳定性**：同一项目两次 preview 可能被判成不同赛道，是否要缓存首次判定并锁定？
2. **结局篇幅**：只生成终章一段（3–5 beat），还是每章末尾各生成一小段、终章再总结？后者体验更连贯但调用翻倍。
3. **双语正文**：剧情文本目前只做中文；`i18n` 只覆盖 UI，正文是否要出英文版？
4. **剧情是否给数值**：当前设计只给经验与称号，不给专属词条，避免破坏竞技场平衡。
5. **桥接测试的兜底**：模型判定「映射不出来」时，是否要给玩家一个更明确的建议（换小说 / 换 Boss），
   还是只标注「强行演绎」让他自己承担？
