// 登录授权（前端侧）：GitHub / Gitee 双平台 + 游客
//
// 三条路：
// 1. GitHub OAuth（或本机 gh 登录态）→ localStorage['gitmon:gh_token'] → 5000 次/小时
// 2. Gitee  OAuth                    → localStorage['gitmon:gitee_token']
// 3. 游客                            → 不登录，匿名 60 次/小时，手填仓库地址
//
// 不提供手填个人访问令牌：授权统一走平台 OAuth，令牌由后端换取后下发。
//
// 令牌落在 localStorage 是因为 scan.js 是浏览器直连平台 API 的（省一次中转）。
// 后端不在（纯静态部署）时自动降级为"本地令牌"模式。

import { ownerHeader } from './sync.js'

const GH_TOKEN_KEY = 'gitmon:gh_token'
const GT_TOKEN_KEY = 'gitmon:gitee_token'
const PROFILE_KEY = 'gitmon:me'
const SKIP_KEY = 'gitmon:guest'

export const PROVIDER_LABEL = { github: 'GitHub', gitee: 'Gitee' }

const TOKEN_KEY = { github: GH_TOKEN_KEY, gitee: GT_TOKEN_KEY }

function cacheProfile(profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    else localStorage.removeItem(PROFILE_KEY)
  } catch { /* 隐私模式忽略 */ }
}

function storeToken(provider, token) {
  try {
    const key = TOKEN_KEY[provider] || GH_TOKEN_KEY
    if (token) localStorage.setItem(key, token)
  } catch { /* ignore */ }
}

function dropProviderToken(provider) {
  try { localStorage.removeItem(TOKEN_KEY[provider] || GH_TOKEN_KEY) } catch { /* ignore */ }
}

function dropTokens() {
  dropProviderToken('github')
  dropProviderToken('gitee')
}

export function localToken(provider = 'github') {
  try { return localStorage.getItem(TOKEN_KEY[provider] || GH_TOKEN_KEY) || '' } catch { return '' }
}

export function cachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function guestSkipped() {
  try { return localStorage.getItem(SKIP_KEY) === '1' } catch { return false }
}

export function skipLogin() {
  try { localStorage.setItem(SKIP_KEY, '1') } catch { /* ignore */ }
}

export function clearGuest() {
  try { localStorage.removeItem(SKIP_KEY) } catch { /* ignore */ }
}

async function api(path, init) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    // 所有 /api/* 请求都带身份头（SSOT §2），调用方自带的 headers 照常合并
    headers: { 'content-type': 'application/json', ...ownerHeader(), ...(init?.headers || {}) },
  })
  let payload = null
  try { payload = await res.json() } catch { payload = null }
  if (!res.ok) {
    const message = payload?.error || `请求失败（${res.status}）`
    const err = new Error(message)
    err.hint = payload?.hint || ''
    err.status = res.status
    throw err
  }
  return payload
}

// 拉当前登录态。后端不可达时返回 online:false，前端据此走本地模式
export async function fetchMe({ quota = true } = {}) {
  try {
    const profile = await api(`/api/auth/me?quota=${quota ? 1 : 0}`)
    if (profile.notice) {
      // 后端判定令牌已失效且无法刷新：清掉本地那串废令牌，别让 scan.js 拿去直连平台
      dropProviderToken(profile.noticeProvider || 'gitee')
      cacheProfile(null)
    }
    if (profile.authenticated) {
      // 会话存在 → 取回令牌给 scan.js 用（按平台分别存）
      try {
        const { token, provider } = await api('/api/auth/token')
        if (token) storeToken(provider || profile.provider || 'github', token)
      } catch { /* 令牌取不到就退回本地已有值 */ }
      cacheProfile(profile)
    }
    return { online: true, profile, notice: profile.notice || '' }
  } catch (e) {
    if (e.status) return { online: true, profile: { authenticated: false, oauth: false }, notice: '' }
    return { online: false, profile: null, notice: '' }
  }
}

// OAuth：整页跳转，回来时 URL 带 ?auth=ok
export function startLogin(provider = 'github', next = '/') {
  const target = `/api/auth/${provider}/start?next=${encodeURIComponent(next)}`
  window.location.href = target
}

