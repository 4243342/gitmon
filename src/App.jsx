import { useEffect, useRef, useState } from 'react'
import { parseRepoInput, scanOwnerBox, scanRepo } from './scan.js'
import { judge } from './engine.js'
import { arenaRivals, loadArenaOpponents } from './arenaOpponents.js'
import { prepareArenaRoster } from './arenaRoster.js'
import { elementLabel } from './elementLabel.js'
import { cardFoil, isCloudCard } from './cardTraits.js'
import {
  cachedProfile, clearGuest, consumeAuthQuery, fetchMe, fetchProviders,
  guestSkipped, logout, PROVIDER_LABEL, quotaText, skipLogin,
} from './auth.js'
import { loadCollection, upsertPet } from './storage.js'
import { collectCloudBox, collectCloudPet, loadCloudPets, previewCloudBox, previewCloudPet, refreshCloudPet } from './cloud.js'
import { exportShareCard } from './share.js'
import { sfx } from './sfx.js'
import AuthPage from './components/AuthPage.jsx'
import PetCard, { CloudCombatDetails } from './components/PetCard.jsx'
import PackOpening from './components/PackOpening.jsx'
import PackBox from './components/PackBox.jsx'
import Collection from './components/Collection.jsx'
import GrowPanel from './components/GrowPanel.jsx'
import Battle from './components/Battle.jsx'
import DecoSprite from './components/DecoSprite.jsx'
import './styles.css'
import './game-theme.css'

const RANK = { SSR: 4, SR: 3, R: 2, N: 1 }
const packKey = (pet) => pet.id || pet.fullName

