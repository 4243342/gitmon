// 剧本包特效（可选素材）：src/story/packs/<包id>/fx/<文件名>
//
// 用法：
//   packs/douma/fx/orb-cyan.gif    变身光团（脉动动画）
//   packs/douma/fx/orb.png         同一光团的静帧
//
// meta.json 里用 transforms 声明「哪一段过场用哪些素材」：
//   "transforms": { "awaken": { "orb": "orb-cyan.gif", "hero": "hero_early.png" } }
// ink 里用 # transform: awaken 声明「这一屏是过场」。
// 界面拿到过场键后用 packFxUrl(packId, file) 换成可播的地址。
//
// 为什么单独一个模块（而不是塞进 runtime.js）：
//   runtime.js 会被 scripts/story-selftest.mjs 用 Node 直接 import，
//   而 import.meta.glob 是 Vite 独有的编译期能力，在 Node 下会炸。
//
// 为什么单独一个目录（而不是并进 art/）：
//   art/ 是「角色立绘」，fx/ 是「过场特效」。两者的生命周期不同：
//   立绘按角色表按阶段取，过场特效按过场声明取。混在一起会让
//   「art/ 下没有孤儿文件」这条守卫失去意义。
import.meta.glob('./packs/*/fx/*.{gif,png,webp,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

// 包级特效表：packId → { 文件名(去扩展名) → url }
const PACK_FX = {}

for (const [path, url] of Object.entries(import.meta.glob('./packs/*/fx/*.{gif,png,webp,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}))) {
  const m = path.match(/packs\/([^/]+)\/fx\/([^/]+?)\.(?:gif|png|webp|jpg|jpeg|svg)$/)
  if (!m) continue
  PACK_FX[m[1]] = PACK_FX[m[1]] || {}
  PACK_FX[m[1]][m[2]] = url
}

/**
 * 取一个包内特效素材的地址。
 * @param {string} packId 剧本包 id
 * @param {string} file 文件名（带不带扩展名都行）
 * @returns {string|null}
 */
export function packFxUrl(packId, file) {
  const bag = PACK_FX[packId]
  if (!bag || !file) return null
  const stem = String(file).replace(/\.(gif|png|webp|jpg|jpeg|svg)$/i, '')
  return bag[stem] || null
}

/** 供工具脚本 / 调试面板查看覆盖情况 */
export function packFxKeys() {
  const out = {}
  for (const [packId, bag] of Object.entries(PACK_FX)) {
    out[packId] = Object.keys(bag)
  }
  return out
}
