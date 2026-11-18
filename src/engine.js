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
import { stageFromLevel } from './evolution.js'

export { EVOLUTION, MAX_STAGE, stageFromLevel, stageInfo, stageName, isHumanoid, nextStage, stageProgress } from './evolution.js'

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

export function stageFromLevelLegacy(level, milestonesOk) {
  // 兼容旧调用：现在阶段只由等级决定（见 evolution.js）
  return stageFromLevel(level)
}

// 成长曲线（文档 §7.1）：next_exp = 100 × level^1.5
export function expForLevel(level) {
  return Math.round(100 * Math.pow(level, 1.5))
}

// ---------- 六维 / 战力系统（§6.1） ----------
// 采用业界最通用的「正常战力系统」：种族值(base stats) + 个体值(IV, 0–31) + 等级成长，
// 数值公式沿用 Pokémon 第三代（无努力值）标准。这样等级、品质、个体都会实打实地改变数值，
// 而不是一堆互不相关的随机量。
export const STAT_ORDER = ['攻击', '防御', '速度', '特攻', '特防', 'HP']

// 种族值：每个生态类型一套六维，数值落在完全进化宝可梦的常见区间（总和 439–525）
export const BASE_STATS = {
  beast:   { 攻击: 85, 防御: 75, 速度: 72, 特攻: 80, 特防: 78, HP: 80 }, // 均衡偏物攻
  bird:    { 攻击: 82, 防御: 55, 速度: 110, 特攻: 70, 特防: 62, HP: 60 }, // 高速脆皮
  element: { 攻击: 70, 防御: 90, 速度: 60, 特攻: 75, 特防: 88, HP: 95 }, // 肉盾均衡
  dragon:  { 攻击: 95, 防御: 85, 速度: 70, 特攻: 105, 特防: 80, HP: 90 }, // 强力特攻
  flying:  { 攻击: 78, 防御: 68, 速度: 105, 特攻: 78, 特防: 72, HP: 70 }, // 高速均衡
  phantom: { 攻击: 80, 防御: 115, 速度: 55, 特攻: 70, 特防: 95, HP: 100 }, // 防御墙
  fairy:   { 攻击: 55, 防御: 75, 速度: 80, 特攻: 100, 特防: 105, HP: 85 }, // 特攻辅助
}

// 属性微调：在种族值上轻推个别维度，给元素一点性格，但不喧宾夺主（±4~10）
export const ELEMENT_BIAS = {
  water:   { HP: 8, 特防: 4, 攻击: -4 },
  thunder: { 速度: 8, 特攻: 4, 防御: -4 },
  steel:   { 防御: 8, 特防: 4, 特攻: -4 },
  earth:   { 防御: 6, HP: 4, 速度: -4 },
  rock:    { 防御: 10, 特防: 4, 速度: -6 },
  fire:    { 攻击: 8, 特攻: 4, 特防: -4 },
  wind:    { 速度: 8, 特防: 4, 攻击: -4 },
  grass:   { HP: 6, 特防: 4, 攻击: -4 },
  normal:  {},
}

const IV_MAX = 31
const IV_FLOOR = { N: 0, R: 8, SR: 16, SSR: 24 } // 品质决定个体值下限，稀有度才有意义
const MAX_BASE = 130 // UI 归一化的理论上限（含属性微调后的最大值）

export function baseFor(speciesKey, elementKey) {
  const b = { ...(BASE_STATS[speciesKey] || BASE_STATS.element) }
  const bias = ELEMENT_BIAS[elementKey] || {}
  for (const k of STAT_ORDER) b[k] = (b[k] || 0) + (bias[k] || 0)
  return b
}

// 个体值：同种子必得同一组（0..31），品质抬高低限
export function rollIVs(seed, qualityKey = 'N') {
  const rng = makeRng((seed >>> 0) ^ 0x9e3779b9)
  const floorVal = IV_FLOOR[qualityKey] ?? 0
  return STAT_ORDER.map(() => Math.min(IV_MAX, Math.floor(rng() * (IV_MAX + 1 - floorVal)) + floorVal))
}

// 某等级下单个维度能到达的理论上限（用于评级与 UI 归一化）
export function statCapAtLevel(level, isHP = false) {
  const lv = Math.max(1, Math.min(999, Number(level) || 1))
  return isHP
    ? Math.floor((2 * MAX_BASE + IV_MAX) * lv / 100) + lv + 10
    : Math.floor((2 * MAX_BASE + IV_MAX) * lv / 100) + 5
}

function gradeOfRatio(ratio) {
  if (ratio >= 0.9) return 'S'
  if (ratio >= 0.72) return 'A'
  if (ratio >= 0.5) return 'B'
  if (ratio >= 0.3) return 'C'
  return 'D'
}

// 战力(CP)：攻防特攻特防速度之和 + 60% 血量，再乘等级系数（0.5 起，随等级线性上升）。
// 这是**唯一实现**——规则引擎卡与 AI 评测卡（六维是 0–100 评分）共用同一口径，
// 卡面上的「战力」永远由同屏显示的六维与等级算出来，不会出现 Lv.18 配 14964 这种数字。
// stats 可以是 [{name,value}] 也可以是纯数值数组（末位视为 HP）。
export function combatPowerOf(stats, level) {
  const list = (stats || []).filter(Boolean)
  if (!list.length) return 0
  const val = (s) => Math.max(0, Math.round(Number(s && typeof s === 'object' ? s.value : s) || 0))
  const hpItem = list.find((s) => s && typeof s === 'object' && s.name === 'HP')
  const hp = hpItem ? val(hpItem) : val(list[list.length - 1])
  const total = list.reduce((a, s) => a + val(s), 0)
  const offense = total - hp + Math.round(hp * 0.6)
  const lv = Math.max(1, Math.min(999, Number(level) || 1))
  return Math.floor(offense * (0.5 + lv / 200))
}

