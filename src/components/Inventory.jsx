// 背包 Tab：余额、道具、最近流水。
//
// 这里只显示账本，不做任何本地计算——加减都在服务端那侧落库。
import { useI18n } from '../i18n.js'

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Inventory({ data, onUse, busy = false }) {
  const { t: tf } = useI18n()
  if (!data) {
    return <p className="inv-empty">{tf('背包正在打开…', 'Opening your pack…')}</p>
  }
  const items = data.items || []
  const balances = data.balances || {}
  const currency = items.find((i) => i.key === data.currency) || { name: '星尘', icon: '✦', color: '#f5c542' }
  const goods = items.filter((i) => i.key !== data.currency)
  const nameOf = (key) => items.find((i) => i.key === key)?.name || key
  const iconOf = (key) => items.find((i) => i.key === key)?.icon || '·'

  return (
    <section className="inv-panel">
      <div className="inv-wallet">
        <span className="inv-coin" style={{ color: currency.color }}>
          <i aria-hidden="true">{currency.icon}</i>
          <b>{balances[data.currency] ?? 0}</b>
        </span>
        <span className="inv-wallet-note">
          {tf('星尘', 'Stardust')}
          <em>{tf('竞技场每赢一场 +30 · 剧情每达成一个结局 +80', '+30 per arena win · +80 per story ending')}</em>
        </span>
      </div>

      <h4 className="inv-h">{tf('道具', 'Items')}</h4>
      <div className="inv-grid">
        {goods.map((item) => {
          const count = balances[item.key] ?? 0
          const usable = item.kind === 'consumable' && count > 0
          return (
            <div key={item.key} className={`inv-item${count ? '' : ' is-empty'}`}>
              <span className="inv-icon" style={{ color: item.color }} aria-hidden="true">{item.icon}</span>
              <div className="inv-item-main">
                <b>{item.name}</b>
                <p>{item.desc}</p>
              </div>
              <span className="inv-count">×{count}</span>
              {usable ? (
                onUse ? (
                  <button className="mini-btn" disabled={busy} onClick={() => onUse?.(item.key)}>
                    {tf('使用', 'Use')}
                  </button>
                ) : (
                  // 背包里没有「当前选中的精灵」，所以这里只提示去处：
                  // 真正使用要在精灵详情页，那里有明确的目标。
                  <span className="inv-hint">{tf('在精灵详情页使用', 'Use it on a sprite')}</span>
                )
              ) : null}
            </div>
          )
        })}
      </div>

      <h4 className="inv-h">{tf('最近流水', 'Recent activity')}</h4>
      {(data.ledger || []).length === 0 ? (
        <p className="inv-empty">{tf('还没有任何进出账。去竞技场赢一场就有了。', 'Nothing yet — win an arena round to get started.')}</p>
      ) : (
        <ul className="inv-ledger">
          {data.ledger.map((row, i) => (
            <li key={`${row.created_at}-${row.item_key}-${i}`}>
              <span className="inv-led-icon" aria-hidden="true">{iconOf(row.item_key)}</span>
              <span className="inv-led-name">{nameOf(row.item_key)}</span>
              <span className={`inv-led-delta ${row.delta > 0 ? 'plus' : 'minus'}`}>
                {row.delta > 0 ? `+${row.delta}` : row.delta}
              </span>
              <em className="inv-led-reason">{row.reason || ''}</em>
              <span className="inv-led-time">{fmtTime(row.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
