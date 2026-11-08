import PixelSprite from './PixelSprite.jsx'
import RadarChart from './RadarChart.jsx'

const STAGE_NAME = ['', '幼体', '成长体', '完全体']

export default function PetCard({ pet, revealed }) {
  const q = pet.quality
  return (
    <div
      className={`pet-card quality-${q.key} ${revealed ? 'card-flip-in' : ''}`}
      style={{ '--q-color': q.color, '--q-glow': q.glow }}
    >
      <div className="holo-layer" />
      {/* 卡头：名称 + 品质 */}
      <div className="card-head">
        <div>
          <div className="pet-name">{pet.repo}</div>
          <div className="pet-sub">
            {pet.element.name}系 · {pet.species.name} · {STAGE_NAME[pet.evolutionStage]}
          </div>
        </div>
        <div className="quality-badge">{q.key}</div>
      </div>

      {/* 立绘 */}
      <div className="sprite-frame">
        <PixelSprite pet={pet} size={150} />
      </div>

      {/* 等级/HP 条 */}
      <div className="card-row">
        <span className="lv">Lv.{pet.level}</span>
        <div className="hp-bar">
          <div className="hp-fill" style={{ width: `${Math.min(100, pet.level / 10)}%` }} />
        </div>
        <span className="hp-num">HP {pet.hp}</span>
      </div>

      {/* 雷达图 */}
      <RadarChart stats={pet.stats} color={pet.element.color} />

      {/* 技能 */}
      <div className="skills">
        {pet.skills.map((s) => (
          <div key={s} className="skill">
            <span className="skill-dot" style={{ background: pet.element.color }} />
            {s}
          </div>
        ))}
      </div>

      {/* 卡脚 */}
      <div className="card-foot">
        <span>{pet.platform === 'gitee' ? 'Gitee' : 'GitHub'} · {pet.fullName}</span>
        <span>{q.name} · 品质分 {pet.qualityScore}</span>
      </div>
    </div>
  )
}
