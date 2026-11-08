// 战斗引擎自检：不依赖浏览器，直接 node 跑
//   node scripts/battle-selftest.mjs
// 覆盖：属性表合法性、伤害不变量、战斗必然收敛、同种子可复现、AI 合法性

import { ELEMENTS } from '../src/engine.js'
import { rivalPets, pickRivalTeam } from '../src/rivals.js'
import {
  TYPE_CHART,
  battleTurn,
  createBattle,
  calcDamage,
  effectiveness,
  nextRandom,
  toCombatant,
} from '../src/battle.js'

let failures = 0
const check = (name, cond, detail = '') => {
  if (cond) return
  failures += 1
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

const typeKeys = new Set(Object.keys(ELEMENTS))
console.log(`属性数 ${typeKeys.size}：${[...typeKeys].join(' ')}`)

// ---------- 1. 属性表 ----------
for (const [atk, row] of Object.entries(TYPE_CHART)) {
  check(`属性表攻方合法 ${atk}`, typeKeys.has(atk))
  for (const [def, mult] of Object.entries(row)) {
    check(`属性表守方合法 ${atk}→${def}`, typeKeys.has(def))
    check(`倍率合法 ${atk}→${def}`, [0, 0.5, 2].includes(mult), String(mult))
  }
}

// 除「普通」外，每个属性都要有至少一个 2 倍目标，否则它在对战中毫无意义
// （普通系刻意没有克制面，靠「只被岩/钢抵抗」的稳定性立足，和原作一致）
for (const key of typeKeys) {
  if (key === 'normal') continue
  const row = TYPE_CHART[key] || {}
  const strengths = Object.values(row).filter((v) => v === 2).length
  check(`${key} 至少一个克制目标`, strengths > 0)
}

// 免疫只有一条：地免疫雷
const immunities = []
for (const [atk, row] of Object.entries(TYPE_CHART)) {
  for (const [def, mult] of Object.entries(row)) if (mult === 0) immunities.push(`${atk}→${def}`)
}
check('免疫条目只有「雷→地」', immunities.length === 1 && immunities[0] === 'thunder→earth', immunities.join(','))

// ---------- 2. 真实精灵 ----------
const pets = rivalPets()
console.log(`内置对手 ${pets.length} 只：${pets.map((p) => `${p.repo}(Lv${p.level})`).slice(0, 6).join(' ')}…`)
for (const pet of pets) {
  const unit = toCombatant(pet)
  check(`${pet.repo} HP 合理`, unit.maxHp > 60 && unit.maxHp < 400, String(unit.maxHp))
  check(`${pet.repo} 四技能`, unit.moves.length === 4)
  check(`${pet.repo} 技能已解锁标记`, unit.moves.filter((m) => m.unlocked).length >= 2)
}

// 伤害不变量：用同六维的合成精灵，排除个体值干扰
const mockPet = (key) => ({
  repo: key, fullName: `mock/${key}`, platform: 'mock', level: 500, qualityKey: 'SR', spriteSeed: 7,
  element: ELEMENTS[key], elementSecondary: null,
  species: { name: '元素型', body: 'slime' }, evolutionStage: 2,
  stats: [
    { name: '攻击', value: 80 }, { name: '防御', value: 80 }, { name: '速度', value: 80 },
    { name: '特攻', value: 80 }, { name: '特防', value: 80 }, { name: 'HP', value: 80 },
  ],
  skills: [
    { name: '一式', unlocked: true, unlockLevel: 1 }, { name: '二式', unlocked: true, unlockLevel: 1 },
    { name: '三式', unlocked: true, unlockLevel: 150 }, { name: '四式', unlocked: true, unlockLevel: 500 },
  ],
})

{
  const water = toCombatant(mockPet('water'))
  const fire = toCombatant(mockPet('fire'))
  const grass = toCombatant(mockPet('grass'))
  const earth = toCombatant(mockPet('earth'))
  const move = water.moves[1]
  const vsFire = calcDamage(water, fire, move, () => 0.925).damage
  const vsGrass = calcDamage(water, grass, move, () => 0.925).damage
  check('水打火 > 水打草', vsFire > vsGrass, `${vsFire} vs ${vsGrass}`)
  check('雷打地 = 0', effectiveness('thunder', ['earth']) === 0)
  const immune = calcDamage(water, earth, { ...move, type: 'thunder' }, () => 0.925)
  check('免疫时伤害为 0', immune.damage === 0)
  check('伤害不超过最大 HP 太多', vsFire <= fire.maxHp * 2, `${vsFire} vs ${fire.maxHp}`)
}

// ---------- 3. 批量对局 ----------
const stats = { turns: [], winner: { player: 0, enemy: 0 }, longest: 0 }

function playOne(seed, difficulty, size) {
  const pick = (offset) => pickRivalTeam(pets.slice(offset, offset + 4), seed + offset, difficulty).slice(0, size)
  const teamA = pick(0)
  const teamB = pick(0).reverse()
  let { state } = createBattle({ playerTeam: teamA, enemyTeam: teamB, seed, difficulty })
  const trace = []
  let guard = 0
  while (!state.winner && guard < 200) {
    const usable = state.sides.player.team[state.sides.player.active].moves
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.unlocked && m.pp > 0)
    const action = usable.length
      ? { type: 'move', index: usable[Math.floor(nextRandom(state) * usable.length)].i }
      : { type: 'move', index: 0 }
    trace.push(action)
    const res = battleTurn(state, action)
    state = res.state
    guard += 1
    for (const side of ['player', 'enemy']) {
      for (const u of state.sides[side].team) {
        check('HP 在区间内', Number.isFinite(u.hp) && u.hp >= 0 && u.hp <= u.maxHp, `${u.name} ${u.hp}/${u.maxHp}`)
      }
    }
    check('回合计数递增', state.turn === guard)
  }
  check('战斗会结束', !!state.winner, `seed ${seed}`)
  return { state, trace, turns: state.turn }
}

