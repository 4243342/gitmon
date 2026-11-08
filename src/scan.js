// RepoScanner —— 统一抽象（文档 §2.1）
// GitHub / Gitee 各自实现，产出标准 RepoSnapshot

const CACHE_TTL = 6 * 60 * 60 * 1000 // 6h（文档 §8.6）

export function parseRepoUrl(input) {
  const m = String(input).trim().match(/(github\.com|gitee\.com)[\/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$|\s)/)
  if (!m) return null
  return {
    platform: m[1].startsWith('gitee') ? 'gitee' : 'github',
    owner: m[2],
    repo: m[3],
    fullName: `${m[2]}/${m[3]}`,
  }
}

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

// ---------- GitHub ----------
function ghHeaders() {
  const token = (() => {
    try { return localStorage.getItem('gitmon:gh_token') || '' } catch { return '' }
  })()
  return token ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` } : { Accept: 'application/vnd.github+json' }
}

async function scanGitHub(info) {
  const base = 'https://api.github.com'
  const repoRes = await fetch(`${base}/repos/${info.owner}/${info.repo}`, {
    headers: ghHeaders(),
  })
  if (repoRes.status === 404) throw new Error('仓库不存在或无权限访问')
  if (repoRes.status === 403) throw new Error('GitHub API 触发限流，请稍后再试')
  if (!repoRes.ok) throw new Error(`GitHub API 错误 ${repoRes.status}`)
  const repo = await repoRes.json()

  const H = { headers: ghHeaders() }
  const [langsRes, rootRes, relRes, contribRes, commitRes] = await Promise.all([
    fetch(`${base}/repos/${info.owner}/${info.repo}/languages`, H).catch(() => null),
    fetch(`${base}/repos/${info.owner}/${info.repo}/contents/`, H).catch(() => null),
    fetch(`${base}/repos/${info.owner}/${info.repo}/releases?per_page=1`, H).catch(() => null),
    fetch(`${base}/repos/${info.owner}/${info.repo}/contributors?per_page=1&anon=1`, H).catch(() => null),
    fetch(`${base}/repos/${info.owner}/${info.repo}/commits?per_page=1`, H).catch(() => null),
  ])

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

  const releaseCount = relRes && relRes.ok ? (await relRes.json()).length : 0
  const contribCount = contribRes && contribRes.ok
    ? Number((contribRes.headers.get('link') || '').match(/page=(\d+)>; rel="last"/)?.[1] || 1)
    : 1
  const commitCount = commitRes && commitRes.ok
    ? Number((commitRes.headers.get('link') || '').match(/page=(\d+)>; rel="last"/)?.[1] || 1)
    : 1

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
    source: 'live',
  }
}

// ---------- Gitee ----------
async function scanGitee(info) {
  const base = 'https://gitee.com/api/v5'
  const repoRes = await fetch(`${base}/repos/${info.owner}/${info.repo}`)
  if (!repoRes.ok) throw new Error(`Gitee API 错误 ${repoRes.status}（匿名配额较低，可稍后重试）`)
  const repo = await repoRes.json()

  const [rootRes, contribRes] = await Promise.all([
    fetch(`${base}/repos/${info.owner}/${info.repo}/contents/`).catch(() => null),
    fetch(`${base}/repos/${info.owner}/${info.repo}/contributors?per_page=1`).catch(() => null),
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
    source: 'live',
  }
}

// ---------- 扫描入口 ----------
export async function scanRepo(input) {
  const info = parseRepoUrl(input)
  if (!info) throw new Error('无法识别的地址，请输入 GitHub 或 Gitee 仓库链接')

  const key = cacheKey(info)
  const cached = readCache(key)
  if (cached) return { ...cached, cached: true }

  const snap = info.platform === 'gitee' ? await scanGitee(info) : await scanGitHub(info)
  writeCache(key, snap)
  return { ...snap, cached: false }
}
