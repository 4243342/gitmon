import PixelSprite from './PixelSprite.jsx'

// 我的图鉴（文档 §9 P1）
export default function Collection({ list, onPick }) {
  if (!list.length) return null
  return (
    <section className="collection">
      <div className="section-head">
        <h3>我的图鉴</h3>
        <span className="count">{list.length} / ∞</span>
      </div>
      <div className="collection-grid">
        {list.map((p) => (
          <button
            key={`${p.platform}-${p.fullName}`}
            className={`collection-item quality-${p.quality.key}`}
            style={{ '--q-color': p.quality.color, '--q-glow': p.quality.glow }}
            onClick={() => onPick(p)}
          >
            <div className="ci-sprite"><PixelSprite pet={p} size={70} animate={false} /></div>
            <div className="ci-name">{p.repo}</div>
            <div className="ci-meta">
              <span className={`mini-q q-${p.quality.key}`}>{p.quality.key}</span>
              <span>Lv.{p.level}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
