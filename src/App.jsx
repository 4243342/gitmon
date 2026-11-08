import { useEffect, useRef, useState } from 'react'
import { scanRepo } from './scan.js'
import { expForLevel, judge } from './engine.js'
import { loadCollection, upsertPet } from './storage.js'
import { exportShareCard } from './share.js'
import { sfx } from './sfx.js'
import PetCard from './components/PetCard.jsx'
import PackOpening from './components/PackOpening.jsx'
import Collection from './components/Collection.jsx'
import GrowPanel from './components/GrowPanel.jsx'
import Battle from './components/Battle.jsx'
import DecoSprite from './components/DecoSprite.jsx'
import './styles.css'
import './game-theme.css'

const STEPS = ['连接仓库', '读取技术栈', '估算工程量', '评估代码质量']
const DIALOGS = [
  '连接仓库，读取档案...',
  '分析语言构成，判定元素属性...',
  '统计代码规模，估算工程量...',
  '检查测试 / CI / 文档，评估品质...',
  '卡包生成完毕！',
]

// 全局芯片音效总线：按钮点击/悬停自动发声
function useSfxBus() {
  useEffect(() => {
    let lastTick = 0
    const onClick = (e) => {
      const b = e.target.closest('button')
      if (b && !b.disabled) sfx.blip()
    }
    const onOver = (e) => {
      const b = e.target.closest('button')
      const now = performance.now()
      if (b && !b.disabled && now - lastTick > 90) {
        lastTick = now
        sfx.tick()
      }
    }
    document.addEventListener('click', onClick)
    document.addEventListener('pointerover', onOver)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('pointerover', onOver)
    }
  }, [])
}

// RPG 对话框打字机
function useTypewriter(lines, speed = 34) {
  const [text, setText] = useState('')
  const [line, setLine] = useState(0)
  useEffect(() => {
    if (line >= lines.length) return
    const cur = lines[line]
    if (text.length >= cur.length) {
      const t = setTimeout(() => { setLine((l) => l + 1); setText('') }, 650)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setText(cur.slice(0, text.length + 1)), speed)
    return () => clearTimeout(t)
  }, [text, line, lines, speed])
  return lines[Math.min(line, lines.length - 1)]?.slice(0, text.length) || ''
}

export default function App() {
  const [view, setView] = useState('home') // home | scan | pack | reveal | detail | battle
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pet, setPet] = useState(null)
  const [collection, setCollection] = useState([])
  const [step, setStep] = useState(0)
  const [battleInitial, setBattleInitial] = useState(null)
  const [muted, setMuted] = useState(sfx.muted)

  useSfxBus()
  const typed = useTypewriter(view === 'scan' ? DIALOGS : [])

  useEffect(() => { setCollection(loadCollection()) }, [])

  // 战斗结算：全队分经验，升级按 engine 的成长曲线走
  const grantBattleXp = (team, xp, won) => {
    const updated = (team || []).map((p) => {
      let exp = (p.exp || 0) + xp
      let level = Number(p.level) || 1
      while (level < 999 && exp >= expForLevel(level)) {
        exp -= expForLevel(level)
        level += 1
      }
      return {
        ...p,
        exp,
        level,
        bond: Math.min(100, (p.bond || 0) + (won ? 4 : 1)),
        battles: (p.battles || 0) + 1,
        wins: (p.wins || 0) + (won ? 1 : 0),
      }
    })
    let list = loadCollection()
    updated.forEach((p) => { list = upsertPet(list, p) })
    setCollection(list)
    const mine = updated.find((p) => pet && p.fullName === pet.fullName && p.platform === pet.platform)
    if (mine) setPet(mine)
  }

  const run = async () => {
    if (!url.trim()) { setError('请输入仓库地址'); sfx.error(); return }
    setError('')
    setView('scan')
    setStep(0)

    try {
      const t1 = setTimeout(() => setStep(1), 350)
      const t2 = setTimeout(() => setStep(2), 900)
      sfx.scanTick()
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
      sfx.error()
      setView('home')
    }
  }

  const afterReveal = () => {
    setView('reveal')
    if (pet) sfx.reveal(pet.quality.key)
  }

  const goDetail = () => {
    if (pet) setCollection(upsertPet(loadCollection(), pet))
    setView('detail')
  }

  const reset = () => { sfx.back(); setView('home'); setPet(null); setUrl('') }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={reset}>
          <span className="logo">GitMon</span>
          <span className="tagline">你的仓库，是一只活着的精灵</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="mute-btn" onClick={() => setMuted(sfx.toggleMute())}>
            {muted ? '♪ OFF' : '♪ ON'}
          </button>
          <a className="gh-link" href="https://github.com/4243342/gitmon" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      {view === 'home' && (
        <main className="home">
          <section className="hero">
            <DecoSprite seed="deco-thunder-01" colors={['#f5c542', '#ffdf7e']} body="biped" size={96} className="d1" />
            <DecoSprite seed="deco-water-02" colors={['#4a9eff', '#a8d8ff']} body="winged" size={72} className="d2" />
            <DecoSprite seed="deco-fire-03" colors={['#ff6b4a', '#ffb199']} body="slime" size={80} className="d3" />
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
            {error && <p className="error">! {error}</p>}
            <div className="examples">
              <span>▶ 快试试：</span>
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

          <section className="arena-entry">
            <div className="arena-copy">
              <h3>竞技场</h3>
              <p>带 1–3 只精灵上场。属性克制、先制、异常状态和换人决定胜负——等级高不一定赢。</p>
            </div>
            <button
              className="primary-btn"
              onClick={() => { setBattleInitial(null); setView('battle') }}
              disabled={collection.length === 0}
            >
              {collection.length === 0 ? '先孵化一只' : '进入竞技场'}
            </button>
          </section>

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
          <div className="rpg-box">
            <p className="rpg-line">
              {typed}
              <span className="rpg-caret" />
            </p>
          </div>
          <ul className="scan-steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>
                <span className="dot" />
                {s}
                {i < step && <em>OK!</em>}
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
            <button className="primary-btn" onClick={() => { setBattleInitial(pet); setView('battle') }}>带它去对战</button>
            <button className="ghost-btn" onClick={reset}>再孵一只</button>
          </div>
          <GrowPanel
            pet={pet}
            onUpdate={(next) => { setPet(next); setCollection(upsertPet(loadCollection(), next)) }}
          />
          <Collection list={collection} onPick={(p) => setPet(p)} />
        </main>
      )}

      {view === 'battle' && (
        <main className="battle-stage">
          <Battle
            pets={collection}
            initial={battleInitial}
            onExit={() => setView(battleInitial ? 'detail' : 'home')}
            onReward={grantBattleXp}
          />
        </main>
      )}

      <footer className="footer">
        GitMon Prototype v0.3 · 数据来自 GitHub / Gitee 公开 API · 开包动画 pack-opener-js · 粒子 tsParticles · 对战机制参照 Pokémon Showdown（MIT）
      </footer>
    </div>
  )
}
