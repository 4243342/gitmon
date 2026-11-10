// 剧情模式接口封装：/api/story/*
// 所有请求都带身份头（SSOT §2）；模型密钥只从内存里的 llmConfig 取，服务端转发即丢弃。
import { ownerHeader } from '../sync.js'

const TIMEOUT = {
  default: 60000,
  preview: 180000,
  start: 180000,
  scripts: 60000,
  text: 12000,
}

async function request(path, { method = 'POST', body, timeout = TIMEOUT.default } = {}) {
  let ghToken = ''
  try { ghToken = localStorage.getItem('gitmon:gh_token') || '' } catch { /* 隐私模式忽略 */ }
  let res
  try {
    res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...ownerHeader(),
        // 游客 / 本机登录的 GitHub 令牌：后端用它执行 Search 与仓库扫描
        ...(ghToken ? { 'X-GitHub-Token': ghToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeout) : undefined,
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(path.includes('/preview') || path.includes('/start')
        ? '检索超时：GitHub 或模型响应太慢，点「换一批」重试'
        : '请求超时，稍后重试')
    }
    throw new Error('连不上后端 /api/story —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）')
  }
  let data = null
  try { data = await res.json() } catch { /* 非 JSON 响应走状态码 */ }
  if (!res.ok) {
    const detail = data?.detail
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      throw new Error([detail.error, detail.hint].filter(Boolean).join(' · '))
    }
    if (typeof detail === 'string' && detail) throw new Error(detail)
    if (data?.error) throw new Error([data.error, data.hint].filter(Boolean).join(' · '))
    if (res.status === 409) throw new Error(data?.error || '已有一条进行中的剧情线')
    throw new Error(`请求失败（HTTP ${res.status}）`)
  }
  return data
}

/** 把本地 llmConfig 收敛成后端要的三字段（binding 优先，和评测用同一个模型） */
export function llmPayload(config) {
  const binding = config?.binding
  return {
    baseUrl: binding?.baseUrl || config?.baseUrl || '',
    model: binding?.model || config?.model || '',
    apiKey: config?.apiKey || '',
  }
}

export const storyApi = {
  current: () => request('/api/story/current', { method: 'GET' }),
  preview: ({ pet, config, seed, refresh = false }) =>
    request('/api/story/preview', { body: { pet, llm: llmPayload(config), seed, refresh }, timeout: TIMEOUT.preview }),
  checkBoss: ({ fullName }) => request('/api/story/boss/check', { body: { full_name: fullName } }),
  scripts: ({ pet, boss, config }) =>
    request('/api/story/scripts', { body: { pet, boss, llm: llmPayload(config) }, timeout: TIMEOUT.scripts }),
  customScript: ({ pet, boss, input, config }) =>
    request('/api/story/scripts/custom', { body: { pet, boss, input, llm: llmPayload(config) }, timeout: TIMEOUT.scripts }),
  start: ({ pet, boss, script, track, rationale, queries, selectionSource, seed, config }) =>
    request('/api/story/start', {
      body: {
        pet, boss, script, track, rationale, queries,
        selection_source: selectionSource || 'ai', seed, llm: llmPayload(config),
      },
      timeout: TIMEOUT.start,
    }),
  text: ({ sceneId, keys, vars, context, config }) =>
    request('/api/story/text', {
      body: { scene_id: sceneId, keys, vars, context, llm: llmPayload(config) },
      timeout: TIMEOUT.text,
    }),
  progress: (payload) => request('/api/story/progress', { body: payload }),
  save: (payload) => request('/api/story/save', { body: payload }),
  load: (payload) => request('/api/story/load', { body: payload }),
  rollback: (runId) => request('/api/story/rollback', { body: { run_id: runId } }),
  endings: () => request('/api/story/endings', { method: 'GET' }),
  archive: () => request('/api/story/archive', { method: 'GET' }),
  close: (runId, reason = 'abandon') => request('/api/story/close', { body: { run_id: runId, reason } }),
}
