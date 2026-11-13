import React from 'react'
import ReactDOM from 'react-dom/client'
import { ParticlesProvider } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import '@fontsource/press-start-2p/400.css'
import App from './App.jsx'
import { initCustomSprites } from './customSprite.js'

const initParticles = async (engine) => {
  await loadSlim(engine)
}

// 自定义形象缓存预热（IndexedDB → 内存），失败时静默走默认立绘
initCustomSprites()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ParticlesProvider init={initParticles}>
      <App />
    </ParticlesProvider>
  </React.StrictMode>,
)
