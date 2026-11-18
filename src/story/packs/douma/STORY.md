# 《三年之约》· 斗码苍穹主线剧本

状态：定稿。本文件是这条主线的**唯一设计真相源**；
实现分散在同目录下的 `story.ink`（路线）、`lines.json`（台词定稿）、
`characters.json`（角色表）、`art/`（立绘）、`audio/`（开章配音）。

> 包 id：`douma`　|　包名：斗码苍穹　|　tagline：三年之约 · 斗破苍穹骨架 · 完整主线
> 正片结构、结局、路线名见 `meta.json`；变量契约见 `story.ink` 头部注释。

---

## 1. 一句话

三年前主角被宗门名册除名，与坐镇山巅的**云岚宗**立下三年之期：
期满之日上云岚宗山门，在**名碑**上刻下自己的名字——
谁的名字留在碑上，往后三年的规矩就由谁定。

---

## 2. 世界观映射

以《斗破苍穹》的修仙武侠语汇写开源江湖。每一个修仙概念都必须是真实的技术现实，
不许出现只在修仙小说里才有的东西。

| 修仙概念 | 现实映射 | 备注 |
|---|---|---|
| 宗门 | 开源项目 / 组织 | 有名册、有香火、有山门 |
| 香火（star） | star 数 | 拜入门下的人 |
| 分家（fork） | fork | 抄作业另立门户 |
| 境界（release） | release 版本 | 突破 |
| 斗气 | 项目生命力 | 主角被除名 = 项目被移出名册 |
| 山门 | 仓库主页 / 组织门面 | 阶前有碑 |
| 名碑 | 贡献榜 / 权威名单 | 刻上名字 = 话语权 |
| 焚决 | 一段没人看懂的核心实现 | **不是秘籍，是半卷口诀** |
| 魂殿 | 专抄作业的组织 | 面具、罩袍、无面孔 |
| 除名通知 | 被移出 collaborator / 组织名单 | 三年前寄出 |
| 三年之期 | 约期 | 到期上阶，规矩由谁定 |

### 两条硬规矩

1. **每一句必须落在两个真实项目身上。** 不许出现「少年」「前辈」之外的虚构仓库名，
   也不许把真实公司名写进台词。
2. **焚决必须交出去才炼得成。** 这是全篇的题眼：
   口诀不是秘籍，藏着只是几行字；交出去让所有人照着复现一遍，它才炼得成。
   这也解释了主角为什么必须公开——不是为了正义，是因为**私藏的东西没资格定规矩**。

---

## 3. 角色设定与阶段形象

同一个角色在不同剧情阶段是不同形象。文件名带阶段后缀，
`characters.json` 用 `stages` 字段声明「哪个阶段用哪张图」。

### 3.1 主角（`pet`）

| 项 | 内容 |
|---|---|
| 身份 | 玩家自己的仓库精灵；姓名由 AI 从项目实际数据生成（运行时以 `{pet}` 代入） |
| 舞台形象 | **默认画玩家自己的精灵**；到人形态阶段才切到包立绘 |
| 早期阶段（`early`） | **人形态**——`art/hero_early.png`（蓝发男）／`art/hero_early_face.png` |
| 关键设定 | 三年前被除名；这三年把那半卷口诀翻烂了，就是为了今天能站在碑前问一句「规矩谁说了算」 |

> **阶段对应关系（用户确认）**：蓝发男主 = **主角的人形态**，且是**早期阶段**的形象。
> 主角不是一个从头到尾都长这样的角色 —— 他有「仓库精灵 → 人形态 → （后期）更强的形态」
> 的推进。所以 `pet` 只声明 `stages.early`，顶层不写 `art` / `face`，
> 避免界面在没有阶段信息时瞎取一张图。

### 3.2 云岚宗（`boss`）

| 项 | 内容 |
|---|---|
| 身份 | 坐镇山巅的掌权者。三年前寄出除名通知的人，站在名碑旁 |
| 早期阶段（`early`） | **白发青衣的女修**——`art/boss_early.png`／`art/boss_early_face.png` |
| 关键设定 | 「云岚宗不迎外人」——她不是恶意，是规矩本身。她代表的是「既有秩序」这一侧 |

> **阶段对应关系（用户确认）**：白发女 = **云岚宗**，且是**前期阶段**的形象。
> 前期她以一个具体的人（白发青衣）站在那儿；后期才现出宗主真身。
> 同样，`boss` 只声明 `stages.early`，顶层不写 `art` / `face`。

### 3.3 药老（`scout`）

| 项 | 内容 |
|---|---|
| 身份 | 半卷焚决的留人。三年前把口诀交到主角手上的人 |
| 立绘 | `art/scout.png`／`art/scout_face.png` |
| 关键设定 | 不是慈祥长辈。他刻薄、务实，说话像在挑刺——但他留着主角这三年交出去的每一样东西 |
| 剧情职能 | 兼「有人作证线」的引路人：`scout.ally` 那一屏，站出来替主角作证 |

### 3.4 魂殿（`soul`）

