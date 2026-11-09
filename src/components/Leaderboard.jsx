import { useEffect, useState } from 'react'
import { sfx } from '../sfx.js'
import { ownerHeader } from '../sync.js'

const SINCE_OPTIONS = [
  { key: 'daily', label: '今日' },
  { key: 'weekly', label: '本周' },
  { key: 'monthly', label: '本月' },
]
const LANGUAGES = [
  '', 'Python', 'JavaScript', 'TypeScript', 'Rust', 'Go', 'Java', 'C++', 'C#', 'Ruby',
  'Swift', 'Kotlin', 'PHP', 'C', 'Shell', 'HTML', 'CSS', 'Vue', 'Svelte', 'Dart',
  'Jupyter Notebook', 'Solidity', 'Zig', 'Lua', 'R', 'Scala', 'Elixir', 'OCaml',
  'Haskell', 'Clojure', 'Julia', 'Crystal', 'F#', 'Nim', 'Assembly', 'Objective-C',
  'PowerShell', 'Dockerfile', 'Makefile', 'Roff', 'GLSL', 'Protocol Buffer',
]
// 后端已返回 language_color；这里仅给少数没拿到色的语言兜底
const LANG_FALLBACK = {
  Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', Rust: '#dea584',
  Go: '#00ADD8', Java: '#b07219', 'C++': '#f34b7d', 'C#': '#178600', Ruby: '#701516',
  Swift: '#F05138', Kotlin: '#A97BFF', PHP: '#4F5D95', 'C': '#555555', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00', Dart: '#00B4AB',
  'Jupyter Notebook': '#DA5B0B', Solidity: '#AA6746', Zig: '#ec915c', Lua: '#000080',
  R: '#198CE7', Scala: '#c22d40', Elixir: '#6e4a7e', Julia: '#a270ba',
}

function fmt(n) {
  if (n >= 1000) {
    const k = n / 1000
    return (k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')) + 'k'
  }
  return String(n)
}

export default function Leaderboard({ onChallenge, onPreview, canChallenge = false }) {
  const [since, setSince] = useState('weekly')
  const [language, setLanguage] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(false)
  const [source, setSource] = useState('trending')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    const q = new URLSearchParams({ since, language })
    fetch(`/api/trending?${q.toString()}`, { headers: ownerHeader() })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (d.error) {
          setError(d.error)
          setItems([])
        } else {
          setItems(d.items || [])
          setCached(!!d.cached)
          setSource(d.source || 'trending')
        }
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setError('排行榜加载失败：后端未启动，或 GitHub 限流，稍后重试')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [since, language])

  return (
    <main className="leaderboard">
      <div className="lb-head">
        <h2>GitHub 排行榜</h2>
        <p className="lb-sub">GitHub 趋势榜实时拉取 · 谁正在被 Star，一眼看清</p>
      </div>

      <div className="lb-controls">
        <div className="lb-seg">
          {SINCE_OPTIONS.map((o) => (
            <button
              key={o.key}
              className={since === o.key ? 'active' : ''}
              onClick={() => {
                if (since !== o.key) {
                  sfx.blip()
                  setSince(o.key)
                }
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select className="lb-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l || '*'} value={l}>
              {l || '全部语言'}
            </option>
          ))}
        </select>
      </div>

      {cached && <p className="lb-cached">趋势榜缓存 30 分钟，数据来自 GitHub</p>}
      {source === 'search' && (
        <p className="lb-cached">GitHub 网页版当前不可达，榜单改用 GitHub 搜索接口（近期新建的高星仓库）近似排序</p>
      )}
      {error && <p className="error">! {error}</p>}
      {loading && <div className="lb-loading">正在拉取 GitHub 趋势榜…</div>}

      {!loading && !error && (
        <ol className="lb-list">
          {items.map((it) => (
            <li className="lb-row" key={it.full_name}>
              <div className={`lb-rank rank-${it.rank <= 3 ? it.rank : 'n'}`}>{it.rank}</div>
              <img
                className="lb-avatar"
                src={it.avatar}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden'
                }}
              />
              <div className="lb-main">
                <a className="lb-repo" href={it.url} target="_blank" rel="noreferrer">
                  {it.author} / <b>{it.name}</b>
                </a>
                {it.description && <p className="lb-desc">{it.description}</p>}
                <div className="lb-meta">
                  {it.language && (
                    <span className="lb-lang">
                      <span
                        className="lb-dot"
                        style={{ background: it.language_color || LANG_FALLBACK[it.language] || '#8b95ad' }}
                      />
                      {it.language}
                    </span>
                  )}
                  <span className="lb-stat" title="总 Star">★ {fmt(it.stars)}</span>
                  {it.period_label && (
                    <span className="lb-stat lb-hot" title={it.period_label}>🔥 {fmt(it.period_stars)}</span>
                  )}
                  <span className="lb-stat" title="Fork">⑂ {fmt(it.forks)}</span>
                </div>
              </div>
              <div className="lb-acts">
                <button
                  className="lb-view"
                  title="先看看对方的项目卡面"
                  onClick={() => {
                    sfx.blip()
                    onPreview?.(it.full_name)
                  }}
                >
                  观摩
                </button>
                <button
                  className="lb-hatch"
                  title={canChallenge ? '进竞技场挑战这只仓库的精灵' : '还没有出战精灵，先抽这只仓库'}
                  onClick={() => {
                    sfx.blip()
                    onChallenge(it.full_name)
                  }}
                >
                  {canChallenge ? '挑战' : '抽卡'}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="lb-empty">这个榜单暂时没有数据，换一个周期或语言试试。</p>
      )}
    </main>
  )
}
