// 战斗系统（设计文档 §7.4，机制说明见 docs/BATTLE.md）
//
// 机制参照 Pokémon Showdown（smogon/pokemon-showdown，MIT）：
//   · 伤害公式 floor(floor(floor(2L/5+2) × 威力 × A/D)/50) + 2，再乘 STAB / 克制 / 会心 / 随机数
//   · 能力等级 −6..+6 的分数表、先制度 → 速度的行动顺序、灼烧减攻、麻痹减速与 25% 失手
//   · 同类型加成、会心率、PP 与「挣扎」兜底
// 属性克制吸收《赛尔号》的「克制 / 微弱 / 无效」三档（含一条免疫：地免疫雷）。
// 数值层没有照搬：GitMon 只有六维 + 4 个技能，没有种族值 / 努力值 / 道具 / 特性池，
// 因此用「元素特性（passive）」承担原本特性/道具的位置。
//
// 全模块纯函数 + 显式种子：同一初始状态 + 同一操作序列，必然复现同一场战斗。

import { ELEMENTS } from './engine.js'

export const BATTLE_LEVEL = 50
export const OTHER_SIDE = { player: 'enemy', enemy: 'player' }

// ---------- 属性克制（攻 → 守，倍率） ----------
// 2 = 克制，0.5 = 微弱，0 = 无效；未列出即 1 倍。双属性连乘，最高 4 倍。
export const TYPE_CHART = {
  water: { fire: 2, rock: 2, earth: 2, water: 0.5, grass: 0.5, thunder: 0.5 },
  thunder: { water: 2, wind: 2, earth: 0, thunder: 0.5, grass: 0.5, steel: 0.5 },
  steel: { rock: 2, grass: 2, wind: 2, fire: 0.5, water: 0.5, steel: 0.5, thunder: 0.5 },
  earth: { fire: 2, thunder: 2, steel: 2, rock: 2, grass: 0.5, water: 0.5, wind: 0.5 },
  rock: { fire: 2, wind: 2, water: 0.5, grass: 0.5, steel: 0.5, earth: 0.5 },
  fire: { grass: 2, steel: 2, water: 0.5, rock: 0.5, earth: 0.5, fire: 0.5, wind: 0.5 },
  wind: { grass: 2, earth: 2, rock: 0.5, steel: 0.5, thunder: 0.5, wind: 0.5 },
  grass: { water: 2, earth: 2, rock: 2, fire: 0.5, grass: 0.5, steel: 0.5, wind: 0.5 },
  normal: { rock: 0.5, steel: 0.5 },
}

export function effectiveness(attackType, defenderTypes = []) {
  const row = TYPE_CHART[attackType] || {}
  return defenderTypes.filter(Boolean).reduce((m, t) => m * (row[t] ?? 1), 1)
}

export function effectivenessLabel(mult) {
  if (mult === 0) return '无效'
  if (mult >= 4) return '效果绝佳'
  if (mult > 1) return '效果拔群'
  if (mult < 1) return '效果不佳'
  return '效果一般'
}

// ---------- 能力等级（Showdown 同款分数表） ----------
const STAGE_TABLE = [2 / 8, 2 / 7, 2 / 6, 2 / 5, 2 / 4, 2 / 3, 2 / 2, 3 / 2, 4 / 2, 5 / 2, 6 / 2, 7 / 2, 8 / 2]

export function stageMultiplier(stage = 0) {
  return STAGE_TABLE[Math.max(0, Math.min(12, Math.round(stage) + 6))]
}

// ---------- 元素特性（原作的「特性/道具」位） ----------
export const PASSIVES = {
  water: { key: 'tide', name: '潮汐自愈', desc: '每回合结束回复 5% 最大 HP' },
  thunder: { key: 'static', name: '静电蓄能', desc: '速度 +15%，攻击技能 10% 使目标麻痹' },
  steel: { key: 'alloy', name: '合金装甲', desc: '受到效果拔群的伤害降低 15%' },
  earth: { key: 'bedrock', name: '厚土', desc: '入场时防御 +1' },
  rock: { key: 'bulwark', name: '岩壁', desc: '入场时特防 +1' },
  fire: { key: 'blaze', name: '灼热', desc: '攻击技能 15% 使目标灼烧' },
  wind: { key: 'gust', name: '疾风', desc: '入场时速度 +1' },
  grass: { key: 'vitality', name: '生机', desc: '每回合结束回复 4%，灼烧/中毒伤害减半' },
  normal: { key: 'adapt', name: '适应力', desc: '同属性加成提升至 1.6 倍' },
}

