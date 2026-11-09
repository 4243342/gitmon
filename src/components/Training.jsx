import { useState } from 'react'
import { TRAINING_TOOLS, hostOf } from '../training-tools.js'
import { sfx } from '../sfx.js'

const VISITED_KEY = 'gitmon:training:visited'

function readVisited() {
  try {
    const v = JSON.parse(localStorage.getItem(VISITED_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// 训练场：六种 AI 编程搭子，点卡片在新标签页打开对应软件，并记一次打卡
export default function Training() {
  const [visited, setVisited] = useState(readVisited)

  const markVisited = (id) => {
    sfx.swoosh?.()
    setVisited((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      try { localStorage.setItem(VISITED_KEY, JSON.stringify(next)) } catch { /* 隐私模式忽略 */ }
      return next
    })
  }

  return (
    <main className="training-stage">
      <header className="training-head">
        <div className="training-title">
          <span className="training-eyebrow">TRAINING GROUND · 06 COACHES</span>
          <h2>训练场</h2>
          <p>
            换个教练练练手：六款 AI 编程工具，点一下直达对应软件。
            不消耗体力、不占用竞技场战绩，去过的会留下打卡记录。
          </p>
        </div>
        <div className="training-counter">
          <b>{visited.length}</b><span> / {TRAINING_TOOLS.length}</span>
          <small>已打卡</small>
        </div>
      </header>

      <div className="training-grid">
        {TRAINING_TOOLS.map((tool, i) => {
          const done = visited.includes(tool.id)
          return (
            <article
              key={tool.id}
              className={`tool-card${done ? ' is-done' : ''}`}
              style={{ '--tool-color': tool.color }}
            >
              <a
                className="tool-main"
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => markVisited(tool.id)}
              >
                <div className="tool-top">
                  <span className="tool-badge">{tool.mark}</span>
                  <span className="tool-no">NO.{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3>{tool.name}</h3>
                <div className="tool-meta">{tool.vendor} · {tool.kind}</div>
                <p className="tool-desc">{tool.desc}</p>
                <span className="tool-cta">打开 {hostOf(tool.url)} →</span>
              </a>
              <footer className="tool-foot">
                {done
                  ? <span className="tool-done">✓ 已打卡</span>
                  : <span className="tool-pending">未打卡</span>}
                {tool.alt
                  ? <a href={tool.alt.url} target="_blank" rel="noopener noreferrer">{tool.alt.label}</a>
                  : <span className="tool-host">{hostOf(tool.url)}</span>}
              </footer>
            </article>
          )
        })}
      </div>

      <p className="training-note">
        ※ 链接在新标签页打开，均指向官方站点（Trae 默认国内版）。打卡记录只存在本机浏览器，不上传。
      </p>
    </main>
  )
}
