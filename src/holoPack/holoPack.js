// 全息 3D 卡包引擎
//
// 移植自开源项目 akasakariko/frontend-components 的 holo-card-pack（MIT）。
// 面向 GitMon 的改造点：
//  - 卡面换成 GitMon 自己的立绘与品质信息
//  - 卡片按品质决定出场方式：普通品质直接亮面，高品质背朝上落位再翻开
//  - 撕口、封口压齿、彩虹流、彩纸保留原来的物理手感
//
// 引擎自己管 DOM，不依赖 React：挂到容器上，吐事件。

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const rand = (a, b) => a + Math.random() * (b - a)

/* 弹簧，SwiftUI 的 (response, bounce) 映射 */
class Spring {
  constructor(x, response = 0.5, bounce = 0) {
    this.x = x
    this.to = x
    this.v = 0
    this.set(response, bounce)
  }
  set(response, bounce = 0) {
    this.k = (2 * Math.PI / response) ** 2
    this.c = (4 * Math.PI * (1 - bounce)) / response
    return this
  }
  step(h) {
    this.v += (this.k * (this.to - this.x) - this.c * this.v) * h
    this.x += this.v * h
  }
}
const pose = (o, response, bounce) => {
  for (const k in o) o[k] = new Spring(o[k], response, bounce)
  return o
}

const poly = (a) => `polygon(${a.map(([x, y]) => `${(+x).toFixed(2)}% ${(+y).toFixed(2)}%`).join(',')})`
const mirror = (a) => a.map(([x, y]) => [100 - x, y])
// 沿撕口的一条窄带，宽度就是每处露出的金属量
const band = (a, sign) => [...a, ...a.slice().reverse().map((q) => [q[0], q[1] + sign * q[4]])]
const svgURL = (s) => `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${s}</svg>")`

/* 每包的光影现画：封口下被折痕挤出的高光、底封口处一团揉皱的阴影 */
function paintLight(st) {
  const f = (n) => n.toFixed(2)
  let lit = ''
  let dark = 'M0 93.2V91.6'
  for (let x = 0; x < 100; ) {
    const w = rand(0.5, 2.6)
    lit += `<rect x='${f(x)}' y='6.8' width='${f(w)}' height='${f(rand(3.2, 8.5))}' fill='url(%23g)' fill-opacity='${f(rand(0.08, 0.42))}'/>`
    x += w + rand(0, 1.4)
  }
  for (let x = 0; x < 100; ) {
    const w = rand(2.5, 7)
    const peak = x + w * rand(0.35, 0.65)
    x = Math.min(100, x + w)
    dark += `Q${f(peak)} ${f(rand(86.6, 90))} ${f(x)} ${f(rand(91.1, 91.7))}`
  }
  st.setProperty('--hp-shine', svgURL(`<linearGradient id='g' x2='0' y2='1'><stop stop-color='%23fff' stop-opacity='.7'/><stop offset='1' stop-color='%23fff' stop-opacity='0'/></linearGradient><filter id='b'><feGaussianBlur stdDeviation='.28 .5'/></filter><g filter='url(%23b)'>${lit}</g>`))
  st.setProperty('--hp-shade', svgURL(`<filter id='b'><feGaussianBlur stdDeviation='.35 .24'/></filter><path d='${dark}V93.2Z' fill-opacity='.1' filter='url(%23b)'/>`))
}

const SKINS = [
  ['Cobalt', '#2b3ff0'],
  ['Ember', '#f0542c'],
  ['Grape', '#7a42f0'],
  ['Pine', '#0e9c79'],
  ['Night', '#23273d'],
  ['Bubblegum', '#ec4f9a'],
]

