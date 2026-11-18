export function elementLabel(pet) {
  if (pet.attributeStatus === 'pending') return '属性待识别'
  if (pet.attributeStatus === 'confirmed') return `${pet.element.name}属性`
  return `${pet.element.name}系`
}
