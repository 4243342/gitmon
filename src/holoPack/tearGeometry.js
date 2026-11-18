// 手势自己的坐标系：u 沿首次拖动方向，v 沿其法线。
// 不依赖 DOM，也不生成随机齿边；同一条指针轨迹产生同一条撕口。
const SAMPLE_STEP = 8
const MAX_POINTS = 40
const EPSILON = 1e-9

const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)

// 选离起点较近的包装边，手势反向时仍剥离同一块实体包装。
// 1 表示原法线的 minV 一侧，-1 表示 maxV 一侧。
export function tearPeelSide(geometry) {
  return Math.abs(geometry.minV) <= Math.abs(geometry.maxV) ? 1 : -1
}

// 射线真正离开矩形的距离。斜向时不能用包四角的最大投影代替：
// 从靠近上边的位置向右上撕，会先碰到上边，而不是最右的角。
function distanceToEdge(start, axis, width, height) {
  let enter = -Infinity
  let exit = Infinity
  for (const [position, direction, size] of [
    [start.x, axis.x, width],
    [start.y, axis.y, height],
  ]) {
    if (Math.abs(direction) < EPSILON) {
      if (position < 0 || position > size) return 0
      continue
    }
    const a = -position / direction
    const b = (size - position) / direction
    enter = Math.max(enter, Math.min(a, b))
    exit = Math.min(exit, Math.max(a, b))
  }
  return exit >= Math.max(0, enter) ? Math.max(0, exit) : 0
}

export function createTearGeometry({ width, height, start, direction }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Tear dimensions must be finite and positive')
  }
  if (!finitePoint(start) || !finitePoint(direction)) {
    throw new TypeError('Tear start and direction must be finite points')
  }
  const length = Math.hypot(direction.x, direction.y)
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError('Tear direction must have a nonzero finite length')
  }

  const origin = { x: start.x, y: start.y }
  const axis = Object.freeze({ x: direction.x / length, y: direction.y / length })
  const normal = Object.freeze({ x: -axis.y, y: axis.x })
  const project = ({ x, y }) => ({
    u: (x - origin.x) * axis.x + (y - origin.y) * axis.y,
    v: (x - origin.x) * normal.x + (y - origin.y) * normal.y,
  })
  const corners = [
    { x: 0, y: 0 }, { x: width, y: 0 },
    { x: width, y: height }, { x: 0, y: height },
  ].map(project)
  const minU = Math.min(...corners.map((p) => p.u))
  const maxU = Math.max(...corners.map((p) => p.u))
  const minV = Math.min(...corners.map((p) => p.v))
  const maxV = Math.max(...corners.map((p) => p.v))
  const span = maxU - minU
  const forwardReach = distanceToEdge(origin, axis, width, height)
  const requiredDistance = Math.min(
    forwardReach,
    Math.max(Math.min(span * 0.62, forwardReach * 0.85), span * 0.28),
  )
  const points = [{ u: 0, v: 0 }]
  let tipU = 0
  let progress = 0
  let anchorU = 0
  let sampleStep = SAMPLE_STEP

  const toPack = (u, v) => ({
    x: origin.x + axis.x * u + normal.x * v,
    y: origin.y + axis.y * u + normal.y * v,
  })

  function advance(point) {
    if (!finitePoint(point)) return false
    const next = project(point)
    // 回退或横向抖动既不累积进度，也不改写已经撕开的轨迹。
    if (next.u <= tipU + EPSILON) return false
    if (tipU > anchorU) points.pop()
    points.push(next)
    tipU = next.u
    progress = requiredDistance > 0 ? Math.min(1, tipU / requiredDistance) : 1
    if (tipU - anchorU >= sampleStep) anchorU = tipU

    // 保留起始/末端斜率与实时刀尖；长手势只逐步稀疏中间采样。
    if (points.length > MAX_POINTS) {
      const kept = points.filter((_, i) => i < 2 || i >= points.length - 2 || i % 2 === 0)
      points.splice(0, points.length, ...kept)
      sampleStep *= 2
    }
    return true
  }

  function at(u) {
    if (points.length === 1) return 0
    let left = 0
    let right = points.length - 1
    if (u <= points[0].u) right = 1
    else if (u >= points[right].u) left = right - 1
    else {
      while (right - left > 1) {
        const middle = (left + right) >> 1
        if (points[middle].u <= u) left = middle
        else right = middle
      }
    }
    const a = points[left]
    const b = points[right]
    return a.v + (u - a.u) * (b.v - a.v) / (b.u - a.u)
  }

  return {
    axis,
    normal,
    angle: Math.atan2(axis.y, axis.x) * 180 / Math.PI,
    minU, maxU, minV, maxV, span,
    forwardReach,
    requiredDistance,
    get tipU() { return tipU },
    get progress() { return progress },
    // 调用者只读此数组；最后一点始终是实际刀尖，不受采样间距限制。
    points,
    advance,
    at,
    toPack,
    toPercent(u, v) {
      const point = toPack(u, v)
      return [point.x / width * 100, point.y / height * 100]
    },
  }
}
