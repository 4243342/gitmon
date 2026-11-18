import { useEffect } from 'react'
import PixelSprite from './PixelSprite.jsx'
import { sfx } from '../sfx.js'
import { elementLabel } from '../elementLabel.js'
import { cardFoil, cloudCardTraits, isCloudCard } from '../cardTraits.js'
import { useI18n } from '../i18n.js'

// 整箱卡包（文档 §2.3）：一个账号 = 该账号每个项目一个卡包
const palette = { SSR: '#ffb300', SR: '#ab47bc', R: '#42a5f5', N: '#9e9e9e' }

export default function PackBox({
  box,
  opened,
  saved,
  revealedAll,
  onOpen,
  onOpenAll,
  onSaveAll,
  onExit,
  saving,
  error,
  exitLabel,
}) {
  const { t } = useI18n()
  const { owner, pets, listed, limit, truncated, skipped, rateLimited, failed, partial } = box
  const cloud = Boolean(box.id)
  const tallies = new Map(cloud ? [] : Object.entries(palette).map(([key, color]) => [key, { key, color, label: key, count: 0 }]))
  for (const pet of pets) {
    const foil = cardFoil(pet)
    const key = cloud ? foil.label : foil.key
    const tally = tallies.get(key) || { ...foil, count: 0 }
    tallies.set(key, { ...tally, count: tally.count + 1 })
  }
  const allRevealed = revealedAll || pets.every((pet) => opened.has(pet.id || pet.fullName))
  const remaining = pets.filter((pet) => !saved.has(pet.id || pet.fullName)).length
  const exitText = exitLabel ?? t('换个账号 / 仓库', 'Switch account / repo')

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
              {(truncated || listed > pets.length) && <em>{t(`（从 ${listed} 个项目里取最近活跃的 ${limit} 个）`, `(${limit} most recently active of ${listed} projects)`)}</em>}
            </p>
          </div>
        </div>

        <div className="box-tally">
          {[...tallies].map(([key, tally]) => (
            <span key={key} className="tally" style={{ '--tc': tally.color }}>
              <b>{tally.label}</b>
              {tally.count}
            </span>
          ))}
        </div>
      </header>

      <p className="box-hint">
        {cloud
          ? t('点开卡包查看属性、罕见度和品质。', 'Tap a pack to see its attribute, rarity and quality.')
          : t('每个卡包对应一个项目，品质由那个项目自己的代码质量决定 —— 点开任意一包，看抽中什么。', 'Each pack is one project; its rarity comes from that repo’s own code quality — tap any pack to see what you drew.')}
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
          const key = pet.id || pet.fullName
          const isOpen = opened.has(key)
          const isSaved = saved.has(key)
          const revealed = revealedAll || isOpen
          const foil = cardFoil(pet)
          const traits = isCloudCard(pet) ? cloudCardTraits(pet) : null
          return (
            <button
              key={key}
              className={`pack-tile q-${foil.effect}${traits ? ' cloud-pack-tile' : ''}${isOpen ? ' is-open' : ''}${revealed ? ' is-revealed' : ''}`}
              style={{ '--q-color': foil.color, '--q-glow': foil.glow, '--i': i }}
              onClick={() => { sfx.swoosh(); onOpen(pet, revealed, isSaved) }}
              disabled={saving}
              title={traits ? pet.fullName : `${pet.fullName} · ${pet.quality.name} · Lv.${pet.level}`}
            >
              <span className="pt-foil" />
              <span className="pt-brand">GITMON</span>
              <span className="pt-shield" />

              <span className="pt-art">
                {revealed
                  ? <PixelSprite pet={pet} size={72} animate={false} src={pet.cardSpriteUrl} />
                  : <span className="pt-seal">?</span>}
              </span>

              <span className="pt-name">{pet.repo}</span>
              {traits && revealed ? (
                <span className="pt-meta cloud-mini-traits">
                  {traits.map(({ key, label, value, color }) => (
                    <span key={key} style={{ color }}><b>{label}</b>{value}</span>
                  ))}
                </span>
              ) : (
                <span className="pt-meta">
                  {traits ? foil.label : `${elementLabel(pet)} · Lv.${pet.level}`}
                </span>
              )}
              {revealed && <span className="pt-new">{isSaved ? t('已收下', 'Kept') : 'NEW'}</span>}
            </button>
          )
        })}
      </div>

      <div className="actions box-actions">
        {!allRevealed && pets.length > 1 && (
          <button className="primary-btn" onClick={() => { sfx.tiles(pets.length); onOpenAll() }}>
            {t(`一键全开（${pets.length} 包）`, `Open All (${pets.length})`)}
          </button>
        )}
        {/* 收下（保存）流程：已揭晓的包才可收入，剩下的还能补收 */}
        {allRevealed && remaining > 0 && (
          <button className="primary-btn" onClick={onSaveAll} disabled={saving}>
            {saving
              ? t('正在收入…', 'Saving…')
              : t(`全部收入${box.id ? '云图鉴' : '图鉴'}（${remaining}）`, `Save All to ${box.id ? 'Cloud Dex' : 'Dex'} (${remaining})`)}
          </button>
        )}
        {remaining === 0 && <span className="box-saved">{t(`✓ 全部已收入${box.id ? '云图鉴' : '图鉴'}`, `✓ All saved to ${box.id ? 'Cloud Dex' : 'Dex'}`)}</span>}
        <button className="ghost-btn" onClick={onExit} disabled={saving}>{exitText}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <p className="box-foot">
        {box.id
          ? t('单仓库和整箱孵化使用同一只精灵，收下后可在云图鉴查看。', 'Single repos and full boxes hatch the same pet — once kept, it lives in your cloud dex.')
          : <>{t('同一账号再次抽卡只会更新数值，不会换精灵 —— 种子永远是 ', 'Re-rolling the same account only refreshes stats — the pet never changes, and the seed is always ')}<code>platform/owner/repo</code>{t('。', '.')}</>}
      </p>
    </main>
  )
}