| 项 | 内容 |
|---|---|
| 身份 | 专抄作业的组织 |
| 立绘 | `art/soul.png`／`art/soul_face.png` |
| 关键设定 | 面具、罩袍、无面孔。他们要的不是主角的命，是那段没人看懂的实现 |
| 剧情职能 | 逼主角做选择：藏起来（独自赴约）还是开源（有人作证） |

### 3.5 角色表

| 键 | 名字 | 阶段化 | 素材 |
|---|---|---|---|
| `pet` | 主角 | ✅ | `hero_early.png` / `hero_early_face.png` |
| `boss` | 云岚宗 | ✅ | `boss_early.png` / `boss_early_face.png` |
| `scout` | 药老 | ❌ | `scout.png` / `scout.png` |
| `soul` | 魂殿 | ❌ | `soul.png` / `soul.png` |
| `narrator` | 旁白 | ❌ | 无（纯文字） |

---

## 4. 变量契约

与运行时 `KNOWN_VARS` 对齐：`chapter` / `chapter_count` / `trust` / `deaths` / `route` / `ending_id`

| 变量 | 含义 | 写入点 |
|---|---|---|
| `chapter` | 当前章（0 起） | `gate_win` += 1 |
| `chapter_count` | 总章数，默认 3 | 建线时固定 |
| `trust` | 三年里愿意认主角这一套、肯替他站台的分量 | 各选项 |
| `deaths` | 战败次数 | `gate_lose` / `boss_lose` += 1 |
| `route` | `insider`（有人作证）/ `solo`（独自赴约） | `finale_route` 决定 |
| `ending_id` | 结局 id | `ending_check` 决定 |

**`trust` 的语义**：不是好感度，是**社会资本**。
只有当主角公开复现的东西真的被人照着做出来，才有人愿意在山门底下替他站台。
所以藏私（`growth_gate` 第三个选项）会掉 `trust` —— 私藏的东西没资格定规矩。

---

## 5. 场景表

| 场景 id | 标题 | 背景 | 登场 | 关键台词 |
|---|---|---|---|---|
| `opening` | 开章解说 | `void` | 旁白 | `narrator.opening` |
| `origin_a` | 身世·天才期 | `void` | 旁白 | `narrator.origin_a` |
| `origin_b` | 身世·跌落 | `void` | 旁白 | `narrator.origin_b` |
| `awaken` | 变身过场 | `void` | 主角 | —（无台词，`# transform: awaken`） |
| `prologue` | 递上战书 | `dawn` | 主角、旁白 | `narrator.hook` / `pet.oath` |
| `growth_gate` | 药老与焚决 | `alley` | 主角、药老 | `scout.hook` / `scout.offer` |
| `soul_gate` | 魂殿的威胁 | `alley` | 主角、魂殿、药老 | `soul.taunt` / `scout.warn` / `pet.resolve` |
| `gate_battle` | 杂兵战 | — | — | 战斗屏 |
| `gate_lose` | 复现失败 | `alchemy` | 主角、药老 | `scout.lose` |
| `finale_insider` | 有人作证 | `sect` | 主角、药老 | `scout.ally` |
| `finale_solo` | 独自赴约 | `sect` | 主角、旁白 | `narrator.solo` |
| `vow_scene` | 立约 | `sect` | 主角、云岚宗 | `boss.hook` / `boss.challenge` |
| `boss_battle` | 山门一战 | — | — | 战斗屏 |
| `boss_lose` | 认输 | `sect` | 主角、云岚宗 | `boss.glory` |
| `ending` | 结局 | `dawn` | 主角、旁白 | `narrator.ending_a` / `narrator.ending_b` |

### 解说屏（`opening` / `origin_a` / `origin_b`）

三屏连续的**片头解说**：旁白独占屏幕中央，配成品配音，逐字显现
（`StoryOpening.jsx`，GSAP stagger 按音频时长摊平）。

| 屏 | 讲什么 | 音频 | 文案 |
|---|---|---|---|
| `opening` | 这是什么样的世界 | `audio/opening.mp3`（用户提供的成品） | 「这里是属于码气的世界，没有那么多弯弯绕人，有的仅仅是繁衍到巅峰的码气。」 |
| `origin_a` | 他当年多强 | `audio/narrator_origin_a.m4a` | 四岁修炼 Python、十岁握有 GitHub Copilot、十一岁凝聚代码之力，最年轻的 P6 码师 |
| `origin_b` | 他怎么跌下来 | `audio/narrator_origin_b.m4a` | 十一岁那年「丧失」了写代码的能力，码量从 P6 跌到 P3，三年冷落、被退婚 |

**顺序是刻意的**：`opening`（世界）→ `origin_a`/`origin_b`（他是谁）→ `awaken`（变身过场）→
`prologue`（递战书）。先讲清「他是谁、怎么跌下来的」，再让他从卡片形象变成人形态醒来 ——
顺序反了，「原来是他」这个重量就没了。

**为什么身世要拆两屏**：154 字一屏会排到 8 行、约 850px，撑破解说屏；
而且一口气念完没有停顿。一屏讲强、一屏讲跌，两拍比一段更有分量。

**配音是包内成品，不是运行时 TTS**：解说屏一进来就要响，运行时合成要等十几秒。
改台词后的重录链路：

