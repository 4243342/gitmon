import { useId } from 'react'

// 星级段位：GitHub / Gitee 的 star 数 → 卡面右上角徽章
// 1 颗星 = 1 级；10 颗换一个更大的意象，每个意象最多叠 9 层（再往上继续升级）：
//   1–9       金星 × N（一颗一颗画）
//   10–99     炫彩星 × N（N = star ÷ 10）
//   100–999   月亮 × N（÷ 100）
//   1000–9999 地球 × N（÷ 1000）
//   1万–9.99万 太阳 × N（÷ 1万）
//   10万–99.9万 黑太阳 × N（÷ 10万）
//   100万–999万 宇宙 × N（÷ 100万）
//   ≥1000万   至高（文字，宣传位）
const TIERS = [
  { key: 'supreme', name: '至高', unit: 10000000 },
  { key: 'universe', name: '宇宙', unit: 1000000 },
  { key: 'eclipse', name: '黑太阳', unit: 100000 },
  { key: 'sun', name: '太阳', unit: 10000 },
  { key: 'earth', name: '地球', unit: 1000 },
  { key: 'moon', name: '月亮', unit: 100 },
  { key: 'rainbow', name: '炫彩星', unit: 10 },
]

export function starRank(stars) {
  const n = Math.max(0, Math.floor(stars || 0))
  if (n < 1) return null
  const fmt = n.toLocaleString()
  if (n < 10) return { key: 'star', name: '星', unit: 1, count: n, mult: n, pips: n, tip: `${fmt} ★` }
  const tier = TIERS.find((t) => n >= t.unit) ?? TIERS[TIERS.length - 1]
  const mult = Math.max(1, Math.floor(n / tier.unit))
  const tip = tier.key === 'supreme' ? `${fmt} ★ · 至高` : `${fmt} ★ · ${tier.name} ×${mult}`
  return { ...tier, count: n, mult, tip }
}

// 五角星路径（32×32 视框），金星与炫彩星共用
const STAR = 'M16 2.4l4.2 8.7 9.4 1.3-6.8 6.6 1.7 9.4L16 23.8l-8.5 4.6 1.7-9.4-6.8-6.6 9.4-1.3z'

function GoldStar({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7c2" />
          <stop offset=".45" stopColor="#ffd23e" />
          <stop offset="1" stopColor="#e07f08" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${uid}g)`} stroke="#6e4200" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12.6" cy="11.6" r="1.7" fill="#fffbe6" opacity=".9" />
    </svg>
  )
}

function RainbowStar({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className="star-icon rainbow" aria-hidden>
      <defs>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4d6d" />
          <stop offset=".22" stopColor="#ff9f43" />
          <stop offset=".42" stopColor="#ffe74c" />
          <stop offset=".62" stopColor="#6ee7b7" />
          <stop offset=".8" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#b78bff" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${uid}r)`} stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function Moon({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`${uid}m`} cx=".32" cy=".28" r="1.05">
          <stop offset="0" stopColor="#fdfbff" />
          <stop offset=".55" stopColor="#ccd8f4" />
          <stop offset="1" stopColor="#8aa0cf" />
        </radialGradient>
        <mask id={`${uid}mm`}>
          <rect width="32" height="32" fill="#fff" />
          <circle cx="22" cy="12.4" r="9.6" fill="#000" />
        </mask>
      </defs>
      <circle cx="16" cy="16" r="11" fill={`url(#${uid}m)`} mask={`url(#${uid}mm)`} />
      <g mask={`url(#${uid}mm)`}>
        <circle cx="12.4" cy="17.6" r="1.7" fill="rgba(96,116,168,.42)" />
        <circle cx="16.8" cy="21.4" r="1.2" fill="rgba(96,116,168,.4)" />
        <circle cx="10.8" cy="13.2" r="1" fill="rgba(96,116,168,.35)" />
      </g>
    </svg>
  )
}

function Earth({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`${uid}e`} cx=".35" cy=".28" r="1.05">
          <stop offset="0" stopColor="#8fd8ff" />
          <stop offset=".5" stopColor="#2f83e6" />
          <stop offset="1" stopColor="#0b3f8f" />
        </radialGradient>
        <clipPath id={`${uid}ec`}><circle cx="16" cy="16" r="11" /></clipPath>
      </defs>
      <circle cx="16" cy="16" r="11" fill={`url(#${uid}e)`} />
      <g clipPath={`url(#${uid}ec)`}>
        <path d="M6.5 13c2.2-2.6 4.6-2.2 6-.6 1.2 1.4 3.4 1 4.6 2.4 1 1.2-.4 2.6-2.6 2.8-2 .2-3.2 1.6-5.2 1.2-2.2-.4-3.8-2-2.8-5.8z" fill="#57c76a" />
        <path d="M18.5 7.5c2.8-.6 5.6.8 6.4 3 .6 1.8-1 2.4-2.8 2-1.6-.4-2.6.8-4.2.2-1.8-.8-1.8-4.4.6-5.2z" fill="#57c76a" />
        <path d="M13 22.5c2-.8 4.6-.2 5.6 1 1 1.2-.4 2.6-2.4 2.8-2 .2-4.6-1.6-3.2-3.8z" fill="#57c76a" />
        <ellipse cx="12" cy="10.5" rx="6.5" ry="2" fill="#ffffff" opacity=".2" transform="rotate(-18 12 10.5)" />
        <ellipse cx="21" cy="21.5" rx="5.5" ry="1.7" fill="#ffffff" opacity=".16" transform="rotate(-14 21 21.5)" />
      </g>
      <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(150,215,255,.55)" strokeWidth=".9" />
    </svg>
  )
}

