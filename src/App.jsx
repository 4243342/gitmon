import { useEffect, useRef, useState } from 'react'
import { parseRepoInput, scanOwnerBox, scanRepo } from './scan.js'
import { expForLevel, judge, recomputePetStats } from './engine.js'
import {
  cachedProfile, clearGuest, consumeAuthQuery, fetchMe, fetchProviders,
  guestSkipped, logout, PROVIDER_LABEL, quotaText, skipLogin,
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
import Training from './components/Training.jsx'
import DecoSprite from './components/DecoSprite.jsx'
import Manual from './components/Manual.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import AdvancedPanel from './components/AdvancedPanel.jsx'
import { bindWithLLM, clearLLMKey, evaluateWithLLM, loadLLMConfig, saveLLMConfig } from './llm.js'
import { buildPetFromEvaluation } from './llmEval.js'
import './styles.css'
import './game-theme.css'
import './training.css'

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
  '逐个评估代码质量，抽成卡...',
  '整箱卡包已就绪！',
]

// 高级模式：仓库不扫描，全部评测由模型给出
const STEPS_AI = ['连接模型', '推测仓库画像', '模型完成全部评测', '生成精灵卡']
const DIALOGS_AI = [
  '带上评测规则，连接你的模型...',
  '模型正在凭知识推测这个项目的画像...',
  '品质 / 六维 / 根基 / 词条 / 等级，连 4 个技能的名字 / 威力 / 解锁等级，全部按项目交给模型制定...',
  '把模型的结果填进卡面...',
  'AI 推测卡包已就绪！',
]

