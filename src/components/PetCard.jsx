import { useEffect, useReducer, useRef, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import RadarChart from './RadarChart.jsx'
import { hasCustomSprite, setCustomSprite, clearCustomSprite, onCustomSprite } from '../customSprite.js'
import { MAX_STAGE, nextStage, stageInfo, stageProgress } from '../evolution.js'
import { StarBadge } from '../starBadge.jsx'
import ModelSeal from './ModelSeal.jsx'

// 精灵卡片：标准集换式卡比例 63:88（宽 340，高 475）
// 鼠标跟随倾斜 + 全息层（参考 hover-tilt / pokemon-cards-css 视觉，自研实现）
export default function PetCard({ pet, revealed = false }) {
  const ref = useRef(null)
  const fileRef = useRef(null)
  const [, bump] = useReducer((x) => x + 1, 0)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [dragOver, setDragOver] = useState(false)

  // 自定义形象变化时刷新按钮状态
  useEffect(() => onCustomSprite(bump), [])

  const acceptFile = (file) => {
    if (file && file.type.startsWith('image/')) setCustomSprite(pet, file)
  }

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: py * -12, y: px * 14 })
  }
  const onLeave = () => setTilt({ x: 0, y: 0 })

  const q = pet.quality
  const evo = stageInfo(pet.evolutionStage)
  const nextEvo = nextStage(pet.evolutionStage)
  const progress = stageProgress(pet.level)
  const repoHost = pet.platform === 'gitee' ? 'gitee.com' : 'github.com'
  const repoUrl = `https://${repoHost}/${pet.fullName || pet.repo}`

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
            {' · '}{pet.species.name} · {evo.name}
            {pet.status === 'sleeping' && <span className="sleep-tag">沉睡</span>}
            {pet.aiEvaluated && (
              <span className="ai-tag" title={`全部评测由模型 ${pet.aiModel || ''} 给出，非真实扫描`}>AI 推测</span>
            )}
          </div>
        </div>
        {/* 星级段位：GitHub / Gitee star，1 颗 = 1 级，右上角 */}
        <StarBadge stars={pet.stars} size={26} />
        <div className={`quality-badge len-${q.key.length}`} title={`品质：${q.name}`}>
          <span>{q.key}</span>
        </div>
      </div>

      <div
        className={`sprite-frame ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]) }}
      >
        <div className="sprite-aura" />
        <PixelSprite pet={pet} size={132} />
        <ModelSeal pet={pet} />
        <div className="sprite-tools">
          {hasCustomSprite(pet) && (
            <button className="sprite-tool" title="恢复默认立绘" onClick={() => clearCustomSprite(pet)}>还原</button>
          )}
          <button className="sprite-tool" title="上传自定义形象，也可以直接把图片拖到这里" onClick={() => fileRef.current?.click()}>
            换形象
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>

      <div className="card-row">
        <span className="lv">Lv.{pet.level}</span>
        <div className="hp-bar">
          <div className="hp-fill" style={{ width: `${Math.min(100, ((pet.maxHp || 0) / (pet.statCap || 100)) * 100)}%` }} />
        </div>
        <span className="hp-num">HP {pet.maxHp}</span>
      </div>

      <div className="mini-rows">
        <div className="mini-row">
          <span className="mini-label">{pet.evolutionStage}/{MAX_STAGE}</span>
          <div className="evo-bar"><div className="evo-fill" style={{ width: `${progress}%` }} /></div>
          <span className="mini-val">{nextEvo ? `Lv.${nextEvo.min}` : '最终'}</span>
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
        <RadarChart stats={pet.stats} color={pet.element.color} size={120} compact max={pet.statCap || 100} />
        <div className="stats-list">
          {pet.stats.map((s) => (
            <div key={s.name} className="stat-row">
              <span className="stat-name">{s.name}</span>
              <div className="stat-bar">
                <div className="stat-fill" style={{ width: `${Math.min(100, (s.value / (pet.statCap || 100)) * 100)}%`, background: pet.element.color }} />
              </div>
              <span className="stat-val">{s.value}</span>
              <span className={`stat-grade g-${s.grade}`}>{s.grade}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="skills">
        {pet.skills.map((s, i) => {
          // 高级模式：技能名 / 属性 / 威力 / 解锁等级 / 描述 / 依据全部来自模型，hover 可看定制依据
          const tip = [
            s.name,
            s.element ? `${s.element.name}系` : '',
            s.power != null ? `威力 ${s.power}` : '',
            `Lv.${s.unlockLevel} 解锁`,
            s.desc,
            s.reason ? `定制依据：${s.reason}` : '',
          ].filter(Boolean).join('\n')
          return (
            <div
              key={`${s.name}-${i}`}
              className={`skill ${s.unlocked ? '' : 'locked'}`}
              title={s.unlocked ? tip : `Lv.${s.unlockLevel} 解锁 · ${s.name}`}
              style={s.element ? { '--skill-color': s.element.color } : undefined}
            >
              <span className="skill-dot" />
              <span className="skill-name">{s.unlocked ? s.name : `Lv.${s.unlockLevel}`}</span>
              {s.unlocked && s.power != null && <span className="skill-power">{s.power}</span>}
            </div>
          )
        })}
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
        <span>品质 {pet.qualityScore} · 工程量 {pet.engineeringScore} · 战力 {pet.combatPower ?? '—'}</span>
        <span className="card-foot-right">
          <a
            className="card-repo-url"
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            title={repoUrl}
            onClick={(e) => e.stopPropagation()}
          >
            {repoUrl}
          </a>
          <span className="card-foot-stars">· ★{pet.stars}</span>
        </span>
      </div>
    </div>
  )
}
