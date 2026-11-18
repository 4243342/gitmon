// 生成 docs/ART-PROMPTS.md：按「种族 × 属性」列出可直接复制的立绘提示词
// 用法：node scripts/art-prompts.mjs [pixel|paint]
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const STYLE_KEY = process.argv[2] === 'paint' ? 'paint' : 'pixel'

const STYLE = {
  pixel:
    'pixel art sprite, 96x96 grid upscaled, hard pixel edges no anti-aliasing, bold dark outline, flat cel shading, light from upper left',
  paint:
    'polished anime creature illustration, clean thick dark outline, flat shading plus one shadow layer, rim light from upper left',
}

const FRAME =
  'front 3/4 view, full body, centered, fills 80% of frame, feet 8% above bottom, transparent background, no ground, no shadow, no text'

const NEG = 'extra limbs, duplicated eyes, cropped body, busy background, text, signature, blurry, jpeg artifacts'

// ---------------------------------------------------------------- 属性
const ELEMENTS = [
  { key: 'water', zh: '水', color: '#4a9eff', lang: 'Python',
    phrase: 'aqua blue palette (#4a9eff), flowing water crests, droplet highlights and soft scale texture' },
  { key: 'thunder', zh: '雷', color: '#f5c542', lang: 'JS / TS / Vue',
    phrase: 'electric yellow palette (#f5c542), lightning-bolt markings, crackling sparks at the tips' },
  { key: 'steel', zh: '钢', color: '#9fb2c8', lang: 'Rust',
    phrase: 'cool silver-grey palette (#9fb2c8), brushed metal plates with rivets, sharp polished edges' },
  { key: 'earth', zh: '地', color: '#a67c52', lang: 'Go',
    phrase: 'warm earth-brown palette (#a67c52), layered rock strata bands and soil cracks' },
  { key: 'rock', zh: '岩', color: '#b08968', lang: 'Java / Kotlin',
    phrase: 'sandstone palette (#b08968), crystal shards jutting out, mineral speckles and rough stone chunks' },
  { key: 'fire', zh: '火', color: '#ff6b4a', lang: 'C / C++ / C#',
    phrase: 'lava orange-red palette (#ff6b4a), flame tufts and glowing embers, faint heat haze' },
  { key: 'wind', zh: '风', color: '#7fd4c1', lang: 'Swift / Dart',
    phrase: 'mint teal palette (#7fd4c1), swirling air currents, feather-like fringe and motion trails' },
  { key: 'grass', zh: '草', color: '#7bc96f', lang: 'Ruby / PHP',
    phrase: 'leaf green palette (#7bc96f), curling vines and sprouting leaves, small petals' },
  { key: 'normal', zh: '普通', color: '#b8b8b8', lang: 'Shell / HTML / CSS',
    phrase: 'neutral light-grey palette (#b8b8b8), plain simple geometric markings, minimal detail' },
]

const STAGE_META = [
  { s: 1, min: 1, name: '幼体' },
  { s: 2, min: 10, name: '初生体' },
  { s: 3, min: 50, name: '成长体' },
  { s: 4, min: 100, name: '成熟体' },
  { s: 5, min: 200, name: '强化体' },
  { s: 6, min: 300, name: '完全体' },
  { s: 7, min: 500, name: '人形态' },
  { s: 8, min: 800, name: '人形态·觉醒' },
  { s: 9, min: 999, name: '人形态·神话' },
]

