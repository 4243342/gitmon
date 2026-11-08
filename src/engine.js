// 判定引擎（文档 §3 品种 / §4 品质 / §5 等级 / §6 六维与技能 / §6.3 根基 / §6.4 词条）
// 纯函数：RepoSnapshot → Pet。同一仓库同一快照必得同一只精灵（§2.2）

import {
  applyTraits,
  foundationOf,
  foundationTier,
  traitHints,
  traitSummary,
  traitsOf,
  xpMultiplier,
} from './traits.js'

// ---------- 种子 ----------
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

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))
// 对数归一化：防止巨型仓库碾压（文档 §5.1）
const logNorm = (v, cap) => (v <= 0 ? 0 : Math.min(1, Math.log10(1 + v) / Math.log10(1 + cap)) * 100)

// ---------- §3.1 元素属性 ----------
const LANG_ELEMENT = {
  Python: 'water',
  JavaScript: 'thunder', TypeScript: 'thunder', Vue: 'thunder', Svelte: 'thunder',
  Rust: 'steel',
  Go: 'earth',
  Java: 'rock', Kotlin: 'rock', Scala: 'rock',
  C: 'fire', 'C++': 'fire', 'C#': 'fire',
  Swift: 'wind', Dart: 'wind',
  Ruby: 'grass', PHP: 'grass',
  Shell: 'normal', Makefile: 'normal', Dockerfile: 'normal', HTML: 'normal', CSS: 'normal',
}

export const ELEMENTS = {
  water:   { key: 'water',   name: '水',  color: '#4a9eff', trait: '柔韧多变，数据与 AI 之灵' },
  thunder: { key: 'thunder', name: '雷',  color: '#f5c542', trait: '敏捷爆发，无处不在' },
  steel:   { key: 'steel',   name: '钢',  color: '#9fb2c8', trait: '坚硬安全，极可靠' },
  earth:   { key: 'earth',   name: '地',  color: '#a67c52', trait: '朴实稳重，并发之力' },
  rock:    { key: 'rock',    name: '岩',  color: '#b08968', trait: '厚重耐久，企业级巨兽' },
  fire:    { key: 'fire',    name: '火',  color: '#ff6b4a', trait: '原始强大，难以掌控' },
  wind:    { key: 'wind',    name: '风',  color: '#7fd4c1', trait: '轻快现代，移动之翼' },
  grass:   { key: 'grass',   name: '草',  color: '#7bc96f', trait: '优雅治愈，注重幸福感' },
  normal:  { key: 'normal',  name: '普通', color: '#b8b8b8', trait: '平平无奇，潜力未知' },
}

// ---------- §3.2 生态类型 ----------
export const SPECIES = {
  beast:   { key: 'beast',   name: '兽型',   type: 'Web 应用',  body: 'biped' },
  bird:    { key: 'bird',    name: '鸟型',   type: '工具/CLI',  body: 'winged' },
  element: { key: 'element', name: '元素型', type: '库/框架',   body: 'slime' },
  dragon:  { key: 'dragon',  name: '龙型',   type: 'AI/数据',   body: 'quadruped' },
  flying:  { key: 'flying',  name: '飞行型', type: '移动端',    body: 'winged' },
  phantom: { key: 'phantom', name: '幻兽型', type: '游戏/图形', body: 'golem' },
  fairy:   { key: 'fairy',   name: '精灵型', type: '文档/博客', body: 'spirit' },
}

// ---------- §4.2 品质 ----------
export const QUALITIES = {
  N:   { key: 'N',   name: '普通', color: '#9e9e9e', glow: 'rgba(158,158,158,.55)', min: 0 },
  R:   { key: 'R',   name: '稀有', color: '#42a5f5', glow: 'rgba(66,165,245,.6)',  min: 40 },
  SR:  { key: 'SR',  name: '史诗', color: '#ab47bc', glow: 'rgba(171,71,188,.65)', min: 60 },
  SSR: { key: 'SSR', name: '传说', color: '#ffb300', glow: 'rgba(255,179,0,.75)',  min: 80 },
}

