// GitMon Mock 判定引擎（纯前端版，后端就绪后替换为 API 调用）
// 原则：同一仓库必得同一只精灵 —— 一切由 repo 字符串种子决定

// ---------- 种子随机 ----------
export function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 品种：元素属性（主语言） ----------
const ELEMENTS = [
  { key: 'water',   name: '水',   langs: ['Python'],          color: '#4a9eff', trait: '柔韧多变，数据与 AI 之灵' },
  { key: 'thunder', name: '雷',   langs: ['JavaScript', 'TypeScript'], color: '#f5c542', trait: '敏捷爆发，无处不在' },
  { key: 'steel',   name: '钢',   langs: ['Rust'],            color: '#9fb2c8', trait: '坚硬安全，极可靠' },
  { key: 'earth',   name: '地',   langs: ['Go'],              color: '#a67c52', trait: '朴实稳重，并发之力' },
  { key: 'rock',    name: '岩',   langs: ['Java', 'Kotlin'],  color: '#b08968', trait: '厚重耐久，企业级巨兽' },
  { key: 'fire',    name: '火',   langs: ['C', 'C++'],        color: '#ff6b4a', trait: '原始强大，难以掌控' },
  { key: 'wind',    name: '风',   langs: ['Swift', 'Dart'],   color: '#7fd4c1', trait: '轻快现代，移动之翼' },
  { key: 'grass',   name: '草',   langs: ['Ruby', 'PHP'],     color: '#7bc96f', trait: '优雅治愈，注重幸福感' },
  { key: 'normal',  name: '普通', langs: ['Shell', '其他'],    color: '#b8b8b8', trait: '平平无奇，潜力未知' },
]

// ---------- 品种：生态类型（项目类型） ----------
const SPECIES = [
  { key: 'beast',    name: '兽型',   type: 'Web 应用',   body: 'biped' },
  { key: 'bird',     name: '鸟型',   type: '工具/CLI',   body: 'winged' },
  { key: 'element',  name: '元素型', type: '库/框架',    body: 'slime' },
  { key: 'dragon',   name: '龙型',   type: 'AI/数据',    body: 'quadruped' },
  { key: 'flying',   name: '飞行型', type: '移动端',     body: 'winged' },
  { key: 'phantom',  name: '幻兽型', type: '游戏/图形',  body: 'golem' },
  { key: 'fairy',    name: '精灵型', type: '文档/博客',  body: 'spirit' },
]

// ---------- 品质 ----------
const QUALITIES = [
  { key: 'N',   name: '普通', min: 0,  color: '#9e9e9e', glow: 'rgba(158,158,158,.5)' },
  { key: 'R',   name: '稀有', min: 40, color: '#42a5f5', glow: 'rgba(66,165,245,.55)' },
  { key: 'SR',  name: '史诗', min: 60, color: '#ab47bc', glow: 'rgba(171,71,188,.6)' },
  { key: 'SSR', name: '传说', min: 80, color: '#ffb300', glow: 'rgba(255,179,0,.7)' },
]

// ---------- 技能词库 ----------
const SKILL_LIB = {
  water:   ['数据缠绕', '爬虫之网', '张量洪流', '梯度俯冲'],
  thunder: ['全栈突袭', 'npm 风暴', '热更新闪避', '异步电击'],
  steel:   ['所有权锁链', '零成本抽象', '编译期预判', '无畏并发'],
  earth:   ['协程之墙', '信道封锁', '地脉震荡', '简洁之力'],
  rock:    ['虚拟机碾压', '企业级壁垒', '泛型重击', '巨石阵'],
  fire:    ['指针烈焰', '内存灼烧', '内核爆裂', '汇编之怒'],
  wind:    ['滑翔突袭', 'Swift 之翼', '气流屏障', '轻装疾行'],
  grass:   ['优雅治愈', '块之缠绕', '幸福光环', '藤蔓束缚'],
  normal:  ['管道连击', '脚本冲锋', '万能胶水', '隐身守护'],
}

const STAT_NAMES = ['攻击', '防御', '速度', '特攻', '特防', 'HP']

// ---------- 主入口：解析 + 判定 ----------
export function parseRepoUrl(input) {
  const m = input.trim().match(/(?:github\.com|gitee\.com)[\/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/)
  if (!m) return null
  return {
    platform: input.includes('gitee.com') ? 'gitee' : 'github',
    owner: m[1],
    repo: m[2],
    fullName: `${m[1]}/${m[2]}`,
  }
}

export function hatch(input) {
  const info = parseRepoUrl(input)
  if (!info) return null

  const seed = hashSeed(`${info.platform}/${info.fullName}`)
  const rng = makeRng(seed)

  // 品种
  const element = ELEMENTS[Math.floor(rng() * ELEMENTS.length)]
  const species = SPECIES[Math.floor(rng() * SPECIES.length)]

  // 品质分（0-100）→ 品质
  const qualityScore = Math.floor(rng() * 100)
  const quality = [...QUALITIES].reverse().find(q => qualityScore >= q.min)

  // 工程量分（0-100）→ 初始等级（上限 Lv.999）
  const engineeringScore = Math.floor(rng() * 100)
  const level = 1 + Math.floor((engineeringScore / 100) * 998)
  const evolutionStage = level >= 500 ? 3 : level >= 150 ? 2 : 1

  // 六维（品质加成：SSR 上限更高）
  const boost = { N: 0.7, R: 0.85, SR: 1.0, SSR: 1.15 }[quality.key]
  const stats = STAT_NAMES.map((name, i) => {
    const base = 30 + Math.floor(rng() * 70)
    return { name, value: Math.min(100, Math.round(base * boost)) }
  })

  // 技能（2 个起步）
  const lib = SKILL_LIB[element.key]
  const skills = [...lib].sort(() => rng() - 0.5).slice(0, 2)

  // 立绘种子（独立派生，避免与判定耦合）
  const spriteSeed = hashSeed(seed + info.fullName)

  return {
    ...info,
    seed,
    spriteSeed,
    element,
    species,
    quality,
    qualityScore,
    engineeringScore,
    level,
    evolutionStage,
    stats,
    skills,
    hp: stats[5].value * 10,
  }
}