function Sun({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`${uid}s`} cx=".5" cy=".5" r=".62">
          <stop offset="0" stopColor="#fff9d0" />
          <stop offset=".55" stopColor="#ffc531" />
          <stop offset="1" stopColor="#ff8a00" />
        </radialGradient>
      </defs>
      <g fill="#ffb02e">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M14.6 6.8L17.4 6.8 16 1.2z" transform={`rotate(${i * 30} 16 16)`} opacity={i % 2 ? 0.75 : 1} />
        ))}
      </g>
      <circle cx="16" cy="16" r="8.6" fill={`url(#${uid}s)`} />
      <circle cx="16" cy="16" r="8.6" fill="none" stroke="rgba(255,214,120,.7)" strokeWidth="1" />
    </svg>
  )
}

function Eclipse({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${uid}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset=".5" stopColor="#ff7a29" />
          <stop offset="1" stopColor="#c9273c" />
        </linearGradient>
      </defs>
      <g fill="#ff8a3c">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M14.8 5.2L17.2 5.2 16 .6z" transform={`rotate(${i * 30 + 15} 16 16)`} opacity=".8" />
        ))}
      </g>
      <circle cx="16" cy="16" r="11.4" fill="none" stroke={`url(#${uid}c)`} strokeWidth="2.6" />
      <circle cx="16" cy="16" r="9.4" fill="#0a0612" />
      <circle cx="16" cy="16" r="9.4" fill="none" stroke="rgba(140,70,220,.4)" strokeWidth=".8" />
    </svg>
  )
}

function Universe({ uid, size }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`${uid}u`} cx=".5" cy=".5" r=".7">
          <stop offset="0" stopColor="#3b1a6e" />
          <stop offset=".6" stopColor="#221048" />
          <stop offset="1" stopColor="#100528" />
        </radialGradient>
        <linearGradient id={`${uid}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a5cff" />
          <stop offset="1" stopColor="#ff6ec7" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="12.4" fill={`url(#${uid}u)`} />
      <g fill="none" stroke={`url(#${uid}a)`} strokeWidth="2.4" strokeLinecap="round">
        <path d="M16 16c3.6-4.2 9.4-3.4 9.6 1.4" />
        <path d="M16 16c-3.6 4.2-9.4 3.4-9.6-1.4" />
        <path d="M16 16c2.4 2.8 1.4 7-2.4 8" opacity=".75" />
        <path d="M16 16c-2.4-2.8-1.4-7 2.4-8" opacity=".75" />
      </g>
      <circle cx="16" cy="16" r="2.2" fill="#fff6d8" />
      <g fill="#ffffff">
        <circle cx="22.4" cy="10.2" r=".9" />
        <circle cx="9.6" cy="21.8" r=".9" />
        <circle cx="24.6" cy="20.4" r=".7" opacity=".85" />
        <circle cx="7.8" cy="12" r=".7" opacity=".85" />
        <circle cx="18.4" cy="23.6" r=".6" opacity=".7" />
        <circle cx="12.6" cy="8.4" r=".6" opacity=".7" />
      </g>
    </svg>
  )
}

const ICONS = {
  rainbow: RainbowStar,
  moon: Moon,
  earth: Earth,
  sun: Sun,
  eclipse: Eclipse,
  universe: Universe,
}

// 同档图标并排的数量：N 个就画 N 个；N 越多单个越小，保证永远一排不换行
const FIT = [1, 1, 0.94, 0.86, 0.78, 0.72, 0.66, 0.61, 0.57, 0.53]

// 卡面右上角徽章。size 是段位图标的基准边长；金星一格约 0.42 倍
// compact：用于图鉴小格子，整体更小一号
export function StarBadge({ stars, size = 26, compact = false }) {
  const rank = starRank(stars)
  const uid = useId().replace(/:/g, '')
  if (!rank) return null

  if (rank.key === 'supreme') {
    return <span className="star-supreme" title={rank.tip}>至高</span>
  }

  if (rank.key === 'star') {
    // 一整颗 = 1 级：有几颗画几颗，永远单排
    const pips = Math.min(rank.pips, 9)
    const pip = Math.round(size * (pips <= 5 ? 0.42 : 0.34) * (compact ? 1.5 : 1))
    return (
      <span className="star-rank" title={rank.tip}>
        {Array.from({ length: pips }, (_, i) => <GoldStar key={i} uid={`${uid}${i}`} size={pip} />)}
      </span>
    )
  }

  // 段位图标：按倍率并排 N 个（不写 ×N），N 多时自动缩小保持一排
  const Icon = ICONS[rank.key]
  const n = Math.max(1, Math.min(rank.mult, 9))
  const iconSize = Math.max(compact ? 7 : 12, Math.round(size * FIT[n] * (compact ? 0.86 : 1)))
  return (
    <span className={`star-rank tier-${rank.key}`} title={rank.tip}>
      {Array.from({ length: n }, (_, i) => <Icon key={i} uid={`${uid}${i}`} size={iconSize} />)}
    </span>
  )
}
