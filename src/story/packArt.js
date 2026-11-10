// 剧本包角色美术（可选素材）：src/story/packs/<包id>/art/<文件名>
//
// 两个槽位，可以是两张图，也可以是同一张：
//   art  舞台立绘：透明背景 PNG，建议 512×768，人物全身/半身，脚底留余量
//   face 头像：正方形 PNG，建议 256×256，人物面部居中，用于角色牌和说话人铭牌
//
// 命名约定（art/ 目录下的文件名）：
//   packs/douma/art/scout.png    药老的立绘
//   packs/douma/art/soul.png     魂殿的立绘
//   packs/douma/art/boss.png     云岚宗的立绘
//   packs/douma/art/pet.png      主角的立绘
// 头像另给一张就叫 scout_face.png，在 characters.json 里用 face 字段指过去。
// 没放素材时返回 null，界面自动回落到「色块 + 名字」的文字 chip。
//
// 为什么单独一个模块（而不是塞进 runtime.js）：
//   runtime.js 会被 scripts/story-selftest.mjs 用 Node 直接 import，
//   而 import.meta.glob 是 Vite 独有的编译期能力，在 Node 下会炸。
//   所以立绘索引独立成模块，只在 React 侧引用。
//
// 为什么按包隔离（而不是放进 src/assets/species）：
//   speciesArt 是「精灵种族立绘」，跟着种族/属性走；
//   这里是「剧本角色立绘」，跟着某一个剧本包走 —— 换包就该换人。
//   两者混在一起会串味：云岚宗和药老不该出现在通用包里。

// 立绘键归一化：文件名去掉扩展名。'scout.png' → 'scout'
function artKeyOf(path) {
  const m = path.match(/packs\/([^/]+)\/art\/([^/]+?)\.(?:png|webp|jpg|jpeg)$/)
  if (!m) return null
  return { packId: m[1], who: m[2] }
}

// import.meta.glob 的结果在模块初始化时就拿到了，这里直接建索引。
// （Vite 会把 glob 替换成静态对象，所以这里的 forEach 是构建期就跑的，
//   不是运行时扫描文件系统。）
const FILES = import.meta.glob('./packs/*/art/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

// 包级美术表：packId → { 文件名(去扩展名) → url }
const PACK_ART = {}

for (const [path, url] of Object.entries(FILES)) {
  const hit = artKeyOf(path)
  if (!hit) continue
  PACK_ART[hit.packId] = PACK_ART[hit.packId] || {}
  PACK_ART[hit.packId][hit.who] = url
}

/** 文件名去扩展名：'scout.png' → 'scout' */
function stem(file) {
  return String(file || '').replace(/\.(png|webp|jpg|jpeg)$/i, '')
}

/**
 * 取一个包内角色的立绘地址。
 * @param {string} packId 剧本包 id
 * @param {string} who 角色键（characters.json 里的键，如 scout / soul / boss）
 * @returns {string|null} 图片地址；没有素材时返回 null
 */
export function packArtUrl(packId, who) {
  const bag = PACK_ART[packId]
  if (!bag) return null
  return bag[who] || null
}

/**
 * 取头像地址。角色没单独给 face 时，退回用立绘裁（同一张图也能当头像用）。
 * @param {string} packId 剧本包 id
 * @param {string} who 角色键
 * @param {object} char characters.json 里这个角色的条目
 */
export function packFaceUrl(packId, who, char) {
  const bag = PACK_ART[packId]
  if (!bag) return null
  const face = char?.face ? bag[stem(char.face)] : null
  if (face) return face
  return bag[stem(char?.art)] || bag[who] || null
}

/** 这个包有没有任何立绘素材（给界面决定要不要画立绘层） */
export function packHasArt(packId) {
  return Boolean(PACK_ART[packId] && Object.keys(PACK_ART[packId]).length)
}

/** 供工具脚本 / 调试面板查看覆盖情况 */
export function packArtKeys() {
  const out = {}
  for (const [packId, bag] of Object.entries(PACK_ART)) {
    out[packId] = Object.keys(bag)
  }
  return out
}
