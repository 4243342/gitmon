// 分享卡片导出（文档 §7.3）：1:1 复刻卡面（63:88），画布手绘全要素
// 与 PetCard / game-theme.css 同一套视觉：像素切角、星级段位、六边形宝石品质标、
// HP / 进化 / 根基条、六维雷达 + 分段条、技能剑牌、性格词条、品质五维、页脚
import { petArtwork } from './sprite.js'
import { sealData } from './modelSeal.js'
import { starRank } from './starBadge.jsx'
import { MAX_STAGE, nextStage, stageInfo, stageProgress } from './evolution.js'
import swordYellowUrl from './assets/kenney/tiles/sword-yellow.png'
import swordWhiteUrl from './assets/kenney/tiles/sword-white.png'

const S = 3 // 卡面 CSS 360×503 → 1080×1509
const CW = 360 * S
const CH = Math.round((360 * 88) / 63) * S // 1509

// ---------- 颜色工具 ----------
const hex2rgb = (h) => {
  const s = h.replace('#', '')
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => {
  const [r1, g1, b1] = hex2rgb(a)
  const [r2, g2, b2] = hex2rgb(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}
const rgba = (h, a) => {
  const [r, g, b] = hex2rgb(h)
  return `rgba(${r},${g},${b},${a})`
}

const GRADE_COLOR = { S: '#ffd166', A: '#7ee787', B: '#79c0ff', C: '#b1a4c9', D: '#77839b' }
const FOUNDATION_FILL = {
  solid: ['#3ecf94', '#b8ffe2'],
  fair: ['#6aa9ff', '#bcd8ff'],
  loose: ['#ffb84d', '#ffe0a3'],
  unstable: ['#ff5d5d', '#ffb0b0'],
  unknown: ['#33405c', '#4a5878'],
}
const FOUNDATION_TEXT = { solid: '#6ee7b7', fair: '#8ec2ff', loose: '#ffc978', unstable: '#ff9a9a', unknown: '#6b7793' }
// 与 starBadge.jsx 同步的缩放表：N 个并排时单个图标缩放
const FIT = [1, 1, 0.94, 0.86, 0.78, 0.72, 0.66, 0.61, 0.57, 0.53]
const STAR_PATH = 'M16 2.4l4.2 8.7 9.4 1.3-6.8 6.6 1.7 9.4L16 23.8l-8.5 4.6 1.7-9.4-6.8-6.6 9.4-1.3z'

const AR = "'Press Start 2P', monospace" // 字母 / 数字
const PX = "'FusionPixel', 'PingFang SC', sans-serif" // 中文

// ---------- 基础形状 ----------
function cardClip(ctx) {
  // 与 .pet-card 的 clip-path 同款像素切角
  const n1 = 14 * S, n2 = 7 * S
  const p = new Path2D()
  p.moveTo(0, n1); p.lineTo(n2, n1); p.lineTo(n2, n2); p.lineTo(n1, n2); p.lineTo(n1, 0)
  p.lineTo(CW - n1, 0); p.lineTo(CW - n1, n2); p.lineTo(CW - n2, n2); p.lineTo(CW - n2, n1); p.lineTo(CW, n1)
  p.lineTo(CW, CH - n1); p.lineTo(CW - n2, CH - n1); p.lineTo(CW - n2, CH - n2); p.lineTo(CW - n1, CH - n2); p.lineTo(CW - n1, CH)
  p.lineTo(n1, CH); p.lineTo(n1, CH - n2); p.lineTo(n2, CH - n2); p.lineTo(n2, CH - n1); p.lineTo(0, CH - n1)
  p.closePath()
  return p
}

function hexPath(ctx, x, y, w, h) {
  ctx.beginPath()
  ctx.moveTo(x + w * 0.5, y)
  ctx.lineTo(x + w, y + h * 0.25)
  ctx.lineTo(x + w, y + h * 0.75)
  ctx.lineTo(x + w * 0.5, y + h)
  ctx.lineTo(x, y + h * 0.75)
  ctx.lineTo(x, y + h * 0.25)
  ctx.closePath()
}

function segBar(ctx, x, y, w, h, ratio, fill) {
  // 分段像素条：底槽 + 填充 + 竖向暗缝（与 .hp-fill::after 等一致）
  ctx.fillStyle = '#0a1120'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,.05)'
  ctx.fillRect(x, y, w, 2)
  const fw = Math.max(0, Math.min(1, ratio)) * w
  if (fw > 0) {
    ctx.fillStyle = fill
    ctx.fillRect(x, y, fw, h)
    ctx.fillStyle = 'rgba(255,255,255,.26)'
    ctx.fillRect(x, y, fw, Math.max(2, h * 0.3))
  }
  ctx.fillStyle = 'rgba(6,10,19,.55)'
  for (let sx = x + 7 * S; sx < x + w; sx += 9 * S) ctx.fillRect(sx, y, 2 * S, h)
  ctx.strokeStyle = '#1d2740'
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
}

// ---------- 星级段位图标（与 starBadge.jsx 同款视觉） ----------
function drawStarIcon(ctx, x, y, size, kind) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 32, size / 32)
  const star = new Path2D(STAR_PATH)
  if (kind === 'star' || kind === 'rainbow') {
    const g = kind === 'star'
      ? (() => { const gg = ctx.createLinearGradient(0, 0, 0, 32); gg.addColorStop(0, '#fff7c2'); gg.addColorStop(.45, '#ffd23e'); gg.addColorStop(1, '#e07f08'); return gg })()
      : (() => { const gg = ctx.createLinearGradient(0, 0, 32, 32); ['#ff4d6d', '#ff9f43', '#ffe74c', '#6ee7b7', '#38bdf8', '#b78bff'].forEach((c, i) => gg.addColorStop(i / 5, c)); return gg })()
    ctx.fillStyle = g
    ctx.strokeStyle = kind === 'star' ? '#6e4200' : '#ffffff'
    ctx.lineWidth = kind === 'star' ? 1.6 : 1.4
    ctx.lineJoin = 'round'
    ctx.fill(star); ctx.stroke(star)
    if (kind === 'star') { ctx.fillStyle = 'rgba(255,251,230,.9)'; ctx.beginPath(); ctx.arc(12.6, 11.6, 1.7, 0, 7); ctx.fill() }
  } else if (kind === 'moon') {
    const g = ctx.createRadialGradient(10, 9, 1, 16, 16, 11)
    g.addColorStop(0, '#fdfbff'); g.addColorStop(.55, '#ccd8f4'); g.addColorStop(1, '#8aa0cf')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 11, 0, 7); ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath(); ctx.arc(22, 12.4, 9.6, 0, 7); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(96,116,168,.42)'
    ctx.beginPath(); ctx.arc(12.4, 17.6, 1.7, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.arc(16.8, 21.4, 1.2, 0, 7); ctx.fill()
  } else if (kind === 'earth') {
    const g = ctx.createRadialGradient(11, 9, 1, 16, 16, 11)
    g.addColorStop(0, '#8fd8ff'); g.addColorStop(.5, '#2f83e6'); g.addColorStop(1, '#0b3f8f')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 11, 0, 7); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.arc(16, 16, 11, 0, 7); ctx.clip()
    ctx.fillStyle = '#57c76a'
    ;['M6.5 13c2.2-2.6 4.6-2.2 6-.6 1.2 1.4 3.4 1 4.6 2.4 1 1.2-.4 2.6-2.6 2.8-2 .2-3.2 1.6-5.2 1.2-2.2-.4-3.8-2-2.8-5.8z',
      'M18.5 7.5c2.8-.6 5.6.8 6.4 3 .6 1.8-1 2.4-2.8 2-1.6-.4-2.6.8-4.2.2-1.8-.8-1.8-4.4.6-5.2z',
      'M13 22.5c2-.8 4.6-.2 5.6 1 1 1.2-.4 2.6-2.4 2.8-2 .2-4.6-1.6-3.2-3.8z'].forEach((d) => ctx.fill(new Path2D(d)))
    ctx.restore()
    ctx.strokeStyle = 'rgba(150,215,255,.55)'; ctx.lineWidth = 0.9
    ctx.beginPath(); ctx.arc(16, 16, 11, 0, 7); ctx.stroke()
  } else if (kind === 'sun' || kind === 'eclipse') {
    ctx.fillStyle = kind === 'sun' ? '#ffb02e' : '#ff8a3c'
    for (let i = 0; i < 12; i++) {
      ctx.save()
      ctx.translate(16, 16); ctx.rotate((i * 30 + (kind === 'eclipse' ? 15 : 0)) * Math.PI / 180); ctx.translate(-16, -16)
      ctx.globalAlpha = kind === 'sun' ? (i % 2 ? .75 : 1) : .8
      ctx.beginPath()
      if (kind === 'sun') { ctx.moveTo(14.6, 6.8); ctx.lineTo(17.4, 6.8); ctx.lineTo(16, 1.2) }
      else { ctx.moveTo(14.8, 5.2); ctx.lineTo(17.2, 5.2); ctx.lineTo(16, .6) }
      ctx.closePath(); ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
    if (kind === 'sun') {
      const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 8.6)
      g.addColorStop(0, '#fff9d0'); g.addColorStop(.55, '#ffc531'); g.addColorStop(1, '#ff8a00')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 8.6, 0, 7); ctx.fill()
      ctx.strokeStyle = 'rgba(255,214,120,.7)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(16, 16, 8.6, 0, 7); ctx.stroke()
    } else {
      const g = ctx.createLinearGradient(0, 0, 32, 32)
      g.addColorStop(0, '#ffe08a'); g.addColorStop(.5, '#ff7a29'); g.addColorStop(1, '#c9273c')
      ctx.strokeStyle = g; ctx.lineWidth = 2.6
      ctx.beginPath(); ctx.arc(16, 16, 11.4, 0, 7); ctx.stroke()
      ctx.fillStyle = '#0a0612'; ctx.beginPath(); ctx.arc(16, 16, 9.4, 0, 7); ctx.fill()
      ctx.strokeStyle = 'rgba(140,70,220,.4)'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(16, 16, 9.4, 0, 7); ctx.stroke()
    }
  } else if (kind === 'universe') {
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 12.4)
    g.addColorStop(0, '#3b1a6e'); g.addColorStop(.6, '#221048'); g.addColorStop(1, '#100528')
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 12.4, 0, 7); ctx.fill()
    const sw = ctx.createLinearGradient(0, 0, 32, 32)
    sw.addColorStop(0, '#8a5cff'); sw.addColorStop(1, '#ff6ec7')
    ctx.strokeStyle = sw; ctx.lineWidth = 2.4; ctx.lineCap = 'round'
    ;['M16 16c3.6-4.2 9.4-3.4 9.6 1.4', 'M16 16c-3.6 4.2-9.4 3.4-9.6-1.4',
      'M16 16c2.4 2.8 1.4 7-2.4 8', 'M16 16c-2.4-2.8-1.4-7 2.4-8'].forEach((d, i) => {
      ctx.globalAlpha = i > 1 ? .75 : 1
      ctx.stroke(new Path2D(d))
    })
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(16, 16, 2.2, 0, 7); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ;[[22.4, 10.2, .9], [9.6, 21.8, .9], [24.6, 20.4, .7], [7.8, 12, .7], [18.4, 23.6, .6], [12.6, 8.4, .6]].forEach(([cx, cy, r], i) => {
      ctx.globalAlpha = i > 1 ? .75 : 1
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill()
    })
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function drawStarBadge(ctx, pet, right, top, baseSize) {
  const rank = starRank(pet.stars)
  if (!rank) return 0
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.6)'
  ctx.shadowBlur = 3 * S
  ctx.shadowOffsetY = 1.5 * S
  if (rank.key === 'supreme') {
    // 至高：金箔文字招牌
    ctx.font = `900 ${13 * S}px ${PX}`
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    const g = ctx.createLinearGradient(right - 76 * S, 0, right, 0)
    ;['#a06a12', '#ffe27a', '#fffbe0', '#ffc63d', '#fff3b0', '#b87d16'].forEach((c, i) => g.addColorStop(i / 5, c))
    ctx.fillStyle = g
    ctx.fillText('至高', right, top + 13 * S)
    ctx.restore()
    return 76 * S
  }
  if (rank.key === 'star') {
    const pips = Math.min(rank.pips, 9)
    const pip = baseSize * (pips <= 5 ? 0.42 : 0.34)
    let x = right
    for (let i = pips - 1; i >= 0; i--) {
      drawStarIcon(ctx, x - pip, top + (13 * S - pip) / 2 + 2 * S, pip, 'star')
      x -= pip + 2 * S
    }
    ctx.restore()
    return right - x + pip
  }
  const n = Math.max(1, Math.min(rank.mult, 9))
  const size = Math.max(12 * S, baseSize * FIT[n])
  let x = right
  for (let i = n - 1; i >= 0; i--) {
    drawStarIcon(ctx, x - size, top + (13 * S - size) / 2 + 2 * S, size, rank.key)
    x -= size + 2 * S
  }
  ctx.restore()
  return right - x + size
}

