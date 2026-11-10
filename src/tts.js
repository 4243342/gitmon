// 对话语音：把剧情台词念出来。
//
// 三个引擎：
//   local  —— 后端 sherpa-onnx + Kokoro 中文模型，纯本地合成（默认，免 key 免联网）
//   cloud  —— 走已绑定的 OpenAI 兼容端点 /audio/speech（音色好但按量计费）
//   system —— 浏览器 speechSynthesis（零成本兜底，永远可用）
//   edge   —— 可选的 edge-tts（后端装了才可用，音色接近商用但不走官方接口）
//
// 三条硬约束（docs/TTS.md §3）：
//   T1 同一时刻只有一句在念 —— 每次 speak 先 stop，全局只有一个 BufferSource
//   T2 任何失败都要能出声  —— 在线/本地失败/超时/404 → 立刻改系统朗读
//   T3 语音不驱动剧情      —— 只跟随 lineIndex，不反过来推进
import { loadLLMConfig } from './llm.js'
import { bgm } from './bgm.js'
import { t } from './i18n.js'

const CFG_KEY = 'gitmon:tts'
const CACHE_NAME = 'gitmon-tts-v1'
const MEM_LIMIT = 8
const FIRST_BYTE_TIMEOUT = 1600
// 本地合成是 CPU 推理：一句 3 秒台词约 1.2–2.5s，给足时间再判超时
const LOCAL_TIMEOUT = 15000
const ENGINES = ['local', 'cloud', 'edge', 'system']
const ROLE_LIST = ['narrator', 'pet', 'scout', 'boss']
// 角色声线：cloud/edge 用厂商 voice 名，local 用模型 speaker，system 只能靠音高/语速拉开差异
const PROFILES = {
  narrator: { pitch: 0.95, rate: 0.98 },
  pet: { pitch: 1.15, rate: 1.05 },
  scout: { pitch: 0.88, rate: 1.0 },
  boss: { pitch: 0.75, rate: 0.92 },
}

const DEFAULT_CFG = {
  version: 2,
  enabled: true,
  engine: 'local', // local | cloud | edge | system
  volume: 0.9,
  rate: 1.0,
  autoFirst: true, // 进场自动念第一句
}

function readCfg() {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    const saved = raw ? JSON.parse(raw) : null
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_CFG }
    // v1 的默认是 cloud，换成本地引擎后老配置会一直走 404 → 静默降级，这里一次性迁到 local
    const stale = Number(saved.version || 1) < 2
    return {
      version: DEFAULT_CFG.version,
      enabled: saved.enabled !== false,
      engine: stale
        ? DEFAULT_CFG.engine
        : (ENGINES.includes(saved.engine) ? saved.engine : DEFAULT_CFG.engine),
      volume: Number.isFinite(Number(saved.volume)) ? Math.max(0, Math.min(1, Number(saved.volume))) : DEFAULT_CFG.volume,
      rate: Number.isFinite(Number(saved.rate)) ? Math.max(0.6, Math.min(1.6, Number(saved.rate))) : DEFAULT_CFG.rate,
      autoFirst: saved.autoFirst !== false,
    }
  } catch {
    return { ...DEFAULT_CFG }
  }
}

let cfg = readCfg()
let ctx = null
let gain = null
let current = null // { key, source, done }
let seq = 0
let cloudDown = '' // 本次会话的降级原因：404 / 无 key / 本地模型没装 / 不稳定
let downEngine = '' // 哪个引擎降的级：换音源后要允许重试
let localWarmed = false
const mem = new Map()
let prefetchCtl = null
let voicesCache = []
let failStreak = 0

// ---------------------------------------------------------------- 文本清洗

/**
 * 台词里会混进仓库名和英文术语，中文音色逐字母念会很难听。
 * 只清洗送去合成的文本，屏幕上显示的仍是原文。
 */
