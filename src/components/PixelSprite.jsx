import { useEffect, useRef } from 'react'
import { drawSprite } from '../sprite.js'

export default function PixelSprite({ pet, size = 160, animate = true }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && pet) {
      drawSprite(ref.current, {
        spriteSeed: pet.spriteSeed,
        color: pet.element.color,
        body: pet.species.body,
        stage: pet.evolutionStage,
      })
    }
  }, [pet])
  return (
    <canvas
      ref={ref}
      width={128}
      height={128}
      className={animate ? 'sprite sprite-float' : 'sprite'}
      style={{ width: size, height: size }}
    />
  )
}
