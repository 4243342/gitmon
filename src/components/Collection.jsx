import PixelSprite from './PixelSprite.jsx'
import { StarBadge } from '../starBadge.jsx'
import { useI18n } from '../i18n.js'

// 我的图鉴（文档 §9 P1）
export default function Collection({ list, onPick }) {
  const { t } = useI18n()
  if (!list.length) return null
  return (
    <section className="collection">
      <div className="section-head">
        <h3>{t('我的图鉴', 'My Dex')}</h3>
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
            <span className="ci-star"><StarBadge stars={p.stars} size={14} compact /></span>
            <div className="ci-sprite"><PixelSprite pet={p} size={70} animate={false} /></div>
            <div className="ci-name">{p.repo}</div>
            <div className="ci-meta">
              <span className={`mini-q q-${p.quality.key}`}>{p.quality.key}</span>
              <span>Lv.{p.level}</span>
              <span className="ci-cp">{t('战力 ', 'Power ')}{p.combatPower ?? '—'}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