// ---------------------------------------------------------------- 种族
// adult：通用图（.png），代表成体兽形，Lv.1–499 没有阶段图时的兜底
// beastForm：s1–s6 兽形阶段（英文，补阶段图时替换主体描述）
// zh：9 阶中文形态描述（顺序对应 STAGE_META）
// human：人形态 s7 / s8 / s9
const SPECIES = [
  {
    key: 'element', zh: '元素型', order: 1, hot: true, hotEls: ['water', 'steel', 'earth', 'rock', 'fire', 'normal'],
    repo: '库 / 框架 —— 所有没命中其它种族的仓库都归这里（内置对手里最多）',
    memo: '没有固定骨架的团块 / 流体 / 晶体，靠属性色与纹样区分，两只发光眼是唯一恒定特征',
    adult:
      'an abstract elemental spirit in a soft rounded blob body, no limbs, two glowing eyes, weightless floating pose with small orbiting fragments',
    beastForm: [
      'a palm-sized droplet of living matter, almost spherical, single big eye, two tiny orbs circling it',
      'a slightly taller blob, a head-lump separating from the body, three orbiting fragments',
      'a teardrop body with two curling swirl arms, a floating core visible inside',
      'a compact swirl body, a ring of fragments orbiting it, eyes narrowed with intent',
      'a dense compressed core wrapped in thick swirling shells of energy, fragments sharpened',
      'a towering elemental pillar of swirling matter, multiple energy rings, radiant core, shards orbiting',
    ],
    human: [
      'a humanoid elemental, translucent flowing body shaped like a slim person, swirling matter forming a hooded robe silhouette, two glowing eyes on a blank face, small fragments orbiting the shoulders',
      'the same elemental humanoid wearing shells of hardened matter as armour, a floating mantle of shards behind the shoulders, glowing rune bands circling the waist, brighter core light',
      'a mythic elemental humanoid, body half light half solid, crown of floating crystal fragments, ribbon-like streams of energy trailing from the arms, halo of tiny shards',
    ],
    forms: [
      '掌心大的液滴团，一只大眼，两颗碎屑绕着转',
      '长高一截，头部隆起分出，碎屑变三颗',
      '水滴身伸出两条涡状手臂，体内浮着发光核心',
      '紧凑涡旋体，碎片连成环，眼神有了意志',
      '密实核心外裹厚重能量壳，碎片变锋利',
      '高耸的元素柱，多重能量环，核心全亮',
      '半透明流体人形，流动物质构成兜帽长袍轮廓，肩侧浮碎屑',
      '物质硬化成甲，背后碎屑披风，腰间符文光带',
      '半光半实体，浮空晶冠，手臂拖出长光带',
    ],
  },
  {
    key: 'bird', zh: '鸟型', order: 2, hot: true, hotEls: ['thunder', 'steel', 'earth', 'rock', 'grass', 'normal'],
    repo: '工具 / CLI —— bin、cmd 目录，或命中 cli / terminal / toolkit 关键词',
    memo: '尖喙、后掠羽冠、折叠翅膀，腿细如枝，机敏狡黠，站姿前倾',
    adult:
      'a small bird creature with a pointed beak, a swept-back feather crest, folded wings at its sides and thin twig-like legs, alert forward-leaning stance',
    beastForm: [
      'a just-hatched chick, round fluffy down ball, oversized head, stubby useless wings, tiny beak',
      'a fledgling with downy fluff, first real feathers on the wingtips, short tail nub',
      'a lean young bird, crest starting to sweep back, tail feathers grown out, one wing half open',
      'a sleek adult bird, full crest, layered wing feathers, sharpened beak',
      'a sharp-taloned bird with metal-sheen feather edges, crest tipped with energy glow, wings half spread',
      'a proud apex bird, long trailing tail feathers, wide crest, glowing eye rings, wings spread in a display pose',
    ],
    human: [
      'a humanoid bird-person, slender upright body, digitigrade bird legs with talons, feathered forearms, beak-like nose, swept-back crest of feathers, simple wrapped cloth',
      'the same bird-person wearing lightweight plated armour with feather-cut pauldrons, a short feathered mantle, glowing talon guards, one wing folded behind',
      'a mythic bird-person, long ceremonial plumage train, crown of feather blades, translucent glowing wing silhouettes behind the back, floating feather motes',
    ],
    forms: [
      '刚破壳的雏鸟，圆绒毛球，头大翅废，小尖喙',
      '亚成鸟，翅尖长出真羽，尾羽鼓包',
      '精瘦幼鸟，羽冠开始后掠，尾羽展开，一翅半张',
      '顺滑成鸟，完整羽冠，层叠飞羽，喙锋利',
      '羽缘带金属光，冠尖发光，利爪，双翅半展',
      '长尾羽、宽冠、发光眼环，展翅示威',
      '细长直立的鸟人，鸟腿利爪，小臂覆羽，喙状鼻，后掠羽冠',
      '轻甲 + 羽形肩甲，短羽披风，爪甲发光',
      '长礼羽拖尾，羽刃冠，背后透光翼影，飘羽',
    ],
  },
  {
    key: 'beast', zh: '兽型', order: 3, hot: true, hotEls: ['water', 'thunder', 'rock', 'grass'],
    repo: 'Web 应用 / 前端框架 —— index.html + JS/TS，或 react / vue / next 等关键词',
    memo: '圆头大眼、竖耳、小爪、蓬松尾巴，四肢着地或半直立，亲和活泼',
    adult:
      'a chubby quadruped beast with a round head, huge glossy eyes, upright pointed ears, small paws and a fluffy tail',
    beastForm: [
      'a newborn cub, head as big as the whole body, stubby limbs, sitting on its haunches',
      'a baby beast at one-to-one head-to-body ratio, tiny claws forming, ear tips just rising',
      'a young beast standing on four legs, tail grown out, cheek tufts appearing',
      'an adult-proportioned beast, lean body, first markings across the back and shoulders',
      'a powerful beast with muscular shoulders, plate-like fur ridges on the forelegs, glowing tail tip',
      'a fully grown apex beast with a thick mane, ridge spikes along the spine, wide confident stance and an energy aura',
    ],
    human: [
      'a humanoid beast-person standing upright, digitigrade legs, muscular build, keeping the beast muzzle, pointed ears and fluffy tail, simple cloth wrap around the waist',
      'the same beast-person in light battle armour with layered pauldrons and a short cape, glowing marks on the armour plates, standing in a ready stance',
      'a mythic beast-person in ornate regalia, crown of curved horns, translucent glowing wings of light behind the shoulders, rune halo, long fur mantle',
    ],
    forms: [
      '新生幼崽，头身等大，四肢短粗，坐姿',
      '头身比约 1:1，爪尖成形，耳尖刚立起',
      '四足站立的幼兽，尾巴长出，颊毛出现',
      '成体比例，背肩出现第一道花纹',
      '肩背肌肉隆起，前肢覆甲片，尾尖发光',
      '鬃毛浓密，脊背棘刺，站姿舒展，气场外溢',
      '直立的兽人，反曲腿，保留兽吻、尖耳与蓬松尾巴',
      '轻战甲 + 层叠肩甲 + 短披风，甲面符纹发光',
      '华服加身，弯角冠，背后光翼，符文环，长毛披肩',
    ],
  },
  {
    key: 'dragon', zh: '龙型', order: 4, hot: true, hotEls: ['water'],
    repo: 'AI / 数据 —— machine-learning / llm / pytorch 等关键词，或语言含 Jupyter Notebook',
    memo: '长颈、背棘、粗尾、角冠，体型最大最重，威压感与稀有感',
    adult:
      'a slender serpentine dragon with a long neck, ridge spines down the back, a horned head and a thick tapering tail, standing on four clawed legs',
    beastForm: [
      'a hatchling dragon, oversized head, tiny folded wings, short curled tail, sitting in an eggshell remnant',
      'a small dragon with a longer neck, first back spines as soft nubs, tail curling around its feet',
      'a young dragon on four legs, spine ridge forming, horns budding, wings half unfolded',
      'a lean adult dragon, full horn set, defined spine spines, long tail ending in a fin',
      'a heavy-shouldered dragon with dense armour scales, larger horns, energy glowing between the plates',
      'a towering apex dragon, wide wingspan folded high, crown of horns, thick tail, radiating aura and floating debris',
    ],
    human: [
      'a humanoid dragon-person, tall and slim, scale plating on the forearms and shins, curved horns, long dragon tail behind, slit-pupil eyes, plain dark robe',
      'the same dragon-person in scaled battle armour, a wing-like mantle of membrane behind the shoulders, glowing rune lines across the plates, clawed gauntlets',
      'a mythic dragon-person, imperial robe with scale trim, crown of long horns, huge translucent glowing wings of light, floating rune ring, ember motes in the air',
    ],
    forms: [
      '刚破壳的幼龙，头大，翼折叠，短卷尾',
      '长颈初显，背棘成软突起，尾巴绕着脚',
      '四足幼龙，脊棘成形，角萌出，双翅半展',
      '精瘦成体龙，完整角冠，长尾带鳍',
      '厚肩密鳞，大角，鳞缝间漏光',
      '巨大双翼高折，角冠，粗尾，气场与浮石',
      '高瘦龙人，小臂小腿覆鳞，弯角，长尾，竖瞳',
      '鳞甲战装，背后膜翼披风，甲面符文发光',
      '鳞纹礼袍，长角冠，巨大透光翼，浮符文环',
    ],
  },
  {
    key: 'flying', zh: '飞行型', order: 5, hot: false, hotEls: ['wind'],
    repo: '移动端 —— android / ios / flutter / react-native，或 pubspec.yaml 等',
    memo: '宽膜翼、流线身体、长尾鳍，永远悬浮不落地，轻盈现代',
    adult:
      'a sleek flying creature with wide membrane wings, a streamlined body, a long tail fin, hovering with no feet touching the ground',
    beastForm: [
      'a tiny floating larva-like creature, two tiny wing buds, drifting in the air',
      'a small flyer with short translucent wings, thin tail fin, hovering low',
      'a streamlined juvenile flyer, wings half spread, tail fin splitting into two',
      'a smooth adult flyer, wide wings with clean outlines, aerodynamic head crest',
      'a reinforced flyer with blade-like wing edges, layered membrane plates, glowing vents along the back',
      'a majestic flyer with a huge wingspan, multiple trailing fin ribbons, radiant wing edges, hovering high',
    ],
    human: [
      'a humanoid winged person, slim aerodynamic build, large membrane wings folded behind, streamlined head crest, tight flight suit, floating slightly above the ground',
      'the same winged person in light flight armour with fin-shaped pauldrons, glowing wing veins, thrusters of light at the ankles, one wing raised',
      'a mythic winged person, long floating sash ribbons, crown of fin-blades, enormous translucent glowing wings fully spread, air currents spiralling around',
    ],
    forms: [
      '悬浮的幼虫，两片翅芽，飘在半空',
      '半透明短翅，细尾鳍，低空悬停',
      '流线幼体，双翅半张，尾鳍开始分叉',
      '光滑成体，宽翅轮廓干净，头冠流线',
      '翅缘成刃，膜片分层，背侧有发光喷口',
      '巨型翼展，多条飘带鳍，翼缘发光，高悬',
      '纤瘦流线体型的翼人，背后收拢膜翼，头冠，紧身飞行服，悬空',
      '轻飞行甲 + 鳍形肩甲，翼脉发光，踝部光推进',
      '长飘带，鳍刃冠，巨大透光翼全展，气流环绕',
    ],
  },
  {
    key: 'phantom', zh: '幻兽型', order: 6, hot: false, hotEls: ['thunder'],
    repo: '游戏 / 图形 —— game / graphics / shader / renderer / unity / godot',
    memo: '面具当脸 + 身体中空 + 漂浮碎块，腿不存在，脚下一缕消散，神秘非实体',
    adult:
      'a mysterious phantom with a carved mask for a face, a hollow floating body with detached fragments hovering around it, glowing runes on the mask, no legs, drifting',
    beastForm: [
      'a small floating mask with a wisp of smoke for a body, one glowing eye slit',
      'a mask with a small hollow body forming under it, two floating fragments',
      'a hooded phantom with a mask, three fragments orbiting, arms forming from smoke',
      'a stable phantom body with a horned mask, hanging chains of light, runes glowing brighter',
      'a large phantom with layered shell plates around a hollow core, many orbiting shards, mask cracked with light',
      'a towering phantom, multiple masks stacked into a crown, dense orbiting debris ring, body half dissolving into particles',
    ],
    human: [
      'a humanoid phantom, hooded and masked, hollow body with the silhouette of a person, floating fragments at the shoulders, glowing runes on the robe hem, no feet just a fading trail',
      'the same phantom humanoid in layered dark armour with rune-etched plates, a floating mantle of shards, the mask split to reveal light underneath',
      'a mythic phantom humanoid, ornate horned mask, long robe dissolving into particles, many orbiting mask fragments, halo of glowing runes',
    ],
    forms: [
      '小面具 + 一缕烟状身体，一道发光眼缝',
      '面具下方凝出空心身体，两块碎片漂着',
      '兜帽幻影，三块碎片环绕，烟臂成形',
      '稳定身躯 + 角面具，垂挂光链，符文变亮',
      '层叠外壳包着空核，大量碎片成环，面具裂出光',
      '高耸幻影，多张面具叠成冠，密碎屑环，身体半消散',
      '兜帽面具的人形幻影，身体中空，肩侧浮碎屑，袍摆符文，足部消散',
      '深色层甲 + 符文板，碎屑披风，面具裂开露出光',
      '华丽角面具，长袍化作粒子，多张面具碎片环绕，符文光环',
    ],
  },
  {
    key: 'fairy', zh: '精灵型', order: 7, hot: false, hotEls: ['normal'],
    repo: '文档 / 博客 —— mkdocs / docusaurus / docsify / _config.yml，且仓库很小',
    memo: '小体型、大眼、半透明身体、光点环绕，温柔治愈',
    adult:
      'a tiny fairy spirit with a round translucent body, big gentle eyes, small translucent wings and orbiting light motes, hovering',
    beastForm: [
      'a mote-sized fairy, a glowing seed with one big eye and a faint aura, two light dots circling',
      'a small fairy with stubby translucent wings, body slowly solidifying, three light motes',
      'a slim young fairy, clear wings, floating petals around it, small ribbon-like scarf',
      'a graceful adult fairy, layered translucent wings, glowing hair-like tendrils, ring of motes',
      'a radiant fairy with a bright inner core, double wing pairs, trailing light ribbons',
      'a fully awakened fairy, wide glowing wings, halo of light, drifting petals and sparkles',
    ],
    human: [
      'a humanoid fairy, small and slender, pointed ears, translucent glowing wings, floating a little off the ground, simple layered dress, light motes orbiting',
      'the same fairy in a light ceremonial dress with leaf-shaped ornaments, brighter wings with glowing veins, a circlet of light, petals drifting',
      'a mythic fairy, long flowing dress of light, crown of blooming flowers, huge translucent wings, dense halo of motes and petals',
    ],
    forms: [
      '米粒大的光种，一只大眼，两点光围绕',
      '小精灵，半透明短翅，身体渐实，三点光',
      '纤瘦幼体，透明翅，花瓣环绕，小飘带',
      '优雅成体，层叠透翅，发丝发光，光点成环',
      '内核心全亮，双对翅，拖出长光带',
      '完全觉醒，宽光翼，光环，飘花与闪光',
      '小巧纤细的妖精人形，尖耳，透光翅，悬空，层叠短裙',
      '礼仪轻裙 + 叶形饰，翅脉更亮，额前光冠',
      '长光裙，花冠，巨大透光翼，密集光点与花瓣',
    ],
  },
]

