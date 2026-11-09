import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n.js'
import { parseRepoInput, scanOwnerBox, scanRepo } from './scan.js'
import { expForLevel, judge, recomputePetStats } from './engine.js'
import {
  cachedProfile, clearGuest, consumeAuthQuery, fetchMe, fetchProviders,
  guestSkipped, logout, PROVIDER_LABEL, quotaText, skipLogin,
} from './auth.js'
import { loadCollection, upsertPet } from './storage.js'
import { markDirty, startupSync } from './sync.js'
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
import AuditStage from './components/AuditStage.jsx'
import Settings from './components/Settings.jsx'
import { finalRollDuration, runDeepAudit, buildEvidence } from './audit.js'
import { bindWithLLM, clearLLMKey, evaluateWithLLM, loadLLMConfig, pingWithLLM, saveLLMConfig } from './llm.js'
import { buildPetFromEvaluation } from './llmEval.js'
// 卡面全息材质库（pokemon-cards-css / GPL-3.0）必须先于项目样式加载，保证本项目的覆盖规则生效
import './vendor/pokemon-cards.css'
import './styles.css'
import './game-theme.css'
import './training.css'

const RANK = { SSR: 4, SR: 3, R: 2, N: 1 }

// 单个项目：一个卡包
const STEPS = {
  zh: ['连接仓库', '读取技术栈', '估算工程量', '评估代码质量'],
  en: ['Connect repo', 'Read tech stack', 'Estimate size', 'Assess code quality'],
}
const DIALOGS = {
  zh: [
    '连接仓库，读取档案...',
    '分析语言构成，判定元素属性...',
    '统计代码规模，估算工程量...',
    '检查测试 / CI / 文档，评估品质...',
    '卡包生成完毕！',
  ],
  en: [
    'Connecting repo, reading profile...',
    'Analyzing languages, judging element type...',
    'Counting code size, estimating project scale...',
    'Checking tests / CI / docs, assessing quality...',
    'Pack ready!',
  ],
}

// 账号：每个项目一个卡包，装成整箱
const STEPS_OWNER = {
  zh: ['读取项目清单', '逐项读取技术栈', '估算工程量', '评估代码质量'],
  en: ['List projects', 'Read each tech stack', 'Estimate size', 'Assess code quality'],
}
const DIALOGS_OWNER = {
  zh: [
    '读取账号的项目清单...',
    '逐个检查语言构成与项目结构...',
    '统计每个项目的工程量...',
    '逐个评估代码质量，抽成卡...',
    '整箱卡包已就绪！',
  ],
  en: [
    "Reading the account's project list...",
    'Checking languages & project structure one by one...',
    'Estimating the size of each project...',
    'Assessing each project, turning them into cards...',
    'The full box of packs is ready!',
  ],
}

// 高级模式：仓库不扫描，全部评测由模型给出
const STEPS_AI = {
  zh: ['连接模型', '推测仓库画像', '模型完成全部评测', '生成精灵卡'],
  en: ['Connect model', 'Guess repo profile', 'Model runs all evaluations', 'Generate sprite card'],
}
const DIALOGS_AI = {
  zh: [
    '带上评测规则，连接你的模型...',
    '模型正在凭知识推测这个项目的画像...',
    '品质 / 六维 / 根基 / 词条 / 等级，连 4 个技能的名字 / 威力 / 解锁等级，全部按项目交给模型制定...',
    '把模型的结果填进卡面...',
    'AI 推测卡包已就绪！',
  ],
  en: [
    'Bringing the eval rules, connecting to your model...',
    "The model is guessing this project's profile from its knowledge...",
    "Quality / six stats / foundation / traits / level, plus the 4 skills' names / power / unlock levels — all left to the model per project...",
    'Filling the card face with the model’s results...',
    'AI-guess pack ready!',
  ],
}