export function sanitizeForSpeech(text) {
  let out = String(text || '')
    .replace(/[*_`#>]/g, '')
    .replace(/\.{3,}|…+/g, '，')
    .replace(/\s+/g, ' ')
    .trim()
  // owner/repo（允许含 . - _）→ 说成「对手的项目」
  out = out.replace(/\b[\w.-]{2,}\/[\w.-]{2,}\b/g, '对手的项目')
  // 连续的拉丁字母/数字（≥12 字符，多半是包名或标识符）整段替换
  out = out.replace(/[A-Za-z0-9_.-]{12,}/g, '那个项目')
  return out.trim()
}

function chineseRatio(text) {
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const letters = (text.match(/[A-Za-z0-9]/g) || []).length
  const total = han + letters
  return total ? han / total : 1
}

// ---------------------------------------------------------------- 配置

function saveCfg(patch) {
  cfg = { ...cfg, ...patch }
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)) } catch { /* 隐私模式忽略 */ }
  return cfg
}

export function getTtsConfig() {
  return { ...cfg, degraded: cloudDown }
}

export function setTtsEnabled(on) {
  const next = saveCfg({ enabled: !!on })
  if (!next.enabled) stop()
  return next
}

export function setTtsEngine(engine) {
  const next = saveCfg({ engine: ENGINES.includes(engine) ? engine : DEFAULT_CFG.engine })
  cloudDown = ''
  downEngine = ''
  failStreak = 0
  stop()
  if (next.engine === 'local') warmLocal()
  return next
}

export function setTtsVolume(v) {
  const next = saveCfg({ volume: Math.max(0, Math.min(1, Number(v) || 0)) })
  if (gain && ctx) gain.gain.setTargetAtTime(next.volume, ctx.currentTime, 0.03)
  return next
}

export function setTtsRate(v) {
  return saveCfg({ rate: Math.max(0.6, Math.min(1.6, Number(v) || 1)) })
}

export function setTtsAutoFirst(on) {
  return saveCfg({ autoFirst: !!on })
}

// ---------------------------------------------------------------- 音频上下文

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
    gain = ctx.createGain()
    gain.gain.value = cfg.volume
    gain.connect(ctx.destination)
  } catch {
    ctx = null
  }
  return ctx
}

/** 在用户手势里调一次：AudioContext 与 speechSynthesis 都需要先解锁 */
export function unlockTts() {
  ensureCtx()
  if (cfg.engine === 'local') warmLocal()
  try {
    if (window.speechSynthesis) {
      voicesCache = window.speechSynthesis.getVoices() || []
      if (!voicesCache.length) window.speechSynthesis.onvoiceschanged = () => {
        voicesCache = window.speechSynthesis.getVoices() || []
      }
    }
  } catch { /* 不支持就算了 */ }
}

/** 本地模型 320MB，后端加载要 1.2s：进剧情前先热一遍，别让第一句等 */
function warmLocal() {
  if (localWarmed) return
  localWarmed = true
  try {
    fetch('/api/tts/warm', { method: 'POST' }).catch(() => { localWarmed = false })
  } catch { localWarmed = false }
}

// ---------------------------------------------------------------- 缓存

function hashKey(engine, who, text) {
  let h = 0x811c9dc5
  const raw = `${engine}|${who}|${cfg.rate.toFixed(2)}|${text}`
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `tts-${h.toString(16)}`
}

function memSet(key, buf) {
  if (mem.has(key)) mem.delete(key)
  mem.set(key, buf)
  while (mem.size > MEM_LIMIT) mem.delete(mem.keys().next().value)
}

async function cacheGet(key) {
  if (mem.has(key)) return mem.get(key)
  try {
    if (!window.caches) return null
    const cache = await window.caches.open(CACHE_NAME)
    const hit = await cache.match(key)
    if (!hit) return null
    const buf = await hit.arrayBuffer()
    memSet(key, buf)
    return buf
  } catch {
    return null
  }
}

async function cachePut(key, buf, mime = 'audio/mpeg') {
  memSet(key, buf)
  try {
    if (!window.caches) return
    const cache = await window.caches.open(CACHE_NAME)
    await cache.put(key, new Response(buf, { headers: { 'Content-Type': mime } }))
  } catch { /* 配额满就只留内存 */ }
}

// ---------------------------------------------------------------- 合成

function llmPayload() {
  const conf = loadLLMConfig() || {}
  const binding = conf.binding || {}
  return {
    baseUrl: binding.baseUrl || conf.baseUrl || '',
    model: binding.model || conf.model || '',
    apiKey: conf.apiKey || '',
  }
}

function markDown(reason, hint = '') {
  if (cloudDown) return
  cloudDown = reason
  downEngine = cfg.engine
  try {
    window.dispatchEvent(new CustomEvent('gitmon:tts-downgrade', { detail: { reason, hint } }))
  } catch { /* 忽略 */ }
}

/** 音频容器类型：本地引擎给 wav，其余 mp3（只用于 Cache Storage 存储） */
function mimeFor(engine) {
  return engine === 'local' ? 'audio/wav' : 'audio/mpeg'
}

async function fetchAudio(text, who, engine, signal) {
  const res = await fetch('/api/tts/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, role: who, rate: cfg.rate, engine, llm: llmPayload() }),
    signal,
  })
  if (!res.ok) {
    let detail = {}
    try { detail = await res.json() } catch { /* 非 JSON */ }
    const err = new Error(detail.error || `语音合成失败（HTTP ${res.status}）`)
    err.status = res.status
    err.hint = detail.hint || ''
    throw err
  }
  const buf = await res.arrayBuffer()
  if (!buf.byteLength) throw new Error('语音是空的')
  return buf
}

/** 取一条台词音频：内存 → Cache Storage → 后端 */
async function loadAudio(text, who, engine, { signal, timeout = true } = {}) {
  const key = hashKey(engine, who, text)
  const cached = await cacheGet(key)
  if (cached) return cached

  const ctl = new AbortController()
  let timer = null
  const forwardAbort = () => ctl.abort()
  if (signal) {
    if (signal.aborted) ctl.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }
  if (timeout) {
    timer = setTimeout(() => ctl.abort(), engine === 'local' ? LOCAL_TIMEOUT : FIRST_BYTE_TIMEOUT)
  }
  try {
    const buf = await fetchAudio(text, who, engine, ctl.signal)
    failStreak = 0
    await cachePut(key, buf, mimeFor(engine))
    return buf
  } catch (err) {
    if (err?.status === 404) {
      markDown('unsupported', err.hint || t('当前端点不支持语音合成', 'This endpoint has no speech API'))
    } else if (err?.status === 503) {
      markDown(engine === 'local' ? 'nomodel' : 'nokey', err.hint || '')
    } else if (!err?.status || err.status >= 500) {
      // 连续 3 次失败（超时 / 502 / 断网）就本次会话不再试，别让每句都卡 1.6 秒
      failStreak += 1
      if (failStreak >= 3) {
        markDown('unstable', err?.hint || t('在线音源连续失败', 'Online voice keeps failing'))
      }
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
}

// ---------------------------------------------------------------- 播放

function stopSource(entry) {
  if (!entry) return
  try { entry.source?.stop() } catch { /* 已停 */ }
  try { entry.source?.disconnect() } catch { /* 已断开 */ }
}

async function playBuffer(buf, tag) {
  const c = ensureCtx()
  if (!c) return false
  let audioBuf
  try {
    audioBuf = await c.decodeAudioData(buf.slice(0))
  } catch {
    return false
  }
  if (!cfg.enabled) return false
  const source = c.createBufferSource()
  source.buffer = audioBuf
  source.playbackRate.value = 1
  source.connect(gain)
  const entry = { source, key: tag }
  current = entry
  source.onended = () => {
    if (current === entry) current = null
    bgm.unduck()
  }
  bgm.duck(0.35, 200)
  try {
    source.start()
  } catch {
    if (current === entry) current = null
    bgm.unduck()
    return false
  }
  return true
}

// ---------------------------------------------------------------- 系统朗读

function pickSystemVoice(lang) {
  const list = voicesCache.length ? voicesCache : (window.speechSynthesis?.getVoices() || [])
  voicesCache = list
  if (!list.length) return null
  const want = lang.slice(0, 2).toLowerCase()
  const exact = list.find((v) => v.lang?.toLowerCase().startsWith(want))
  return exact || null
}

function systemSpeak(text, who, tag = '') {
  const synth = window.speechSynthesis
  if (!synth || !window.SpeechSynthesisUtterance) return false
  try { synth.cancel() } catch { /* 忽略 */ }
  const lang = chineseRatio(text) >= 0.3 ? 'zh-CN' : 'en-US'
  const utter = new window.SpeechSynthesisUtterance(text)
  utter.lang = lang
  const voice = pickSystemVoice(lang)
  if (voice) utter.voice = voice
  const prof = PROFILES[who] || PROFILES.narrator
  utter.pitch = prof.pitch
  utter.rate = Math.max(0.5, Math.min(2, cfg.rate * prof.rate))
  utter.volume = cfg.volume
  bgm.duck(0.4, 200)
  utter.onend = () => bgm.unduck()
  utter.onerror = () => bgm.unduck()
  try {
    synth.speak(utter)
  } catch {
    bgm.unduck()
    return false
  }
  current = { source: null, key: tag }
  return true
}

// ---------------------------------------------------------------- 对外接口

function resolveEngine() {
  const want = cfg.engine
  if (want === 'system') return 'system'
  // 只有「当前这个引擎」降过级才退系统；换过音源就重新试一次
  if (cloudDown && downEngine === want) return 'system'
  if (cloudDown) {
    cloudDown = ''
    downEngine = ''
  }
  // 本地合成不需要密钥，也不看端点
  if (want === 'local') return 'local'
  const key = llmPayload().apiKey
  if (!key) {
    markDown('nokey', t('没有绑定模型，语音已改用系统朗读', 'No model bound — using system voice'))
    return 'system'
  }
  return want
}

/** 只掐当前这一句，保留本屏预取队列 */
function stopVoice() {
  seq += 1
  stopSource(current)
  current = null
  try { window.speechSynthesis?.cancel() } catch { /* 忽略 */ }
  bgm.unduck()
}

/** 对外：停播 + 放弃本屏预取（换场景 / 离开剧情时用） */
export function stop() {
  stopVoice()
  if (prefetchCtl) {
    try { prefetchCtl.abort() } catch { /* 忽略 */ }
    prefetchCtl = null
  }
}

/**
 * 念一句台词。
 * @param {{who?: string, text: string, key?: string}} line
 */
export async function speak({ who = 'narrator', text = '', key = '' } = {}) {
  if (!cfg.enabled) return
  // 必须在用户手势的同步栈里建 AudioContext：iOS 只在手势内允许出声
  ensureCtx()
  const clean = sanitizeForSpeech(text)
  if (!clean) return
  // 同一句正在念就不重播（连点推进时避免叠音）
  if (current && key && current.key === key && current.source) return

  stopVoice()
  const engine = resolveEngine()
  const token = seq
  const tag = key || clean.slice(0, 24)

  if (engine === 'system') {
    current = { source: null, key: tag }
    systemSpeak(clean, who, tag)
    return
  }

  try {
    const buf = await loadAudio(clean, who, engine)
    if (token !== seq || !cfg.enabled) return
    const ok = await playBuffer(buf, tag)
    if (!ok) systemSpeak(clean, who, tag)
  } catch (err) {
    if (err?.name === 'AbortError' || token !== seq) return
    // 本地/在线任何问题都退回系统朗读，剧情推进不等语音
    systemSpeak(clean, who, tag)
  }
}

/** 整屏预取：玩家读完上一句之前，下一句的音频一般已经就位 */
export function prefetch(lines = []) {
  if (!cfg.enabled) return
  const engine = resolveEngine()
  if (engine === 'system') return
  // 本地是 CPU 串行合成，预取太多反而挤占正在念的那句
  const depth = engine === 'local' ? 2 : 3
  const items = (lines || []).filter((line) => line?.text).slice(0, depth)
  if (!items.length) return

  if (prefetchCtl) {
    try { prefetchCtl.abort() } catch { /* 忽略 */ }
  }
  const ctl = new AbortController()
  prefetchCtl = ctl

  const queue = [...items]
  const worker = async () => {
    while (queue.length && !ctl.signal.aborted) {
      const line = queue.shift()
      try {
        await loadAudio(sanitizeForSpeech(line.text), line.who || 'narrator', engine, {
          signal: ctl.signal, timeout: false,
        })
      } catch { /* 预取失败不打扰玩家，真正播的时候再退系统 */ }
    }
  }
  Promise.all([worker(), worker()]).catch(() => {})
}

/** 试听：设置页用，一次一句 */
export async function preview(who = 'narrator') {
  const sample = {
    narrator: t('那一天，榜单上只剩一个名字。', 'That day, only one name was left on the board.'),
    pet: t('我不是来排名的，我来找一个人。', 'I am not here to rank — I am here to find someone.'),
    scout: t('又一个想登榜的？先把名字留下。', 'Another climber? Leave your name first.'),
    boss: t('山顶风大，你带的东西够撑几回合？', 'It is windy up here. How many rounds can you last?'),
  }[who] || t('试听一句。', 'A quick voice test.')
  await speak({ who, text: sample, key: `preview-${who}-${Date.now()}` })
}

export const tts = {
  speak,
  stop,
  prefetch,
  preview,
  unlock: unlockTts,
  warm: warmLocal,
  get config() { return getTtsConfig() },
  get degraded() { return cloudDown },
  sanitize: sanitizeForSpeech,
  roles: ROLE_LIST,
  engines: ENGINES,
}
