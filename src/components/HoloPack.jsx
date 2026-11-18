import { useEffect, useRef, useState } from 'react'
import createHoloPack from '../holoPack/holoPack.js'
import { createHoloAudio } from '../holoPack/holoAudio.js'
import { petArtwork } from '../sprite.js'
import { elementLabel } from '../elementLabel.js'
import { cardFoil, isCloudCard } from '../cardTraits.js'
import '../holoPack/holoPack.css'

// 品质 → 全息卡的纸面档位
//   N / R   ：哑光纸面，摊开就亮着
//   SR / SSR：箔面，先背面朝上落位，再翻过来
const TIER = { N: 'common', R: 'rare', SR: 'ultra', SSR: 'ultra' }
const MARK = { N: '●', R: '◆', SR: '★', SSR: '✦' }
// 卡包外观取这一包里最好的品质：品质决定卡包外观，SSR 那包金光闪闪
const QUALITY_COLOR = { N: '#9e9e9e', R: '#42a5f5', SR: '#ab47bc', SSR: '#ffb300' }
const QUALITY_RANK = { N: 1, R: 2, SR: 3, SSR: 4 }

// 把立绘画成 dataURL，供卡面 <img> 使用
async function portraitDataUrl(pet) {
  const { image, pixelated } = await petArtwork(pet)
  if (!image) return { url: '', smooth: true }
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    return { url: image.toDataURL('image/png'), smooth: !pixelated }
  }
  return { url: image.src, smooth: true }
}

// 一包 = 一叠卡：撕开 → 卡牌摊开 → 收下这一包
export default function HoloPack({ pets, muted, label, onSpread, onPick, onCollect, onBack }) {
  const hostRef = useRef(null)
  const engineRef = useRef(null)
  const audioRef = useRef(null)
  const [cards, setCards] = useState([])
  const [ready, setReady] = useState(false)
  const [spread, setSpread] = useState(false)

  // 立绘先解码好再交给引擎，卡牌出现的第一帧就有画面
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setSpread(false)
    Promise.all(pets.map(async (pet, i) => {
      const { url, smooth } = await portraitDataUrl(pet)
      const foil = cardFoil(pet)
      // effect 统一成 N / R / SR / SSR 四档，云端卡的不同稀有度名也归到这四档
      const key = foil.effect || 'N'
      return {
        key: `card-${i}`,
        name: pet.repo,
        type: elementLabel(pet),
        tier: TIER[key] || 'common',
        qKey: key,
        label: isCloudCard(pet) ? foil.label : pet.quality.name,
        mark: MARK[key] || '●',
        art: url,
        smooth,
        // 只有高品质才需要"翻开"这个动作
        flip: key === 'SR' || key === 'SSR',
        pet,
      }
    })).then((list) => {
      if (!cancelled) setCards(list)
    })
    return () => { cancelled = true }
  }, [pets])

  // 引擎起一次：撕口物理、彩虹流、彩纸、卡牌展开
  useEffect(() => {
    if (!cards.length || !hostRef.current) return
    const audio = createHoloAudio({ muted: Boolean(muted) })
    audioRef.current = audio
    const engine = createHoloPack(hostRef.current, {
      cards,
      audio,
      packColor: QUALITY_COLOR[bestKey(cards)] || '#2b3ff0',
      series: label,
      onReady: () => setReady(true),
      onSpread: () => { setSpread(true); onSpread?.(cards.map((c) => c.pet)) },
      onPick: (card) => onPick?.(card.pet),
    })
    engineRef.current = engine
    return () => {
      engine.destroy()
      audio.destroy()
      engineRef.current = null
      audioRef.current = null
    }
  }, [cards])

  // 静音开关同步到引擎自己的 AudioContext
  useEffect(() => {
    if (typeof muted !== 'boolean') return
    audioRef.current?.setMuted?.(muted)
    audioRef.current?.resume?.()
  }, [muted])

  // 浏览器要求手势之后才允许出声：点一下就把音频上下文唤醒
  useEffect(() => {
    const wake = () => { audioRef.current?.resume?.() }
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, wake, true)
    return () => {
      for (const type of ['pointerdown', 'keydown']) window.removeEventListener(type, wake, true)
    }
  }, [])

  const autoOpen = () => {
    audioRef.current?.resume?.()
    engineRef.current?.autoTear?.()
  }

  return (
    <div className="hp-stage">
      <div className="hp-host" ref={hostRef} />
      <div className="hp-hud">
        {!spread ? (
          <>
            <p className="hp-hud-text">{ready ? '按住卡包任意位置，沿任意方向拖动撕开' : '正在准备卡面立绘…'}</p>
            <button className="hp-hud-btn" onClick={autoOpen} disabled={!ready}>
              {ready ? '一键开包' : '准备中…'}
            </button>
          </>
        ) : (
          <>
            <p className="hp-hud-text">点一张卡查看它的档案</p>
            <div className="hp-hud-row">
              {onCollect && (
                <button className="hp-hud-btn" onClick={() => onCollect(cards.map((c) => c.pet))}>
                  {`收下这一包（${cards.length} 只）`}
                </button>
              )}
              {onBack && (
                <button className="hp-hud-ghost" onClick={onBack}>回卡箱</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// 这一包里最好的品质，决定卡包颜色
function bestKey(cards) {
  let best = 'N'
  for (const c of cards) {
    if ((QUALITY_RANK[c.qKey] || 0) > (QUALITY_RANK[best] || 0)) best = c.qKey
  }
  return best
}
