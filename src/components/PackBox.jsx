import { useEffect } from 'react'
import PixelSprite from './PixelSprite.jsx'
import { sfx } from '../sfx.js'
import { elementLabel } from '../elementLabel.js'
import { cardFoil, cloudCardTraits, isCloudCard } from '../cardTraits.js'
import { groupIntoPacks } from '../packGroups.js'
import { useI18n } from '../i18n.js'
import '../holoPack/holoPack.css'

// 整箱卡包：账号下的项目每 5 个装一包，品质由包里最好的那个决定外观
const palette = { SSR: '#ffb300', SR: '#ab47bc', R: '#42a5f5', N: '#9e9e9e' }
const RANK = { N: 1, R: 2, SR: 3, SSR: 4 }

// 复用开包舞台的封口、印刷面与镀铬吉祥物；卡箱只展示静态包装。
function PackCover({ count, index, opened }) {
  const { t } = useI18n()
  const print = (
    <>
      <span className="hp-tag">Tear here ⟶</span>
      <b className="hp-mark">GITMON</b>
      <span className="hp-series">PACK {String(index + 1).padStart(2, '0')}</span>
      <span className="hp-orb">
        <i className="hp-orb-body" />
        <i className="hp-eye l"><i className="hp-pupil" /></i>
        <i className="hp-eye r"><i className="hp-pupil" /></i>
        <i className="hp-smile" />
      </span>
      <span className="hp-foot l">Card pack</span>
      <span className="hp-foot r">{t(`${count} 张`, `${count} cards`)}</span>
    </>
  )
  return (
    <span className={`pack-cover${opened ? ' is-open' : ''}`} aria-hidden="true">
      {opened && <span className="pack-cover-mouth" />}
      <span className="hp-skin front pack-cover-body">{print}</span>
      {opened && <span className="hp-skin front pack-cover-tear">{print}</span>}
    </span>
  )
}

