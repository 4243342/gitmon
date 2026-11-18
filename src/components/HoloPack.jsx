import { useEffect, useRef, useState } from 'react'
import createHoloPack from '../holoPack/holoPack.js'
import { createHoloAudio } from '../holoPack/holoAudio.js'
import { petArtwork } from '../sprite.js'
import { elementLabel } from '../elementLabel.js'
import { cardFoil } from '../cardTraits.js'
import { QUALITY_RANK } from '../cardQuality.js'
import { PACK_DESIGNS, packDesign } from '../packDesign.js'
import '../holoPack/holoPack.css'

// 品质 → 全息卡的纸面档位
//   N / R   ：哑光纸面，摊开就亮着
//   SR 及以上：箔面，先背面朝上落位，再翻过来；六档保留各自材质。
const TIER = { N: 'common', R: 'rare', SR: 'surface', UR: 'gold', SE: 'silver', PSE: 'prismatic' }

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
    setCards([])
    const cover = new Image()
    cover.src = packDesign(pets).art
    const coverReady = cover.decode().catch(() => {})
    const cardArt = Promise.all(pets.map(async (pet, i) => {
      const { url, smooth } = await portraitDataUrl(pet)
      const foil = cardFoil(pet)
      const key = foil.key === 'pending' ? 'N' : foil.key
      return {
        key: `card-${i}`,
        name: pet.repo,
        type: elementLabel(pet),
        tier: TIER[key] || 'common',
        qKey: key,
        label: foil.label,
        mark: PACK_DESIGNS[key]?.mark || '○',
        art: url,
        smooth,
        // 只有高品质才需要"翻开"这个动作
        flip: QUALITY_RANK[key] >= QUALITY_RANK.SR,
        pet,
      }
    }))
    Promise.all([cardArt, coverReady]).then(([list]) => {
      if (!cancelled) setCards(list)
    })
    return () => { cancelled = true }
  }, [pets])

  // 引擎起一次：撕口物理、彩虹流、彩纸、卡牌展开
  useEffect(() => {
    if (!cards.length || !hostRef.current) return
    const audio = createHoloAudio({ muted: Boolean(muted) })
    audioRef.current = audio
    const design = packDesign(cards.map((card) => card.pet))
    const engine = createHoloPack(hostRef.current, {
      cards,
      audio,
      packColor: design.color,
      packAccent: design.accent,
      packInk: design.ink,
      packArt: design.art,
      packModel: design.model,
      packKey: design.key,
      packName: design.unrated ? '待评估' : design.name,
      packMark: design.mark,
      packUnrated: design.unrated,
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
