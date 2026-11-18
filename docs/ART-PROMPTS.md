# 立绘提示词总表（直接复制）

> 自动生成 · 风格 = **像素风**。换风格重跑：`node scripts/art-prompts.mjs paint` / `... pixel`。
> 规格与文件命名见 [`ASSETS.md`](ASSETS.md)，进化阶梯见 [`../README.md`](../README.md#进化系统)。

## 一、要生成什么

每只精灵 = **种族 × 属性 × 等级形态**。7 种族 × 9 属性 = **63 个格子**，每格按进化阶段最多 9 张图。

| 方案 | 每格几张 | 总张数 | 说明 |
| --- | --- | --- | --- |
| 最小可用 | 1 张（通用图） | **63** | Lv.1–499 共用，跑通全流程够用 |
| **推荐** | 4 张（通用 + 人形态 ×3） | **252** | 兽形靠通用图，Lv.500 以上有三档人形 |
| 完整 | 10 张（通用 + s2–s9） | 630 | 每级都不同，分量很大，不建议起手就做 |

**开工顺序**（按内置对手命中率）：`元素型(13) → 鸟型(9) → 兽型(6) → 龙型(2) → 飞行型 → 幻兽型 → 精灵型`。

内置对手已经用到的 20 格标了 **●**，其余格子先留空会自动回落像素精灵，所以可以一格一格补。

## 二、统一规格（每条提示词已自带，这里备查）

| 项 | 值 |
| --- | --- |
| 画布 | 512×512（768 / 1024 也行，自动等比缩） |
| 背景 | 全透明，无地面无投影 |
| 构图 | 正面偏 3/4，全身，主体占 80%，脚底离画布底 8% |
| 描边 | 统一深色描边（像素风 4px / 厚涂 6px） |
| 光影 | 单侧光，统一左上 |
| 存放 | `src/assets/species/<种族>/<属性>.png`，阶段图加 `-s7` `-s8` `-s9` |

**负面词**（工具支持负面提示词时填这段）：

```
extra limbs, duplicated eyes, cropped body, busy background, text, signature, blurry, jpeg artifacts
```

> 属性只改配色与纹样，**不改外形**。同一格子的 4 张（通用 / s7 / s8 / s9）必须一眼看出是同一只生物。

## 三、九阶形态（所有种族共用这条曲线）

| 阶段 | 起始等级 | 形态名 | 体型怎么变 | 文件后缀 |
| --- | --- | --- | --- | --- |
| 1 | 1 | 幼体 | 头大身小，幼崽比例，标志器官刚冒头 | `.png` |
| 2 | 10 | 初生体 | 长大一号，头身比约 1:1 | `-s2` |
| 3 | 50 | 成长体 | 四肢 / 翅膀成形，标志性特征出现 | `-s3` |
| 4 | 100 | 成熟体 | 成体比例，开始有花纹与装甲 | `-s4` |
| 5 | 200 | 强化体 | 肌肉与外壳强化，肩背多加结构 | `-s5` |
| 6 | 300 | 完全体 | 兽形最终阶，体态舒展、气场外溢 | `-s6` |
| 7 | 500 | 人形态 | **直立人形**，保留种族头冠 / 耳 / 尾 / 翼 | `-s7` |
| 8 | 800 | 人形态·觉醒 | 人形 + 战装、披风、悬浮部件、光环 | `-s8` |
| 9 | 999 | 人形态·神话 | 人形终形，神话感、光翼、符文环 | `-s9` |

阶段只由等级推导，**Lv.500 起一律人形态**；500 以下是自由形态，长相由「种族 × 属性」组合决定，不逐级固定。

## 四、中文版提示词（工具只吃中文时用）

拼接公式：**种族句 + 属性句 + 画风句**，一段话丢进去就行，不用照抄英文。

**画风句**（固定不变）：

```
像素风游戏立绘，96×96 网格放大，硬边无抗锯齿，深色粗描边，平涂加一层阴影，左上方单侧光；正面偏 3/4 视角，全身，主体占画面 80%，居中，脚底离画布底 8%，纯透明背景，不要地面和投影，不要文字
```

**种族句**（选一个）：

| 种族 | 中文描述 |
| --- | --- |
| 元素型 | 一只没有固定骨架的元素精灵，柔软圆润的团块身体，没有四肢，两只发光眼睛，漂浮姿态，周围绕着小碎块 |
| 鸟型 | 一只小鸟形生物，尖喙，后掠羽冠，身体两侧收着翅膀，细枝一样的腿，机敏前倾站姿 |
| 兽型 | 一只圆头四足小兽，巨大的水亮眼睛，竖立的尖耳，小爪子，蓬松尾巴，圆胖可爱 |
| 龙型 | 一条身形修长的龙，长颈，背脊棘刺，带角的头，粗壮渐细的长尾，四足利爪 |
| 飞行型 | 一只流线型飞行生物，宽大的膜翼，身体线条流畅，长尾鳍，悬浮在空中不落地 |
| 幻兽型 | 一只神秘幻兽，脸上是一张雕纹面具，身体中空且漂浮，周围有分离的碎块，面具上有发光符文，没有腿 |
| 精灵型 | 一只很小的精灵，圆润半透明的身体，温柔的大眼睛，小半透明翅膀，周围有光点环绕 |

**属性句**（选一个，接在种族句后面）：

| 属性 | 中文描述 |
| --- | --- |
| 水 | 水蓝配色（#4a9eff），流动水纹，水珠高光，柔软鳞片质感 |
| 雷 | 电黄配色（#f5c542），闪电状纹路，尖端有噼啪火花 |
| 钢 | 银灰配色（#9fb2c8），磨砂金属板与铆钉，边缘锋利泛光 |
| 地 | 大地棕配色（#a67c52），层叠岩层带与土壤裂纹 |
| 岩 | 砂岩配色（#b08968），背部长出水晶碎块，矿物斑点与粗糙石块 |
| 火 | 熔岩橙红配色（#ff6b4a），火焰簇与余烬，轻微热浪 |
| 风 | 薄荷青配色（#7fd4c1），盘旋气流，羽状流苏，运动残影 |
| 草 | 叶绿配色（#7bc96f），卷曲藤蔓与新芽，小花瓣 |
| 普通 | 浅灰配色（#b8b8b8），简单几何纹样，细节最少 |

**阶段句**（可选，想区分等级时接在最后）：

| 阶段 | 中文补充 |
| --- | --- |
| 幼体 Lv.1 | 幼崽比例，头几乎和身体一样大，四肢短粗 |
| 初生体 Lv.10 | 长大了些，头身比约 1:1 |
| 成长体 Lv.50 | 四肢或翅膀成形，标志性特征长出来 |
| 成熟体 Lv.100 | 成体比例，开始出现花纹和装甲 |
| 强化体 Lv.200 | 肌肉和外壳强化，肩背多出结构 |
| 完全体 Lv.300 | 兽形最终形态，体态舒展，气场外溢 |
| 人形态 Lv.500 | 直立人形身体，保留种族的头冠、耳朵、尾巴或翅膀 |
| 觉醒 Lv.800 | 人形外加战装、披风、悬浮部件和光环 |
| 神话 Lv.999 | 神话感的人形终形，光翼、符文环、华丽装束 |

> 英文提示词在下面第四节，效果一般更稳（多数模型对英文理解更好）；中文版适合只吃中文的工具。

## 五、逐种族提示词

每种族两块：**9 阶形态表**（决定画什么）+ **逐属性提示词**（决定配色）。每个提示词块固定 4 行，**依次是 通用 / -s7 人形态 / -s8 觉醒 / -s9 神话**，一行一条，整行复制即可。

---

### 1. 元素型 `element`

- **对应仓库**：库 / 框架 —— 所有没命中其它种族的仓库都归这里（内置对手里最多）
- **体型记忆点**：没有固定骨架的团块 / 流体 / 晶体，靠属性色与纹样区分，两只发光眼是唯一恒定特征

#### 元素型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 掌心大的液滴团，一只大眼，两颗碎屑绕着转 |
| 2 | 10 | 初生体 | 长高一截，头部隆起分出，碎屑变三颗 |
| 3 | 50 | 成长体 | 水滴身伸出两条涡状手臂，体内浮着发光核心 |
| 4 | 100 | 成熟体 | 紧凑涡旋体，碎片连成环，眼神有了意志 |
| 5 | 200 | 强化体 | 密实核心外裹厚重能量壳，碎片变锋利 |
| 6 | 300 | 完全体 | 高耸的元素柱，多重能量环，核心全亮 |
| 7 | 500 | 人形态 | 半透明流体人形，流动物质构成兜帽长袍轮廓，肩侧浮碎屑 |
| 8 | 800 | 人形态·觉醒 | 物质硬化成甲，背后碎屑披风，腰间符文光带 |
| 9 | 999 | 人形态·神话 | 半光半实体，浮空晶冠，手臂拖出长光带 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a palm-sized droplet of living matter, almost spherical, single big eye, two tiny orbs circling it
-s2  a slightly taller blob, a head-lump separating from the body, three orbiting fragments
-s3  a teardrop body with two curling swirl arms, a floating core visible inside
-s4  a compact swirl body, a ring of fragments orbiting it, eyes narrowed with intent
-s5  a dense compressed core wrapped in thick swirling shells of energy, fragments sharpened
-s6  a towering elemental pillar of swirling matter, multiple energy rings, radiant core, shards orbiting
```

</details>

#### 元素型 · 水 ●

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 雷

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 钢 ●

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 地 ●

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 岩 ●

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 火 ●

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 风

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 草

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 元素型 · 普通 ●

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

### 2. 鸟型 `bird`

- **对应仓库**：工具 / CLI —— bin、cmd 目录，或命中 cli / terminal / toolkit 关键词
- **体型记忆点**：尖喙、后掠羽冠、折叠翅膀，腿细如枝，机敏狡黠，站姿前倾

#### 鸟型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 刚破壳的雏鸟，圆绒毛球，头大翅废，小尖喙 |
| 2 | 10 | 初生体 | 亚成鸟，翅尖长出真羽，尾羽鼓包 |
| 3 | 50 | 成长体 | 精瘦幼鸟，羽冠开始后掠，尾羽展开，一翅半张 |
| 4 | 100 | 成熟体 | 顺滑成鸟，完整羽冠，层叠飞羽，喙锋利 |
| 5 | 200 | 强化体 | 羽缘带金属光，冠尖发光，利爪，双翅半展 |
| 6 | 300 | 完全体 | 长尾羽、宽冠、发光眼环，展翅示威 |
| 7 | 500 | 人形态 | 细长直立的鸟人，鸟腿利爪，小臂覆羽，喙状鼻，后掠羽冠 |
| 8 | 800 | 人形态·觉醒 | 轻甲 + 羽形肩甲，短羽披风，爪甲发光 |
| 9 | 999 | 人形态·神话 | 长礼羽拖尾，羽刃冠，背后透光翼影，飘羽 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a just-hatched chick, round fluffy down ball, oversized head, stubby useless wings, tiny beak
-s2  a fledgling with downy fluff, first real feathers on the wingtips, short tail nub
-s3  a lean young bird, crest starting to sweep back, tail feathers grown out, one wing half open
-s4  a sleek adult bird, full crest, layered wing feathers, sharpened beak
-s5  a sharp-taloned bird with metal-sheen feather edges, crest tipped with energy glow, wings half spread
-s6  a proud apex bird, long trailing tail feathers, wide crest, glowing eye rings, wings spread in a display pose
```

</details>

#### 鸟型 · 水

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 雷 ●

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 钢 ●

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 地 ●

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 岩 ●

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 火

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 风

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 草 ●

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 鸟型 · 普通 ●

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

### 3. 兽型 `beast`

- **对应仓库**：Web 应用 / 前端框架 —— index.html + JS/TS，或 react / vue / next 等关键词
- **体型记忆点**：圆头大眼、竖耳、小爪、蓬松尾巴，四肢着地或半直立，亲和活泼

#### 兽型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 新生幼崽，头身等大，四肢短粗，坐姿 |
| 2 | 10 | 初生体 | 头身比约 1:1，爪尖成形，耳尖刚立起 |
| 3 | 50 | 成长体 | 四足站立的幼兽，尾巴长出，颊毛出现 |
| 4 | 100 | 成熟体 | 成体比例，背肩出现第一道花纹 |
| 5 | 200 | 强化体 | 肩背肌肉隆起，前肢覆甲片，尾尖发光 |
| 6 | 300 | 完全体 | 鬃毛浓密，脊背棘刺，站姿舒展，气场外溢 |
| 7 | 500 | 人形态 | 直立的兽人，反曲腿，保留兽吻、尖耳与蓬松尾巴 |
| 8 | 800 | 人形态·觉醒 | 轻战甲 + 层叠肩甲 + 短披风，甲面符纹发光 |
| 9 | 999 | 人形态·神话 | 华服加身，弯角冠，背后光翼，符文环，长毛披肩 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a newborn cub, head as big as the whole body, stubby limbs, sitting on its haunches
-s2  a baby beast at one-to-one head-to-body ratio, tiny claws forming, ear tips just rising
-s3  a young beast standing on four legs, tail grown out, cheek tufts appearing
-s4  an adult-proportioned beast, lean body, first markings across the back and shoulders
-s5  a powerful beast with muscular shoulders, plate-like fur ridges on the forelegs, glowing tail tip
-s6  a fully grown apex beast with a thick mane, ridge spikes along the spine, wide confident stance and an energy aura
```

</details>

#### 兽型 · 水 ●

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 雷 ●

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 钢

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 地

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 岩 ●

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 火

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 风

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 草 ●

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 兽型 · 普通

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

### 4. 龙型 `dragon`

- **对应仓库**：AI / 数据 —— machine-learning / llm / pytorch 等关键词，或语言含 Jupyter Notebook
- **体型记忆点**：长颈、背棘、粗尾、角冠，体型最大最重，威压感与稀有感

#### 龙型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 刚破壳的幼龙，头大，翼折叠，短卷尾 |
| 2 | 10 | 初生体 | 长颈初显，背棘成软突起，尾巴绕着脚 |
| 3 | 50 | 成长体 | 四足幼龙，脊棘成形，角萌出，双翅半展 |
| 4 | 100 | 成熟体 | 精瘦成体龙，完整角冠，长尾带鳍 |
| 5 | 200 | 强化体 | 厚肩密鳞，大角，鳞缝间漏光 |
| 6 | 300 | 完全体 | 巨大双翼高折，角冠，粗尾，气场与浮石 |
| 7 | 500 | 人形态 | 高瘦龙人，小臂小腿覆鳞，弯角，长尾，竖瞳 |
| 8 | 800 | 人形态·觉醒 | 鳞甲战装，背后膜翼披风，甲面符文发光 |
| 9 | 999 | 人形态·神话 | 鳞纹礼袍，长角冠，巨大透光翼，浮符文环 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a hatchling dragon, oversized head, tiny folded wings, short curled tail, sitting in an eggshell remnant
-s2  a small dragon with a longer neck, first back spines as soft nubs, tail curling around its feet
-s3  a young dragon on four legs, spine ridge forming, horns budding, wings half unfolded
-s4  a lean adult dragon, full horn set, defined spine spines, long tail ending in a fin
-s5  a heavy-shouldered dragon with dense armour scales, larger horns, energy glowing between the plates
-s6  a towering apex dragon, wide wingspan folded high, crown of horns, thick tail, radiating aura and floating debris
```

</details>

#### 龙型 · 水 ●

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 雷

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 钢

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 地

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 岩

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 火

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 风

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 草

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 龙型 · 普通

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

### 5. 飞行型 `flying`

- **对应仓库**：移动端 —— android / ios / flutter / react-native，或 pubspec.yaml 等
- **体型记忆点**：宽膜翼、流线身体、长尾鳍，永远悬浮不落地，轻盈现代

#### 飞行型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 悬浮的幼虫，两片翅芽，飘在半空 |
| 2 | 10 | 初生体 | 半透明短翅，细尾鳍，低空悬停 |
| 3 | 50 | 成长体 | 流线幼体，双翅半张，尾鳍开始分叉 |
| 4 | 100 | 成熟体 | 光滑成体，宽翅轮廓干净，头冠流线 |
| 5 | 200 | 强化体 | 翅缘成刃，膜片分层，背侧有发光喷口 |
| 6 | 300 | 完全体 | 巨型翼展，多条飘带鳍，翼缘发光，高悬 |
| 7 | 500 | 人形态 | 纤瘦流线体型的翼人，背后收拢膜翼，头冠，紧身飞行服，悬空 |
| 8 | 800 | 人形态·觉醒 | 轻飞行甲 + 鳍形肩甲，翼脉发光，踝部光推进 |
| 9 | 999 | 人形态·神话 | 长飘带，鳍刃冠，巨大透光翼全展，气流环绕 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a tiny floating larva-like creature, two tiny wing buds, drifting in the air
-s2  a small flyer with short translucent wings, thin tail fin, hovering low
-s3  a streamlined juvenile flyer, wings half spread, tail fin splitting into two
-s4  a smooth adult flyer, wide wings with clean outlines, aerodynamic head crest
-s5  a reinforced flyer with blade-like wing edges, layered membrane plates, glowing vents along the back
-s6  a majestic flyer with a huge wingspan, multiple trailing fin ribbons, radiant wing edges, hovering high
```

</details>

#### 飞行型 · 水

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 雷

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 钢

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 地

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 岩

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 火

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 风 ●

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 草

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 飞行型 · 普通

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

### 6. 幻兽型 `phantom`

- **对应仓库**：游戏 / 图形 —— game / graphics / shader / renderer / unity / godot
- **体型记忆点**：面具当脸 + 身体中空 + 漂浮碎块，腿不存在，脚下一缕消散，神秘非实体

#### 幻兽型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 小面具 + 一缕烟状身体，一道发光眼缝 |
| 2 | 10 | 初生体 | 面具下方凝出空心身体，两块碎片漂着 |
| 3 | 50 | 成长体 | 兜帽幻影，三块碎片环绕，烟臂成形 |
| 4 | 100 | 成熟体 | 稳定身躯 + 角面具，垂挂光链，符文变亮 |
| 5 | 200 | 强化体 | 层叠外壳包着空核，大量碎片成环，面具裂出光 |
| 6 | 300 | 完全体 | 高耸幻影，多张面具叠成冠，密碎屑环，身体半消散 |
| 7 | 500 | 人形态 | 兜帽面具的人形幻影，身体中空，肩侧浮碎屑，袍摆符文，足部消散 |
| 8 | 800 | 人形态·觉醒 | 深色层甲 + 符文板，碎屑披风，面具裂开露出光 |
| 9 | 999 | 人形态·神话 | 华丽角面具，长袍化作粒子，多张面具碎片环绕，符文光环 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a small floating mask with a wisp of smoke for a body, one glowing eye slit
-s2  a mask with a small hollow body forming under it, two floating fragments
-s3  a hooded phantom with a mask, three fragments orbiting, arms forming from smoke
-s4  a stable phantom body with a horned mask, hanging chains of light, runes glowing brighter
-s5  a large phantom with layered shell plates around a hollow core, many orbiting shards, mask cracked with light
-s6  a towering phantom, multiple masks stacked into a crown, dense orbiting debris ring, body half dissolving into particles
```

</details>

#### 幻兽型 · 水

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 雷 ●

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 钢

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 地

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 岩

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 火

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 风

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 草

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 幻兽型 · 普通

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

### 7. 精灵型 `fairy`

- **对应仓库**：文档 / 博客 —— mkdocs / docusaurus / docsify / _config.yml，且仓库很小
- **体型记忆点**：小体型、大眼、半透明身体、光点环绕，温柔治愈

#### 精灵型 · 9 阶形态

| 阶段 | Lv | 形态 | 画成什么样 |
| --- | --- | --- | --- |
| 1 | 1 | 幼体 | 米粒大的光种，一只大眼，两点光围绕 |
| 2 | 10 | 初生体 | 小精灵，半透明短翅，身体渐实，三点光 |
| 3 | 50 | 成长体 | 纤瘦幼体，透明翅，花瓣环绕，小飘带 |
| 4 | 100 | 成熟体 | 优雅成体，层叠透翅，发丝发光，光点成环 |
| 5 | 200 | 强化体 | 内核心全亮，双对翅，拖出长光带 |
| 6 | 300 | 完全体 | 完全觉醒，宽光翼，光环，飘花与闪光 |
| 7 | 500 | 人形态 | 小巧纤细的妖精人形，尖耳，透光翅，悬空，层叠短裙 |
| 8 | 800 | 人形态·觉醒 | 礼仪轻裙 + 叶形饰，翅脉更亮，额前光冠 |
| 9 | 999 | 人形态·神话 | 长光裙，花冠，巨大透光翼，密集光点与花瓣 |

<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>

把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：

```
-s1  a mote-sized fairy, a glowing seed with one big eye and a faint aura, two light dots circling
-s2  a small fairy with stubby translucent wings, body slowly solidifying, three light motes
-s3  a slim young fairy, clear wings, floating petals around it, small ribbon-like scarf
-s4  a graceful adult fairy, layered translucent wings, glowing hair-like tendrils, ring of motes
-s5  a radiant fairy with a bright inner core, double wing pairs, trailing light ribbons
-s6  a fully awakened fairy, wide glowing wings, halo of light, drifting petals and sparkles
```

</details>

#### 精灵型 · 水

主色 #4a9eff · Python · 依次存为 `water.png` / `water-s7.png` / `water-s8.png` / `water-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 雷

主色 #f5c542 · JS / TS / Vue · 依次存为 `thunder.png` / `thunder-s7.png` / `thunder-s8.png` / `thunder-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 钢

主色 #9fb2c8 · Rust · 依次存为 `steel.png` / `steel-s7.png` / `steel-s8.png` / `steel-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 地

主色 #a67c52 · Go · 依次存为 `earth.png` / `earth-s7.png` / `earth-s8.png` / `earth-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 岩

主色 #b08968 · Java / Kotlin · 依次存为 `rock.png` / `rock-s7.png` / `rock-s8.png` / `rock-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 火

主色 #ff6b4a · C / C++ / C# · 依次存为 `fire.png` / `fire-s7.png` / `fire-s8.png` / `fire-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 风

主色 #7fd4c1 · Swift / Dart · 依次存为 `wind.png` / `wind-s7.png` / `wind-s8.png` / `wind-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 草

主色 #7bc96f · Ruby / PHP · 依次存为 `grass.png` / `grass-s7.png` / `grass-s8.png` / `grass-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

#### 精灵型 · 普通 ●

主色 #b8b8b8 · Shell / HTML / CSS · 依次存为 `normal.png` / `normal-s7.png` / `normal-s8.png` / `normal-s9.png`

```
a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals, neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail, pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left, front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text
```

---

## 六、生成完怎么验

```bash
# 1. 按文件名丢进 src/assets/species/<种族>/
# 2. 看还缺哪些格子（打印 7×9 覆盖矩阵）
npm run art:check
# 3. 刷新页面即可，dev server 热更新
```

自查：

- [ ] 背景真的透明（不是白底）
- [ ] 脚底位置一致，主体没偏小
- [ ] 描边粗细和其它图一致
- [ ] 同一格 4 张（通用 / s7 / s8 / s9）看得出是同一只
- [ ] 文件名全小写，属性必须是 9 个 key 之一