// 揭晓 / 详情：明确告诉用户这不是真实扫描
function AiNote({ pet }) {
  if (!pet?.aiEvaluated) return null
  return (
    <div className="ai-note">
      <b>AI 推测</b> · 非真实扫描，品质 / 六维 / 根基 / 词条 / 等级，以及 4 个技能的
      名称 / 属性 / 威力 / 解锁等级 / 描述，全部由模型
      <b> {pet.aiModel || '（未标注）'} </b>
      {pet.aiProviderLabel && <b>（{pet.aiProviderLabel}）</b>}
      按项目制定，本地未运行规则引擎{pet.aiHint ? `；补充要求：${pet.aiHint}` : ''}。
      分享卡上会盖上这枚模型的全息钢印。
      {pet.aiComment && <span className="ai-comment">「{pet.aiComment}」</span>}
      {pet.aiEvidence && <span className="ai-comment">推测依据：{pet.aiEvidence}</span>}
      {pet.aiWarnings?.length > 0 && (
        <span className="ai-warn">模型输出有 {pet.aiWarnings.length} 项不完整，已做安全兜底：{pet.aiWarnings.slice(0, 2).join('；')}</span>
      )}
    </div>
  )
}

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
  const [view, setView] = useState('boot') // boot | auth | home | scan | box | pack | reveal | detail | battle | training
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
  // 高级模式：自填 LLM，所有评测交给模型
  const [advanced, setAdvanced] = useState(false)
  const [llmConfig, setLLMConfig] = useState(loadLLMConfig)
  const [llmHint, setLLMHint] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [bindState, setBindState] = useState(() => (llmConfig.binding && llmConfig.apiKey ? 'bound' : 'idle'))
  const [bindError, setBindError] = useState('')
  // 右上角高级模式弹层开关
  const [advOpen, setAdvOpen] = useState(false)
  // 登录态：loading 期间不闪首页，避免"先显示未登录再跳授权页"
  const [auth, setAuth] = useState(() => ({
    loading: true,
    online: true,
    profile: cachedProfile(),
  }))
  const [providers, setProviders] = useState(null)
  const [authNotice, setAuthNotice] = useState('')
  // 已经自动开过箱的账号（provider/login），同一账号不重复扫
  const autoScanned = useRef('')

  useSfxBus()
  const typed = useTypewriter(view === 'scan' ? (advanced ? DIALOGS_AI : mode === 'owner' ? DIALOGS_OWNER : DIALOGS) : [])

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
      if (me.notice) setAuthNotice((prev) => prev || me.notice)
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
      // 升级后按新等级重算六维 / 最大HP / 战力（个体值与词条保持不变）
      const recomputed = recomputePetStats(p, level)
      return {
        ...p,
        ...recomputed,
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
    if (!url.trim()) { setError(advanced ? '请输入仓库地址或项目名' : '请输入仓库或账号地址'); sfx.error(); return }
    if (advanced) { runAdvanced(); return }
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

  // 只输密钥的自动绑定：厂商 / Base URL / 模型由后端探测，结果写回配置
  const applyBinding = async (cfg) => {
    setBindState('binding')
    setBindError('')
    try {
      const binding = await bindWithLLM({ apiKey: cfg.apiKey, custom: cfg.custom })
      const next = { ...cfg, binding, baseUrl: binding.baseUrl, model: binding.model }
      setLLMConfig(next)
      saveLLMConfig(next)
      setBindState('bound')
      return next
    } catch (e) {
      const msg = e.message || '自动绑定失败'
      setBindState('error')
      setBindError(msg)
      setError(msg)
      sfx.error()
      return null
    }
  }

  const handleBind = () => {
    if (!llmConfig.apiKey?.trim() || aiBusy || bindState === 'binding') return
    setError('')
    applyBinding(llmConfig).then((ok) => { if (ok) sfx.blip() })
  }

  // 高级模式：不调 GitHub/Gitee API，也不跑 judge() —— 评测整体交给模型
  const runAdvanced = async () => {
    const input = url.trim()
    const platform = /gitee\.com/i.test(input) ? 'gitee' : 'github'
    setError('')
    setAiBusy(true)

    // 没绑定就先自动绑定一次，用户不必记得点按钮
    let cfg = llmConfig
    if (!cfg.binding || bindState !== 'bound' || !cfg.apiKey?.trim()) {
      if (!cfg.apiKey?.trim()) {
        setError('先粘贴一枚 API Key（右上角 BYOK）；厂商和模型会自动识别')
        sfx.error()
        setAiBusy(false)
        return
      }
      const bound = await applyBinding(cfg)
      if (!bound) { setAiBusy(false); return }
      cfg = bound
    }
    saveLLMConfig(cfg)

    setBox(null)
    setOpened(new Set())
    setRevealedAll(false)
    setProgress(null)
    setMode('repo')
    setView('scan')
    setStep(0)
    const t1 = setTimeout(() => setStep(1), 350)
    const t2 = setTimeout(() => setStep(2), 900)
    sfx.scanTick()
    try {
      const data = await evaluateWithLLM({ repo: input, config: cfg, hint: llmHint, platform })
      clearTimeout(t1); clearTimeout(t2)
      setStep(2)
      const next = buildPetFromEvaluation(data.evaluation, {
        input,
        platform,
        hint: llmHint,
        model: data.meta?.model || cfg.model,
        warnings: data.meta?.warnings || [],
        binding: cfg.binding,
      })
      await new Promise((r) => setTimeout(r, 300))
      setStep(3)
      setPet(next)
      setView('pack')
    } catch (e) {
      clearTimeout(t1); clearTimeout(t2)
      fail(e)
    } finally {
      setAiBusy(false)
    }
  }

  // 单个项目 → 一个卡包
  const runRepo = async (forced) => {
    const input = forced || url
    setMode('repo')
    setView('scan')
    setStep(0)

    try {
      const t1 = setTimeout(() => setStep(1), 350)
      const t2 = setTimeout(() => setStep(2), 900)
      sfx.scanTick()
      const snap = await scanRepo(input)
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
        const total = res.owner?.repos?.length ?? 0
        const plat = res.owner?.platform === 'gitee' ? 'Gitee' : 'GitHub'
        if (res.rateLimited) throw new Error('API 触发限流，稍后再试（登录后额度高得多）')
        // 三种空结果要分开说，不然永远看不出是接口没给数据、还是被过滤掉了
        if (!total) throw new Error(`${plat} 接口没有返回任何项目（仓库可能全是私有的，或授权没带上仓库权限）`)
        if (!res.listed) {
          // 把原始字段摊开，才知道是 fork 判错还是空仓库判错
          const sample = (res.owner?.repos || []).slice(0, 3)
            .map((r) => `${r.name}［fork=${r.raw?.fork} parent=${!!r.raw?.parent} empty_repo=${r.raw?.empty_repo} size=${r.raw?.size}］`)
            .join('；')
          throw new Error(`名下有 ${total} 个项目，但都被判为 fork 或空仓库：${sample}`)
        }
        const first = res.failed[0]
        throw new Error(`${res.listed} 个项目全部扫描失败：${first?.reason || '未知原因'}`)
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

  // 从排行榜把 GitHub 趋势仓库直接抽成精灵
  const drawRepo = (fullName) => {
    const u = `https://github.com/${fullName}`
    setUrl(u)
    setError('')
    runRepo(u)
  }

  // 登录用户：不用输仓库，直接把自己名下所有项目开成一整箱
  const runAccountBox = () => {
    const p = auth.profile
    if (!p?.authenticated) return
    const provider = p.provider || 'github'
    autoScanned.current = `${provider}/${p.login}`
    setError('')
    setBox(null)
    setOpened(new Set())
    setRevealedAll(false)
    runOwner({ kind: 'owner', platform: provider, owner: p.login }, { self: true })
  }

  // 登录/切账号时自动开箱一次；同一账号不重复扫，避免每次回首页都烧配额
  useEffect(() => {
    if (auth.loading) return
    const p = auth.profile
    if (!p?.authenticated) { autoScanned.current = ''; return }
    const key = `${p.provider || 'github'}/${p.login}`
    if (autoScanned.current === key) return
    autoScanned.current = key
    runOwner({ kind: 'owner', platform: p.provider || 'github', owner: p.login }, { self: true })
  }, [auth.loading, auth.profile?.id, auth.profile?.provider, auth.profile?.login])

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

  // 顶栏左上角全局返回：按当前页智能回退到上一页
  const SUBVIEWS = ['scan', 'box', 'pack', 'reveal', 'detail', 'battle', 'training', 'leaderboard']
  const backTarget = (() => {
    switch (view) {
      case 'reveal': return box ? 'box' : 'home'
      case 'detail': return box ? 'box' : 'home'
      case 'battle': return battleInitial ? 'detail' : 'home'
      case 'box': return auth.profile?.authenticated ? 'home' : 'home'
      default: return 'home'
    }
  })()
  const goBack = () => { sfx.back(); setView(backTarget) }
  const gotoCollection = () => {
    sfx.swoosh()
    setView('home')
    setTimeout(() => {
      const el = document.getElementById('collection')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }
  const showBack = SUBVIEWS.includes(view)

  // 登录用户从卡箱退回账号主页：保留这箱，方便再点开
  const backToAccount = () => {
    sfx.back()
    setView('home')
    setPet(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          {showBack && (
            <button className="topbar-back" onClick={goBack} title="返回">← 返回</button>
          )}
          <div className="brand" onClick={reset}>
            <span className="logo">GitMon</span>
            <span className="tagline">你的仓库，是一只活着的精灵</span>
          </div>
          <nav className="nav">
            <button className={`nav-tab ${view === 'home' ? 'active' : ''}`} onClick={() => { sfx.swoosh(); setView('home') }}>大厅</button>
            <button className={`nav-tab ${view === 'battle' ? 'active' : ''}`} onClick={() => { sfx.swoosh(); setView('battle') }}>竞技场</button>
            <button className={`nav-tab ${view === 'training' ? 'active' : ''}`} onClick={() => { sfx.swoosh(); setView('training') }}>训练场</button>
            <button className={`nav-tab ${view === 'leaderboard' ? 'active' : ''}`} onClick={() => { sfx.swoosh(); setView('leaderboard') }}>排行榜</button>
            <button className="nav-tab" onClick={gotoCollection}>图鉴</button>
          </nav>
          <div className="topbar-right">
            <div className="adv-wrap">
              <button
                className={`adv-btn ${advanced ? 'on' : ''}`}
                onClick={() => {
                  const turnOn = !advanced
                  setAdvanced(turnOn)
                  setAdvOpen(turnOn)
                }}
                title="AI 高级版：用自己的模型评测仓库，只需填一枚密钥"
              >
                <span className={`adv-dot ${bindState === 'bound' ? 'ok' : ''}`} />
                AI高级版入口
              </button>
              {advOpen && (
                <>
                  <div className="adv-backdrop" onClick={() => setAdvOpen(false)} />
                  <div className="adv-pop">
                    <AdvancedPanel
                      config={llmConfig}
                      onConfigChange={(next) => {
                        setLLMConfig(next)
                        if (!next.binding && bindState !== 'binding') { setBindState('idle'); setBindError('') }
                      }}
                      hint={llmHint}
                      onHintChange={setLLMHint}
                      onClearKey={() => {
                        clearLLMKey()
                        const next = { ...llmConfig, apiKey: '', binding: null }
                        setLLMConfig(next)
                        saveLLMConfig(next)
                        setBindState('idle')
                        setBindError('')
                      }}
                      busy={aiBusy}
                      bindState={bindState}
                      bindError={bindError}
                      onBind={handleBind}
                      onClose={() => setAdvOpen(false)}
                    />
                  </div>
                </>
              )}
            </div>
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
                      ? <>名下 <b>{box.pets.length}</b> 个项目已抽成卡包</>
                      : '正在读取你名下的项目…'}
                  </p>
                </div>
              </div>
              <div className="account-actions">
                <button className="primary-btn" onClick={runAccountBox}>
                  {box ? '重新读取全部项目' : '读取我的项目'}
                </button>
                {box && (
                  <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('box') }}>
                    打开我的卡箱（{box.pets.length} 包）
                  </button>
                )}
                <button className="ghost-btn" onClick={() => setView('battle')} disabled={collection.length === 0}>
                  进入竞技场
                </button>
              </div>
              {error && <p className="error">! {error}</p>}
              <p className="account-note">
                登录账号不用再输入仓库地址 —— 你名下<b>每个项目自动生成一个卡包</b>，
                私有仓库也会一起读出来（授权只读，不写代码）。
              </p>
            </section>
          ) : (
          <section className="hero">
            <DecoSprite seed="deco-thunder-01" colors={['#f5c542', '#ffdf7e']} body="biped" size={96} className="d1" />
            <DecoSprite seed="deco-water-02" colors={['#4a9eff', '#a8d8ff']} body="winged" size={72} className="d2" />
            <DecoSprite seed="deco-fire-03" colors={['#ff6b4a', '#ffb199']} body="slime" size={80} className="d3" />
            <h2>仓库抽卡，召唤你的精灵</h2>
            <p>
              贴一个仓库地址，得到一个卡包；贴一个账号主页，得到<b>一整箱</b>——
              <b>品种由技术栈决定</b>，<b>品质由代码质量决定</b>，<b>等级由工程量决定</b>。
            </p>
            {advanced && (
              <p className="adv-on-note">
                高级模式已开启 · 评测全部交给你的模型（BYOK）
                <button onClick={() => { setAdvanced(false); setAdvOpen(false); setError('') }}>关闭</button>
              </p>
            )}
            <div className="input-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !aiBusy && run()}
                placeholder={advanced ? '仓库地址或项目名，例如 dify、Odoo、github.com/facebook/react' : '仓库：github.com/owner/repo　　账号：github.com/owner'}
                spellCheck={false}
              />
              <button onClick={run} disabled={aiBusy}>
                {aiBusy ? '模型评测中…' : advanced ? '让模型评测并抽卡' : '抽卡'}
              </button>
            </div>
            {error && <p className="error">! {error}</p>}
            {advanced && error && (
              <p className="quota-note">
                模型评测没成功，可以
                <button onClick={() => { setAdvanced(false); setAdvOpen(false); setError('') }}>关闭高级模式 →</button>
              </p>
            )}
            {/限流|403|配额/.test(error) && (
              <p className="quota-note">
                匿名额度很容易打满
                <button onClick={() => setView('auth')}>去登录 GitHub / Gitee →</button>
              </p>
            )}
            <p className="quota-note">
              游客模式：匿名每小时 60 次，整箱抽卡容易打满
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

          <div id="collection">
            <Collection list={collection} onPick={(p) => { setPet(p); setView('detail') }} />
          </div>

          <div className="home-features">
          <section className="arena-entry">
            <div className="arena-copy">
              <h3>竞技场</h3>
              <p>
                三种打法：<b>在线对手</b>（输入对方仓库，按真实实力 1v1）、<b>同类型对战</b>（找同属性仓库）、<b>随机宠物</b>（抽到谁打谁）。
                开战后<b>全自动</b>，不用点技能；可调难度的是后两种——属性克制、先制、异常状态和换人决定胜负，等级高不一定赢。
              </p>
            </div>
            <button
              className="primary-btn"
              onClick={() => { setBattleInitial(null); setView('battle') }}
              disabled={collection.length === 0}
            >
              {collection.length === 0 ? '先抽一只' : '进入竞技场'}
            </button>
          </section>

          <section className="training-entry">
            <div className="training-entry-copy">
              <h3>训练场</h3>
              <p>
                六位 AI 教练随时待命：<b>Trae / WorkBuddy / Codex / Cursor / Claude Code / Grok Bot</b>。
                点一下直达对应软件，不耗体力、不影响竞技场战绩，去过的自动打卡。
              </p>
            </div>
            <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('training') }}>
              进入训练场
            </button>
          </section>

          <section className="leaderboard-entry">
            <div className="leaderboard-entry-copy">
              <h3>GitHub 排行榜</h3>
              <p>
                GitHub 趋势榜实时拉取：<b>今日 / 本周 / 本月</b>最火仓库，按 Star 增长排序。
                点「抽卡」能直接把榜单上的仓库变成一只精灵，看看它是什么品种、什么品质。
              </p>
            </div>
            <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('leaderboard') }}>
              去看排行榜
            </button>
          </section>
          </div>

          <Manual />
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
            {(advanced ? STEPS_AI : mode === 'owner' ? STEPS_OWNER : STEPS).map((s, i) => (
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
          onExit={auth.profile?.authenticated ? backToAccount : reset}
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
          <h2 className={`reveal-title quality-text-${pet.quality.key}`}>
            {pet.quality.name} · {pet.element.name}系{pet.species.name} 登场
          </h2>
          <AiNote pet={pet} />
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
            <button className="ghost-btn" onClick={reset}>再抽一只</button>
          </div>
        </main>
      )}

      {view === 'detail' && pet && (
        <main className="detail-stage">
          <AiNote pet={pet} />
          <PetCard pet={pet} />
          <div className="actions">
            <button className="primary-btn" onClick={() => exportShareCard(pet)}>导出分享卡</button>
            <button className="primary-btn" onClick={() => { setBattleInitial(pet); setView('battle') }}>带它去对战</button>
            {box && <button className="ghost-btn" onClick={() => setView('box')}>返回卡箱</button>}
            <button className="ghost-btn" onClick={reset}>再抽一只</button>
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

      {view === 'training' && (
        <Training />
      )}

      {view === 'leaderboard' && (
        <Leaderboard onDraw={drawRepo} />
      )}

      <footer className="footer">
        GitMon Prototype v0.3 · 数据来自 GitHub / Gitee 公开 API · 开包动画 pack-opener-js · 粒子 tsParticles · 对战机制参照 Pokémon Showdown（MIT）
      </footer>
    </div>
  )
}
