import { useEffect, useRef, useState } from 'react'
import { parseRepoInput, scanOwnerBox, scanRepo } from './scan.js'
import { expForLevel, judge } from './engine.js'
import {
  cachedProfile, clearGuest, consumeAuthQuery, fetchMe, fetchProviders,
  guestSkipped, logout, quotaText, skipLogin,
} from './auth.js'
import { loadCollection, upsertPet } from './storage.js'
import { exportShareCard } from './share.js'
import { sfx } from './sfx.js'
import AuthPage from './components/AuthPage.jsx'
import PetCard from './components/PetCard.jsx'
import PackOpening from './components/PackOpening.jsx'
import PackBox from './components/PackBox.jsx'
import Collection from './components/Collection.jsx'
import GrowPanel from './components/GrowPanel.jsx'
import Battle from './components/Battle.jsx'
import DecoSprite from './components/DecoSprite.jsx'
import './styles.css'
import './game-theme.css'

const RANK = { SSR: 4, SR: 3, R: 2, N: 1 }

// 单个项目：一个卡包
const STEPS = ['连接仓库', '读取技术栈', '估算工程量', '评估代码质量']
const DIALOGS = [
  '连接仓库，读取档案...',
  '分析语言构成，判定元素属性...',
  '统计代码规模，估算工程量...',
  '检查测试 / CI / 文档，评估品质...',
  '卡包生成完毕！',
]

