// 与 Pokémon Showdown 官方模拟器（@pkmn/sim，MIT）对拍
//   node scripts/showdown-parity.mjs
//
// 做法：把 GitMon 的 9 属性表 + 自定义种族/技能灌进 Showdown 的 Dex，
// 让它按官方规则打真实对局，再把同一组输入喂给 src/battle.js，比对伤害区间。
// 目的：证明自研引擎的伤害/克制与成熟实现一致（而不是"看起来像"）。

import { Dex, Battle, Teams } from '@pkmn/sim'
import { TYPE_CHART, calcDamage, effectiveness } from '../src/battle.js'

const TYPE_NAME = {
  water: 'Water', thunder: 'Thunder', steel: 'Steel', earth: 'Earth', rock: 'Rock',
  fire: 'Fire', wind: 'Wind', grass: 'Grass', normal: 'Normal',
}
const KEYS = Object.keys(TYPE_NAME)
const BASE = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 }

// 1. 属性表：Showdown 的 damageTaken（0 普通 / 1 弱点 / 2 抵抗 / 3 免疫）
for (const def of KEYS) {
  const damageTaken = {}
  for (const atk of KEYS) {
    const mult = (TYPE_CHART[atk] || {})[def] ?? 1
    damageTaken[TYPE_NAME[atk]] = mult === 0 ? 3 : mult === 2 ? 1 : mult === 0.5 ? 2 : 0
  }
  Dex.data.TypeChart[def] = { damageTaken }
}

// 2. 每个属性一只标准种族（六维全 80，便于隔离公式）
for (const key of KEYS) {
  Dex.data.Pokedex[`gm${key}`] = {
    num: 0, name: `Gm${key}`, types: [TYPE_NAME[key]], baseStats: BASE,
    abilities: { 0: 'Pressure' }, heightm: 1, weightkg: 40, color: 'Gray', gen: 9,
  }
}

// 3. 技能：与 battle.js 的槽位定义一致（先制 45 / 主力 65 / 重击 95 / 终极 120）
const SLOTS = [
  { id: 's0', power: 45, category: 'Physical', acc: 100, pp: 25, priority: 1 },
  { id: 's1', power: 65, category: 'Special', acc: 95, pp: 20, priority: 0 },
  { id: 's2', power: 95, category: 'Physical', acc: 85, pp: 8, priority: 0 },
  { id: 's3', power: 120, category: 'Special', acc: 80, pp: 5, priority: 0 },
]
for (const key of KEYS) {
  for (const slot of SLOTS) {
    Dex.data.Moves[`${key}${slot.id}`] = {
      num: 0, name: `${key}${slot.id}`, type: TYPE_NAME[key], category: slot.category,
      basePower: slot.power, accuracy: slot.acc, pp: slot.pp, priority: slot.priority,
      flags: { protect: 1, mirror: 1 },
    }
  }
}

Dex.formats.extend([{
  name: '[Gen 9] GitMon Parity', mod: 'gen9', team: 'custom', gameType: 'singles', ruleset: [],
}])

// 4. 把 Showdown 的战斗单位转成我们引擎的输入
function unitOf(mon, key) {
  return {
    types: [key],
    stats: {
      atk: mon.storedStats.atk, def: mon.storedStats.def, spa: mon.storedStats.spa,
      spd: mon.storedStats.spd, spe: mon.storedStats.spe,
    },
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: null,
    passive: 'none',
  }
}

let samples = 0
let mismatches = 0
let checkPairs = 0

for (const atkKey of KEYS) {
  for (const defKey of KEYS) {
    const p1 = Teams.pack([{
      name: 'A', species: `gm${atkKey}`, ability: 'Pressure',
      moves: [`${atkKey}s1`], nature: 'Serious', evs: {}, ivs: {}, level: 50,
    }])
    const p2 = Teams.pack([{
      name: 'B', species: `gm${defKey}`, ability: 'Pressure',
      moves: [`${defKey}s1`], nature: 'Serious', evs: {}, ivs: {}, level: 50,
    }])

    const battle = new Battle({ formatid: 'gen9gitmonparity', seed: [1, 2, 3, 4] })
    battle.setPlayer('p1', { team: p1 })
    battle.setPlayer('p2', { team: p2 })

    const a = battle.p1.active[0]
    const b = battle.p2.active[0]
    const attacker = unitOf(a, atkKey)
    const defender = unitOf(b, defKey)
    const move = { type: atkKey, category: 'special', power: 65, acc: 95 }

    const lo = calcDamage(attacker, defender, move, () => 0).damage
    const hi = calcDamage(attacker, defender, move, () => 0.999999).damage

    const hpBefore = { p1: a.hp, p2: b.hp }
    for (let turn = 0; turn < 3; turn += 1) battle.makeChoices('move 1', 'move 1')

    for (const line of battle.log) {
      if (!line.startsWith('|-damage|')) continue
      const parts = line.split('|')
      // Showdown 会额外输出一行「百分比血量」(xx/100)，不是真实伤害，跳过
      if (String(parts[3]).trim().endsWith('/100')) continue
      // 击倒的那一下会被截到 0 HP，算不出真实伤害，跳过
      if (String(parts[3]).includes('fnt')) continue
      const slot = parts[2].startsWith('p1a') ? 'p1' : 'p2'
      const hp = Number(String(parts[3]).split('/')[0].split(' ')[0])
      const damage = hpBefore[slot] - hp
      if (!Number.isFinite(damage) || damage <= 0) continue
      // 被打的一方才是本次伤害的承受者：p2 受伤 = p1 出手
      if (slot !== 'p2') continue
      hpBefore[slot] = hp
      samples += 1
      const crit = damage >= Math.floor(lo * 1.4)
      const expectedLo = crit ? Math.floor(lo * 1.5) : lo
      const expectedHi = crit ? Math.floor(hi * 1.5) : hi
      if (damage < expectedLo - 1 || damage > expectedHi + 1) {
        mismatches += 1
        console.log(`  差异 ${atkKey}→${defKey}: Showdown ${damage} vs 我们 ${expectedLo}–${expectedHi}${crit ? '（会心）' : ''}`)
      }
    }
    checkPairs += 1
  }
}

// 5. 克制倍率逐格比对（9×9）
let effMismatch = 0
for (const atk of KEYS) {
  for (const def of KEYS) {
    const ours = effectiveness(atk, [def])
    const row = Dex.data.TypeChart[def].damageTaken
    const code = row[TYPE_NAME[atk]] ?? 0
    const theirs = code === 3 ? 0 : code === 1 ? 2 : code === 2 ? 0.5 : 1
    if (ours !== theirs) {
      effMismatch += 1
      console.log(`  克制差异 ${atk}→${def}: 我们 ${ours} / Showdown ${theirs}`)
    }
  }
}

console.log(`\n克制表：81 组全部比对，差异 ${effMismatch} 组`)
console.log(`伤害样本：${samples} 次（${checkPairs} 组属性对），超出官方区间的 ${mismatches} 次`)
console.log(effMismatch === 0 && mismatches === 0 ? '\n与 Showdown 完全一致。' : '\n存在差异，需要校准。')
process.exit(effMismatch === 0 && mismatches === 0 ? 0 : 1)
