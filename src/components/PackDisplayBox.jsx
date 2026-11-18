import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import './PackDisplayBox.css'

const PAGE_SIZE = 6

// The canvas is a visual shortcut. The ordinary pack buttons below it remain
// available to keyboards, screen readers, and browsers without WebGL.
export default function PackDisplayBox({ packs, activeIndex = 0, onSelect, onOpen, disabled = false }) {
  const { t } = useI18n()
  const hostRef = useRef(null)
  const engineRef = useRef(null)
  const latestRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const hasPacks = packs.length > 0
  const index = Math.max(0, Math.min(Number.isFinite(activeIndex) ? Math.trunc(activeIndex) : 0, packs.length - 1))
  latestRef.current = { packs, index, onSelect, disabled }

  useEffect(() => {
    if (!hasPacks) return
    let cancelled = false
    let engine = null
    setStatus('loading')
    import('../threePack/displayBox.js').then(({ createPackDisplayBox }) => {
      if (cancelled || !hostRef.current) return
      try {
        engine = createPackDisplayBox(hostRef.current, {
          onSelect: (next) => latestRef.current.onSelect?.(next),
          onUnavailable: () => { if (!cancelled) setStatus('fallback') },
        })
        if (cancelled) { engine.dispose(); return }
        engineRef.current = engine
        const latest = latestRef.current
        engine.setPacks(latest.packs, latest.index)
        engine.setDisabled(latest.disabled)
        setStatus('ready')
      } catch {
        engine?.dispose()
        if (!cancelled) setStatus('fallback')
      }
    }).catch(() => { if (!cancelled) setStatus('fallback') })
    return () => {
      cancelled = true
      engine?.dispose()
      engineRef.current = null
    }
  }, [hasPacks])

  useEffect(() => {
    engineRef.current?.setPacks(packs, index)
    engineRef.current?.setDisabled(disabled)
  }, [packs, index, disabled])

  if (!packs.length) return null
  const selected = packs[index]
  const page = Math.floor(index / PAGE_SIZE)
  const totalPages = Math.ceil(packs.length / PAGE_SIZE)
  const visiblePacks = packs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <section className={`pack-display-box is-${status}`} style={{ '--display-accent': selected.accent || selected.color }} aria-label={t('卡包收藏盒', 'Pack collection box')}>
      <div className="pack-display-topline">
        <span className="pack-display-edition"><i /> GITMON · MODEL COLLECTION</span>
        <span className="pack-display-total">{String(packs.length).padStart(2, '0')} {t('包入藏', 'PACKS')}</span>
      </div>

      <div className="pack-display-scene" ref={hostRef} aria-hidden="true" />

      {status !== 'ready' && (
        <div className="pack-display-fallback" aria-hidden="true">
          <div className="pack-display-fallback-lid"><strong>GITMON</strong><span>MODEL COLLECTION</span></div>
          <div className="pack-display-fallback-packs">
            {visiblePacks.map((pack, offset) => (
              <div key={pack.id ?? `${page}-${offset}`} className={`pack-display-fallback-pack${pack.opened ? ' is-open' : ''}${page * PAGE_SIZE + offset === index ? ' is-selected' : ''}`} style={{ '--pack-color': pack.color, '--pack-accent': pack.accent || pack.color }}>
                <b>{pack.unrated ? '—' : pack.key}</b>
                {pack.art && <img src={pack.art} alt="" />}
                <span>{pack.unrated ? t('待评估', 'Unrated') : pack.model}</span>
              </div>
            ))}
          </div>
          <div className="pack-display-fallback-front">COLLECT · DISCOVER · CREATE</div>
        </div>
      )}

      <div className="pack-display-caption">
        <span className="pack-display-tier">{selected.unrated ? '—' : selected.key}</span>
        <div className="pack-display-selected" aria-live="polite" aria-atomic="true">
          <strong>{selected.model}<span>{selected.unrated ? t('待评估', 'Unrated') : selected.name}</span></strong>
          <p>{t(`第 ${index + 1} 包 · ${selected.count} 张卡片`, `Pack ${index + 1} · ${selected.count} cards`)} · {selected.opened ? t('已开封', 'Opened') : t('待开启', 'Sealed')}</p>
        </div>
        <button className="pack-display-open" type="button" disabled={disabled || selected.opened} onClick={() => onOpen?.(index)}>
          {selected.opened ? t('已开封', 'Opened') : t('取出开包', 'Open pack')}
          {!selected.opened && <span aria-hidden="true">↗</span>}
        </button>
      </div>

      <div className="pack-display-bottomline">
        <span>{status === 'loading' ? t('正在布置收藏盒…', 'Preparing your collection…') : status === 'fallback' ? t('选择下方封面查看卡包', 'Select a cover below to view its pack') : t('轻触盒内卡包，挑选你的下一包', 'Touch a pack in the box to select it')}</span>
        {totalPages > 1 && (
          <div className="pack-display-pages" role="group" aria-label={t('切换卡盒页', 'Collection pages')}>
            <button type="button" aria-label={t('上一页卡包', 'Previous packs')} disabled={disabled || page === 0} onClick={() => onSelect?.(Math.max(0, index - PAGE_SIZE))}>‹</button>
            <span>{page + 1} / {totalPages}</span>
            <button type="button" aria-label={t('下一页卡包', 'Next packs')} disabled={disabled || page === totalPages - 1} onClick={() => onSelect?.(Math.min(packs.length - 1, index + PAGE_SIZE))}>›</button>
          </div>
        )}
      </div>
    </section>
  )
}
