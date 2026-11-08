// 种子确定性像素精灵生成器（Canvas 绘制，参考 pixel-sprite-monster-generator 思路的轻量版）
// 同一 spriteSeed + element + body 必得同一只精灵
import { makeRng } from './engine.js'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function shade([r, g, b], f) {
  return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`
}

export function drawSprite(canvas, { spriteSeed, color, body, stage }) {
  const S = 16 // 逻辑像素网格 16x16
  const P = canvas.width / S
  const ctx = canvas.getContext('2d')
  const rng = makeRng(spriteSeed)
  const rgb = hexToRgb(color)
  const bodyC = shade(rgb, 1.0)
  const darkC = shade(rgb, 0.62)
  const liteC = shade(rgb, 1.45)
  const eyeC = '#1a1a2e'

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false

  const grid = Array.from({ length: S }, () => Array(S).fill(null))
  const put = (x, y, c) => { if (x >= 0 && x < S && y >= 0 && y < S) grid[y][x] = c }

  // —— 身体轮廓（左右对称，按体型生成）——
  const half = Math.floor(S / 2)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < half; x++) {
      // 归一化到中心
      const nx = (half - x) / half
      const ny = Math.abs(y - S * 0.55) / (S * 0.5)
      let inside = false
      switch (body) {
        case 'slime':     inside = ny < 0.75 - nx * 0.35 && y > 2; break
        case 'biped':     inside = (ny < 0.62 - nx * 0.3 && y > 2) || (y > S - 4 && nx < 0.5); break
        case 'quadruped': inside = ny < 0.5 - nx * 0.2 && y > 3 && y < S - 3; break
        case 'winged':    inside = (ny < 0.55 - nx * 0.25 && y > 3) || (nx > 0.55 && ny < 0.45 && y > 1); break
        case 'golem':     inside = ny < 0.7 && y > 2 && nx < 0.85; break
        case 'spirit':    inside = ny < 0.6 - nx * 0.4 && y > 1; break
        default:          inside = ny < 0.6 - nx * 0.3
      }
      if (inside && rng() > 0.08) {
        const c = rng() < 0.12 ? darkC : rng() < 0.2 ? liteC : bodyC
        put(x, y, c); put(S - 1 - x, y, c)
      }
    }
  }

  // —— 眼睛 ——
  const ey = 5 + Math.floor(rng() * 3)
  const ex = half - 2 - Math.floor(rng() * 2)
  put(ex, ey, eyeC); put(S - 1 - ex, ey, eyeC)
  if (stage >= 2) { put(ex, ey + 1, eyeC); put(S - 1 - ex, ey + 1, eyeC) } // 成长体大眼

  // —— 装饰（按进化阶段叠加）——
  if (stage >= 2) { // 头顶角/冠
    put(half - 1, 1, liteC); put(half, 1, liteC)
    put(half - 1, 0, liteC); put(half, 0, liteC)
  }
  if (stage >= 3) { // 完全体：肩部护甲 + 底部光环
    for (let x = 1; x < 4; x++) { put(x, 4, liteC); put(S - 1 - x, 4, liteC) }
    for (let x = 3; x < S - 3; x++) if (x % 2 === 0) put(x, S - 1, liteC)
  }

  // —— 渲染 ——
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (grid[y][x]) {
        ctx.fillStyle = grid[y][x]
        ctx.fillRect(x * P, y * P, P, P)
      }
}
