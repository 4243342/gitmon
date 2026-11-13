import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { ELEMENTS, QUALITIES, SPECIES, combatPowerOf, hashSeed, stageFromLevel, statCapAtLevel } from '../engine.js'
import { createBattle, battleTurn, chooseAutoAction } from '../battle.js'
import { rivalPets, sameTypePool, scaleRival } from '../rivals.js'
import { sfx } from '../sfx.js'
import { bgm } from '../bgm.js'
import { tts, getTtsConfig, setTtsEnabled, unlockTts } from '../tts.js'
import PixelSprite from './PixelSprite.jsx'
import PetCard from './PetCard.jsx'
import StoryProgress from './StoryProgress.jsx'
import StoryOpening from './StoryOpening.jsx'
import StoryTransform from './StoryTransform.jsx'
import CangkeGame from '../cangke/CangkeGame.jsx'
import { CHARACTERS, createStoryRuntime } from '../story/runtime.js'
import { packArtUrl, packFaceUrl, packStageArtUrl } from '../story/packArt.js'
import { packAudioUrl } from '../story/packAudio.js'
import { packFxUrl } from '../story/packFx.js'
import { storyApi } from '../story/api.js'
import { createProgressWriter, replayDirty, dropDirty } from '../story/progressQueue.js'
import '../story.css'

const UNLOCK_LEVELS = [1, 1, 150, 500]
const ENDING_TITLES = {
  ending_trust: '内应线 · 有人替你开门',
  ending_scarred: '伤痕线 · 一路硬扛',
  ending_alone: '独行线 · 无人送行',
  ending_standard: '正线 · 各走各路',
}

// 舞台背景对应的"地点牌"：scene.bg 只有三个取值，标出来像 VN 的场景字卡
const BG_LABELS = {
  dawn: ['黎明', 'DAWN'],
  street_night: ['夜街', 'NIGHT STREET'],
  summit: ['山巅', 'SUMMIT'],
}

const keyOf = (p) => `${p.platform}-${p.fullName}`
const shortName = (fullName) => String(fullName || '').split('/').pop() || '未知'
const starsText = (n) => {
  const v = Number(n) || 0
  return v >= 10000 ? `${(v / 10000).toFixed(1)}w` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
}

// 中文界面里对手卡的一句话理由必须是中文；英文模式才用仓库原始英文描述。
// 防御旧缓存 / 旧后端：reason 里没有汉字时给中文兜底，不再退回英文 description。
const bossBlurb = (boss, isEn, t) => {
  const reason = String(boss?.reason || '')
  const description = String(boss?.description || '')
  if (isEn) return description || reason || t('同赛道的对手。', 'A rival in the same track.')
  if (/[\u4e00-\u9fff]/.test(reason)) return reason
  return t('同赛道的对手，量级与打法各不相同。', 'A rival in the same track.')
}

// 选对手时每张卡要画出它自己的精灵形象。
// 优先用后端 boss_card 里的 verdict（和建线后真正开打的那只同源）；
// 旧缓存 / 没有 verdict 时按仓库名做稳定哈希兜底 —— 同一只对手每次长得一样，不会跳。
// 品质五维：后端 quality_dims 的 key 与卡面展示名
const CARD_DIMS = [
  { key: 'tests', zh: '测试完备度', en: 'Tests' },
  { key: 'engineering', zh: '工程质量', en: 'Engineering' },
  { key: 'docs', zh: '文档完整度', en: 'Docs' },
  { key: 'maintenance', zh: '维护健康度', en: 'Maintenance' },
  { key: 'community', zh: '社区认可', en: 'Community' },
]

// 包自带正片：要么是整包静态页（entry），要么是内置的像素游戏（mode=pixel）
const packHasGame = (pack) => Boolean(pack?.game && (pack.game.entry || pack.game.mode))

// 与 engine.js computeStats 同一套阈值：按本等级理论上限归一化后分档
const gradeOfRatio = (ratio) => (ratio >= 0.9 ? 'S' : ratio >= 0.72 ? 'A' : ratio >= 0.5 ? 'B' : ratio >= 0.3 ? 'C' : 'D')

// 后端 verdict 的六维是 0–100 评分制（engine.py stats_for clamp 到 5..100，词条层再夹回一次），
// 玩家卡是随等级放大的绝对制（computeStats 的宝可梦公式）。直接拿评分值去画绝对制的卡，
// 六维条会缩成细丝、雷达缩成一个点，顶部 HP（评分×10 的 hack）与六维 HP 行（评分原值）
// 差 10 倍，评级也全部沉到 D。这里统一换算成「该等级的绝对制」：
// score/100 × 该属性的等级上限 —— 评分 100 即该等级满属性，卡面 / 雷达 / 战斗与玩家同标度。
// 旧数据若已是绝对制（>100）则原样保留，只按绝对制补评级。
function verdictToBattleStats(verdict, level) {
  const raw = (Array.isArray(verdict?.stats) ? verdict.stats : [])
    .map((s) => ({ name: String(s?.name || ''), value: Number(s?.value) || 0 }))
    .filter((s) => s.name)
  if (!raw.length) return { stats: [], maxHp: 0 }
  const scored = Math.max(...raw.map((s) => s.value)) <= 100
  const stats = raw.map((s) => {
    const cap = statCapAtLevel(level, s.name === 'HP')
    const value = scored ? Math.round((s.value / 100) * cap) : Math.round(s.value)
    return { name: s.name, value, grade: gradeOfRatio(cap > 0 ? value / cap : 0) }
  })
  const maxHp = scored
    ? (stats.find((s) => s.name === 'HP')?.value || 0)
    : (Number(verdict?.hp) || stats.find((s) => s.name === 'HP')?.value || 0)
  return { stats, maxHp }
}

// 把 preview 里的一只对手还原成完整 pet：选对手界面直接渲染成整张角色卡。
// 六维 / 技能 / 根基 / 词条全部来自后端同一张 boss_card，和真正开打的那只一致；
// 这里只做查表（key → 对象）和展示换算（评级 / 解锁态），不重新评测。
function bossPetFromCard(boss, isEn = false) {
  const v = boss?.verdict || {}
  const name = String(boss?.full_name || boss?.fullName || '')
  const h = hashSeed(name)
  const elementKeys = Object.keys(ELEMENTS)
  const speciesKeys = Object.keys(SPECIES)
  const element = ELEMENTS[v.element_key] || ELEMENTS[elementKeys[h % elementKeys.length]] || ELEMENTS.normal
  const elementSecondary = v.element_secondary ? ELEMENTS[v.element_secondary] || null : null
  const species = SPECIES[v.species_key] || SPECIES[speciesKeys[(h >>> 3) % speciesKeys.length]] || SPECIES.beast
  const quality = QUALITIES[v.quality] || QUALITIES[boss?.tier] || QUALITIES.N
  const level = Number(v.level) || Number(boss?.level) || 1
  // 评分制 verdict → 该等级绝对制：六维 / HP / 战力全部与玩家卡同口径
  const { stats, maxHp } = verdictToBattleStats(v, level)
  const skills = (Array.isArray(v.skills) ? v.skills : []).map((skill, i) => (
    typeof skill === 'string'
      ? { name: skill, unlockLevel: UNLOCK_LEVELS[i] || 1, unlocked: level >= (UNLOCK_LEVELS[i] || 1), element }
      : skill
  ))
  const dims = v.quality_dims || {}
  return {
    fullName: name,
    repo: shortName(name),
    platform: boss?.platform || 'github',
    stars: Number(boss?.stars) || 0,
    level,
    evolutionStage: Number(v.evolution_stage) || stageFromLevel(level),
    combatPower: combatPowerOf(stats, level),
    maxHp,
    statCap: statCapAtLevel(level, true),
    stats,
    skills,
    element,
    elementSecondary,
    species,
    quality,
    qualityKey: quality.key,
    qualityScore: Math.round(Number(v.quality_score) || 0),
    qualityDims: CARD_DIMS.map((d) => ({ key: d.key, name: isEn ? d.en : d.zh, value: Math.round(Number(dims[d.key]) || 0) })),
    engineeringScore: Math.round(Number(v.engineering_score) || 0),
    foundation: Math.round(Number(v.foundation) || 0),
    foundationTier: v.foundation_tier || null,
    traits: Array.isArray(v.traits) ? v.traits : [],
    status: boss?.status || 'active',
    spriteSeed: Number(v.sprite_seed) || (h % 100000),
    seed: Number(v.seed) || h,
    aiEvaluated: false,
  }
}

function bossPetFromRun(run) {
  const b = run?.boss || {}
  const v = b.verdict || {}
  const element = ELEMENTS[v.element_key] || ELEMENTS.normal
  const secondary = v.element_secondary ? ELEMENTS[v.element_secondary] : null
  const species = SPECIES[v.species_key] || SPECIES.element
  const quality = QUALITIES[v.quality] || QUALITIES.N
  const level = Number(v.level) || Number(b.level) || 1
  // 与选卡界面同一套换算：评分制 verdict → 绝对制，保证「选到的」和「开打的」数值一致
  const { stats, maxHp } = verdictToBattleStats(v, level)
  const skills = (v.skills || []).map((skill, i) => (
    typeof skill === 'string'
      ? { name: skill, unlockLevel: UNLOCK_LEVELS[i] || 1, unlocked: level >= (UNLOCK_LEVELS[i] || 1) }
      : skill
  ))
  return {
    fullName: b.full_name,
    repo: shortName(b.full_name),
    platform: b.platform || 'github',
    level,
    stats,
    skills,
    maxHp,
    combatPower: combatPowerOf(stats, level),
    element,
    elementSecondary: secondary,
    species,
    quality,
    qualityKey: quality.key,
    spriteSeed: Number(v.sprite_seed) || 0,
  }
}

