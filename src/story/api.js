// 剧情模式接口封装：/api/story/*
// 所有请求都带身份头（SSOT §2）；模型密钥只从内存里的 llmConfig 取，服务端转发即丢弃。
import { ownerHeader } from '../sync.js'
import { t } from '../i18n.js'

const TIMEOUT = {
  default: 60000,
  preview: 180000,
  start: 180000,
  scripts: 90000,
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
    let message = ''
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      message = [detail.error, detail.hint].filter(Boolean).join(' · ')
    } else if (typeof detail === 'string' && detail) {
      message = detail
    } else if (data?.error) {
      message = [data.error, data.hint].filter(Boolean).join(' · ')
    } else if (res.status === 409) {
      message = '已有一条进行中的剧情线'
    } else {
      message = `请求失败（HTTP ${res.status}）`
    }
    const err = new Error(message)
    // 上层（progressQueue）据此区分「这一屏作废、要重新同步」和「网络抖动、稍后重试」
    err.status = res.status
    err.expired = res.status === 409 && /过期/.test(message)
    throw err
  }
  return data
}

/** 把本地 llmConfig 收敛成后端要的三字段（binding 优先，和评测用同一个模型） */export function llmPayload(config) {
  const binding = config?.binding
  const apiKey = config?.apiKey || ''
  // binding 落在 localStorage（持久），密钥只在 sessionStorage（新标签页即失效）。
  // 两者口径不一致时绝不能发空 key：后端会静默降级成规则检索，
  // 用户以为模型在工作，实际拿到的是英文仓库描述拼出来的「推荐」。
  if (binding && !apiKey.trim()) {
    throw new Error(t(
      '模型密钥已失效：密钥只保存在当前标签页，请到「AI高级版入口」重新粘贴一次。',
      'Model key expired: it lives in this tab only — paste it again in AI Pro.',
    ))
  }
  return {
    baseUrl: binding?.baseUrl || config?.baseUrl || '',
    model: binding?.model || config?.model || '',
    apiKey,
  }
}

/**
 * 选对手的流式版：边收阶段事件边推进 UI，最后返回与 /preview 完全一样的结果。
 * 后端没升级（404 / 没有 body 流）时自动退回普通请求，不让功能挂掉。
 */
async function streamPreview({ pet, config, seed, refresh = false, onStage, onPing }) {
  const fallback = () => request('/api/story/preview', {
    body: { pet, llm: llmPayload(config), seed, refresh }, timeout: TIMEOUT.preview,
  })
  if (typeof fetch !== 'function' || typeof TextDecoder !== 'function') return fallback()

  let ghToken = ''
  try { ghToken = localStorage.getItem('gitmon:gh_token') || '' } catch { /* 隐私模式忽略 */ }
  let res
  try {
    res = await fetch('/api/story/preview/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...ownerHeader(),
        ...(ghToken ? { 'X-GitHub-Token': ghToken } : {}),
      },
      body: JSON.stringify({ pet, llm: llmPayload(config), seed, refresh }),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT.preview) : undefined,
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(t('检索超时：GitHub 或模型响应太慢，点「换一批」重试', 'Search timed out — GitHub or the model was too slow; hit Reroll.'))
    }
    throw new Error(t('连不上后端 /api/story —— 请先启动 FastAPI 服务（默认 127.0.0.1:8000）', 'Cannot reach /api/story — start the FastAPI server (127.0.0.1:8000).'))
  }
  if (!res.ok || !res.body) return fallback()

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data = null
  let failure = null
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (!line) continue
        let evt
        try { evt = JSON.parse(line) } catch { continue }
        if (evt.type === 'stage') onStage?.(evt)
        else if (evt.type === 'ping') onPing?.(evt)
        else if (evt.type === 'result') data = evt.data
        else if (evt.type === 'error') failure = evt
      }
    }
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(t('检索超时：GitHub 或模型响应太慢，点「换一批」重试', 'Search timed out — GitHub or the model was too slow; hit Reroll.'))
    }
    throw err
  }

  if (failure) throw new Error([failure.error, failure.hint].filter(Boolean).join(' · '))
  if (!data) {
    throw new Error(t('检索中断：没拿到结果，点「换一批」重试', 'Stream broke before the result arrived — hit Reroll.'))
  }
  return data
}

export const storyApi = {
  current: () => request('/api/story/current', { method: 'GET' }),
  preview: ({ pet, config, seed, refresh = false }) =>
    request('/api/story/preview', { body: { pet, llm: llmPayload(config), seed, refresh }, timeout: TIMEOUT.preview }),
  previewStream: ({ pet, config, seed, refresh = false, onStage, onPing }) =>
    streamPreview({ pet, config, seed, refresh, onStage, onPing }),
  checkBoss: ({ fullName }) => request('/api/story/boss/check', { body: { full_name: fullName } }),
  // 可用的系统剧本包（斗码苍穹等）
  packs: () => request('/api/story/packs', { method: 'GET' }),
  // mode='system' 只要剧本包内置的方案（绝不调模型），'auto' 才让模型写
  scripts: ({ pet, boss, config, research, mode = 'auto', pack = '' }) =>
    request('/api/story/scripts', {
      body: { pet, boss, llm: llmPayload(config), research: research || null, mode, pack },
      timeout: mode === 'system' ? 15000 : TIMEOUT.scripts,
    }),
  customScript: ({ pet, boss, input, config, research }) =>
    request('/api/story/scripts/custom', {
      body: { pet, boss, input, llm: llmPayload(config), research: research || null },
      timeout: TIMEOUT.scripts,
    }),
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