// 单个项目：一个卡包
const STEPS = ['连接仓库', '读取技术栈', '估算工程量', '评估代码质量']
const DIALOGS = [
  '连接仓库，读取档案...',
  '读取仓库线索，判定元素属性...',
  '统计代码规模，估算工程量...',
  '核对代码、测试与文档，评估品质...',
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
  const [cloudPets, setCloudPets] = useState([])
  const [cloudListStatus, setCloudListStatus] = useState('loading')
  const [cloudInput, setCloudInput] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const cloudRequest = useRef(null)
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState('repo') // repo | owner
  const [box, setBox] = useState(null)
  const [opened, setOpened] = useState(() => new Set())
  const [savedPacks, setSavedPacks] = useState(() => new Set())
  const [revealedAll, setRevealedAll] = useState(false)
  const [progress, setProgress] = useState(null)
  const [arenaSession, setArenaSession] = useState(null)
  const [muted, setMuted] = useState(sfx.muted)
  // 登录态：loading 期间不闪首页，避免"先显示未登录再跳授权页"
  const [auth, setAuth] = useState(() => ({
    loading: true,
    online: true,
    profile: cachedProfile(),
  }))
  const [providers, setProviders] = useState(null)
  const [authNotice, setAuthNotice] = useState('')
  const cloudAccount = auth.online && auth.profile?.authenticated ? auth.profile.id : null
  const canBattle = collection.length > 0 || (cloudAccount && cloudPets.length > 0)
  // 已经自动开过箱的账号（provider/login），同一账号不重复扫
  const autoScanned = useRef('')

  useSfxBus()
  const typed = useTypewriter(view === 'scan' ? (mode === 'owner' ? DIALOGS_OWNER : DIALOGS) : [])

  // 扫描阶段推进：每亮一格给一声，音高上行
  useEffect(() => {
    if (view !== 'scan' || step === 0) return
    sfx.scanStep(step)
  }, [step, view])

  useEffect(() => { setCollection(loadCollection()) }, [])

  useEffect(() => {
    setCloudPets([])
    setCloudListStatus('loading')
    if (!cloudAccount) return
    const controller = new AbortController()
    loadCloudPets(controller.signal).then((pets) => {
      setCloudPets((current) => [...current, ...pets.filter((p) => !current.some((saved) => saved.id === p.id))])
      setCloudListStatus('ready')
    }).catch(() => {
      if (!controller.signal.aborted) setCloudListStatus('failed')
    })
    return () => controller.abort()
  }, [cloudAccount])

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
    cancelCloudRequest()
    clearBox()
    setCloudPets([])
    setPet(null)
    setArenaSession(null)
    await logout()
    setAuth((s) => ({ ...s, profile: { authenticated: false, oauth: s.profile?.oauth ?? false } }))
    setView('auth')
  }

  const openArena = (selected = null) => {
    const roster = prepareArenaRoster(cloudAccount ? cloudPets : [], collection, selected)
    setArenaSession({ ...roster, rivals: arenaRivals() })
    setView('battle')
  }

  const fail = (e) => {
    setError(e.message || '扫描失败，请检查地址')
    sfx.error()
    setProgress(null)
    setView('home')
  }

  const cancelCloudRequest = () => {
    cloudRequest.current?.abort()
    cloudRequest.current = null
    setCloudBusy(false)
    setCloudError('')
  }

  const withCloudRequest = async (action, onError = (e) => setCloudError(e.message)) => {
    if (cloudRequest.current) return
    const controller = new AbortController()
    cloudRequest.current = controller
    setCloudBusy(true)
    setCloudError('')
    try {
      await action(controller.signal)
    } catch (e) {
      if (!controller.signal.aborted) onError(e)
    } finally {
      if (cloudRequest.current === controller) {
        cloudRequest.current = null
        setCloudBusy(false)
      }
    }
  }

  const startCloudHatch = (event) => {
    event.preventDefault()
    const repo = cloudInput.trim()
    if (!repo) return
    withCloudRequest(async (signal) => {
      setMode('repo')
      setProgress(null)
      setStep(1)
      setView('scan')
      const next = await previewCloudPet(repo, signal)
      setPet(next)
      setView('pack')
    }, (e) => {
      setCloudError(e.message)
      setView('home')
    })
  }

  const rememberCloudPets = (pets) => {
    const ids = new Set(pets.map((p) => p.id))
    setCloudPets((current) => [...pets, ...current.filter((p) => !ids.has(p.id))])
  }

  const showCloudPet = (next) => {
    rememberCloudPets([next])
    setPet(next)
    setView('detail')
  }

  const pickPet = (next) => {
    cancelCloudRequest()
    setPet(next)
    setView('detail')
  }

  const clearBox = () => {
    setBox(null)
    setOpened(new Set())
    setSavedPacks(new Set())
    setRevealedAll(false)
  }

  const run = () => {
    if (!url.trim()) { setError('请输入仓库或账号地址'); sfx.error(); return }
    const info = parseRepoInput(url)
    if (!info) { setError('无法识别的地址：仓库链接、账号主页都行'); sfx.error(); return }
    setError('')
    clearBox()
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
  // self=true：读"我自己"的项目清单（走 /user/repos，能带出私有仓库）
  const runOwner = async (info, opts = {}) => {
    setMode('owner')
    setView('scan')
    setStep(0)
    setProgress(null)

    try {
      setStep(1)
      const res = await scanOwnerBox(info, {
        self: opts.self,
        onProgress: (p) => { setProgress(p); setStep(2) },
      })
      if (!res.snaps.length) {
        throw new Error(res.rateLimited
          ? 'API 触发限流，稍后再试（登录后额度高得多）'
          : opts.self
            ? '你名下还没有可孵化的项目（fork / 空仓库会被跳过）'
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

  // 登录用户：不用输仓库，直接把自己名下所有项目开成一整箱
  const runAccountBox = () => {
    const p = auth.profile
    if (!p?.authenticated) return
    const provider = p.provider || 'github'
    autoScanned.current = `${provider}/${p.login}`
    setError('')
    clearBox()
    if (cloudAccount) {
      return withCloudRequest(async (signal) => {
        setMode('owner')
        setProgress(null)
        setStep(1)
        setView('scan')
        const result = await previewCloudBox(signal, (p) => { setProgress(p); setStep(2) })
        if (!result.pets.length) {
          const message = result.rateLimited ? '平台配额已用尽，稍后再试'
            : result.failed[0]?.reason || '你名下还没有可孵化的项目（fork / 空仓库会被跳过）'
          throw new Error(message)
        }
        setBox(result)
        setView('box')
      }, fail)
    }
    runOwner({ kind: 'owner', platform: provider, owner: p.login }, { self: true })
  }

  // 云账号先打开主页，方便查看图鉴和单仓库孵化。
  useEffect(() => {
    if (auth.loading || cloudAccount) return
    const p = auth.profile
    if (!p?.authenticated) { autoScanned.current = ''; return }
    const key = `${p.provider || 'github'}/${p.login}`
    if (autoScanned.current === key) return
    autoScanned.current = key
    runOwner({ kind: 'owner', platform: p.provider || 'github', owner: p.login }, { self: true })
  }, [auth.loading, auth.profile?.id, auth.profile?.provider, auth.profile?.login, cloudAccount])

  const fromBox = pet && box && (box.id ? pet.boxId === box.id : !pet.repoId)

  const afterReveal = () => {
    setView('reveal')
    if (pet) {
      sfx.reveal(cardFoil(pet).effect)
      if (fromBox) setOpened((s) => new Set(s).add(packKey(pet)))
    }
  }

  const collectRevealed = (returnToBox = false) => {
    const finish = (next) => {
      if (fromBox) setSavedPacks((s) => new Set(s).add(packKey(next)))
      setPet(next)
      setView(returnToBox ? 'box' : 'detail')
      sfx.collect()
    }
    if (pet.previewId || pet.boxId) {
      return withCloudRequest(async (signal) => {
        const next = await collectCloudPet(pet, signal)
        rememberCloudPets([next])
        finish(next)
      })
    }
    setCollection(upsertPet(loadCollection(), pet))
    finish(pet)
  }

  const saveAll = () => {
    const finish = (pets) => {
      setSavedPacks((current) => new Set([...current, ...pets.map(packKey)]))
      sfx.collect()
    }
    if (box.id) {
      return withCloudRequest(async (signal) => {
        const pets = await collectCloudBox(box.id, signal)
        rememberCloudPets(pets)
        finish(pets)
      })
    }
    let list = loadCollection()
    box.pets.forEach((p) => { list = upsertPet(list, p) })
    setCollection(list)
    finish(box.pets)
  }

  const reset = () => {
    cancelCloudRequest()
    sfx.back()
    setView('home')
    setPet(null)
    setArenaSession(null)
    setUrl('')
    clearBox()
    setProgress(null)
  }

  // 登录用户从卡箱退回账号主页：保留这箱，方便再点开
  const backToAccount = () => {
    sfx.back()
    setView('home')
    setPet(null)
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
            <div
              className="user-chip"
              title={`${PROVIDER_LABEL[auth.profile.provider] || 'GitHub'} @${auth.profile.login} · 配额 ${quotaText(auth.profile)}`}
            >
              {auth.profile.avatar
                ? <img src={auth.profile.avatar} alt="" />
                : <span className="user-dot" />}
              <span className={`user-src${auth.profile.provider === 'gitee' ? ' is-gitee' : ''}`}>
                {PROVIDER_LABEL[auth.profile.provider] || 'GitHub'}
              </span>
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
          {auth.profile?.authenticated ? (
            <section className="account-hero">
              <div className="account-id">
                {auth.profile.avatar
                  ? <img className="account-avatar" src={auth.profile.avatar} alt="" />
                  : <span className="account-avatar account-avatar-ph" />}
                <div className="account-meta">
                  <span className="account-badge">
                    {PROVIDER_LABEL[auth.profile.provider] || 'GitHub'} · 已登录
                  </span>
                  <h2>{auth.profile.name || auth.profile.login}</h2>
                  <p>
                    @{auth.profile.login} ·{' '}
                    {box
                      ? <>名下 <b>{box.pets.length}</b> 个项目已生成卡包</>
                      : '可孵化单个仓库，或读取我的项目生成卡箱'}
                  </p>
                </div>
              </div>
              {cloudAccount && (
                <form className="input-row" onSubmit={startCloudHatch}>
                  <input
                    aria-label="单仓库地址"
                    value={cloudInput}
                    onChange={(e) => setCloudInput(e.target.value)}
                    placeholder="GitHub / Gitee 仓库地址"
                    required
                    spellCheck={false}
                  />
                  <button type="submit" disabled={cloudBusy}>孵化单仓库</button>
                </form>
              )}
              <div className="account-actions">
                <button className="primary-btn" onClick={runAccountBox}>
                  {box ? '重新读取全部项目' : '读取我的项目'}
                </button>
                {box && (
                  <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('box') }}>
                    打开我的卡箱（{box.pets.length} 包）
                  </button>
                )}
                <button className="ghost-btn" onClick={() => openArena()} disabled={!canBattle}>
                  进入竞技场
                </button>
              </div>
              {error && <p className="error">! {error}</p>}
              {cloudError && <p className="error" role="alert">{cloudError}</p>}
              <p className="account-note">
                {cloudAccount
                  ? '单仓库和卡箱里的精灵收下后都可在云图鉴查看。'
                  : '读取我的项目，为每个仓库生成一个卡包。'}
              </p>
            </section>
          ) : (
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
            {/限流|403|配额/.test(error) && (
              <p className="quota-note">
                匿名额度很容易打满
                <button onClick={() => setView('auth')}>去登录 GitHub / Gitee →</button>
              </p>
            )}
            <p className="quota-note">
              游客模式：匿名每小时 60 次，整箱孵化容易打满
              <button onClick={() => setView('auth')}>登录后自动读我的仓库 →</button>
            </p>
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
          )}

          {cloudAccount && (
            <Collection
              list={cloudPets}
              onPick={pickPet}
              title="云图鉴"
              empty={cloudListStatus === 'loading' ? '正在读取云图鉴…'
                : cloudListStatus === 'failed' ? '读取失败，请刷新页面重试' : '收下单仓库精灵后，它会出现在这里。'}
            />
          )}
          <Collection list={collection} onPick={pickPet} title={cloudAccount ? '本地图鉴' : undefined} />

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
              onClick={() => openArena()}
              disabled={!canBattle}
            >
              {canBattle ? '进入竞技场' : '先孵化一只'}
            </button>
          </section>

          <section className="howto">
            <h3>怎么判定</h3>
            {cloudAccount ? (
              <div className="howto-grid">
                <div><b>属性</b><span>按仓库的主要用途判定</span></div>
                <div><b>罕见度</b><span>按 GitHub 或 Gitee 的公开 Star 和 Fork 判定</span></div>
                <div><b>品质</b><span>源码、测试、文档和社区证据决定黑铁至王者档位</span></div>
              </div>
            ) : (
              <div className="howto-grid">
                <div><b>品种</b><span>主语言 → 元素属性（Python 水系 / JS 雷系 / Rust 钢系…）× 项目类型 → 生态型（AI 龙型 / CLI 鸟型 / Web 兽型…）</span></div>
                <div><b>品质</b><span>测试 25% + 工程质量 20% + 文档 20% + 维护 20% + 社区 15% → N / R / SR / SSR</span></div>
                <div><b>等级</b><span>代码规模 + commit + 贡献者 + 活跃时长，对数归一化 → Lv.1–999</span></div>
              </div>
            )}
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
              <span>正在判定 {progress.done}/{progress.total}{progress.name ? ` · ${progress.name}` : ''}</span>
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
          saved={savedPacks}
          revealedAll={revealedAll}
          onOpen={(p, revealed, saved) => {
            const existing = saved && (box.id ? cloudPets : collection).find((item) => packKey(item) === packKey(p))
            if (existing) return pickPet(existing)
            setCloudError('')
            setPet(p)
            setView(revealed ? 'reveal' : 'pack')
          }}
          onOpenAll={() => setRevealedAll(true)}
          onSaveAll={saveAll}
          onExit={auth.profile?.authenticated ? backToAccount : reset}
          saving={cloudBusy}
          error={cloudError}
          exitLabel={auth.profile?.authenticated ? '回到我的主页' : '换个账号 / 仓库'}
        />
      )}

      {view === 'pack' && pet && (
        <main className="pack-stage">
          <PackOpening pet={pet} onReveal={afterReveal} muted={muted} />
        </main>
      )}

      {view === 'reveal' && pet && (
        <main className="reveal-stage">
          {isCloudCard(pet) ? (
            <h2 className="reveal-title" style={{ color: cardFoil(pet).color }}>{pet.repo} 登场</h2>
          ) : (
            <h2 className={`reveal-title quality-text-${pet.quality.key}`}>
              {pet.quality.name} · {elementLabel(pet)} · {pet.species.name} 登场
            </h2>
          )}
          <PetCard pet={pet} revealed />
          <div className="actions">
            {fromBox ? (
              <>
                <button className="primary-btn" disabled={cloudBusy} onClick={() => collectRevealed(true)}>
                  {cloudBusy ? '正在收入…' : '收下 · 回卡箱'}
                </button>
                <button className="ghost-btn" disabled={cloudBusy} onClick={() => collectRevealed()}>收下并看详情</button>
                <button className="ghost-btn" disabled={cloudBusy} onClick={() => { setCloudError(''); setView('box') }}>返回卡箱</button>
              </>
            ) : (
              <button className="primary-btn" onClick={() => collectRevealed()} disabled={cloudBusy}>
                {cloudBusy ? '正在收入…' : pet.previewId ? '收下 · 云图鉴' : '收入图鉴'}
              </button>
            )}
            {!fromBox && <button className="ghost-btn" onClick={reset}>再孵一只</button>}
          </div>
          {cloudError && <p className="error" role="alert">{cloudError}</p>}
        </main>
      )}

      {view === 'detail' && pet && (
        <main className="detail-stage">
          <PetCard pet={pet} />
          <div className="actions">
            <button className="primary-btn" onClick={() => exportShareCard(pet).catch(() => setCloudError('无法导出分享卡，请稍后重试'))}>导出分享卡</button>
            {pet.repoId && (
              <button className="primary-btn" disabled={cloudBusy} onClick={() => withCloudRequest(async (signal) => {
                showCloudPet(await refreshCloudPet(pet.id, signal))
              })}>
                {cloudBusy ? '正在更新…' : '更新仓库数据'}
              </button>
            )}
            <button className="primary-btn" disabled={cloudBusy} onClick={() => openArena(pet)}>带它去对战</button>
            {box?.pets.some((p) => packKey(p) === packKey(pet)) && (
              <button className="ghost-btn" disabled={cloudBusy} onClick={() => setView('box')}>返回卡箱</button>
            )}
            <button className="ghost-btn" onClick={reset}>{pet.repoId ? '返回云图鉴' : '再孵一只'}</button>
          </div>
          {cloudError && <p className="error" role="alert">{cloudError}</p>}
          {isCloudCard(pet) && <CloudCombatDetails pet={pet} />}
          {!pet.repoId && (
            <GrowPanel
              pet={pet}
              onUpdate={(next) => { setPet(next); setCollection(upsertPet(loadCollection(), next)) }}
            />
          )}
          {pet.repoId
            ? <Collection list={cloudPets} onPick={pickPet} title="云图鉴" />
            : <Collection list={collection} onPick={pickPet} />}
        </main>
      )}

      {view === 'battle' && arenaSession && (
        <main className="battle-stage">
          <Battle
            {...arenaSession}
            resolveOpponents={loadArenaOpponents}
            onExit={() => {
              setView(arenaSession.initial ? 'detail' : 'home')
              setArenaSession(null)
            }}
          />
        </main>
      )}

      <footer className="footer">
        GitMon Prototype v0.3 · 数据来自 GitHub / Gitee 公开 API · 开包动画 pack-opener-js · 粒子 tsParticles · 对战机制参照 Pokémon Showdown（MIT）
      </footer>
    </div>
  )
}