export const startGithubLogin = (next = '/') => startLogin('github', next)

// 令牌登录：只在平台没配 OAuth 应用时启用（Gitee 常见），保证"允许 Gitee 登录"这条
// 不依赖用户先去注册一个应用。OAuth 配好之后授权页就不再显示这个入口。
export async function loginWithToken(token, provider = 'github') {
  const clean = String(token || '').trim()
  if (clean.length < 8) {
    throw new Error(provider === 'gitee' ? '令牌太短，Gitee 私人令牌是一长串字符' : '令牌太短，GitHub 令牌通常是 ghp_ 开头的一长串')
  }
  try {
    const profile = await api(`/api/auth/${provider}/token`, {
      method: 'POST',
      body: JSON.stringify({ token: clean }),
    })
    storeToken(provider, clean)
    cacheProfile(profile)
    clearGuest()
    return { online: true, profile }
  } catch (e) {
    // 后端没起：本地模式，直接存令牌（扫描仍然在浏览器里直连平台 API）
    if (!e.status) {
      const profile = await verifyTokenLocally(clean, provider)
      storeToken(provider, clean)
      cacheProfile(profile)
      clearGuest()
      return { online: false, profile }
    }
    throw e
  }
}

// 离线自检：直接问平台"这个令牌是谁"
async function verifyTokenLocally(token, provider) {
  if (provider === 'gitee') {
    let res
    try {
      res = await fetch(`https://gitee.com/api/v5/user?access_token=${encodeURIComponent(token)}`)
    } catch {
      throw new Error('无法连接 Gitee，检查网络后重试')
    }
    if (res.status === 401 || res.status === 403) throw new Error('Gitee 令牌无效或已过期')
    if (!res.ok) throw new Error(`Gitee 返回 ${res.status}`)
    const user = await res.json()
    return {
      authenticated: true,
      provider: 'gitee',
      login: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url || '',
      source: 'local',
      hasToken: true,
      quota: {},
      oauth: false,
    }
  }

  let res
  try {
    res = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('无法连接 GitHub，检查网络后重试')
  }
  if (res.status === 401) throw new Error('令牌无效或已过期')
  if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`)
  const user = await res.json()
  return {
    authenticated: true,
    provider: 'github',
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url || '',
    scopes: res.headers.get('x-oauth-scopes') || '',
    source: 'local',
    hasToken: true,
    quota: {},
    oauth: false,
  }
}

// 本机已登录（后端复用 gh CLI 的令牌，仅 127.0.0.1 可用）
export async function loginLocal() {
  const profile = await api('/api/auth/github/local', { method: 'POST' })
  try {
    const { token } = await api('/api/auth/token')
    if (token) storeToken('github', token)
  } catch { /* 令牌取不到也不挡进入 */ }
  cacheProfile(profile)
  clearGuest()
  return { online: true, profile }
}

export async function logout() {
  dropTokens()
  cacheProfile(null)
  try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* 后端没起就算了 */ }
}

export async function fetchProviders() {
  try {
    return await api('/api/auth/providers')
  } catch {
    return {
      github: { oauth: false },
      gitee: { oauth: false },
      anonymous: { quotaPerHour: 60, authenticatedPerHour: 5000 },
    }
  }
}

// 清掉 OAuth 回跳带的 ?auth=ok / failed，避免刷新重复提示
export function consumeAuthQuery() {
  try {
    const url = new URL(window.location.href)
    const auth = url.searchParams.get('auth')
    if (!auth) return null
    const reason = url.searchParams.get('reason') || ''
    url.searchParams.delete('auth')
    url.searchParams.delete('reason')
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
    return { status: auth, reason }
  } catch { return null }
}

export function quotaText(profile) {
  if (!profile?.authenticated) return '60 次/小时'
  if (profile.provider === 'gitee') return 'Gitee 令牌'
  const quota = profile.quota || {}
  if (quota.limit) {
    const left = quota.remaining === null || quota.remaining === undefined ? '?' : quota.remaining
    return `${left}/${quota.limit} 次`
  }
  return '5000 次/小时'
}