// 账号：每个项目一个卡包，装成整箱
const STEPS_OWNER = ['读取项目清单', '逐项读取技术栈', '估算工程量', '评估代码质量']
const DIALOGS_OWNER = [
  '读取账号的项目清单...',
  '逐个检查语言构成与项目结构...',
  '统计每个项目的工程量...',
  '逐个评估代码质量，装包...',
  '整箱卡包已就绪！',
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
  const [view, setView] = useState('boot') // boot | auth | home | scan | box | pack | reveal | detail | battle
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [pet, setPet] = useState(null)
  const [collection, setCollection] = useState([])
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState('repo') // repo | owner
  const [box, setBox] = useState(null)
  const [opened, setOpened] = useState(() => new Set())
  const [revealedAll, setRevealedAll] = useState(false)
  const [progress, setProgress] = useState(null)
  const [battleInitial, setBattleInitial] = useState(null)
  const [muted, setMuted] = useState(sfx.muted)
  // 登录态：loading 期间不闪首页，避免"先显示未登录再跳授权页"
  const [auth, setAuth] = useState(() => ({
    loading: true,
    online: true,
    profile: cachedProfile(),
  }))
  const [providers, setProviders] = useState(null)
  const [authNotice, setAuthNotice] = useState('')

  useSfxBus()
  const typed = useTypewriter(view === 'scan' ? (mode === 'owner' ? DIALOGS_OWNER : DIALOGS) : [])

  // 扫描阶段推进：每亮一格给一声，音高上行
  useEffect(() => {
    if (view !== 'scan' || step === 0) return
    sfx.scanStep(step)
  }, [step, view])

  useEffect(() => { setCollection(loadCollection()) }, [])

  // 启动：拉会话 + 登录方式，决定首屏是授权页还是首页
  useEffect(() => {
    let alive = true
    const query = consumeAuthQuery()
    if (query?.status === 'failed') {
      setAuthNotice(decodeURIComponent(query.reason || '') || '授权没有完成，再试一次')
    }
    ;(async () => {
      const [me, providerInfo] = await Promise.all([
        fetchMe(),
        fetchProviders().catch(() => null),
      ])
      if (!alive) return
      const profile = me.profile || (me.online ? null : cachedProfile())
      setProviders(providerInfo)
      setAuth({ loading: false, online: me.online, profile })
      const loggedIn = !!profile?.authenticated
      setView(loggedIn || guestSkipped() ? 'home' : 'auth')
    })()
    return () => { alive = false }
  }, [])

  const onAuthed = (result) => {
    setAuth({ loading: false, online: result?.online !== false, profile: result?.profile || null })
    setAuthNotice('')
    clearGuest()
    sfx.blip()
    setView('home')
  }

  const onGuest = () => {
    skipLogin()
    sfx.back()
    setView('home')
  }

  const onLogout = async () => {
    await logout()
    setAuth((s) => ({ ...s, profile: { authenticated: false, oauth: s.profile?.oauth ?? false } }))
    setView('auth')
  }

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

  const fail = (e) => {
    setError(e.message || '扫描失败，请检查地址')
    sfx.error()
    setProgress(null)
    setView('home')
  }

  const run = () => {
    if (!url.trim()) { setError('请输入仓库或账号地址'); sfx.error(); return }
    const info = parseRepoInput(url)
    if (!info) { setError('无法识别的地址：仓库链接、账号主页都行'); sfx.error(); return }
    setError('')
    setBox(null)
    setOpened(new Set())
    setRevealedAll(false)
    setProgress(null)
    if (info.kind === 'owner') runOwner(info)
    else runRepo()
  }

  // 单个项目 → 一个卡包
  const runRepo = async () => {
    setMode('repo')
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
      fail(e)
    }
  }

  // 账号 → 该账号每个项目一个卡包（品质各自算）
  const runOwner = async (info) => {
    setMode('owner')
    setView('scan')
    setStep(0)

    try {
      setStep(1)
      const res = await scanOwnerBox(info, {
        onProgress: (p) => { setProgress(p); setStep(2) },
      })
      if (!res.snaps.length) {
        throw new Error(res.rateLimited
          ? 'API 触发限流，稍后再试（设置 Token 可提高额度）'
          : '这个账号没有可孵化的公开项目')
      }
      setStep(3)
      const pets = res.snaps
        .map(judge)
        .sort((a, b) => (RANK[b.qualityKey] - RANK[a.qualityKey]) || (b.level - a.level))
      await new Promise((r) => setTimeout(r, 380))
      setBox({
        owner: res.owner,
        pets,
        listed: res.listed,
        limit: res.limit,
        truncated: res.truncated,
        skipped: res.skipped,
        failed: res.failed,
        rateLimited: res.rateLimited,
        partial: res.partial,
      })
      setView('box')
    } catch (e) {
      fail(e)
    }
  }

  const afterReveal = () => {
    setView('reveal')
    if (pet) {
      sfx.reveal(pet.quality.key)
      setOpened((s) => new Set(s).add(pet.fullName))
    }
  }

  const goDetail = () => {
    if (pet) setCollection(upsertPet(loadCollection(), pet))
    sfx.swoosh()
    setView('detail')
  }

  // 从卡箱开的那一只：收下就回卡箱，接着开下一包
  const backToBox = () => {
    if (pet) setCollection(upsertPet(loadCollection(), pet))
    sfx.swoosh()
    setView('box')
  }

  const saveAll = () => {
    let list = loadCollection()
    box?.pets.forEach((p) => { list = upsertPet(list, p) })
    setCollection(list)
    setOpened(new Set((box?.pets || []).map((p) => p.fullName)))
    sfx.collect()
  }

  const reset = () => {
    sfx.back()
    setView('home')
    setPet(null)
    setUrl('')
    setBox(null)
    setOpened(new Set())
    setRevealedAll(false)
    setProgress(null)
  }

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
          {auth.profile?.authenticated ? (
            <div className="user-chip" title={`${auth.profile.login} · 配额 ${quotaText(auth.profile)}`}>
              {auth.profile.avatar
                ? <img src={auth.profile.avatar} alt="" />
                : <span className="user-dot" />}
              <span className="user-name">@{auth.profile.login}</span>
              <span className="user-quota">{quotaText(auth.profile)}</span>
              <button className="user-out" onClick={onLogout}>退出</button>
            </div>
          ) : view !== 'auth' && view !== 'boot' ? (
            <button className="mute-btn login-btn" onClick={() => setView('auth')}>登录</button>
          ) : null}
          <a className="gh-link" href="https://github.com/4243342/gitmon" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      {view === 'boot' && (
        <main className="auth-page">
          <div className="auth-loading">正在检查登录状态…</div>
        </main>
      )}

      {view === 'auth' && (
        <AuthPage
          online={auth.online}
          providers={providers}
          notice={authNotice}
          onAuthed={onAuthed}
          onGuest={onGuest}
        />
      )}

      {view === 'home' && (
        <main className="home">
          <section className="hero">
            <DecoSprite seed="deco-thunder-01" colors={['#f5c542', '#ffdf7e']} body="biped" size={96} className="d1" />
            <DecoSprite seed="deco-water-02" colors={['#4a9eff', '#a8d8ff']} body="winged" size={72} className="d2" />
            <DecoSprite seed="deco-fire-03" colors={['#ff6b4a', '#ffb199']} body="slime" size={80} className="d3" />
            <h2>孵化你的仓库精灵</h2>
            <p>
              贴一个仓库地址，得到一个卡包；贴一个账号主页，得到<b>一整箱</b>——
              <b>品种由技术栈决定</b>，<b>品质由代码质量决定</b>，<b>等级由工程量决定</b>。
            </p>
            <div className="input-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder="仓库：github.com/owner/repo　　账号：github.com/owner"
                spellCheck={false}
              />
              <button onClick={run}>孵化</button>
            </div>
            {error && <p className="error">! {error}</p>}
            {/限流|403|配额/.test(error) && !auth.profile?.authenticated && (
              <p className="quota-note">
                匿名额度很容易打满
                <button onClick={() => setView('auth')}>去登录 GitHub →</button>
              </p>
            )}
            {auth.profile?.authenticated ? (
              <p className="quota-note ok">
                已登录 @{auth.profile.login} · 配额 {quotaText(auth.profile)}
              </p>
            ) : (
              <p className="quota-note">
                未登录：匿名每小时 60 次，整箱孵化容易打满
                <button onClick={() => setView('auth')}>登录 GitHub →</button>
              </p>
            )}
            <div className="examples">
              <span>▶ 快试试：</span>
              {[
                'https://github.com/facebook/react',
                'https://github.com/torvalds/linux',
                'https://github.com/4243342',
                'https://gitee.com/mirrors/vue',
              ].map((u) => (
                <button key={u} onClick={() => setUrl(u)}>
                  {u.replace('https://', '').replace('github.com/', 'gh/').replace('gitee.com/', 'gitee/')}
                </button>
              ))}
            </div>
            <p className="hero-note">
              <b>项目 = 一包</b>　·　<b>账号 = 一整箱</b>（该账号每个项目各一包，品质各算各的）
            </p>
          </section>

          <Collection list={collection} onPick={(p) => { setPet(p); setView('detail') }} />

          <section className="arena-entry">
            <div className="arena-copy">
              <h3>竞技场</h3>
              <p>
                三种打法：<b>在线对手</b>（输入对方仓库，按真实实力 1v1）、<b>同类型对战</b>（找同属性仓库）、<b>随机宠物</b>（抽到谁打谁）。
                后两种可调难度——属性克制、先制、异常状态和换人决定胜负，等级高不一定赢。
              </p>
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
            {(mode === 'owner' ? STEPS_OWNER : STEPS).map((s, i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>
                <span className="dot" />
                {s}
                {i < step && <em>OK!</em>}
              </li>
            ))}
          </ul>
          {progress && (
            <div className="scan-progress">
              <span>正在判定 {progress.done}/{progress.total} · {progress.name}</span>
              <div className="sp-bar">
                <div className="sp-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
            </div>
          )}
        </main>
      )}

      {view === 'box' && box && (
        <PackBox
          box={box}
          opened={opened}
          revealedAll={revealedAll}
          onOpen={(p) => { setPet(p); setView('pack') }}
          onOpenAll={() => setRevealedAll(true)}
          onSaveAll={saveAll}
          onExit={reset}
        />
      )}

      {view === 'pack' && pet && (
        <main className="pack-stage">
          <PackOpening pet={pet} onReveal={afterReveal} muted={muted} />
        </main>
      )}

      {view === 'reveal' && pet && (
        <main className="reveal-stage">
          <h2 className={`reveal-title quality-text-${pet.quality.key}`}>
            {pet.quality.name} · {pet.element.name}系{pet.species.name} 登场
          </h2>
          <PetCard pet={pet} revealed />
          <div className="actions">
            {box ? (
              <>
                <button className="primary-btn" onClick={backToBox}>
                  收下 · 回卡箱{box.pets.length - opened.size > 0 ? `（还剩 ${box.pets.length - opened.size} 包）` : ''}
                </button>
                <button className="ghost-btn" onClick={goDetail}>看详情</button>
              </>
            ) : (
              <button className="primary-btn" onClick={goDetail}>收入图鉴</button>
            )}
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
            {box && <button className="ghost-btn" onClick={() => setView('box')}>返回卡箱</button>}
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
