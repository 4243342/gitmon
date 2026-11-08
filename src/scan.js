// RepoScanner —— 统一抽象（文档 §2.1）
// GitHub / Gitee 各自实现，产出标准 RepoSnapshot

const CACHE_TTL = 6 * 60 * 60 * 1000 // 6h（文档 §8.6）

// 输入解析：既接受单个仓库，也接受"账号整页"（该账号拥有的所有项目 → 一整箱卡包）
// 文档 §2.1；账号维度见 §2.3
export function parseRepoInput(input) {
  let raw = String(input || '').trim()
  if (!raw) return null
  // github.com/orgs/foo → 组织主页，等同账号
  raw = raw.replace(/github\.com[/:]+orgs[/:]+/i, 'github.com/')

  // 带域名的形式：github.com/owner/repo 或 github.com/owner
  const m = raw.match(/(github\.com|gitee\.com)[/:]+([\w.-]+)(?:\/([\w.-]+))?/i)
  if (m) {
    const platform = m[1].toLowerCase().includes('gitee') ? 'gitee' : 'github'
    const owner = m[2]
    const repo = (m[3] || '').replace(/\.git$/i, '')
    if (repo && repo !== 'orgs') return { kind: 'repo', platform, owner, repo, fullName: `${owner}/${repo}` }
    return { kind: 'owner', platform, owner }
  }

  // 裸写：owner/repo 或 owner
  const parts = raw.replace(/^https?:\/\//i, '').replace(/^@/, '').split('/').filter(Boolean)
  if (parts.length === 2 && !parts[0].includes('.') && /^[\w.-]+$/.test(parts[0]) && /^[\w.-]+$/.test(parts[1])) {
    return { kind: 'repo', platform: 'github', owner: parts[0], repo: parts[1].replace(/\.git$/i, ''), fullName: `${parts[0]}/${parts[1].replace(/\.git$/i, '')}` }
  }
  if (parts.length === 1 && /^[\w.-]+$/.test(parts[0])) {
    return { kind: 'owner', platform: 'github', owner: parts[0] }
  }
  return null
}

// 兼容旧调用
export const parseRepoUrl = parseRepoInput

function cacheKey(info) {
  return `gitmon:snap:${info.platform}/${info.fullName}`
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { at, data } = JSON.parse(raw)
    if (Date.now() - at > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }))
  } catch { /* ignore quota */ }
}

// ---------- 通用工具 ----------
function monthsBetween(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
}

function daysSince(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 999
  return Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

const TEST_HINTS = ['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress']
const DOC_HINTS = ['docs', 'doc', 'documentation', 'website', 'site']

function inspectRoot(names = []) {
  const lower = names.map((n) => n.toLowerCase())
  const has = (kw) => lower.some((n) => n.includes(kw))
  return {
    hasTests: lower.some((n) => TEST_HINTS.some((t) => n === t || n.startsWith(t))),
    hasDocs: lower.some((n) => DOC_HINTS.some((t) => n === t || n.startsWith(t))),
    hasChangelog: has('changelog'),
    hasContributing: has('contributing'),
    hasLicense: has('license'),
    hasLockfile: has('package-lock') || has('yarn.lock') || has('pnpm-lock') || has('poetry.lock') || has('go.sum') || has('cargo.lock'),
    hasDocker: has('dockerfile') || has('docker-compose'),
    hasTypeConfig: has('tsconfig') || has('pyproject') || has('.editorconfig'),
  }
}

// 网络抖动重试一次：并发 5 个请求时偶发 socket 错误，不能让它静默变成"没有文件"
async function safeFetch(url, init) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.status >= 500 && attempt === 0) continue
      return res
    } catch {
      if (attempt === 1) return null
    }
  }
  return null
}

// ---------- GitHub ----------
function ghRateMessage() {
  return ghToken()
    ? 'GitHub 配额用尽（5000 次/小时也会打满），稍后再试'
    : 'GitHub 匿名配额用尽（60 次/小时），登录后是 5000 次/小时'
}

