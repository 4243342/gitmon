import { useEffect, useRef, useState } from 'react'
import { drawSprite } from '../sprite.js'

export default function PixelSprite({ pet, size = 180, animate = true }) {
  const ref = useRef(null)
  const [blink, setBlink] = useState(false)

  useEffect(() => {
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

  return (
    <canvas
      ref={ref}
      width={256}
      height={256}
      className={animate ? 'sprite sprite-float' : 'sprite'}
      style={{ width: size, height: size }}
    />
  )
}
