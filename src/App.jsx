import { useState } from 'react'
import { hatch } from './engine.js'
import PetCard from './components/PetCard.jsx'
import PixelSprite from './components/PixelSprite.jsx'
import './styles.css'

// 阶段：home → pack（卡包待开）→ reveal（精灵登场）→ detail
export default function App() {
  const [stage, setStage] = useState('home')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pet, setPet] = useState(null)
  const [tearing, setTearing] = useState(false)
  const [collection, setCollection] = useState([])

  const doHatch = () => {
    const result = hatch(url)
    if (!result) {
      setError('无法识别的地址，请输入 GitHub 或 Gitee 仓库链接')
      return
    }
    setError('')
    setPet(result)
    setStage('pack')
  }

  const openPack = () => {
    if (tearing) return
    setTearing(true)
    setTimeout(() => {
      setStage('reveal')
      setTearing(false)
      setCollection((c) => (c.some((p) => p.fullName === pet.fullName) ? c : [...c, pet]))
    }, 1200)
  }

  const reset = () => {
    setStage('home')
    setUrl('')
    setPet(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo" onClick={reset}>GitMon</h1>
        <span className="tagline">你的仓库，是一只活着的精灵</span>
      </header>

      {stage === 'home' && (
        <main className="home">
          <div className="hero-card">
            <h2>孵化你的仓库精灵</h2>
            <p>输入 GitHub / Gitee 仓库地址，扫描后将生成一个卡包——品种由技术栈决定，品质由代码质量决定，等级由工程量决定。</p>
            <div className="input-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doHatch()}
                placeholder="https://github.com/owner/repo 或 gitee.com/owner/repo"
                spellCheck={false}
              />
              <button onClick={doHatch}>孵化</button>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="examples">
              试试：
              <button onClick={() => setUrl('https://github.com/facebook/react')}>facebook/react</button>
              <button onClick={() => setUrl('https://gitee.com/mirrors/vue')}>mirrors/vue</button>
            </div>
          </div>

          {collection.length > 0 && (
            <section className="collection">
              <h3>我的图鉴（{collection.length}）</h3>
              <div className="collection-grid">
                {collection.map((p) => (
                  <div key={p.fullName} className="collection-item" onClick={() => { setPet(p); setStage('detail') }}>
                    <PixelSprite pet={p} size={64} animate={false} />
                    <span>{p.repo}</span>
                    <span className={`mini-q q-${p.quality.key}`}>{p.quality.key}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {stage === 'pack' && pet && (
        <main className="pack-stage">
          <p className="scan-info">
            扫描完成：{pet.platform === 'gitee' ? 'Gitee' : 'GitHub'} / {pet.fullName}
            <br />品质分 {pet.qualityScore} · 工程量分 {pet.engineeringScore}
          </p>
          <div
            className={`card-pack pack-${pet.quality.key} ${tearing ? 'tearing' : ''}`}
            style={{ '--q-color': pet.quality.color, '--q-glow': pet.quality.glow }}
            onClick={openPack}
          >
            <div className="pack-foil" />
            <div className="pack-title">GITMON</div>
            <div className="pack-sub">仓库精灵卡包</div>
            <div className="pack-hint">{tearing ? '开启中…' : '点击开包'}</div>
          </div>
          <button className="ghost-btn" onClick={reset}>换一个仓库</button>
        </main>
      )}

      {stage === 'reveal' && pet && (
        <main className="reveal-stage">
          <h2 className={`reveal-title quality-text-${pet.quality.key}`}>
            {pet.quality.name} · {pet.element.name}系{pet.species.name} 登场！
          </h2>
          <PetCard pet={pet} revealed />
          <button className="primary-btn" onClick={() => setStage('detail')}>查看详情</button>
        </main>
      )}

      {stage === 'detail' && pet && (
        <main className="detail-stage">
          <PetCard pet={pet} />
          <div className="detail-actions">
            <button className="ghost-btn" onClick={reset}>再孵一只</button>
          </div>
        </main>
      )}

      <footer className="footer">GitMon Prototype · 前端 Mock 引擎，后端接入后数据来自真实仓库</footer>
    </div>
  )
}