for (let i = 0; i < 120; i += 1) {
  const seed = 1000 + i * 37
  const difficulty = ['easy', 'normal', 'hard'][i % 3]
  const size = (i % 3) + 1
  const { state, turns } = playOne(seed, difficulty, size)
  stats.turns.push(turns)
  stats.longest = Math.max(stats.longest, turns)
  if (state.winner) stats.winner[state.winner] += 1
}

// ---------- 3b. 自动托管（UI 默认路径：battleTurn(state, { type: 'auto' })） ----------
{
  const autoRun = (seed, difficulty, size) => {
    const teamA = pickRivalTeam(pets.slice(0, 4), seed, difficulty).slice(0, size)
    const teamB = pickRivalTeam(pets.slice(4, 8), seed + 5, difficulty).slice(0, size)
    let { state } = createBattle({ playerTeam: teamA, enemyTeam: teamB, seed, difficulty })
    let guard = 0
    while (!state.winner && guard < 200) {
      state = battleTurn(state, { type: 'auto' }).state
      guard += 1
    }
    return { state, turns: guard }
  }
  let longest = 0
  for (let i = 0; i < 60; i += 1) {
    const seed = 5000 + i * 53
    const difficulty = ['easy', 'normal', 'hard'][i % 3]
    const size = (i % 3) + 1
    const { state, turns } = autoRun(seed, difficulty, size)
    longest = Math.max(longest, turns)
    check('自动对战会结束', !!state.winner, `seed ${seed} / ${turns} 回合`)
  }
  const a = JSON.stringify(autoRun(9182, 'hard', 3).state.sides)
  const b = JSON.stringify(autoRun(9182, 'hard', 3).state.sides)
  check('自动托管同种子结果完全一致', a === b)
  console.log(`自动托管 60 场 · 最长 ${longest} 回合`)
}

// ---------- 4. 可复现 ----------
{
  const seed = 777
  const run = () => {
    const teamA = pickRivalTeam(pets, seed, 'normal').slice(0, 3)
    const teamB = pickRivalTeam(pets, seed + 5, 'normal').slice(0, 3)
    let { state } = createBattle({ playerTeam: teamA, enemyTeam: teamB, seed })
    for (let i = 0; i < 12 && !state.winner; i += 1) {
      const usable = state.sides.player.team[state.sides.player.active].moves
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => m.unlocked && m.pp > 0)
      const index = usable.length ? usable[i % usable.length].idx : 0
      state = battleTurn(state, { type: 'move', index }).state
    }
    return JSON.stringify(state.sides)
  }
  check('同种子结果完全一致', run() === run())
}

const avg = stats.turns.reduce((a, b) => a + b, 0) / stats.turns.length
console.log(`\n对局 ${stats.turns.length} 场 · 平均 ${avg.toFixed(1)} 回合 · 最长 ${stats.longest} 回合`)
console.log(`胜负：玩家 ${stats.winner.player} / 对手 ${stats.winner.enemy}`)
console.log(failures === 0 ? '\n全部自检通过。' : `\n${failures} 项失败。`)
process.exit(failures === 0 ? 0 : 1)
