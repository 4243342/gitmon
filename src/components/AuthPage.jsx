import { useState } from 'react'
import { loginLocal, loginWithToken } from '../auth.js'

// 首页登录授权页：GitHub OAuth 为主，个人访问令牌为备
// 为什么要登录：匿名 60 次/小时 ≈ 扫 4 个仓库；授权后 5000 次/小时。
export default function AuthPage({ online, providers, onAuthed, onGuest, notice }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(notice || '')
  const [showHelp, setShowHelp] = useState(false)

  const oauthReady = !!providers?.github?.oauth
  const local = providers?.local || {}
  const quota = providers?.anonymous || { quotaPerHour: 60, authenticatedPerHour: 5000 }

  const startOAuth = () => {
    setError('')
    if (!oauthReady) {
      setError('后端还没配置 GitHub OAuth 应用，先用下面的个人访问令牌登录（同样是 5000 次/小时）')
      document.getElementById('gh-token')?.focus()
      return
    }
    setBusy('oauth')
    // 整页跳转：回来后 URL 带 ?auth=ok，App 会重新拉一次会话
    window.location.href = `/api/auth/github/start?next=${encodeURIComponent('/')}`
  }

  const enterLocal = async () => {
    setError('')
    setBusy('local')
    try {
      const result = await loginLocal()
      onAuthed?.(result)
    } catch (e) {
      setError(e?.message || '本机登录失败')
      setBusy('')
    }
  }

  const submitToken = async () => {
    setError('')
    if (!token.trim()) {
      setError('先粘贴令牌再登录')
      return
    }
    setBusy('token')
    try {
      const result = await loginWithToken(token)
      onAuthed?.(result)
    } catch (e) {
      setError(e?.message || '登录失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-head">
          <span className="auth-tag">登录授权</span>
        </div>

        <h2>先连上你的 GitHub</h2>
        <p className="auth-lead">
          GitHub 匿名接口只有 <b>{quota.quotaPerHour} 次/小时</b>，扫三四个仓库就没了；
          登录后是 <b>{quota.authenticatedPerHour} 次/小时</b>，整个账号一整箱也能一次开完。
        </p>

        {online === false && (
          <p className="auth-warn">
            后端没启动：令牌只会存在这台浏览器里，扫描仍然可用（浏览器直连 GitHub），换设备需要重新登录。
          </p>
        )}

        {local.available && (
          <button className="auth-local" onClick={enterLocal} disabled={busy === 'local'}>
            {local.avatar
              ? <img src={local.avatar} alt="" />
              : <span className="auth-local-dot" />}
            <span className="auth-local-text">
              <b>{busy === 'local' ? '正在进入…' : `用本机已登录的 @${local.login} 直接进入`}</b>
              <em>复用这台机器上 gh 的登录态，不用注册 OAuth App</em>
            </span>
            <span className="auth-local-go">→</span>
          </button>
        )}

        <button
          className={local.available ? 'auth-github is-secondary' : 'auth-github'}
          onClick={startOAuth}
          disabled={busy === 'oauth'}
        >
          <span className="gh-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </span>
          {busy === 'oauth' ? '正在跳转 GitHub…' : '用 GitHub 授权登录'}
        </button>
        {!oauthReady && (
          <p className="auth-hint">
            后端还没配 OAuth 应用（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET）。
            {online === false ? '现在可以用下面的令牌登录。' : '配好以后这个按钮就能直接用；现在请用下面的令牌。'}
          </p>
        )}

        <div className="auth-or"><span>或</span></div>

        <label className="auth-label" htmlFor="gh-token">个人访问令牌（PAT）</label>
        <div className="auth-token-row">
          <input
            id="gh-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitToken()}
            placeholder="ghp_xxxxxxxxxxxxxxxx"
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={submitToken} disabled={busy === 'token'}>
            {busy === 'token' ? '校验中…' : '登录'}
          </button>
        </div>

        <button className="auth-help-toggle" onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? '收起' : '怎么拿到令牌？三步'}
        </button>
        {showHelp && (
          <ol className="auth-help">
            <li>
              打开 <a href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitMon" target="_blank" rel="noreferrer">GitHub → New personal access token</a>
            </li>
            <li>勾选 <code>read:user</code>；要孵化私有仓库再加 <code>repo</code></li>
            <li>生成后复制 <code>ghp_</code> 开头那串，粘到上面</li>
          </ol>
        )}

        {error && <p className="auth-error">! {error}</p>}

        <div className="auth-foot">
          <button className="auth-guest" onClick={onGuest}>先随便逛逛（{quota.quotaPerHour} 次/小时）</button>
          <span className="auth-security" title="令牌用 HMAC 流加密后存进本地 SQLite，浏览器只留会话 cookie">
            令牌加密存在本地，随时可退出
          </span>
        </div>
      </section>

      <section className="auth-points">
        <div>
          <b>额度</b>
          <span>60 → 5000 次/小时，整箱孵化不用排队</span>
        </div>
        <div>
          <b>私有仓库</b>
          <span>授权后连私有项目也能孵出来（勾了 repo 权限就行）</span>
        </div>
        <div>
          <b>只读</b>
          <span>只读仓库信息，不写代码、不改设置</span>
        </div>
      </section>
    </main>
  )
}
