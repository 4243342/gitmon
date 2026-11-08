import { useEffect, useState } from 'react'
import { scanRepo } from './scan.js'
import { judge } from './engine.js'
import { loadCollection, upsertPet } from './storage.js'
import { exportShareCard } from './share.js'
import PetCard from './components/PetCard.jsx'
import PackOpening from './components/PackOpening.jsx'
import Collection from './components/Collection.jsx'
import GrowPanel from './components/GrowPanel.jsx'
import './styles.css'

const STEPS = ['技术栈扫描', '工程量估算', '代码质量评估', '生成卡包']

export default function App() {
  const [view, setView] = useState('home') // home | scan | pack | reveal | detail
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pet, setPet] = useState(null)
  const [collection, setCollection] = useState([])
  const [step, setStep] = useState(0)

  useEffect(() => { setCollection(loadCollection()) }, [])

  const run = async () => {
    if (!url.trim()) { setError('请输入仓库地址'); return }
    setError('')
    setView('scan')
    setStep(0)

    try {
      const t1 = setTimeout(() => setStep(1), 350)
      const t2 = setTimeout(() => setStep(2), 900)
      const snap = await scanRepo(url)
      clearTimeout(t1); clearTimeout(t2)
      setStep(2)
      await new Promise((r) => setTimeout(r, 300))
      setStep(3)
      const judged = judge(snap)
      await new Promise((r) => setTimeout(r, 420))
      setPet(judged)
      setView('pack')
    } catch (e) {
      setError(e.message || '扫描失败，请检查仓库地址')
      setView('home')
    }
  }

  const afterReveal = () => setView('reveal')

  const goDetail = () => {
    if (pet) setCollection(upsertPet(loadCollection(), pet))
    setView('detail')
  }

  const reset = () => { setView('home'); setPet(null); setUrl('') }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={reset}>
          <span className="logo">GitMon</span>
          <span className="tagline">你的仓库，是一只活着的精灵</span>
        </div>
        <a className="gh-link" href="https://github.com/4243342/gitmon" target="_blank" rel="noreferrer">GitHub</a>
      </header>

      {view === 'home' && (
        <main className="home">
          <section className="hero">
            <h2>孵化你的仓库精灵</h2>
            <p>
              输入 GitHub / Gitee 仓库地址，扫描后生成一个卡包——
              <b>品种由技术栈决定</b>，<b>品质由代码质量决定</b>，<b>等级由工程量决定</b>。
            </p>
            <div className="input-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder="https://github.com/owner/repo　或　gitee.com/owner/repo"
                spellCheck={false}
              />
              <button onClick={run}>孵化</button>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="examples">
              <span>试试：</span>
              {[
                'https://github.com/facebook/react',
                'https://github.com/torvalds/linux',
                'https://github.com/simeydotme/pokemon-cards-css',
                'https://gitee.com/mirrors/vue',
              ].map((u) => (
                <button key={u} onClick={() => setUrl(u)}>
                  {u.replace('https://', '').replace('github.com/', 'gh/').replace('gitee.com/', 'gitee/')}
                </button>
              ))}
            </div>
          </section>

          <Collection list={collection} onPick={(p) => { setPet(p); setView('detail') }} />

          <section className="howto">
            <h3>怎么判定</h3>
            <div className="howto-grid">
              <div><b>品种</b><span>主语言 → 元素属性（Python 水系 / JS 雷系 / Rust 钢系…）× 项目类型 → 生态型（AI 龙型 / CLI 鸟型 / Web 兽型…）</span></div>
              <div><b>品质</b><span>测试 25% + 工程质量 20% + 文档 20% + 维护 20% + 社区 15% → N / R / SR / SSR</span></div>
              <div><b>等级</b><span>代码规模 + commit + 贡献者 + 活跃时长，对数归一化 → Lv.1–999</span></div>
            </div>
          </section>
        </main>
      )}

      {view === 'scan' && (
        <main className="scan">
          <h2>正在扫描仓库</h2>
          <p className="scan-url">{url}</p>
          <ul className="steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>
                <span className="dot" />
                {s}
                {i < step && <em>✓</em>}
              </li>
            ))}
          </ul>
        </main>
      )}

      {view === 'pack' && pet && (
        <main className="pack-stage">
          <PackOpening pet={pet} onReveal={afterReveal} />
        </main>
      )}

      {view === 'reveal' && pet && (
        <main className="reveal-stage">
          <h2 className={`reveal-title quality-text-${pet.quality.key}`}>
            {pet.quality.name} · {pet.element.name}系{pet.species.name} 登场
          </h2>
          <PetCard pet={pet} revealed />
          <div className="actions">
            <button className="primary-btn" onClick={goDetail}>收入图鉴</button>
            <button className="ghost-btn" onClick={reset}>再孵一只</button>
          </div>
        </main>
      )}

      {view === 'detail' && pet && (
        <main className="detail-stage">
          <PetCard pet={pet} />
          <div className="actions">
            <button className="primary-btn" onClick={() => exportShareCard(pet)}>导出分享卡</button>
            <button className="ghost-btn" onClick={reset}>再孵一只</button>
          </div>
          <GrowPanel
            pet={pet}
            onUpdate={(next) => { setPet(next); setCollection(upsertPet(loadCollection(), next)) }}
          />
          <Collection list={collection} onPick={(p) => setPet(p)} />
        </main>
      )}

      <footer className="footer">
        GitMon Prototype v0.2 · 数据来自 GitHub / Gitee 公开 API · 开包动画 pack-opener-js · 粒子 tsParticles
      </footer>
    </div>
  )
}
