import { useRef, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import RadarChart from './RadarChart.jsx'

const STAGE_NAME = ['', '幼体', '成长体', '完全体']
const NEXT_STAGE = { 1: 150, 2: 500, 3: 999 }

// 精灵卡片：标准集换式卡比例 63:88（宽 340，高 475）
// 鼠标跟随倾斜 + 全息层（参考 hover-tilt / pokemon-cards-css 视觉，自研实现）
export default function PetCard({ pet, revealed = false }) {
  const ref = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: py * -12, y: px * 14 })
  }
  const onLeave = () => setTilt({ x: 0, y: 0 })

  const q = pet.quality
  const nextLevel = NEXT_STAGE[pet.evolutionStage]
  const progress = pet.evolutionStage >= 3 ? 100 : Math.min(100, (pet.level / nextLevel) * 100)

  return (
    <div
      ref={ref}
      className={`pet-card quality-${q.key} ${revealed ? 'card-flip-in' : ''}`}
      style={{
        '--q-color': q.color,
        '--q-glow': q.glow,
        '--rx': `${tilt.x}deg`,
        '--ry': `${tilt.y}deg`,
        '--mx': `${50 + tilt.y * 2}%`,
        '--my': `${50 + tilt.x * 2}%`,
      }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="holo-layer" />
      <div className="glare" />

      <div className="card-head">
        <div className="card-head-text">
          <div className="pet-name">{pet.repo}</div>
          <div className="pet-sub">
            {pet.element.name}系
            {pet.elementSecondary && <span className="dual">/{pet.elementSecondary.name}</span>}
            {' · '}{pet.species.name} · {STAGE_NAME[pet.evolutionStage]}
            {pet.status === 'sleeping' && <span className="sleep-tag">沉睡</span>}
          </div>
        </div>
        <div className="quality-badge">
          <span>{q.key}</span>
          <small>{q.name}</small>
        </div>
      </div>

      <div className="sprite-frame">
        <div className="sprite-aura" />
        <PixelSprite pet={pet} size={132} />
      </div>

      <div className="card-row">
        <span className="lv">Lv.{pet.level}</span>
        <div className="hp-bar">
          <div className="hp-fill" style={{ width: `${(pet.level / 999) * 100}%` }} />
        </div>
        <span className="hp-num">HP {pet.maxHp}</span>
      </div>

      <div className="mini-rows">
        <div className="mini-row">
          <span className="mini-label">进化</span>
          <div className="evo-bar"><div className="evo-fill" style={{ width: `${progress}%` }} /></div>
          <span className="mini-val">{pet.evolutionStage >= 3 ? '最终' : `Lv.${nextLevel}`}</span>
        </div>
        <div className="mini-row">
          <span className="mini-label">根基</span>
          <div className="foundation-bar">
            <div
              className={`foundation-fill tier-${pet.foundationTier?.key || 'fair'}`}
              style={{ width: `${pet.foundation || 0}%` }}
            />
          </div>
          <span className={`mini-val tier-${pet.foundationTier?.key || 'fair'}`}>
            {pet.foundationTier?.name || '未评估'}
          </span>
        </div>
      </div>

      <div className="card-body">
        <RadarChart stats={pet.stats} color={pet.element.color} size={120} compact />
        <div className="stats-list">
          {pet.stats.map((s) => (
            <div key={s.name} className="stat-row">
              <span className="stat-name">{s.name}</span>
              <div className="stat-bar">
                <div className="stat-fill" style={{ width: `${s.value}%`, background: pet.element.color }} />
              </div>
              <span className="stat-val">{s.value}</span>
              <span className={`stat-grade g-${s.grade}`}>{s.grade}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="skills">
        {pet.skills.map((s) => (
          <div key={s.name} className={`skill ${s.unlocked ? '' : 'locked'}`} title={s.unlocked ? s.name : `Lv.${s.unlockLevel} 解锁`}>
            <span className="skill-dot" />
            <span className="skill-name">{s.unlocked ? s.name : `Lv.${s.unlockLevel}`}</span>
          </div>
        ))}
      </div>

      {(pet.traits?.length > 0 || pet.traitHints?.filter((h) => h.fix).length > 0) && (
        <div className="traits">
          {pet.traits.slice(0, 3).map((t) => (
            <span key={t.key} className={`trait-chip ${t.kind}`} title={`${t.desc}\n触发：${t.reason}`}>
              {t.kind === 'negative' ? '▾' : '▴'} {t.name}
            </span>
          ))}
          {pet.traitHints?.filter((h) => h.fix).slice(0, 1).map((h) => (
            <span className="trait-fix-inline" key={h.name} title={h.fix}>?</span>
          ))}
        </div>
      )}

      <div className="quality-dims">
        {pet.qualityDims.map((d) => (
          <div key={d.key} className="qd" title={`${d.name} ${d.value}`}>
            <div className="qd-bar"><div style={{ width: `${d.value}%`, background: q.color }} /></div>
            <span className="qd-name">{d.name}</span>
          </div>
        ))}
      </div>

      <div className="card-foot">
        <span>品质 {pet.qualityScore} · 工程量 {pet.engineeringScore}</span>
        <span>{pet.platform === 'gitee' ? 'Gitee' : 'GitHub'} · ★{pet.stars}</span>
      </div>
    </div>
  )
}
