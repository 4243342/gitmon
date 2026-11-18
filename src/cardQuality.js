// 卡片和卡包共用的六档品质。展示、排序、评分都使用真实 key；
// 旧存档中的 SSR 只作为 UR 的输入别名，不再是第七档。
export const QUALITY_KEYS = Object.freeze(['N', 'R', 'SR', 'UR', 'SE', 'PSE'])

const definitions = [
  ['N', '普卡', 0, '#a2a8b2', 'MiMo'],
  ['R', '稀有', 40, '#74b9ed', 'DeepSeek'],
  ['SR', '面闪', 60, '#c696ff', 'Grok'],
  ['UR', '金闪', 80, '#ffce65', 'Gemini'],
  ['SE', '银碎', 90, '#c6eafa', 'GPT'],
  ['PSE', '镜碎', 97, '#f2aaff', 'Claude Code'],
]

export const QUALITIES = Object.freeze(Object.fromEntries(definitions.map(([key, name, min, color, model]) => [
  key, Object.freeze({ key, name, label: `${key} ${name}`, min, color, glow: `${color}99`, model }),
])))

export const QUALITY_RANK = Object.freeze(Object.fromEntries(QUALITY_KEYS.map((key, index) => [key, index + 1])))

export function normalizeQualityKey(key) {
  const value = typeof key === 'string' ? key.trim().toUpperCase() : ''
  if (value === 'SSR') return 'UR'
  return QUALITY_KEYS.includes(value) ? value : 'N'
}

export function qualityForScore(score) {
  const number = Number(score)
  const value = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0
  const key = [...QUALITY_KEYS].reverse().find((candidate) => value >= QUALITIES[candidate].min)
  return QUALITIES[key]
}

export function highestQualityKey(keys = []) {
  let best = 'N'
  for (const value of keys) {
    const key = normalizeQualityKey(value)
    if (QUALITY_RANK[key] > QUALITY_RANK[best]) best = key
  }
  return best
}
