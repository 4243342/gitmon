const DIFFICULTY_TEXT = {
  easy: '新手',
  normal: '旗鼓相当',
  hard: '强敌',
}

// 难度 = 对手六维的实打实倍率（在线对手不吃这套，按仓库真实实力打）
export const DIFFICULTY_FACTOR = { easy: 0.65, normal: 1, hard: 1.35 }

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))

// 战力总和：用来判断「这只对手大概几斤几两」
export function powerOf(pet) {
  return (pet?.stats || []).reduce((sum, s) => sum + (Number(s.value) || 0), 0)
}

// 按倍率缩放一只对手（等级同步缩放，界面上看到的强度就是实际强度）
export function scaleRival(pet, factor = 1) {
  const f = Number(factor) || 1
  if (f === 1) return { ...pet, scaled: 1 }
  return {
    ...pet,
    level: clampNum((Number(pet.level) || 1) * f, 1, 999),
    stats: (pet.stats || []).map((s) => ({ ...s, value: clampNum((Number(s.value) || 0) * f, 6, 150) })),
    scaled: f,
  }
}

// 同属性对手池：主属性相同的排前面，副属性相同的补在后面
export function sameTypePool(pool, elementKey) {
  if (!elementKey) return pool
  const primary = pool.filter((p) => p.element?.key === elementKey)
  const secondary = pool.filter((p) => p.element?.key !== elementKey && p.elementSecondary?.key === elementKey)
  return [...primary, ...secondary]
}

// 依据玩家队伍等级中位数，从池子里取「打得动、也打得疼」的几只
function drawNear(pool, playerTeam, count, seed) {
  if (!pool.length) return []
  const levels = playerTeam.map((p) => Number(p.level) || 1).sort((a, b) => a - b)
  const mid = levels.length ? levels[Math.floor(levels.length / 2)] : 200
  const sorted = [...pool].sort((a, b) => Math.abs(a.level - mid) - Math.abs(b.level - mid))

  const window = Math.min(sorted.length, Math.max(count + 2, count))
  const near = sorted.slice(0, window)
  const start = Math.abs(Math.floor(seed)) % near.length
  const picked = []
  for (let i = 0; i < Math.min(count, near.length); i++) picked.push(near[(start + i) % near.length])
  return picked
}

// 完全随机抽取
function drawRandom(pool, count, seed) {
  const arr = [...pool]
  let s = (Math.abs(Math.floor(seed)) || 1) >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}

function teamSize(playerTeam, cap = 3) {
  return Math.max(1, Math.min(cap, playerTeam.length || 1))
}

// 同类型对战：只找和你先发同属性的仓库，按难度缩放
export function pickSameTypeTeam(rivals, playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const lead = playerTeam[0]
  const key = lead?.element?.key
  const pool = sameTypePool(rivals, key)
  const picked = drawNear(pool, playerTeam, teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 随机宠物：全体随机，不看等级匹配
export function pickRandomTeam(rivals, playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const picked = drawRandom(rivals, teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 兼容旧调用：等同「随机宠物」但按等级贴近挑选
export function pickRivalTeam(rivals, playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const picked = drawNear(rivals, playerTeam, teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

const MODE_TEXT = { online: '在线对手', same: '同类型', random: '随机宠物' }

export function modeLabel(mode) {
  return MODE_TEXT[mode] || MODE_TEXT.random
}

export function rivalTeamLabel(difficulty, mode = 'random', onlineSize = 'single') {
  if (mode === 'online') return `${MODE_TEXT.online} · ${onlineSize === 'team' ? '整仓' : '单项目'}`
  return `${MODE_TEXT[mode] || MODE_TEXT.random} · ${DIFFICULTY_TEXT[difficulty] || DIFFICULTY_TEXT.normal}`
}
