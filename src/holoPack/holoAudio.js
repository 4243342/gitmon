// 全息卡包音效（移植自 akasakariko/frontend-components 的 holo-card-pack，MIT）
//
// 全部用 Web Audio 现场合成，不带任何音频文件：
//  - 铝箔撕声：折痕逐个崩开的密集短噪，手快就是一声长撕
//  - 玩具钢片琴 / 小嗓音：五声音阶，叠在一起也不会打架
// 浏览器要求用户手势后才能出声，所以 AudioContext 由调用方在第一次点击时创建。

const VOLUME = 0.8
// 五声音阶（C 大调五声）上的音高表
const note = (i) => 440 * 2 ** ((72 + 12 * ((i / 5) | 0) + [0, 2, 4, 7, 9][i % 5] - 69) / 12)

export function createHoloAudio({ muted = false } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  let ctx
  try {
    ctx = new AC({ latencyHint: 'interactive' })
  } catch {
    return null
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const rand = (a, b) => a + Math.random() * (b - a)
  const sr = ctx.sampleRate
  const now = () => ctx.currentTime

  const master = ctx.createGain()
  const limit = ctx.createDynamicsCompressor()
  const room = ctx.createConvolver()
  const wet = ctx.createGain()
  Object.entries({ threshold: -9, knee: 6, ratio: 8, attack: 0.002, release: 0.1 }).forEach(([k, v]) => { limit[k].value = v })
  master.gain.value = muted ? 0 : VOLUME
  wet.gain.value = 0.3
  master.connect(limit).connect(ctx.destination)
  room.connect(wet).connect(master)

  const sheet = (channels, seconds, fill) => {
    const b = ctx.createBuffer(channels, (seconds * sr) | 0, sr)
    for (let c = 0; c < channels; c++) fill(b.getChannelData(c))
    return b
  }
  const hiss = sheet(1, 2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 })
  // 铝箔：几百个极短的爆点，多数很轻，少数很响 —— 每一下就是一道折痕裂开
  const foil = sheet(1, 2, (d) => {
    for (let n = 0; n < 900; n++) {
      const start = (Math.random() * (d.length - 400)) | 0
      const amp = Math.random() ** 3 * (Math.random() < 0.5 ? -1 : 1)
      const len = (30 + Math.random() * 260) | 0
      for (let i = 0; i < len; i++) d[start + i] += amp * (Math.random() * 2 - 1) * Math.exp((-i / len) * 5)
    }
  })
  // 一点点房间残响：一间小而亮的屋子，越响越暗
  room.buffer = sheet(2, 0.9, (d) => {
    let soft = 0
    for (let i = 0; i < d.length; i++) {
      const k = i / d.length
      soft += (Math.random() * 2 - 1 - soft) * (0.5 - 0.42 * k)
      d[i] = soft * (1 - k) ** 3
    }
  })

  const env = (param, at, peak, attack, dur) => {
    param.setValueAtTime(0.0001, at)
    param.exponentialRampToValueAtTime(peak, at + attack)
    param.exponentialRampToValueAtTime(0.0001, at + dur)
  }
  const out = (node, send) => {
    node.connect(master)
    if (send) { const s = ctx.createGain(); s.gain.value = send; node.connect(s).connect(room) }
  }
  // 一团塑过形的声音
  function air({ at = now(), buffer = hiss, type = 'bandpass', from, to, Q = 1, gain, attack = 0.004, dur, send = 0, pan = [0, 0], bell = false }) {
    const s = ctx.createBufferSource()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    s.buffer = buffer
    s.loop = true
    f.type = type
    f.Q.value = Q
    f.frequency.setValueAtTime(from, at)
    f.frequency.exponentialRampToValueAtTime(to, at + dur)
    if (bell) g.gain.setValueCurveAtTime(Float32Array.from({ length: 48 }, (_, i) => gain * Math.sin((Math.PI * i) / 47) ** 2), at, dur)
    else env(g.gain, at, gain, attack, dur)
    if (pan.length > 2) p.pan.setValueCurveAtTime(pan, at, dur)
    else { p.pan.setValueAtTime(pan[0], at); p.pan.linearRampToValueAtTime(pan[1], at + dur) }
    s.connect(f).connect(g).connect(p)
    out(p, send)
    s.start(at, Math.random() * 1.8)
    s.stop(at + dur + 0.02)
  }
  // 钢片琴：基音 + 两个衰减更快的泛音
  function chime(freq, { at = now(), gain = 0.1, dur = 0.5, send = 0.5, pan = 0 } = {}) {
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    g.gain.value = gain
    p.pan.value = pan
    g.connect(p)
    out(p, send)
    for (const [ratio, level, life] of [[1, 1, 1], [3.9, 0.18, 0.22], [9.2, 0.05, 0.08]]) {
      const o = ctx.createOscillator()
      const a = ctx.createGain()
      const d = Math.max(0.03, dur * life)
      o.frequency.value = freq * ratio
      env(a.gain, at, level, 0.002, d)
      o.connect(a).connect(g)
      o.start(at)
      o.stop(at + d + 0.02)
    }
  }
  // 小嗓音：一条音高轮廓
  function coo(freq, shape, { at = now(), gain = 0.06, attack = 0.008, wobble = 0, send = 0.25, pan = 0, wave = 'triangle' } = {}) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    const dur = shape.at(-1)[0] + 0.05
    o.type = wave
    p.pan.value = pan
    for (const [s, m] of shape) {
      if (s) o.frequency.exponentialRampToValueAtTime(freq * m, at + s)
      else o.frequency.setValueAtTime(freq * m, at)
    }
    env(g.gain, at, gain, attack, dur)
    if (wobble) {
      const l = ctx.createOscillator()
      const d = ctx.createGain()
      l.frequency.value = 24
      d.gain.value = freq * wobble
      l.connect(d).connect(o.frequency)
      l.start(at)
      l.stop(at + dur + 0.02)
    }
    o.connect(g).connect(p)
    out(p, send)
    o.start(at)
    o.stop(at + dur + 0.02)
  }
  const sparkle = (n, at, spread, level) => {
    for (let i = 0; i < n; i++) chime(note(8 + ((Math.random() * 5) | 0)), { at: at + Math.random() ** 1.4 * spread, gain: level * (0.6 + Math.random() * 0.8), dur: 0.35, send: 0.9, pan: Math.random() * 1.4 - 0.7 })
  }

  // 撕声本身一直挂着，只是停在静音，直到手动了才出声
  const ripBody = ctx.createBufferSource()
  const ripShape = ctx.createBiquadFilter()
  const ripTop = ctx.createBiquadFilter()
  const ripGain = ctx.createGain()
  ripBody.buffer = foil
  ripBody.loop = true
  ripShape.type = 'bandpass'
  ripShape.Q.value = 0.6
  ripTop.type = 'lowpass'
  ripTop.frequency.value = 6000
  ripGain.gain.value = 0
  ripBody.connect(ripShape).connect(ripTop).connect(ripGain)
  out(ripGain, 0.12)
  ripBody.start()
  let level = 0

  const api = {
    ctx,
    setMuted(off) {
      master.gain.setTargetAtTime(off ? 0 : VOLUME, now(), 0.015)
    },
    resume() {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    },
    // v 是撕的力度：慢是零星脆响，快是一道长撕
    rip(v, at = now()) {
      v = clamp(v, 0, 1)
      if (Math.abs(v - level) < 0.01 && (v || !level)) return
      const rising = v > level
      level = v
      ripGain.gain.setTargetAtTime(v ** 0.8 * 0.15, at, rising ? 0.008 : 0.05)
      ripShape.frequency.setTargetAtTime(1800 + 2000 * v, at, 0.02)
      ripBody.playbackRate.setTargetAtTime(0.7 + 0.8 * v, at, 0.02)
    },
    grab(at = now()) { air({ at, buffer: foil, from: 3000, to: 2200, Q: 0.7, gain: 0.3, attack: 0.003, dur: 0.09 }) },
    eep(at = now()) { coo(1250, [[0, 0.82], [0.05, 1.25], [0.13, 1.02]], { at, gain: 0.05, wobble: 0.04 }) },
    phew(at = now()) { coo(900, [[0, 1.1], [0.24, 0.6]], { at, gain: 0.05, send: 0.45 }); air({ at, from: 1500, to: 700, Q: 0.6, gain: 0.03, attack: 0.02, dur: 0.26 }) },
    boing(at = now()) { coo(340, [[0, 0.8], [0.05, 1.6], [0.12, 0.85], [0.2, 1.25], [0.3, 1]], { at, gain: 0.12, send: 0.2 }) },
    pop(flies, at = now()) {
      air({ at, from: 5000, to: 1800, Q: 0.9, gain: 0.14, attack: 0.002, dur: 0.1 })
      coo(300, [[0, 0.8], [0.05, 3.4]], { at, gain: 0.3, send: 0.15 })
      if (!flies) return
      air({ at: at + 0.01, from: 500, to: 3200, Q: 0.8, gain: 0.09, attack: 0.2, dur: 0.7, send: 0.6 })
      coo(540, [[0, 1], [0.6, 3]], { at: at + 0.02, gain: 0.03, attack: 0.22, wobble: 0.012, send: 0.6 })
      sparkle(3, at + 0.12, 0.5, 0.018)
    },
    // 卡片绕着转圈散开：一阵左右扫的风，收尾时越来越紧
    swirl(len, at = now()) {
      air({ at, from: 700, to: 1800, Q: 0.9, gain: 0.12, attack: len * 0.4, dur: len, send: 0.4, pan: Float32Array.from({ length: 64 }, (_, i) => { const u = i / 63; return Math.cos((1 - (1 - u) ** 2) * Math.PI * 2.5) * (1 - u) * 0.8 }) })
    },
    // 纸落在桌上：整排安静地落下，只有一张最好的是有响的
    land(name, slot, at = now()) {
      air({ at, from: 2600, to: 1300, Q: 0.6, gain: 0.07, attack: 0.002, dur: 0.05 })
      if (name === 'nova') coo(659, [[0, 0.94], [0.035, 1]], { at: at + 0.06, gain: 0.04, attack: 0.006, send: 0.06, pan: (slot - 2) * 0.18, wave: 'sine' })
    },
    // 卡片被拎起来：一口很闷很软的气
    lift(slot, at = now()) {
      const side = (slot - 2) * 0.18
      air({ at, type: 'lowpass', from: 760, to: 480, Q: 0.3, gain: 0.0449, bell: true, dur: 0.22, pan: [side, side] })
    },
    // 卡片翻面：纸面擦过的一声
    flip(slot, at = now()) {
      const side = (slot - 2) * 0.16
      air({ at, buffer: foil, from: 2600, to: 1400, Q: 0.8, gain: 0.12, attack: 0.002, dur: 0.11, pan: [side, side] })
      chime(note(6 + (slot % 3)), { at: at + 0.05, gain: 0.05, dur: 0.3, send: 0.5, pan: side })
    },
    tick(at = now()) { coo(880, [[0, 0.9], [0.05, 1.12]], { at, gain: 0.04, send: 0 }) },
    arrive(at = now()) {
      air({ at, from: 900, to: 2600, gain: 0.06, attack: 0.3, dur: 0.75, send: 0.4, pan: [0.7, 0] })
      air({ at: at + 0.72, buffer: foil, from: 3000, to: 2200, Q: 0.7, gain: 0.16, attack: 0.003, dur: 0.09 })
      coo(note(3), [[0, 0.9], [0.05, 1.03]], { at: at + 0.78, gain: 0.05 })
      coo(note(5), [[0, 0.9], [0.06, 1.03]], { at: at + 0.87, gain: 0.05 })
    },
    destroy() {
      try { ripBody.stop() } catch { /* 已经停了 */ }
      try { ctx.close() } catch { /* 关不掉就算了 */ }
    },
  }
  return api
}