// 六维尺度：AI 评测卡的六维是 0–100 的评分，规则引擎卡是随等级放大的绝对数值。
// 两者归一化上限不同（评分卡：六维 /100、HP /1000），否则血条会永远满格或永远 20%。
export function statScaleOf(stats) {
  const values = (stats || []).map((s) => Number(s && typeof s === 'object' ? s.value : s) || 0)
  if (!values.length) return 'absolute'
  return Math.max(...values) <= 100 ? 'score' : 'absolute'
}

// 由「当前六维 + 当前等级」派生出的展示字段：战力 / 归一化上限。
// 任何改了 stats 或 level 的地方都应该用它刷新，别让派生值随旧卡残留。
export function derivedFieldsOf(pet, level = pet?.level) {
  const stats = pet?.stats || []
  if (!stats.length) return {}
  const lv = Math.max(1, Math.min(999, Number(level) || 1))
  const scored = statScaleOf(stats) === 'score'
  const hpCap = scored ? 1000 : statCapAtLevel(lv, true)
  return {
    combatPower: combatPowerOf(stats, lv),
    statCap: scored ? 100 : hpCap,
    hpCap,
  }
}

// 读档归一化：修掉历史上「AI 评测覆盖了六维与等级，却把规则引擎按高等级算出的
// combatPower / statCap / ivs 留在卡里」的宠物。幂等，对正常宠物是空操作。
export function normalizePet(pet) {
  if (!pet || !Array.isArray(pet.stats) || !pet.stats.length) return pet
  const derived = derivedFieldsOf(pet)
  const next = { ...pet, ...derived }
  // AI 评测卡的六维由模型给（评分制），个体值来自另一次规则引擎扫描，
  // 留着会让「升级重算」用引擎公式把模型给的六维冲掉。
  if (pet.aiEvaluated && statScaleOf(pet.stats) === 'score') {
    next.ivs = null
    next.baseStats = null
  }
  return next
}

// 核心：种族值 + 个体值 + 等级 → 六维 + 最大HP + 战力(CP)
// traits 仅以「百分比」修正（词条在设计文档 §6.4 里本就是相对强弱），保证任何等级下都有意义。
export function computeStats({ speciesKey, elementKey, qualityKey, ivs, level, traits = [] }) {
  const base = baseFor(speciesKey, elementKey)
  const lv = Math.max(1, Math.min(999, Number(level) || 1))
  const raw = STAT_ORDER.map((name, i) => {
    const b = base[name] || 50
    const iv = ivs?.[i] ?? 0
    if (name === 'HP') return Math.floor((2 * b + iv) * lv / 100) + lv + 10
    return Math.floor((2 * b + iv) * lv / 100) + 5
  })
  const withTraits = applyTraits(
    STAT_ORDER.map((name, i) => ({ name, value: raw[i] })),
    traits,
  )
  const maxHp = withTraits.find((s) => s.name === 'HP').value
  const combatPower = combatPowerOf(withTraits, lv)
  const statCap = statCapAtLevel(lv, true)
  const stats = withTraits.map((s) => {
    const cap = statCapAtLevel(lv, s.name === 'HP')
    const ratio = cap > 0 ? s.value / cap : 0
    return { ...s, grade: gradeOfRatio(ratio) }
  })
  return { stats, maxHp, combatPower, statCap, base }
}

// 升级后按新等级重算（保留既有的个体值与词条），旧存档缺字段时返回空对象以保持兼容
export function recomputePetStats(pet, level) {
  if (!pet || !pet.ivs || !pet.species || !pet.element) return {}
  const r = computeStats({
    speciesKey: pet.species.key,
    elementKey: pet.element.key,
    qualityKey: pet.qualityKey,
    ivs: pet.ivs,
    level,
    traits: pet.traits || [],
  })
  return { stats: r.stats, maxHp: r.maxHp, combatPower: r.combatPower, statCap: r.statCap }
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
  const evolutionStage = stageFromLevel(level)
  const ivs = rollIVs(seed, qualityKey)
  const skills = buildSkills(primary, level, rng)

  // §6.3 / §6.4：根基与性格词条（前端 mock；后端接入后以 API 为准）
  const aiRate = snap.aiRate ?? null
  const foundation = foundationOf(snap, aiRate)
  const petTraits = traitsOf(snap, { aiRate })
  const { stats, maxHp, combatPower, statCap, base: baseStats } = computeStats({
    speciesKey: species.key,
    elementKey: primary.key,
    qualityKey,
    ivs,
    level,
    traits: petTraits,
  })

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
    stats,
    ivs,
    baseStats,
    combatPower,
    statCap,
    skills,
    foundation: foundation.score,
    foundationDims: foundation.dims,
    foundationTier: foundationTier(foundation.score),
    traits: petTraits,
    traitSummary: traitSummary(petTraits),
    traitHints: traitHints(petTraits),
    xpMultiplier: xpMultiplier(petTraits),
    expToNext: Math.round(expForLevel(level) * xpMultiplier(petTraits)),
    maxHp,
    status: snap.daysSincePush > 30 ? 'sleeping' : 'active',
    bond: 0,
    createdAt: Date.now(),
    syncedAt: Date.now(),
  }
}