const styleTail = STYLE[STYLE_KEY]
const cell = (body, el) => `${body}, ${el.phrase}, ${styleTail}, ${FRAME}`

let out = []
const push = (s = '') => out.push(s)

push('# 立绘提示词总表（直接复制）')
push('')
push(`> 自动生成 · 风格 = **${STYLE_KEY === 'paint' ? '厚涂卡通风' : '像素风'}**。换风格重跑：\`node scripts/art-prompts.mjs paint\` / \`... pixel\`。`)
push('> 规格与文件命名见 [`ASSETS.md`](ASSETS.md)，进化阶梯见 [`../README.md`](../README.md#进化系统)。')
push('')

push('## 一、要生成什么')
push('')
push('每只精灵 = **种族 × 属性 × 等级形态**。7 种族 × 9 属性 = **63 个格子**，每格按进化阶段最多 9 张图。')
push('')
push('| 方案 | 每格几张 | 总张数 | 说明 |')
push('| --- | --- | --- | --- |')
push('| 最小可用 | 1 张（通用图） | **63** | Lv.1–499 共用，跑通全流程够用 |')
push('| **推荐** | 4 张（通用 + 人形态 ×3） | **252** | 兽形靠通用图，Lv.500 以上有三档人形 |')
push('| 完整 | 10 张（通用 + s2–s9） | 630 | 每级都不同，分量很大，不建议起手就做 |')
push('')
push('**开工顺序**（按内置对手命中率）：`元素型(13) → 鸟型(9) → 兽型(6) → 龙型(2) → 飞行型 → 幻兽型 → 精灵型`。')
push('')
push('内置对手已经用到的 20 格标了 **●**，其余格子先留空会自动回落像素精灵，所以可以一格一格补。')
push('')

