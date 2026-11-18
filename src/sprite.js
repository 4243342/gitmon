// 种子确定性像素精灵 —— 部件拼装渲染基于 monstrjs（MIT，见 THIRD-PARTY.md）
// 64×64 网格 · 8 种手绘体型部件（眼/嘴/腮红/耳/尾/四肢/配饰/花纹）· 双属性配色 · 进化阶段加配饰
import { PRNG } from 'monstrjs/dist/core/prng.js'
import { applySymmetry } from 'monstrjs/dist/monster/grid.js'
import { cloudCardTraits, isCloudCard } from './cardTraits.js'
import {
  accessories as ACCESSORY_PARTS,
  cheeks as CHEEK_PARTS,
  composeMonster,
  eyebrows as BROW_PARTS,
  getBodyForType,
  monsterTypeConfigs,
  selectArms,
  selectEars,
  selectEyes,
  selectLegs,
  selectMouth,
  selectNose,
  selectTail,
} from 'monstrjs/dist/sprites/index.js'
import { MAX_STAGE } from './evolution.js'
import { getCustomSprite } from './customSprite.js'
import { speciesArtUrl } from './speciesArt.js'

export const GRID = 64

// 游戏 6 种生态体型 → monstrjs 8 种怪物部件组
const BODY_TO_TYPE = {
  biped: 'bear',      // 兽型
  winged: 'birdie',   // 鸟型 / 飞行型
  slime: 'blob',      // 元素型
  quadruped: 'dino',  // 龙型
  golem: 'alien',     // 幻兽型
  spirit: 'bunny',    // 精灵型
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// 字符串种子也能稳定喂给 PRNG
function seedToUint(seed) {
  if (typeof seed === 'number') return (seed | 0) >>> 0
  let h = 2166136261
  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// 双属性 → 五色盘（主色 / 肚皮浅色 / 点缀 / 描边 / 高光）
function paletteFrom(colors) {
  const c1 = hexToRgb(colors[0])
  const c2 = colors[1] && colors[1] !== colors[0] ? hexToRgb(colors[1]) : null
  return {
    primary: colors[0],
    secondary: toHex(mix(c1, [255, 255, 255], 0.58)),
    accent: c2 ? colors[1] : toHex(mix(c1, [255, 255, 255], 0.22)),
    outline: toHex(mix(mix(c1, [0, 0, 0], 0.55), [26, 28, 42], 0.4)),
    highlight: '#FFFFFF',
  }
}

// 组装一只怪物：部件按种子抽取，进化阶段越高配饰 / 花纹越满（§7.1）
function composeGrid({ spriteSeed, colors, body, stage = 1 }) {
  const rng = new PRNG(seedToUint(spriteSeed))
  const type = BODY_TO_TYPE[body] || 'blob'
  const config = monsterTypeConfigs[type]

  const arms = selectArms(type, rng)
  const legs = selectLegs(type, rng)

  // 进化配饰：阶段 1 少量点缀，9 阶（人形态·神话）基本拉满
  const stageIdx = clamp(Math.round(stage) || 1, 1, MAX_STAGE)
  const t = (stageIdx - 1) / (MAX_STAGE - 1)
  const accChance = 0.2 + t * 0.7
  const accessories = config.accessories
    .filter(() => rng.next() < accChance)
    .map((name) => ACCESSORY_PARTS.find((a) => a.name === name && a.type !== 'pattern'))
    .filter(Boolean)
  const patterns = []
  if (stageIdx >= 2 && rng.next() < 0.2 + t * 0.5) {
    const pool = ACCESSORY_PARTS.filter((a) => a.type === 'pattern')
    if (pool.length) patterns.push(rng.pick(pool))
  }

  const grid = composeMonster({
    body: getBodyForType(type),
    bodyPosition: { x: GRID / 2, y: GRID / 2 + 2 },
    palette: paletteFrom(colors),
    features: {
      eyes: selectEyes(type, rng),
      mouth: selectMouth(type, rng),
      cheeks: rng.next() < 0.6 ? rng.pick(CHEEK_PARTS) : null,
      nose: selectNose(type, rng),
      eyebrows: rng.next() < 0.3 ? rng.pick(BROW_PARTS) : null,
      ears: selectEars(type, rng),
      tail: selectTail(type, rng),
      leftArm: arms.left,
      rightArm: arms.right,
      leftLeg: legs.left,
      rightLeg: legs.right,
      accessories: accessories.length ? accessories : null,
      patterns: patterns.length ? patterns : null,
    },
  })
  applySymmetry(grid)
  return grid
}

export function buildSpriteGrid(opts) {
  const grid = composeGrid(opts)
  const cell = new Map()
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x]
      if (c) cell.set(`${x},${y}`, [c.r, c.g, c.b])
    }
  }
  return cell
}