const shuffle = (a) => {
  for (let i = a.length; i > 1; ) {
    const j = (Math.random() * i--) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function createHoloPack(root, options = {}) {
  const { cards = [], onReady, onTear, onSpread, onPick, audio = null, packColor = null, series = null } = options

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const handheld = matchMedia('(pointer: coarse)').matches

  root.innerHTML = `
    <div class="hp-scene" data-scene>
      <div class="hp-flow" data-flow><svg class="hp-rays" data-rays viewBox="0 0 100 76"></svg></div>
      <div class="hp-pack" data-pack>
        <div class="hp-skin front" data-skin-front>
          <span class="hp-tag">Tear here ⟶</span>
          <span class="hp-lips"><i class="hp-lip" data-lip></i></span>
          <b class="hp-mark">GITMON</b>
          <span class="hp-series" data-series>Series 01</span>
          <div class="hp-orb">
            <i class="hp-orb-body"></i>
            <i class="hp-eye l"><i class="hp-pupil"></i></i>
            <i class="hp-eye r"><i class="hp-pupil"></i></i>
            <i class="hp-smile"></i>
            <i class="hp-ouch"></i>
            <i class="hp-drip"></i>
          </div>
          <span class="hp-foot l">Card pack</span>
          <span class="hp-foot r" data-count>${cards.length} cards</span>
        </div>
        <div class="hp-skin back" data-skin-back>
          <i class="hp-fin"></i><b class="hp-mark sm">GITMON</b>
          <p class="hp-blurb">${cards.length} collectible cards<br>Every project becomes one</p>
          <i class="hp-code"></i>
        </div>
        <div class="hp-flap" data-flap></div>
        <button class="hp-hit" data-hit type="button" aria-label="卡包：拖动顶部撕开"></button>
      </div>
    </div>
    <canvas class="hp-fx" data-fx></canvas>
  `
  const q = (sel) => root.querySelector(sel)
  const scene = q('[data-scene]')
  const pack = q('[data-pack]')
  const flap = q('[data-flap]')
  const hit = q('[data-hit]')
  const flow = q('[data-flow]')
  const rays = q('[data-rays]')
  const fx = q('[data-fx]')
  const fxc = fx.getContext('2d')
  const skins = [q('[data-skin-front]'), q('[data-skin-back]')]
  const bodyLip = q('[data-lip]')
  const seriesEl = q('[data-series]')
  const countEl = q('[data-count]')
  const eyes = [...pack.querySelectorAll('.hp-eye')]
  const pupils = [...pack.querySelectorAll('.hp-pupil')]

  const ground = document.createElement('i')
  ground.className = 'hp-ground'
  scene.append(ground)

  const TEAR = 10.5
  const N = 96
  const K = handheld ? 8 : 12
  const Y_MIN = 8
  const Y_MAX = 19.5
  const P = pose({ x: 0, y: 0, rx: 0, ry: 0, rz: 0 }, 0.7, 0.28)
  const eye = pose({ x: 0, y: 0 }, 0.18, 0.3)
  const tear = { p: new Spring(0, 0.1), th: new Spring(0, 0.28, 0.35), ph: new Spring(0, 0.3, 0.2), dir: 1, last: 0 }
  const squeeze = new Spring(0, 0.3, 0.45)
  const glow = new Spring(0, 0.5)
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, in: false, tap: false }
  let anchor = { y: 0, rz: 0, rx: 0, ry: 0, sq: 0 }
  let state = 'enter'
  let settle = null
  let jag = []
  let fall = null
  let fly = null
  let drag = null
  let wasDrag = false
  let cardList = []
  let bits = []
  let spreadAt = 0
  let calm = false
  let t = 0
  let last = performance.now()
  let openedAt = 0
  let blinkAt = 2.5
  let nudgeAt = 5
  let PW = 1
  let PH = 1
  let skin = null
  let destroyed = false
  let raf = 0

  const BIT = [new Path2D(), new Path2D(), new Path2D('M0-6 1.3-1.3 6 0 1.3 1.3 0 6-1.3 1.3-6 0-1.3-1.3Z')]
  BIT[0].arc(0, 0, 4.5, 0, 7)
  BIT[1].roundRect(-3.5, -6, 7, 12, 2)
  let fxUsed = false

  const measure = () => {
    PW = pack.offsetWidth || 1
    PH = pack.offsetHeight || 1
    const d = Math.min(handheld ? 1.5 : 2, devicePixelRatio || 1)
    fx.width = innerWidth * d
    fx.height = innerHeight * d
  }

  /* ---------- 撕口 ---------- */
  /* 每次撕口都不一样：怎么起伏、怎么抖、在哪儿卡住。每点记录
     [x, y, 线本身的高度, 细齿, 露出多少金属, 手把它掰弯了多少]，单位都是包高的百分比 */
  const place = (q, bend) => {
    q[5] = bend
    q[1] = clamp(q[2] + bend, Y_MIN, Y_MAX) + q[3]
  }
  function path() {
    tear.roll = rand(0.65, 1.4)
    const slope = rand(-7.5, 7.5)
    const bow = rand(-3, 3)
    const freq = rand(1.5, 3.5)
    const ph = rand(0, 6.28)
    const wob = rand(0.3, 1.1)
    const y0 = rand(10.5, 14)
    let walk = 0
    jag = Array.from({ length: N + 1 }, (_, i) => {
      const x = (i / N) * 100
      const s = x / 50 - 1
      walk = clamp(walk + rand(-0.25, 0.25) + (Math.random() < 0.05 ? rand(-1.5, 1.5) : 0), -2.2, 2.2)
      const q = [
        i && i < N ? x + rand(-0.3, 0.3) : x,
        0,
        y0 + slope * s + bow * (1 - s * s) + wob * Math.sin(s * freq * Math.PI + ph) + walk,
        rand(-0.42, 0.42) + (Math.random() < 0.14 ? rand(-1.2, 1.2) : 0),
        Math.random() < 0.12 ? rand(1.2, 2.1) : rand(0.35, 1.1),
        0,
      ]
      place(q, 0)
      return q
    })
  }
  // 没撕的部分跟着手走：往下拽就往下沉，往上拽就往上翘。已经撕开的部分保持原样
  function steer(k) {
    const d = tear.dir
    const i0 = clamp(Math.round((d > 0 ? tear.p.x : 1 - tear.p.x) * N), 0, N)
    for (let i = i0 + d; i >= 0 && i <= N; i += d) place(jag[i], jag[i0][5] + k * Math.abs(i - i0) * 100 / N)
  }
  const yAt = (x) => {
    const f = (clamp(x, 0, 100) / 100) * N
    const i = Math.min(N - 1, f | 0)
    return jag[i][1] + (jag[i + 1][1] - jag[i][1]) * (f - i)
  }

  // 撕口条：沿长度切成 K 片，每片比上一片弯得更狠，长度越长卷得越紧
  const plies = Array.from({ length: K }, () => {
    const el = document.createElement('div')
    el.className = 'hp-ply'
    el.hidden = true
    el.innerHTML = '<div class="hp-skin front"><span class="hp-tag">Tear here ⟶</span><i class="hp-lip"></i><i class="hp-tone"></i></div><div class="hp-skin foil"><i class="hp-tone"></i></div>'
    flap.append(el)
    const [front, foil] = el.children
    return { el, front, foil, lip: front.querySelector('.hp-lip'), shade: front.querySelector('.hp-tone'), under: foil.querySelector('.hp-tone'), done: false }
  })

  function clips(p) {
    const d = tear.dir
    const xt = d > 0 ? p * 100 : 100 - p * 100
    const yt = yAt(xt)
    const tip = [xt, yt, 0, 0, 0]
    const torn = jag.filter(([x]) => (d > 0 ? x < xt : x > xt))
    const rest = d > 0
      ? [[xt, 0], [100, 0], [100, 100], [0, 100], ...torn, [xt, yt]]
      : [[0, 0], [xt, 0], [xt, yt], ...torn, [100, 100], [0, 100]]
    skins[0].style.clipPath = poly(rest)
    skins[1].style.clipPath = poly(mirror(rest))
    bodyLip.style.clipPath = poly(band(d > 0 ? [...torn, tip] : [tip, ...torn], 1))
    for (const r of rims) {
      const side = r.s > 0 ? 100 : 0
      if (d > 0 ? side <= xt : side >= xt) r.el.style.top = `${Math.max(r.top, yAt(side) + 1.4).toFixed(2)}%`
    }
    flap.style.transformOrigin = `${xt}% ${yt}%`
    const w = 100 / K
    const lap = 0.25
    plies.forEach((s, k) => {
      const lo = d > 0 ? k * w : Math.max(k * w, xt)
      const hi = d > 0 ? Math.min((k + 1) * w, xt) : (k + 1) * w
      if (hi <= lo) { s.el.hidden = true; return }
      s.el.hidden = false
      if (s.done) return
      const L = d < 0 && lo === xt ? lo : Math.max(0, lo - lap)
      const R = d > 0 && hi === xt ? hi : Math.min(100, hi + lap)
      const span = [[L, yAt(L), 0, 0, 0.8], ...jag.filter((q) => q[0] > L && q[0] < R), [R, yAt(R), 0, 0, 0.8]]
      const piece = [[L, 0], [R, 0], ...span.slice().reverse()]
      s.front.style.clipPath = poly(piece)
      s.foil.style.clipPath = poly(mirror(piece))
      s.lip.style.clipPath = poly(band(span, -1))
      s.done = d > 0 ? hi < xt || xt >= 100 : lo > xt || xt <= 0
    })
    // 从断口往外，每道折得比上一道更狠
    const k0 = clamp(Math.floor((d > 0 ? xt - 1e-6 : xt) / w), 0, K - 1)
    const bend = (2.6 + 2.6 * p) * tear.roll
    const jit = Math.min(1, Math.abs(tear.p.v) * 0.4) * 1.6
    let m = ''
    let sum = 0
    for (let n = 0, k = k0; k >= 0 && k < K; n++, k -= d) {
      const x = (((n ? (d > 0 ? k + 1 : k) * w : xt) / 100) * PW).toFixed(2)
      const a = d * (bend * (0.4 + 0.3 * n) + Math.sin(t * 16 + n * 0.9) * jit)
      const s = plies[k]
      sum += a
      m += `translateX(${x}px) rotateY(${a.toFixed(2)}deg) rotateZ(${((d * 0.9 * n) / 4).toFixed(2)}deg) translateX(-${x}px) `
      s.el.style.transform = m
      s.shade.style.opacity = Math.min(0.5, Math.abs(sum) / 200).toFixed(2)
      s.under.style.opacity = Math.max(0, 0.34 - Math.abs(sum) / 420).toFixed(2)
    }
  }

  const start = () => {
    if (pack.classList.contains('hp-hurt')) return
    audio?.eep?.()
    flap.classList.add('on')
    pack.classList.remove('hp-tug')
    pack.classList.add('hp-held', 'hp-hurt')
  }
  const finish = (response) => {
    tear.p.set(response)
    tear.p.to = 1
    tear.th.to = rand(14, 30)
    tear.ph.to = -rand(20, 44)
  }

  hit.addEventListener('pointerdown', (e) => {
    if (e.button || drag) return
    if (state === 'enter') {
      clearTimeout(settle)
      state = 'idle'
      squeeze.v -= 6
      for (const s of Object.values(P)) s.set(0.28, 0.25)
    }
    if (state !== 'idle') return
    hit.setPointerCapture(e.pointerId)
    audio?.grab?.()
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: tear.p.to, moved: false, lx: e.clientX, lt: e.timeStamp }
  })
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag?.id || state !== 'idle') return
    if (e.pointerType === 'mouse' && !e.buttons) return letGo(e)
    const dx = e.clientX - drag.x0
    let dy = e.clientY - drag.y0
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return
      drag.moved = true
      tear.p.set(0.1)
      pack.classList.add('hp-tug')
    }
    if (tear.p.to === 0) {
      // 手真的横着走才撕，之前只是拽了拽包
      drag.dy = dy
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 0.5) return
      tear.dir = dx < 0 ? -1 : 1
      drag.y0 = e.clientY
      dy = 0
    }
    start()
    tear.p.to = clamp(drag.p0 + (drag.p0 ? Math.abs(dx) : dx * tear.dir) / (PW * 0.85), tear.p.to, 1)
    tear.th.to = 6 + tear.p.to * 14 + clamp(-dy * 0.16, -6, 22)
    tear.ph.to = -(8 + tear.p.to * 22) - clamp(-dy * 0.2, 0, 24)
    drag.k = (drag.k || 0) + (clamp(dy / Math.max(60, Math.abs(dx)), -0.7, 0.7) * (PW / PH) - (drag.k || 0)) * 0.3
    steer(drag.k)
  })
  const letGo = (e) => {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return
    wasDrag = drag.moved
    drag = null
    if (!wasDrag || state !== 'idle') return
    if (tear.p.to > 0.55) return finish(0.18)
    audio?.[pack.classList.contains('hp-hurt') ? 'phew' : 'boing']?.()
    pack.classList.remove('hp-held', 'hp-hurt', 'hp-tug')
    tear.th.to = 3 + tear.p.to * 10
    tear.ph.to = -tear.p.to * 14
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) hit.addEventListener(type, letGo)
  hit.addEventListener('click', (e) => {
    if (wasDrag && e.detail) { wasDrag = false; return }
    if (state !== 'idle') return
    if (!tear.p.to) tear.dir = Math.random() < 0.5 ? -1 : 1
    start()
    finish(tear.p.to ? 0.18 : 0.55)
  })

  /* ---------- 侧边鼓起 ---------- */
  /* 侧边是一条条沿深度叠出来的，每条往外推一点、往后站矮一点，
     边缘于是从正面滚开、鼓起来，再收进上下两道封口 */
  const rims = []
  for (const s of [-1, 1]) {
    for (const deg of [80, 60, 40, 20, 0, -20, -40, -60, -80]) {
      const a = (deg * Math.PI) / 180
      const back = (1 - Math.sin(a)) / 2
      const o = 4
      const b = 5 * Math.cos(a)
      const el = document.createElement('i')
      const edge = Array.from({ length: 13 }, (_, i) => [((o + b * Math.sin((Math.PI * i) / 12) ** 0.8) / (o + b)) * 100, (i / 12) * 100])
      const shape = [[0, 0], ...edge, [0, 100]]
      const tone = s > 0 ? `#000 ${(10 + back * 40).toFixed(0)}%` : `#fff ${(45 * (1 - back)).toFixed(0)}%`
      el.className = 'hp-rim'
      el.style.cssText = `${s > 0 ? 'left' : 'right'}:calc(50% + var(--hp-pw)*.476 - ${o}px);width:${(o + b).toFixed(2)}px;top:${(11.5 + back * 13).toFixed(2)}%;bottom:${(11.5 + back * 13).toFixed(2)}%;transform:translateZ(calc(var(--hp-d)*${(Math.sin(a) / 2).toFixed(3)}));clip-path:${poly(s > 0 ? shape : mirror(shape))};background:color-mix(in srgb,var(--hp-pack),${tone})`
      pack.insertBefore(el, flap)
      rims.push({ el, s, top: 11.5 + back * 13 })
    }
  }

  /* ---------- 彩虹流 ---------- */
  /* 撕开的那一段整个涌出一把彩带：彩带之间没有缝，七色循环排开。
     所有彩带都从包下方一个点呈扇形射出，正中间的直上，两边的斜着飞。
     每条边都是一道往外走的波，所以整把彩带是"流"的；
     每条带子离开口子时白热，往上渐渐褪掉，中间还有光尘在飘。
     SVG 单位里撕口在 y=60，彩带起点在撕口之下（被包装挡住），
     撕到哪儿哪儿才开始涌，最后整把带子跟着尾巴冲出屏幕顶端。 */
  const BANDS = ['#ff3d6e', '#ff8a3d', '#ffd34d', '#4fd9a0', '#4fb2ff', '#8b6cff', '#ff5cc8']
  const NR = 28
  const CY = 107.5
  const STEP = handheld ? 3.5 : 2.5
  const SPAN = 1500
  const TIP = 36
  const tint = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('')
  const ribbonPath = (a, b) => `M${a.join('L')}L${b.slice().reverse().join('L')}Z`
  let lines = []
  let ribbons = []
  let motes = []
  let bandEls = []
  let edgeEls = []
  let stops = []
  let reach = 0
  let drained = false
  let Y0 = 62.5
  let R0 = 45

  function sprout() {
    const k0 = rand(0, 7) | 0
    const u = PW / 100
    Y0 = 62.5 + ((Y_MAX - TEAR) / 100) * PH / u
    R0 = CY - Y0
    lines = Array.from({ length: NR + 1 }, (_, j) => {
      const ox = 3 + (94 * j) / NR
      const x = 50 + ((ox - 50) * R0) / 45
      const a = Math.atan2(x - 50, R0) + rand(-0.012, 0.012)
      return { ox, x, ux: Math.sin(a), uy: -Math.cos(a), ph: j * 0.35 + rand(-0.1, 0.1), r: Math.hypot(x - 50, R0) }
    })
    ribbons = Array.from({ length: NR }, (_, j) => {
      const r = (lines[j].r + lines[j + 1].r) / 2
      return {
        mx: (lines[j].ox + lines[j + 1].ox) / 2,
        gx: (lines[j].x + lines[j + 1].x) / 2,
        r,
        L: 0,
        c: BANDS[(j + k0) % 7],
        on: false,
        len: 0,
        g: new Spring(0, 0.4, reduce ? 0 : 0.3),
      }
    })
    rays.innerHTML = `<defs><radialGradient id="hp-mote"><stop offset=".2" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      ${ribbons.map((b, j) => {
        const ux = (lines[j].ux + lines[j + 1].ux) / 2
        const uy = (lines[j].uy + lines[j + 1].uy) / 2
        const hot = 32 + Y0 - 62.5
        return `<linearGradient id="hp-b${j}" gradientUnits="userSpaceOnUse" x1="${b.gx.toFixed(2)}" y1="${Y0}" x2="${(b.gx + ux * hot).toFixed(2)}" y2="${(Y0 + uy * hot).toFixed(2)}"><stop stop-color="${tint(b.c, 0.55)}"/><stop offset="1" stop-color="${b.c}"/></linearGradient>`
      }).join('')}
      <radialGradient id="hp-fade-g" gradientUnits="userSpaceOnUse" cx="50" cy="${Y0 + R0}" r="${SPAN}"><stop stop-color="#fff" stop-opacity="0"/><stop stop-color="#fff"/><stop stop-color="#fff"/><stop stop-color="#fff" stop-opacity="0"/></radialGradient>
      <mask id="hp-fade" maskUnits="userSpaceOnUse"><rect fill="url(#hp-fade-g)"/></mask>
      <filter id="hp-bloom" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.4"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g${handheld ? '' : ' filter="url(#hp-bloom)"'}><g${handheld ? '' : ' mask="url(#hp-fade)"'}>${ribbons.map((b, j) => `<path class="hp-band" fill="url(#hp-b${j})"/>`).join('')}
      ${handheld ? '' : `<g fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".4">${'<path class="hp-edge"/>'.repeat(NR + 1)}</g>`}${'<circle class="hp-mote" fill="url(#hp-mote)"/>'.repeat(10)}</g></g>`
    bandEls = [...rays.querySelectorAll('.hp-band')]
    edgeEls = [...rays.querySelectorAll('.hp-edge')]
    stops = [...rays.querySelectorAll('#hp-fade-g stop')]
    motes = [...rays.querySelectorAll('.hp-mote')].map((el) => ({ el, j: -1, u: Math.random(), v: rand(0.2, 0.8), sp: rand(0.3, 0.5), r: rand(1.6, 3) }))
    fit()
  }

  // 依赖窗口尺寸的部分：窗口变了、手机转了，整把彩带依然要够到屏幕顶端
  function fit() {
    const u = PW / 100
    const room = 2.5 + (innerHeight / 2 - PH * (0.5 - TEAR / 100)) / u
    const w = Math.min(innerWidth / 2 / u, room * 1.2 + 60) + 20
    reach = reduce ? 45 + room * 0.6 : (45 + room) * Math.hypot(47 / 45, 1) + TIP + 20
    for (const b of ribbons) b.L = reach - b.r
    const box = { x: 50 - w, y: 32.5 - room, width: 2 * w, height: room + 60 }
    for (const el of rays.querySelectorAll('#hp-fade,#hp-fade rect,#hp-bloom')) {
      for (const k in box) el.setAttribute(k, box[k].toFixed(1))
    }
  }

  function pour(dt) {
    const ft = reduce ? 0 : t
    const xt = tear.dir > 0 ? tear.p.x * 100 : 100 - tear.p.x * 100
    const sway = Math.sin(ft * 0.9) * 1.5
    const go = !reduce && (state === 'open' || state === 'spread')
    const s = t - openedAt
    const u = PW / 100
    const a = anchor.rz * (Math.PI / 180)
    const roof = 60 + ((-innerHeight / 2 - anchor.y) / Math.cos(a) + PH * (0.5 - TEAR / 100)) / u
    const soft = TIP
    // 甩出去：前沿离开口子很快，冲出屏幕顶端才慢下来，最外侧的带子也一样；
    // 尾巴紧跟在后面，整把带子不到一秒就冲完
    const full = ((Y0 + R0 - roof) * ribbons[0].r) / R0 + soft + 20
    const far = go ? reach + (full - reach) * (1 - (1 - Math.min(1, s / 0.5)) ** 2) : reach
    const tail = R0 - 5 + (go ? (full + 21 - R0) * clamp((s - 0.35) / 0.55, 0, 1) ** 2 : 0)
    const carry = go ? (45 * s * s) / (s + 0.25) : 0
    for (const b of ribbons) {
      if (state === 'idle' && tear.p.x > 0 && (tear.dir > 0 ? b.mx < xt : b.mx > xt)) b.on = true
      b.g.to = b.on ? 1 : 0
      b.len = b.L * Math.max(0, b.g.x) + far - reach
    }
    if (!handheld) {
      ;[tail - 16, tail, far - soft, far].forEach((o, i) => stops[i].setAttribute('offset', clamp(Math.min(o, far) / SPAN, 0, 1).toFixed(4)))
    }
    // 沿第 j 条边走 d 距离的点：沿边方向推进，横向被一道越走越大的波推开
    const at = (j, d) => {
      const e = lines[j]
      const k = Math.min(1, d / 90)
      const w = (0.4 + 2 * k) * Math.sin(((d - carry) / 22 - ft * 1.4) * 2 * Math.PI + e.ph) + sway * k
      return [e.x + e.ux * d - e.uy * w, Y0 + e.uy * d + e.ux * w]
    }
    // 每条边每帧只算一次，两侧的带子共用，距离始终一致，接缝不会裂开；
    // 算到屏幕边缘外一点就停，没人看得见
    const lead = handheld ? 0 : 20
    const side = innerWidth / 2 / u + 14
    const fix = (v) => Math.round(v * 20) / 20
    const edges = lines.map((e, j) => {
      const stop = Math.min((Y0 - roof) / -e.uy, (side - Math.abs(e.x - 50)) / Math.abs(e.ux)) + 24
      const len = Math.min(Math.max(ribbons[j - 1]?.len || 0, ribbons[j]?.len || 0), stop)
      const i0 = Math.max(0, Math.floor((tail - lead - e.r) / STEP))
      const pts = []
      if (len > i0 * STEP) {
        for (let i = i0; ; i++) {
          const d = Math.min(i * STEP, len)
          const [x, y] = at(j, d)
          pts.push(`${fix(x)} ${fix(y)}`)
          if (d >= len) break
        }
      }
      return { i0, pts }
    })
    const upto = (e, len) => e.pts.slice(0, Math.max(0, Math.ceil(len / STEP) - e.i0 + 1))
    ribbons.forEach((b, j) => {
      const A = upto(edges[j], b.len)
      const B = upto(edges[j + 1], b.len)
      bandEls[j].setAttribute('d', A.length > 1 && B.length > 1 ? ribbonPath(A, B) : '')
    })
    edgeEls.forEach((el, j) => { el.setAttribute('d', edges[j].pts.length > 1 ? `M${edges[j].pts.join('L')}` : '') })
    drained = go && s > 0.9
    const out = ribbons.flatMap((b, j) => (b.on ? [j] : []))
    for (const m of motes) {
      if (!reduce) m.u += dt * m.sp
      if (m.u > 1 || !ribbons[m.j]?.on) {
        if (m.u > 1) m.u -= 1
        if (!out.length) { m.el.setAttribute('opacity', 0); continue }
        m.j = out[rand(0, out.length) | 0]
      }
      const len = ribbons[m.j].len
      const d0 = Math.max(0, tail - lines[m.j].r)
      const d = d0 + m.u * (len - d0)
      const [x1, y1] = at(m.j, d)
      const [x2, y2] = at(m.j + 1, d)
      m.el.setAttribute('cx', (x1 + (x2 - x1) * m.v).toFixed(2))
      m.el.setAttribute('cy', (y1 + (y2 - y1) * m.v).toFixed(2))
      m.el.setAttribute('r', (m.r * (0.6 + m.u * 0.7)).toFixed(2))
      m.el.setAttribute('opacity', (Math.sin(Math.PI * m.u) * Math.min(1, len / 20)).toFixed(2))
    }
  }

  /* ---------- 彩纸 ---------- */
  /* 彩纸是静止空气里的纸：重力往下拉，阻力跟速度平方走，
     所以爆开的力道一过就飘起来，落得又慢又歪 */
  function loadBits() {
    for (let i = 0; i < (handheld ? 130 : 240); i++) bits.push({ kind: i % 3, fill: [...BANDS, '#fff'][i % 8] })
  }
  function burst() {
    bits.forEach((b, i) => {
      if (b.age !== undefined) return
      const lx = rand(6, 94)
      const vt = 260 + 400 * Math.random() ** 1.5
      Object.assign(b, {
        inside: true, lx, ly: yAt(lx) + rand(1, 16), lz: rand(4.6, 7),
        up: rand(900, 2600), a: ((lx - 50) / 50 + rand(-0.5, 0.5)) * clamp(innerWidth / 1000, 0.5, 1),
        sp: rand(500, 2700), r: rand(0, 360), spin: rand(-700, 700), c: 2600 / vt / vt,
        slip: rand(900, 2600), glide: Math.sign(lx - 50) * rand(-200, 900), sc: rand(0.9, 1.9),
        ph: rand(0, 6.28), age: i < 50 ? 0 : -rand(0, 0.22),
      })
      b.x = b.y = b.z = 0
    })
  }
  // 包内一点（百分比坐标 + 穿透深度）换算成舞台坐标
  function onStage(lx, ly, lz) {
    const R = Math.PI / 180
    const cx = Math.cos(P.rx.x * R)
    const sx = Math.sin(P.rx.x * R)
    const cy = Math.cos(P.ry.x * R)
    const sy = Math.sin(P.ry.x * R)
    const cz = Math.cos(P.rz.x * R)
    const sz = Math.sin(P.rz.x * R)
    const x0 = ((lx - 50) / 100) * PW
    const y0 = ((ly - 50) / 100) * PH
    const x1 = x0 * cz - y0 * sz
    const y1 = x0 * sz + y0 * cz
    const x2 = x1 * cy + lz * sy
    const z2 = -x1 * sy + lz * cy
    return [x2 + P.x.x, y1 * cx - z2 * sx + P.y.x + (fall ? fall.y : 0), y1 * sx + z2 * cx]
  }

  /* ---------- 卡牌 ---------- */
  const ORBIT = 1.25
  const ease = (a, b, x) => {
    const k = clamp((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)
  }

  function cardHTML(c) {
    const face = `<div class="hp-face"><div class="hp-win">${c.art ? `<img src="${c.art}" alt=""${c.smooth ? ' class="smooth"' : ''}/>` : ''}<i class="hp-drop"></i></div><b class="hp-name">${c.name}</b><span class="hp-type">${c.type}</span><i class="hp-rule"></i><span class="hp-no">No. ${c.no}</span><span class="hp-rar">${c.mark} ${c.label}</span><i class="hp-holo"></i><i class="hp-glare"></i><i class="hp-glaze"></i></div>`
    // 普通品质的卡直接亮面；高品质的先背面朝上，落定后再翻过来
    if (!c.flip) return `<i class="hp-slab"></i><i class="hp-slab"></i><i class="hp-slab"></i>${face}`
    return `<i class="hp-slab"></i><i class="hp-slab"></i><i class="hp-slab"></i><div class="hp-flip">${face}<div class="hp-back"><b class="hp-back-mark">GITMON</b><span class="hp-back-sub">Card pack</span></div></div>`
  }

  // 牌堆散开：先绕着屏幕中心转一圈，再摊成一行
  function unwind() {
    spreadAt = t
    scene.classList.add('flat')
    audio?.swirl?.(ORBIT)
    for (const c of cardList) {
      const p = c.p
      const f = (c.f = fan(c))
      Object.assign(c, {
        phase: 'orbit',
        from: t + c.i * 0.03,
        x0: p.x.x,
        y0: p.y.x,
        vy: p.y.v,
        rz0: p.rz.x,
        even: (-c.slot * 2 * Math.PI) / cardList.length,
        end: Math.PI / 2 - (c.slot - (cardList.length - 1) / 2) * 0.55,
      })
      c.landAt = c.from + ORBIT
      p.s.to = f.s
      for (const k in p) if (k !== 's') { p[k].k = 0; p[k].c = 0; p[k].v = 0 }
    }
  }

  function orbit(c) {
    const p = c.p
    const f = c.f
    const u = clamp((t - c.from) / ORBIT, 0, 1)
    const turn = 1 - (1 - u) ** 2
    const out = ease(0.52, 1, u)
    const ring = Math.sin(Math.min(1, u / 0.42) * (Math.PI / 2)) * (1 - out)
    const a = c.end + (1 - turn) * (c.even - c.end + Math.PI * 2.5)
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    const W = Math.min(innerWidth * 0.33, 430)
    const mid = c.y0 + (c.vy / 9) * (1 - Math.exp(-9 * Math.max(0, t - c.from)))
    const cy = mid + (-innerHeight * 0.03 - mid) * ease(0, 0.42, u)
    p.x.x = c.x0 * (1 - out) + f.x * out + cos * W * ring
    p.y.x = cy * (1 - out) + f.y * out + sin * W * 0.2 * ring
    p.z.x = f.z * out + sin * 300 * ring
    p.rz.x = c.rz0 * (1 - out) + f.rz * out - cos * 8 * ring
    p.ry.x = -cos * 26 * ring
    p.rx.x = 7 * ring
    if (u === 1) {
      c.phase = 'spread'
      c.el.classList.add('hp-out')
      for (const k in p) p[k].set(0.5, 0.22)
      audio?.land?.(c.key, c.slot)
    }
  }

  // 卡牌摊开的落位。宽屏排一行，竖屏排成上下两行，像摊在桌上
  function fan(c) {
    const n = cardList.length
    const m = c.slot - (n - 1) / 2
    const cw = c.el.offsetWidth || 1
    const vw = innerWidth
    if (innerHeight > vw * 1.15) {
      const w = Math.min((vw - 34) / 2, (innerHeight - 150) / 2.72 / 1.4, cw)
      // 五张：两上、两下、中间一张；少的时候按行列排
      const layout = n === 5
        ? [[-1, -1, -4], [1, -1, 4], [0, 0, 0], [-1, 1, 3], [1, 1, -3]]
        : n === 4
          ? [[-1, -1, -4], [1, -1, 4], [-1, 1, 3], [1, 1, -3]]
          : n === 3
            ? [[-1, 0, -3], [0, 0, 0], [1, 0, 3]]
            : n === 2
              ? [[-1, 0, -3], [1, 0, 3]]
              : [[0, 0, 0]]
      const [X, Y, rz] = layout[c.slot] || [0, 0, 0]
      return { x: X * (w / 2 + 5), y: -15 + Y * w * 1.4 * 0.86, z: X || Y ? 0 : 40, rz, s: w / cw }
    }
    if (n === 1) return { x: 0, y: -innerHeight * 0.03, z: 40, rz: 0, s: 1 }
    const s = clamp((vw - 48) / (cw * (1 + (n - 1) * 1.08)), 0.6, 1)
    const w = cw * s
    const side = Math.min(w * 1.08, (vw - 40 - w) / (n - 1))
    const tight = side < w
    const ends = (n - 1) / 2
    const lean = ends * 7 * (Math.PI / 180)
    const near = 1400 / (1400 - ends * 40)
    const gap = tight ? Math.max(6, Math.min(side, (vw / 2 - 8 - (w / 2 * Math.cos(lean) + w * 0.7 * Math.sin(lean)) * near) / (ends * near))) : side
    return { x: m * gap, y: -innerHeight * 0.03 + m * m * (tight ? 9 : 5) * s, z: tight ? m * 40 : 0, rz: m * (tight ? 7 : 2), s }
  }

  // 指针落在哪张卡上：按卡牌最终落位算，不按当前运动位置算，
  // 否则被抬起的卡会从指针底下滑走，边缘每一条缝还会各自抢一次
  function aimed() {
    let best = null
    for (const c of cardList) {
      if (c.phase !== 'spread') continue
      const f = c.f
      const near = 1400 / (1400 - f.z)
      const a = (f.rz * Math.PI) / 180
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      const w = PW * 0.84 * f.s * near
      const h = w * 1.4
      const dx = pointer.x - (innerWidth / 2 + f.x * near)
      const dy = pointer.y - (innerHeight * 0.4 + (innerHeight * 0.1 + f.y) * near)
      const hx = (dx * cos + dy * sin) / w + 0.5
      const hy = (dy * cos - dx * sin) / h + 0.5
      if (hx >= 0 && hx <= 1 && hy >= 0 && hy <= 1 && (!best || f.z >= best.f.z)) {
        best = c
        c.hx = hx
        c.hy = hy
      }
    }
    return best
  }

  function spawn() {
    cardList = shuffle([...cards]).map((d, i) => {
      const el = document.createElement('div')
      el.className = `hp-card hp-${d.tier || 'common'}${d.flip ? ' hp-flip-card' : ''}`
      el.innerHTML = cardHTML(d)
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', `${d.name}，${d.label}`)
      el.style.zIndex = cards.length - i
      scene.append(el)
      const c = {
        el,
        d,
        i,
        key: d.key,
        slot: i,
        no: `${String(i + 1).padStart(2, '0')}/${String(cards.length).padStart(2, '0')}`,
        face: el.querySelector('.hp-face'),
        flip: el.querySelector('.hp-flip'),
        revealed: false,
        phase: 'in',
        hover: false,
        hx: 0.5,
        hy: 0.5,
        p: pose({ x: P.x.x, y: P.y.x + PH * ((Math.max(...jag.map((q) => q[1])) + 0.8 + 38.2) / 100 - 0.5), z: 3.5 - i * 1.75, rx: 0, ry: 0, rz: P.rz.x, s: 0.94 }, 0.55, 0.22),
      }
      el.addEventListener('click', () => {
        if (c.phase === 'spread') onPick?.(c.d)
      })
      return c
    })
    for (const c of cardList.slice().reverse()) scene.append(c.el)
    if (reduce) {
      for (const c of cardList) {
        c.phase = 'spread'
        c.f = fan(c)
        c.el.classList.add('hp-out')
        for (const k in c.f) c.p[k].x = c.p[k].to = c.f[k]
      }
    }
  }

  /* ---------- 开包 ---------- */
  function open() {
    if (drag && hit.hasPointerCapture(drag.id)) hit.releasePointerCapture(drag.id)
    state = 'open'
    openedAt = t
    drag = null
    tear.p.x = tear.p.to = 1
    clips(1)
    hit.disabled = true
    onTear?.()
    P.rx.set(0.3)
    P.ry.set(0.3)
    P.rx.to = P.ry.to = 0
    if (reduce) {
      pack.style.visibility = flow.style.visibility = 'hidden'
      flap.className = 'hp-flap'
    } else {
      fly = { x: 0, y: 0, vx: tear.dir * 240, vy: -1900, th: tear.th.x, vth: 520, ph: tear.ph.x, vph: -320 }
      P.y.v += 320
      P.rz.v -= tear.dir * 40
      burst()
    }
    spawn()
    audio?.rip?.(0)
    audio?.pop?.(!reduce)
  }

  /* ---------- 每帧 ---------- */
  function frame(now) {
    if (destroyed) return
    if (handheld && now - last < (calm ? 30 : 14)) { raf = requestAnimationFrame(frame); return }
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    t += dt
    const motion = reduce ? 0 : 1
    const held = pack.classList.contains('hp-held')
    // 上下拽而不是横着撕，包会被拉长，松手弹回去
    const tug = motion && drag?.moved && !tear.p.to ? Math.sign(drag.dy) * 170 * (1 - 1 / (1 + Math.abs(drag.dy) / 170)) : 0
    squeeze.to = tug ? -Math.abs(tug) / 90 : held && state === 'idle' ? motion : 0

    if (state === 'enter' || state === 'idle') {
      const hold = drag?.moved ? 0.25 : 1
      const tilt = hold * (reduce ? 0.5 : 1)
      const nx = pointer.in ? clamp((pointer.x / innerWidth) * 2 - 1, -1, 1) : 0
      const ny = pointer.in ? clamp((pointer.y / innerHeight) * 2 - 1, -1, 1) : 0
      P.y.to = Math.sin(t * 1.4) * 7 * motion + tug
      P.ry.to = nx * 22 * tilt
      P.rx.to = -ny * 16 * tilt - squeeze.x * 6
      P.rz.to = Math.sin(t * 0.9) * 1.6 * motion - (held && tear.p.x > 0 ? tear.dir * tear.p.x * 3 : 0)
      // 放着不管就自己轻轻晃一下，撕了一半的还会把撕口条朝你甩
      if (state === 'idle' && !drag && tear.p.to < 1 && motion && t > nudgeAt) {
        P.rz.v += (Math.random() < 0.5 ? -1 : 1) * 70
        if (tear.p.to) tear.th.v += 120
        nudgeAt = t + rand(4, 7)
      }
    }
    if (t > blinkAt) {
      blinkAt = t + rand(2.2, 5.5)
      if (motion && !pack.classList.contains('hp-held')) {
        for (const e of eyes) e.animate([{ scale: '1 1' }, { scale: '1 .08' }, { scale: '1 1' }], { duration: 170, iterations: 1, easing: 'cubic-bezier(.77,0,.175,1)' })
      }
    }
    // 瞳孔跟着指针走
    {
      const dx = pointer.x - (innerWidth / 2 + P.x.x)
      const dy = pointer.y - (innerHeight / 2 + P.y.x - PH * 0.02)
      const dl = Math.hypot(dx, dy) || 1
      const k = pointer.in ? Math.min(1, dl / 260) * PW * 0.014 : 0
      eye.x.to = (dx / dl) * k
      eye.y.to = (dy / dl) * k
    }

    // 弹簧按小步推进，慢帧上也不会发散
    const springs = [...Object.values(P), ...Object.values(eye), tear.p, tear.th, tear.ph, squeeze, glow, ...ribbons.map((b) => b.g), ...cardList.flatMap((c) => Object.values(c.p))]
    const n = Math.ceil(dt * 240)
    const h = dt / n
    for (let i = 0; i < n; i++) for (const s of springs) s.step(h)

    if (state === 'idle' && tear.p.x > 0) {
      const p = Math.min(1, tear.p.x)
      const dp = p - tear.last
      tear.last = p
      // 铝箔多响取决于手多快：慢是零星脆响，快是一道长撕
      audio?.rip?.(dp > 0 ? (dp / Math.max(dt, 0.004) / 4) ** 0.6 : 0)
      if (dp > 0 && motion) {
        P.rz.v += rand(-1, 1) * Math.min(dp, 0.02) * 900
        P.y.v += dp * 420
        tear.th.v += dp * 300
        squeeze.v += dp * 20
        for (const b of ribbons) if (b.on) b.g.v += dp * 6
      }
      if (dp > 0 || Math.abs(tear.p.v) > 0.001) clips(p)
      const draft = drag ? 0 : motion * (Math.sin(t * 5.3) + Math.sin(t * 8.7) * 0.5)
      flap.style.transform = `rotateZ(${(tear.th.x + draft) * tear.dir}deg) rotateX(${tear.ph.x + draft * 1.5}deg)`
      if (p > 0.985 && tear.p.to >= 1) open()
    }
    // 撕开时彩带走起来，之后一路冲出屏幕顶端，直到最后一根也散尽
    glow.to = (state === 'idle' && tear.p.x > 0) || ((state === 'open' || state === 'spread') && !reduce && !drained) ? 1 : 0
    if (glow.x > 0.003 || glow.to) {
      rays.style.opacity = (glow.x * 0.86).toFixed(3)
      pour(dt)
    }
    if (fly) {
      fly.vy += 2600 * dt
      fly.x += fly.vx * dt
      fly.y += fly.vy * dt
      fly.th += fly.vth * dt
      fly.ph += fly.vph * dt
      flap.style.transform = `translate3d(${fly.x}px,${fly.y}px,0) rotateZ(${fly.th * tear.dir}deg) rotateX(${fly.ph}deg)`
      if (t - openedAt > 1.6) { fly = null; flap.className = 'hp-flap' }
    }
    if (state === 'open' && !fall && !reduce && t - openedAt > 0.02) fall = { y: 0, v: (1500 * PH) / 420 }
    if (fall && fall.y < innerHeight) { fall.v += 2800 * dt; fall.y += fall.v * dt; P.rz.to = tear.dir * 9 }

    if (pack.style.visibility !== 'hidden') {
      const fy = fall ? fall.y : 0
      pack.style.transform = `translate3d(${P.x.x}px,${P.y.x + fy}px,0) rotateX(${P.rx.x}deg) rotateY(${P.ry.x}deg) rotateZ(${P.rz.x}deg) scale3d(${1 + 0.03 * squeeze.x},${1 - 0.06 * squeeze.x},1)`
      if (!fall) {
        // 光从左上来：转过去时高光绕着左边缘走，同时变暗
        const ps = pack.style
        ps.setProperty('--hp-gx', clamp(-P.ry.x * 0.12, -1.5, 3).toFixed(2))
        ps.setProperty('--hp-gl', clamp(0.8 - P.ry.x * 0.012, 0.45, 1).toFixed(2))
        ps.setProperty('--hp-gm', clamp(50 + P.ry.x * 1.2, 20, 80).toFixed(1))
        ps.setProperty('--hp-gt', clamp(0.85 + P.rx.x * 0.015, 0.5, 1).toFixed(2))
        pack.style.setProperty('--hp-sh', clamp(P.ry.x * 1.2 + P.rx.x * 0.8, -22, 22).toFixed(1))
        for (const el of pupils) el.style.transform = `translate(${eye.x.x}px,${eye.y.x}px)`
      }
      if (fy > innerHeight) pack.style.visibility = 'hidden'
    }
    if (!fall) {
      anchor = { y: P.y.x, rz: P.rz.x, rx: P.rx.x, ry: P.ry.x, sq: squeeze.x }
      flow.style.transform = pack.style.transform
    } else if (Math.abs(anchor.rz) + Math.abs(anchor.rx) + Math.abs(anchor.sq) > 0.01) {
      // 包掉下去之后彩光幕自己站直
      const k = Math.exp(-dt / 0.05)
      anchor.rz *= k
      anchor.rx *= k
      anchor.ry *= k
      anchor.sq *= k
      flow.style.transform = `translate3d(${P.x.x}px,${anchor.y}px,0) rotateX(${anchor.rx}deg) rotateY(${anchor.ry}deg) rotateZ(${anchor.rz}deg) scale3d(${1 + 0.03 * anchor.sq},${1 - 0.06 * anchor.sq},1)`
    }
    ground.style.transform = `translate3d(${P.x.x}px,${PH / 2 + 26}px,0) scale(${1 - P.y.x / 300})`
    ground.style.opacity = state === 'enter' || state === 'idle' ? clamp(1 - Math.abs(P.x.x) / 300, 0, 1) : fall ? clamp(1 - fall.y / 160, 0, 1) : 0

    // 卡牌：牌堆沿着包壁被弹上去，外包装被甩掉时它们顺着出来，
    // 出来后各自散开，谁也不会从谁身上穿过去
    if (state === 'open' && !spreadAt && reduce) { spreadAt = t; scene.classList.add('flat') }
    if (state === 'open' && !spreadAt && !reduce && cardList.every((c) => c.phase === 'shot')) {
      const mouth = P.y.x + (fall ? fall.y : 0) + PH * (Math.max(...jag.map((q) => q[1])) / 100 - 0.5)
      const ch = PW * 1.176
      if (cardList.every((c) => c.p.y.x + ch * 0.36 < mouth)) unwind()
    }
    for (const c of cardList) if (c.phase === 'orbit') orbit(c)
    ;[...cardList].sort((a, b) => a.p.z.x - b.p.z.x).forEach((c, i) => { c.rank = i + 1 })
    const hot = pointer.in || pointer.tap ? aimed() : null
    const tall = innerHeight > innerWidth * 1.15
    pointer.tap = false
    for (const c of cardList) {
      const p = c.p
      const since = t - openedAt
      if (c.phase === 'in' && !reduce && since > c.i * 0.022) {
        c.phase = 'shot'
        p.s.to = 1
        p.y.k = 0
        p.y.c = 1.2
        p.y.v = -rand(1250, 1450) * (PH / 420)
      }
      if (c.phase === 'spread') {
        // 高品质的卡先背面朝上落位，隔一会儿再翻过来亮出正面
        if (c.flip && !c.revealed && t > c.landAt + 0.25 + c.slot * 0.12) {
          c.revealed = true
          c.flip.classList.add('shown')
          audio?.flip?.(c.slot)
        }
        if (c === hot) c.until = t + (pointer.touch ? 1.1 : 0)
        c.hover = c === hot || t < c.until
        const f = c.f
        const w = t * 0.8 + c.i * 1.9
        const on = c.hover
        if (on !== c.glad) { c.glad = on; audio?.lift?.(c.slot) }
        p.x.to = f.x
        p.s.to = f.s
        p.y.to = f.y + (on ? -16 : Math.sin(w * 1.2) * 5 * motion)
        p.z.to = f.z + (on ? 110 : 0)
        p.rz.to = on ? f.rz * 0.3 : f.rz
        p.rx.to = on ? (0.5 - c.hy) * 36 : Math.cos(w * 0.9) * 4 * motion
        p.ry.to = on ? (c.hx - 0.5) * 40 : Math.sin(w) * 8 * motion
      }
      // 在包里时卡牌跟着包的倾斜走，不会戳出包装；出来之后就是纸在空中的姿态
      const loose = c.phase === 'spread' || c.phase === 'orbit'
      const rx = loose ? p.rx.x - clamp(p.y.v * 0.006, -8, 8) : P.rx.x
      const ry = loose ? p.ry.x + clamp(p.x.v * 0.008, -12, 12) : P.ry.x
      c.el.style.transform = `translate3d(${p.x.x}px,${p.y.x}px,${p.z.x}px) rotateZ(${p.rz.x}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${p.s.x})`
      if (loose) c.up = c.hover || (c.up && p.z.x > c.f.z + 30)
      c.el.style.zIndex = c.up ? 9 : c.phase === 'orbit' || tall ? c.rank : cardList.length - c.i
      if (c.phase === 'spread') {
        // 箔面整张重画，卡牌在空气里停住，落定后再缓过来
        const a = reduce ? 1 : clamp((t - c.landAt - 0.2) / 0.5, 0, 1)
        if (a && (!handheld || c.up || a < 1)) {
          const nx = clamp(ry / 24, -1, 1) * a
          const ny = clamp(rx / 24, -1, 1) * a
          const st = c.face.style
          st.setProperty('--px', (50 + nx * 50).toFixed(1))
          st.setProperty('--py', (50 - ny * 50).toFixed(1))
          st.setProperty('--hyp', Math.min(1, Math.hypot(nx, ny)).toFixed(3))
        }
      }
    }
    if (state === 'open' && spreadAt && t > spreadAt + (reduce ? 0.1 : ORBIT + 0.3)) {
      state = 'spread'
      onSpread?.()
    }

    // 彩纸
    if (fxUsed) { fxc.setTransform(1, 0, 0, 1, 0, 0); fxc.clearRect(0, 0, fx.width, fx.height); fxUsed = false }
    const D = fx.width / innerWidth
    const ox = innerWidth / 2
    const oy = innerHeight * 0.4
    const R = Math.PI / 180
    bits = bits.filter((b) => {
      if (b.age === undefined || (b.age += dt) < 0) return true
      if (b.inside) {
        // 被包的正面挡住，冒过撕口之后才散开
        b.ly -= (b.up * dt * 100) / PH
        b.r += b.spin * dt
        if (b.ly > yAt(b.lx)) return true
        ;[b.x, b.y, b.z] = onStage(b.lx, b.ly, b.lz)
        b.inside = false
        b.age = 0
        b.r0 = b.r
        b.vx = Math.sin(b.a) * b.sp
        b.vy = -Math.cos(b.a) * b.sp
        b.vz = rand(0, 160)
      }
      b.z += b.vz * dt
      b.vy += 2600 * dt
      b.vx += (Math.sin(b.ph) * b.slip + b.glide) * dt
      // 一团一起飞出去的纸会互相穿，所以每片要等这团散开才吃满阻力
      const v = Math.hypot(b.vx, b.vy)
      const f = 1 / (1 + b.c * Math.min(1, 0.06 + b.age / 0.45) * v * dt)
      const turn = 0.35 + v / 800
      b.vx *= f
      b.vy *= f
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.r += b.spin * turn * dt
      b.ph += 7 * turn * dt
      if (b.y >= innerHeight / 2 + 40) return false
      const p = 1400 / (1400 - b.z)
      const k = D * p * b.sc
      const cr = Math.cos(b.r * R)
      const sr = Math.sin(b.r * R)
      const cq = Math.cos((b.r - b.r0) * 0.7 * R)
      fxc.setTransform(k * cr, k * sr, -k * sr * cq, k * cr * cq, (ox + b.x * p) * D, (oy + (innerHeight * 0.1 + b.y) * p) * D)
      fxc.fillStyle = b.fill
      fxc.fill(BIT[b.kind])
      fxUsed = true
      return true
    })
    calm = state === 'spread' && !bits.length && !cardList.some((c) => c.up || t < c.landAt + 1)
    raf = requestAnimationFrame(frame)
  }

  /* ---------- 全局事件 ---------- */
  const track = (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.in = true
    pointer.touch = e.pointerType !== 'mouse'
  }
  const onPointerMove = (e) => track(e)
  const onPointerDown = (e) => { track(e); pointer.tap = true }
  const onPointerLeave = () => { pointer.in = false }
  const onBlur = (e) => { letGo(e); pointer.in = false }
  const onResize = () => {
    if (!innerWidth || !innerHeight) return
    measure()
    fit()
    if (state === 'idle' && tear.p.x > 0) clips(Math.min(1, tear.p.x))
    for (const c of cardList) if (c.f) c.f = fan(c)
  }
  const onVisibility = () => { if (document.hidden) audio?.rip?.(0) }
  addEventListener('pointermove', onPointerMove)
  addEventListener('pointerdown', onPointerDown)
  document.documentElement.addEventListener('pointerleave', onPointerLeave)
  addEventListener('blur', onBlur)
  addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)

  /* ---------- 进场 ---------- */
  function enter() {
    state = 'enter'
    if (packColor) {
      skin = ['Custom', packColor]
    } else {
      const pool = SKINS.filter((s) => s !== skin)
      skin = pool[rand(0, pool.length) | 0]
    }
    seriesEl.textContent = series || skin[0]
    pack.style.setProperty('--hp-pack', skin[1])
    paintLight(pack.style)
    path()
    for (const s of skins) s.style.clipPath = ''
    bodyLip.style.clipPath = ''
    for (const s of plies) { s.el.hidden = true; s.done = false; s.el.style.transform = '' }
    for (const r of rims) r.el.style.top = `${r.top}%`
    flap.className = 'hp-flap'
    flap.style.transform = ''
    rays.style.cssText = ''
    rays.classList.remove('hp-rays-on')
    pack.style.visibility = flow.style.visibility = ''
    pack.classList.remove('hp-held', 'hp-hurt', 'hp-tug')
    scene.classList.remove('flat')
    sprout()
    if (!reduce) { loadBits(); audio?.arrive?.() }
    hit.disabled = false
    fall = fly = drag = null
    spreadAt = 0
    tear.last = 0
    tear.dir = 1
    for (const s of [tear.p, tear.th, tear.ph, squeeze, glow, ...Object.values(P)]) { s.x = s.to = s.v = 0 }
    for (const s of Object.values(P)) s.set(0.7, 0.28)
    if (!reduce) {
      Object.assign(P.x, { x: innerWidth * 0.62 })
      P.y.x = -50
      P.ry.x = -200
      P.rz.x = 16
    }
    settle = setTimeout(() => { state = 'idle' }, reduce ? 0 : 950)
    onReady?.()
  }

  measure()
  enter()
  raf = requestAnimationFrame(frame)

  return {
    // 一键开包：直接走完撕口
    autoTear() {
      if (state === 'enter') { clearTimeout(settle); state = 'idle' }
      if (state !== 'idle') return
      if (!tear.p.to) tear.dir = Math.random() < 0.5 ? -1 : 1
      start()
      finish(tear.p.to ? 0.18 : 0.55)
    },
    // 直接跳到"卡牌摊开"的状态
    skipToSpread() {
      if (state === 'enter') { clearTimeout(settle); state = 'idle' }
      if (state !== 'idle') return
      tear.p.x = tear.p.to = 1
      start()
      finish(0.3)
    },
    get state() { return state },
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      removeEventListener('pointermove', onPointerMove)
      removeEventListener('pointerdown', onPointerDown)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      removeEventListener('blur', onBlur)
      removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      root.innerHTML = ''
    },
  }
}
