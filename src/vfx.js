// 攻击特效层：直接复用 pixelfx（patch-gg/pixelfx, MIT）的代码绘制像素特效。
// 它把每个特效写成一小段程序（粒子 + 光照缓冲 + 种子随机），没有图片素材，
// 所以能跟 GitMon 的种子像素精灵贴合，也不会给包体塞雪碧图。
// 这里只做三件事：按属性/威力选特效、把特效贴到被打的精灵身上、按需限时回收。
//
// 借鉴边界：特效绘制完全用 pixelfx 的实现（src/fx/**），本文件只负责选片与定位。
// 许可证见 THIRD-PARTY.md（MIT, Copyright (c) 2026 Patch）。

import { clearFrame, composite, createFx, createFrame } from 'pixelfx'

import * as fireball from 'pixelfx/fx/fire/fireball'
import * as flamethrower from 'pixelfx/fx/fire/flamethrower'
import * as fireTornado from 'pixelfx/fx/fire/fire-tornado'
import * as meteor from 'pixelfx/fx/fire/meteor'

import * as splash from 'pixelfx/fx/water/splash'
import * as waterOrb from 'pixelfx/fx/water/water-orb'
import * as waveCrash from 'pixelfx/fx/water/wave-crash'
import * as geyser from 'pixelfx/fx/water/geyser'

import * as zapHit from 'pixelfx/fx/lightning/zap-hit'
import * as sparkArc from 'pixelfx/fx/lightning/spark-arc'
import * as ballLightning from 'pixelfx/fx/lightning/ball-lightning'
import * as lightningStrike from 'pixelfx/fx/lightning/lightning-strike'

import * as parry from 'pixelfx/fx/impacts/parry'
import * as bulletImpact from 'pixelfx/fx/impacts/bullet-impact'
import * as critHit from 'pixelfx/fx/impacts/crit-hit'
import * as groundSlam from 'pixelfx/fx/impacts/ground-slam'
import * as hitSpark from 'pixelfx/fx/impacts/hit-spark'
import * as impactFrame from 'pixelfx/fx/impacts/impact-frame'
import * as bluntHit from 'pixelfx/fx/impacts/blunt-hit'

import * as earthSpike from 'pixelfx/fx/nature/earth-spike'
import * as quake from 'pixelfx/fx/nature/quake'
import * as boulder from 'pixelfx/fx/nature/boulder'
import * as tornado from 'pixelfx/fx/nature/tornado'
import * as thorns from 'pixelfx/fx/nature/thorns'
import * as sporeBurst from 'pixelfx/fx/nature/spore-burst'
import * as acidSplash from 'pixelfx/fx/nature/acid-splash'
import * as poisonCloud from 'pixelfx/fx/nature/poison-cloud'

import * as dirtExplosion from 'pixelfx/fx/explosions/dirt-explosion'
import * as smallExplosion from 'pixelfx/fx/explosions/small-explosion'
import * as bigExplosion from 'pixelfx/fx/explosions/big-explosion'
import * as implosion from 'pixelfx/fx/explosions/implosion'
import * as plasmaExplosion from 'pixelfx/fx/explosions/plasma-explosion'
import * as cartoonPow from 'pixelfx/fx/explosions/cartoon-pow'

import * as energyDisc from 'pixelfx/fx/projectiles/energy-disc'

// 近战系（physical 招式专用）：斩击 / 爪击 / 重锤 / 回旋，全部面向右，敌方出手时镜像
import * as swordSlash from 'pixelfx/fx/melee/sword-slash'
import * as clawSwipe from 'pixelfx/fx/melee/claw-swipe'
import * as doubleSlash from 'pixelfx/fx/melee/double-slash'
import * as hammerSmash from 'pixelfx/fx/melee/hammer-smash'
import * as heavyCleave from 'pixelfx/fx/melee/heavy-cleave'
import * as spinSlash from 'pixelfx/fx/melee/spin-slash'
import * as poof from 'pixelfx/fx/spawn/poof'
import * as spawnPortal from 'pixelfx/fx/spawn/spawn-portal'

// 每个属性四档：[轻击, 主力, 重击, 终极]。都是「在原点炸开」型特效，
// 所以可以直接贴到被打的精灵身上，不需要先算弹道。
const ELEMENT_FX = {
  fire: [fireball, flamethrower, fireTornado, meteor],
  water: [splash, waterOrb, waveCrash, geyser],
  thunder: [zapHit, sparkArc, ballLightning, lightningStrike],
  steel: [parry, bulletImpact, critHit, groundSlam],
  earth: [earthSpike, quake, groundSlam, dirtExplosion],
  rock: [boulder, dirtExplosion, smallExplosion, bigExplosion],
  wind: [energyDisc, tornado, implosion, plasmaExplosion],
  grass: [thorns, sporeBurst, acidSplash, poisonCloud],
  normal: [bluntHit, hitSpark, critHit, cartoonPow],
}

const FALLBACK = ELEMENT_FX.normal

// 物理招式四档：[先制, 主力, 重击, 终极] —— 挥砍类特效，出手方向由 flip 控制
const PHYSICAL_FX = [swordSlash, clawSwipe, heavyCleave, spinSlash]
// 重击/终极的可选替换（同档随机，避免连招重复感）
const PHYSICAL_FX_ALT = [doubleSlash, hammerSmash]