function ghHeaders() {
  const token = (() => {
    try { return localStorage.getItem('gitmon:gh_token') || '' } catch { return '' }
  })()
  return token ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` } : { Accept: 'application/vnd.github+json' }
}

async function scanGitHub(info, prefetched) {
  const base = 'https://api.github.com'
  let repo = prefetched
  if (!repo) {
    const repoRes = await fetch(`${base}/repos/${info.owner}/${info.repo}`, {
      headers: ghHeaders(),
    })
    if (repoRes.status === 404) throw new Error('仓库不存在或无权限访问')
    if (repoRes.status === 403) throw new Error(ghRateMessage())
    if (!repoRes.ok) throw new Error(`GitHub API 错误 ${repoRes.status}`)
    repo = await repoRes.json()
  }

  const H = { headers: ghHeaders() }
  const [langsRes, rootRes, relRes, contribRes, commitRes] = await Promise.all([
    safeFetch(`${base}/repos/${info.owner}/${info.repo}/languages`, H),
    safeFetch(`${base}/repos/${info.owner}/${info.repo}/contents/`, H),
    safeFetch(`${base}/repos/${info.owner}/${info.repo}/releases?per_page=1`, H),
    safeFetch(`${base}/repos/${info.owner}/${info.repo}/contributors?per_page=1&anon=1`, H),
    safeFetch(`${base}/repos/${info.owner}/${info.repo}/commits?per_page=1`, H),
  ])

  // 限流时子请求会 403：此时文件列表/语言全为空，品质会被判成 N —— 与其静默给出错判，不如直接报错
  if ([langsRes, rootRes, relRes, contribRes, commitRes].some((r) => r && (r.status === 403 || r.status === 429))) {
    throw new Error(ghRateMessage())
  }

  const langsRaw = langsRes && langsRes.ok ? await langsRes.json() : {}
  const totalBytes = Object.values(langsRaw).reduce((a, b) => a + b, 0) || 1
  const languages = Object.entries(langsRaw)
    .map(([name, bytes]) => ({ name, bytes, pct: (bytes / totalBytes) * 100 }))
    .sort((a, b) => b.bytes - a.bytes)

  const rootNames = rootRes && rootRes.ok ? (await rootRes.json()).map((f) => f.name) : []
  const rootInfo = inspectRoot(rootNames)
  const hasCIRoot = rootNames.some((n) => n.toLowerCase() === '.github')
  // 有 .github 目录时进一步看 workflows
  let hasCI = false
  if (hasCIRoot) {
    try {
      const wf = await fetch(`${base}/repos/${info.owner}/${info.repo}/contents/.github/workflows`, { headers: ghHeaders() })
      hasCI = wf.ok
    } catch { /* ignore */ }
  }
  if (!hasCI && rootNames.some((n) => ['.gitlab-ci.yml', '.travis.yml', 'azure-pipelines.yml', 'Jenkinsfile'].includes(n))) hasCI = true

  // 总数用 Link 头的 last page 反推（per_page=1 时数组长度恒为 1，不能当总数）
  const totalFromLink = (res, fallback) => {
    if (!res || !res.ok) return fallback
    const last = (res.headers.get('link') || '').match(/[?&]page=(\d+)>; rel="last"/)?.[1]
    return last ? Number(last) : fallback
  }
  const releaseCount = totalFromLink(relRes, (relRes && relRes.ok) ? 1 : 0)
  const contribCount = totalFromLink(contribRes, 1)
  const commitCount = totalFromLink(commitRes, 1)

  return {
    platform: 'github',
    owner: info.owner,
    repo: info.repo,
    fullName: info.fullName,
    url: repo.html_url,
    description: repo.description || '',
    topics: repo.topics || [],
    homepage: repo.homepage || '',
    languages,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    watchers: repo.subscribers_count || repo.watchers_count || 0,
    openIssues: repo.open_issues_count || 0,
    contributors: contribCount,
    commits: commitCount,
    sizeKb: repo.size || 0,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    ageMonths: monthsBetween(repo.created_at),
    daysSincePush: daysSince(repo.pushed_at),
    license: repo.license?.spdx_id || null,
    releaseCount,
    rootFiles: rootNames.slice(0, 40),
    ...rootInfo,
    hasCI,
    archived: !!repo.archived,
    partial: !rootRes?.ok || !langsRes?.ok,
    source: 'live',
  }
}

// ---------- Gitee ----------
const GITEE_BASE = 'https://gitee.com/api/v5'

// Gitee 令牌走 query 参数（官方 v5 支持 access_token，也支持 Authorization: token）
function giteeToken() {
  try { return localStorage.getItem('gitmon:gitee_token') || '' } catch { return '' }
}

function giteeUrl(path, params = {}) {
  const q = new URLSearchParams(params)
  const t = giteeToken()
  if (t) q.set('access_token', t)
  const qs = q.toString()
  return `${GITEE_BASE}${path}${qs ? `?${qs}` : ''}`
}

function giteeError(status) {
  if (status === 403 || status === 429) {
    return giteeToken()
      ? 'Gitee 接口配额用尽（令牌也算额度），稍后再试'
      : 'Gitee 匿名接口配额用尽（按 IP 算，很快打满），用 Gitee 令牌登录后额度高得多'
  }
  if (status === 404) return 'Gitee 仓库或账号不存在'
  return `Gitee API 错误 ${status}`
}

async function scanGitee(info, prefetched) {
  const base = `${GITEE_BASE}/repos/${info.owner}/${info.repo}`
  let repo = prefetched
  if (!repo) {
    const repoRes = await fetch(giteeUrl(`/repos/${info.owner}/${info.repo}`))
    if (!repoRes.ok) throw new Error(giteeError(repoRes.status))
    repo = await repoRes.json()
  }

  const [rootRes, contribRes] = await Promise.all([
    fetch(giteeUrl(`/repos/${info.owner}/${info.repo}/contents/`)).catch(() => null),
    fetch(giteeUrl(`/repos/${info.owner}/${info.repo}/contributors`, { per_page: 1 })).catch(() => null),
  ])

  const rootNames = rootRes && rootRes.ok ? (await rootRes.json()).map((f) => f.name) : []
  const rootInfo = inspectRoot(rootNames)
  const contribCount = contribRes && contribRes.ok
    ? Number((contribRes.headers.get('link') || '').match(/page=(\d+)>; rel="last"/)?.[1] || 1)
    : 1

  // Gitee 返回 language 字段（主语言），无完整语言占比
  const languages = repo.language ? [{ name: repo.language, bytes: 1, pct: 100 }] : []

  return {
    platform: 'gitee',
    owner: info.owner,
    repo: info.repo,
    fullName: info.fullName,
    url: `https://gitee.com/${info.fullName}`,
    description: repo.description || '',
    topics: (repo.topics || []).map((t) => (typeof t === 'string' ? t : t.name)),
    homepage: repo.homepage || '',
    languages,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    watchers: repo.watchers_count || 0,
    openIssues: repo.open_issues_count || 0,
    contributors: contribCount,
    commits: 1,
    sizeKb: Math.round((repo.size || 0) / 1024) || 0,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at || repo.updated_at,
    ageMonths: monthsBetween(repo.created_at),
    daysSincePush: daysSince(repo.pushed_at || repo.updated_at),
    license: repo.license || null,
    releaseCount: 0,
    rootFiles: rootNames.slice(0, 40),
    ...rootInfo,
    hasCI: rootNames.some((n) => ['.gitee', '.github', '.gitlab-ci.yml'].includes(n)),
    archived: false,
    partial: !rootRes?.ok,
    source: 'live',
  }
}

