import { useState } from 'react'
import { TRAINING_TOOLS, hostOf } from '../training-tools.js'
import { sfx } from '../sfx.js'
import { useI18n } from '../i18n.js'

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
  const { t } = useI18n()
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
          <h2>{t('训练场', 'Training Ground')}</h2>
          <p>
            {t('换个教练练练手：六款 AI 编程工具，点一下直达对应软件。 不消耗体力、不占用竞技场战绩，去过的会留下打卡记录。', 'Try a different coach: six AI coding tools, one tap jumps straight into the app. Costs no stamina, never touches your arena record — visited ones keep a check-in badge.')}
          </p>
        </div>
        <div className="training-counter">
          <b>{visited.length}</b><span> / {TRAINING_TOOLS.length}</span>
          <small>{t('已打卡', 'Checked in')}</small>
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
                <span className="tool-cta">{t('打开', 'Open')} {hostOf(tool.url)} →</span>
              </a>
              <footer className="tool-foot">
                {done
                  ? <span className="tool-done">{t('✓ 已打卡', '✓ Checked in')}</span>
                  : <span className="tool-pending">{t('未打卡', 'Not checked in')}</span>}
                {tool.alt
                  ? <a href={tool.alt.url} target="_blank" rel="noopener noreferrer">{tool.alt.label}</a>
                  : <span className="tool-host">{hostOf(tool.url)}</span>}
              </footer>
            </article>
          )
        })}
      </div>

      <p className="training-note">
        {t('※ 链接在新标签页打开，均指向官方站点（Trae 默认国内版）。打卡记录只存在本机浏览器，不上传。', '※ Links open in a new tab and point to official sites (Trae defaults to the China build). Check-ins stay in this browser and are never uploaded.')}
      </p>
    </main>
  )
}
