import { useEffect } from 'react'
import PixelSprite from './PixelSprite.jsx'
import { sfx } from '../sfx.js'
import { useI18n } from '../i18n.js'

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
  exitLabel,
}) {
  const { t } = useI18n()
  const { owner, pets, listed, limit, truncated, skipped, rateLimited, failed, partial } = box
  const exitText = exitLabel ?? t('换个账号 / 仓库', 'Switch account / repo')
  const counts = pets.reduce((acc, p) => {
    acc[p.quality.key] = (acc[p.quality.key] || 0) + 1
    return acc
  }, {})
  const openedCount = pets.filter((p) => opened.has(p.fullName)).length
  const allSaved = revealedAll && openedCount === pets.length

  // 整箱登场：上部琶音 + 一层和弦，和"一个卡包"的登场音区分开
  useEffect(() => { sfx.boxIn() }, [])

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
              {owner.isOrg ? t(' · 组织', ' · Org') : t(' · 账号', ' · Account')}
              {' · '}
              <b>{pets.length}</b>{t(' 个卡包', ' packs')}
              {listed > pets.length && <em>{t(`（从 ${listed} 个项目里取最近活跃的 ${limit} 个）`, `(${limit} most recently active of ${listed} projects)`)}</em>}
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
        {t('每个卡包对应一个项目，品质由那个项目自己的代码质量决定 —— 点开任意一包，看抽中什么。', 'Each pack is one project; its rarity comes from that repo’s own code quality — tap any pack to see what you drew.')}
      </p>

      {(truncated || rateLimited || failed?.length > 0 || partial > 0) && (
        <div className="box-warn">
          {rateLimited && <span>{t('! API 限流，部分项目没扫到，稍后再来或设置 Token', '! API rate limited — some projects were skipped. Come back later or set a Token')}</span>}
          {!rateLimited && truncated && <span>{t(`! 项目太多（${listed} 个），本次先开最近活跃的 ${limit} 个`, `! Too many projects (${listed}) — opening the ${limit} most recently active ones`)}</span>}
          {partial > 0 && <span>{t(`! ${partial} 个项目的文件清单没读到，品质可能偏低 —— 刷新重试一次`, `! File lists for ${partial} projects failed to load, rarity may read low — refresh to retry`)}</span>}
          {failed?.length > 0 && <span>{t(`! ${failed.length} 个项目扫描失败：${failed.map((f) => f.name).join('、')}`, `! ${failed.length} projects failed to scan: ${failed.map((f) => f.name).join(', ')}`)}</span>}
          {skipped > 0 && <span>{t(`· 已跳过 ${skipped} 个 fork / 空仓库`, `· Skipped ${skipped} forks / empty repos`)}</span>}
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
              onClick={() => { if (!revealed) { sfx.swoosh(); onOpen(pet) } }}
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
                {pet.element.name}{t('系', ' type')} · Lv.{pet.level}
              </span>
              {revealed && <span className="pt-new">NEW</span>}
            </button>
          )
        })}
      </div>

      <div className="actions box-actions">
        {!revealedAll && pets.length > 1 && (
          <button className="primary-btn" onClick={() => { sfx.tiles(pets.length); onOpenAll() }}>
            {t(`一键全开（${pets.length} 包）`, `Open All (${pets.length})`)}
          </button>
        )}
        {revealedAll && !allSaved && (
          <button className="primary-btn" onClick={onSaveAll}>
            {t(`全部收入图鉴（${pets.length}）`, `Save All to Dex (${pets.length})`)}
          </button>
        )}
        {allSaved && <span className="box-saved">{t('✓ 全部已收入图鉴', '✓ All saved to dex')}</span>}
        <button className="ghost-btn" onClick={onExit}>{exitText}</button>
      </div>

      <p className="box-foot">
        {t('同一账号再次抽卡只会更新数值，不会换精灵 —— 种子永远是 ', 'Re-rolling the same account only refreshes stats — the pet never changes, and the seed is always ')}<code>platform/owner/repo</code>{t('。', '.')}
      </p>
    </main>
  )
}