// ---------- 扫描入口：单个项目 → 一个卡包 ----------
export async function scanRepo(input, opts = {}) {
  const info = typeof input === 'string' ? parseRepoInput(input) : input
  if (!info) throw new Error('无法识别的地址，请输入 GitHub 或 Gitee 仓库链接')
  if (info.kind === 'owner') throw new Error('这是账号地址，请走「整箱孵化」')

  if (!opts.fresh) {
    const cached = readCache(cacheKey(info))
    if (cached) return { ...cached, cached: true }
  }

  const snap = info.platform === 'gitee'
    ? await scanGitee(info, opts.meta)
    : await scanGitHub(info, opts.meta)
  writeCache(cacheKey(info), snap)
  return { ...snap, cached: false }
}

// ============================================================
// 账号维度：一个账号拥有 N 个项目 → N 个卡包（文档 §2.3）
// 只有"单个项目"才是一个卡包；账号给的是"一整箱"，每包品质各自算
// ============================================================

function ghToken() {
  try { return localStorage.getItem('gitmon:gh_token') || '' } catch { return '' }
}

function normalizeRepo(r, platform, owner) {
  const name = r.name || r.path || ''
  const fullName = r.full_name || `${owner}/${name}`
  return {
    name,
    fullName,
    description: r.description || '',
    topics: Array.isArray(r.topics) ? r.topics.map((t) => (typeof t === 'string' ? t : t?.name)) : [],
    language: r.language || '',
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    openIssues: r.open_issues_count || 0,
    sizeKb: r.size || 0,
    createdAt: r.created_at,
    pushedAt: r.pushed_at || r.updated_at,
    archived: !!r.archived,
    fork: !!r.fork || !!r.parent,
    empty: (r.size || 0) === 0,
    license: platform === 'github' ? (r.license?.spdx_id || null) : (r.license || null),
    homepage: r.homepage || '',
    url: r.html_url || (platform === 'gitee' ? `https://gitee.com/${fullName}` : `https://github.com/${fullName}`),
    raw: r,
  }
}