// ---------- 技能模板：4 个槽位对应引擎里的 4 个技能名 ----------
// 槽位 0/1 出生即解锁，槽位 2 在 Lv.150，槽位 3 在 Lv.500（与 engine.SKILL_UNLOCK 一致）
const MOVE_SLOTS = [
  { role: 'quick', label: '先制', category: 'physical', power: 45, acc: 100, pp: 25, priority: 1 },
  { role: 'main', label: '主力', category: 'special', power: 65, acc: 95, pp: 20, secondaryChance: 0.2 },
  { role: 'heavy', label: '重击', category: 'physical', power: 95, acc: 85, pp: 8, critStage: 1 },
  { role: 'ultra', label: '终极', category: 'special', power: 120, acc: 80, pp: 5, recoil: 0.25 },
]

const SECONDARY_STATUS = { fire: 'burn', thunder: 'paralysis', grass: 'poison' }

export const STATUS_INFO = {
  burn: { key: 'burn', name: '灼烧', color: '#ff7a45', short: '灼' },
  poison: { key: 'poison', name: '中毒', color: '#b06cf0', short: '毒' },
  paralysis: { key: 'paralysis', name: '麻痹', color: '#f5c542', short: '麻' },
  sleep: { key: 'sleep', name: '沉睡', color: '#7f8aa3', short: '眠' },
}

const STRUGGLE = {
  name: '挣扎',
  type: 'normal',
  category: 'physical',
  power: 50,
  acc: 100,
  pp: Infinity,
  maxPp: Infinity,
  priority: 0,
  recoil: 0.25,
  struggle: true,
  label: '无 PP',
}

const STAT_KEY = { 攻击: 'atk', 防御: 'def', 速度: 'spe', 特攻: 'spa', 特防: 'spd', HP: 'hp' }
const STAT_LABEL = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// ---------- 随机数：状态里显式保存种子，保证可复现 ----------
export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clone = (obj) => JSON.parse(JSON.stringify(obj))

// ---------- 仓库精灵 → 战斗单位 ----------
export function toCombatant(pet, slot = 0) {
  const statOf = (name) => {
    const found = (pet.stats || []).find((s) => s.name === name)
    return Number(found?.value) || 40
  }
  const hpStat = statOf('HP')
  const maxHp = Math.round(60 + hpStat * 1.3)
  const element = pet.element || ELEMENTS.normal
  const secondary = pet.elementSecondary || null
  const types = [element.key, secondary?.key].filter(Boolean)

  const moves = MOVE_SLOTS.map((slotDef, i) => {
    const named = pet.skills?.[i]
    const move = {
      name: named?.name || `技能${i + 1}`,
      type: element.key,
      role: slotDef.role,
      label: slotDef.label,
      category: slotDef.category,
      power: slotDef.power,
      acc: slotDef.acc,
      pp: slotDef.pp,
      maxPp: slotDef.pp,
      priority: slotDef.priority || 0,
      critStage: slotDef.critStage || 0,
      recoil: slotDef.recoil || 0,
      unlocked: named?.unlocked ?? i < 2,
      unlockLevel: named?.unlockLevel ?? [1, 1, 150, 500][i],
    }
    const status = SECONDARY_STATUS[element.key]
    if (slotDef.secondaryChance && status) move.secondary = { status, chance: slotDef.secondaryChance }
    return move
  })

  const combatant = {
    key: `${pet.fullName || pet.repo || 'unknown'}#${slot}`,
    name: pet.repo || pet.name || '未知精灵',
    fullName: pet.fullName || pet.repo || '',
    level: Number(pet.level) || 1,
    qualityKey: pet.qualityKey || pet.quality?.key || 'N',
    spriteSeed: pet.spriteSeed || 1,
    element: { key: element.key, name: element.name, color: element.color },
    elementSecondary: secondary ? { key: secondary.key, name: secondary.name, color: secondary.color } : null,
    species: pet.species || { name: '元素型', body: 'slime' },
    evolutionStage: pet.evolutionStage || 1,
    quality: pet.quality || { key: 'N', name: '普通', color: '#9e9e9e' },
    types,
    passive: PASSIVES[element.key] ? PASSIVES[element.key].key : 'adapt',
    passiveInfo: PASSIVES[element.key] || PASSIVES.normal,
    stats: {
      atk: statOf('攻击'),
      def: statOf('防御'),
      spa: statOf('特攻'),
      spd: statOf('特防'),
      spe: statOf('速度'),
    },
    maxHp,
    hp: maxHp,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: null,
    statusTurns: 0,
    moves,
    fainted: false,
  }
  return combatant
}

