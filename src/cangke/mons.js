/* 仓可梦 · 像素版 —— 图鉴与战斗数值
 *
 * 数据全部来自包内 roster.json（383 只精灵：属性 / 六维 / 成长率 / 进化链 / 图鉴文案）。
 * 这里只做两件事：把图鉴条目换算成一只可战斗的个体，以及伤害 / 捕捉 / 升级这些规则。
 * 表现层（像素立绘）走 sprite.js 的 drawSprite，和卡面同一套像素精灵，风格统一。
 */
import roster from '../story/packs/default/roster.json'
import { ELEMENTS } from '../engine.js'

const BY_ID = new Map(roster.map((r) => [r.id, r]))
export const DEX = roster

// 图鉴里是「金木水火土」+ 两个数字属性（6 / 7），换成引擎的元素键
const ELEMENT_OF = { 金: 'steel', 木: 'grass', 水: 'water', 火: 'fire', 土: 'earth', '6': 'thunder', '7': 'wind' }
// 必须用 sprite.js 的生态体型键（biped / winged / slime / quadruped / golem / spirit），
// 写别的会全部落到默认 blob，383 只看起来像同一只。
// 同属性给两三种体型，按 id 稳定挑一种，图鉴才不会一片同款。
const BODIES_OF = {
  steel: ['golem', 'biped'],
  grass: ['spirit', 'slime'],
  water: ['slime', 'quadruped'],
  fire: ['quadruped', 'golem'],
  earth: ['biped', 'golem'],
  thunder: ['winged', 'quadruped'],
  wind: ['winged', 'spirit'],
}

export const ELEMENT_CN = { steel: '金', grass: '木', water: '水', fire: '火', earth: '土', thunder: '雷', wind: '风' }

// 属性相克：火克木、木克土、土克雷、水克火、雷克水；金偏防守，风轻快
const CHART = {
  fire: { grass: 1.5, steel: 1.3, water: 0.65, fire: 0.7 },
  grass: { water: 1.5, earth: 1.35, fire: 0.65, wind: 0.75 },
  water: { fire: 1.5, earth: 1.25, grass: 0.65, thunder: 0.7 },
  earth: { thunder: 1.6, steel: 1.2, grass: 0.7, wind: 0.75 },
  thunder: { water: 1.6, wind: 1.35, earth: 0.6 },
  steel: { grass: 1.15, earth: 1.1, fire: 0.8, steel: 0.7 },
  wind: { grass: 1.35, earth: 0.85, thunder: 0.8 },
}

const MOVE_POOL = {
  steel: [['铁尾', 45], ['钢牙', 62], ['金属风暴', 84]],
  grass: [['藤鞭', 42], ['飞叶快刀', 60], ['光合爆裂', 86]],
  water: [['水枪', 40], ['潮旋', 62], ['高压水泵', 88]],
  fire: [['火花', 42], ['烈焰爪', 64], ['熔岩爆发', 90]],
  earth: [['落石', 45], ['地裂', 66], ['沙暴', 80]],
  thunder: [['电击', 40], ['十万伏特', 68], ['雷霆万钧', 90]],
  wind: [['风刃', 40], ['空气斩', 60], ['飓风', 84]],
}

export function elementOf(entry) {
  return ELEMENT_OF[entry?.element] || 'steel'
}
export function bodyOf(element, id = 0) {
  const list = BODIES_OF[element] || ['biped']
  return list[Math.abs(Number(id) || 0) % list.length]
}
export function elementColor(element) {
  return ELEMENTS[element]?.color || '#9fb2c8'
}
export function elementName(element) {
  return ELEMENT_CN[element] || ELEMENTS[element]?.name || '?'
}

// 一只个体能学的招：本系两个 + 一个高阶（等级够才换上）+ 撞击
function movesFor(element, level) {
  const pool = MOVE_POOL[element] || MOVE_POOL.steel
  const out = pool.slice(0, 2).map(([name, power]) => ({ name, power, element }))
  if (level >= 12) {
    const [, power] = pool[2]
    out[1] = { name: pool[2][0], power, element }
  }
  out.push({ name: '撞击', power: 35, element: 'normal' })
  return out
}

export function expForLevel(level) {
  return 16 + level * 13
}

// 图鉴六维是跨代绝对制，而且分布极端偏斜（中位 2800，最高 20 万，金波姆只有 160）。
// 按中位数比值换算会把九成种族压在同一个下限上，所以改用「百分位排名」：
// 每项在全图鉴里排到第几成，就映射成 0.72～1.87 的强度系数——差异保留、量级受控。
const rankOf = (pick) => {
  const arr = roster
    .map((r) => ({ id: r.id, v: Number(pick(r)) || 0 }))
    .sort((a, b) => a.v - b.v)
  const n = Math.max(1, arr.length - 1)
  const m = new Map()
  arr.forEach((e, i) => m.set(e.id, i / n))
  return m
}
const RANK = {
  hp: rankOf((r) => r.stats?.hp),
  atk: rankOf((r) => r.stats?.ac),
  def: rankOf((r) => r.stats?.mc),
  spd: rankOf((r) => r.stats?.speed),
}
const rankF = (m, id, lo, hi) => lo + (m.get(id) ?? 0.5) * (hi - lo)