function pickMinion(player, chapter, seed) {
  const element = player?.element?.key || player?.element_key || 'normal'
  let pool = []
  try { pool = sameTypePool(element, player) } catch { pool = [] }
  if (!pool.length) pool = rivalPets()
  if (!pool.length) return null
  // 杂兵按战力选：目标 = 玩家 CP × 0.55 → 0.95（随章序递增），再按倍率把真实仓库压到该量级
  const playerCp = Number(player?.combatPower) || 500
  const targetCp = Math.max(50, Math.round(playerCp * (0.55 + 0.08 * Math.max(0, chapter))))
  const near = [...pool].sort((a, b) => Math.abs((a.combatPower || 0) - targetCp) - Math.abs((b.combatPower || 0) - targetCp))
  const window = near.slice(0, Math.max(3, Math.min(near.length, 6)))
  const index = Math.abs((Number(seed) || 1) + chapter * 7) % window.length
  const base = window[index]
  const factor = Math.max(0.08, Math.min(2.5, targetCp / Math.max(1, Number(base.combatPower) || 1)))
  return scaleRival(base, factor)
}

export default function StoryMode({ pets = [], llmConfig = null, onExit, onReward, onLockChange }) {
  const { t, isEn } = useI18n()
  const [view, setView] = useState('loading') // loading | cast | boss | script | play | ended
  const [error, setError] = useState('')
  // 空字符串 = 没有任务；字符串/对象 = 正在跑（对象可带真实阶段与开始时间）
  const [busy, setBusy] = useState('')
  // 长任务统一带上开始时间：既显示已等多久，也用来判断是不是比平时慢
  const beginBusy = (title, extra = {}) => setBusy({ title, startedAt: Date.now(), ...extra })

  const [pet, setPet] = useState(null)
  const [preview, setPreview] = useState(null)
  const [bossPick, setBossPick] = useState(null)
  const [scripts, setScripts] = useState(null)
  const [scriptPick, setScriptPick] = useState(null)
  // 剧本是谁写的：llm / mixed / rule。降级必须让玩家看见，否则模板剧本会被当成 AI 的产出
  const [scriptSource, setScriptSource] = useState('')
  const [scriptNote, setScriptNote] = useState('')
  // 03 步三选一：'' 未选 / system 内置剧本 / custom 自定义 / ai 模型生成
  const [scriptMode, setScriptMode] = useState('')
  // 包自带正片（仓可梦 = 开源宝可梦 PokéRogue）：选中这一包就直接进游戏，
  // 不再走占位 VN 剧情。入口写在包元信息 game.entry 里，前端不写死包 id。
  const [gamePack, setGamePack] = useState(null)
  // 系统剧本包清单（斗码苍穹等）。玩家在系统剧本里先选包，再选包里的方案
  const [packs, setPacks] = useState([])
  const [packPick, setPackPick] = useState('')
  // 当前剧情线用的剧本包：决定正片跑哪条路线
  const [runPack, setRunPack] = useState('default')

  const [run, setRun] = useState(null)
  const [scene, setScene] = useState(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [battleUi, setBattleUi] = useState(null)
  const [history, setHistory] = useState([])
  const [saves, setSaves] = useState([])
  const [endings, setEndings] = useState([])
  const [latest, setLatest] = useState(null)
  const [reward, setReward] = useState(null)
  const [panel, setPanel] = useState('')
  const [customBoss, setCustomBoss] = useState('')
  const [customScript, setCustomScript] = useState('')
  // 自定义剧本：记下玩家输入，03 步据此标明「这三条是照你的本子写的」
  const [customSeed, setCustomSeed] = useState('')
  // 音乐开关：与设置页共用 bgm.muted，这里给剧情页一个就近的快捷键
  const [bgmOn, setBgmOn] = useState(() => !bgm.muted)
  // 语音开关：与设置页共用 gitmon:tts.enabled
  const [voiceOn, setVoiceOn] = useState(() => getTtsConfig().enabled)
  // 备战三步（选主角 / 选对手 / 选剧本）共用一首慢速远征曲；进正片或离开就收掉
  const setupView = view === 'cast' || view === 'boss' || view === 'script'
  useEffect(() => {
    if (setupView) bgm.startStory()
    else bgm.stop()
  }, [setupView])
  // 卸载（返回大厅）时别把音乐留在后台；写入队列也停掉，别再往外发
  useEffect(() => () => { bgm.stop(); tts.stop(); writerRef.current?.stop() }, [])
  // 语音降级（端点不支持 / 没绑 key）只提示一次，不打断剧情推进
  const [voiceNote, setVoiceNote] = useState('')
  // 进度暂存提示（断网 / 后端 5xx 时那一屏还没进服务器）
  const [syncNote, setSyncNote] = useState('')
  useEffect(() => {
    const onDown = (evt) => {
      const detail = evt?.detail || {}
      const why = detail.reason === 'nomodel'
        ? t('本地语音模型没装，已改用系统朗读', 'Local voice model missing — using the system voice')
        : detail.reason === 'unsupported'
          ? t('当前模型端点不提供语音合成，已改用系统朗读', 'This endpoint has no speech API — using the system voice')
          : detail.reason === 'unstable'
            ? t('在线语音连续失败，已改用系统朗读', 'Online voice kept failing — using the system voice')
            : t('没有可用的模型密钥，已改用系统朗读', 'No model key available — using the system voice')
      setVoiceNote(detail.hint ? `${why}（${detail.hint}）` : why)
    }
    window.addEventListener('gitmon:tts-downgrade', onDown)
    return () => window.removeEventListener('gitmon:tts-downgrade', onDown)
  }, [t])
  useEffect(() => {
    if (!voiceNote) return undefined
    const timer = setTimeout(() => setVoiceNote(''), 8000)
    return () => clearTimeout(timer)
  }, [voiceNote])

  const runtimeRef = useRef(null)
  const runRef = useRef(null)
  const petRef = useRef(null)
  const sceneRef = useRef(null)
  // 当前剧情线用的剧本包：台词请求要按包取世界观 / 文风，闭包里读不到 state，另存一份 ref
  const runPackRef = useRef('default')
  // 切包时 state 与 ref 一起更新，避免闭包读到旧的包
  const applyRunPack = useCallback((packId) => {
    const id = String(packId || 'default')
    runPackRef.current = id
    setRunPack(id)
  }, [])
  const historyRef = useRef([])
  const visitedRef = useRef([])
  const stackRef = useRef([])
  const rollbackRef = useRef('')
  const bossPetRef = useRef(null)
  // 推进锁：台词生成期间（最多 8s）禁止重复点选项 / 点两次「继续」
  const advancingRef = useRef(false)
  // 用户已经主动往前走了（选了主角 / 对手 / 剧本）。
  // 启动时的 current() 可能回来得比这一步还晚（后端慢、StrictMode 双跑各一份），
  // 那时再无条件下 setView('cast') 就会把人从「选对手」打回「选主角」。
  const advancedRef = useRef(false)
  // 选对手是长请求：编号只增，迟到的旧结果不许覆盖新的（连点 / 换一批）
  const previewSeqRef = useRef(0)

  // 剧情流程只往前走：一旦用户选了主角，任何迟到的异步结果都不许把视图写回「选主角」。
  // 否则「抽对手」这几十秒里只要有一个过期回调落地，用户看到的就是"抽完对手，页面自己退回上一步"。
  const goView = useCallback((next) => {
    setView((prev) => (next === 'cast' && prev !== 'loading' && advancedRef.current ? prev : next))
  }, [])

  useEffect(() => { runRef.current = run }, [run])
  useEffect(() => { petRef.current = pet }, [pet])
  useEffect(() => { sceneRef.current = scene }, [scene])

  // 台词来源：这一屏的台词从哪来
  //
  // 系统剧本（source=system）**不接 AI 生成**：剧本包里的 lines.json 就是定稿，
  // 每一句都已按包的世界观写好。让模型再改一遍只会把它改回通用赛博腔 ——
  // 那是「选了系统剧本却没看到系统剧本」。所以系统剧本直接跳过 fetchTexts，
  // 运行时会自然落到包内 lines.json 的兜底文案。
  //
  // AI 剧本 / 自定义剧本才走模型：那里的台词本来就是「现写」的。
  const isSystemScript = useCallback(() => {
    const r = runRef.current
    if (!r) return false
    // script_source 在建线时落库：system=包内方案，ai/mixed=模型现写，manual=自定义底本
    return r.script_source === 'system'
  }, [])

  const makeFetcher = useCallback(() => async ({ sceneId, keys, vars }) => {
    const cfg = llmConfig
    const r = runRef.current
    // 系统剧本：直接交回包内定稿，一次模型调用都不花。
    // 返回 { texts:{}, source:'script' } 而不是 null —— runtime 靠 source
    // 区分「模型写的」和「剧本定稿」，界面上的标记才能说对。
    if (isSystemScript()) return { texts: {}, source: 'script' }
    if (!cfg?.apiKey || !keys?.length) return null
    return storyApi.text({
      sceneId,
      keys,
      vars,
      context: {
        pet_name: r?.pet_name || petRef.current?.fullName || '',
        boss_name: r?.boss?.full_name || '',
        brief: r?.script_brief || '',
        // 玩家选的剧本（标题 + 三个节拍）必须跟着每一屏的台词请求走
        script_title: r?.script_title || '',
        script_beats: r?.script_beats || [],
        // 剧本包：后端按包注入世界观与文风，缓存键也按包隔离
        pack: r?.script_pack || runPackRef.current || 'default',
        // 台词来源：system=系统剧本（后端据此拒绝调模型，用包内 lines.json 定稿）
        script_source: r?.script_source || '',
      },
      config: cfg,
    })
  }, [llmConfig, isSystemScript])

  // 语言切换后，闭包里的回调也要读到最新的 t
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  // 写入队列放在 ref 里：重渲染 / 切语言都不重建，重建会把正在飞的那一屏弄丢
  const writerRef = useRef(null)
  // 结算奖励也存一份 ref：结案时 setReward 还没重新渲染，闭包里的 reward 是旧的
  const rewardRef = useRef(null)
  // 409 过期后要重新拉服务端状态；resync 依赖 persistScene，只能经 ref 回环
  const resyncRef = useRef(null)
  const writer = useCallback(() => {
    if (!writerRef.current) {
      writerRef.current = createProgressWriter({
        send: (payload) => storyApi.progress(payload),
        onApplied: (res) => {
          if (!res?.run) return
          runRef.current = res.run
          setRun(res.run)
          if (res.cleared && res.reward) {
            rewardRef.current = res.reward
            setReward(res.reward)
          }
        },
        onQueued: () => setSyncNote(tRef.current(
          '这一屏还没写进服务器：已暂存在本机，联网后自动补发',
          'This scene is not saved yet — queued on this device and will sync once you are online',
        )),
        onRecovered: () => setSyncNote(''),
        onError: (err) => {
          setError(err.message)
          if (err?.expired) resyncRef.current?.()
        },
      })
    }
    return writerRef.current
  }, [])

  const persistScene = useCallback((next) => {
    if (!runRef.current) return
    // 这一屏自身的字段此刻定下来；step / visited / history 留到真正发送时再读，
    // 否则连点时后一屏会带着前一屏的 step 发出去，被后端的乐观锁判 409。
    const snapshot = {
      scene_id: next.sceneId || (next.ended ? 'ending' : ''),
      // 存「本屏开始前」的快照：读档 / 重进时能重新渲染同一屏
      ink_state: next.stateIn || '',
      vars: next.vars || {},
      ending_id: next.ended ? (next.endingId || '') : '',
    }
    writer().push(() => {
      const r = runRef.current
      if (!r) return null
      return {
        run_id: r.id,
        step: r.step,
        ...snapshot,
        visited: visitedRef.current,
        history: historyRef.current.slice(-100),
        rollback_state: rollbackRef.current,
      }
    })
  }, [writer])

  const applyScene = useCallback((next, { persist = true } = {}) => {
    sceneRef.current = next
    setScene(next)
    setLineIndex(0)
    setBattleUi(null)
    goView(next.ended ? 'ended' : 'play')

    const lines = (next.lines || []).map((line) => ({ ...line, sceneId: next.sceneId }))
    // 换屏先掐掉上一屏的语音；先开口念第一句，再预取后面的
    // （本地是 CPU 串行合成，预取抢在前面只会把开口时间往后拖）
    tts.stop()
    // 解说屏自带成品配音：不让 TTS 再念一遍，否则两路声音叠在一起
    const isOpening = Boolean(next.narration)
    if (lines.length && !isOpening) {
      const auto = getTtsConfig().autoFirst && !next.battle
      const opening = auto
        ? tts.speak({ who: lines[0].who, text: lines[0].text, key: lines[0].key })
        : Promise.resolve()
      opening.catch(() => {}).then(() => tts.prefetch(lines.slice(auto ? 1 : 0)))
    }
    if (lines.length) {
      const merged = [...historyRef.current, ...lines].slice(-100)
      historyRef.current = merged
      setHistory(merged)
    }
    if (next.sceneId && !visitedRef.current.includes(next.sceneId)) {
      visitedRef.current = [...visitedRef.current, next.sceneId]
    }
    stackRef.current = [...stackRef.current, next.stateIn].slice(-30)
    rollbackRef.current = stackRef.current.length > 1 ? stackRef.current[stackRef.current.length - 2] : ''
    if (persist) persistScene(next)
  }, [persistScene, goView])

  // 主角精灵被删 / 放生：按设计 §8 自动结案并解锁桌宠，不用桩对象顶着进战斗
  // 结案是幂等的但没必要打三次：resume 和图鉴效应都会发现同一个事实，用 run id 去重
  const abandoningRef = useRef('')
  const abandonRun = useCallback(async (activeRun, why) => {
    if (!activeRun?.id || abandoningRef.current === activeRun.id) return
    abandoningRef.current = activeRun.id
    try { await storyApi.close(activeRun.id, 'abandoned') } catch { /* 已经结案也算成功 */ }
    writerRef.current?.stop()
    writerRef.current = null
    dropDirty(activeRun.id)
    onLockChange?.(null)
    runRef.current = null
    sceneRef.current = null
    setRun(null)
    setScene(null)
    setError(why)
    setView('cast')
  }, [onLockChange])

  // 服务端存的 history 末尾就是即将重渲染的这一屏（写入时本屏台词已经进过 history），
  // 重放同一屏不该让它在「回想」里出现两遍
  const trimTailForScene = (sceneId) => {
    const list = historyRef.current
    if (!sceneId || list[list.length - 1]?.sceneId !== sceneId) return
    while (list.length && list[list.length - 1].sceneId === sceneId) list.pop()
    historyRef.current = list.slice()
    setHistory(historyRef.current)
  }

  const resume = useCallback(async (activeRun, slotList) => {
    const owner = pets.find((p) => keyOf(p) === activeRun.pet_key)
    // 图鉴已加载完却找不到主角 = 这只精灵被删了（本机或别端）。
    // 但 pets 为空只说明图鉴还没加载完 —— 那时判死线是错的。
    if (!owner && pets.length) {
      await abandonRun(activeRun, t(
        '主角精灵已不在图鉴里，这条剧情线已自动结案',
        'The protagonist sprite is gone — this run was closed automatically',
      ))
      return
    }
    const fallbackPet = owner || { fullName: activeRun.pet_name, repo: shortName(activeRun.pet_name), platform: 'github' }
    setPet(fallbackPet)
    petRef.current = fallbackPet
    setRun(activeRun)
    runRef.current = activeRun
    setSaves(slotList || [])
    bossPetRef.current = bossPetFromRun(activeRun)
    onLockChange?.(activeRun.pet_key)
    // 已读场景与回想记录以服务端为准。不恢复的话，重进后的第一次推进
    // 会用「只有当前这一屏」把服务端攒了一路的 visited / history 覆盖掉。
    visitedRef.current = Array.isArray(activeRun.visited) ? activeRun.visited.slice() : []
    historyRef.current = Array.isArray(activeRun.history) ? activeRun.history.slice() : []
    setHistory(historyRef.current)
    stackRef.current = []
    rollbackRef.current = ''
    // 读档必须按这条线自己的剧本包装载路线，否则「斗码苍穹」的存档会跑成通用路线
    const packId = activeRun.script_pack || 'default'
    applyRunPack(packId)
    const runtime = createStoryRuntime({ vars: activeRun.vars || {}, pack: packId })
    if (activeRun.ink_state) runtime.restore(activeRun.ink_state)
    runtimeRef.current = runtime
    const next = await runtime.enter({ fetchTexts: makeFetcher() })
    trimTailForScene(next.sceneId)
    applyScene(next, { persist: false })
  }, [pets, onLockChange, makeFetcher, applyScene, abandonRun, t])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cur, ends] = await Promise.all([
          storyApi.current(),
          storyApi.endings().catch(() => ({ items: [] })),
        ])
        if (!alive) return
        setEndings(ends?.items || [])
        // 用户已经在选主角 / 抽对手了：这份启动结果只补数据，不动视图
        if (advancedRef.current) return
        if (cur.run) {
          // 上次断网时没发出去的那一屏先补上，再按服务端的最终状态进屏
          const replayed = await replayDirty(cur.run, (payload) => storyApi.progress(payload))
          if (replayed.replayed) {
            setSyncNote('')
            if (replayed.reward) {
              rewardRef.current = replayed.reward
              setReward(replayed.reward)
            }
          }
          await resume(replayed.run || cur.run, cur.saves)
        } else {
          setLatest(cur.latest || null)
          // 只有仍停在首屏才落回「选主角」，绝不打回上一步
          setView((prev) => (prev === 'loading' ? 'cast' : prev))
        }
      } catch (err) {
        if (!alive) return
        setError(err.message)
        setView((prev) => (prev === 'loading' ? 'cast' : prev))
      }
    })()
    return () => { alive = false }
    // 只在进入剧情模式时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 图鉴异步加载完成后补齐主角对象（战斗要用 stats / element）；
  // 反过来，图鉴里已经找不到主角了，就把这条线按设计 §8 结案（只结一次）
  const abandonOnceRef = useRef(false)
  useEffect(() => {
    if (!run || !pets.length) return
    const found = pets.find((p) => keyOf(p) === run.pet_key)
    if (found) {
      if (found !== petRef.current) {
        setPet(found)
        petRef.current = found
      }
      return
    }
    if (abandonOnceRef.current) return
    abandonOnceRef.current = true
    abandonRun(run, t(
      '主角精灵已不在图鉴里，这条剧情线已自动结案',
      'The protagonist sprite is gone — this run was closed automatically',
    ))
  }, [pets, run, abandonRun, t])

  // 409「状态已过期」= 另一端（另一个标签页 / 另一台机器）已经推进过了。
  // 本地这一屏只能作废，改以服务端为准重新进屏，否则之后每一步都会撞同一个 409。
  const resync = useCallback(async () => {
    try {
      const cur = await storyApi.current()
      if (!cur?.run) {
        onLockChange?.(null)
        runRef.current = null
        sceneRef.current = null
        setRun(null)
        setScene(null)
        setSyncNote('')
        setError(t('这条剧情线已在别处结束，可以重新开一条', 'This run ended elsewhere — start a new one'))
        setView('cast')
        return
      }
      const activeRun = cur.run
      setSaves(cur.saves || [])
      runRef.current = activeRun
      setRun(activeRun)
      onLockChange?.(activeRun.pet_key)
      // 同步回来的服务端状态同样带着包 id，路线必须一致
      const packId = activeRun.script_pack || 'default'
      applyRunPack(packId)
      const runtime = createStoryRuntime({ vars: activeRun.vars || {}, pack: packId })
      if (activeRun.ink_state) runtime.restore(activeRun.ink_state)
      runtimeRef.current = runtime
      stackRef.current = []
      rollbackRef.current = ''
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      trimTailForScene(next.sceneId)
      applyScene(next, { persist: false })
    } catch (err) {
      setError(err.message)
    }
  }, [applyScene, makeFetcher, onLockChange, t])

  useEffect(() => { resyncRef.current = resync }, [resync])

  const storyCast = useMemo(() => pets.filter((p) => p.aiEvaluated), [pets])

  // 当前选中的剧本包：拿它的标题标在方案卡和提示上
  const currentPack = useMemo(
    () => packs.find((p) => p.id === (packPick || 'default')) || null,
    [packs, packPick],
  )
  const packTitle = (packId) => packs.find((p) => p.id === packId)?.title || packId || ''

  // 自带正片的包（仓可梦）：包里声明了 game.entry，选中即进游戏
  const gamePacks = useMemo(() => packs.filter(packHasGame), [packs])

  const openPackGame = useCallback((pack) => {
    if (!packHasGame(pack)) return
    sfx.blip()
    // 游戏自带音乐：先把远征曲收掉，别两首叠着放
    bgm.stop()
    setPackPick(pack.id)
    setGamePack(pack)
  }, [])

  const closePackGame = useCallback(() => {
    setGamePack(null)
    // 退出游戏按原来的场景把远征曲接回去
    if (!bgmOn) return
    if (runRef.current) bgm.startBattle()
    else bgm.startStory()
  }, [bgmOn])

  // Esc 退出游戏：iframe 里拿不到宿主键盘，只能在这里兜
  useEffect(() => {
    if (!gamePack) return undefined
    const onKey = (e) => { if (e.key === 'Escape') closePackGame() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gamePack, closePackGame])

  // 系统剧本的方案数按包走：斗码苍穹只留《三年之约》一案，通用包有三套。
  // 写死「三套模板」会对只提供一案的包说谎。
  const systemPackCount = currentPack?.variant_count || 0

  // CP 条按本轮候选里的最高战力归一，让三张对手卡的压迫感一眼可比
  const maxBossCp = useMemo(() => {
    const list = (preview?.bosses || []).map((b) => Number(b.cp) || 0)
    return Math.max(1, ...list)
  }, [preview])

  // —— 选主角 → 选 Boss ——
  // 这一步要连跑模型 + GitHub，几十秒很常见。阶段由后端流式回报，
  // 前端按真实进度推进，而不是一行静态文字干等（那样看着就是卡死）。
  const previewStages = () => [
    { key: 'queries', label: t('让模型判定赛道、给出检索条件', 'Model decides the track & queries') },
    { key: 'search', label: t('在 GitHub 检索同赛道项目', 'Searching GitHub for rivals') },
    { key: 'pick', label: t('让模型从候选里挑三只对手', 'Model picks three rivals') },
    { key: 'cards', label: t('抓取对手仓库档案、计算战力', 'Reading rival repos & computing CP') },
  ]
  const stagePatch = (key, detail = '') => {
    if (key === 'repick') {
      return { active: 'search', detail, note: t('候选不足 3 只，正在放宽条件重新检索', 'Fewer than 3 rivals — widening the search') }
    }
    if (key === 'fallback') {
      return { active: 'search', detail: '', note: t('GitHub 检索不可用，改用内置的同语言顶级项目', 'GitHub search unavailable — falling back to the built-in pool') }
    }
    return { active: key, detail: detail || '' }
  }

  const startPreview = async (target, seed = (Date.now() & 0x7fffffff), refresh = true) => {
    advancedRef.current = true
    const seq = ++previewSeqRef.current
    setPet(target)
    petRef.current = target
    setBossPick(null)
    setScripts(null)
    setScriptPick(null)
    setCustomSeed('')
    setScriptMode('')
    goView('boss')
    beginBusy(t('正在检索同赛道的顶级项目…', 'Searching top projects in this track…'), {
      stages: previewStages(), active: 'queries', detail: '', note: '',
    })
    setError('')
    try {
      const data = await storyApi.previewStream({
        pet: target,
        config: llmConfig,
        seed,
        refresh,
        onStage: (evt) => {
          if (seq !== previewSeqRef.current) return
          setBusy((prev) => (
            prev && typeof prev === 'object' ? { ...prev, ...stagePatch(evt.key, evt.detail) } : prev
          ))
        },
      })
      // 连点两张卡 / 点了「换一批」：只认最后一次请求的结果
      if (seq !== previewSeqRef.current) return
      setPreview(data)
    } catch (err) {
      if (seq !== previewSeqRef.current) return
      setError(err.message)
      setPreview(null)
    } finally {
      if (seq === previewSeqRef.current) setBusy('')
    }
  }

  const checkCustomBoss = async () => {
    if (!customBoss.trim()) return
    beginBusy(t('校验仓库…', 'Checking repo…'))
    setError('')
    try {
      const card = await storyApi.checkBoss({ fullName: customBoss.trim() })
      const manual = { ...card, reason: t('你的自选方向', 'Your own pick'), manual: true }
      setPreview((prev) => ({ ...(prev || { track: '', rationale: '', bosses: [], selection_source: 'manual' }), bosses: [manual], manual }))
      setBossPick(manual)
      setPanel('')
      setCustomBoss('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // 上一步：从「选剧本」退回「选对手」
  const backFromScript = () => {
    sfx.back()
    goView('boss')
  }

  // 上一步：从「选对手」退回「选主角」。抽对手可能正跑着，作废这次请求再回退
  const backFromBoss = () => {
    sfx.back()
    previewSeqRef.current += 1 // 在跑的检索结果作废（迟到也不能覆盖视图）
    advancedRef.current = false
    setPreview(null)
    setBossPick(null)
    setScripts(null)
    setScriptPick(null)
    setCustomSeed('')
    setScriptMode('')
    setError('')
    setBusy('')
    setView('cast')
  }

  // 选对手阶段的调研成果：剧本必须基于它来写，否则模型只能写出通用的「越级 / 榜单」腔
  const researchForScripts = () => ({
    track: preview?.track || '',
    rationale: preview?.rationale || '',
    queries: preview?.queries || [],
    selection_source: preview?.selection_source || '',
    rivals: (preview?.bosses || []).map((b) => ({ full_name: b.full_name, reason: b.reason || '', stars: b.stars })),
  })

  // 清空 03 步的产出：换来源时连选中态一起收掉，避免「卡还在、来源已经换了」
  const resetScripts = () => {
    setScripts(null)
    setScriptPick(null)
    setScriptSource('')
    setScriptNote('')
    setCustomSeed('')
    setError('')
  }

  const confirmBoss = async () => {
    if (!bossPick) return
    advancedRef.current = true
    // 换对手 = 换一套剧本来源重新选，别把上一只对手的卡带过来
    resetScripts()
    setScriptMode('')
    setCustomScript('')
    goView('script')
  }

  // 来源一：系统剧本包。纯本地读取，零模型调用。
  // 玩家先选包（斗码苍穹等），再在包里选一个方案 —— 包的路线决定正片怎么走。
  const loadPacks = useCallback(async () => {
    try {
      const data = await storyApi.packs()
      const items = data?.items || []
      setPacks(items)
      // 当前选的包已经不在清单里（改名 / 删除）时，退回第一个非 default 的包
      setPackPick((prev) => (items.length && !items.some((p) => p.id === prev)
        ? items.find((p) => p.id !== 'default')?.id || items[0].id
        : prev))
      return items
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [])

  // 01 步就要能看见「自带正片」的包（仓可梦 → 完整版游戏），
  // 所以进剧情模式先拉一次清单：纯本地读 meta.json，不调模型、不花钱。
  useEffect(() => { loadPacks() }, [loadPacks])

  const useSystemScripts = async () => {
    if (!bossPick) return
    sfx.blip()
    resetScripts()
    setScriptMode('system')
    setPanel('')
    beginBusy(t('正在排版内置剧本…', 'Laying out the built-in scripts…'))
    try {
      const items = await loadPacks()
      // 以刚拉回来的清单为准校验选中的包：包里被删掉 / id 写错时退回第一个可用包
      const target = (packPick && items.some((p) => p.id === packPick))
        ? packPick
        : items.find((p) => p.id !== 'default')?.id || items[0]?.id || ''
      if (!target) throw new Error(t('没有可用的系统剧本包', 'No built-in script packs available'))
      setPackPick(target)
      const data = await storyApi.scripts({
        pet: petRef.current, boss: bossPick, config: llmConfig,
        research: researchForScripts(), mode: 'system', pack: target,
      })
      const list = (data.scripts || []).map((s) => ({ ...s, source: 'system', pack: s.pack || target }))
      setScripts(list)
      setScriptPick(list[0] || null)
      setScriptSource(data.source || 'system')
      setScriptNote('')
    } catch (err) {
      setError(err.message)
      setScripts([])
    } finally {
      setBusy('')
    }
  }

  // 换剧本包：换包等于换一条路线，方案必须重新取。
  // 例外是「自带正片」的包（仓可梦）：它没有方案卡要选，选中就直接进游戏。
  const choosePack = async (packId) => {
    const picked = packs.find((p) => p.id === packId)
    if (packHasGame(picked)) {
      openPackGame(picked)
      return
    }
    if (!bossPick) return
    sfx.blip()
    setPackPick(packId)
    resetScripts()
    beginBusy(t('正在排版这个剧本包…', 'Laying out this pack…'))
    try {
      const data = await storyApi.scripts({
        pet: petRef.current, boss: bossPick, config: llmConfig,
        research: researchForScripts(), mode: 'system', pack: packId,
      })
      const list = (data.scripts || []).map((s) => ({ ...s, source: 'system', pack: s.pack || packId }))
      setScripts(list)
      setScriptPick(list[0] || null)
      setScriptSource(data.source || 'system')
      setScriptNote('')
    } catch (err) {
      setError(err.message)
      setScripts([])
    } finally {
      setBusy('')
    }
  }

  // 来源三：让模型围绕这只对手的调研现场写。费用与等待都由玩家亲手触发，不再是默认动作
  const generateAiScripts = async () => {
    if (!bossPick) return
    sfx.blip()
    resetScripts()
    setScriptMode('ai')
    // AI 写的剧本走通用兜底路线（方案卡上标 pack=default），但玩家选过的包要留着，
    // 切回「系统剧本」时还是同一个包
    beginBusy(t('正在围绕这位对手写剧本…', 'Writing scripts around this rival…'), { variant: 'card' })
    try {
      const data = await storyApi.scripts({
        pet: petRef.current, boss: bossPick, config: llmConfig, research: researchForScripts(), mode: 'auto',
      })
      const items = (data.scripts || []).map((s) => ({
        ...s,
        source: data.source === 'rule' ? 'rule' : 'ai',
        pack: s.pack || 'default',
      }))
      setScripts(items)
      setScriptPick(items[0] || null)
      setScriptSource(data.source || '')
      setScriptNote(data.model_error || '')
    } catch (err) {
      setError(err.message)
      setScripts([])
    } finally {
      setBusy('')
    }
  }

  // 来源二：自定义。先把输入框摆出来，写不写由玩家决定
  const pickCustomSource = () => {
    sfx.blip()
    resetScripts()
    setScriptMode('custom')
    setPanel('')
  }

  const submitCustomScript = async () => {
    if (!customScript.trim()) return
    setScriptMode('custom')
    // 自定义底本走通用兜底路线（方案卡上标 pack=default）
    beginBusy(t('正在按你的本子写三个方案…', 'Writing three takes on your story…'), { variant: 'card' })
    setError('')
    setScriptSource('')
    setScriptNote('')
    try {
      const data = await storyApi.customScript({
        pet: petRef.current,
        boss: bossPick,
        input: customScript.trim(),
        config: llmConfig,
        research: researchForScripts(),
      })
      // 后端会基于自定义词给回三个方案；只给一条时也要能渲染成一张卡
      const raw = Array.isArray(data.scripts) && data.scripts.length ? data.scripts : [data]
      const items = raw.map((s) => ({
        title: s.title,
        logline: s.logline || s.brief || '',
        beats: (s.beats && s.beats.length ? s.beats : [s.bridge]).filter(Boolean),
        bridge: s.bridge || '',
        strongFit: s.strong_fit !== false,
        fallback: s.fallback === true,
        source: 'manual',
        pack: 'default',
      })).filter((s) => s.title)
      setScripts(items)
      setScriptPick(items[0] || null)
      setScriptSource(data.source || '')
      setScriptNote(data.model_error || '')
      setCustomSeed(customScript.trim())
      setCustomScript('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const startRun = async () => {
    if (!scriptPick || !bossPick) return
    advancedRef.current = true
    beginBusy(t('正在建线…', 'Creating your run…'), { variant: 'card' })
    setError('')
    try {
      const data = await storyApi.start({
        pet: petRef.current,
        boss: bossPick,
        script: scriptPick,
        track: preview?.track || '',
        rationale: preview?.rationale || '',
        queries: preview?.queries || [],
        selectionSource: bossPick.manual ? 'manual' : (preview?.selection_source || 'ai'),
        seed: preview?.seed,
        config: llmConfig,
      })
      const activeRun = data.run
      setRun(activeRun)
      runRef.current = activeRun
      // 剧本包决定正片跑哪条路线（斗码苍穹等）。服务端落库的值是权威
      const packId = activeRun.script_pack || scriptPick.pack || 'default'
      applyRunPack(packId)
      // 统一用 run.boss.verdict 转成战斗单位（后端 bossPet 是蛇形字段，前端不直接用）
      bossPetRef.current = bossPetFromRun(activeRun)
      onLockChange?.(activeRun.pet_key)
      if (data.desk?.key) onLockChange?.(data.desk.key)
      const runtime = createStoryRuntime({ vars: activeRun.vars || {}, pack: packId })
      runtimeRef.current = runtime
      stackRef.current = []
      visitedRef.current = []
      historyRef.current = []
      setHistory([])
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next, { persist: true })
      sfx.swoosh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // —— 场景推进 ——
  const advance = async () => {
    const runtime = runtimeRef.current
    if (!runtime || advancingRef.current) return
    advancingRef.current = true
    beginBusy(t('正在写这一屏的台词…', 'Writing this scene…'))
    try {
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next)
    } catch (err) {
      setError(err.message)
    } finally {
      advancingRef.current = false
      setBusy('')
    }
  }

  const choose = async (index) => {
    const runtime = runtimeRef.current
    if (!runtime || advancingRef.current) return
    advancingRef.current = true
    tts.stop()
    sfx.blip()
    try {
      runtime.choose(index)
      beginBusy(t('正在写这一屏的台词…', 'Writing this scene…'))
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next)
    } catch (err) {
      setError(err.message)
    } finally {
      advancingRef.current = false
      setBusy('')
    }
  }

  // 开章念完 → 走它的选项进正片
  const advanceOpening = useCallback(async () => {
    const runtime = runtimeRef.current
    if (!runtime || advancingRef.current) return
    const list = runtime.choices
    if (!list.length) return
    await choose(list[0].index)
  }, [])

  // 过场播完 → 走它的选项进正片（和开章同一个套路）
  const advanceTransform = useCallback(async () => {
    const runtime = runtimeRef.current
    if (!runtime || advancingRef.current) return
    const list = runtime.choices
    if (!list.length) return
    await choose(list[0].index)
  }, [])

  // —— 战斗 ——
  const battleEnemy = useMemo(() => {
    if (!scene?.battle) return null
    if (scene.battle === 'boss') return bossPetRef.current || bossPetFromRun(runRef.current)
    return pickMinion(petRef.current || pet, Number(scene.vars?.chapter) || 0, runRef.current?.seed || 1)
  }, [scene, pet])

  const fight = () => {
    const player = petRef.current || pet
    if (!player || !battleEnemy) return
    tts.stop()
    sfx.swoosh()
    try {
      const built = createBattle({
        playerTeam: [player],
        enemyTeam: [battleEnemy],
        seed: ((runRef.current?.seed || 1) ^ (Number(scene?.vars?.chapter) || 0) ^ 0x5f3a) >>> 0,
        difficulty: 'normal',
        playerName: shortName(player.fullName),
        enemyName: shortName(battleEnemy.fullName || battleEnemy.repo),
      })
      let state = built.state
      const log = built.events.map((e) => e.text)
      let guard = 0
      while (!state.winner && guard < 300) {
        const turn = battleTurn(state, chooseAutoAction(state))
        state = turn.state
        log.push(...turn.events.map((e) => e.text))
        guard += 1
      }
      setBattleUi({
        enemy: battleEnemy,
        player,
        state,
        log,
        result: state.winner === 'player' ? 'win' : 'lose',
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const afterBattle = async () => {
    const runtime = runtimeRef.current
    if (!runtime || !battleUi || advancingRef.current) return
    advancingRef.current = true
    setBusy(t('…', '…'))
    try {
      const next = await runtime.resumeFromBattle(battleUi.result === 'win', { fetchTexts: makeFetcher() })
      applyScene(next)
    } catch (err) {
      setError(err.message)
    } finally {
      advancingRef.current = false
      setBusy('')
    }
  }

  // —— 存档 / 读档 / 回滚 ——
  const saveSlot = async (slot) => {
    const r = runRef.current
    const sc = sceneRef.current
    if (!r) return
    try {
      const res = await storyApi.save({
        run_id: r.id,
        slot,
        scene_id: sc?.sceneId || '',
        vars: sc?.vars || {},
        visited: visitedRef.current,
        ink_state: sc?.stateIn || '',
      })
      setSaves(res.saves || [])
      sfx.blip()
    } catch (err) { setError(err.message) }
  }

  const loadSlot = async (slot) => {
    const r = runRef.current
    if (!r) return
    setBusy(t('读取存档…', 'Loading save…'))
    try {
      const res = await storyApi.load({ run_id: r.id, slot })
      const snapshot = res.snapshot
      if (!snapshot?.ink_state) throw new Error(t('这个存档缺少 ink 快照，无法读取', 'This save has no ink snapshot'))
      // 存档属于哪条线就跑哪条线的路线
      const packId = res.run?.script_pack || r?.script_pack || 'default'
      applyRunPack(packId)
      const runtime = createStoryRuntime({ vars: snapshot.vars || {}, pack: packId })
      runtime.restore(snapshot.ink_state)
      runtimeRef.current = runtime
      runRef.current = res.run
      setRun(res.run)
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next, { persist: false })
      setPanel('')
      sfx.blip()
    } catch (err) {
      setError(err.message)
    } finally { setBusy('') }
  }

  const doRollback = async () => {
    const r = runRef.current
    if (!r) return
    try {
      const res = await storyApi.rollback(r.id)
      const runtime = runtimeRef.current
      runtime.restore(res.ink_state)
      stackRef.current = stackRef.current.slice(0, -1)
      runRef.current = res.run
      setRun(res.run)
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next, { persist: false })
      sfx.blip()
    } catch (err) { setError(err.message) }
  }

  const finishRun = async (reason = 'clear') => {
    const r = runRef.current
    tts.stop()
    // 结局那一屏必须先落地：close 之后这条线不再接受推进，晚到的写入会被 409 丢掉，
    // 结局收集册和结算奖励也就一起丢了。
    if (reason === 'clear' && writerRef.current) await writerRef.current.drain()
    // 结案 / 放弃后这条线不再接受推进，先停队列，免得补发请求撞 409
    writerRef.current?.stop()
    writerRef.current = null
    if (r) {
      dropDirty(r.id)
      try { await storyApi.close(r.id, reason) } catch { /* 已经结案也算成功 */ }
    }
    onLockChange?.(null)
    if (reason === 'clear') onReward?.(petRef.current, rewardRef.current?.xp || reward?.xp || 0)
    sfx.swoosh()
    onExit?.()
  }

  // 音乐开关：只切音乐，不碰音效（和设置页同一个存储键，两边同步）
  const toggleBgm = () => {
    const next = !bgmOn
    setBgmOn(next)
    bgm.setMuted(!next)
    if (next) sfx.blip()
    else sfx.back()
  }

  const lines = scene?.lines || []
  const currentLine = lines[Math.min(lineIndex, Math.max(0, lines.length - 1))]
  const showChoices = scene && !scene.battle && !scene.ended && lineIndex >= lines.length - 1
  // 角色表 / 背景地点牌 / 结局标题都随剧本包走：斗码苍穹用自己的一套，不共用通用的
  const castMap = scene?.characters || CHARACTERS
  const bgTable = scene?.bgLabels || BG_LABELS
  const bgLabel = bgTable[scene?.bg] || bgTable.dawn || BG_LABELS.dawn
  const endTitles = scene?.endingTitles || ENDING_TITLES
  // 路线名也随包走：通用包没定义 routes，就退回「内应线 / 独行线」；
  // 斗码苍穹定义了自己的（有人作证线 / 独自赴约线），别再拿通用包的词硬套。
  const packRouteLabel = (scene?.routeLabels || {})[scene?.vars?.route]
  const routeLabel = packRouteLabel
    || (scene?.vars?.route === 'insider' ? t('内应线', 'Insider') : t('独行线', 'Solo'))

  // 角色立绘也随包走：src/story/packs/<包id>/art/<文件名>
  // 没有素材时 packArtUrl 返回 null，界面自动回落到「色块 + 名字」的文字 chip。
  //
  // 阶段（stage）：同一角色在不同剧情阶段是不同形象。当前屏用哪个阶段由 ink 的
  // # stage: 标签决定（runtime 已解析进 scene.stage），角色表里用 stages 声明
  // 「哪个阶段用哪张图」。角色没声明这个阶段就退回无阶段的图。
  const packId = scene?.packId
  const stage = scene?.stage || ''
  const artOf = (who) => {
    if (!packId) return null
    const ch = castMap[who]
    if (!ch) return null
    // 阶段化角色走 packStageArtUrl（阶段形象优先）
    if (ch.stages) return packStageArtUrl(packId, who, ch, stage)
    // 立绘按角色表里声明的文件名找；没声明就退回同名文件（art/scout.png ↔ scout）
    return packArtUrl(packId, ch.art ? ch.art.replace(/\.(png|webp|jpg|jpeg)$/i, '') : who)
  }
  const faceOf = (who) => {
    if (!packId) return null
    return packFaceUrl(packId, who, castMap[who], stage)
  }

  // 解说屏（旁白独占屏幕中央）：可以有多段。
  //   第一段是开章（# opening: xxx.mp3），后面几段是 # narration: xxx.mp3。
  // 音频按包取；某段没声明音频就是纯字幕往下走。
  const narrationAudioFile = scene?.narration
    ? (scene.narrationAudio || scene.opening || '')
    : ''
  const narrationAudio = narrationAudioFile ? packAudioUrl(packId, narrationAudioFile) : null
  const narrationText = scene?.narration ? (lines[0]?.text || '') : ''

  // 变身过场：素材全部随包走。
  //   orb  → fx/ 目录（特效：脉动光团）
  //   hero → art/ 目录（立绘：人形态）
  const transformSpec = scene?.transformSpec || null
  const transformOrb = transformSpec?.orb ? packFxUrl(packId, transformSpec.orb) : null
  const transformHero = transformSpec?.hero
    ? packArtUrl(packId, transformSpec.hero.replace(/\.(png|webp|jpg|jpeg)$/i, ''))
    : null
  // 卡片形象用玩家自己的仓库精灵（人形态立绘在这之前还不存在）
  const transformSprite = (pet?.element && pet?.species)
    ? <PixelSprite pet={pet} size={148} animate={false} />
    : null

  // 语音只跟随点击推进，不反过来驱动节奏（docs/TTS.md T3）
  const speakLine = (line) => {
    if (!line) return
    tts.speak({ who: line.who, text: line.text, key: line.key })
  }

  const nextLine = () => {
    if (lineIndex >= lines.length - 1) return
    const index = lineIndex + 1
    setLineIndex(index)
    sfx.blip()
    speakLine(lines[index])
  }

  const toggleVoice = () => {
    const next = !voiceOn
    setVoiceOn(next)
    setTtsEnabled(next)
    if (!next) {
      sfx.back()
      return
    }
    unlockTts()
    sfx.blip()
    speakLine(currentLine)
  }

  return (
    <main className="story-wrap">
      <div className="story-head">
        <div>
          <span className="story-kicker">{t('剧情模式 · 单项目远征', 'STORY MODE · SOLO EXPEDITION')}</span>
          <h2>{run?.script_title || t('挑一只精灵，去打一场有始有终的仗', 'Pick one sprite and fight a story with an ending')}</h2>
          {run && (
            <p className="story-meta">
              <span className="story-stat">
                <em>CH</em>
                {Math.min((run.vars?.chapter || 0) + 1, run.chapter_count)} / {run.chapter_count}
              </span>
              <span className="story-stat">
                <em>{t('信任', 'TRUST')}</em>{run.vars?.trust ?? 0}
              </span>
              <span className="story-stat">
                <em>{t('失败', 'DEFEAT')}</em>{run.vars?.deaths ?? 0}
              </span>
              {run.boss?.full_name && (
                <span className="story-stat is-boss">
                  <em>{t('最终对手', 'BOSS')}</em>{run.boss.full_name}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="story-head-actions">
          {/* 自带正片的包：不管走到哪一步（选主角 / 选对手 / 选剧本 / 已开局），
              都留一个直接进正片的入口，不用退回去找 */}
          {gamePacks.length > 0 && (
            <button
              className="ghost-btn story-head-game"
              onClick={() => openPackGame(gamePacks[0])}
              title={gamePacks[0].game.title || gamePacks[0].title}
            >
              {t('进完整版游戏', 'Full game')}
            </button>
          )}
          {(view === 'boss' || view === 'script') && (
            <button
              className="ghost-btn story-back"
              onClick={view === 'script' ? backFromScript : backFromBoss}
              title={view === 'script' ? t('退回选对手', 'Back to rival pick') : t('退回选主角', 'Back to protagonist pick')}
            >
              {t('← 上一步', '← Back')}
            </button>
          )}
          {setupView && (
            <button
              className={`ghost-btn story-bgm${bgmOn ? ' is-on' : ''}`}
              onClick={toggleBgm}
              aria-pressed={bgmOn}
              title={t('远征曲：开 / 关', 'Expedition theme: on / off')}
            >
              <span className="story-bgm-bars" aria-hidden="true"><i /><i /><i /></span>
              {t('音乐', 'Music')}
            </button>
          )}
          {view === 'play' && (
            <>
              <button
                className={`ghost-btn story-voice${voiceOn ? ' is-on' : ''}`}
                onClick={toggleVoice}
                aria-pressed={voiceOn}
                title={t('台词朗读：开 / 关（音源与语速在设置里）', 'Read lines aloud: on / off (source & speed in Settings)')}
              >
                <span className="story-voice-dot" aria-hidden="true" />
                {t('语音', 'Voice')}
              </button>
              <button className="ghost-btn" onClick={() => setPanel('save')}>{t('存档', 'Save')}</button>
              <button className="ghost-btn" onClick={() => setPanel('load')}>{t('读档', 'Load')}</button>
              <button className="ghost-btn" onClick={doRollback}>{t('回滚', 'Rollback')}</button>
              <button className="ghost-btn" onClick={() => setPanel('history')}>{t('回想', 'History')}</button>
            </>
          )}
          <button className="ghost-btn" onClick={() => { if (runRef.current && view === 'play') setPanel('close'); else onExit?.() }}>
            {t('退出剧情模式', 'Exit')}
          </button>
        </div>
      </div>

      {error && <p className="error story-error">! {error}</p>}
      {voiceNote && <p className="story-voice-note">{voiceNote}</p>}
      {syncNote && <p className="story-voice-note story-sync-note">{syncNote}</p>}
      {busy && <StoryProgress info={busy} />}

      {/* 选主角 */}
      {view === 'cast' && (
        <section className="story-section">
          <div className="story-section-head">
            <h3><span className="step-plate">01</span>{t('选主角', 'Pick the protagonist')}</h3>
            <span>{t('只有通过 AI 认证的精灵能当主角', 'Only AI-certified sprites can star')}</span>
          </div>
          {/* 自带正片的包（仓可梦 = PokéRogue）：不用选主角、不用过 AI 认证，
              点进去就是这个包的正片本身 */}
          {gamePacks.map((p) => (
            <div className="story-game-entry" key={p.id}>
              <div className="story-game-entry-text">
                <b>{p.game.title || `${p.title} · 完整版`}</b>
                <span>{p.game.desc || p.tagline}</span>
              </div>
              <button className="primary-btn" onClick={() => openPackGame(p)}>
                {t('直接进游戏', 'Play the full game')}
              </button>
            </div>
          ))}
          {storyCast.length === 0 ? (
            <p className="story-empty">{t('还没有 AI 认证精灵：先在高级模式里完成一次模型评测。', 'No AI-certified sprite yet — run one model evaluation in AI Pro mode first.')}</p>
          ) : (
            <div className="story-cast">
              {storyCast.map((p) => (
                <button
                  key={keyOf(p)}
                  className="story-cast-card"
                  data-quality={p.quality?.key || 'N'}
                  onClick={() => startPreview(p)}
                >
                  <PixelSprite pet={p} size={72} animate={false} />
                  <b>{p.repo || shortName(p.fullName)}</b>
                  <span>Lv.{p.level} · {p.quality?.key || 'N'}</span>
                  <span>{p.element?.name || ''}{p.elementSecondary ? ` / ${p.elementSecondary.name}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {latest && (
            <p className="story-archive-note">
              {t('上一段远征：', 'Last expedition: ')}{latest.script_title} · {ENDING_TITLES[latest.ending] || latest.status}
            </p>
          )}
          {endings.length > 0 && (
            <p className="story-archive-note">
              {t('结局收集：', 'Endings: ')}{endings.map((e) => e.title || ENDING_TITLES[e.ending_id] || e.ending_id).join(' / ')}
            </p>
          )}
        </section>
      )}

      {/* 选 Boss */}
      {view === 'boss' && (
        <section className="story-section">
          <div className="story-section-head">
            <h3><span className="step-plate">02</span>{t('选最终方向', 'Pick the final direction')}</h3>
            <div className="story-section-actions">
              <button className="ghost-btn" onClick={() => startPreview(petRef.current)} disabled={Boolean(busy)}>{t('换一批', 'Reroll')}</button>
              <button className="ghost-btn" onClick={() => setPanel('customBoss')}>{t('自选对手', 'Custom Boss')}</button>
            </div>
          </div>
          {preview?.model_error && (
            <p className="story-source-note story-model-warn">
              ⚠ {t(`模型未生效（${preview.model_error}），当前是规则推荐；到「AI高级版入口」重新粘贴密钥后点「换一批」。`, `Model unavailable (${preview.model_error}) — rule-based picks; paste your key again in AI Pro, then Reroll.`)}
            </p>
          )}
          {preview?.track && <p className="story-track">{t('赛道', 'Track')}：{preview.track}</p>}
          {preview?.rationale && <p className="story-rationale">{preview.rationale}</p>}
          <div className="story-boss-grid">
            {(preview?.bosses || []).map((boss) => {
              const cardPet = bossPetFromCard(boss, isEn)
              const chosen = bossPick?.full_name === boss.full_name
              const pick = () => setBossPick(boss)
              return (
                <div
                  key={boss.full_name}
                  className={`story-boss${chosen ? ' sel' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={chosen}
                  aria-label={`${boss.full_name} · ${boss.tier} · Lv.${boss.level}`}
                  onClick={pick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() }
                  }}
                >
                  {/* 整张卡就是这只对手：立绘 / 属性 / 六维 / 技能 / 词条 / 品质五维 */}
                  <PetCard pet={cardPet} readOnly />
                  <p className="story-boss-why">
                    <b>{chosen ? `✓ ${t('已选', 'PICKED')}` : t('对手', 'RIVAL')}</b>
                    <span>{bossBlurb(boss, isEn, t)}</span>
                  </p>
                </div>
              )
            })}
          </div>
          {preview?.selection_source === 'fallback_pool' && (
            <p className="story-source-note">{t('GitHub 检索不可用，当前为离线兜底池。', 'GitHub search unavailable — offline fallback pool.')}</p>
          )}
          <div className="story-confirm">
            <button className="primary-btn" disabled={!bossPick || Boolean(busy)} onClick={confirmBoss}>
              {t('就选它，继续写剧本', 'Lock this rival and write scripts')}
            </button>
          </div>
        </section>
      )}

      {/* 选剧本 */}
      {view === 'script' && (
        <section className="story-section">
          <div className="story-section-head">
            <h3><span className="step-plate">03</span>{t('选剧本', 'Pick the script')}</h3>
          </div>
          <p className="story-rationale">{t('对手：', 'Rival: ')}{bossPick?.full_name}</p>

          {/* 三选一：不再一进来就花一次模型调用。谁来写剧本，玩家自己定 */}
          <div className="story-src-grid" role="radiogroup" aria-label={t('剧本来源', 'Script source')}>
            {[
              {
                id: 'system',
                tag: 'SYSTEM',
                name: t('系统剧本', 'System scripts'),
                desc: systemPackCount === 1
                  ? t('内置一套模板，立刻出卡，不调模型、不花钱', 'One built-in template. Instant, no model, no cost.')
                  : t('内置三套模板，立刻出卡，不调模型、不花钱', 'Three built-in templates. Instant, no model, no cost.'),
                icon: '▤',
              },
              {
                id: 'custom',
                tag: 'CUSTOM',
                name: t('自定义', 'Custom'),
                desc: t('给一个书名或一句梗概，照你的本子写三案', 'Give a title or one-line premise, get three takes on it.'),
                icon: '✎',
              },
              {
                id: 'ai',
                tag: 'AI',
                name: t('AI 生成', 'AI written'),
                desc: t('围绕这只对手的调研现场现写三案，约 20–40 秒', 'Three fresh takes built from this rival’s research. ~20–40s.'),
                icon: '✦',
              },
            ].map((src) => (
              <button
                key={src.id}
                type="button"
                role="radio"
                aria-checked={scriptMode === src.id}
                className={`story-src${scriptMode === src.id ? ' sel' : ''}`}
                disabled={Boolean(busy)}
                onClick={() => {
                  if (src.id === 'system') useSystemScripts()
                  else if (src.id === 'custom') pickCustomSource()
                  else generateAiScripts()
                }}
              >
                <span className="story-src-tag">{src.tag}</span>
                <b><i aria-hidden="true">{src.icon}</i>{src.name}</b>
                <span className="story-src-desc">{src.desc}</span>
                {scriptMode === src.id && <span className="story-src-check">{t('已选', 'PICKED')}</span>}
              </button>
            ))}
          </div>

          {scriptMode === 'system' && packs.length > 0 && (
            <div className="story-pack-strip" role="radiogroup" aria-label={t('剧本包', 'Script pack')}>
              <span className="story-pack-label">{t('剧本包', 'Script pack')}</span>
              {packs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={packPick === p.id}
                  className={`story-pack${packPick === p.id ? ' sel' : ''}`}
                  disabled={Boolean(busy)}
                  onClick={() => choosePack(p.id)}
                >
                  <b>{p.title}</b>
                  {packHasGame(p) && <span className="story-pack-kind">{t('完整游戏 · 选中即开玩', 'Full game · opens on pick')}</span>}
                  {p.tagline && <span>{p.tagline}</span>}
                </button>
              ))}
            </div>
          )}

          {scriptMode === 'custom' && (
            <div className="story-src-panel">
              <label className="story-src-label" htmlFor="story-custom-input">
                {t('你的底本（书名 / 一句梗概，200 字以内）', 'Your source (title or one-line premise, ≤200 chars)')}
              </label>
              <textarea
                id="story-custom-input"
                value={customScript}
                onChange={(e) => setCustomScript(e.target.value)}
                rows={3}
                maxLength={200}
                placeholder={t('例如《赘婿》，或「一个被全行业低估的内核项目」', 'e.g. “The Son-in-Law”, or “a kernel project everyone underrates”')}
              />
              <div className="story-src-actions">
                <button className="primary-btn" disabled={!customScript.trim() || Boolean(busy)} onClick={submitCustomScript}>
                  {t('照这个本子写三案', 'Write three takes')}
                </button>
                <span className="story-src-hint">
                  {t('会调用模型；没有可用密钥时用规则补齐三条', 'Uses the model; falls back to rules if no key is available')}
                </span>
              </div>
            </div>
          )}

          {scriptMode === 'ai' && !(scripts || []).length && !busy && (
            <p className="story-script-warn mixed">
              {t('模型没有给出可用剧本。换成「系统剧本」可以立刻开始，或再点一次「AI 生成」重试。', 'The model returned nothing usable. Try System scripts, or hit AI again.')}
            </p>
          )}

          {scriptSource === 'rule' && scriptMode === 'ai' && (
            <p className="story-script-warn">
              {t(
                `模型没有参与这次编剧，下面是规则兜底模板${scriptNote ? `（${scriptNote}）` : ''}。点「重新写」换模型再试。`,
                `The model didn't write these — they're rule fallbacks${scriptNote ? ` (${scriptNote})` : ''}. Hit Retry to try again.`,
              )}
              <button className="ghost-btn story-script-retry" onClick={generateAiScripts}>
                {t('重新写', 'Retry')}
              </button>
            </p>
          )}
          {scriptSource === 'mixed' && (
            <p className="story-script-warn mixed">
              {t(
                `部分方案是规则补齐的${scriptNote ? `（${scriptNote}）` : ''}，标了「模板」的那几条没有用上调研。`,
                `Some takes were filled in by rules${scriptNote ? ` (${scriptNote})` : ''} — the ones marked Template skipped the research.`,
              )}
            </p>
          )}
          {scriptMode === 'system' && (scripts || []).length > 0 && (
            <p className="story-custom-note">
              {t('系统剧本：内置模板，不含本次调研，也不消耗模型额度。想更贴这只对手就换「AI 生成」。',
                'System scripts: built-in templates, no research and no model usage. Pick “AI written” for a closer fit.')}
              {currentPack ? t(`当前剧本包：${currentPack.title}`, `Pack: ${currentPack.title}`) : ''}
            </p>
          )}
          {customSeed && (
            <p className="story-custom-note">
              {t(`照你的本子《${customSeed.slice(0, 24)}》写了 3 个方案，选一个开演`, `Three takes on “${customSeed.slice(0, 24)}” — pick one`)}
            </p>
          )}
          {(scripts || []).length > 0 && (
            <div className="story-script-grid">
              {(scripts || []).map((item) => (
                <button
                  key={item.title}
                  className={`story-script${scriptPick?.title === item.title ? ' sel' : ''}`}
                  onClick={() => setScriptPick(item)}
                >
                  <b>{item.title}</b>
                  {item.pack && item.pack !== 'default' && (
                    <span className="story-script-pack">{packTitle(item.pack)}</span>
                  )}
                  {item.fallback && scriptMode !== 'system' && (
                    <span className="story-script-flag">{t('模板 · 未用调研', 'Template · no research')}</span>
                  )}
                  <span>{item.logline}</span>
                  <ul>
                    {(item.beats || []).map((beat) => <li key={beat}>{beat}</li>)}
                  </ul>
                  {item.bridge && <span className="story-script-bridge">{item.bridge}</span>}
                  {item.strongFit === false && <em className="story-bridge-warn">{t('桥接偏弱 · 强行演绎', 'Weak bridge · forced adaptation')}</em>}
                </button>
              ))}
            </div>
          )}
          {(scripts || []).length > 0 && (
            <div className="story-confirm">
              <button className="primary-btn" disabled={!scriptPick || Boolean(busy)} onClick={startRun}>
                {t('建线，出发', 'Start the run')}
              </button>
              <span className="story-src-hint">
                {scriptPick ? t(`已选：${scriptPick.title}`, `Picked: ${scriptPick.title}`) : t('先挑一个方案', 'Pick one take first')}
              </span>
            </div>
          )}
        </section>
      )}

      {/* 解说屏：旁白独占屏幕中央，不是对话。可以有多段 */}
      {view === 'play' && scene?.narration && (
        <StoryOpening
          // key 用 sceneId：换屏时强制重挂组件，
          // 否则「只推进一格」的那道闸会从上一屏带过来，第二屏点不动。
          key={scene.sceneId}
          text={narrationText}
          audioUrl={narrationAudio}
          onDone={() => advanceOpening()}
        />
      )}

      {/* 变身过场：卡片形象 → 光团 → 变暗 → 醒来变成人形态 */}
      {view === 'play' && scene?.transform && (
        <StoryTransform
          sprite={transformSprite}
          orbUrl={transformOrb}
          heroUrl={transformHero}
          caption={transformSpec?.caption || ''}
          onDone={() => advanceTransform()}
        />
      )}

      {/* 场景 / 战斗 */}
      {view === 'play' && scene && !scene.narration && !scene.transform && (
        <section className={`story-stage story-bg-${scene.bg || 'dawn'}`}>
          <span className="story-stage-chapter" aria-hidden="true">
            {`CH.${String(Math.min((scene.vars?.chapter || 0) + 1, 99)).padStart(2, '0')}`}
          </span>
          <div className="story-stage-cast">
            {(scene.cast || []).map((who) => {
              const char = castMap[who] || castMap.narrator
              const active = currentLine?.who === who
              const face = faceOf(who)
              return (
                <span key={who} className={`story-chip${active ? ' active' : ''}`} style={{ '--chip': char.color }}>
                  {face ? <img className="story-chip-face" src={face} alt="" /> : null}
                  {char.name}
                </span>
              )
            })}
            {/* 台词来源标记：系统剧本下包内 lines.json 是定稿，不是「兜底」 */}
            {scene.textSource === 'script' && (
              <span className="story-source-note">{t('剧本定稿', 'script final')}</span>
            )}
            {scene.textSource === 'fallback' && (
              <span className="story-source-note">{t('台词兜底', 'fallback text')}</span>
            )}
            <span className="story-stage-place">{t(bgLabel[0], bgLabel[1])}</span>
          </div>

          {/* 角色立绘：谁在说话谁亮起，其余压暗。没有素材时整层不出现 */}
          {scene.cast?.some((who) => artOf(who)) && (
            <div className="story-stage-figures" aria-hidden="true">
              {scene.cast.map((who) => {
                const art = artOf(who)
                if (!art) return null
                const char = castMap[who] || castMap.narrator
                const active = currentLine?.who === who
                return (
                  <figure
                    key={who}
                    className={`story-figure${active ? ' active' : ''}`}
                    style={{ '--chip': char.color }}
                  >
                    <img src={art} alt="" />
                  </figure>
                )
              })}
            </div>
          )}

          {scene.battle ? (
            <div className="story-battle">
              <h3>{scene.battle === 'boss' ? t('终章 · 决战', 'Finale · Boss fight') : t(`第 ${(scene.vars?.chapter || 0) + 1} 章 · 杂兵战`, `Chapter ${(scene.vars?.chapter || 0) + 1} · Skirmish`)}</h3>
              <div className="story-battle-row">
                <div className="story-battle-side">
                  <PixelSprite pet={pet} size={96} animate={false} />
                  <b>{shortName(pet?.fullName)}</b>
                  <span>Lv.{pet?.level} · CP {pet?.combatPower}</span>
                </div>
                <span className="story-vs">VS</span>
                <div className="story-battle-side">
                  {battleEnemy?.spriteSeed ? <PixelSprite pet={battleEnemy} size={96} animate={false} /> : <span className="story-no-sprite">?</span>}
                  <b>{shortName(battleEnemy?.fullName || battleEnemy?.repo)}</b>
                  <span>Lv.{battleEnemy?.level} · CP {battleEnemy?.combatPower}</span>
                </div>
              </div>
              {!battleUi ? (
                <button className="primary-btn" onClick={fight}>{t('开战（自动回合）', 'Fight (auto turns)')}</button>
              ) : (
                <>
                  <p className={`story-battle-result ${battleUi.result}`}>
                    {battleUi.result === 'win' ? t('胜利', 'Victory') : t('失败 · 剧情继续', 'Defeat · story continues')}
                  </p>
                  <div className="story-battle-log">
                    {battleUi.log.slice(-60).map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}
                  </div>
                  <button className="primary-btn" onClick={afterBattle}>{t('继续剧情', 'Continue')}</button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* 站在舞台上的主角：把大块留白填成"有人在场"的画面 */}
              {/* 图鉴还没加载完时 pet 只有名字，缺 element/species，画不出立绘 */}
              {pet?.element && pet?.species && (
                <div className="story-stage-hero" aria-hidden="true">
                  <PixelSprite pet={pet} size={148} />
                </div>
              )}
              <div className="story-dialog" onClick={nextLine}>
                <span className="story-speaker" style={{ color: castMap[currentLine?.who]?.color || '#ffcb05' }}>
                  {faceOf(currentLine?.who) ? <img className="story-speaker-face" src={faceOf(currentLine.who)} alt="" /> : null}
                  {castMap[currentLine?.who]?.name || t('旁白', 'Narrator')}
                </span>
                <p>{currentLine?.text || t('……', '…')}</p>
                {lines.length > 1 && <span className="story-line-dots">{lines.map((_, i) => <i key={i} className={i === lineIndex ? 'on' : ''} />)}</span>}
              </div>
              {showChoices && (
                <div className={`story-choices${busy ? ' busy' : ''}`}>
                  {scene.choices.map((choice) => (
                    <button key={choice.index} onClick={() => choose(choice.index)} disabled={Boolean(busy)}>{choice.text}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 结局 */}
      {view === 'ended' && (
        <section className="story-ending">
          <span className="story-kicker">{t('END', 'END')}</span>
          <h3>{endTitles[scene?.endingId] || reward?.title || t('抵达终点', 'The end')}</h3>
          <p>
            {t('信任', 'Trust')} {scene?.vars?.trust ?? 0}
            {' · '}{t('失败', 'Defeats')} {scene?.vars?.deaths ?? 0}
            {' · '}{t('路线', 'Route')} {routeLabel}
          </p>
          {reward?.xp ? <p className="story-reward">+{reward.xp} EXP</p> : null}
          <div className="story-confirm">
            <button className="primary-btn" onClick={() => finishRun('clear')}>{t('领取奖励并结案', 'Claim & close')}</button>
            <button className="ghost-btn" onClick={() => setPanel('history')}>{t('回看剧情', 'Review story')}</button>
          </div>
        </section>
      )}

      {/* 弹层 */}
      {panel && (
        <div className="story-panel-backdrop" onClick={() => setPanel('')}>
          <div className="story-panel" onClick={(e) => e.stopPropagation()}>
            <div className="story-panel-head">
              <b>{panel === 'save' ? t('存档', 'Save') : panel === 'load' ? t('读档', 'Load') : panel === 'history' ? t('回想', 'History') : panel === 'customBoss' ? t('自选对手', 'Custom Boss') : t('结案', 'Close run')}</b>
              <button className="ghost-btn" onClick={() => setPanel('')}>{t('关闭', 'Close')}</button>
            </div>

            {(panel === 'save' || panel === 'load') && (
              <div className="story-slots">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const saved = saves.find((s) => s.slot === slot)
                  return (
                    <div key={slot} className="story-slot">
                      <b>{t(`槽 ${slot}`, `Slot ${slot}`)}</b>
                      <span>{saved ? `${saved.scene_id || '—'} · ${new Date(saved.created_at * 1000).toLocaleString()}` : t('空', 'Empty')}</span>
                      <div>
                        {panel === 'save'
                          ? <button className="ghost-btn" onClick={() => saveSlot(slot)}>{t('存入', 'Save')}</button>
                          : <button className="ghost-btn" disabled={!saved} onClick={() => loadSlot(slot)}>{t('读取', 'Load')}</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {panel === 'history' && (
              <div className="story-history">
                {history.length === 0 && <p className="story-empty">{t('还没有读过的台词。', 'No lines read yet.')}</p>}
                {history.map((line, i) => (
                  <p key={`${i}-${line.text}`}><b style={{ color: castMap[line.who]?.color }}>{castMap[line.who]?.name || line.who}</b>：{line.text}</p>
                ))}
              </div>
            )}

            {panel === 'customBoss' && (
              <div className="story-custom">
                <p>{t('粘贴 GitHub / Gitee 仓库地址或 owner/repo，跳过 AI 推荐，直接把它当最终方向。', 'Paste a GitHub / Gitee repo or owner/repo to skip AI suggestions.')}</p>
                <input value={customBoss} onChange={(e) => setCustomBoss(e.target.value)} placeholder="https://github.com/owner/repo" spellCheck={false} />
                <button className="primary-btn" disabled={Boolean(busy)} onClick={checkCustomBoss}>{t('校验并选定', 'Check & pick')}</button>
              </div>
            )}

            {panel === 'close' && (
              <div className="story-custom">
                <p>{t('放弃这条线会解除桌宠锁定，已获得的进度不会保留。', 'Abandoning unlocks the desktop pet and discards progress.')}</p>
                <button className="primary-btn" onClick={() => finishRun('abandon')}>{t('放弃这条线', 'Abandon run')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'loading' && <p className="story-busy">{t('读取剧情进度…', 'Loading your run…')}</p>}

      {/* 包自带正片。两种形态：
          mode=pixel → 跑内置像素游戏（src/cangke/，备用形态）；
          否则按 game.entry 加载整包静态页（仓可梦 = /pokerogue/ 那份 PokéRogue）。 */}
      {gamePack && gamePack.game.mode === 'pixel' && <CangkeGame onExit={closePackGame} />}

      {gamePack && gamePack.game.mode !== 'pixel' && (
        <section
          className="story-game"
          role="dialog"
          aria-modal="true"
          aria-label={gamePack.game.title || `${gamePack.title} · 完整版`}
        >
          <div className="story-game-bar">
            <b>{gamePack.game.title || `${gamePack.title} · 完整版`}</b>
            <div className="story-game-actions">
              {gamePack.game.atlas && (
                <a className="ghost-btn" href={gamePack.game.atlas} target="_blank" rel="noreferrer">
                  {t('图鉴站', 'Atlas')}
                </a>
              )}
              {gamePack.game.docs && (
                <a className="ghost-btn" href={gamePack.game.docs} target="_blank" rel="noreferrer">
                  {t('游戏文档', 'Docs')}
                </a>
              )}
              <button className="ghost-btn" onClick={closePackGame}>
                {t('退出游戏 · Esc', 'Exit · Esc')}
              </button>
            </div>
          </div>
          <iframe
            className="story-game-frame"
            src={gamePack.game.entry}
            title={gamePack.game.title || `${gamePack.title} · 完整版`}
            allow="autoplay; fullscreen"
          />
        </section>
      )}
    </main>
  )
}