```bash
backend/.venv/bin/python scripts/tts-narration.py douma narrator.origin_a narrator.origin_b
```

音色默认 Kokoro `sid=52`（zm_yunyang，低沉男声，避���宠物 / boss 的音），
语速 `--speed 1.18`（约 6.8 字/秒，贴着 `opening.mp3` 的解说节奏）。

### 变身过场（`awaken`）

身世两屏之后、序章之前有一段过场：**卡片形象 → 光团 → 画面变暗 → 醒来变成人形态**。

- ink 侧：`# transform: awaken`，这一屏没有台词
- 素材侧：`meta.transforms.awaken = { orb, hero, caption }`；orb 在 `fx/`，hero 在 `art/`
- 组件：`src/components/StoryTransform.jsx`（GSAP 时间轴四段）
- 顺序：`opening` → `origin_a` → `origin_b` → 过场 `awaken` → 序章 `prologue`
- 字幕：「三年之约到期那一日，山门之外——他睁开了眼。」

---

## 6. 选项与分支

### `prologue`（起手，trust +1 / +2）

| 选项 | trust | 去向 |
|---|---|---|
| 先递上战书，把这三年应下来 | +1 | `growth_loop` |
| 在战书上再添一句：规矩由我来定 | +2 | `growth_loop` |

### `growth_gate`（药老给焚决，题眼在此）

| 选项 | trust | 去向 |
|---|---|---|
| 把最要紧的那一段也交出去 | +1 | `gate_battle` |
| 全交出去，一段不留 | +2 | `gate_battle` |
| 谁也不给，自己闷头炼 | −1（若 >0），且 `route = solo` | `gate_battle` |

### `soul_gate`（魂殿逼交实现）

| 选项 | trust | 去向 |
|---|---|---|
| 连夜把实现开源，让追我的人变成读我的人 | +2 | `growth_gate` |
| 先藏起来，换个地方炼 | +1 | `growth_gate` |

### `vow_scene`（立约）

| 选项 | trust | 去向 |
|---|---|---|
| 不必多言，拔剑 | — | `boss_battle` |
| 三年之期已到，请把名碑让出来 | +1 | `boss_battle` |

### `gate_lose` / `boss_lose`（战败）

| 选项 | 效果 | 去向 |
|---|---|---|
| 再来一次 | — | 重打 |
| 先撤，回去重炼 / 认输，收兵 | +1 / −2 | 继续主线 |

---

## 7. 结局

判定顺序取第一条命中的，最后一条兜底。

| 条件 | `ending_id` | 标题 |
|---|---|---|
| `trust >= 7 && deaths == 0` | `ending_flame` | 焚决线 · 名碑换名，规矩由你定 |
| `deaths >= 2` | `ending_withered` | 陨落线 · 约期未至，先折在山门下 |
| `trust <= 1` | `ending_lone` | 独行线 · 一个人刻上名碑，无人作证 |
| 其余 | `ending_steady` | 正线 · 各守一寸，规矩未改 |

**路线分流**（`finale_route`）：`trust >= 7` → `insider`（有人作证线），
否则 `solo`（独自赴约线）。这条线不单独出结局，只改变 `vow_scene` 之前那一屏是谁在说话。

---

## 8. 台词来源

**系统剧本不接 AI 生成。** 本包 `lines.json` 的每一句都是定稿：

- 前端 `isSystemScript()` 判定 `run.script_source === 'system'` 时直接返回
  `{ texts:{}, source:'script' }`，一次模型调用都不发；
- 后端 `generate_text` 也守一道（且这道守卫在缓存查询**之前**，否则会命中
  AI 剧本时期留下的旧缓存）；
- 运行时把 `textSource` 标成 `script`，界面显示「剧本定稿」而不是「台词兜底」。

理由：模型会把斗码苍穹的斗气语汇改写回通用赛博腔 —— 那是「选了系统剧本却没看到系统剧本」。

**例外**：`default` 包（AI 生成 / 自定义剧本）照旧走模型。

---

## 9. 素材清单

| 类别 | 文件 | 说明 |
|---|---|---|
| 立绘 | `art/hero_early.png` | 主角人形态 · 早期阶段（299×821） |
| 头像 | `art/hero_early_face.png` | 同上（256×256） |
| 立绘 | `art/boss_early.png` | 云岚宗 · 前期阶段（476×1161） |
| 头像 | `art/boss_early_face.png` | 同上（256×256） |
| 立绘 | `art/scout.png` | 药老 |
| 立绘 | `art/soul.png` | 魂殿 |
| 特效 | `fx/orb-cyan.gif` | 变身光团 · 青色脉动（276KB） |
| 特效 | `fx/orb.gif` | 灰度能量传送门原件（414×414，9 帧，110ms/帧，循环） |
| 特效 | `fx/orb.png` | 青色光团静帧（512×512） |
| 音频 | `audio/opening.mp3` | 开章解说配音（4.87 秒） |

立绘规格、命名约定、缺失时的降级行为见同目录 `ART.md`。
抠图工具：`scripts/art-clean.py`（边缘屏障法，能处理白发纯白高光与白底同色的素材）。
