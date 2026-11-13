// 剧本包音频（可选素材）：src/story/packs/<包id>/audio/<文件名>
//
// 用法：
//   packs/douma/audio/opening.mp3    开章解说的成品配音
//
// ink 里用 # opening: opening.mp3 声明「这一屏是开章解说，播这个文件」。
// 界面拿到这个文件名后用 packAudioUrl(packId, file) 换成可播的地址。
//
// 为什么单独一个模块（而不是塞进 runtime.js）：
//   runtime.js 会被 scripts/story-selftest.mjs 用 Node 直接 import，
//   而 import.meta.glob 是 Vite 独有的编译期能力，在 Node 下会炸。
//
// 为什么按包隔离：
//   和立绘一样 —— 换包就该换声音。斗码苍穹的开章配音不该串到通用包里。
import.meta.glob('./packs/*/audio/*.{mp3,wav,ogg,m4a,aac,flac}', {
  eager: true,
  query: '?url',
  import: 'default',
})

// 包级音频表：packId → { 文件名(去扩展名) → url }
const PACK_AUDIO = {}

const FILES = import.meta.glob('./packs/*/audio/*.{mp3,wav,ogg,m4a,aac,flac}', {
  eager: true,
  query: '?url',
  import: 'default',
})

for (const [path, url] of Object.entries(FILES)) {
  const m = path.match(/packs\/([^/]+)\/audio\/([^/]+?)\.(?:mp3|wav|ogg|m4a|aac|flac)$/)
  if (!m) continue
  PACK_AUDIO[m[1]] = PACK_AUDIO[m[1]] || {}
  PACK_AUDIO[m[1]][m[2]] = url
}

/**
 * 取一个包内音频的地址。
 * @param {string} packId 剧本包 id
 * @param {string} file 音频文件名（带不带扩展名都行）
 * @returns {string|null}
 */
export function packAudioUrl(packId, file) {
  const bag = PACK_AUDIO[packId]
  if (!bag || !file) return null
  const stem = String(file).replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, '')
  return bag[stem] || null
}

/** 供工具脚本 / 调试面板查看覆盖情况 */
export function packAudioKeys() {
  const out = {}
  for (const [packId, bag] of Object.entries(PACK_AUDIO)) {
    out[packId] = Object.keys(bag)
  }
  return out
}
