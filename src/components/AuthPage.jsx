import { useState } from 'react'
import { loginLocal, loginWithToken, startLogin } from '../auth.js'
import { useI18n } from '../i18n.js'

// 首页登录授权页：GitHub / Gitee 二选一 + 游客
// 为什么要登录：匿名 60 次/小时 ≈ 扫 4 个仓库；登录之后自动把你名下所有项目开成一整箱。
// 优先走平台授权（OAuth）+ 本机登录；只有平台没配 OAuth 应用时才露出"令牌登录"，
// 这样 Gitee 不用先注册应用也能登进来（否则那个页签就只剩禁用按钮）。

const buildMeta = (t) => ({
  github: {
    name: 'GitHub',
    title: t('连上你的 GitHub', 'Connect your GitHub'),
    tokenLabel: t('个人访问令牌（PAT）', 'Personal access token (PAT)'),
    placeholder: 'ghp_xxxxxxxxxxxxxxxx',
    steps: [
      <>{t('打开 ', 'Open ')}<a href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitMon" target="_blank" rel="noreferrer">GitHub → New personal access token</a></>,
      <>{t('勾选 ', 'Check ')}<code>read:user</code>{t('；要抽私有仓库的卡，还需勾选 ', '; to draw private repos, also check ')}<code>repo</code></>,
      <>{t('生成后复制 ', 'Once generated, copy the string starting with ')}<code>ghp_</code>{t(' 开头那串，粘到上面', ' and paste it above')}</>,
    ],
  },
  gitee: {
    name: 'Gitee',
    title: t('连上你的 Gitee', 'Connect your Gitee'),
    tokenLabel: t('私人令牌（Private Token）', 'Private Token'),
    placeholder: t('32 位十六进制字符串', '32-character hex string'),
    steps: [
      <>{t('打开 ', 'Open ')}<a href="https://gitee.com/profile/personal_access_tokens" target="_blank" rel="noreferrer">{t('Gitee → 设置 → 私人令牌', 'Gitee → Settings → Private Tokens')}</a></>,
      <>{t('点「生成新令牌」，勾选 ', 'Click “New token”, then check ')}<code>user_info</code>{t('、', ', ')}<code>projects</code></>,
      <>{t('复制生成的令牌（只显示一次），粘到上面', 'Copy the token (shown only once) and paste it above')}</>,
    ],
  },
})

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
  const { t } = useI18n()
  const [provider, setProvider] = useState('github')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(notice || '')
  const [showHelp, setShowHelp] = useState(false)

  const metaMap = buildMeta(t)
  const meta = metaMap[provider]
  const cfg = providers?.[provider] || {}
  const oauthReady = !!cfg.oauth
  const local = providers?.local || {}
  const quota = providers?.anonymous || { quotaPerHour: 60, authenticatedPerHour: 5000 }

  const switchProvider = (next) => {
    if (next === provider) return
    setProvider(next)
    setToken('')
    setError('')
    setShowHelp(false)
  }

  const startOAuth = () => {
    setError('')
    if (!oauthReady) {
      setError(t(`后端还没开通 ${meta.name} 授权登录，先用下面的${meta.tokenLabel}登录`, `Backend hasn’t enabled ${meta.name} sign-in yet — use the ${meta.tokenLabel} below`))
      document.getElementById('provider-token')?.focus()
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
      setError(e?.message || t('本机登录失败', 'Local sign-in failed'))
      setBusy('')
    }
  }

  const submitToken = async () => {
    setError('')
    if (!token.trim()) {
      setError(t('先粘贴令牌再登录', 'Paste your token first'))
      return
    }
    setBusy('token')
    try {
      const result = await loginWithToken(token, provider)
      onAuthed?.(result)
    } catch (e) {
      setError(e?.message || t('登录失败', 'Sign-in failed'))
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-head">
          <span className="auth-tag">{t('登录授权', 'Sign In')}</span>
          <span className="auth-head-note">{t('任选一种方式进入', 'Pick any method')}</span>
        </div>

        <h2>{meta.title}</h2>
        <p className="auth-lead">
          {t('登录后不用再填仓库地址 —— 你名下', 'No repo URLs to fill in after signing in — ')}<b>{t('每个项目自动抽成一包', 'every project of yours becomes a pack')}</b>{t('，装成一整箱。', ', filling a whole box.')}{' '}
          {t('匿名接口只有 ', 'Anonymous API allows only ')}<b>{quota.quotaPerHour}{t(' 次/小时', ' per hour')}</b>{t('，登录后额度高得多，私有仓库也能抽。', ' — far more once signed in, private repos included.')}
        </p>

        <div className="auth-tabs" role="tablist" aria-label={t('登录平台', 'Sign-in platform')}>
          {['github', 'gitee'].map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={provider === key}
              className={`auth-tab${provider === key ? ' is-on' : ''}`}
              onClick={() => switchProvider(key)}
            >
              <ProviderMark provider={key} />
              {metaMap[key].name}
            </button>
          ))}
        </div>

        {online === false && (
          <p className="auth-warn">
            {t('后端没启动：登录不可用，但扫描仍然可以在浏览器里直接完成，先用游客进入即可。', 'Backend is offline: sign-in unavailable, but scanning still runs right in the browser — enter as a guest for now.')}
          </p>
        )}

        {provider === 'github' && local.available && (
          <button className="auth-local" onClick={enterLocal} disabled={busy === 'local'}>
            {local.avatar
              ? <img src={local.avatar} alt="" />
              : <span className="auth-local-dot" />}
            <span className="auth-local-text">
              <b>{busy === 'local' ? t('正在进入…', 'Entering…') : t(`用本机已登录的 @${local.login} 直接进入`, `Continue as signed-in @${local.login}`)}</b>
              <em>{t('复用这台机器上 gh 的登录态，不用注册 OAuth App', 'Reuses this machine’s gh login — no OAuth App needed')}</em>
            </span>
            <span className="auth-local-go">→</span>
          </button>
        )}

        {oauthReady && (
          <button
            className={`auth-github${provider === 'gitee' ? ' is-gitee' : ''}${(provider === 'github' && local.available) ? ' is-secondary' : ''}`}
            onClick={startOAuth}
            disabled={busy === 'oauth'}
          >
            <ProviderMark provider={provider} />
            {busy === 'oauth' ? t(`正在跳转 ${meta.name}…`, `Redirecting to ${meta.name}…`) : t(`用 ${meta.name} 授权登录`, `Sign in with ${meta.name}`)}
          </button>
        )}

        {/* 平台没配 OAuth 应用时的兜底：令牌直接登录（Gitee 现在走这里） */}
        {!oauthReady && (
          <>
            <p className="auth-hint">
              {t(`后端还没开通 ${meta.name} 授权登录， 先用${meta.tokenLabel}登录 —— 额度和授权一样，不用等应用审核。`, `${meta.name} OAuth isn’t enabled on the backend yet — sign in with the ${meta.tokenLabel} instead; same quota, no app review wait.`)}
            </p>
            <div className="auth-or"><span>{t('或', 'or')}</span></div>

            <label className="auth-label" htmlFor="provider-token">{meta.tokenLabel}</label>
            <div className="auth-token-row">
              <input
                id="provider-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitToken()}
                placeholder={meta.placeholder}
                spellCheck={false}
                autoComplete="off"
              />
              <button onClick={submitToken} disabled={busy === 'token'}>
                {busy === 'token' ? t('校验中…', 'Checking…') : t('登录', 'Sign in')}
              </button>
            </div>

            <button className="auth-help-toggle" onClick={() => setShowHelp((v) => !v)}>
              {showHelp ? t('收起', 'Hide') : t(`怎么拿到${meta.tokenLabel}？三步`, `How to get your ${meta.tokenLabel} — 3 steps`)}
            </button>
            {showHelp && (
              <ol className="auth-help">
                {meta.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            )}
          </>
        )}

        {error && <p className="auth-error">! {error}</p>}

        <div className="auth-foot">
          <button className="auth-guest" onClick={onGuest}>{t('游客进入（手填仓库，', 'Enter as guest (fill repos manually, ')}{quota.quotaPerHour}{t(' 次/小时）', ' per hour)')}</button>
          <span className="auth-security" title={t('授权走平台官方 OAuth，只读仓库信息；令牌加密存在本地', 'OAuth via the official platform, read-only; token stored encrypted locally')}>
            {t('只读授权，随时可退出', 'Read-only access, quit anytime')}
          </span>
        </div>
      </section>

      <section className="auth-points">
        <div>
          <b>{t('自动整箱', 'Auto full box')}</b>
          <span>{t('登录后直接读你自己的项目清单，点开就是一箱卡包', 'Sign in and it reads your own project list — one tap opens a full box of packs')}</span>
        </div>
        <div>
          <b>{t('私有仓库', 'Private repos')}</b>
          <span>{t('授权后连私有项目也能抽出来', 'Draw private projects too once authorized')}</span>
        </div>
        <div>
          <b>{t('只读', 'Read-only')}</b>
          <span>{t('只读仓库信息，不写代码、不改设置', 'Reads repo info only — no code writes, no settings changes')}</span>
        </div>
      </section>
    </main>
  )
}
