// 一键核对 OAuth 回调配置：平台后台该填的地址，是否等于授权跳转实际带过去的 redirect_uri。
// 用法：node .dev/check-oauth.mjs [后端地址，默认 http://127.0.0.1:8000]
// 背景：GitHub / Gitee 都对 redirect_uri 做「整串精确匹配」，仓库地址或 localhost/127.0.0.1
//      写错一个字符就会报 redirect_uri_mismatch，而开发时很容易看不出来。
const BASE = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/$/, '')
const url = new URL(BASE)
const hosts = [url.host]
if (url.hostname === '127.0.0.1') hosts.push(`localhost:${url.port}`)

const providers = await fetch(`${BASE}/api/auth/providers`).then((r) => r.json())
const platforms = [
  ['github', '/api/auth/github/start'],
  ['gitee', '/api/auth/gitee/start'],
]

let failed = false
console.log('把下面「回调地址」原样填进平台应用后台（不是应用主页、不是仓库地址）：\n')

for (const [name, startPath] of platforms) {
  const cfg = providers[name] || {}
  const expected = cfg.callback || ''
  console.log(`${name.padEnd(6)} oauth=${!!cfg.oauth}  回调地址: ${expected || '(未配置)'}`)
  if (!cfg.oauth) {
    console.log('        ↳ 该平台未配 OAuth，跳过授权跳转检查\n')
    continue
  }
  for (const host of hosts) {
    const res = await fetch(`${BASE}${startPath}?next=%2F`, {
      redirect: 'manual',
      headers: { Host: host },
    })
    const location = res.headers.get('location') || ''
    let actual = ''
    try { actual = new URL(location).searchParams.get('redirect_uri') || '' } catch { /* 非跳转 */ }
    const ok = res.status === 302 && actual === expected
    if (!ok) failed = true
    console.log(`        ${host.padEnd(18)} ${ok ? '✓ 一致' : `✗ 不一致（status=${res.status} redirect_uri=${actual || '无'}）`}`)
  }
  console.log('')
}

if (failed) {
  console.error('有不一致：检查 backend/.env 的 GITHUB_CALLBACK_URL / GITEE_CALLBACK_URL，改完重启后端。')
  process.exit(1)
}
console.log('全部一致 ✓  用 http://127.0.0.1:8000 或 localhost:8000 打开都不会漂移。')
console.log('Gitee 后台还要勾 user_info + projects；回调地址千万别填 https://github.com/... 仓库页。')
