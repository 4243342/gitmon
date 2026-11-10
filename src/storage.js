// 本地图鉴存储（P1 登录前的持久化方案）
import { normalizePet } from './engine.js'

const KEY = 'gitmon:collection:v2'

export function loadCollection() {
  try {
    const raw = localStorage.getItem(KEY)
    // 读档即归一化：历史卡里残留的旧战力 / 归一化上限会被改写成与六维等级一致的值
    return raw ? JSON.parse(raw).map(normalizePet) : []
  } catch {
    return []
  }
}

export function saveCollection(list) {
  try {
    // 落盘前同样归一化：任何来源（同步覆盖、旧缓存）写进来的卡都保持战力与六维一致
    localStorage.setItem(KEY, JSON.stringify(list.map(normalizePet)))
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
  if (idx >= 0) next[idx] = normalizePet({ ...next[idx], ...pet })
  else next.push(normalizePet(pet))
  sortPets(next)
  saveCollection(next)
  return next
}