const SKILLS = {
  water:   ['数据缠绕', '爬虫之网', '张量洪流', '梯度俯冲'],
  thunder: ['全栈突袭', 'npm 风暴', '热更新闪避', '异步电击'],
  steel:   ['所有权锁链', '零成本抽象', '编译期预判', '无畏并发'],
  earth:   ['协程之墙', '信道封锁', '地脉震荡', '简洁之力'],
  rock:    ['虚拟机碾压', '企业级壁垒', '泛型重击', '巨石阵'],
  fire:    ['指针烈焰', '内存灼烧', '内核爆裂', '汇编之怒'],
  wind:    ['滑翔突袭', '协议之翼', '气流屏障', '轻装疾行'],
  grass:   ['优雅治愈', '约定之力', '幸福光环', '藤蔓束缚'],
  normal:  ['管道连击', '脚本冲锋', '万能胶水', '隐身守护'],
}

const SKILL_UNLOCK = [1, 1, 150, 500] // 4 个槽位，等级门槛（§6.2）

// ---------- 品种判定 ----------
function detectElement(languages) {
  if (!languages.length) return { primary: ELEMENTS.normal, secondary: null }
  const top = languages[0]
  const key = LANG_ELEMENT[top.name] || 'normal'
  const primary = ELEMENTS[key]
  // 双属性：第二语言占比 > 30%（§3.1）
  const second = languages[1]
  if (second && second.pct > 30) {
    const secondKey = LANG_ELEMENT[second.name] || 'normal'
    if (secondKey !== key) return { primary, secondary: ELEMENTS[secondKey] }
  }
  return { primary, secondary: null }
}

function detectSpecies(snap) {
  const topics = snap.topics.map((t) => String(t).toLowerCase())
  const desc = (snap.description || '').toLowerCase()
  const files = snap.rootFiles.map((f) => String(f).toLowerCase())
  const langs = snap.languages.map((l) => l.name)

  const has = (arr, kw) => arr.some((x) => x.includes(kw))
  const text = `${topics.join(' ')} ${desc}`

  // 文档/博客：静态站点生成器或文档关键词
  if (has(files, 'mkdocs') || has(files, '_config.yml') || has(files, 'docusaurus') || has(files, 'docsify')) return SPECIES.fairy
  if (/documentation|blog|website|docs site/.test(text) && snap.sizeKb < 400) return SPECIES.fairy

  // AI/数据
  if (/(machine-learning|deep-learning|llm|pytorch|tensorflow|data-science|nlp|inference|模型|大模型)/.test(text)) return SPECIES.dragon
  if (langs.includes('Jupyter Notebook')) return SPECIES.dragon

  // 游戏/图形
  if (/(game|graphics|shader|renderer|game engine|unity|godot|游戏)/.test(text)) return SPECIES.phantom

  // 移动端
  if (/(android|ios|mobile|flutter|react-native|移动)/.test(text)) return SPECIES.flying
  if (has(files, 'android') || has(files, '.xcodeproj') || has(files, 'pubspec.yaml')) return SPECIES.flying

  // 工具/CLI
  if (/(cli|command-line|terminal|toolkit|工具)/.test(text)) return SPECIES.bird
  if (has(files, 'bin') || has(files, 'cmd')) return SPECIES.bird

  // Web 应用
  if (/(web|frontend|front-end|react|vue|next|nuxt|svelte|angular|webapp)/.test(text)) return SPECIES.beast
  if (files.includes('index.html') && langs.some((l) => ['JavaScript', 'TypeScript', 'Vue'].includes(l))) return SPECIES.beast

  // 默认：库/框架
  return SPECIES.element
}

