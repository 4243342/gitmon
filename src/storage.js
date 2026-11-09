// 本地图鉴存储（P1 登录前的持久化方案）
const KEY = 'gitmon:collection:v2'

export function loadCollection() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCollection(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* ignore */ }
}

// 按品质→等级排序（quality 缺失时退化为按等级）
export function sortPets(list) {
  const rank = { SSR: 4, SR: 3, R: 2, N: 1 }
  list.sort((a, b) => (rank[b.quality?.key] - rank[a.quality?.key]) || (b.level - a.level))
  return list
}

export function upsertPet(list, pet) {
  const idx = list.findIndex((p) => p.fullName === pet.fullName && p.platform === pet.platform)
  const next = [...list]
  if (idx >= 0) next[idx] = { ...next[idx], ...pet }
  else next.push(pet)
  sortPets(next)
  saveCollection(next)
  return next
}