// ---------- 六边形宝石品质标 ----------
function drawQualityGem(ctx, q, x, y, w, h) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.5)'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 2 * S
  ctx.shadowOffsetY = 3 * S
  // 外圈金属棱边：#fff 4% → q-color 34% → 深 100%
  hexPath(ctx, x, y, w, h)
  const edge = ctx.createLinearGradient(0, y, 0, y + h)
  edge.addColorStop(0, '#ffffff'); edge.addColorStop(.04, '#ffffff')
  edge.addColorStop(.34, q.color); edge.addColorStop(1, mix(q.color, '#05070d', .55))
  ctx.fillStyle = edge
  ctx.fill()
  ctx.shadowColor = 'transparent'
  // 内里：切面 + 受光 + 品质色内晕 + 内凹
  const inset = 2.5 * S
  hexPath(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2)
  ctx.save(); ctx.clip()
  ctx.fillStyle = '#131a2e'; ctx.fillRect(x, y, w, h)
  const facet = ctx.createConicGradient(210 * Math.PI / 180, x + w * 0.5, y + h * 0.44)
  facet.addColorStop(0, 'rgba(255,255,255,.11)'); facet.addColorStop(.24, 'rgba(255,255,255,0)')
  facet.addColorStop(.5, 'rgba(255,255,255,.07)'); facet.addColorStop(.74, 'rgba(0,0,0,.2)')
  facet.addColorStop(1, 'rgba(255,255,255,.11)')
  ctx.fillStyle = facet; ctx.fillRect(x, y, w, h)
  const topLit = ctx.createLinearGradient(0, y, 0, y + h * 0.52)
  topLit.addColorStop(0, 'rgba(255,255,255,.18)'); topLit.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = topLit; ctx.fillRect(x, y, w, h * 0.52)
  const tint = ctx.createRadialGradient(x + w / 2, y + h * 0.28, 2, x + w / 2, y + h * 0.28, w * 0.6)
  tint.addColorStop(0, rgba(q.color, .26)); tint.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = tint; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x, y + h * 0.82, w, h * 0.18)
  ctx.restore()
  // 字母：纵向渐变 + 浮雕投影；SSR 走金箔
  const key = q.key
  const fs = key.length === 1 ? 19 * S : key.length === 2 ? 14 * S : 11.5 * S
  ctx.font = `${fs}px ${AR}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const cx = x + w / 2, cy = y + h / 2 + 1 * S
  let fill
  if (key === 'SSR') {
    fill = ctx.createLinearGradient(cx - fs * 2.2, 0, cx + fs * 2.2, 0)
    ;['#a06a12', '#ffe27a', '#fffbe0', '#ffc63d', '#fff3b0', '#b87d16', '#ffe27a'].forEach((c, i) => fill.addColorStop(i / 6, c))
  } else if (key === 'N') {
    fill = ctx.createLinearGradient(0, cy - fs, 0, cy + fs)
    fill.addColorStop(0, '#f4f7ff'); fill.addColorStop(.48, '#c6cddb'); fill.addColorStop(1, '#7d879e')
  } else {
    fill = ctx.createLinearGradient(0, cy - fs, 0, cy + fs)
    fill.addColorStop(0, mix(q.color, '#ffffff', .42)); fill.addColorStop(.52, q.color); fill.addColorStop(1, mix(q.color, '#05070d', .58))
  }
  ctx.fillStyle = 'rgba(0,0,0,.8)'
  ctx.fillText(key, cx, cy + fs * 0.14)
  ctx.fillStyle = fill
  ctx.fillText(key, cx, cy)
  ctx.restore()
}

// ---------- 模型全息钢印（AI 推测卡专属） ----------
// 参考 holographic foil 做法：conic-gradient 彩虹底 + 斜向高光带 + color-dodge 反光。
// 导出是静态 PNG，所以用画布把「某一帧反光」烘进去，并与 DOM 版 .model-seal 同构图。
const FOIL = ['#FF61D2', '#FE9090', '#FFD076', '#9DFFB0', '#67CFFF', '#B78BFF', '#FF61D2']

function fitFont(ctx, text, maxW, px, minPx, family) {
  let size = px
  while (size > minPx) {
    ctx.font = `${size}px ${family}`
    if (ctx.measureText(text).width <= maxW) return size
    size -= 0.5 * S
  }
  ctx.font = `${minPx}px ${family}`
  return minPx
}

// 模型给的技能描述长度不可控，按可用宽度截断，避免压到威力数字或溢出技能牌
function clipText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = String(text)
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

function glint(ctx, x, y, r, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(.28, 'rgba(255,255,255,.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * .22, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .22, y)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - r, y); ctx.lineTo(x, y - r * .22); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * .22)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawModelSeal(ctx, pet, cx, cy, R) {
  const { family, variant, provider, modelId } = sealData(pet)
  ctx.save()

  // 章体外阴影（不裁切时画）
  ctx.shadowColor = 'rgba(0,0,0,.62)'
  ctx.shadowBlur = 12 * S
  ctx.shadowOffsetY = 5 * S
  ctx.fillStyle = '#0a1222'
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill()
  ctx.shadowColor = 'transparent'

  // 全部内容裁进圆里
  ctx.beginPath(); ctx.arc(cx, cy, R - 0.5 * S, 0, 7); ctx.clip()

  // 1) 彩虹 foil 底：conic-gradient 的画布等价物
  const foil = ctx.createConicGradient(-45 * Math.PI / 180, cx, cy)
  FOIL.forEach((c, i) => foil.addColorStop(i / (FOIL.length - 1), c))
  ctx.fillStyle = foil
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2)

  // 2) 内芯：只把 foil 留成外圈，中间压暗以承载文字
  const innerR = R * 0.81
  const core = ctx.createRadialGradient(cx - innerR * .35, cy - innerR * .4, 2, cx, cy, innerR)
  core.addColorStop(0, '#2a3d60')
  core.addColorStop(.62, '#111c31')
  core.addColorStop(1, '#070d1a')
  ctx.fillStyle = core
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, 7); ctx.fill()

  // 3) 金属内外圈 + 证书虚线环
  ctx.strokeStyle = 'rgba(255,255,255,.62)'
  ctx.lineWidth = 1.6 * S
  ctx.beginPath(); ctx.arc(cx, cy, R - 1.5 * S, 0, 7); ctx.stroke()
  ctx.strokeStyle = 'rgba(6,10,20,.8)'
  ctx.lineWidth = 1.2 * S
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, 7); ctx.stroke()
  ctx.setLineDash([1.6 * S, 2.4 * S])
  ctx.strokeStyle = 'rgba(255,215,120,.32)'
  ctx.lineWidth = 1 * S
  ctx.beginPath(); ctx.arc(cx, cy, innerR - 1.6 * S, 0, 7); ctx.stroke()
  ctx.setLineDash([])

  // 4) 文字：标题保持水平，不沿弧逐字旋转（否则「测」等字会歪）
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const sealTitle = '✦ AI 推测 ✦'
  fitFont(ctx, sealTitle, R * 0.92, 5.2 * S, 3 * S, PX)
  ctx.fillStyle = '#ffd166'
  ctx.shadowColor = 'rgba(0,0,0,.8)'
  ctx.shadowBlur = 3 * S
  ctx.fillText(sealTitle, cx, cy - R * 0.62)
  ctx.shadowColor = 'transparent'

  fitFont(ctx, family, R * 1.42, 10.5 * S, 5.5 * S, AR)
  ctx.shadowColor = 'rgba(0,0,0,.9)'
  ctx.shadowOffsetY = 1.5 * S
  ctx.shadowBlur = 5 * S
  ctx.fillStyle = '#f6faff'
  ctx.fillText(family, cx, cy - R * 0.20)
  ctx.shadowColor = 'rgba(130,205,255,.85)'
  ctx.shadowBlur = 9 * S
  ctx.shadowOffsetY = 0
  ctx.fillText(family, cx, cy - R * 0.20)
  ctx.shadowColor = 'transparent'

  const variantGrad = ctx.createLinearGradient(cx - R * .5, 0, cx + R * .5, 0)
  FOIL.slice(0, 5).forEach((c, i) => variantGrad.addColorStop(i / 4, c))
  fitFont(ctx, variant, R * 1.35, 7.4 * S, 4.5 * S, AR)
  ctx.fillStyle = variantGrad
  ctx.fillText(variant, cx, cy + R * 0.10)

  fitFont(ctx, provider, R * 1.2, 5.8 * S, 4 * S, PX)
  ctx.fillStyle = '#9fd8ff'
  ctx.fillText(provider, cx, cy + R * 0.30)

  // 最底一行必须留在暗色内芯里，不能溢到彩虹外圈上
  fitFont(ctx, modelId, R * 0.94, 4 * S, 2.2 * S, AR)
  ctx.fillStyle = '#9badd0'
  ctx.fillText(modelId, cx, cy + R * 0.48)

  // 5) 斜向镭射反光带（screen 混合，模拟 foil 的镜面反射）
  ctx.globalCompositeOperation = 'screen'
  const sweep = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
  sweep.addColorStop(0, 'rgba(255,255,255,0)')
  sweep.addColorStop(.34, 'rgba(255,255,255,.04)')
  sweep.addColorStop(.47, 'rgba(255,255,255,.55)')
  sweep.addColorStop(.53, 'rgba(255,240,200,.32)')
  sweep.addColorStop(.62, 'rgba(160,220,255,.06)')
  sweep.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sweep
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2)

  // 6) 左上点状高光 + 一圈冷色反光
  const sheen = ctx.createRadialGradient(cx - R * .42, cy - R * .46, 1, cx, cy, R * 1.15)
  sheen.addColorStop(0, 'rgba(255,255,255,.42)')
  sheen.addColorStop(.32, 'rgba(180,225,255,.10)')
  sheen.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  ctx.globalCompositeOperation = 'source-over'

  // 7) 星芒
  glint(ctx, cx + R * .78, cy - R * .63, 4.2 * S, .95)
  glint(ctx, cx - R * .72, cy + R * .28, 2.8 * S, .7)
  glint(ctx, cx + R * .18, cy + R * .78, 2.2 * S, .55)
  ctx.restore()
}

// ---------- 主流程 ----------
export async function exportShareCard(pet) {
  await Promise.all([
    document.fonts.load(`16px 'Press Start 2P'`),
    document.fonts.load(`16px 'FusionPixel'`),
  ]).catch(() => {})
  await document.fonts.ready

  const q = pet.quality
  const c = document.createElement('canvas')
  c.width = CW; c.height = CH
  const ctx = c.getContext('2d')

  // 卡外阴影（切角轮廓外透出）
  const clip = cardClip(ctx)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.55)'
  ctx.shadowBlur = 30 * S
  ctx.shadowOffsetY = 12 * S
  ctx.fillStyle = '#0e1524'
  ctx.fill(clip)
  ctx.restore()

  ctx.save()
  ctx.clip(clip)

  // 底色：165deg #22304e → #131b2d 62% → #0e1524
  const bg = ctx.createLinearGradient(0, 0, CW * 0.42, CH)
  bg.addColorStop(0, '#22304e'); bg.addColorStop(.62, '#131b2d'); bg.addColorStop(1, '#0e1524')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CW, CH)

  // SSR / SR 全息条纹（静态帧）
  if (q.key === 'SSR' || q.key === 'SR') {
    ctx.save()
    ctx.globalAlpha = q.key === 'SSR' ? .8 : .55
    const stripes = ctx.createLinearGradient(0, 0, CW, CH)
    stripes.addColorStop(0, 'rgba(255,255,255,.05)'); stripes.addColorStop(.5, 'rgba(255,255,255,.02)'); stripes.addColorStop(1, 'rgba(255,255,255,.05)')
    ctx.fillStyle = stripes
    for (let x = -CH; x < CW; x += 9 * S) {
      ctx.save(); ctx.translate(x, 0); ctx.rotate(-18 * Math.PI / 180)
      ctx.fillRect(0, -CH, 2 * S, CH * 3); ctx.restore()
    }
    ctx.restore()
  }

  const PXD = 13 * S // 左右内边距
  const RIGHT = CW - PXD

  // ---------- 卡头 ----------
  const headTop = 12 * S
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f2f6ff'
  ctx.font = `700 ${15 * S}px ${PX}`
  ctx.fillText(pet.repo, PXD, headTop + 15 * S * 1.1)
  const subY = headTop + 15 * S * 1.25 + 10 * S
  ctx.font = `${10 * S}px ${PX}`
  ctx.fillStyle = '#8e9ab1'
  const dual = pet.elementSecondary ? `/${pet.elementSecondary.name}` : ''
  const sub = `${pet.element.name}系${dual} · ${pet.species.name} · ${stageInfo(pet.evolutionStage).name}`
  ctx.fillText(sub, PXD, subY)
  if (pet.aiEvaluated) {
    ctx.fillStyle = '#f5c542'
    ctx.fillText(' · AI 推测', PXD + ctx.measureText(sub).width, subY)
    ctx.fillStyle = '#8e9ab1'
  }
  if (pet.status === 'sleeping') {
    ctx.fillStyle = '#7f8ca5'
    ctx.fillText('沉睡', PXD + ctx.measureText(`${pet.element.name}系${dual} · ${pet.species.name} · ${stageInfo(pet.evolutionStage).name}`).width + 8 * S, subY)
  }

  // 星级段位（右上，品质标左侧）
  const gemW = 42 * S, gemH = 48 * S
  const gemX = RIGHT - gemW
  drawStarBadge(ctx, pet, gemX - 8 * S, headTop, 26 * S)
  drawQualityGem(ctx, q, gemX, headTop, gemW, gemH)

  // ---------- 立绘区 ----------
  const spX = PXD, spY = 66 * S, spW = RIGHT - PXD, spH = 127 * S
  const aura = ctx.createRadialGradient(spX + spW / 2, spY + spH * 0.62, 8, spX + spW / 2, spY + spH * 0.62, spW * 0.42)
  aura.addColorStop(0, rgba(q.color, .28))
  aura.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = aura
  ctx.fillRect(spX, spY, spW, spH)
  const frame = ctx.createRadialGradient(spX + spW / 2, spY + spH * 0.62, 10, spX + spW / 2, spY + spH * 0.62, spW * 0.7)
  frame.addColorStop(0, 'rgba(255,255,255,.07)'); frame.addColorStop(1, 'rgba(0,0,0,.42)')
  ctx.fillStyle = frame
  ctx.fillRect(spX, spY, spW, spH)
  ctx.strokeStyle = '#2a3550'; ctx.lineWidth = 3
  ctx.strokeRect(spX + 1.5, spY + 1.5, spW - 3, spH - 3)
  const { image: pic, pixelated } = await petArtwork(pet)
  const art = 132 * S
  ctx.imageSmoothingEnabled = !pixelated
  ctx.drawImage(pic, spX + (spW - art) / 2, spY + (spH - art) / 2, art, art)
  ctx.imageSmoothingEnabled = true

  // AI 推测卡：在立绘框右下角盖一枚模型专属全息钢印
  if (pet.aiEvaluated) {
    drawModelSeal(ctx, pet, RIGHT - 46 * S, spY + spH - 36 * S, 31 * S)
  }

  // ---------- Lv / HP ----------
  const rowY = 199 * S
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffcb05'
  ctx.font = `${9.5 * S}px ${AR}`
  ctx.fillText(`Lv.${pet.level}`, PXD, rowY + 5 * S)
  const lvW = ctx.measureText(`Lv.${pet.level}`).width
  const hpX = PXD + lvW + 7 * S
  const hpW = RIGHT - hpX - 62 * S
  const hpGrad = ctx.createLinearGradient(hpX, 0, hpX + hpW, 0)
  hpGrad.addColorStop(0, '#35c07d'); hpGrad.addColorStop(1, '#8cf0bf')
  segBar(ctx, hpX, rowY + 1 * S, hpW, 8 * S, (pet.maxHp || 0) / (pet.statCap || 100), hpGrad)
  ctx.fillStyle = '#8e9ab1'
  ctx.font = `${7.5 * S}px ${AR}`
  ctx.textAlign = 'right'
  ctx.fillText(`HP ${pet.maxHp}`, RIGHT, rowY + 5 * S)

  // ---------- 进化 / 根基 ----------
  const nextEvo = nextStage(pet.evolutionStage)
  const miniY1 = 215 * S, miniY2 = 240 * S
  ctx.font = `${8.5 * S}px ${PX}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#6d7893'
  ctx.fillText(`${pet.evolutionStage}/${MAX_STAGE}`, PXD, miniY1 + 2 * S)
  const evoX = PXD + 24 * S + 6 * S
  segBar(ctx, evoX, miniY1, RIGHT - evoX - 60 * S, 4 * S, stageProgress(pet.level) / 100, (() => {
    const g = ctx.createLinearGradient(evoX, 0, RIGHT, 0)
    g.addColorStop(0, q.color); g.addColorStop(1, '#fff6cc')
    return g
  })())
  ctx.fillStyle = '#6d7893'; ctx.textAlign = 'right'
  ctx.fillText(nextEvo ? `Lv.${nextEvo.min}` : '最终', RIGHT, miniY1 + 2 * S)

  const fTier = pet.foundationTier?.key || 'unknown'
  ctx.textAlign = 'left'; ctx.fillStyle = '#6d7893'
  ctx.fillText('根基', PXD, miniY2 + 2 * S)
  const [fc1, fc2] = FOUNDATION_FILL[fTier]
  const foX = PXD + 24 * S + 6 * S
  segBar(ctx, foX, miniY2, RIGHT - foX - 60 * S, 4 * S, (pet.foundation || 0) / 100, (() => {
    const g = ctx.createLinearGradient(foX, 0, RIGHT, 0)
    g.addColorStop(0, fc1); g.addColorStop(1, fc2)
    return g
  })())
  ctx.fillStyle = FOUNDATION_TEXT[fTier]; ctx.textAlign = 'right'
  ctx.fillText(pet.foundationTier?.name || '未评估', RIGHT, miniY2 + 2 * S)

  // ---------- 六维：雷达 + 分段条 ----------
  const bodyTop = 246 * S
  const radarSize = 120 * S
  const cap = pet.statCap || 100 // 与 DOM 一致：按本等级上限归一化，写死 /100 会把雷达撑爆
  drawRadar(ctx, pet, PXD + 2 * S, bodyTop, radarSize, cap)
  const listX = PXD + radarSize + 8 * S
  const listW = RIGHT - listX
  const rowH = 120 * S / 6
  pet.stats.forEach((s, i) => {
    const y = bodyTop + i * rowH + rowH / 2
    ctx.font = `${8.5 * S}px ${PX}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8e9ab1'
    ctx.fillText(s.name, listX, y)
    const bx = listX + 20 * S + 4 * S
    const bw = listW - 20 * S - 4 * S - 18 * S - 4 * S - 11 * S - 4 * S
    segBar(ctx, bx, y - 2 * S, bw, 4 * S, s.value / cap, pet.element.color)
    ctx.font = `${8 * S}px ${AR}`; ctx.textAlign = 'right'
    ctx.fillStyle = '#b9c5da'
    ctx.fillText(String(s.value), listX + listW - 11 * S - 8 * S, y)
    ctx.font = `800 ${7.5 * S}px ${AR}`; ctx.textAlign = 'center'
    ctx.fillStyle = GRADE_COLOR[s.grade] || '#77839b'
    ctx.fillText(s.grade, listX + listW - 4 * S, y)
  })

  // ---------- 技能 2×2（高级模式：名字 / 描述 / 威力 / 解锁等级均由模型按项目制定） ----------
  const skTop = 372 * S
  const colW = (RIGHT - PXD - 4 * S) / 2
  const chipH = 20 * S
  const [swordY, swordW] = await Promise.all([loadImg(swordYellowUrl), loadImg(swordWhiteUrl)])
  pet.skills.forEach((s, i) => {
    const col = i % 2, row = (i / 2) | 0
    const x = PXD + col * (colW + 4 * S)
    const y = skTop + row * (chipH + 4 * S)
    ctx.fillStyle = 'rgba(7,12,22,.9)'
    ctx.fillRect(x, y, colW, chipH)
    if (s.unlocked) {
      ctx.strokeStyle = '#2c3855'; ctx.lineWidth = 3; ctx.setLineDash([])
    } else {
      ctx.strokeStyle = '#2c3855'; ctx.lineWidth = 3; ctx.setLineDash([6 * S, 4 * S])
    }
    ctx.strokeRect(x + 1.5, y + 1.5, colW - 3, chipH - 3)
    ctx.setLineDash([])
    const img = s.unlocked ? swordY : swordW
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = s.unlocked ? 1 : .4
    ctx.drawImage(img, x + 6 * S, y + (chipH - 13 * S) / 2, 13 * S, 13 * S)
    ctx.globalAlpha = 1
    ctx.imageSmoothingEnabled = true

    const tx = x + 6 * S + 13 * S + 4 * S
    const hasPower = s.unlocked && typeof s.power === 'number'
    const textW = colW - (tx - x) - (hasPower ? 17 * S : 6 * S)
    ctx.textBaseline = 'middle'

    if (hasPower) {
      ctx.font = `${8 * S}px ${AR}`; ctx.textAlign = 'right'
      ctx.fillStyle = s.element?.color || '#ffd166'
      ctx.fillText(String(s.power), x + colW - 5 * S, y + chipH / 2)
    }

    ctx.textAlign = 'left'
    if (!s.unlocked) {
      ctx.font = `${9 * S}px ${PX}`
      ctx.fillStyle = '#59647e'
      ctx.fillText(`Lv.${s.unlockLevel}`, tx, y + chipH / 2)
      return
    }

    const name = String(s.name || '')
    const desc = String(s.desc || '')
    fitFont(ctx, name, textW, 8.5 * S, 5 * S, PX)
    ctx.fillStyle = '#f2f6ff'
    ctx.fillText(clipText(ctx, name, textW), tx, desc ? y + chipH * 0.36 : y + chipH / 2)
    if (desc) {
      fitFont(ctx, desc, textW, 5 * S, 3.2 * S, PX)
      ctx.fillStyle = '#8ea3c6'
      ctx.fillText(clipText(ctx, desc, textW), tx, y + chipH * 0.72)
    }
  })

  // ---------- 性格词条 ----------
  const trTop = 422 * S
  let tx = PXD
  const chips = pet.traits?.slice(0, 3) || []
  ctx.font = `${8.5 * S}px ${PX}`; ctx.textBaseline = 'middle'
  chips.forEach((t) => {
    const label = `${t.kind === 'negative' ? '▾' : '▴'} ${t.name}`
    const tw = ctx.measureText(label).width
    const pos = t.kind !== 'negative'
    const pad = 5 * S
    ctx.fillStyle = pos ? 'rgba(74,217,160,.08)' : 'rgba(255,93,93,.08)'
    ctx.fillRect(tx, trTop, tw + pad * 2, 15 * S)
    ctx.strokeStyle = pos ? 'rgba(74,217,160,.4)' : 'rgba(255,93,93,.45)'
    ctx.lineWidth = 2
    ctx.strokeRect(tx + 1, trTop + 1, tw + pad * 2 - 2, 15 * S - 2)
    ctx.fillStyle = pos ? '#7fe3b8' : '#ff9a9a'
    ctx.textAlign = 'left'
    ctx.fillText(label, tx + pad, trTop + 15 * S / 2)
    tx += tw + pad * 2 + 4 * S
  })
  const fixHint = pet.traitHints?.filter((h) => h.fix).length
  if (fixHint) {
    ctx.fillStyle = 'rgba(11,18,32,.7)'
    ctx.fillRect(tx, trTop, 13 * S, 13 * S + 1 * S)
    ctx.strokeStyle = 'rgba(255,203,5,.5)'; ctx.lineWidth = 2
    ctx.strokeRect(tx + 1, trTop + 1, 13 * S - 2, 13 * S - 1)
    ctx.fillStyle = '#ffcb05'; ctx.font = `${9 * S}px ${PX}`; ctx.textAlign = 'center'
    ctx.fillText('?', tx + 13 * S / 2, trTop + 7 * S)
  }

  // ---------- 品质五维 ----------
  const qdTop = 443 * S
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PXD, qdTop - 4 * S); ctx.lineTo(RIGHT, qdTop - 4 * S); ctx.stroke()
  const qdW = (RIGHT - PXD - 4 * 4 * S) / 5
  pet.qualityDims.forEach((d, i) => {
    const x = PXD + i * (qdW + 4 * S)
    ctx.fillStyle = '#0a1120'
    ctx.fillRect(x, qdTop, qdW, 3 * S)
    ctx.fillStyle = q.color
    ctx.fillRect(x, qdTop, qdW * (d.value / 100), 3 * S)
    ctx.fillStyle = 'rgba(6,10,19,.55)'
    for (let sx = x + 7 * S; sx < x + qdW; sx += 9 * S) ctx.fillRect(sx, qdTop, 2 * S, 3 * S)
    ctx.font = `${7 * S}px ${PX}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#6d7893'
    ctx.fillText(d.name, x + qdW / 2, qdTop + 3 * S + 9 * S)
  })

  // ---------- 页脚 ----------
  const footTop = 470 * S
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PXD, footTop - 4 * S); ctx.lineTo(RIGHT, footTop - 4 * S); ctx.stroke()
  ctx.font = `${7.5 * S}px ${PX}`; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#6d7893'
  ctx.textAlign = 'left'
  ctx.fillText(`品质 ${pet.qualityScore} · 工程量 ${pet.engineeringScore}`, PXD, footTop + 7 * S)
  ctx.textAlign = 'right'
  if (pet.aiEvaluated) {
    // 分享出去要能溯源：把实际使用的模型写在页脚，卡面另有全息钢印
    const modelText = `模型 ${pet.aiModel || '未标注'}${pet.aiProviderLabel ? ` · ${pet.aiProviderLabel}` : ''}`
    ctx.fillStyle = '#f5c542'
    fitFont(ctx, modelText, RIGHT - PXD - 150 * S, 7.5 * S, 5 * S, PX)
    ctx.fillText(modelText, RIGHT - 46 * S, footTop + 7 * S)
    ctx.fillStyle = '#6d7893'
    ctx.font = `${7.5 * S}px ${PX}`
    ctx.fillText(`★${pet.stars}`, RIGHT, footTop + 7 * S)
  } else {
    ctx.fillText(`${pet.platform === 'gitee' ? 'Gitee' : 'GitHub'} · ★${pet.stars}`, RIGHT, footTop + 7 * S)
  }

  // 品质描边（最后画，盖住边缘内容）
  ctx.strokeStyle = q.color
  ctx.lineWidth = 9 * S * 2 // 一半被裁掉，内侧剩 3px×S
  ctx.stroke(clip)
  ctx.restore()

  const link = document.createElement('a')
  link.download = `gitmon-${pet.repo}-${pet.quality.key}.png`
  link.href = c.toDataURL('image/png')
  link.click()
}

