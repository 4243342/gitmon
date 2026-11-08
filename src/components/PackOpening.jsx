import { useEffect, useRef, useState } from 'react'
import { createPackOpener } from 'pack-opener-js'
import { packArtwork, cardArtwork } from '../sprite.js'
import { sfx } from '../sfx.js'
import RevealBurst from './RevealBurst.jsx'

// 品质 → 开包库的落档位（决定"落地"这一击有多重）
const BADGE = { SSR: 'Grail', SR: 'Epic', R: 'Rare' }

// 开包动画（pack-opener-js，文档 §10.1）：手指划开撕口 → 卡包盖飞出 → 卡牌带品质辉光翻面
//
// 音效分两层：
//  1. 开包库自带的礼成音轨（sound.enabled）—— 指尖下的铝箔、掀盖、抽卡风声、
//     落地一击，按场景事件逐拍触发，是真实采样的 mp3，比合成音更像"过场"。
//  2. 项目自己的芯片音（sfx）—— 只补库里没有的时刻：卡包浮现、开包页进场、
//     撤退、以及揭晓页的结算音。
export default function PackOpening({ pet, onReveal, muted }) {
  const stageRef = useRef(null)
  const openerRef = useRef(null)
  const mutedRef = useRef(muted ?? sfx.muted)
  const optionsRef = useRef(null)
  const doneRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [burst, setBurst] = useState(false)

  // 揭晓只走一次：库的 revealed 事件是唯一权威入口
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onReveal?.()
  }

  useEffect(() => {
    let cancelled = false
    const el = stageRef.current
    if (!el) return
    doneRef.current = false
    setBurst(false)

    ;(async () => {
      try {
        const pack = packArtwork(pet)
        const card = cardArtwork(pet)
        // 这套选项要留着：改静音时 setOptions 是整体替换，不能只传 sound 那一小块
        const options = {
          variant: 'slice',
          assets: { pack: { url: pack }, card: { url: card } },
          theme: { glow: pet.quality.color },
          // 礼成音轨：默认是关的，这里显式打开
          sound: {
            enabled: true,
            volume: 0.6,
            muted: mutedRef.current,
            badge: BADGE[pet.quality.key] || null,
          },
        }
        optionsRef.current = options
        const opener = await createPackOpener(
          el,
          options,
          {
            onEvent: (e) => {
              if (cancelled) return
              switch (e.type) {
                case 'ready':
                  setReady(true)
                  sfx.packIn()
                  break
                case 'interactionStart':
                  // 手指刚碰上封口，给一点点反馈，真正的撕膜声由库来放
                  sfx.tick()
                  break
                case 'retracted':
                  sfx.back()
                  break
                case 'revealed':
                  // 卡牌翻面露出的那一刻：粒子进发，稍等翻面收尾再切揭晓页
                  setBurst(true)
                  setTimeout(finish, 780)
                  break
                case 'error':
                  setFailed(true)
                  break
                default:
                  break
              }
            },
          },
        )
        if (cancelled) opener?.destroy?.()
        else openerRef.current = opener
      } catch (err) {
        console.error('[pack-opener]', err)
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      openerRef.current?.destroy?.()
    }
  }, [pet])

  // 静音开关要同步到库里那条音轨：它有自己的 AudioContext 和音量。
  // 注意 setOptions 是「整体替换」而不是合并，所以要把整套选项一起送回去，
  // 否则包图、辉光色、音量都会被重置成默认值。
  useEffect(() => {
    if (typeof muted !== 'boolean') return
    mutedRef.current = muted
    const base = optionsRef.current
    if (!base) return
    openerRef.current?.setOptions?.({ ...base, sound: { ...base.sound, muted } })
  }, [muted])

  // 点按钮时浏览器的音频上下文还睡在挂起状态（库只在画布 pointerdown 里唤醒它），
  // 所以先在自己的手势栈里补一次按下/抬起，让礼成音轨真的能被听见。
  const unlockAudio = () => {
    const canvas = stageRef.current?.querySelector('canvas')
    if (!canvas || typeof PointerEvent === 'undefined') return
    try {
      const rect = canvas.getBoundingClientRect()
      const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, pointerId: 1, button: 0, buttons: 1 }
      canvas.dispatchEvent(new PointerEvent('pointerdown', at))
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0 }))
    } catch { /* 拿不到坐标就算了，声音会静默降级 */ }
  }

  const autoOpen = () => {
    try {
      unlockAudio()
      openerRef.current?.autoSlice?.()
      // 不设固定跳转：整段撕膜→掀盖→抽卡→落地演完由 revealed 事件接管。
      // 只留一个兜底，防止演出意外卡死（正常情况下 finish 先触发，这里不会走到）
      setTimeout(() => { if (!doneRef.current) { sfx.rip(); finish() } }, 12000)
    } catch {
      sfx.rip()
      finish()
    }
  }

  const fallbackOpen = () => {
    sfx.rip()
    setTimeout(() => sfx.impact(), 220)
    onReveal?.()
  }

  return (
    <div className="pack-wrap" style={{ '--q-color': pet.quality.color, '--q-glow': pet.quality.glow }}>
      <div className="pack-meta">
        <span className={`quality-pill q-${pet.quality.key}`}>{pet.quality.key}</span>
        <span className="pack-meta-text">
          {pet.platform === 'gitee' ? 'Gitee' : 'GitHub'} · {pet.fullName}
        </span>
      </div>

      {!failed ? (
        <div className="pack-canvas-stage" ref={stageRef} />
      ) : (
        <div className="pack-fallback" onClick={fallbackOpen}>
          <div className="pack-fallback-inner">
            <div className="pf-title">GITMON</div>
            <div className="pf-sub">点击开包</div>
          </div>
        </div>
      )}

      <p className="pack-hint">
        拖动划过封口撕开卡包，或
        <span className="hint-arrow" />
      </p>
      <button className="primary-btn" onClick={autoOpen} disabled={!ready && !failed}>
        一键开包
      </button>

      {burst && <RevealBurst color={pet.quality.color} intensity={pet.quality.key === 'SSR' ? 1.6 : pet.quality.key === 'SR' ? 1.2 : 0.8} />}
    </div>
  )
}