export function drawSprite(canvas, { spriteSeed, colors, body, stage }) {
  const ctx = canvas.getContext('2d')
  const P = canvas.width / GRID
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false

  const grid = composeGrid({ spriteSeed, colors, body, stage })
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x]
      if (!c) continue
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`
      ctx.fillRect(x * P, y * P, P, P)
    }
  }
}

export async function drawPetSprite(canvas, pet) {
  const spriteUrl = pet.cardSpriteUrl ?? pet.spriteUrl
  if (spriteUrl) {
    const image = new Image()
    image.src = spriteUrl
    await image.decode()
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return
  }
  drawSprite(canvas, {
    spriteSeed: pet.spriteSeed,
    colors: [pet.element.color, pet.elementSecondary?.color || pet.element.color],
    body: pet.species.body,
    stage: pet.evolutionStage,
  })
}

// ---------- 卡包 / 卡面美术（供 pack-opener-js 使用） ----------
// 形象来源必须和 PixelSprite / 分享卡完全一致：
//   自定义上传 > 云卡六系八档立绘（cardArt）> 种族立绘素材 > 云卡阶段立绘(spriteUrl) > seed 像素精灵
// 以前开包卡面写死用 seed 像素精灵，卡片却已换成新立绘，
// 抽出来的一瞬和揭晓后的卡片像两只不同角色（还像旧版形象）。
const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = url
})

// 返回可直接 drawImage 的图像 + 是否需要关闭平滑（像素精灵要保持锯齿）
export async function petArtwork(pet) {
  const custom = getCustomSprite(pet)
  if (custom) {
    try { return { image: await loadImage(custom), pixelated: false } } catch { /* 加载失败继续降级 */ }
  }
  // 云卡：cardArt 按原属性 × 品质指向素材；缺图时后端返回 null，退回仓库阶段立绘
  const cloudArt = pet.cardSpriteUrl ?? (isCloudCard(pet) ? pet.spriteUrl : null)
  if (cloudArt) {
    try { return { image: await loadImage(cloudArt), pixelated: false } } catch { /* 加载失败继续降级 */ }
  }
  const art = speciesArtUrl(pet)
  if (art) {
    try { return { image: await loadImage(art), pixelated: false } } catch { /* 加载失败继续降级 */ }
  }
  const c = document.createElement('canvas')
  c.width = 320; c.height = 320
  drawSprite(c, {
    spriteSeed: pet.spriteSeed,
    colors: [pet.element.color, pet.elementSecondary?.color || pet.element.color],
    body: pet.species.body,
    stage: pet.evolutionStage,
  })
  return { image: c, pixelated: true }
}

export function drawCloudCardTraits(ctx, pet, width, y, gap, fontSize) {
  ctx.textAlign = 'center'
  ctx.font = `bold ${fontSize}px -apple-system, "PingFang SC", sans-serif`
  cloudCardTraits(pet).forEach(({ label, value, color }, index) => {
    ctx.fillStyle = color
    ctx.fillText(`${label}  ${value}`, width / 2, y + gap * index)
  })
}

