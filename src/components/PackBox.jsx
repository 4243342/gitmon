import PixelSprite from './PixelSprite.jsx'
import { sfx } from '../sfx.js'

// 整箱卡包（文档 §2.3）：一个账号 = 该账号每个项目一个卡包
// 品质在开箱前就已由各项目自己的代码质量决定（不能刷、不能改）

const palette = { SSR: '#ffb300', SR: '#ab47bc', R: '#42a5f5', N: '#9e9e9e' }

export default function PackBox({
  box,
  opened,
  revealedAll,
  onOpen,
  onOpenAll,
  onSaveAll,
  onExit,
}) {
  const { owner, pets, listed, limit, truncated, skipped, rateLimited, failed, partial } = box
  const counts = pets.reduce((acc, p) => {
    acc[p.quality.key] = (acc[p.quality.key] || 0) + 1
    return acc
  }, {})
  const openedCount = pets.filter((p) => opened.has(p.fullName)).length
  const allSaved = revealedAll && openedCount === pets.length

  return (
    <main className="box-stage">
      <header className="box-head">
        <div className="box-id">
          {owner.avatar
            ? <img className="box-avatar" src={owner.avatar} alt="" />
            : <span className="box-avatar box-avatar-ph" />}
          <div className="box-id-text">
            <h2>
              {owner.displayName}
              <span className="box-handle">@{owner.owner}</span>
            </h2>
            <p>
              {owner.platform === 'gitee' ? 'Gitee' : 'GitHub'}
              {owner.isOrg ? ' · 组织' : ' · 账号'}
              {' · '}
              <b>{pets.length}</b> 个卡包
              {listed > pets.length && <em>（从 {listed} 个项目里取最近活跃的 {limit} 个）</em>}
            </p>
          </div>
        </div>

        <div className="box-tally">
          {['SSR', 'SR', 'R', 'N'].map((k) => (
            <span key={k} className={`tally tally-${k}`} style={{ '--tc': palette[k] }}>
              <b>{k}</b>
              {counts[k] || 0}
            </span>
          ))}
        </div>
      </header>

      <p className="box-hint">
        每个卡包对应一个项目，品质由那个项目自己的代码质量决定 —— 点开任意一包，看它孵出什么。
      </p>

      {(truncated || rateLimited || failed?.length > 0 || partial > 0) && (
        <div className="box-warn">
          {rateLimited && <span>! API 限流，部分项目没扫到，稍后再来或设置 Token</span>}
          {!rateLimited && truncated && <span>! 项目太多（{listed} 个），本次先开最近活跃的 {limit} 个</span>}
          {partial > 0 && <span>! {partial} 个项目的文件清单没读到，品质可能偏低 —— 刷新重试一次</span>}
          {failed?.length > 0 && <span>! {failed.length} 个项目扫描失败：{failed.map((f) => f.name).join('、')}</span>}
          {skipped > 0 && <span>· 已跳过 {skipped} 个 fork / 空仓库</span>}
        </div>
      )}

      <div className="pack-grid">
        {pets.map((pet, i) => {
          const isOpen = opened.has(pet.fullName)
          const revealed = revealedAll || isOpen
          return (
            <button
              key={`${pet.platform}/${pet.fullName}`}
              className={`pack-tile q-${pet.quality.key}${isOpen ? ' is-open' : ''}${revealed ? ' is-revealed' : ''}`}
              style={{ '--q-color': pet.quality.color, '--q-glow': pet.quality.glow, '--i': i }}
              onClick={() => { if (!revealed) { sfx.blip(); onOpen(pet) } }}
              title={`${pet.fullName} · ${pet.quality.name} · Lv.${pet.level}`}
            >
              <span className="pt-foil" />
              <span className="pt-brand">GITMON</span>
              <span className="pt-shield" />

              <span className="pt-art">
                {revealed
                  ? <PixelSprite pet={pet} size={72} animate={false} />
                  : <span className="pt-seal">?</span>}
              </span>

              <span className="pt-name">{pet.repo}</span>
              <span className="pt-meta">
                {pet.element.name}系 · Lv.{pet.level}
              </span>
              {revealed && <span className="pt-new">NEW</span>}
            </button>
          )
        })}
      </div>

      <div className="actions box-actions">
        {!revealedAll && pets.length > 1 && (
          <button className="primary-btn" onClick={() => { sfx.reveal('SSR'); onOpenAll() }}>
            一键全开（{pets.length} 包）
          </button>
        )}
        {revealedAll && !allSaved && (
          <button className="primary-btn" onClick={onSaveAll}>
            全部收入图鉴（{pets.length}）
          </button>
        )}
        {allSaved && <span className="box-saved">✓ 全部已收入图鉴</span>}
        <button className="ghost-btn" onClick={onExit}>换个账号 / 仓库</button>
      </div>

      <p className="box-foot">
        同一账号再次孵化只会更新数值，不会换精灵 —— 种子永远是 <code>platform/owner/repo</code>。
      </p>
    </main>
  )
}