// ---------- §4.1 品质评分（五维加权） ----------
export function scoreQuality(snap) {
  // 测试完备度 25%
  let tests = 0
  if (snap.hasTests) tests += 55
  if (snap.hasCI) tests += 25
  if (snap.hasLockfile) tests += 10
  if (snap.releaseCount >= 3) tests += 10

  // 工程质量 20%
  let engineering = 10
  if (snap.hasCI) engineering += 30
  if (snap.hasTypeConfig) engineering += 20
  if (snap.hasLockfile) engineering += 15
  if (snap.hasDocker) engineering += 10
  engineering += Math.min(15, snap.releaseCount * 3)

  // 文档完整度 20%
  let docs = 0
  if (snap.description && snap.description.length > 20) docs += 20
  if (snap.hasLicense || snap.license) docs += 25
  if (snap.hasDocs) docs += 20
  if (snap.hasChangelog) docs += 15
  if (snap.hasContributing) docs += 10
  if (snap.homepage) docs += 10

  // 维护健康度 20%
  let health = 0
  if (snap.daysSincePush < 7) health += 45
  else if (snap.daysSincePush < 30) health += 35
  else if (snap.daysSincePush < 180) health += 20
  else if (snap.daysSincePush < 365) health += 8
  health += Math.min(30, snap.releaseCount * 6)
  if (snap.openIssues < 20) health += 15
  else if (snap.openIssues < 100) health += 8
  if (snap.archived) health = 0

  // 社区认可 15%
  let community = 0
  community += logNorm(snap.stars, 20000) * 0.55
  community += logNorm(snap.forks, 5000) * 0.25
  community += logNorm(snap.contributors, 300) * 0.2

  const dims = [
    { key: 'tests', name: '测试完备度', weight: 25, value: clamp(Math.round(tests)) },
    { key: 'engineering', name: '工程质量', weight: 20, value: clamp(Math.round(engineering)) },
    { key: 'docs', name: '文档完整度', weight: 20, value: clamp(Math.round(docs)) },
    { key: 'health', name: '维护健康度', weight: 20, value: clamp(Math.round(health)) },
    { key: 'community', name: '社区认可', weight: 15, value: clamp(Math.round(community)) },
  ]

  const score = Math.round(dims.reduce((a, d) => a + (d.value * d.weight) / 100, 0))
  return { score, dims }
}

// ---------- §5.1 工程量 → 等级 ----------
export function scoreEngineering(snap) {
  const loc = snap.sizeKb
  const parts = [
    { key: 'loc', name: '代码规模', value: Math.round(logNorm(loc, 200000)), weight: 35, raw: `${loc} KB` },
    { key: 'commits', name: '提交总量', value: Math.round(logNorm(snap.commits, 20000)), weight: 30, raw: `${snap.commits} commits` },
    { key: 'files', name: '根目录条目', value: Math.round(logNorm(snap.rootFiles.length, 40)), weight: 10, raw: `${snap.rootFiles.length} 项` },
    { key: 'contributors', name: '贡献者', value: Math.round(logNorm(snap.contributors, 500)), weight: 15, raw: `${snap.contributors} 人` },
    { key: 'age', name: '活跃时长', value: Math.round(logNorm(snap.ageMonths, 120)), weight: 10, raw: `${Math.round(snap.ageMonths)} 个月` },
  ]
  const score = Math.round(parts.reduce((a, p) => a + (p.value * p.weight) / 100, 0))
  return { score, parts }
}

export function levelFromEngineering(score) {
  // 文档 §5.2：分数 → 初始等级（上限 Lv.999）
  return Math.max(1, Math.min(999, Math.round(1 + (score / 100) * 998)))
}

export function stageFromLevel(level, milestonesOk) {
  if (level >= 500 && milestonesOk) return 3
  if (level >= 150) return 2
  return 1
}

// 成长曲线（文档 §7.1）：next_exp = 100 × level^1.5
export function expForLevel(level) {
  return Math.round(100 * Math.pow(level, 1.5))
}