// 揭晓 / 详情：区分「真实审计 + 模型总评」与「纯模型推测」
function AiNote({ pet }) {
  const { t } = useI18n()
  if (!pet?.aiEvaluated) return null
  if (pet.audited) {
    return (
      <div className="ai-note">
        <b>{t('深度审计', 'Deep Audit')}</b>
        {t(' · 前端真实抓取了本仓库（语言构成 / 目录线索 / 提交与贡献者 / 发行版等证据）， 随后交给模型', ' · The frontend really fetched this repo (evidence: language mix / directory clues / commits & contributors / releases), then handed it to the model')}{' '}
        <b> {pet.aiModel || t('（未标注）', '(unlabeled)')} </b>
        {pet.aiProviderLabel && <b>{t('（', '(')}{pet.aiProviderLabel}{t('）', ')')}</b>}
        {t(' 基于证据总评； 品质 / 六维 / 根基 / 词条 / 等级与 4 个技能由模型按项目制定，本地未运行规则引擎', ' reviewed the evidence; quality / six stats / foundation / traits / level and the 4 skills were set by the model per project — no local rule engine ran')}{pet.aiHint ? t(`；补充要求：${pet.aiHint}`, `; extra requirement: ${pet.aiHint}`) : ''}{t('。 分享卡上会盖上这枚模型的全息钢印。', '. A holographic stamp of this model is embossed on the share card.')}
        {pet.aiComment && <span className="ai-comment">{t('「', '“')}{pet.aiComment}{t('」', '”')}</span>}
        {pet.aiEvidence && <span className="ai-comment">{t('模型依据：', 'Evidence used: ')}{pet.aiEvidence}</span>}
        {pet.aiWarnings?.length > 0 && (
          <span className="ai-warn">{t(`模型输出有 ${pet.aiWarnings.length} 项不完整，已做安全兜底：`, `${pet.aiWarnings.length} model outputs were incomplete, safe fallbacks applied: `)}{pet.aiWarnings.slice(0, 2).join(t('；', '; '))}</span>
        )}
      </div>
    )
  }
  return (
    <div className="ai-note">
      <b>{t('AI 推测', 'AI Guess')}</b>
      {t(' · 非真实扫描，品质 / 六维 / 根基 / 词条 / 等级，以及 4 个技能的 名称 / 属性 / 威力 / 解锁等级 / 描述，全部由模型', ' · Not a real scan; quality / six stats / foundation / traits / level, plus the 4 skills’ name / element / power / unlock level / description — all decided by the model')}
      <b> {pet.aiModel || t('（未标注）', '(unlabeled)')} </b>
      {pet.aiProviderLabel && <b>{t('（', '(')}{pet.aiProviderLabel}{t('）', ')')}</b>}
      {t('按项目制定，本地未运行规则引擎', ' set per project — no local rule engine ran')}{pet.aiHint ? t(`；补充要求：${pet.aiHint}`, `; extra requirement: ${pet.aiHint}`) : ''}{t('。 分享卡上会盖上这枚模型的全息钢印。', '. A holographic stamp of this model is embossed on the share card.')}
      {pet.aiComment && <span className="ai-comment">{t('「', '“')}{pet.aiComment}{t('」', '”')}</span>}
      {pet.aiEvidence && <span className="ai-comment">{t('推测依据：', 'Basis for the guess: ')}{pet.aiEvidence}</span>}
      {pet.aiWarnings?.length > 0 && (
        <span className="ai-warn">{t(`模型输出有 ${pet.aiWarnings.length} 项不完整，已做安全兜底：`, `${pet.aiWarnings.length} model outputs were incomplete, safe fallbacks applied: `)}{pet.aiWarnings.slice(0, 2).join(t('；', '; '))}</span>
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
  const { t, lang } = useI18n()
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
  // 竞技场双通道：classic=规则引擎回合制；ai=高级竞技场（模型对比两个项目水平 + 审计报告）
  const [battleChannel, setBattleChannel] = useState('classic') // classic | ai
  // 排行榜"挑战"：要挑战的对手仓库地址，进竞技场时自动扫描并锁进在线模式
  const [battleChallenge, setBattleChallenge] = useState(null)
  // 排行榜「观摩」：只读展示对方仓库扫出来的卡面
  const [preview, setPreview] = useState(null) // null | {full, loading} | {full, pet} | {full, error}
  const [muted, setMuted] = useState(sfx.muted)
  // 高级模式：自填 LLM，所有评测交给模型
  const [advanced, setAdvanced] = useState(false)
  const [llmConfig, setLLMConfig] = useState(loadLLMConfig)
  const [llmHint, setLLMHint] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  // 揭晓页「重新鉴定」：AI 卡再让模型 roll 一次
  const [revalBusy, setRevalBusy] = useState(false)
  const [revalCount, setRevalCount] = useState(0)
  const [revalError, setRevalError] = useState('')
  const [bindState, setBindState] = useState(() => (llmConfig.binding && llmConfig.apiKey ? 'bound' : 'idle'))
  const [bindError, setBindError] = useState('')
  // 开启高级模式前的连接测试：没通过不放行
  const [pingTesting, setPingTesting] = useState(false)
  const [gateMsg, setGateMsg] = useState(null) // { type: 'ok' | 'err', text }
  // 深度审计演出（docs/AI-AUDIT.md）：事件流（等级滚动与进化在审计台内完成）
  const [auditEvents, setAuditEvents] = useState([])
  const auditSkipRef = useRef(false) // 跳过：节拍归零（同步给 runDeepAudit）
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
  const typed = useTypewriter(view === 'scan' ? (advanced ? DIALOGS_AI : mode === 'owner' ? DIALOGS_OWNER : DIALOGS)[lang] : [])

  // 扫描阶段推进：每亮一格给一声，音高上行
  useEffect(() => {
    if (view !== 'scan' || step === 0) return
    sfx.scanStep(step)
  }, [step, view])

  useEffect(() => {
    // 本地镜像先上屏（不等网络），随后异步做启动同步（契约 §5），
    // 合并结果回来再回填一次状态——同步失败就一直用本地，不阻塞首屏
    setCollection(loadCollection())
    startupSync().then((merged) => { if (merged) setCollection(merged) })
  }, [])

  // 启动：拉会话 + 登录方式，决定首屏是授权页还是首页
  useEffect(() => {
    let alive = true
    const query = consumeAuthQuery()
    if (query?.status === 'failed') {
      setAuthNotice(decodeURIComponent(query.reason || '') || t('授权没有完成，再试一次', 'Authorization was not completed, try again'))
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
      // 只接管启动首屏（boot/auth）；用户已导航到别的页（如设置）时不能覆盖回去
      const target = loggedIn || guestSkipped() ? 'home' : 'auth'
      setView((prev) => (prev === 'boot' || prev === 'auth' ? target : prev))
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
    markDirty(updated) // 结算落盘后进脏队列，debounce 推送服务端
    const mine = updated.find((p) => pet && p.fullName === pet.fullName && p.platform === pet.platform)
    if (mine) setPet(mine)
  }

  const fail = (e) => {
    setError(e.message || t('扫描失败，请检查地址', 'Scan failed, check the URL'))
    sfx.error()
    setProgress(null)
    setView('home')
  }

  const run = () => {
    if (!url.trim()) { setError(advanced ? t('请输入仓库地址或项目名', 'Enter a repo URL or project name') : t('请输入仓库或账号地址', 'Enter a repo or account URL')); sfx.error(); return }
    if (advanced) { runAdvanced(); return }
    const info = parseRepoInput(url)
    if (!info) { setError(t('无法识别的地址：仓库链接、账号主页都行', "Unrecognized URL: a repo link or an owner's profile page works")); sfx.error(); return }
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
      // 同厂商重新探测时保留用户手动选过的模型（如点「拉取模型列表」不该把选择清掉）
      const keep = cfg.binding?.provider === binding.provider
        && cfg.binding?.model
        && binding.models?.includes(cfg.binding.model)
        ? cfg.binding.model : null
      const model = keep || binding.model
      const next = { ...cfg, binding: { ...binding, model }, baseUrl: binding.baseUrl, model }
      setLLMConfig(next)
      saveLLMConfig(next)
      setBindState('bound')
      return next
    } catch (e) {
      const msg = e.message || t('自动绑定失败', 'Auto-binding failed')
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

  // 高级模式（深度评测）开启状态持久化：刷新 / 重启后密钥还在就自动恢复，
  // 避免「深度评测怎么没了」的静默消失；密钥本身只存 sessionStorage（不落盘）。
  const persistAiMode = (on) => {
    try {
      if (on) localStorage.setItem('gitmon:ai-mode', '1')
      else localStorage.removeItem('gitmon:ai-mode')
    } catch { /* 隐私模式下忽略 */ }
  }

  useEffect(() => {
    let saved = false
    try { saved = localStorage.getItem('gitmon:ai-mode') === '1' } catch { /* noop */ }
    if (!saved) return
    if (llmConfig.apiKey?.trim() && llmConfig.binding) {
      setAdvanced(true)
      return
    }
    // 上次开着、但本会话密钥没了（新标签页 / 隐私窗口）：说明原因并打开入口
    setGateMsg({ type: 'err', text: t('深度评测（AI高级版）的密钥只保存在本会话：重新粘贴 API Key，再点一次右上「AI高级版入口」即可恢复', 'The Deep Eval (AI Pro) key only lives in this session: paste your API Key again, then click “AI Pro Access” top-right to restore it') })
    if (guestSkipped() || cachedProfile()?.authenticated) setAdvOpen(true)
  }, [])

  // AI 入口：开启前必须先过连接测试（真打一次 chat/completions），
  // 绑定只验证过 /models 能列出模型，不能保证评测链路真的能通。
  const handleAiToggle = async () => {
    if (advanced) {
      setAdvanced(false)
      persistAiMode(false)
      setAdvOpen(false)
      setGateMsg(null)
      return
    }
    setAdvOpen(true)
    const cfg = llmConfig
    if (bindState === 'binding') {
      setGateMsg({ type: 'err', text: t('正在识别厂商…完成后再开启高级模式', 'Detecting provider… enable Advanced mode after it finishes') })
      return
    }
    if (!cfg.apiKey?.trim() || !cfg.binding) {
      setGateMsg({ type: 'err', text: t('先粘贴 API Key 完成识别，连接测试通过后才能开启高级模式', 'Paste an API Key to bind first; Advanced mode unlocks after the connection test passes') })
      sfx.error()
      return
    }
    setGateMsg(null)
    setPingTesting(true)
    try {
      const r = await pingWithLLM({ config: cfg })
      setAdvanced(true)
      persistAiMode(true)
      const sec = r.latencyMs != null ? ` ${(r.latencyMs / 1000).toFixed(1)}s` : ''
      setGateMsg({ type: 'ok', text: t(`连接测试通过（${r.model}${sec}）· 高级模式已开启`, `Connection test passed (${r.model}${sec}) · Advanced mode on`) })
      sfx.blip()
    } catch (e) {
      setGateMsg({ type: 'err', text: t(`连接测试未通过：${e.message}`, `Connection test failed: ${e.message}`) })
      sfx.error()
    } finally {
      setPingTesting(false)
    }
  }

  // 高级模式：不调 GitHub/Gitee API，也不跑 judge() —— 评测整体交给模型
  // raw：排行榜等入口可直接传仓库地址（url state 更新是异步的，读它会拿到旧值）
  const runAdvanced = async (raw) => {
    const input = String(raw ?? url).trim()
    const platform = /gitee\.com/i.test(input) ? 'gitee' : 'github'
    setError('')
    setAiBusy(true)

    // 没绑定就先自动绑定一次，用户不必记得点按钮
    let cfg = llmConfig
    if (!cfg.binding || bindState !== 'bound' || !cfg.apiKey?.trim()) {
      if (!cfg.apiKey?.trim()) {
        setError(t('先粘贴一枚 API Key（右上角 BYOK）；厂商和模型会自动识别', 'Paste an API Key first (BYOK, top right); provider and model are detected automatically'))
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

    // ---- 深度审计模式（默认开，docs/AI-AUDIT.md）：真实抓取 + 里程碑演出 + 证据总评 ----
    if (cfg.deepAudit !== false) {
      auditSkipRef.current = false
      setAuditEvents([])
      try {
        const result = await runDeepAudit({
          input,
          evaluate: (evidence) => evaluateWithLLM({ repo: input, config: cfg, hint: llmHint, platform, evidence }),
          onEvent: (ev) => setAuditEvents((prev) => [...prev, ev]),
          shouldSkip: () => auditSkipRef.current,
        })
        const { data, snap, midLevel, finalLevel } = result
        const next = buildPetFromEvaluation(data.evaluation, {
          input,
          platform,
          hint: llmHint,
          model: data.meta?.model || cfg.model,
          warnings: data.meta?.warnings || [],
          binding: cfg.binding,
        })
        // 真实审计抓到的事实覆盖模型推测段（star / 创建时间以抓取为准）
        if (snap) {
          next.stars = snap.stars
          next.createdAt = snap.createdAt || next.createdAt
          next.audited = true // 深度审计真实抓取成功 → 卡片盖「真实审计」章
        }
        setStep(3)
        // 等审计台把终场等级滚完（含进化收尾）再出卡——等级与勘测同步结算，撕卡时直接落定
        if (!auditSkipRef.current && finalLevel > midLevel) {
          await new Promise((r) => setTimeout(r, finalRollDuration(midLevel, finalLevel) + 550))
        }
        await new Promise((r) => setTimeout(r, 300))
        setPet(next)
        setView('pack')
      } catch (e) {
        fail(e)
      } finally {
        setAiBusy(false)
      }
      return
    }

    // ---- 即时推测模式（关闭深度审计的保底路径）----
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

  // 揭晓页「重新鉴定」：同一仓库再让模型评测一次，重 roll 品质 / 六维 / 技能 / 词条
  const handleReevaluate = async () => {
    if (revalBusy || !pet) return
    const cfg = llmConfig
    if (!cfg.apiKey?.trim() || !cfg.binding) {
      setRevalError(t('先在右上角 BYOK 绑定一枚 API Key，才能重新鉴定', 'Bind an API Key via BYOK (top right) first to re-appraise'))
      sfx.error()
      return
    }
    setRevalError('')
    setRevalBusy(true)
    try {
      const input = pet.fullName
      // 深度审计开着时，重新鉴定同样带真实抓取证据（耗时藏在「鉴定中…」后面）
      let evidence = null
      if (llmConfig.deepAudit !== false) {
        try {
          const snap = await scanRepo(input, { fresh: false })
          evidence = buildEvidence(snap, '')
        } catch { evidence = null /* 抓取失败退回纯推测 */ }
      }
      const data = await evaluateWithLLM({
        repo: input, config: cfg, hint: llmHint, platform: pet.platform || 'github', evidence,
      })
      const built = buildPetFromEvaluation(data.evaluation, {
        input,
        platform: pet.platform || 'github',
        hint: llmHint,
        model: data.meta?.model || cfg.model,
        warnings: data.meta?.warnings || [],
        binding: cfg.binding,
      })
      // 高级模式不调 GitHub/Gitee：stars 与养成进度（经验/羁绊/战绩）保留原值，只换模型评测段
      const next = {
        ...built,
        stars: pet.stars,
        createdAt: pet.createdAt || built.createdAt,
        exp: pet.exp, bond: pet.bond, fedAt: pet.fedAt,
        battles: pet.battles, wins: pet.wins, status: pet.status,
      }
      setPet(next)
      if (box) {
        setBox({
          ...box,
          pets: box.pets.map((p) => (p.fullName === pet.fullName && p.platform === pet.platform ? next : p)),
        })
      }
      if (collection.some((p) => p.fullName === pet.fullName && p.platform === pet.platform)) {
        setCollection(upsertPet(loadCollection(), next))
        markDirty(next)
      }
      setRevalCount((n) => n + 1)
      sfx.blip()
    } catch (e) {
      setRevalError(e.message || t('重新鉴定失败，请稍后重试', 'Re-appraisal failed, try again later'))
      sfx.error()
    } finally {
      setRevalBusy(false)
    }
  }

  // 深度审计：跳过演出（节拍归零，runDeepAudit 通过 shouldSkip 轮询）
  const handleSkipAudit = () => { auditSkipRef.current = true }

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
        if (res.rateLimited) throw new Error(t('API 触发限流，稍后再试（登录后额度高得多）', 'API rate limited, try again later (logged-in quota is much higher)'))
        // 三种空结果要分开说，不然永远看不出是接口没给数据、还是被过滤掉了
        if (!total) throw new Error(t(`${plat} 接口没有返回任何项目（仓库可能全是私有的，或授权没带上仓库权限）`, `${plat} returned no projects (they may all be private, or the grant had no repo scope)`))
        if (!res.listed) {
          // 把原始字段摊开，才知道是 fork 判错还是空仓库判错
          const sample = (res.owner?.repos || []).slice(0, 3)
            .map((r) => `${r.name}［fork=${r.raw?.fork} parent=${!!r.raw?.parent} empty_repo=${r.raw?.empty_repo} size=${r.raw?.size}］`)
            .join('；')
          throw new Error(t(`名下有 ${total} 个项目，但都被判为 fork 或空仓库：${sample}`, `${total} projects under this account were all judged fork or empty: ${sample}`))
        }
        const first = res.failed[0]
        throw new Error(t(`${res.listed} 个项目全部扫描失败：${first?.reason || '未知原因'}`, `all ${res.listed} projects failed to scan: ${first?.reason || 'unknown reason'}`))
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

  // 从排行榜把 GitHub 趋势仓库直接抽成精灵（高级模式下走深度审计）
  const drawRepo = (fullName) => {
    const u = `https://github.com/${fullName}`
    setUrl(u)
    setError('')
    if (advanced) { runAdvanced(u); return }
    runRepo(u)
  }

  // 从排行榜挑战趋势仓库：带对手地址进竞技场（在线单项目模式，进去自动扫描）
  const challengeRepo = (fullName) => {
    if (collection.length === 0) {
      drawRepo(fullName) // 还没有出战精灵，先抽这只仓库当主力
      return
    }
    setBattleInitial(null)
    setBattleChallenge(`https://github.com/${fullName}`)
    setBattleChannel('classic')
    setView('battle')
  }

  // 离开竞技场就清掉挑战标记，下次从导航进是普通选模式
  useEffect(() => {
    if (view !== 'battle') setBattleChallenge(null)
  }, [view])

  // 观摩：只读地把对方仓库扫成一张卡看一眼，不入图鉴、不进战斗
  const previewRepo = (fullName) => {
    setPreview({ full: fullName, loading: true })
    scanRepo(`https://github.com/${fullName}`)
      .then((snap) => setPreview({ full: fullName, pet: judge(snap) }))
      .catch((e) => setPreview({ full: fullName, error: e.message || t('读取失败，稍后再试', 'Read failed, try again later') }))
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
    if (pet) {
      setCollection(upsertPet(loadCollection(), pet))
      markDirty(pet)
    }
    sfx.swoosh()
    setView('detail')
  }

  // 从卡箱开的那一只：收下就回卡箱，接着开下一包
  const backToBox = () => {
    if (pet) {
      setCollection(upsertPet(loadCollection(), pet))
      markDirty(pet)
    }
    sfx.swoosh()
    setView('box')
  }

  const saveAll = () => {
    let list = loadCollection()
    box?.pets.forEach((p) => { list = upsertPet(list, p) })
    setCollection(list)
    markDirty(box?.pets || [])
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
  const SUBVIEWS = ['scan', 'box', 'pack', 'reveal', 'detail', 'battle', 'training', 'leaderboard', 'settings', 'warehouse']
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
  const showBack = SUBVIEWS.includes(view)

  // 顶栏主导航（大厅 / 竞技场 / 训练场 / 排行榜 / 设置；收藏走右上「🧰 精灵仓库」）
  const NAV_ITEMS = [
    { key: 'home', label: t('大厅', 'Lobby') },
    { key: 'battle', label: t('竞技场', 'Arena') },
    { key: 'training', label: t('训练场', 'Training') },
    { key: 'leaderboard', label: t('排行榜', 'Leaderboard') },
    { key: 'settings', label: t('设置', 'Settings') },
  ]
  const navActive = (key) => view === key
  const navGo = (key) => {
    sfx.swoosh()
    // 顶栏进竞技场默认常规通道；AI 高级通道可在选场页顶切换（高级模式开启时）
    if (key === 'battle') setBattleChannel('classic')
    setView(key)
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
        <div className="topbar-inner">
          <div className="brand" onClick={reset}>
            <span className="logo">GitMon</span>
            <span className="tagline">{t('你的仓库，是一只活着的精灵', 'Your repo, a living sprite')}</span>
          </div>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`nav-tab ${navActive(item.key) ? 'active' : ''}`}
                onClick={() => navGo(item.key)}
              >{item.label}</button>
            ))}
          </nav>
          <div className="topbar-right">
            <div className="adv-wrap">
              <button
                className={`adv-btn ${advanced ? 'on' : ''}`}
                onClick={handleAiToggle}
                disabled={pingTesting}
                title={t('AI 高级版：用自己的模型评测仓库；开启前会先做一次连接测试', 'AI Pro: evaluate repos with your own model; a connection test runs before enabling')}
              >
                <span className={`adv-dot ${bindState === 'bound' ? 'ok' : ''}`} />
                <span className="adv-label-full">{pingTesting ? t('连接测试中…', 'Testing…') : t('AI高级版入口', 'AI Pro')}</span>
                <span className="adv-label-mini">{pingTesting ? '…' : 'AI'}</span>
              </button>
              {advOpen && (
                <>
                  <div className="adv-backdrop" onClick={() => setAdvOpen(false)} />
                  <div className="adv-pop">
                    <AdvancedPanel
                      config={llmConfig}
                      onConfigChange={(next) => {
                        setLLMConfig(next)
                        saveLLMConfig(next)
                        setGateMsg(null)
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
                        setGateMsg(null)
                        setAdvanced(false)
                        persistAiMode(false)
                      }}
                      busy={aiBusy}
                      bindState={bindState}
                      bindError={bindError}
                      gate={gateMsg}
                      pingTesting={pingTesting}
                      deepAudit={llmConfig.deepAudit !== false}
                      onDeepAuditChange={(next) => {
                        const nextCfg = { ...llmConfig, deepAudit: next }
                        setLLMConfig(nextCfg)
                        saveLLMConfig(nextCfg)
                      }}
                      onBind={handleBind}
                      onClose={() => setAdvOpen(false)}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              className="mute-btn"
              onClick={() => { sfx.blip(); setView('warehouse') }}
              title={t('精灵仓库', 'Sprite Vault')}
            >
              🧰 {t('精灵仓库', 'Sprite Vault')}
            </button>
            {auth.profile?.authenticated ? (
              <div
                className="user-chip"
                title={`${PROVIDER_LABEL[auth.profile.provider] || 'GitHub'} @${auth.profile.login} · ${t('配额', 'Quota')} ${quotaText(auth.profile)}`}
              >
                {auth.profile.avatar
                  ? <img src={auth.profile.avatar} alt="" />
                  : <span className="user-dot" />}
                <span className={`user-src${auth.profile.provider === 'gitee' ? ' is-gitee' : ''}`}>
                  {PROVIDER_LABEL[auth.profile.provider] || 'GitHub'}
                </span>
                <span className="user-name">@{auth.profile.login}</span>
                <span className="user-quota">{quotaText(auth.profile)}</span>
                <button className="user-out" onClick={onLogout}>{t('退出', 'Log out')}</button>
              </div>
            ) : view !== 'auth' && view !== 'boot' ? (
              <button className="mute-btn login-btn" onClick={() => setView('auth')}>{t('登录', 'Log in')}</button>
            ) : null}
            <a className="gh-link" href="https://github.com/4243342/gitmon" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </header>
      {showBack && (
        <div className="topbar-back-row">
          <button className="topbar-back" onClick={goBack} title={t('返回', 'Back')}>{t('← 返回', '← Back')}</button>
        </div>
      )}

      {view === 'boot' && (
        <main className="auth-page">
          <div className="auth-loading">{t('正在检查登录状态…', 'Checking login status…')}</div>
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
                    {PROVIDER_LABEL[auth.profile.provider] || 'GitHub'}{t(' · 已登录', ' · Logged in')}
                  </span>
                  <h2>{auth.profile.name || auth.profile.login}</h2>
                  <p>
                    @{auth.profile.login} ·{' '}
                    {box
                      ? <>{t('名下 ', 'Your ')}<b>{box.pets.length}</b>{t(' 个项目已抽成卡包', ' projects packed into cards')}</>
                      : t('正在读取你名下的项目…', 'Reading your projects…')}
                  </p>
                </div>
              </div>
              <div className="account-actions">
                <button className="primary-btn" onClick={runAccountBox}>
                  {box ? t('重新读取全部项目', 'Re-read All Projects') : t('读取我的项目', 'Read My Projects')}
                </button>
                {box && (
                  <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('box') }}>
                    {t(`打开我的卡箱（${box.pets.length} 包）`, `Open My Box (${box.pets.length} packs)`)}
                  </button>
                )}
                <button className="ghost-btn" onClick={() => setView('battle')} disabled={collection.length === 0}>
                  {t('进入竞技场', 'Enter Arena')}
                </button>
              </div>
              {advanced && (
                <div className="input-row account-adv-row">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !aiBusy && run()}
                    placeholder={t('深度审计单个仓库：github.com/owner/repo 或 owner/repo', 'Deep-audit one repo: github.com/owner/repo or owner/repo')}
                    spellCheck={false}
                  />
                  <button className="primary-btn" disabled={aiBusy} onClick={() => run()}>
                    {aiBusy ? t('AI 评测中…', 'AI evaluating…') : t('让模型评测并抽卡', 'Evaluate & Draw')}
                  </button>
                </div>
              )}
              {error && <p className="error">! {error}</p>}
              <p className="account-note">
                {t('登录账号不用再输入仓库地址 —— 你名下', 'Once you log in you never paste a repo URL again — each of your ')}<b>{t('每个项目自动生成一个卡包', 'projects gets its own pack')}</b>{t('， 私有仓库也会一起读出来（授权只读，不写代码）。', ', and private repos are read too (read-only grant, no code is written).')}
              </p>
            </section>
          ) : (
          <section className="hero">
            <DecoSprite seed="deco-thunder-01" colors={['#f5c542', '#ffdf7e']} body="biped" size={96} className="d1" />
            <DecoSprite seed="deco-water-02" colors={['#4a9eff', '#a8d8ff']} body="winged" size={72} className="d2" />
            <DecoSprite seed="deco-fire-03" colors={['#ff6b4a', '#ffb199']} body="slime" size={80} className="d3" />
            <h2>{t('仓库抽卡，召唤你的精灵', 'Draw Cards from Repos, Summon Your Sprites')}</h2>
            <p>
              {t('贴一个仓库地址，得到一个卡包；贴一个账号主页，得到', 'Paste a repo URL for one pack; paste an owner page to get ')}<b>{t('一整箱', 'a whole box')}</b>{t('——', ' — ')}<b>{t('品种由技术栈决定', 'Species by tech stack')}</b>{t('，', ', ')}<b>{t('品质由代码质量决定', 'Quality by code quality')}</b>{t('，', ', ')}<b>{t('等级由工程量决定', 'Level by project size')}</b>{t('。', '.')}
            </p>
            {advanced && (
              <p className="adv-on-note">
                {t('高级模式已开启 · 评测全部交给你的模型（BYOK）', 'Advanced mode on · evaluations all run on your own model (BYOK)')}
                <button onClick={() => { setAdvanced(false); persistAiMode(false); setAdvOpen(false); setError('') }}>{t('关闭', 'Off')}</button>
              </p>
            )}
            <div className="input-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !aiBusy && run()}
                placeholder={advanced ? t('仓库地址或项目名，例如 dify、Odoo、github.com/facebook/react', 'Repo URL or project name, e.g. dify, Odoo, github.com/facebook/react') : t('仓库：github.com/owner/repo　　账号：github.com/owner', 'Repo: github.com/owner/repo　　Owner: github.com/owner')}
                spellCheck={false}
              />
              <button onClick={run} disabled={aiBusy}>
                {aiBusy ? t('模型评测中…', 'Model evaluating…') : advanced ? t('让模型评测并抽卡', 'Evaluate & Draw') : t('抽卡', 'Draw')}
              </button>
            </div>
            {error && <p className="error">! {error}</p>}
            {advanced && error && (
              <p className="quota-note">
                {t('模型评测没成功，可以', 'Model evaluation failed — you can ')}
                <button onClick={() => { setAdvanced(false); persistAiMode(false); setAdvOpen(false); setError('') }}>{t('关闭高级模式 →', 'turn off Advanced mode →')}</button>
              </p>
            )}
            {/限流|403|配额/.test(error) && (
              <p className="quota-note">
                {t('匿名额度很容易打满', 'The anonymous quota fills up fast')}
                <button onClick={() => setView('auth')}>{t('去登录 GitHub / Gitee →', 'Log in to GitHub / Gitee →')}</button>
              </p>
            )}
            <p className="quota-note">
              {t('游客模式：匿名每小时 60 次，整箱抽卡容易打满', 'Guest mode: 60 anonymous draws per hour — a whole box can burn through it')}
              <button onClick={() => setView('auth')}>{t('登录后自动读我的仓库 →', 'Log in to auto-read my repos →')}</button>
            </p>
            <div className="examples">
              <span>{t('▶ 快试试：', '▶ Try:')}</span>
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
              <b>{t('项目 = 一包', 'Project = one pack')}</b>{t('　·　', ' · ')}<b>{t('账号 = 一整箱', 'Account = a whole box')}</b>{t('（该账号每个项目各一包，品质各算各的）', ' (one pack per project, each graded on its own)')}
            </p>
          </section>
          )}

          <div id="collection">
            <Collection list={collection} onPick={(p) => { setPet(p); setView('detail') }} />
          </div>

          <div className="home-features">
          <section className={`arena-entry ${advanced ? 'channels' : ''}`}>
            <div className="arena-copy">
              <h3>{t('竞技场', 'Arena')}</h3>
              <p>
                {t('三种打法：', 'Three ways to play: ')}<b>{t('在线对手', 'Online opponent')}</b>{t('（输入对方仓库，按真实实力 1v1）、', ' (enter their repo, 1v1 on true strength), ')}<b>{t('同类型对战', 'Same-type battle')}</b>{t('（找同属性仓库）、', ' (vs a repo of the same element), ')}<b>{t('随机宠物', 'Random pet')}</b>{t('（抽到谁打谁）。 开战后', ' (fight whoever you drew). Battles are ')}<b>{t('全自动', 'fully auto')}</b>{t('，不用点技能；可调难度的是后两种——属性克制、先制、异常状态和换人决定胜负，等级高不一定赢。', ' — no skill picking; the other two modes let you tune difficulty — type matchups, priority, status and switches decide it, and a higher level does not always win.')}
                {advanced && <>{t('　高级模式下还有一条 ', ' Advanced mode also unlocks the ')}<b>{t('AI 高级竞技场', 'AI Pro Arena')}</b>{t('通道：由模型对比两个项目的真实水平逐回合推演，结算附审计报告。', ' channel: the model compares both projects’ true strength round by round, and the settlement comes with an audit report.')}</>}
              </p>
            </div>
            <div className="arena-channel-btns">
              <button
                className="primary-btn"
                onClick={() => { setBattleInitial(null); setBattleChannel('classic'); setView('battle') }}
                disabled={collection.length === 0}
              >
                {collection.length === 0 ? t('先抽一只', 'Draw One First') : t('进入竞技场', 'Enter Arena')}
              </button>
              {advanced && (
                <button
                  className="ghost-btn arena-ai-btn"
                  onClick={() => { setBattleInitial(null); setBattleChannel('ai'); setView('battle') }}
                  disabled={collection.length === 0}
                  title={t('AI 高级竞技场：模型对比两个项目水平，结算提供审计报告（消耗模型额度）', 'AI Pro Arena: the model compares both projects and settles with an audit report (uses model quota)')}
                >
                  <span className="arena-ai-badge">AI</span>{t('高级竞技场', ' Pro Arena')}
                </button>
              )}
            </div>
          </section>

          <section className="training-entry">
            <div className="training-entry-copy">
              <h3>{t('训练场', 'Training')}</h3>
              <p>
                {t('六位 AI 教练随时待命：', 'Six AI coaches on call: ')}<b>Trae / WorkBuddy / Codex / Cursor / Claude Code / Grok Bot</b>{t('。 点一下直达对应软件，不耗体力、不影响竞技场战绩，去过的自动打卡。', '. One click jumps to that app — no stamina cost, no effect on your arena record, and visits are checked in automatically.')}
              </p>
            </div>
            <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('training') }}>
              {t('进入训练场', 'Enter Training')}
            </button>
          </section>

          <section className="leaderboard-entry">
            <div className="leaderboard-entry-copy">
              <h3>{t('GitHub 排行榜', 'GitHub Leaderboard')}</h3>
              <p>
                {t('GitHub 趋势榜实时拉取：', 'Live from the GitHub trending list: ')}<b>{t('今日 / 本周 / 本月', 'Today / This week / This month')}</b>{t('最火仓库，按 Star 增长排序。 点「抽卡」能直接把榜单上的仓库变成一只精灵，看看它是什么品种、什么品质。', ' hottest repos, sorted by Star growth. Hit “Draw” to turn a listed repo straight into a sprite and see its species and quality.')}
              </p>
            </div>
            <button className="ghost-btn" onClick={() => { sfx.swoosh(); setView('leaderboard') }}>
              {t('去看排行榜', 'View Leaderboard')}
            </button>
          </section>
          </div>

          <Manual />
        </main>
      )}

      {view === 'settings' && (
        <main className="settings-wrap">
          <Settings
            muted={muted}
            onMutedChange={setMuted}
            llmConfig={llmConfig}
            onLLMConfigChange={(next) => {
              setLLMConfig(next)
              saveLLMConfig(next)
              if (!next.binding && bindState !== 'binding') { setBindState('idle'); setBindError('') }
            }}
            llmHint={llmHint}
            onLLMHintChange={setLLMHint}
            onClearLLMKey={() => {
              clearLLMKey()
              const next = { ...llmConfig, apiKey: '', binding: null }
              setLLMConfig(next)
              saveLLMConfig(next)
              setBindState('idle')
              setBindError('')
              setAdvanced(false)
              persistAiMode(false)
            }}
            aiBusy={aiBusy}
            bindState={bindState}
            bindError={bindError}
            onBind={handleBind}
            petCount={collection.length}
            authed={!!auth.profile?.authenticated}
          />
        </main>
      )}

      {view === 'warehouse' && (
        <main className="home">
          <section className="hero">
            <h2>{t('精灵仓库', 'Sprite Vault')}</h2>
            <p>{t('抽到的每一只精灵都住在', 'Every sprite you draw lives ')}<b>{t('这里', 'here')}</b>{t(' —— 点开看详情、培育成长，或者直接带去对战。', ' — open one to view details, grow it, or take it straight into battle.')}</p>
          </section>
          {collection.length > 0 ? (
            <Collection list={collection} onPick={(p) => { setPet(p); setView('detail') }} />
          ) : (
            <div className="warehouse-empty">
              <p>{t('仓库空空如也 —— 先去大厅抽一包？', 'The vault is empty — draw a pack in the Lobby first?')}</p>
              <button className="primary-btn" onClick={() => { sfx.swoosh(); setView('home') }}>{t('去大厅抽卡', 'Go Draw in Lobby')}</button>
            </div>
          )}
        </main>
      )}

      {view === 'scan' && (advanced && llmConfig.deepAudit !== false ? (
        <AuditStage events={auditEvents} onSkip={handleSkipAudit} />
      ) : (
        <main className="scan">
          <div className="rpg-box">
            <p className="rpg-line">
              {typed}
              <span className="rpg-caret" />
            </p>
          </div>
          <ul className="scan-steps">
            {(advanced ? STEPS_AI : mode === 'owner' ? STEPS_OWNER : STEPS)[lang].map((s, i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>
                <span className="dot" />
                {s}
                {i < step && <em>OK!</em>}
              </li>
            ))}
          </ul>
          {progress && (
            <div className="scan-progress">
              <span>{t('正在判定 ', 'Judging ')}{progress.done}/{progress.total} · {progress.name}</span>
              <div className="sp-bar">
                <div className="sp-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
            </div>
          )}
        </main>
      ))}

      {view === 'box' && box && (
        <PackBox
          box={box}
          opened={opened}
          revealedAll={revealedAll}
          onOpen={(p) => { setPet(p); setView('pack') }}
          onOpenAll={() => setRevealedAll(true)}
          onSaveAll={saveAll}
          onExit={auth.profile?.authenticated ? backToAccount : reset}
          exitLabel={auth.profile?.authenticated ? t('回到我的主页', 'Back to My Home') : t('换个账号 / 仓库', 'Switch account / repo')}
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
            {pet.quality.name} · {pet.element.name}{t('系', ' ')}{pet.species.name}{t(' 登场', ' appears')}
          </h2>
          <AiNote pet={pet} />
          <PetCard key={revalCount} pet={pet} revealed />
          <div className="actions">
            {box ? (
              <>
                <button className="primary-btn" onClick={backToBox}>
                  {t('收下 · 回卡箱', 'Collect · Back to Box')}{box.pets.length - opened.size > 0 ? t(`（还剩 ${box.pets.length - opened.size} 包）`, ` (${box.pets.length - opened.size} left)`) : ''}
                </button>
                <button className="ghost-btn" onClick={goDetail}>{t('看详情', 'Details')}</button>
              </>
            ) : (
              <button className="primary-btn" onClick={goDetail}>{t('收入图鉴', 'Add to Dex')}</button>
            )}
            {llmConfig.apiKey?.trim() && llmConfig.binding && (
              <button
                type="button"
                className="reeval-btn"
                onClick={handleReevaluate}
                disabled={revalBusy}
                title={pet.aiEvaluated
                  ? t('用你绑定的模型对这个仓库再评测一次，重 roll 品质 / 六维 / 技能 / 词条', 'Re-evaluate this repo with your bound model — re-roll quality / six stats / skills / traits')
                  : t('用你的模型做一次 AI 专业评测：品质 / 六维 / 技能 / 词条全部由模型按项目定制，替代规则引擎的结果', 'Run a pro AI evaluation with your model: quality / six stats / skills / traits all customized per project, replacing the rule engine result')}
              >
                <span className="reeval-btn-text">
                  {revalBusy ? (pet.aiEvaluated ? t('鉴定中…', 'Appraising…') : t('评测中…', 'Evaluating…')) : (pet.aiEvaluated ? t('重新鉴定', 'Re-appraise') : t('AI 专业评测', 'Pro AI Eval'))}
                </span>
              </button>
            )}
            <button className="ghost-btn" onClick={() => exportShareCard(pet)}>{t('导出分享卡', 'Export Share Card')}</button>
            <button className="ghost-btn" onClick={reset}>{t('再抽一只', 'Draw Another')}</button>
          </div>
          {revalError && <p className="error reval-error">! {revalError}</p>}
        </main>
      )}

      {view === 'detail' && pet && (
        <main className="detail-stage">
          <AiNote pet={pet} />
          <PetCard pet={pet} />
          <div className="actions">
            <button className="primary-btn" onClick={() => exportShareCard(pet)}>{t('导出分享卡', 'Export Share Card')}</button>
            <button className="primary-btn" onClick={() => { setBattleInitial(pet); setBattleChannel('classic'); setView('battle') }}>{t('带它去对战', 'Take It to Battle')}</button>
            {box && <button className="ghost-btn" onClick={() => setView('box')}>{t('返回卡箱', 'Back to Box')}</button>}
            <button className="ghost-btn" onClick={reset}>{t('再抽一只', 'Draw Another')}</button>
          </div>
          <GrowPanel
            pet={pet}
            onUpdate={(next) => {
              setPet(next)
              setCollection(upsertPet(loadCollection(), next))
              markDirty(next)
            }}
          />
          <Collection list={collection} onPick={(p) => setPet(p)} />
        </main>
      )}

      {view === 'battle' && (
        <main className="battle-stage">
          <Battle
            pets={collection}
            initial={battleInitial}
            challenge={battleChallenge}
            channel={battleChannel}
            llmConfig={llmConfig}
            advanced={advanced}
            onChannel={setBattleChannel}
            onExit={() => { setBattleChannel('classic'); setView(battleInitial ? 'detail' : 'home') }}
            onReward={grantBattleXp}
          />
        </main>
      )}

      {view === 'training' && (
        <Training />
      )}

      {view === 'leaderboard' && (
        <Leaderboard onChallenge={challengeRepo} onPreview={previewRepo} canChallenge={collection.length > 0} />
      )}

      {/* 观摩弹层：对方仓库的项目卡面（只读） */}
      {preview && (
        <>
          <div className="preview-backdrop" onClick={() => setPreview(null)} />
          <div className="preview-pop" role="dialog" aria-label={t('观摩项目卡面', 'Preview project card')}>
            <div className="preview-head">
              <span className="preview-title">{t('观摩 · ', 'Preview · ')}<b>{preview.full}</b></span>
              <button className="preview-close" onClick={() => { sfx.back(); setPreview(null) }}>{t('✕ 关闭', '✕ Close')}</button>
            </div>
            {preview.loading && <p className="preview-loading">{t('正在读取对方仓库的档案…', "Reading the opponent's repo profile…")}</p>}
            {preview.error && <p className="error">! {preview.error}</p>}
            {preview.pet && (
              <>
                <PetCard pet={preview.pet} />
                <p className="preview-note">{t('只看不收 —— 想收服它，点行内的「挑战」进竞技场', 'View only — to catch it, tap “Challenge” in its row to enter the Arena')}</p>
              </>
            )}
          </div>
        </>
      )}

      <footer className="footer">
        {t('GitMon Prototype v0.3 · 数据来自 GitHub / Gitee 公开 API · 开包动画 pack-opener-js · 粒子 tsParticles · 对战机制参照 Pokémon Showdown（MIT）', 'GitMon Prototype v0.3 · Data from GitHub / Gitee public APIs · Pack animation pack-opener-js · Particles tsParticles · Battle mechanics modeled on Pokémon Showdown (MIT)')}
      </footer>
    </div>
  )
}
