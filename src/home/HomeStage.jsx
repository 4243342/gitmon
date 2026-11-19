import { useEffect, useRef, useState } from 'react'
import { petArtwork } from '../sprite.js'
import PixelSprite from '../components/PixelSprite.jsx'
import './homeStage.css'

// 还没收下任何卡片时，用一只默认精灵撑住中央舞台，避免首页只剩空基座。
const DEMO_PET = {
  spriteSeed: 20261119,
  element: { key: 'thunder', color: '#f5c542' },
  elementSecondary: { color: '#ffdf7e' },
  species: { key: 'biped', body: 'biped' },
  evolutionStage: 3,
  level: 1,
}

// 首页中央 L2D 舞台：three.js 在浏览器里可用时渲染全息基座 + 悬浮精灵，
// 不可用（老设备 / 关闭 WebGL）时退回 CSS 场景 + PixelSprite，页面功能不受影响。
export default function HomeStage({ pet, accent }) {
  const hostRef = useRef(null)
  const engineRef = useRef(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    let engine = null
    import('./homeStage.js').then(({ createHomeStage }) => {
      if (cancelled || !hostRef.current) return
      try {
        engine = createHomeStage(hostRef.current, { onUnavailable: () => setStatus('fallback') })
      } catch {
        setStatus('fallback')
        return
      }
      if (cancelled) { engine.dispose(); return }
      engineRef.current = engine
      setStatus('ready')
    }).catch(() => setStatus('fallback'))
    return () => {
      cancelled = true
      engine?.dispose()
      engineRef.current = null
    }
  }, [])

  // 舞台模块异步加载完成后再传入素材，避免首屏素材比 Three.js 更快加载时丢失首帧。
  useEffect(() => {
    if (status !== 'ready') return undefined
    let cancelled = false
    petArtwork(pet || DEMO_PET).then((art) => {
      if (!cancelled) engineRef.current?.setPet(art)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pet, status])

  useEffect(() => {
    if (status === 'ready') engineRef.current?.setAccent(accent)
  }, [accent, status])

  return (
    <div className={`home-stage is-${status}`} aria-hidden="true">
      <div className="home-stage-canvas" ref={hostRef} />
      {status === 'fallback' && (
        <div className="home-stage-fallback">
          {pet ? <PixelSprite pet={pet} size={240} /> : <span className="home-stage-orb" />}
        </div>
      )}
    </div>
  )
}