function statsOf(entry, level) {
  const lv = Math.max(1, Math.round(level))
  const id = entry?.id
  // 下限抬到 0.78：图鉴里最弱那批（金波姆这类）不该弱到没法打
  const hpF = rankF(RANK.hp, id, 0.78, 1.8)
  const atkF = rankF(RANK.atk, id, 0.78, 1.55)
  const defF = rankF(RANK.def, id, 0.78, 1.55)
  const spdF = rankF(RANK.spd, id, 0.78, 1.6)
  return {
    maxHp: Math.round((18 + lv * 5) * hpF),
    atk: Math.round((9 + lv * 1.6) * atkF),
    def: Math.round((7 + lv * 1.3) * defF),
    spd: Math.round((6 + lv * 1.4) * spdF),
  }
}

let uidSeq = 0

export function makeMon(id, level = 5) {
  const entry = BY_ID.get(Number(id)) || roster[0]
  const element = elementOf(entry)
  const mon = {
    uid: `m${++uidSeq}`,
    id: entry.id,
    name: entry.name,
    element,
    level: Math.max(1, Math.round(level)),
    exp: 0,
    expToNext: expForLevel(Math.max(1, Math.round(level))),
    ...statsOf(entry, level),
  }
  mon.hp = mon.maxHp
  mon.moves = movesFor(element, mon.level)
  return mon
}

export function refreshStats(mon) {
  const entry = BY_ID.get(mon.id)
  const next = statsOf(entry, mon.level)
  const hpGain = next.maxHp - mon.maxHp
  mon.maxHp = next.maxHp
  mon.atk = next.atk
  mon.def = next.def
  mon.spd = next.spd
  mon.hp = Math.min(mon.maxHp, Math.max(1, mon.hp + Math.max(0, hpGain)))
  return mon
}

// 升级 + 进化：返回给界面看的事件数组
export function gainExp(mon, amount) {
  const events = []
  mon.exp += Math.max(1, Math.round(amount))
  let guard = 0
  while (mon.exp >= mon.expToNext && mon.level < 60 && guard++ < 20) {
    mon.exp -= mon.expToNext
    mon.level += 1
    mon.expToNext = expForLevel(mon.level)
    refreshStats(mon)
    mon.moves = movesFor(mon.element, mon.level)
    events.push({ kind: 'level', text: `${mon.name} 升到 Lv.${mon.level}！` })
    const entry = BY_ID.get(mon.id)
    const evo = (entry?.evolution || []).find((e) => e.level <= mon.level && e.to && e.to !== mon.id)
    if (evo && BY_ID.get(evo.to)) {
      const before = mon.name
      mon.id = evo.to
      mon.name = BY_ID.get(evo.to).name
      mon.element = elementOf(BY_ID.get(evo.to))
      refreshStats(mon)
      mon.moves = movesFor(mon.element, mon.level)
      events.push({ kind: 'evolve', text: `${before} 进化成了 ${mon.name}！` })
    }
  }
  return events
}

export function damageOf(attacker, defender, move) {
  const mult = CHART[move.element]?.[defender.element] ?? 1
  // 0.34 的系数把「同等级大约四下打死」定成基准节奏；之前 0.42 会同级两下就倒
  const raw = (move.power * (attacker.atk + 12)) / (defender.def + 18) * 0.34
  const jitter = 0.9 + Math.random() * 0.2
  return {
    dmg: Math.max(1, Math.round(raw * mult * jitter)),
    mult,
  }
}

export function captureChance(mon) {
  const hpRatio = mon.hp / mon.maxHp
  const base = (1 - hpRatio) * 0.8 + 0.12
  const levelPenalty = Math.min(0.35, mon.level * 0.012)
  return Math.max(0.05, Math.min(0.93, base - levelPenalty))
}

// 野怪池：按成长率粗分强弱，路边只出弱一点的
const COMMON = roster.filter((r) => Number(String(r.growth || '1,1').split(',')[0]) <= 2.2)
const RARE = roster.filter((r) => Number(String(r.growth || '1,1').split(',')[0]) > 2.2)

export function randomWild(minLevel, maxLevel, bias = 0) {
  const pool = Math.random() < 0.12 + bias ? RARE : COMMON
  const entry = pool[Math.floor(Math.random() * pool.length)] || roster[0]
  const lv = minLevel + Math.floor(Math.random() * Math.max(1, maxLevel - minLevel + 1))
  return makeMon(entry.id, lv)
}

export function healParty(party) {
  party.forEach((m) => {
    m.hp = m.maxHp
    m.exp = Math.min(m.exp, m.expToNext - 1)
  })
}

export function spriteOf(mon) {
  const c = elementColor(mon.element)
  return {
    spriteSeed: (mon.id * 2654435761) >>> 0,
    // 同色系但主副色错开，避免所有水属性都是一模一样的蓝
    colors: [c, shade(c, mon.id % 2 ? 0.72 : 1.24)],
    body: bodyOf(mon.element, mon.id),
    stage: Math.min(9, Math.max(1, Math.round(mon.level / 8) + 1)),
  }
}

// 提亮 / 压暗一个十六进制色，用来给像素精灵配副色
function shade(hex, k) {
  const m = /^#?([\da-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
