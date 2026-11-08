// 种族立绘（可选素材）：src/assets/species/<种族>/<属性>.png
// 命名约定：
//   beast/thunder.png        兽型 · 雷，所有阶段通用
//   beast/thunder-s2.png     兽型 · 雷 · 初生体（Lv.10，可选，覆盖通用图）
//   beast/thunder-s7.png     兽型 · 雷 · 人形态（Lv.500）…… 一直到 -s9
// 没有放素材时返回 null，调用方自动回落到 seed 生成的像素精灵。
import { MAX_STAGE } from './evolution.js'

const FILES = import.meta.glob('./assets/species/**/*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const MAP = new Map()
for (const [path, url] of Object.entries(FILES)) {
  const m = path.match(/species\/([^/]+)\/([^/]+?)(?:-s([2-9]))?\.(?:png|webp)$/)
  if (!m) continue
  MAP.set(`${m[1]}:${m[2]}:${m[3] || '1'}`, url)
}

export function hasSpeciesArt() {
  return MAP.size > 0
}

export function speciesArtCount() {
  return MAP.size
}

// 阶段优先：命中当前阶级就用，否则逐级往下降，最后用通用底图
export function speciesArtUrl(pet) {
  if (!pet?.species?.key || !pet?.element?.key) return null
  const sp = pet.species.key
  const el = pet.element.key
  const stage = Math.max(1, Math.min(MAX_STAGE, Number(pet.evolutionStage) || 1))
  for (let s = stage; s >= 2; s -= 1) {
    const hit = MAP.get(`${sp}:${el}:${s}`)
    if (hit) return hit
  }
  return MAP.get(`${sp}:${el}:1`) || null
}

// 供工具脚本 / 调试面板查看覆盖情况
export function speciesArtKeys() {
  return [...MAP.keys()]
}