// ---------- 雷达图（与 RadarChart.jsx compact 同款，max 用等级上限） ----------
function drawRadar(ctx, pet, x, y, size, cap = 100) {
  const stats = pet.stats
  const pad = 14 * S
  const cx = x + size / 2, cy = y + size / 2, R = size / 2 - pad
  const N = stats.length
  const ang = (i) => (Math.PI * 2 * i) / N - Math.PI / 2
  const pt = (i, v) => {
    const r = (v / cap) * R
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))]
  }
  ctx.save()
  ctx.strokeStyle = 'rgba(74,88,120,.25)'; ctx.lineWidth = 2
  ;[0.33, 0.66, 1].forEach((f) => {
    ctx.beginPath()
    stats.forEach((_, i) => { const [px, py] = pt(i, f * cap); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) })
    ctx.closePath(); ctx.stroke()
  })
  ctx.strokeStyle = 'rgba(74,88,120,.2)'
  stats.forEach((_, i) => {
    const [px, py] = pt(i, cap)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke()
  })
  ctx.beginPath()
  stats.forEach((s, i) => { const [px, py] = pt(i, s.value); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) })
  ctx.closePath()
  ctx.fillStyle = rgba(pet.element.color, .35); ctx.fill()
  ctx.strokeStyle = pet.element.color; ctx.lineWidth = 4; ctx.stroke()
  const labelR = R + 2 * S
  ctx.font = `${7 * S}px ${PX}`; ctx.textBaseline = 'middle'
  stats.forEach((s, i) => {
    const [px, py] = pt(i, (labelR / R) * cap)
    const cos = Math.cos(ang(i))
    ctx.fillStyle = '#8e9ab1'
    ctx.textAlign = cos > 0.3 ? 'left' : cos < -0.3 ? 'right' : 'center'
    // 夹回雷达框内，避免压到右侧六维条
    const lx = Math.max(x + 2, Math.min(px, x + size - 2))
    ctx.fillText(s.name, lx, py)
  })
  ctx.restore()
}

function loadImg(src) {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res(img)
    img.src = src
  })
}
