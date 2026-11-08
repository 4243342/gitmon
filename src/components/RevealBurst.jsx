import { useMemo } from 'react'
import Particles from '@tsparticles/react'

// 开包 / 品质登场粒子氛围（tsParticles v4，文档 §10.4）
// 插件的初始化在 main.jsx 的 ParticlesProvider 里完成
export default function RevealBurst({ color = '#ffb300', intensity = 1 }) {
  const options = useMemo(() => ({
    fullScreen: { enable: false },
    background: { color: 'transparent' },
    detectRetina: true,
    fpsLimit: 60,
    particles: {
      number: { value: Math.round(60 * intensity), density: { enable: true, width: 600, height: 600 } },
      color: { value: [color, '#ffffff', '#ffe9a8'] },
      shape: { type: ['square', 'circle'] },
      opacity: { value: { min: 0.35, max: 1 } },
      size: { value: { min: 2, max: 6 } },
      rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 25 } },
      move: {
        enable: true,
        speed: { min: 4, max: 10 },
        direction: 'none',
        outModes: { default: 'out' },
        gravity: { enable: true, acceleration: 7 },
      },
      wobble: { enable: true, distance: 4, speed: 18 },
    },
    emitters: {
      position: { x: 50, y: 52 },
      rate: { delay: 0.08, quantity: 14 },
      life: { duration: 0.55, count: 1 },
      size: { width: 40, height: 10 },
    },
  }), [color, intensity])

  return <Particles id={`burst-${color.replace('#', '')}-${intensity}`} options={options} className="burst-layer" />
}
