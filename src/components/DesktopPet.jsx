import { useEffect, useRef, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import { useI18n } from '../i18n.js'
import '../deskpet.css'

// 页面内桌宠（spec: docs/superpowers/specs/2026-11-10-desktop-pet-design.md）
// A 档「站桩 + 待机」：常驻、呼吸浮动、随机冒泡、点击轻跳、可拖到任意位置（记忆位置）、可收起成小球。
// 行为手感参考 dsh-pet（MIT）overlay 思路，零新依赖；渲染与眨眼复用 PixelSprite。
// 数据（pet）由 App 从本地图鉴镜像解析后传入，本组件不读存储（位置 pos 由 App 传入并回写）。

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// 冒泡文案池：优先该宠自己的 AI 描述 / 词条（本地内容），否则用闲聊
function phrasePool(pet, t) {
  const own = []
  if (typeof pet.description === 'string' && pet.description.trim()) own.push(pet.description.trim())
  for (const tr of pet.traits || []) {
    const s = typeof tr === 'string' ? tr : (tr?.name || tr?.label || tr?.text || '')
    if (s) own.push(s)
  }
  const idle = [
    t('在看你的仓库…', 'Watching your repos…'),
    t('抽一只试试？', 'Try a draw?'),
    t('今天也要好好成长呀。', 'Grow well today, too.'),
  ]
  return own.length && Math.random() < 0.6 ? own : idle
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export default function DesktopPet({ pet, collapsed = false, onCollapse, pos = null, onPosChange }) {
  const { t } = useI18n()
  const [bubble, setBubble] = useState('')
  const [hop, setHop] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragPosLocal, setDragPosLocal] = useState(null) // 拖动中的瞬时位置
  const timers = useRef([])
  const dragRef = useRef(null)   // 本次拖动的起始快照
  const posRef = useRef(null)    // 拖动中的最新位置（pointerup 时回写）
  const movedRef = useRef(false) // 区分「点击」与「拖动」

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const say = (text) => {
    clearTimers()
    setBubble(text)
    timers.current.push(setTimeout(() => setBubble(''), 4500))
  }
  useEffect(() => clearTimers, [])

  // 待机：随机间隔冒一句泡（收起或没有宠时不冒）
  useEffect(() => {
    if (!pet || collapsed) return
    let alive = true
    let loop
    const tick = () => {
      if (!alive) return
      say(pick(phrasePool(pet, t)))
      loop = setTimeout(tick, 9000 + Math.random() * 12000)
    }
    loop = setTimeout(tick, 3000 + Math.random() * 5000)
    return () => { alive = false; clearTimeout(loop); clearTimers() }
  }, [pet, collapsed]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pet) return null

  if (collapsed) {
    return (
      <button
        type="button"
        className="deskpet-ball"
        style={{ background: `radial-gradient(circle at 34% 30%, rgba(255,255,255,.55), transparent 42%), ${pet.element?.color || '#ffcb05'}` }}
        onClick={() => onCollapse?.(false)}
        title={t('展开桌宠', 'Show desktop pet')}
        aria-label={t('展开桌宠', 'Show desktop pet')}
      />
    )
  }

  // —— 拖动：按住精灵身体拖到任意位置，松手记忆（存本地）——
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    const root = e.currentTarget.closest('.deskpet')
    const rect = root.getBoundingClientRect()
    dragRef.current = {
      sx: e.clientX, sy: e.clientY,
      base: { x: rect.left, y: rect.top },
      w: rect.width, h: rect.height,
    }
    posRef.current = { x: rect.left, y: rect.top }
    movedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!movedRef.current && Math.hypot(dx, dy) < 6) return // 死区：避免误触
    movedRef.current = true
    setDragging(true)
    posRef.current = {
      x: clamp(d.base.x + dx, 0, window.innerWidth - d.w),
      y: clamp(d.base.y + dy, 0, window.innerHeight - d.h),
    }
    setDragPosLocal(posRef.current)
  }
  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (movedRef.current) onPosChange?.(posRef.current)
    setDragging(false)
    // click 事件在 pointerup 之后同轮派发，先让 click 消费 moved 标记，再兜底复位
    setTimeout(() => { movedRef.current = false }, 0)
  }
  // 拖动结束后的 click 不算「点击互动」
  const effPos = dragPosLocal ?? pos
  const onClickPet = () => {
    if (movedRef.current) return
    setHop(false)
    // 强制重排让连续点击也能触发同一动画
    void document.body.offsetHeight
    setHop(true)
    setTimeout(() => setHop(false), 600)
    say(pick(phrasePool(pet, t)))
  }

  return (
    <div
      className={`deskpet${hop ? ' hop' : ''}${dragging ? ' dragging' : ''}`}
      style={effPos ? { left: effPos.x, top: effPos.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      {bubble && <div className="deskpet-bubble">{bubble}</div>}
      <button
        type="button"
        className="deskpet-close"
        onClick={() => onCollapse?.(true)}
        aria-label={t('收起桌宠', 'Minimize desktop pet')}
        title={t('收起', 'Minimize')}
      >✕</button>
      <button
        type="button"
        className="deskpet-body"
        onClick={onClickPet}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={`${pet.repo} · ${t('点击互动，按住可拖动', 'click to interact, hold to drag')}`}
        aria-label={t('桌宠（点击互动，按住拖动）', 'Desktop pet (click to interact, hold to drag)')}
      >
        <PixelSprite pet={pet} size={96} animate />
      </button>
    </div>
  )
}
