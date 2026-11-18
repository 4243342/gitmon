import PixelSprite from './PixelSprite.jsx'
import { cardFoil, cloudCardTraits, isCloudCard } from '../cardTraits.js'
import { StarBadge } from '../starBadge.jsx'
import { useI18n } from '../i18n.js'

// 我的图鉴（文档 §9 P1）
// 「桌宠上任」选择框在精灵仓库 hero 标题行（App 内），不在此组件（spec §2 修订）
export default function Collection({ list, onPick, title, empty }) {
  const { t } = useI18n()
  if (!list.length && !empty) return null
  return (
    <section className="collection">
      <div className="section-head">
        <h3>{title || t('我的图鉴', 'My Dex')}</h3>
        <span className="count">{list.length} / ∞</span>
      </div>
      {list.length ? <div className="collection-grid">
        {list.map((p) => {
          const foil = cardFoil(p)
          const cloud = isCloudCard(p)
          return (
            <button
              key={p.id || `${p.platform}-${p.fullName}`}
              className={`collection-item quality-${foil.effect}`}
              style={{ '--q-color': foil.color, '--q-glow': foil.glow }}
              onClick={() => onPick(p)}
            >
              <span className="ci-star"><StarBadge stars={p.stars} size={14} compact /></span>
              <div className="ci-sprite"><PixelSprite pet={p} size={70} animate={false} src={p.cardSpriteUrl} /></div>
              <div className="ci-name">{p.repo}</div>
              {cloud ? (
                // 云卡：显示云端给的三项事实（属性 / 罕见度 / 品质），本地六维那套云卡没有
                <div className="ci-meta cloud-mini-traits">
                  {cloudCardTraits(p).map(({ key, label, value, color }) => (
                    <span key={key} style={{ color }}><b>{label}</b>{value}</span>
                  ))}
                </div>
              ) : (
                <div className="ci-meta">
                  <span className={`mini-q q-${foil.key}`}>{foil.key}</span>
                  <span>Lv.{p.level}</span>
                  <span className="ci-cp">{t('战力 ', 'Power ')}{p.combatPower ?? '—'}</span>
                </div>
              )}
            </button>
          )
        })}
      </div> : <p>{empty}</p>}
    </section>
  )
}
