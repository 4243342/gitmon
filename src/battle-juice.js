// 战斗手感增强层（juice）：用 GSAP（https://gsap.com，MIT / “no-charge” under Webflow,
// © GreenSock）做动态、按伤害强度缩放的镜头与精灵反馈。
//
// 与 vfx.js（pixelfx 粒子）的分工：
//   - vfx.js 负责「命中迸发的粒子」（火/水/雷/岩…按属性与威力选片，贴到被打精灵身上）
//   - 本模块负责「镜头震荡 / 击退 / 顿帧 / 命中闪白 / 暴击镜头推近」这类全局演出
// 两者都只动 DOM，不碰 React 状态机（battle.js 仍是唯一事实来源），互不抢占属性：
// 震荡改 .battle-field 的 x/y/rotation，击退改 .sprite-holder 的 x，闪白是独立覆盖层。
//
// 许可证见 THIRD-PARTY.md（GSAP）。
import { gsap } from 'gsap'

// ───────────────────────── 镜头震荡（trauma 模型） ─────────────────────────
// 借鉴《Game Feel》(Squirrel Eiserloh) 的 trauma 方案：trauma 累积、平方后驱动偏移、
// 随时间线性衰减，于是「连续命中 / 暴击」会越抖越凶，单发小伤只是轻颤。
let fieldEl = null
let trauma = 0
let shakeRaf = null
const TRAUMA_DECAY = 0.03 // 每帧衰减量（0–1）
const MAX_OFFSET = 20 // 像素，trauma=1 时的最大位移
const MAX_ROT = 1.6 // 度，trauma=1 时的最大旋转

function shakeLoop() {
  if (trauma <= 0.001 || !fieldEl) {
    if (fieldEl) gsap.set(fieldEl, { x: 0, y: 0, rotation: 0 })
    trauma = 0
    shakeRaf = null
    return
  }
  const s = trauma * trauma
  gsap.set(fieldEl, {
    x: (Math.random() * 2 - 1) * MAX_OFFSET * s,
    y: (Math.random() * 2 - 1) * MAX_OFFSET * s,
    rotation: (Math.random() * 2 - 1) * MAX_ROT * s,
  })
  trauma -= TRAUMA_DECAY
  shakeRaf = requestAnimationFrame(shakeLoop)
}

/** 给整个战场（.battle-field）加一次震荡。intensity 越大抖得越久越狠（0–1）。 */
export function shakeField(el, { intensity = 0.6 } = {}) {
  if (el) fieldEl = el
  if (!fieldEl) return
  trauma = Math.min(1, trauma + intensity)
  if (!shakeRaf) shakeRaf = requestAnimationFrame(shakeLoop)
}

/** 离开战场时立刻停抖并复位，避免 transform 残留到别的页面。 */
export function stopShake() {
  trauma = 0
  if (shakeRaf) {
    cancelAnimationFrame(shakeRaf)
    shakeRaf = null
  }
  if (fieldEl) gsap.set(fieldEl, { x: 0, y: 0, rotation: 0 })
}

// ───────────────────────── 击退（knockback） ─────────────────────────
// 打在 .sprite-holder 上（这个包裹层本身没有 CSS transform，所以不会和
// .sprite 的 float/hurt 动画、.sprite-slot 的 scaleX 翻转或冲刺冲突）。
// 总是向「远离场地中心」的方向弹（敌人被推向左、玩家被推向右），由 slot 的
// scaleX(-1) 自动镜像，所以两个方向用同一套 local x 即可。
export function knockback(holderEl, { power = 1 } = {}) {
  if (!holderEl) return
  const mag = 7 + 13 * Math.min(1.4, power)
  gsap.killTweensOf(holderEl)
  gsap.fromTo(
    holderEl,
    { x: 0 },
    {
      x: mag,
      duration: 0.08,
      ease: 'power3.out',
      yoyo: true,
      repeat: 1,
      onComplete: () => gsap.set(holderEl, { x: 0 }),
    },
  )
}

// ───────────────────────── 暴击：镜头推近 + 顿帧感 ─────────────────────────
// 在 .battle-field 上做一次性 scale 推近（与震荡的 x/y/rotation 是不同属性，
// GSAP 会合并到同一 transform 缓存，互不覆盖）。配合 shakeField 的高 trauma
// 与下方 hitStop 的延时，整体读起来就是「砸下去、画面一顿、再弹回」。
export function impactPunch(el, { scale = 1.05 } = {}) {
  if (!el) return
  gsap.fromTo(
    el,
    { scale },
    { scale: 1, duration: 0.26, ease: 'power2.out', transformOrigin: '50% 54%' },
  )
}

// ───────────────────────── 命中闪白（impact flash） ─────────────────────────
// 一层径向渐变覆盖在 vfx-layer 上，短促淡出。重击/暴击用强白，普通大伤用淡白。
export function impactFlash(layerEl, { strength = 0.5, color = 'rgba(255,255,255,1)' } = {}) {
  if (!layerEl) return
  const flash = document.createElement('div')
  flash.className = 'juice-flash'
  flash.style.background = `radial-gradient(circle at 50% 54%, ${color}, transparent 68%)`
  layerEl.appendChild(flash)
  gsap.fromTo(
    flash,
    { opacity: strength },
    { opacity: 0, duration: 0.22, ease: 'power2.out', onComplete: () => flash.remove() },
  )
}

// ───────────────────────── 伤害数字弹跳（damage pop） ─────────────────────────
// 替代纯 CSS 上浮：用 GSAP 做一个「砸出来→回弹」的缩放，命中更有打击感。
// 传入 damage-float 元素即可；没加载到 GSAP 时调用方回退到 CSS。
export function popDamage(el, { crit = false } = {}) {
  if (!el) return
  const peak = crit ? 1.5 : 1.28
  gsap.killTweensOf(el)
  gsap.fromTo(
    el,
    { scale: 0.4, opacity: 0, y: 6 },
    {
      scale: peak,
      opacity: 1,
      y: -4,
      duration: 0.16,
      ease: 'back.out(3)',
      onComplete: () => {
        gsap.to(el, { y: -30, opacity: 0, duration: 0.55, ease: 'power1.in' })
      },
    },
  )
}
