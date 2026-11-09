// 高级模式：把评测整体交给用户自填的 LLM（OpenAI 兼容接口）
// 请求走自己的 FastAPI 后端代理，浏览器不直连模型，也不受 CORS 限制。
//
// BYOK 自动绑定：用户只粘贴一枚密钥，后端去各厂商 /models 探测归属，
// 自动带回 baseUrl / model / 厂商名。密钥只存 sessionStorage（关标签页即失效），
// 绑定结果（不含密钥）存 localStorage，下次打开自动恢复。
import { ownerHeader } from './sync.js'

const CFG_KEY = 'gitmon:llm:config'
const KEY_KEY = 'gitmon:llm:key'
const TIMEOUT = 90000
const BIND_TIMEOUT = 45000

export const DEFAULT_LLM_CONFIG = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  binding: null,
  custom: null, // 自托管端点兜底：{ baseUrl, label, model }
  deepAudit: true, // 深度审计（2–5 分钟真实审计演出）默认开，已拍板
}

function readJSON(store, key) {
  try {
    const raw = store.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function loadLLMConfig() {
  const saved = readJSON(localStorage, CFG_KEY) || {}
  let key = ''
  try { key = sessionStorage.getItem(KEY_KEY) || '' } catch { /* 隐私模式下忽略 */ }
  return {
    baseUrl: typeof saved.baseUrl === 'string' && saved.baseUrl ? saved.baseUrl : DEFAULT_LLM_CONFIG.baseUrl,
    model: typeof saved.model === 'string' && saved.model ? saved.model : DEFAULT_LLM_CONFIG.model,
    binding: saved.binding && typeof saved.binding === 'object' ? saved.binding : null,
    custom: saved.custom && typeof saved.custom === 'object' ? saved.custom : null,
    deepAudit: saved.deepAudit !== false,
    apiKey: key,
  }
}

export function saveLLMConfig(config) {
  try {
    // 明确只落非敏感字段：密钥不落，models 只是模型 id 列表（无密钥），存下来下次打开还能直接换选
    const binding = config.binding ? {
      provider: config.binding.provider,
      label: config.binding.label,
      baseUrl: config.binding.baseUrl,
      model: config.binding.model,
      verified: config.binding.verified,
      detectedBy: config.binding.detectedBy,
      models: Array.isArray(config.binding.models) ? config.binding.models : [],
    } : null
    localStorage.setItem(CFG_KEY, JSON.stringify({
      baseUrl: config.baseUrl,
      model: config.model,
      binding,
      custom: config.custom || null,
      deepAudit: config.deepAudit !== false,
    }))
  } catch { /* 存储不可用就只在本次会话生效 */ }
  try {
    if (config.apiKey) sessionStorage.setItem(KEY_KEY, config.apiKey)
    else sessionStorage.removeItem(KEY_KEY)
  } catch { /* 同上 */ }
}

export function clearLLMKey() {
  try { sessionStorage.removeItem(KEY_KEY) } catch { /* noop */ }
}

// 绑定结果优先：确保「评测用的模型」和「钢印上写的模型」是同一个
export function boundConfig(config) {
  const b = config?.binding
  if (!b) return config
  return {
    ...config,
    baseUrl: b.baseUrl || config.baseUrl,
    model: b.model || config.model,
  }
}

// 后端错误是 { detail: { error, hint } }；模型侧错误统一翻译成人话
function errorMessage(status, body, route = '/api/llm/evaluate') {
  const detail = body?.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return [detail.error, detail.hint].filter(Boolean).join(' · ')
  }
  if (typeof detail === 'string' && detail) return detail
  if (status === 404) return `后端没有 ${route} —— 请确认 FastAPI 服务是最新版本`
  if (status === 422) return '密钥格式不对，粘贴完整密钥（至少 8 个字符）'
  return `请求失败（HTTP ${status}）`
}

async function postJSON(route, body, timeout, fallback) {
  let res
  try {
    res = await fetch(route, {
      method: 'POST',
      // 走自己后端的请求都带身份头（SSOT §2）
      headers: { 'Content-Type': 'application/json', ...ownerHeader() },
      body: JSON.stringify(body),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeout) : undefined,
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      if (route.endsWith('/ping')) throw new Error('连接测试超时（30 秒），检查网络代理，或换一个更快的模型')
      throw new Error(route.endsWith('/bind')
        ? '自动识别超时（45 秒），检查网络代理，或展开「自定义端点」手动指定'
        : '模型评测超时（90 秒），换个更快的模型或检查网络代理')
    }
    throw new Error(fallback)
  }
  let data = null
  try { data = await res.json() } catch { /* 非 JSON 响应，走状态码分支 */ }
  if (!res.ok) throw new Error(errorMessage(res.status, data, route))
  return data
}

/** 只给密钥，后端自动识别厂商 / Base URL / 聊天模型 */
export async function bindWithLLM({ apiKey, custom = null } = {}) {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error('先粘贴一枚 API Key，厂商和模型会自动识别')
  const body = { apiKey: key }
  if (custom?.baseUrl?.trim()) {
    body.custom = {
      baseUrl: custom.baseUrl.trim(),
      label: (custom.label || '自定义端点').trim() || '自定义端点',
      model: (custom.model || '').trim(),
    }
  }
  const data = await postJSON(
    '/api/llm/bind', body, BIND_TIMEOUT,
    '连不上后端 /api/llm/bind —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）',
  )
  if (!data?.baseUrl || !data?.model) throw new Error('自动绑定结果不完整，请重试或改用自定义端点')
  return data
}

/** 连接测试：一次极小的对话请求，通了才允许开启高级模式（绑定只验证过 /models） */
export async function pingWithLLM({ config } = {}) {
  const eff = boundConfig(config)
  const data = await postJSON('/api/llm/ping', {
    baseUrl: eff.baseUrl?.trim() || DEFAULT_LLM_CONFIG.baseUrl,
    model: eff.model?.trim() || DEFAULT_LLM_CONFIG.model,
    apiKey: config?.apiKey || '',
  }, 30000, '连不上后端 /api/llm/ping —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）')
  if (!data?.ok) throw new Error('连接测试返回结构不对')
  return data
}

/** 所有评测项都由模型给出；这里只负责转发与错误翻译。evidence = 深度审计的真实抓取证据 */
export async function evaluateWithLLM({ repo, config, hint = '', platform = 'github', evidence = null }) {
  const eff = boundConfig(config)
  const body = {
    repo,
    baseUrl: eff.baseUrl?.trim() || DEFAULT_LLM_CONFIG.baseUrl,
    model: eff.model?.trim() || DEFAULT_LLM_CONFIG.model,
    apiKey: config.apiKey || '',
    hint,
    platform,
  }
  if (evidence && typeof evidence === 'object') body.evidence = evidence
  const data = await postJSON('/api/llm/evaluate', body, TIMEOUT, '连不上后端 /api/llm/evaluate —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）')
  if (!data?.evaluation) throw new Error('后端返回结构不对：缺少 evaluation')
  return data
}

/** 高级竞技场：模型对比两个项目水平，推演回合对战 + 审计报告 */
export async function battleWithLLM({ player, opponent, difficulty = 'normal', config }) {
  const eff = boundConfig(config)
  const data = await postJSON('/api/llm/battle', {
    player,
    opponent,
    difficulty,
    baseUrl: eff.baseUrl?.trim() || DEFAULT_LLM_CONFIG.baseUrl,
    model: eff.model?.trim() || DEFAULT_LLM_CONFIG.model,
    apiKey: config?.apiKey || '',
  }, TIMEOUT, '连不上后端 /api/llm/battle —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）')
  if (!data?.battle?.rounds?.length) throw new Error('后端返回结构不对：缺少 battle.rounds')
  return data
}
