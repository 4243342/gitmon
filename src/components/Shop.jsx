// 商店 Tab：货架 + 兑换。
//
// 兑换的幂等在服务端（request_id），这里每次点击生成一个 id；
// 网络失败重试时必须复用同一个 id，否则会重复扣款。
import { useState } from 'react'
import { useI18n } from '../i18n.js'

export default function Shop({ data, onExchange, busy = false }) {
  const { t: tf } = useI18n()
  const [pending, setPending] = useState('')
  if (!data) {
    return <p className="inv-empty">{tf('正在搬货…', 'Stocking the shelves…')}</p>
  }
  const items = data.items || []
  const balances = data.balances || {}
  const currency = items.find((i) => i.key === data.currency) || { name: '星尘', icon: '✦', color: '#f5c542' }
  const have = balances[data.currency] ?? 0
  const metaOf = (key) => items.find((i) => i.key === key) || {}

  const buy = async (offer) => {
    setPending(offer.key)
    try {
      await onExchange?.(offer)
    } finally {
      setPending('')
    }
  }

  return (
    <section className="inv-panel">
      <div className="inv-wallet">
        <span className="inv-coin" style={{ color: currency.color }}>
          <i aria-hidden="true">{currency.icon}</i>
          <b>{have}</b>
        </span>
        <span className="inv-wallet-note">
          {tf('我的星尘', 'My stardust')}
          <em>{tf('不够就先去竞技场赢一场，或去剧情模式打一个结局', 'Not enough? Win an arena round or finish a story ending')}</em>
        </span>
      </div>

      <div className="shop-grid">
        {(data.offers || []).map((offer) => {
          const meta = metaOf(offer.item_key)
          const soldOut = Boolean(offer.limit) && offer.bought >= offer.limit
          const poor = have < offer.price
          const disabled = busy || pending === offer.key || soldOut || poor
          return (
            <div key={offer.key} className={`shop-card${soldOut ? ' is-out' : ''}`}>
              <span className="inv-icon" style={{ color: meta.color }} aria-hidden="true">{meta.icon}</span>
              <div className="shop-main">
                <b>{meta.name}</b>
                <p>{meta.desc}</p>
                {offer.limit ? (
                  <small className="shop-limit">
                    {tf('限购', 'Limit')} {offer.limit} · {tf('已兑', 'Bought')} {offer.bought}
                  </small>
                ) : (
                  <small className="shop-limit">{tf('不限购', 'No limit')}</small>
                )}
              </div>
              <div className="shop-buy">
                <span className="shop-price" style={{ color: currency.color }}>
                  <i aria-hidden="true">{currency.icon}</i>{offer.price}
                </span>
                <button
                  className="primary-btn"
                  disabled={disabled}
                  onClick={() => buy(offer)}
                >
                  {soldOut
                    ? tf('已兑完', 'Sold out')
                    : poor
                      ? tf('星尘不足', 'Not enough')
                      : pending === offer.key
                        ? tf('兑换中…', 'Buying…')
                        : tf('兑换', 'Buy')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
