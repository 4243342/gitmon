// 登录授权（前端侧）：GitHub OAuth + 个人访问令牌
//
// 两条路最终都落到同一个地方：localStorage['gitmon:gh_token']。
// scan.js 直接读这个键去调 GitHub API（匿名 60 次/小时 → 带令牌 5000 次/小时）。
//
// 后端不在（纯静态部署）时自动降级为"本地令牌"模式：
// 不请求 /api/auth/*，令牌只存在这台浏览器里，功能一样但换个设备要重新贴。

const TOKEN_KEY = 'gitmon:gh_token'
const PROFILE_KEY = 'gitmon:me'
const SKIP_KEY = 'gitmon:guest'

function ls() {
  try { return window.localStorage } catch { return null }
}

export function localToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

function cacheProfile(profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    else localStorage.removeItem(PROFILE_KEY)
  } catch { /* 隐私模式忽略 */ }
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
    headers: { 'content-type': 'application/json' },
    ...init,
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
    if (profile.authenticated) {
      // 会话存在 → 取回令牌给 scan.js 用
      try {
        const { token } = await api('/api/auth/token')
        if (token) localStorage.setItem(TOKEN_KEY, token)
      } catch { /* 令牌取不到就退回本地已有值 */ }
      cacheProfile(profile)
    }
    return { online: true, profile }
  } catch (e) {
    if (e.status) return { online: true, profile: { authenticated: false, oauth: false } }
    return { online: false, profile: null }
  }
}

// OAuth：整页跳转，回来时 URL 带 ?auth=ok
export function startGithubLogin(next = '/') {
  const target = `/api/auth/github/start?next=${encodeURIComponent(next)}`
  window.location.href = target
}

// 个人访问令牌登录
export async function loginWithToken(token) {
  const clean = String(token || '').trim()
  if (clean.length < 8) throw new Error('令牌太短，GitHub 令牌通常是 ghp_ 开头的一长串')
  try {
    const profile = await api('/api/auth/github/token', {
      method: 'POST',
      body: JSON.stringify({ token: clean }),
    })
    localStorage.setItem(TOKEN_KEY, clean)
    cacheProfile(profile)
    clearGuest()
    return { online: true, profile }
  } catch (e) {
    // 后端没起：本地模式，直接存令牌（扫描仍然在浏览器里直连 GitHub）
    if (!e.status) {
      const profile = await verifyTokenLocally(clean)
      localStorage.setItem(TOKEN_KEY, clean)
      cacheProfile(profile)
      clearGuest()
      return { online: false, profile }
    }
    throw e
  }
}

// 离线自检：直接问 GitHub 这个令牌是谁
async function verifyTokenLocally(token) {
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
    if (token) localStorage.setItem(TOKEN_KEY, token)
  } catch { /* 令牌取不到也不挡进入 */ }
  cacheProfile(profile)
  clearGuest()
  return { online: true, profile }
}

export async function logout() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
  cacheProfile(null)
  try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* 后端没起就算了 */ }
}

export async function fetchProviders() {
  try {
    return await api('/api/auth/providers')
  } catch {
    return { github: { oauth: false }, anonymous: { quotaPerHour: 60, authenticatedPerHour: 5000 } }
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
  const quota = profile?.quota || {}
  if (quota.limit) {
    const left = quota.remaining === null || quota.remaining === undefined ? '?' : quota.remaining
    return `${left}/${quota.limit} 次`
  }
  return profile?.authenticated ? '5000 次/小时' : '60 次/小时'
}
