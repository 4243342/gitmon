// 六维雷达图（纯 SVG，零依赖）
export default function RadarChart({ stats, size = 220, color = '#4a9eff' }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 34
  const N = stats.length
  const angle = (i) => (Math.PI * 2 * i) / N - Math.PI / 2
  const point = (i, v) => {
    const r = (v / 100) * R
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))]
  }

  const rings = [0.33, 0.66, 1]
  const valuePts = stats.map((s, i) => point(i, s.value).join(',')).join(' ')

  return (
    <svg width={size} height={size} className="radar">
      {rings.map((f) => (
        <polygon
          key={f}
          points={stats.map((_, i) => {
            const [x, y] = point(i, f * 100)
            return `${x},${y}`
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
        />
      ))}
      {stats.map((_, i) => {
        const [x, y] = point(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeOpacity="0.2" />
      })}
      <polygon points={valuePts} fill={color} fillOpacity="0.35" stroke={color} strokeWidth="2" />
      {stats.map((s, i) => {
        const [x, y] = point(i, 128)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
            {s.name} {s.value}
          </text>
        )
      })}
    </svg>
  )
}