export function toTeam(pets, sideKey = 'team') {
  return (pets || []).slice(0, 3).map((pet, i) => toCombatant(pet, sideKey === 'team' ? i : i))
}

// ---------- 数值读取（含能力等级 / 状态 / 特性修正） ----------
export function statValue(unit, key) {
  let value = unit.stats[key] * stageMultiplier(unit.stages[key] || 0)
  if (key === 'atk' && unit.status === 'burn') value *= 0.5
  if (key === 'spe') {
    if (unit.status === 'paralysis') value *= 0.5
    if (unit.passive === 'static') value *= 1.15
  }
  return Math.max(1, value)
}

export function speedOf(unit) {
  return statValue(unit, 'spe')
}

// ---------- 伤害 ----------
// 传入 rng 便于 UI 预估（传固定值）与正式结算（传 state 随机源）
export function calcDamage(attacker, defender, move, rng = () => 0.925, opts = {}) {
  const mult = effectiveness(move.type, defender.types)
  if (mult === 0 || !move.power) return { damage: 0, mult, crit: false, stab: 1 }

  const physical = move.category === 'physical'
  const aKey = physical ? 'atk' : 'spa'
  const dKey = physical ? 'def' : 'spd'
  const A = statValue(attacker, aKey)
  const D = statValue(defender, dKey)
  const base = Math.floor((Math.floor((Math.floor((2 * BATTLE_LEVEL) / 5 + 2) * move.power * A) / D) / 50) + 2)

  const stab = attacker.types.includes(move.type) ? (attacker.passive === 'adapt' ? 1.6 : 1.5) : 1
  const crit = opts.crit ?? false
  let mods = stab * mult * (crit ? 1.5 : 1)
  if (defender.passive === 'alloy' && mult > 1) mods *= 0.85
  const roll = 0.85 + rng() * 0.15

  return { damage: Math.max(1, Math.floor(base * mods * roll)), mult, crit, stab }
}

function critRate(move, unit) {
  const stage = (move.critStage || 0) + (unit.status === 'sleep' ? 0 : 0)
  const rates = [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2]
  return rates[clamp(stage, 0, 4)]
}

// ---------- 建场 ----------
export function createBattle({ playerTeam, enemyTeam, seed = 1, difficulty = 'normal', playerName = '你', enemyName = '对手' }) {
  const state = {
    rng: (seed >>> 0) || 1,
    seed: (seed >>> 0) || 1,
    turn: 0,
    winner: null,
    difficulty,
    sides: {
      player: { name: playerName, team: toTeam(playerTeam), active: 0 },
      enemy: { name: enemyName, team: toTeam(enemyTeam), active: 0 },
    },
    log: [],
  }

  const events = []
  for (const side of ['player', 'enemy']) {
    const unit = activeOf(state, side)
    if (!unit) {
      state.winner = OTHER_SIDE[side]
      continue
    }
    events.push({ t: 'send', side, text: `${side === 'player' ? playerName : enemyName} 派出了「${unit.name}」！`, unit: unitBrief(unit) })
    applyEntry(state, side, events)
  }
  return { state, events }
}

export function activeOf(state, side) {
  const s = state.sides[side]
  return s.team[s.active] || null
}

export function benchOf(state, side) {
  return state.sides[side].team.filter((u, i) => i !== state.sides[side].active && !u.fainted)
}

export function teamAlive(state, side) {
  return state.sides[side].team.filter((u) => !u.fainted)
}

function unitBrief(unit) {
  return {
    key: unit.key,
    name: unit.name,
    level: unit.level,
    qualityKey: unit.qualityKey,
    hp: unit.hp,
    maxHp: unit.maxHp,
    status: unit.status,
    types: unit.types,
    element: unit.element,
    spriteSeed: unit.spriteSeed,
  }
}

