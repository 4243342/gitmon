import { elementLabel } from './elementLabel.js'

const NEUTRAL_COLOR = '#9e9e9e'
const REVEAL_EFFECT = { N: 'N', R: 'R', SR: 'SR', UR: 'SSR', SE: 'SSR', PSE: 'SSR' }

export function isCloudCard(pet) {
  return Boolean(pet?.repoId)
}

export function cardFoil(pet) {
  if (!isCloudCard(pet)) return { ...pet.quality, effect: pet.quality.key }
  const rarity = pet.rarity
  const color = /^#[0-9a-f]{6}$/i.test(rarity?.color) ? rarity.color : NEUTRAL_COLOR
  const rated = rarity?.status === 'confirmed'
  return {
    key: rated ? rarity.key : 'pending',
    label: rated ? `${rarity.key} ${rarity.name}` : rarity?.name || '待评估',
    name: rarity?.name || '待评估',
    color,
    glow: `${color}66`,
    effect: rated ? REVEAL_EFFECT[rarity.key] || 'N' : 'N',
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
    { key: 'rarity', label: '罕见度', value: foil.label, color: foil.color,
      hint: Number.isFinite(pet.rarity?.recognition) ? `社区认可值 ${pet.rarity.recognition}` : '' },
    { key: 'rating', label: '品质', value: rating?.name || '待评估', color: rating?.color || NEUTRAL_COLOR,
      hint: [score && `综合分 ${score}`, source && `源码分 ${source}`].filter(Boolean).join(' · ') },
  ]
}