async function listGitHubOwner(owner, { self = false } = {}) {
  const base = 'https://api.github.com'
  const userUrl = self ? `${base}/user` : `${base}/users/${owner}`
  const reposUrl = self
    ? `${base}/user/repos?per_page=100&sort=pushed&affiliation=owner`
    : `${base}/users/${owner}/repos?per_page=100&sort=pushed&type=owner`
  const [userRes, reposRes] = await Promise.all([
    fetch(userUrl, { headers: ghHeaders() }),
    fetch(reposUrl, { headers: ghHeaders() }),
  ])
  if (userRes.status === 401) throw new Error('GitHub 令牌失效了，重新登录一次')
  if (userRes.status === 404) throw new Error(`GitHub 账号 @${owner} 不存在`)
  if (userRes.status === 403) throw new Error('GitHub 配额用尽，稍后重试或重新登录')
  if (!userRes.ok) throw new Error(`GitHub API 错误 ${userRes.status}`)
  const user = await userRes.json()
  const repos = reposRes.ok ? await reposRes.json() : []
  return {
    platform: 'github',
    owner: user.login || owner,
    displayName: user.name || user.login || owner,
    avatar: user.avatar_url || '',
    bio: user.bio || '',
    isOrg: user.type === 'Organization',
    publicRepos: user.public_repos || repos.length,
    repos: repos.map((r) => normalizeRepo(r, 'github', user.login || owner)),
  }
}

async function listGiteeOwner(owner, { self = false } = {}) {
  const userUrl = self ? giteeUrl('/user') : giteeUrl(`/users/${owner}`)
  const reposUrl = self
    ? giteeUrl('/user/repos', { per_page: 100, sort: 'updated', affiliation: 'owner' })
    : giteeUrl(`/users/${owner}/repos`, { per_page: 100, sort: 'updated', type: 'owner' })
  const [userRes, reposRes] = await Promise.all([fetch(userUrl), fetch(reposUrl)])
  if (userRes.status === 401) throw new Error('Gitee 令牌失效了，重新登录一次')
  if (userRes.status === 404) throw new Error(`Gitee 账号 @${owner} 不存在`)
  if (!userRes.ok) throw new Error(giteeError(userRes.status))
  const user = await userRes.json()
  const repos = reposRes.ok ? await reposRes.json() : []
  return {
    platform: 'gitee',
    owner: user.login || owner,
    displayName: user.name || user.login || owner,
    avatar: user.avatar_url || '',
    bio: user.bio || '',
    isOrg: !!user.type,
    publicRepos: user.public_repos || repos.length,
    repos: repos.map((r) => normalizeRepo(r, 'gitee', user.login || owner)),
  }
}

// 项目清单：账号 → 该账号拥有的项目（缓存 6h，与仓库快照同策略）
// self=true 表示"读我自己"：走 /user/repos，能带出私有仓库
export async function loadOwner(input, { self = false } = {}) {
  const info = typeof input === 'string' ? parseRepoInput(input) : input
  if (!info || info.kind !== 'owner') throw new Error('请输入账号地址，例如 github.com/4243342')

  const key = `gitmon:owner:${info.platform}/${info.owner}${self ? ':self' : ''}`
  const cached = readCache(key)
  if (cached) return { ...cached, cached: true }

  const owner = info.platform === 'gitee'
    ? await listGiteeOwner(info.owner, { self })
    : await listGitHubOwner(info.owner, { self })
  writeCache(key, owner)
  return { ...owner, cached: false }
}

// 整箱孵化：项目清单 → 逐个项目判定 → 每项目一个卡包
export async function scanOwnerBox(input, { limit, onProgress, self = false } = {}) {
  const owner = await loadOwner(input, { self })
  const platform = owner.platform

  // 排除 fork / 空仓库：那不是"他拥有的项目"
  const candidates = owner.repos
    .filter((r) => !r.fork && !r.empty)
    .sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0))

  // 每项目约 5 个请求：匿名额度只开最近几个，登录后放开
  const hasToken = platform === 'gitee' ? !!giteeToken() : !!ghToken()
  const cap = limit || (hasToken ? 30 : platform === 'github' ? 6 : 5)
  const targets = candidates.slice(0, cap)

  const snaps = []
  const failed = []
  let rateLimited = false
  let done = 0

  const queue = [...targets]
  const worker = async () => {
    while (queue.length && !rateLimited) {
      const meta = queue.shift()
      try {
        const snap = await scanRepo(
          { kind: 'repo', platform, owner: owner.owner, repo: meta.name, fullName: meta.fullName },
          { meta: meta.raw },
        )
        snaps.push(snap)
      } catch (e) {
        const msg = String(e?.message || e)
        if (/限流|403/.test(msg)) rateLimited = true
        failed.push({ name: meta.name, reason: msg })
      } finally {
        done += 1
        onProgress?.({ done, total: targets.length, name: meta.name })
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])

  return {
    owner,
    snaps,
    listed: candidates.length,
    limit: cap,
    truncated: candidates.length > targets.length,
    skipped: owner.repos.length - candidates.length,
    failed,
    rateLimited,
    partial: snaps.filter((s) => s.partial).length,
  }
}
