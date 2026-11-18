import { elementLabel } from './elementLabel.js'
import { QUALITIES, QUALITY_KEYS, normalizeQualityKey } from './cardQuality.js'

const NEUTRAL_COLOR = '#9e9e9e'
const REVEAL_EFFECT = { N: 'N', R: 'R', SR: 'SR', UR: 'SSR', SE: 'SSR', PSE: 'SSR' }

export function isCloudCard(pet) {
  return Boolean(pet?.repoId)
}

export function cardFoil(pet) {
  if (!isCloudCard(pet)) {
    const raw = typeof pet?.quality === 'string' ? pet.quality : pet?.quality?.key || pet?.qualityKey
    const key = normalizeQualityKey(raw)
    return { ...QUALITIES[key], effect: REVEAL_EFFECT[key] }
  }
  // 竞技场的只读投影不携带 rarity，但保留已归一的 quality/status。
  // 仅回读这种规范值；旧云卡的四档 quality 没有确认状态，不能冒充评级。
  const rarity = pet.rarity ?? (pet.quality?.status ? pet.quality : null)
  const color = /^#[0-9a-f]{6}$/i.test(rarity?.color) ? rarity.color : NEUTRAL_COLOR
  const rated = rarity?.status === 'confirmed' && QUALITY_KEYS.includes(rarity.key)
  if (rated) return { ...QUALITIES[rarity.key], effect: REVEAL_EFFECT[rarity.key], status: 'confirmed' }
  return {
    key: 'pending',
    label: rarity?.name || '待评估',
    name: rarity?.name || '待评估',
    color,
    glow: `${color}66`,
    effect: 'N',
    status: rarity?.status || 'pending',
  }
}

function scoreRange(low, high, cap) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return ''
  return low === high ? `${low}/${cap}` : `${low}–${high}/${cap}`
}

export function cloudCardTraits(pet) {
  const foil = cardFoil(pet)
  const rating = pet.qualityRating
  const attribute = pet.cardElement ?? pet.element
  const attributeName = attribute.key === pet.element.key ? elementLabel(pet) : `${attribute.name}属性`
  const score = scoreRange(rating?.scoreMin, rating?.scoreMax, 230)
  const source = scoreRange(rating?.sourceMin, rating?.sourceMax, 100)
  return [
    { key: 'attribute', label: '属性', value: attributeName, color: attribute.color, hint: attribute.trait },
    { key: 'rarity', label: '品质', value: foil.label, color: foil.color,
      hint: Number.isFinite(pet.rarity?.recognition) ? `社区认可值 ${pet.rarity.recognition}` : '' },
    { key: 'rating', label: '源码评分', value: source || (rating?.status === 'not_applicable' ? '不适用' : '待评估'), color: NEUTRAL_COLOR,
      hint: [score && `综合分 ${score}`, source && `源码分 ${source}`].filter(Boolean).join(' · ') },
  ]
}