function applyEntry(state, side, events) {
  const unit = activeOf(state, side)
  if (!unit) return
  const gains = { bedrock: { def: 1 }, bulwark: { spd: 1 }, gust: { spe: 1 } }[unit.passive]
  if (gains) {
    Object.entries(gains).forEach(([key, delta]) => {
      unit.stages[key] = clamp((unit.stages[key] || 0) + delta, -6, 6)
      events.push({ t: 'stat', side, text: `「${unit.name}」的${STAT_LABEL[key]}提升了！`, stat: key, delta })
    })
  }
}

// ---------- 一个回合 ----------
export function battleTurn(state, action) {
  if (state.winner) return { state, events: [] }
  const s = clone(state)
  s.log = s.log || []
  const events = []

  const playerAction = normalizeAction(action, s)
  const enemyAction = chooseAction(s, 'enemy')

  const switches = []
  const moves = []
  for (const [side, act] of [['player', playerAction], ['enemy', enemyAction]]) {
    if (!act) continue
    if (act.type === 'switch') switches.push([side, act])
    else moves.push([side, act])
  }

  // 换人先结算，随后出手方打的是换上来的那只
  for (const [side, act] of switches) {
    doSwitch(s, side, act.index, events)
  }

  // 行动顺序：先制度 → 速度 → 种子随机
  const ordered = moves
    .map(([side, act]) => {
      const unit = activeOf(s, side)
      const move = unit ? unit.moves[act.index] : null
      return {
        side,
        act,
        priority: move ? move.priority : 0,
        speed: unit ? speedOf(unit) : 0,
        tie: nextRandom(s),
      }
    })
    .sort((a, b) => b.priority - a.priority || b.speed - a.speed || a.tie - b.tie)

  for (const entry of ordered) {
    if (s.winner) break
    const unit = activeOf(s, entry.side)
    if (!unit || unit.fainted) continue
    runMove(s, entry.side, entry.act.index, events)
  }

  if (!s.winner) {
    endOfTurn(s, events)
    checkFaints(s, events)
  }

  s.turn += 1
  s.log = [...(s.log || []), ...events.filter((e) => e.text).map((e) => e.text)].slice(-40)
  return { state: s, events }
}

function normalizeAction(action, state) {
  if (!action) return { type: 'move', index: 0 }
  if (action.type === 'switch') {
    const team = state.sides.player.team
    const index = Number(action.index)
    if (!Number.isInteger(index) || !team[index] || team[index].fainted || index === state.sides.player.active) return null
    return { type: 'switch', index }
  }
  const index = clamp(Number(action.index) || 0, 0, 3)
  return { type: 'move', index }
}

function doSwitch(state, side, index, events) {
  const s = state.sides[side]
  const next = s.team[index]
  if (!next || next.fainted) return
  s.active = index
  next.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  events.push({
    t: 'switch',
    side,
    text: `${state.sides[side].name} 换上了「${next.name}」！`,
    unit: unitBrief(next),
  })
  applyEntry(state, side, events)
}

