import assert from 'node:assert/strict'
import { createTearGeometry, tearPeelSide } from '../src/holoPack/tearGeometry.js'

let checks = 0
const near = (actual, expected, message = '') => {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`)
}
const test = (name, run) => {
  run()
  checks++
  console.log(`PASS ${name}`)
}
const make = (overrides = {}) => createTearGeometry({
  width: 276, height: 400,
  start: { x: 138, y: 200 }, direction: { x: 1, y: 0 },
  ...overrides,
})

test('任意高度 × 横竖双向与四个斜向均可从触点撕到真实边缘', () => {
  for (const height of [160, 400]) {
    const width = height * 0.69
    for (const fraction of [0.03, 0.1, 0.5, 0.9, 0.97]) {
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const start = { x: width / 2, y: height * fraction }
        const g = make({ width, height, start, direction: { x, y } })
        assert.equal(g.tipU, 0)
        assert.equal(g.progress, 0)
        assert.deepEqual(g.toPack(0, 0), start)
        assert.ok(g.requiredDistance > 0 && g.requiredDistance <= g.forwardReach)
        const edge = g.toPack(g.forwardReach, 0)
        assert.ok(edge.x >= -1e-7 && edge.x <= width + 1e-7)
        assert.ok(edge.y >= -1e-7 && edge.y <= height + 1e-7)
        assert.ok(Math.min(Math.abs(edge.x), Math.abs(edge.x - width), Math.abs(edge.y), Math.abs(edge.y - height)) < 1e-7)
        g.advance(g.toPack(g.requiredDistance * 0.4, 0))
        near(g.progress, 0.4, '未达门槛不提交')
        g.advance(edge)
        near(g.progress, 1, '到边缘可完成')
      }
    }
  }
})

test('中点与整宽手势沿用旧版距离口径，斜向使用真实射线出边点', () => {
  near(make().requiredDistance, 138 * 0.85)
  near(make({ start: { x: 0, y: 200 } }).requiredDistance, 276 * 0.62)
  const diagonal = make({ start: { x: 250, y: 10 }, direction: { x: 1, y: -1 } })
  near(diagonal.forwardReach, Math.sqrt(200))
  near(diagonal.requiredDistance, diagonal.forwardReach)
  assert.ok(diagonal.forwardReach < diagonal.maxU)
})

test('剥离较近的包装边，左右/上下反向手势仍带走同一物理侧', () => {
  for (const fraction of [0.12, 0.85]) {
    for (const x of [-1, 1]) {
      const g = make({ start: { x: 138, y: 400 * fraction }, direction: { x, y: 0 } })
      const side = tearPeelSide(g)
      const peeledEdge = g.toPack(0, side > 0 ? g.minV : g.maxV)
      near(peeledEdge.y, fraction < 0.5 ? 0 : 400, '水平撕的实体剥离边')
    }
    for (const y of [-1, 1]) {
      const g = make({ start: { x: 276 * fraction, y: 200 }, direction: { x: 0, y } })
      const side = tearPeelSide(g)
      const peeledEdge = g.toPack(0, side > 0 ? g.minV : g.maxV)
      near(peeledEdge.x, fraction < 0.5 ? 0 : 276, '竖直撕的实体剥离边')
    }
  }
  assert.equal(tearPeelSide(make()), 1, '等距时稳定选择 minV 侧')
})

test('往返抖动不累积、不覆盖已撕轨迹，只有新的前进更新刀尖', () => {
  const g = make()
  g.advance(g.toPack(25, 3))
  const before = g.points.map((p) => ({ ...p }))
  for (const u of [24, 5, -8, 24, 0, 25]) assert.equal(g.advance(g.toPack(u, 90)), false)
  near(g.tipU, 25)
  near(g.progress, 25 / g.requiredDistance)
  assert.deepEqual(g.points, before)
  assert.equal(g.advance(g.toPack(26, 7)), true)
  near(g.at(g.tipU), 7)
})

test('轨迹插值与首尾斜率外延保留实际 v，未采样刀尖仍实时跟随', () => {
  const g = make()
  assert.equal(g.at(-50), 0)
  assert.equal(g.at(500), 0)
  for (const [u, v] of [[8, 2], [16, 6], [24, 5]]) g.advance(g.toPack(u, v))
  near(g.at(12), 4)
  near(g.at(-8), -2)
  near(g.at(32), 4)
  g.advance(g.toPack(25, 8))
  near(g.at(25), 8)
  g.advance(g.toPack(26, 9))
  near(g.at(26), 9)
  assert.ok(g.points.every((p, i) => i === 0 || p.u > g.points[i - 1].u))
})

test('窄屏及四边向外的极短手势有可达门槛，边界触点不自动开包', () => {
  const width = 112
  const height = 162
  for (const [start, direction] of [
    [{ x: 0.01, y: 80 }, { x: -1, y: 0 }],
    [{ x: width - 0.01, y: 80 }, { x: 1, y: 0 }],
    [{ x: 56, y: 0.01 }, { x: 0, y: -1 }],
    [{ x: 56, y: height - 0.01 }, { x: 0, y: 1 }],
    [{ x: 0, y: 80 }, { x: -1, y: 0 }],
    [{ x: width, y: height }, { x: 1, y: 1 }],
  ]) {
    const g = make({ width, height, start, direction })
    assert.equal(g.progress, 0)
    assert.ok(g.requiredDistance <= g.forwardReach)
    assert.equal(g.advance(start), false)
    assert.equal(g.progress, 0)
    g.advance(g.toPack(g.requiredDistance + 0.01, 0))
    assert.equal(g.progress, 1)
  }
})

test('任意方向正交归一，投影与逆变换一致，百分比保留包外遮罩外延', () => {
  for (const direction of [{ x: 3, y: 4 }, { x: -4, y: 3 }, { x: 0, y: -2 }, { x: -8, y: -9 }]) {
    const start = { x: 81, y: 310 }
    const g = make({ start, direction })
    near(Math.hypot(g.axis.x, g.axis.y), 1)
    near(Math.hypot(g.normal.x, g.normal.y), 1)
    near(g.axis.x * g.normal.x + g.axis.y * g.normal.y, 0)
    near(Math.cos(g.angle * Math.PI / 180), g.axis.x)
    near(Math.sin(g.angle * Math.PI / 180), g.axis.y)
    for (const point of [{ x: 0, y: 0 }, { x: 276, y: 400 }, { x: 100, y: 265 }, { x: -10, y: 450 }]) {
      const u = (point.x - start.x) * g.axis.x + (point.y - start.y) * g.axis.y
      const v = (point.x - start.x) * g.normal.x + (point.y - start.y) * g.normal.y
      const restored = g.toPack(u, v)
      near(restored.x, point.x)
      near(restored.y, point.y)
      const percent = g.toPercent(u, v)
      near(percent[0], point.x / 276 * 100)
      near(percent[1], point.y / 400 * 100)
    }
  }
})

test('长轨迹采样有界、刀尖保真，并且重放结果确定', () => {
  const a = make({ width: 8000, height: 12000, start: { x: 100, y: 6000 } })
  const b = make({ width: 8000, height: 12000, start: { x: 100, y: 6000 } })
  for (let u = 1; u <= 5000; u++) {
    const v = 20 * Math.sin(u / 80)
    for (const g of [a, b]) {
      g.advance(g.toPack(u, v))
      assert.ok(g.points.length <= 40)
      assert.ok(g.points.every((p, i) => i === 0 || p.u > g.points[i - 1].u))
      near(g.at(g.tipU), v)
    }
  }
  assert.deepEqual(a.points, b.points)
  near(a.progress, b.progress)
  near(a.tipU, 5000)
  assert.deepEqual(a.points[0], { u: 0, v: 0 })
})

test('无效尺寸/方向拒绝，非有限指针事件不损坏已有轨迹', () => {
  assert.throws(() => make({ width: 0 }), RangeError)
  assert.throws(() => make({ height: Infinity }), RangeError)
  assert.throws(() => make({ direction: { x: 0, y: 0 } }), RangeError)
  assert.throws(() => make({ start: { x: NaN, y: 0 } }), TypeError)
  const g = make()
  assert.equal(g.advance({ x: Infinity, y: 0 }), false)
  assert.deepEqual(g.points, [{ u: 0, v: 0 }])
  assert.equal(g.progress, 0)
})

console.log(`tear geometry: ${checks} checks passed`)
