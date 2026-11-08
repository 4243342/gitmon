// 对战 BGM：WebAudio 现场合成的 8-bit 芯片音乐，零素材依赖
// 和 sfx.js 同源（方波/三角波 + 噪声），但走独立调度器：4 小节循环，16 分音符步进
// 结构 Am - F - C - G，主旋律琶音 + 走句贝斯 + 底鼓/军鼓/踩镲

const BPM = 152
const STEP = 60 / BPM / 4 // 16 分音符 ≈ 0.099s，64 步一轮 ≈ 6.3s
const LOOP = 64
const LEVEL = 0.8

// 每小节的低音根音与琶音音阶（MIDI 编号）
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] }, // Am
  { root: 41, tones: [53, 57, 60, 65] }, // F
  { root: 48, tones: [60, 64, 67, 72] }, // C
  { root: 43, tones: [55, 59, 62, 67] }, // G
]
// 16 步的主旋律取音顺序，来回跳进，像 FC 战斗曲的分解和弦
const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 1, 2, 3, 2, 0, 1, 2, 1]

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

let ctx = null
let filter = null
let master = null
let noiseBuf = null
let timer = null
let playing = false
let wanted = false
let nextTime = 0
let step = 0
let muted = localStorage.getItem('gitmon:muted') === '1'

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    // 芯片音高频刺耳，整体过一道低通收敛一点
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 5200
    filter.Q.value = 0.5
    master = ctx.createGain()
    master.gain.value = LEVEL
    filter.connect(master).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(type, freq, t, dur, vol, slideTo = 0) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
  o.connect(g).connect(filter)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noiseHit(t, { freq = 1900, q = 1, dur = 0.08, vol = 0.05, type = 'bandpass' } = {}) {
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate * 0.25)
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  const bq = ctx.createBiquadFilter()
  bq.type = type
  bq.frequency.value = freq
  bq.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
  src.connect(bq).connect(g).connect(filter)
  src.start(t)
  src.stop(t + dur + 0.01)
}

function playStep(i, t) {
  const bar = Math.floor(i / 16)
  const s = i % 16
  const chord = CHORDS[bar]

  // 贝斯：八分音符走根音，第 7/15 步跳八度，撑住战斗的推进感
  if (s % 2 === 0) tone('triangle', midi(chord.root), t, 0.15, 0.085)
  if (s === 7 || s === 15) tone('triangle', midi(chord.root + 12), t, 0.09, 0.05)

  // 主旋律：16 分音符琶音，每拍头加一层高八度点一下
  const note = chord.tones[ARP[s]]
  tone('square', midi(note), t, 0.075, 0.036)
  if (s % 4 === 0) tone('square', midi(note + 12), t, 0.05, 0.016)

  // 鼓组
  if (s === 0 || s === 6 || s === 8 || s === 14) tone('sine', 132, t, 0.15, 0.12, 46)
  if (s === 4 || s === 12) noiseHit(t, { freq: 1900, dur: 0.09, vol: 0.042 })
  if (s % 2 === 1) noiseHit(t, { freq: 7400, type: 'highpass', dur: 0.028, vol: 0.012 })
}

function tick() {
  if (!playing || !ctx) return
  while (nextTime < ctx.currentTime + 0.2) {
    playStep(step, nextTime)
    nextTime += STEP
    step = (step + 1) % LOOP
  }
}

function startLoop() {
  const c = ensure()
  if (!c || playing) return
  playing = true
  step = 0
  master.gain.cancelScheduledValues(c.currentTime)
  master.gain.setValueAtTime(0.0001, c.currentTime)
  master.gain.linearRampToValueAtTime(LEVEL, c.currentTime + 0.25)
  nextTime = c.currentTime + 0.06
  tick()
  timer = setInterval(tick, 40)
}

function stopLoop() {
  if (!playing) return
  playing = false
  if (timer) clearInterval(timer)
  timer = null
  if (!ctx) return
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
  master.gain.linearRampToValueAtTime(0.0001, now + 0.3)
}

// 结算是淡出后的独立音效，先把总音量拉回来
function reviveGain() {
  if (!ctx) return
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setValueAtTime(LEVEL, ctx.currentTime)
}

function arpeggio(notes, { type = 'square', gap = 0.1, dur = 0.18, vol = 0.1, tail = [] } = {}) {
  const t0 = ctx.currentTime + 0.02
  notes.forEach((n, i) => tone(type, midi(n), t0 + i * gap, dur, vol))
  tail.forEach((n) => tone('triangle', midi(n), t0 + notes.length * gap, 0.5, 0.055))
}

export const bgm = {
  get playing() {
    return playing
  },
  // 进入战斗：循环起，静音状态下只记意愿不发声
  startBattle() {
    wanted = true
    if (muted) return
    startLoop()
  },
  stop() {
    wanted = false
    stopLoop()
  },
  // 与全局静音按钮联动
  setMuted(value) {
    muted = !!value
    if (muted) stopLoop()
    else if (wanted) startLoop()
  },
  // 胜利：上行大调琶音 + 长尾和弦
  victory() {
    if (muted) return
    if (!ensure()) return
    reviveGain()
    arpeggio([72, 76, 79, 84, 88], { gap: 0.09, dur: 0.16, vol: 0.1, tail: [84, 88, 91] })
  },
  // 失败：下行小调，速度拖慢
  defeat() {
    if (muted) return
    if (!ensure()) return
    reviveGain()
    arpeggio([69, 65, 62, 57], { type: 'triangle', gap: 0.17, dur: 0.32, vol: 0.11, tail: [57, 53] })
  },
}
