import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PixelSprite from './PixelSprite.jsx'
import { petKey } from '../deskPet.js'
import { useI18n } from '../i18n.js'
import '../deskpet.css'

// 「桌宠上任」卡片可视化选择（spec §2 修订 v2）：
// hero 标题行显示当前桌宠徽章，点开弹出横向卡片条，点哪张哪张上任。
export default function DeskPetPicker({ list, value, on, lockedKey = null, onPick, onToggle, onLocked }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const badgeRef = useRef(null)
  const [pos, setPos] = useState(null)

  // 卡片条挂到 body（Portal）+ fixed 定位：hero 有 clip-path/overflow:hidden，留在其内部必被裁
  const reposition = () => {
    const r = badgeRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      top: Math.round(Math.min(r.bottom + 8, window.innerHeight - 150)),
      right: Math.round(window.innerWidth - r.right),
    })
  }

  // 点外部 / Esc 关闭卡片条（卡片条在 rootRef 之外，需单独放行）
  useEffect(() => {
    if (!open) return
    const away = (e) => {
      if (rootRef.current?.contains(e.target)) return
      if (e.target.closest?.('.deskpet-cards')) return
      setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  if (!list.length) return null
  const current = list.find((p) => petKey(p) === value) || list[0]
  const curKey = petKey(current)

  return (
    <div className="deskpet-picker" ref={rootRef} role="group" aria-label={t('桌宠上任', 'Desktop pet')}>
      <span className="deskpet-picker-label">{t('桌宠上任', 'DESKTOP PET')}</span>

      {/* 当前桌宠徽章（代替原下拉框） */}
      <button
        type="button"
        ref={badgeRef}
        className="deskpet-current"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('选择桌宠（卡片选择）', 'Choose desktop pet (card picker)')}
        title={t('点开卡片选择桌宠', 'Open cards to pick the desktop pet')}
        onClick={() => { if (!open) reposition(); setOpen((o) => !o) }}
      >
        <PixelSprite pet={current} size={34} animate={false} />
        <b>{current.repo}</b>
        <i>Lv.{current.level}</i>
        {lockedKey && <em className="deskpet-lock" title={t('剧情进行中，桌宠已锁定', 'Story in progress — desktop pet locked')}>LOCK</em>}
        <span className={`deskpet-caret${open ? ' up' : ''}`}>▾</span>
      </button>

      <button
        type="button"
        className={`set-toggle ${on ? 'on' : ''}`}
        aria-pressed={on}
        aria-label={t('桌宠开关', 'Toggle desktop pet')}
        onClick={onToggle}
      >{on ? 'ON' : 'OFF'}</button>

      {/* 卡片条：点卡上任。Portal 到 body，避免被 hero 的 clip-path/overflow 裁剪 */}
      {open && createPortal(
        <div
          className="deskpet-cards"
          role="listbox"
          aria-label={t('选择桌宠', 'Choose desktop pet')}
          style={{ top: pos?.top ?? '-9999px', right: pos?.right ?? 0 }}
        >
          {list.map((p) => {
            const sel = petKey(p) === curKey
            return (
              <button
                key={petKey(p)}
                type="button"
                role="option"
                aria-selected={sel}
                className={`deskpet-card${sel ? ' sel' : ''}`}
                style={{ '--q-color': p.quality?.color || '#9e9e9e' }}
                title={t(`${p.repo} · 点击让它当桌宠`, `${p.repo} · click to make it the desktop pet`)}
                onClick={() => {
                  // C2：剧情进行中桌宠锁定，只有主角可保留
                  if (lockedKey && petKey(p) !== lockedKey) { onLocked?.(); return }
                  onPick(p)
                  setOpen(false)
                }}
              >
                <span className={`dc-q q-${p.quality?.key || 'N'}`}>{p.quality?.key || 'N'}</span>
                <PixelSprite pet={p} size={56} animate={false} />
                <span className="dc-name">{p.repo}</span>
                <span className="dc-meta">Lv.{p.level}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
