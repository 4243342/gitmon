import { useState } from 'react'
import { loginLocal, startLogin } from '../auth.js'

// 首页登录授权页：GitHub / Gitee 二选一 + 游客
// 为什么要登录：匿名 60 次/小时 ≈ 扫 4 个仓库；登录之后自动把你名下所有项目开成一整箱。
// 只提供平台授权（OAuth）与本机登录两条路，不再收手填令牌。

const META = {
  github: {
    name: 'GitHub',
    title: '连上你的 GitHub',
    env: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET',
  },
  gitee: {
    name: 'Gitee',
    title: '连上你的 Gitee',
    env: 'GITEE_CLIENT_ID / GITEE_CLIENT_SECRET',
  },
}

function ProviderMark({ provider }) {
  if (provider === 'gitee') {
    return <span className="gt-mark" aria-hidden="true">G</span>
  }
  return (
    <span className="gh-mark" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
    </span>
  )
}

export default function AuthPage({ online, providers, onAuthed, onGuest, notice }) {
  const [provider, setProvider] = useState('github')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(notice || '')

  const meta = META[provider]
  const cfg = providers?.[provider] || {}
  const oauthReady = !!cfg.oauth
  const local = providers?.local || {}
  const quota = providers?.anonymous || { quotaPerHour: 60, authenticatedPerHour: 5000 }

  const switchProvider = (next) => {
    if (next === provider) return
    setProvider(next)
    setError('')
  }

  const startOAuth = () => {
    setError('')
    if (!oauthReady) {
      setError(`后端还没配置 ${meta.name} 的 OAuth 应用（${meta.env}）`)
      return
    }
    setBusy('oauth')
    // 整页跳转：回来后 URL 带 ?auth=ok，App 会重新拉一次会话
    startLogin(provider, '/')
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

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-head">
          <span className="auth-tag">登录授权</span>
          <span className="auth-head-note">任选一种方式进入</span>
        </div>

        <h2>{meta.title}</h2>
        <p className="auth-lead">
          登录后不用再填仓库地址 —— 你名下<b>每个项目自动生成一个卡包</b>，装成一整箱。
          匿名接口只有 <b>{quota.quotaPerHour} 次/小时</b>，登录后额度高得多，私有仓库也能孵。
        </p>

        <div className="auth-tabs" role="tablist" aria-label="登录平台">
          {['github', 'gitee'].map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={provider === key}
              className={`auth-tab${provider === key ? ' is-on' : ''}`}
              onClick={() => switchProvider(key)}
            >
              <ProviderMark provider={key} />
              {META[key].name}
            </button>
          ))}
        </div>

        {online === false && (
          <p className="auth-warn">
            后端没启动：登录不可用，但扫描仍然可以在浏览器里直接完成，先用游客进入即可。
          </p>
        )}

        {provider === 'github' && local.available && (
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
          className={`auth-github${provider === 'gitee' ? ' is-gitee' : ''}${(provider === 'github' && local.available) ? ' is-secondary' : ''}`}
          onClick={startOAuth}
          disabled={busy === 'oauth' || !oauthReady}
        >
          <ProviderMark provider={provider} />
          {busy === 'oauth' ? `正在跳转 ${meta.name}…` : `用 ${meta.name} 授权登录`}
        </button>
        {!oauthReady && (
          <p className="auth-hint">
            后端还没配 {meta.name} 的 OAuth 应用（{meta.env}）。
            配好以后这个按钮直接可用；现在可以先
            {provider === 'github' && local.available ? '用本机登录，或' : ''}
            游客进入。
          </p>
        )}

        {error && <p className="auth-error">! {error}</p>}

        <div className="auth-foot">
          <button className="auth-guest" onClick={onGuest}>游客进入（手填仓库，{quota.quotaPerHour} 次/小时）</button>
          <span className="auth-security" title="授权走平台官方 OAuth，只读仓库信息">
            只读授权，随时可退出
          </span>
        </div>
      </section>

      <section className="auth-points">
        <div>
          <b>自动整箱</b>
          <span>登录后直接读你自己的项目清单，点开就是一箱卡包</span>
        </div>
        <div>
          <b>私有仓库</b>
          <span>授权后连私有项目也能孵出来</span>
        </div>
        <div>
          <b>只读</b>
          <span>只读仓库信息，不写代码、不改设置</span>
        </div>
      </section>
    </main>
  )
}
