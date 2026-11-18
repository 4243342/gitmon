// 剧情模式的「正在干活」面板。
// 选对手要连跑「模型定检索条件 → GitHub 检索 → 模型挑对手 → 抓三张仓库卡」，
// 慢的时候几十秒；只显示一行静态文字，用户根本分不清是在跑还是卡死了。
// 这里给的是真实阶段（后端流式回报）+ 已等秒数 + 20s/45s 的超时自述，
// 绝不画假百分比：进度不明就抖动流光，绝不假装 87%。
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'

export default function StoryProgress({ info }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  if (!info) return null
  const meta = typeof info === 'string' ? { title: info } : info
  const startedAt = Number(meta.startedAt) || 0
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0
  const stages = meta.stages || []
  const activeIndex = stages.findIndex((s) => s.key === meta.active)
  const clock = startedAt > 0 ? `${elapsed.toFixed(1)}s` : ''

  // 行内版：不占版面，用在游玩过程中（写台词 / 读档 / 战斗收尾），
  // 只给一个转动的点 + 已等秒数，至少不会让人以为界面停住了。
  if (meta.variant === 'inline') {
    return (
      <p className="story-busy story-busy-inline" role="status" aria-live="polite">
        <span className="story-progress-dot" aria-hidden="true" />
        {meta.title}
        {clock ? <em>{clock}</em> : null}
      </p>
    )
  }

  let slow = ''
  if (elapsed >= 45) {
    slow = t(
      '已经等了 45 秒以上：GitHub 检索或模型响应偏慢，仍然在跑。可以再等一会，或点「换一批」重试。',
      'Waiting over 45s — GitHub or the model is slow but still running. Wait a bit longer, or hit Reroll.',
    )
  } else if (elapsed >= 20) {
    slow = t(
      '比平时慢一些：模型推理和 GitHub 检索合计通常 10–25 秒，现在这一步还在等外部响应。',
      'Slower than usual — the two model calls plus GitHub search usually take 10–25s; still waiting on an external response.',
    )
  } else if (elapsed >= 6 && stages.length === 0) {
    slow = t('模型正在推理，通常 10–25 秒', 'Model is thinking — usually 10–25s')
  }

  return (
    <div className="story-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="story-progress-head">
        <span className="story-progress-dot" aria-hidden="true" />
        <b>{meta.title}</b>
        {clock ? <em>{clock}</em> : null}
      </div>

      <div className="story-progress-bar" aria-hidden="true">
        <i />
      </div>

      {stages.length > 0 && (
        <ol className="story-progress-steps">
          {stages.map((step, i) => {
            const state = activeIndex < 0 ? 'idle' : i < activeIndex ? 'done' : i === activeIndex ? 'now' : 'idle'
            return (
              <li key={step.key} className={state}>
                <span className="mark" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
                <span className="label">{step.label}</span>
                {state === 'now' && meta.detail ? <span className="detail">{meta.detail}</span> : null}
              </li>
            )
          })}
        </ol>
      )}

      {meta.note ? <p className="story-progress-note">{meta.note}</p> : null}
      {slow ? <p className={`story-progress-note${elapsed >= 45 ? ' warn' : ''}`}>{slow}</p> : null}
    </div>
  )
}
