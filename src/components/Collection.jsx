import PixelSprite from './PixelSprite.jsx'
import { cardFoil, cloudCardTraits, isCloudCard } from '../cardTraits.js'

// 我的图鉴（文档 §9 P1）
export default function Collection({ list, onPick, title = '我的图鉴', empty }) {
  if (!list.length && !empty) return null
  return (
    <section className="collection">
      <div className="section-head">
        <h3>{title}</h3>
        <span className="count">{list.length} / ∞</span>
      </div>
      {list.length ? <div className="collection-grid">
        {list.map((p) => {
          const foil = cardFoil(p)
          return (
            <button
              key={p.id || `${p.platform}-${p.fullName}`}
              className={`collection-item quality-${foil.effect}`}
              style={{ '--q-color': foil.color, '--q-glow': foil.glow }}
              onClick={() => onPick(p)}
            >
              <div className="ci-sprite"><PixelSprite pet={p} size={70} animate={false} src={p.cardSpriteUrl} /></div>
              <div className="ci-name">{p.repo}</div>
              {isCloudCard(p) ? (
                <div className="ci-meta cloud-mini-traits">
                  {cloudCardTraits(p).map(({ key, label, value, color }) => (
                    <span key={key} style={{ color }}><b>{label}</b>{value}</span>
                  ))}
                </div>
              ) : (
                <div className="ci-meta">
                  <span className={`mini-q q-${foil.key}`}>{foil.key}</span>
                  <span>Lv.{p.level}</span>
                </div>
              )}
            </button>
          )
        })}
      </div> : <p>{empty}</p>}
    </section>
  )
}