function runMove(state, side, index, events) {
  const user = activeOf(state, side)
  const foe = activeOf(state, OTHER_SIDE[side])
  if (!user || !foe || user.fainted) return

  // 睡眠
  if (user.status === 'sleep') {
    user.statusTurns -= 1
    if (user.statusTurns > 0) {
      events.push({ t: 'blocked', side, text: `「${user.name}」正在沉睡，无法行动…` })
      return
    }
    user.status = null
    user.statusTurns = 0
    events.push({ t: 'wake', side, text: `「${user.name}」醒过来了！` })
  }

  // 麻痹 25% 失手
  if (user.status === 'paralysis' && nextRandom(state) < 0.25) {
    events.push({ t: 'blocked', side, text: `「${user.name}」身体麻痹，动不了！` })
    return
  }

  let move = user.moves[index]
  let struggle = false
  if (move && !move.unlocked) {
    events.push({ t: 'blocked', side, text: `「${move.name}」还未解锁（Lv.${move.unlockLevel}）。` })
    return
  }
  if (!move || move.pp <= 0) {
    const anyUsable = user.moves.some((m) => m.unlocked && m.pp > 0)
    if (anyUsable && move && move.unlocked && move.pp <= 0) {
      events.push({ t: 'blocked', side, text: `「${move.name}」没有 PP 了！` })
      return
    }
    move = STRUGGLE
    struggle = true
  }
  if (!struggle) move.pp -= 1

  events.push({
    t: 'move',
    side,
    text: `「${user.name}」使出了「${move.name}」！`,
    move: { name: move.name, type: move.type, category: move.category, power: move.power, label: move.label },
  })

  // 命中判定
  if (nextRandom(state) * 100 >= move.acc) {
    events.push({ t: 'miss', side, text: '但是没有命中…' })
    return
  }

  const crit = nextRandom(state) < critRate(move, user)
  const { damage, mult } = calcDamage(user, foe, move, () => nextRandom(state), { crit })

  if (mult === 0) {
    events.push({ t: 'immune', side: OTHER_SIDE[side], text: `「${foe.name}」完全不受影响…` })
    return
  }

  foe.hp = Math.max(0, foe.hp - damage)
  events.push({
    t: 'damage',
    side: OTHER_SIDE[side],
    text: `${crit ? '会心一击！' : ''}「${foe.name}」受到 ${damage} 点伤害${mult > 1 ? '（' + effectivenessLabel(mult) + '）' : mult < 1 ? '（效果不佳）' : ''}。`,
    value: damage,
    mult,
    crit,
    hp: foe.hp,
    maxHp: foe.maxHp,
  })

  // 次要状态
  if (move.secondary && foe.hp > 0 && !foe.status && nextRandom(state) < move.secondary.chance) {
    applyStatus(state, OTHER_SIDE[side], move.secondary.status, events)
  }
  // 元素特性附带的异常
  if (foe.hp > 0 && !foe.status) {
    if (user.passive === 'blaze' && nextRandom(state) < 0.15) applyStatus(state, OTHER_SIDE[side], 'burn', events)
    if (user.passive === 'static' && move.category === 'physical' && nextRandom(state) < 0.1) {
      applyStatus(state, OTHER_SIDE[side], 'paralysis', events)
    }
  }

  if (foe.hp <= 0) {
    foe.fainted = true
    events.push({ t: 'faint', side: OTHER_SIDE[side], text: `「${foe.name}」倒下了！` })
  }

  // 反作用力 / 挣扎
  const recoilRatio = struggle ? 0.25 : move.recoil
  if (recoilRatio) {
    const recoil = struggle ? Math.max(1, Math.floor(user.maxHp * recoilRatio)) : Math.max(1, Math.floor(damage * recoilRatio))
    user.hp = Math.max(0, user.hp - recoil)
    events.push({
      t: 'damage',
      side,
      text: `「${user.name}」受到 ${recoil} 点反作用力伤害。`,
      value: recoil,
      mult: 1,
      crit: false,
      hp: user.hp,
      maxHp: user.maxHp,
    })
    if (user.hp <= 0) {
      user.fainted = true
      events.push({ t: 'faint', side, text: `「${user.name}」倒下了！` })
    }
  }
}

function applyStatus(state, side, status, events) {
  const unit = activeOf(state, side)
  if (!unit || unit.fainted || unit.status) return
  unit.status = status
  if (status === 'sleep') unit.statusTurns = 1 + Math.floor(nextRandom(state) * 3)
  events.push({ t: 'status', side, text: `「${unit.name}」${STATUS_INFO[status].name}了！`, status })
}

function endOfTurn(state, events) {
  for (const side of ['player', 'enemy']) {
    const unit = activeOf(state, side)
    if (!unit || unit.fainted) continue

    if (unit.status === 'burn' || unit.status === 'poison') {
      const ratio = unit.status === 'burn' ? 1 / 16 : 1 / 8
      const reduce = unit.passive === 'vitality' ? 0.5 : 1
      const dmg = Math.max(1, Math.floor(unit.maxHp * ratio * reduce))
      unit.hp = Math.max(0, unit.hp - dmg)
      events.push({
        t: 'damage',
        side,
        text: `「${unit.name}」受到${STATUS_INFO[unit.status].name}伤害 ${dmg} 点。`,
        value: dmg,
        mult: 1,
        crit: false,
        residual: true,
        hp: unit.hp,
        maxHp: unit.maxHp,
      })
      if (unit.hp <= 0) {
        unit.fainted = true
        events.push({ t: 'faint', side, text: `「${unit.name}」倒下了！` })
        continue
      }
    }

    if (unit.passive === 'tide' || unit.passive === 'vitality') {
      const ratio = unit.passive === 'tide' ? 0.05 : 0.04
      if (unit.hp < unit.maxHp) {
        const heal = Math.max(1, Math.floor(unit.maxHp * ratio))
        const before = unit.hp
        unit.hp = Math.min(unit.maxHp, unit.hp + heal)
        events.push({
          t: 'heal',
          side,
          text: `「${unit.name}」${unit.passive === 'tide' ? '潮汐自愈' : '生机'}恢复了 ${unit.hp - before} 点 HP。`,
          value: unit.hp - before,
          hp: unit.hp,
          maxHp: unit.maxHp,
        })
      }
    }
  }
}