push('## 二、统一规格（每条提示词已自带，这里备查）')
push('')
push('| 项 | 值 |')
push('| --- | --- |')
push('| 画布 | 512×512（768 / 1024 也行，自动等比缩） |')
push('| 背景 | 全透明，无地面无投影 |')
push('| 构图 | 正面偏 3/4，全身，主体占 80%，脚底离画布底 8% |')
push('| 描边 | 统一深色描边（像素风 4px / 厚涂 6px） |')
push('| 光影 | 单侧光，统一左上 |')
push('| 存放 | `src/assets/species/<种族>/<属性>.png`，阶段图加 `-s7` `-s8` `-s9` |')
push('')
push('**负面词**（工具支持负面提示词时填这段）：')
push('')
push('```')
push(NEG)
push('```')
push('')
push('> 属性只改配色与纹样，**不改外形**。同一格子的 4 张（通用 / s7 / s8 / s9）必须一眼看出是同一只生物。')
push('')

push('## 三、九阶形态（所有种族共用这条曲线）')
push('')
push('| 阶段 | 起始等级 | 形态名 | 体型怎么变 | 文件后缀 |')
push('| --- | --- | --- | --- | --- |')
const formNote = [
  '头大身小，幼崽比例，标志器官刚冒头',
  '长大一号，头身比约 1:1',
  '四肢 / 翅膀成形，标志性特征出现',
  '成体比例，开始有花纹与装甲',
  '肌肉与外壳强化，肩背多加结构',
  '兽形最终阶，体态舒展、气场外溢',
  '**直立人形**，保留种族头冠 / 耳 / 尾 / 翼',
  '人形 + 战装、披风、悬浮部件、光环',
  '人形终形，神话感、光翼、符文环',
]
STAGE_META.forEach((m, i) => {
  push(`| ${m.s} | ${m.min} | ${m.name} | ${formNote[i]} | ${m.s === 1 ? '`.png`' : `\`-s${m.s}\``} |`)
})
push('')
push('阶段只由等级推导，**Lv.500 起一律人形态**；500 以下是自由形态，长相由「种族 × 属性」组合决定，不逐级固定。')
push('')


push('## 四、中文版提示词（工具只吃中文时用）')
push('')
push('拼接公式：**种族句 + 属性句 + 画风句**，一段话丢进去就行，不用照抄英文。')
push('')
push('**画风句**（固定不变）：')
push('')
push('```')
push('像素风游戏立绘，96×96 网格放大，硬边无抗锯齿，深色粗描边，平涂加一层阴影，左上方单侧光；正面偏 3/4 视角，全身，主体占画面 80%，居中，脚底离画布底 8%，纯透明背景，不要地面和投影，不要文字')
push('```')
push('')
push('**种族句**（选一个）：')
push('')
push('| 种族 | 中文描述 |')
push('| --- | --- |')
push('| 元素型 | 一只没有固定骨架的元素精灵，柔软圆润的团块身体，没有四肢，两只发光眼睛，漂浮姿态，周围绕着小碎块 |')
push('| 鸟型 | 一只小鸟形生物，尖喙，后掠羽冠，身体两侧收着翅膀，细枝一样的腿，机敏前倾站姿 |')
push('| 兽型 | 一只圆头四足小兽，巨大的水亮眼睛，竖立的尖耳，小爪子，蓬松尾巴，圆胖可爱 |')
push('| 龙型 | 一条身形修长的龙，长颈，背脊棘刺，带角的头，粗壮渐细的长尾，四足利爪 |')
push('| 飞行型 | 一只流线型飞行生物，宽大的膜翼，身体线条流畅，长尾鳍，悬浮在空中不落地 |')
push('| 幻兽型 | 一只神秘幻兽，脸上是一张雕纹面具，身体中空且漂浮，周围有分离的碎块，面具上有发光符文，没有腿 |')
push('| 精灵型 | 一只很小的精灵，圆润半透明的身体，温柔的大眼睛，小半透明翅膀，周围有光点环绕 |')
push('')
push('**属性句**（选一个，接在种族句后面）：')
push('')
push('| 属性 | 中文描述 |')
push('| --- | --- |')
push('| 水 | 水蓝配色（#4a9eff），流动水纹，水珠高光，柔软鳞片质感 |')
push('| 雷 | 电黄配色（#f5c542），闪电状纹路，尖端有噼啪火花 |')
push('| 钢 | 银灰配色（#9fb2c8），磨砂金属板与铆钉，边缘锋利泛光 |')
push('| 地 | 大地棕配色（#a67c52），层叠岩层带与土壤裂纹 |')
push('| 岩 | 砂岩配色（#b08968），背部长出水晶碎块，矿物斑点与粗糙石块 |')
push('| 火 | 熔岩橙红配色（#ff6b4a），火焰簇与余烬，轻微热浪 |')
push('| 风 | 薄荷青配色（#7fd4c1），盘旋气流，羽状流苏，运动残影 |')
push('| 草 | 叶绿配色（#7bc96f），卷曲藤蔓与新芽，小花瓣 |')
push('| 普通 | 浅灰配色（#b8b8b8），简单几何纹样，细节最少 |')
push('')
push('**阶段句**（可选，想区分等级时接在最后）：')
push('')
push('| 阶段 | 中文补充 |')
push('| --- | --- |')
push('| 幼体 Lv.1 | 幼崽比例，头几乎和身体一样大，四肢短粗 |')
push('| 初生体 Lv.10 | 长大了些，头身比约 1:1 |')
push('| 成长体 Lv.50 | 四肢或翅膀成形，标志性特征长出来 |')
push('| 成熟体 Lv.100 | 成体比例，开始出现花纹和装甲 |')
push('| 强化体 Lv.200 | 肌肉和外壳强化，肩背多出结构 |')
push('| 完全体 Lv.300 | 兽形最终形态，体态舒展，气场外溢 |')
push('| 人形态 Lv.500 | 直立人形身体，保留种族的头冠、耳朵、尾巴或翅膀 |')
push('| 觉醒 Lv.800 | 人形外加战装、披风、悬浮部件和光环 |')
push('| 神话 Lv.999 | 神话感的人形终形，光翼、符文环、华丽装束 |')
push('')
push('> 英文提示词在下面第四节，效果一般更稳（多数模型对英文理解更好）；中文版适合只吃中文的工具。')
push('')

push('## 五、逐种族提示词')
push('')
push('每种族两块：**9 阶形态表**（决定画什么）+ **逐属性提示词**（决定配色）。每个提示词块固定 4 行，**依次是 通用 / -s7 人形态 / -s8 觉醒 / -s9 神话**，一行一条，整行复制即可。')
push('')

for (const sp of SPECIES) {
  push('---')
  push('')
  push(`### ${sp.order}. ${sp.zh} \`${sp.key}\``)
  push('')
  push(`- **对应仓库**：${sp.repo}`)
  push(`- **体型记忆点**：${sp.memo}`)
  push('')
  push(`#### ${sp.zh} · 9 阶形态`)
  push('')
  push('| 阶段 | Lv | 形态 | 画成什么样 |')
  push('| --- | --- | --- | --- |')
  STAGE_META.forEach((m, i) => {
    push(`| ${m.s} | ${m.min} | ${m.name} | ${sp.forms[i]} |`)
  })
  push('')
  push(`<details><summary>要补 s1–s6 阶段图？展开拿英文替换句</summary>`)
  push('')
  push('把下面这句替换掉通用提示词里的主体描述，文件名加对应后缀：')
  push('')
  push('```')
  sp.beastForm.forEach((b, i) => push(`-s${i + 1}  ${b}`))
  push('```')
  push('')
  push('</details>')
  push('')

  for (const el of ELEMENTS) {
    const mark = sp.hotEls.includes(el.key) ? ' ●' : ''
    push(`#### ${sp.zh} · ${el.zh}${mark}`)
    push('')
    push(`主色 ${el.color} · ${el.lang} · 依次存为 \`${el.key}.png\` / \`${el.key}-s7.png\` / \`${el.key}-s8.png\` / \`${el.key}-s9.png\``)
    push('')
    push('```')
    push(cell(sp.adult, el))
    push(cell(sp.human[0], el))
    push(cell(sp.human[1], el))
    push(cell(sp.human[2], el))
    push('```')
    push('')
  }
}

push('---')
push('')
push('## 六、生成完怎么验')
push('')
push('```bash')
push('# 1. 按文件名丢进 src/assets/species/<种族>/')
push('# 2. 看还缺哪些格子（打印 7×9 覆盖矩阵）')
push('npm run art:check')
push('# 3. 刷新页面即可，dev server 热更新')
push('```')
push('')
push('自查：')
push('')
push('- [ ] 背景真的透明（不是白底）')
push('- [ ] 脚底位置一致，主体没偏小')
push('- [ ] 描边粗细和其它图一致')
push('- [ ] 同一格 4 张（通用 / s7 / s8 / s9）看得出是同一只')
push('- [ ] 文件名全小写，属性必须是 9 个 key 之一')
push('')

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'docs', 'ART-PROMPTS.md')
writeFileSync(target, out.join('\n'), 'utf8')
console.log(`wrote ${target}`)
console.log(`prompts: ${SPECIES.length * ELEMENTS.length * 4}, lines: ${out.length}`)
