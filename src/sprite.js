// 种子确定性像素精灵 —— 部件拼装渲染基于 monstrjs（MIT，见 THIRD-PARTY.md）
// 64×64 网格 · 8 种手绘体型部件（眼/嘴/腮红/耳/尾/四肢/配饰/花纹）· 双属性配色 · 进化阶段加配饰
import { PRNG } from 'monstrjs/dist/core/prng.js'
import { applySymmetry } from 'monstrjs/dist/monster/grid.js'
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

// ---------- 卡包 / 卡面美术（供 pack-opener-js 使用） ----------
// 形象来源必须和 PixelSprite / 分享卡完全一致：
//   自定义上传 > 种族立绘素材 > seed 生成的像素精灵
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

// 等比铺进方框：立绘素材尺寸不一，不能像以前那样硬拉成 320×320
function drawContained(ctx, image, x, y, box) {
  const w = image.naturalWidth || image.width
  const h = image.naturalHeight || image.height
  if (!w || !h) return
  const s = Math.min(box / w, box / h)
  const dw = w * s
  const dh = h * s
  ctx.drawImage(image, x + (box - dw) / 2, y + (box - dh) / 2, dw, dh)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function packArtwork(pet) {
  const W = 600, H = 900
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const q = pet.quality

  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#1e2942')
  g.addColorStop(0.5, '#121a2c')
  g.addColorStop(1, '#0b1120')
  ctx.fillStyle = g
  roundRect(ctx, 0, 0, W, H, 36); ctx.fill()

  ctx.lineWidth = 10
  ctx.strokeStyle = q.color
  ctx.shadowColor = q.glow
  ctx.shadowBlur = 40
  roundRect(ctx, 10, 10, W - 20, H - 20, 30); ctx.stroke()
  ctx.shadowBlur = 0

  const foil = ctx.createLinearGradient(0, H, W, 0)
  foil.addColorStop(0, 'rgba(255,255,255,0)')
  foil.addColorStop(0.45, 'rgba(255,255,255,0.06)')
  foil.addColorStop(0.5, q.glow)
  foil.addColorStop(0.55, 'rgba(255,255,255,0.06)')
  foil.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = foil
  roundRect(ctx, 10, 10, W - 20, H - 20, 30); ctx.fill()

  ctx.save()
  ctx.translate(W / 2, H / 2 - 40)
  ctx.strokeStyle = q.color
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  ctx.globalAlpha = 1
  ctx.fillStyle = q.color
  ctx.font = 'bold 76px -apple-system, "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('GITMON', W / 2, H / 2 - 10)
  ctx.fillStyle = 'rgba(230,238,250,0.62)'
  ctx.font = '28px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText('仓 库 精 灵 卡 包', W / 2, H / 2 + 48)

  ctx.fillStyle = q.color
  ctx.font = 'bold 44px -apple-system, sans-serif'
  ctx.fillText(q.key, W / 2, H / 2 + 132)

  ctx.fillStyle = 'rgba(200,212,232,0.35)'
  ctx.font = '22px -apple-system, sans-serif'
  ctx.fillText(`${pet.platform.toUpperCase()} · ${pet.fullName}`, W / 2, H - 64)

  return c.toDataURL('image/png')
}

// 现在是异步的：立绘可能是一张还没解码的 PNG，必须等它就绪再交给开包库，
// 否则翻面那一帧会出现空白 / 上一张卡的形象。
export async function cardArtwork(pet) {
  const { image, pixelated } = await petArtwork(pet)
  const W = 600, H = 840
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')

  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#243252')
  g.addColorStop(1, '#111a2e')
  ctx.fillStyle = g
  roundRect(ctx, 0, 0, W, H, 40); ctx.fill()

  ctx.lineWidth = 10
  ctx.strokeStyle = pet.quality.color
  ctx.shadowColor = pet.quality.glow
  ctx.shadowBlur = 36
  roundRect(ctx, 10, 10, W - 20, H - 20, 34); ctx.stroke()
  ctx.shadowBlur = 0

  // 与正式卡片同一只角色：卡面立绘和 PetCard 的 sprite-frame 用同一个源
  const ART_BOX = 380
  const glow = ctx.createRadialGradient(W / 2, 280, 40, W / 2, 280, 230)
  glow.addColorStop(0, pet.quality.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect((W - ART_BOX) / 2 - 20, 76, ART_BOX + 40, ART_BOX + 40)

  ctx.imageSmoothingEnabled = !pixelated
  drawContained(ctx, image, (W - ART_BOX) / 2, 96, ART_BOX)

  ctx.fillStyle = '#eef2fa'
  ctx.font = 'bold 56px -apple-system, "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(pet.repo, W / 2, 520)

  ctx.fillStyle = 'rgba(190,204,226,0.75)'
  ctx.font = '28px -apple-system, "PingFang SC", sans-serif'
  const typeText = `${pet.element.name}系${pet.elementSecondary ? '/' + pet.elementSecondary.name : ''} · ${pet.species.name}`
  ctx.fillText(typeText, W / 2, 570)

  ctx.fillStyle = pet.quality.color
  ctx.font = 'bold 40px -apple-system, sans-serif'
  ctx.fillText(`Lv.${pet.level}   ${pet.quality.key}`, W / 2, 660)

  ctx.fillStyle = 'rgba(170,184,208,0.6)'
  ctx.font = '24px -apple-system, sans-serif'
  ctx.fillText(`品质分 ${pet.qualityScore} · 工程量 ${pet.engineeringScore}`, W / 2, 712)

  return c.toDataURL('image/png')
}