// ---------- 六维（§6.1） ----------
function buildStats(snap, qualityKey, rng) {
  const boost = { N: 0.72, R: 0.88, SR: 1.0, SSR: 1.12 }[qualityKey]
  const push = snap.daysSincePush
  const base = {
    攻击: 30 + logNorm(snap.commits, 8000) * 0.45 + rng() * 18,
    防御: (snap.hasTests ? 55 : 28) + (snap.hasCI ? 20 : 0) + rng() * 15,
    速度: clamp(100 - Math.min(100, push) * 0.7, 10, 100) * 0.7 + rng() * 20,
    特攻: 25 + logNorm(snap.languages.length * 400 + snap.sizeKb, 30000) * 0.45 + rng() * 15,
    特防: (snap.hasDocs ? 45 : 22) + (snap.license ? 15 : 0) + rng() * 22,
    HP: 30 + logNorm(snap.ageMonths, 120) * 0.4 + logNorm(snap.contributors, 200) * 0.3 + rng() * 15,
  }
  const GRADE = (v) => (v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : 'D')
  return Object.entries(base).map(([name, v]) => {
    const value = clamp(Math.round(v * boost), 5, 100)
    return { name, value, grade: GRADE(value) }
  })
}

// ---------- 技能（§6.2） ----------
function buildSkills(element, level, rng) {
  const pool = [...SKILLS[element.key]]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.map((name, i) => ({
    name,
    unlocked: level >= SKILL_UNLOCK[i],
    unlockLevel: SKILL_UNLOCK[i],
  }))
}

// ---------- 主判定 ----------
export function judge(snap) {
  const seed = hashSeed(`${snap.platform}/${snap.fullName}`)
  const rng = makeRng(seed)

  const { primary, secondary } = detectElement(snap.languages)
  const species = detectSpecies(snap)
  const quality = scoreQuality(snap)
  const engineering = scoreEngineering(snap)
  const qualityKey = quality.score >= 80 ? 'SSR' : quality.score >= 60 ? 'SR' : quality.score >= 40 ? 'R' : 'N'
  const level = levelFromEngineering(engineering.score)
  const milestones = (snap.releaseCount >= 1 ? 1 : 0) + (snap.contributors >= 5 ? 1 : 0) + (snap.stars >= 100 ? 1 : 0)
  const evolutionStage = stageFromLevel(level, milestones >= 2)
  const stats = buildStats(snap, qualityKey, rng)
  const skills = buildSkills(primary, level, rng)

  // §6.3 / §6.4：根基与性格词条（前端 mock；后端接入后以 API 为准）
  const aiRate = snap.aiRate ?? null
  const foundation = foundationOf(snap, aiRate)
  const petTraits = traitsOf(snap, { aiRate })
  const finalStats = applyTraits(stats, petTraits)

  return {
    ...snap,
    seed,
    spriteSeed: hashSeed(`${seed}:${primary.key}:${species.key}`),
    element: primary,
    elementSecondary: secondary,
    species,
    quality: QUALITIES[qualityKey],
    qualityKey,
    qualityScore: quality.score,
    qualityDims: quality.dims,
    engineeringScore: engineering.score,
    engineeringParts: engineering.parts,
    level,
    exp: expForLevel(level),
    evolutionStage,
    milestones,
    stats: finalStats,
    skills,
    foundation: foundation.score,
    foundationDims: foundation.dims,
    foundationTier: foundationTier(foundation.score),
    traits: petTraits,
    traitSummary: traitSummary(petTraits),
    traitHints: traitHints(petTraits),
    xpMultiplier: xpMultiplier(petTraits),
    expToNext: Math.round(expForLevel(level) * xpMultiplier(petTraits)),
    maxHp: finalStats.find((s) => s.name === 'HP').value * 10,
    status: snap.daysSincePush > 30 ? 'sleeping' : 'active',
    bond: 0,
    createdAt: Date.now(),
    syncedAt: Date.now(),
  }
}
