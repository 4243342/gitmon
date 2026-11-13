import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { drawSprite } from '../sprite.js'
import { getCustomSprite, onCustomSprite } from '../customSprite.js'
import { speciesArtUrl } from '../speciesArt.js'

export default function PixelSprite({ pet, size = 180, animate = true }) {
  const ref = useRef(null)
  const [, bump] = useReducer((x) => x + 1, 0)
  const [blink, setBlink] = useState(false)
  const [pixelated, setPixelated] = useState(false)

  // 任何精灵换了自定义形象都刷新
  useEffect(() => onCustomSprite(bump), [])

  // must be layout effect: canvas 位图不会随 React 重渲染自动清空。
  // 用普通 useEffect 时，切换到另一只宠物会先画出一帧上一只的旧形象。
  useLayoutEffect(() => {
    if (ref.current && pet) {
      drawSprite(ref.current, {
        spriteSeed: pet.spriteSeed,
        colors: [pet.element.color, pet.elementSecondary?.color || pet.element.color],
        body: pet.species.body,
        stage: pet.evolutionStage,
        blink,
      })
    }
  }, [pet, blink])

  useEffect(() => {
    if (!animate) return
    let t
    const loop = () => {
      setBlink(true)
      t = setTimeout(() => {
        setBlink(false)
        t = setTimeout(loop, 2800 + Math.random() * 2200)
      }, 140)
    }
    t = setTimeout(loop, 2400)
    return () => clearTimeout(t)
  }, [animate])

  // 优先级：玩家上传的自定义形象 → 种族立绘素材 → seed 生成的像素精灵
  const custom = pet ? getCustomSprite(pet) : null
  const art = custom ? null : speciesArtUrl(pet)
  const src = custom || art
  if (src) {
    const cls = blink ? 'sprite sprite-blink' : animate ? 'sprite sprite-float' : 'sprite'
    return (
      <img
        key={src}
        src={src}
        alt=""
        draggable={false}
        decoding="sync"
        className={cls}
        style={{ width: size, height: size, imageRendering: pixelated ? 'pixelated' : 'auto' }}
        onLoad={(e) => {
          const img = e.currentTarget
          setPixelated(img.naturalWidth <= 64 && img.naturalHeight <= 64)
        }}
      />
    )
  }

  return (
    <canvas
      ref={ref}
      width={256}
      height={256}
      className={blink ? 'sprite sprite-blink' : animate ? 'sprite sprite-float' : 'sprite'}
      style={{ width: size, height: size }}
    />
  )
}
