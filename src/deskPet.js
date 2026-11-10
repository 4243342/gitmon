// 桌宠状态（DesktopPet）：选择 / 开关 / 收起。
// 按 docs/SSOT.md §1 属「轻 UI 状态」（与静音、战斗编队同级）——只存本地，不上云、不入脏队列。
const K = 'gitmon:deskpet'
const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export const DESK_DEFAULT = { on: true, key: null, collapsed: false, pos: null }

export const petKey = (p) => `${p.platform}-${p.fullName}`

export function loadDesk() {
  try {
    const raw = localStorage.getItem(K)
    const v = raw ? JSON.parse(raw) : null
    if (!v || typeof v !== 'object') return { ...DESK_DEFAULT }
    // 载入即夹回视口内：窗口变小后重载不会卡在屏幕外
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768
    const pos = v.pos && Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y)
      ? { x: clamp(Math.round(v.pos.x), 0, vw - 60), y: clamp(Math.round(v.pos.y), 0, vh - 60) }
      : null
    return {
      on: v.on !== false,
      key: typeof v.key === 'string' && v.key ? v.key : null,
      collapsed: v.collapsed === true,
      pos,
    }
  } catch { /* 隐私模式/存储不可用：本次会话用默认值 */ return { ...DESK_DEFAULT } }
}

export function saveDesk(desk) {
  try { localStorage.setItem(K, JSON.stringify(desk)) } catch { /* 同上 */ }
}
