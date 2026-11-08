// 种子确定性像素精灵（参考 pixel-sprite-monster-generator 思路）
// 32×32 逻辑网格 · 7 种体型结构 · 描边 + 光影 + 双属性配色 + 进化装饰
import { makeRng } from './engine.js'

export const GRID = 32

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
const scale = (c, f) => [c[0] * f, c[1] * f, c[2] * f]

// ---------- 体型掩膜 ----------
function bodyMask(body, x, y) {
  const dx = x - 15.5

  switch (body) {
    case 'biped': {
      const head = Math.hypot(x - 16, y - 10) < 6.3
      const torso = x > 11 && x < 21 && y > 15 && y < 24
      const legs = y >= 24 && y < 28 && ((x > 11 && x < 15) || (x > 17 && x < 21))
      const arms = y > 16 && y < 22 && ((x > 6 && x < 11) || (x > 21 && x < 26))
      return head || torso || legs || arms
    }
    case 'quadruped': {
      const b = (dx * dx) / 90 + ((y - 18) * (y - 18)) / 34 < 1
      const head = Math.hypot(x - 7.5, y - 14) < 5.4
      const legs = y > 22 && y < 27 && [9, 13, 20, 24].some((lx) => Math.abs(x - lx) < 1.6)
      const tail = y > 12 && y < 18 && x > 25 && x < 29.5
      return b || head || legs || tail
    }
    case 'winged': {
      const b = (dx * dx) / 34 + ((y - 19) * (y - 19)) / 42 < 1
      const head = Math.hypot(x - 16, y - 10.5) < 4.8
      const wings = y > 10 && y < 21 && ((x > 3 && x < 12 + (y - 10) * 0.3) || (x < 29 && x > 20 - (y - 10) * 0.3))
      return b || head || wings
    }
    case 'slime': {
      if (y < 12 || y > 26) return false
      const h = 26 - y
      const halfW = Math.sqrt(Math.max(0, 100 - h * h * 0.9)) * 0.95 + 1
      return Math.abs(dx) < halfW
    }
    case 'golem': {
      const torso = Math.abs(dx) < 7.5 && y > 12 && y < 26
      const head = Math.abs(dx) < 4.6 && y > 5 && y < 12
      const arms = Math.abs(dx) > 7 && Math.abs(dx) < 11 && y > 14 && y < 22
      const legs = y >= 26 && y < 28.5 && Math.abs(dx) > 1.5 && Math.abs(dx) < 7
      return torso || head || arms || legs
    }
    case 'spirit': {
      if (y < 8 || y > 28) return false
      const t = (y - 8) / 20
      const halfW = 7.5 * Math.sqrt(Math.max(0, 1 - Math.pow(t * 1.4 - 0.35, 2))) + 2
      const wave = y > 24 ? Math.sin(x * 0.9 + y * 0.4) * 1.2 : 0
      return Math.abs(dx) < halfW + wave
    }
    default:
      return Math.hypot(dx, y - 15.5) < 8
  }
}

function eyeAnchors(body) {
  switch (body) {
    case 'quadruped': return [[6, 13], [10, 13]]
    case 'golem':     return [[14, 8], [18, 8]]
    case 'spirit':    return [[14, 14], [18, 14]]
    case 'slime':     return [[13, 18], [19, 18]]
    case 'winged':    return [[14, 10], [18, 10]]
    default:          return [[14, 10], [18, 10]]
  }
}

export function buildSpriteGrid({ spriteSeed, colors, body, stage, blink = false }) {
  const rng = makeRng(spriteSeed)
  const c1 = hexToRgb(colors[0])
  const c2 = hexToRgb(colors[1] || colors[0])

  const base = mix(c1, c2, 0.18 + rng() * 0.14)
  const light = scale(base, 1.28)
  const dark = scale(base, 0.66)
  const outline = scale(mix(base, [16, 18, 30], 0.72), 0.9)
  const accent = c2

  const filled = []
  const cell = new Map()
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (bodyMask(body, x, y)) filled.push([x, y])
    }
  }
  if (!filled.length) return cell

  const minY = Math.min(...filled.map((p) => p[1]))
  const maxY = Math.max(...filled.map((p) => p[1]))

  for (const [x, y] of filled) {
    const lightFactor = 1 - (x - 4) / 46 - (y - minY) / (2.4 * Math.max(1, maxY - minY))
    let color = lightFactor > 0.62 ? light : lightFactor < 0.38 ? dark : base
    // 腹部浅色
    if (body !== 'golem' && Math.abs(x - 16) < 4.5 && y > 17 && y < 24 && rng() > 0.25) {
      color = mix(color, [245, 240, 225], 0.55)
    }
    // 第二属性点缀
    if (rng() < 0.16 && y < 20) color = mix(color, accent, 0.5)
    cell.set(`${x},${y}`, color)
  }

  // 外描边
  for (const [x, y] of filled) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!cell.has(`${x + ox},${y + oy}`)) cell.set(`${x + ox},${y + oy}`, outline)
    }
  }

  // 眼睛
  for (const [ex, ey] of eyeAnchors(body)) {
    cell.set(`${ex},${ey}`, [26, 28, 42])
    cell.set(`${ex + 1},${ey}`, [26, 28, 42])
    if (!blink) {
      cell.set(`${ex},${ey - 1}`, [255, 255, 255])
      cell.set(`${ex},${ey + 1}`, [26, 28, 42])
    } else {
      cell.set(`${ex},${ey - 1}`, outline)
    }
  }

  // 进化装饰（§7.1）
  if (stage >= 2) {
    for (const hx of [13, 18]) {
      cell.set(`${hx},${minY - 2}`, accent)
      cell.set(`${hx},${minY - 3}`, scale(accent, 1.2))
    }
  }
  if (stage >= 3) {
    for (const [sx, sy] of [[8, minY + 12], [23, minY + 12], [7, minY + 13], [24, minY + 13]]) {
      cell.set(`${sx},${sy}`, scale(accent, 1.15))
    }
    for (let x = 9; x < 24; x += 2) cell.set(`${x},${maxY + 2}`, mix(accent, [255, 255, 255], 0.25))
  }

  return cell
}

export function drawSprite(canvas, { spriteSeed, colors, body, stage, blink = false }) {
  const ctx = canvas.getContext('2d')
  const P = canvas.width / GRID
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false

  const cell = buildSpriteGrid({ spriteSeed, colors, body, stage, blink })
  for (const [key, color] of cell) {
    const [x, y] = key.split(',').map(Number)
    ctx.fillStyle = rgb(color)
    ctx.fillRect(x * P, y * P, P, P)
  }
}

// ---------- 卡包 / 卡面美术（供 pack-opener-js 使用） ----------
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

export function cardArtwork(pet) {
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

  const spriteCanvas = document.createElement('canvas')
  spriteCanvas.width = 320; spriteCanvas.height = 320
  drawSprite(spriteCanvas, {
    spriteSeed: pet.spriteSeed,
    colors: [pet.element.color, pet.elementSecondary?.color || pet.element.color],
    body: pet.species.body,
    stage: pet.evolutionStage,
  })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(spriteCanvas, (W - 320) / 2, 120, 320, 320)

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
