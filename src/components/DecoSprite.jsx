import { useEffect, useRef } from 'react'
import { drawSprite } from '../sprite.js'

// 装饰用漂浮精灵：任意种子，不进图鉴
export default function DecoSprite({ seed, colors, body = 'biped', size = 96, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      drawSprite(ref.current, { spriteSeed: seed, colors, body, stage: 2, blink: false })
    }
  }, [seed, colors, body])
  return <canvas ref={ref} width={256} height={256} className={`sprite hero-deco ${className}`} style={{ width: size, height: size }} />
}