// 时长上限：战斗节奏不能被 5–7 秒的特效拖住，超出就加速播放
const TIERS = [
  { cap: 1.1, scale: 0.85 },
  { cap: 1.35, scale: 1 },
  { cap: 1.7, scale: 1.1 },
  { cap: 2.2, scale: 1.2 },
]

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function tierOf(power = 65) {
  if (power >= 105) return 3
  if (power >= 80) return 2
  if (power >= 55) return 1
  return 0
}

export function effectFor(element, power = 65, opts = {}) {
  const tier = tierOf(power)
  // physical 走近战挥砍系；seed 变化让同档两招轮换特效，减少重复感
  if (opts.physical) {
    if (tier >= 2 && opts.seed && Math.floor(opts.seed / 7) % 2 && PHYSICAL_FX_ALT[tier - 2] != null) {
      return PHYSICAL_FX_ALT[tier - 2]
    }
    return PHYSICAL_FX[tier] || PHYSICAL_FX[1]
  }
  const set = ELEMENT_FX[element] || FALLBACK
  return set[tier] || set[1]
}

const live = new WeakMap()

function track(container, wrap) {
  const set = live.get(container) || new Set()
  set.add(wrap)
  live.set(container, set)
}

function untrack(container, wrap) {
  live.get(container)?.delete(wrap)
}

/** 清掉某个容器上还在播的特效（换人、离开页面时调用） */
export function clearFx(container) {
  if (!container) return
  const set = live.get(container)
  if (set) {
    set.forEach((wrap) => wrap.remove())
    set.clear()
  }
  container.querySelectorAll('.vfx-fx').forEach((el) => el.remove())
}

/**
 * 在 targetEl 上播一个特效。
 * @param {HTMLElement} container 覆盖战场的定位容器（position: relative/absolute）
 * @param {HTMLElement} targetEl 被打的精灵槽位
 * @param {{ element?: string, power?: number, seed?: number, scale?: number }} opts
 */
export function playAttack(container, targetEl, opts = {}) {
  if (!container || !targetEl) return null
  const mod = effectFor(opts.element, opts.power ?? 65, opts)
  return playEffect(container, targetEl, mod, opts)
}

export function playEffect(container, targetEl, mod, opts = {}) {
  const meta = mod?.meta
  if (!meta || !meta.size) return null

  const [w, h] = meta.size
  const [ox, oy] = meta.origin || [w / 2, h * 0.75]
  const tier = TIERS[tierOf(opts.power ?? 65)]
  const rect = targetEl.getBoundingClientRect()
  const base = container.getBoundingClientRect()
  const cx = rect.left - base.left + rect.width / 2
  const cy = rect.top - base.top + rect.height * 0.62
  const scale = clamp((rect.width / 150) * (opts.scale ?? tier.scale), 0.55, 1.6)
  // 近战特效默认面向右（从左往右打）；敌方（右侧）出手时水平镜像
  const flip = !!opts.flip
  const oxUse = flip ? w - ox : ox

  const wrap = document.createElement('div')
  wrap.className = 'vfx-fx'
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.className = 'vfx-canvas'
  canvas.style.left = `${cx - oxUse * scale}px`
  canvas.style.top = `${cy - oy * scale}px`
  canvas.style.width = `${w * scale}px`
  canvas.style.height = `${h * scale}px`
  if (flip) canvas.style.transform = 'scaleX(-1)'

  wrap.appendChild(canvas)
  container.appendChild(wrap)
  track(container, wrap)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(w, h)
  const frame = createFrame(w, h)
  const fx = createFx(mod, { x: ox, y: oy, seed: opts.seed ?? 7, light: 1 })

  const cap = opts.cap ?? tier.cap
  // 长特效压缩播放，短特效原速（超过 2.4 倍速会糊成一片）
  const speed = clamp((meta.duration || cap) / cap, 1, 2.4)
  let t = 0
  let last = 0
  let stopped = false

  const finish = () => {
    if (stopped) return
    stopped = true
    untrack(container, wrap)
    wrap.classList.add('is-out')
    setTimeout(() => wrap.remove(), 200)
  }

  const tick = (now) => {
    if (stopped) return
    if (!canvas.isConnected) {
      stopped = true
      untrack(container, wrap)
      return
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    t += dt
    fx.update(dt * speed)
    clearFrame(frame)
    fx.draw(frame, 'back')
    fx.draw(frame, 'front')
    composite(frame, img.data, null)
    ctx.putImageData(img, 0, 0)
    if (t >= cap || fx.done()) {
      finish()
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return wrap
}

/** 精灵倒下：烟尘散开 */
export function playFaint(container, targetEl) {
  if (!container || !targetEl) return null
  return playEffect(container, targetEl, poof, { power: 40, cap: 0.9, scale: 0.95 })
}

/** 换上来的精灵：从传送门里升起 */
export function playSwitchIn(container, targetEl) {
  if (!container || !targetEl) return null
  return playEffect(container, targetEl, spawnPortal, { power: 40, cap: 0.9, scale: 0.8 })
}

/** 会心一击：整屏冲击帧，配合抖动 */
export function playCrit(container, targetEl) {
  if (!container || !targetEl) return null
  return playEffect(container, targetEl, impactFrame, { power: 120, cap: 0.34, scale: 1.2 })
}