export default function PackBox({
  box,
  opened,
  saved,
  revealedAll,
  onOpen,
  onPickCard,
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
  const packs = groupIntoPacks(pets)

  const tallies = new Map(cloud ? [] : Object.entries(palette).map(([key, color]) => [key, { key, color, label: key, count: 0 }]))
  for (const pet of pets) {
    const foil = cardFoil(pet)
    const key = cloud ? foil.label : foil.key
    const tally = tallies.get(key) || { ...foil, count: 0 }
    tallies.set(key, { ...tally, count: tally.count + 1 })
  }

  const revealedPets = packs.flat().filter((pet) => revealedAll || opened.has(pet.id || pet.fullName))
  const unopened = packs.filter((pack) => !revealedAll && !pack.every((pet) => opened.has(pet.id || pet.fullName))).length
  const allRevealed = unopened === 0
  const uncollected = revealedPets.filter((pet) => !saved.has(pet.id || pet.fullName)).length
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
              <b>{pets.length}</b>{t(' 个项目', ' projects')}
              {' · '}
              <b>{packs.length}</b>{t(' 包', ' packs')}
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
          : t('每 5 个项目装一包，品质取包里最好的那个 —— 点开任意一包，看抽中什么。', 'Every 5 projects make a pack, its look comes from the best one inside — tap any pack to see what you drew.')}
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

      <section className="box-packs" aria-labelledby="box-packs-title">
        <div className="box-section-head">
          <h3 id="box-packs-title">{t('卡包', 'Packs')}</h3>
          <span>{unopened > 0 ? t(`${unopened} 包待开启`, `${unopened} unopened`) : t('全部已开封', 'All opened')}</span>
        </div>
        <div className="pack-grid">
          {packs.map((pack, i) => {
            let best = null
            for (const pet of pack) {
              const foil = cardFoil(pet)
              if (!best || (RANK[foil.effect] || 0) > (RANK[best.effect] || 0)) best = foil
            }
            const revealed = revealedAll || pack.every((pet) => opened.has(pet.id || pet.fullName))
            const Tile = revealed ? 'div' : 'button'
            return (
              <Tile
                key={`pack-${i}`}
                className={`pack-tile${revealed ? ' is-open' : ''}`}
                style={{ '--q-color': best.color, '--q-glow': best.glow, '--hp-pack': palette[best.effect] || best.color }}
                type={revealed ? undefined : 'button'}
                onClick={revealed ? undefined : () => { sfx.swoosh(); onOpen(pack, i) }}
                disabled={revealed ? undefined : saving}
                role={revealed ? 'img' : undefined}
                aria-label={revealed ? t(`第 ${i + 1} 包 · 已开封`, `Pack ${i + 1} · opened`) : t(`打开第 ${i + 1} 包 · ${pack.length} 张卡片`, `Open pack ${i + 1} · ${pack.length} cards`)}
                title={pack.map((pet) => `${pet.repo} · ${cardFoil(pet).label || cardFoil(pet).name || cardFoil(pet).key}`).join('\n')}
              >
                <PackCover count={pack.length} index={i} opened={revealed} />
                <span className="pt-name">{t(`第 ${i + 1} 包`, `Pack ${i + 1}`)}</span>
                <span className="pack-state">{revealed ? t('已开封', 'Opened') : t('点击开包', 'Open pack')}</span>
              </Tile>
            )
          })}
        </div>
      </section>

      {revealedPets.length > 0 && (
        <section className="box-cards" aria-labelledby="box-cards-title">
          <div className="box-section-head">
            <h3 id="box-cards-title">{t('开出的卡片', 'Revealed cards')}</h3>
            <span aria-live="polite">{t(`${revealedPets.length} 张 · ${uncollected} 张待收下`, `${revealedPets.length} cards · ${uncollected} to collect`)}</span>
          </div>
          <div className="box-card-grid">
            {revealedPets.map((pet, i) => {
              const key = pet.id || pet.fullName
              const isSaved = saved.has(key)
              const foil = cardFoil(pet)
              const traits = isCloudCard(pet) ? cloudCardTraits(pet) : null
              return (
                <button
                  type="button"
                  key={key}
                  className={`box-card q-${foil.effect}${traits ? ' cloud-box-card' : ''}`}
                  style={{ '--q-color': foil.color, '--q-glow': foil.glow, '--i': i }}
                  onClick={() => { sfx.swoosh(); onPickCard(pet) }}
                  disabled={saving}
                  aria-label={t(`查看 ${pet.repo} 卡片 · ${isSaved ? '已收下' : '待收下'}`, `View ${pet.repo} card · ${isSaved ? 'collected' : 'not collected'}`)}
                  title={traits ? pet.fullName : `${pet.fullName} · ${pet.quality.name} · Lv.${pet.level}`}
                >
                  <span className="pt-foil" />
                  <span className="box-card-head">
                    <span className="pt-brand">GITMON</span>
                    <span className="box-card-rarity">{foil.key === 'pending' ? '—' : foil.key}</span>
                  </span>
                  <span className="pt-art">
                    <PixelSprite pet={pet} size={112} animate={false} src={pet.cardSpriteUrl} />
                  </span>
                  <span className="pt-name">{pet.repo}</span>
                  {traits ? (
                    <span className="pt-meta cloud-mini-traits">
                      {traits.map(({ key, label, value, color }) => (
                        <span key={key} style={{ color }} title={`${label} · ${value}`}><b>{label}</b><span className="box-trait-value">{value}</span></span>
                      ))}
                    </span>
                  ) : (
                    <span className="pt-meta">{elementLabel(pet)} · Lv.{pet.level}</span>
                  )}
                  <span className="box-card-foot">
                    <span className={`box-card-status${isSaved ? ' is-saved' : ''}`}>{isSaved ? t('已收下', 'Kept') : 'NEW'}</span>
                    <span>{t('查看卡片', 'View card')} ↗</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div className="actions box-actions">
        {!allRevealed && packs.length > 1 && (
          <button className="primary-btn" onClick={() => { sfx.tiles(unopened); onOpenAll() }} disabled={saving}>
            {t(`一键全开（${unopened} 包）`, `Open All (${unopened})`)}
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
