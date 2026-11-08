import { useEffect, useRef, useState } from 'react'
import { createPackOpener } from 'pack-opener-js'
import { packArtwork, cardArtwork } from '../sprite.js'
import RevealBurst from './RevealBurst.jsx'

// 开包动画（pack-opener-js，文档 §10.1）：手指划开撕口 → 卡包盖飞出 → 卡牌带品质辉光翻面
export default function PackOpening({ pet, onReveal }) {
  const stageRef = useRef(null)
  const openerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [burst, setBurst] = useState(false)

  useEffect(() => {
    let cancelled = false
    const el = stageRef.current
    if (!el) return

    ;(async () => {
      try {
        const pack = packArtwork(pet)
        const card = cardArtwork(pet)
        const opener = await createPackOpener(
          el,
          {
            variant: 'slice',
            assets: { pack: { url: pack }, card: { url: card } },
            theme: { glow: pet.quality.color },
          },
          {
            onEvent: (e) => {
              if (cancelled) return
              if (e.type === 'ready') setReady(true)
              if (e.type === 'revealed') {
                setBurst(true)
                setTimeout(() => onReveal?.(), 850)
              }
              if (e.type === 'error') setFailed(true)
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

  const autoOpen = () => {
    try {
      openerRef.current?.autoSlice?.()
      setBurst(true)
      setTimeout(() => onReveal?.(), 2600)
    } catch {
      onReveal?.()
    }
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
        <div className="pack-fallback" onClick={onReveal}>
          <div className="pack-fallback-inner">
            <div className="pf-title">GITMON</div>
            <div className="pf-sub">点击开包</div>
          </div>
        </div>
      )}

      <p className="pack-hint">拖动划过封口撕开卡包，或</p>
      <button className="primary-btn" onClick={autoOpen} disabled={!ready && !failed}>
        一键开包
      </button>

      {burst && <RevealBurst color={pet.quality.color} intensity={pet.qualityKey === 'SSR' ? 1.6 : pet.qualityKey === 'SR' ? 1.2 : 0.8} />}
    </div>
  )
}