function checkFaints(state, events) {
  for (const side of ['player', 'enemy']) {
    const unit = activeOf(state, side)
    if (!unit || !unit.fainted) continue
    const nextIndex = state.sides[side].team.findIndex((u) => !u.fainted)
    if (nextIndex >= 0) {
      state.sides[side].active = nextIndex
      const next = state.sides[side].team[nextIndex]
      next.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
      events.push({
        t: 'switch',
        side,
        text: `${state.sides[side].name} 派出了「${next.name}」！`,
        unit: unitBrief(next),
      })
      applyEntry(state, side, events)
    } else {
      state.winner = OTHER_SIDE[side]
      events.push({ t: 'end', side: OTHER_SIDE[side], text: `${state.sides[side].name} 已经没有可战斗的精灵了。` })
      return
    }
  }
}

// ---------- 对手 AI ----------
export function matchupScore(unit, foe) {
  if (!unit || !foe) return 0
  const offense = Math.max(...unit.types.map((t) => effectiveness(t, foe.types)))
  const defense = Math.max(...foe.types.map((t) => effectiveness(t, unit.types)))
  return offense - defense
}

function estimate(unit, foe, move) {
  const { damage, mult } = calcDamage(unit, foe, move, () => 0.925)
  return { damage, mult }
}

export function chooseAction(state, side) {
  const me = activeOf(state, side)
  const foe = activeOf(state, OTHER_SIDE[side])
  if (!me || !foe) return { type: 'move', index: 0 }

  const difficulty = state.difficulty || 'normal'
  const bench = state.sides[side].team
    .map((u, i) => ({ u, i }))
    .filter(({ u, i }) => i !== state.sides[side].active && !u.fainted)

  // 血量告急且替补属性更优 → 有一定概率换人
  if (bench.length && me.hp / me.maxHp < 0.3) {
    const best = bench.reduce((a, b) => (matchupScore(b.u, foe) > matchupScore(a.u, foe) ? b : a))
    const gain = matchupScore(best.u, foe) - matchupScore(me, foe)
    const chance = difficulty === 'hard' ? 0.6 : difficulty === 'easy' ? 0.15 : 0.4
    if (gain > 0.2 && nextRandom(state) < chance) return { type: 'switch', index: best.i }
  }

  const usable = me.moves.filter((m) => m.unlocked && m.pp > 0)
  if (!usable.length) return { type: 'move', index: 0 } // 交由 runMove 走「挣扎」

  if (difficulty === 'easy' && nextRandom(state) < 0.3) {
    return { type: 'move', index: me.moves.indexOf(usable[Math.floor(nextRandom(state) * usable.length)]) }
  }

  let bestIndex = me.moves.indexOf(usable[0])
  let bestScore = -Infinity
  for (const move of usable) {
    const { damage, mult } = estimate(me, foe, move)
    if (mult === 0) continue
    let score = damage * (move.acc / 100)
    if (damage >= foe.hp) score += 600
    if (move.recoil && damage >= foe.hp) score += 100
    score *= 0.9 + nextRandom(state) * 0.2
    if (score > bestScore) {
      bestScore = score
      bestIndex = me.moves.indexOf(move)
    }
  }
  return { type: 'move', index: bestIndex }
}

// ---------- 给 UI 用的查询 ----------
export function bestEffectiveness(unit, foe) {
  if (!unit || !foe) return 1
  return Math.max(...unit.types.map((t) => effectiveness(t, foe.types)))
}

export function moveEffectiveness(move, foe) {
  return effectiveness(move.type, foe.types)
}

export function hpPercent(unit) {
  return unit ? clamp(Math.round((unit.hp / unit.maxHp) * 100), 0, 100) : 0
}
