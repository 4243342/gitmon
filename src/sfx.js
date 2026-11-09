// 8-bit 芯片音效：WebAudio 方波合成，零素材依赖
// 参考 FC/GB 掌机音源风格；首次交互后自动解锁 AudioContext

let ctx = null
let muted = localStorage.getItem('gitmon:muted') === '1'
const rawVolume = localStorage.getItem('gitmon:volume')
let volume = rawVolume === null ? 1 : Number(rawVolume)
if (!Number.isFinite(volume) || volume < 0) volume = 1

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 基础音符：type 波形 / freq 频率 / dur 时长 / vol 音量 / slide 频率滑向
function tone({ type = 'square', freq = 440, dur = 0.08, vol = 0.16, slide = 0, delay = 0 }) {
  if (muted) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur)
  g.gain.setValueAtTime(vol * volume, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// 噪声爆破：白噪 + 带通/高通滤波，用来做风切、撕纸、落地的"空气感"
// filter 扫频（to）能让 whoosh 有方向：向上=起，向下=落
function noise({ dur = 0.18, vol = 0.1, delay = 0, filter = 'highpass', freq = 900, q = 0.7, to = 0 }) {
  if (muted) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    // 尾部指数衰减，避免"啪"的截断
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6)
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const bq = c.createBiquadFilter()
  bq.type = filter
  bq.frequency.setValueAtTime(freq, t0)
  bq.Q.value = q
  if (to) bq.frequency.exponentialRampToValueAtTime(Math.max(80, to), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol * volume, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(bq).connect(g).connect(c.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

// 低频撞地：正弦下滑 + 短噪声，给"卡牌落在台座上"
function thud({ delay = 0, vol = 0.16, freq = 120 }) {
  tone({ type: 'sine', freq, slide: -freq * 0.55, dur: 0.2, vol, delay })
  noise({ dur: 0.09, vol: vol * 0.7, delay, filter: 'lowpass', freq: 520 })
}

export const sfx = {
  get muted() { return muted },
  // 设置页：音效独立开关（背景音乐在 bgm 自己的开关）
  setMuted(value) {
    muted = !!value
    localStorage.setItem('gitmon:muted', muted ? '1' : '0')
    if (!muted) sfx.blip()
    return muted
  },
  get volume() { return volume },
  set volume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0))
    localStorage.setItem('gitmon:volume', String(volume))
  },
  // 悬停：短促嘀
  tick() { tone({ freq: 880, dur: 0.03, vol: 0.05 }) },
  // 点击：经典 blip
  blip() { tone({ freq: 520, slide: 260, dur: 0.09, vol: 0.14 }) },
  // 返回/取消：下滑音
  back() { tone({ freq: 420, slide: -180, dur: 0.12, vol: 0.12 }) },
  // 扫描进行：双音
  scanTick() { tone({ freq: 660, dur: 0.05, vol: 0.08 }); tone({ freq: 990, dur: 0.05, vol: 0.06, delay: 0.06 }) },
  // 扫描推进到下一阶段：音高逐级上行，像仪表盘一格一格亮起
  scanStep(step = 1) {
    const f = 520 + step * 110
    tone({ type: 'square', freq: f, dur: 0.05, vol: 0.075 })
    tone({ type: 'square', freq: f * 1.5, dur: 0.05, vol: 0.04, delay: 0.055 })
    noise({ dur: 0.06, vol: 0.025, filter: 'highpass', freq: 2600 })
  },
  // 稀有度揭晓：音阶上行，品质越高越长
  reveal(quality) {
    const scales = {
      N: [392, 523],
      R: [392, 523, 659],
      SR: [392, 523, 659, 784],
      SSR: [392, 523, 659, 784, 1047, 1319],
    }
    const notes = scales[quality] || scales.R
    notes.forEach((f, i) => tone({ freq: f, dur: 0.11, vol: 0.15, delay: i * 0.09, type: 'square' }))
    if (quality === 'SSR') {
      tone({ freq: 1568, dur: 0.4, vol: 0.1, delay: notes.length * 0.09 + 0.05 })
      noise({ dur: 0.5, vol: 0.05, delay: notes.length * 0.09, filter: 'highpass', freq: 4200, to: 8000 })
    }
  },
  // 卡包登场（扫描完成 → 卡包浮现在台面）：上升气声 + 滑音 + 轻落地
  packIn() {
    noise({ dur: 0.5, vol: 0.075, filter: 'bandpass', freq: 320, q: 0.9, to: 2600 })
    tone({ type: 'sine', freq: 150, slide: 520, dur: 0.46, vol: 0.07 })
    thud({ delay: 0.46, vol: 0.11, freq: 105 })
  },
  // 撕包：噪声撕纸 + 锯齿刮擦（包-opener 自带音轨为主，这里是兜底/降级路径）
  rip() {
    noise({ dur: 0.26, vol: 0.11, filter: 'bandpass', freq: 2200, q: 0.8, to: 700 })
    for (let i = 0; i < 3; i++) {
      tone({ type: 'sawtooth', freq: 200 + i * 70, slide: -100, dur: 0.045, vol: 0.05, delay: i * 0.05 })
    }
  },
  // 卡盖掀飞：短促上扬 + 气流
  lidOff() {
    noise({ dur: 0.22, vol: 0.09, filter: 'highpass', freq: 1200, to: 3600 })
    tone({ type: 'triangle', freq: 420, slide: 460, dur: 0.14, vol: 0.08 })
  },
  // 卡牌翻面 / 卡包翻格：一声清脆的"嗒"
  flip() {
    noise({ dur: 0.05, vol: 0.06, filter: 'highpass', freq: 3200 })
    tone({ type: 'square', freq: 1560, slide: -240, dur: 0.03, vol: 0.045 })
  },
  // 卡牌落地：撞台面
  impact() { thud({ vol: 0.15, freq: 135 }) },
  // 整箱登场：快速上行琶音 + 一层柔和和弦
  boxIn() {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 0.07, vol: 0.055, delay: i * 0.055 }))
    ;[523, 659, 784].forEach((f) => tone({ type: 'triangle', freq: f, dur: 0.42, vol: 0.045, delay: 0.24 }))
  },
  // 一键全开：按卡片翻出的节奏连打，音高逐张上行
  tiles(count = 6) {
    const n = Math.min(count, 48)
    for (let i = 0; i < n; i++) {
      const f = 880 + (i % 12) * 46
      tone({ type: 'square', freq: f, slide: -120, dur: 0.028, vol: 0.042, delay: i * 0.055 })
      noise({ dur: 0.03, vol: 0.035, delay: i * 0.055, filter: 'highpass', freq: 3000 })
    }
  },
  // 收入图鉴：两连铃 + 柔和尾音
  collect() {
    tone({ type: 'triangle', freq: 1047, dur: 0.1, vol: 0.11 })
    tone({ type: 'triangle', freq: 1319, dur: 0.12, vol: 0.11, delay: 0.1 })
    ;[1047, 1319, 1568].forEach((f) => tone({ type: 'sine', freq: f, dur: 0.34, vol: 0.04, delay: 0.22 }))
  },
  // 页面转场：轻风切（从一个视图切到另一个视图）
  swoosh() {
    noise({ dur: 0.24, vol: 0.06, filter: 'bandpass', freq: 600, q: 1.1, to: 2400 })
  },
  // 升级：上行三连音
  levelUp() {
    tone({ freq: 523, dur: 0.09, vol: 0.14 })
    tone({ freq: 659, dur: 0.09, vol: 0.14, delay: 0.09 })
    tone({ freq: 1047, dur: 0.18, vol: 0.15, delay: 0.18 })
  },
  // 错误：低音双降
  error() { tone({ type: 'triangle', freq: 220, dur: 0.12, vol: 0.15 }); tone({ type: 'triangle', freq: 165, dur: 0.16, vol: 0.15, delay: 0.12 }) },

  // ——— 战斗音效 ———

  // 出招：物理=挥击风切+轻金属味，特殊=按属性给音色；威力越大声音越厚
  attack({ physical = false, element = 'normal', power = 65 } = {}) {
    const heavy = power >= 95
    if (physical) {
      // 挥空的风切：带通扫频，短促利落
      noise({ dur: heavy ? 0.22 : 0.15, vol: heavy ? 0.13 : 0.09, filter: 'bandpass', freq: 700, q: 1.1, to: heavy ? 3400 : 2600 })
      // 刃口刮擦：锯齿波下滑，重击加一层低八度
      tone({ type: 'sawtooth', freq: heavy ? 520 : 760, slide: heavy ? -320 : -420, dur: 0.1, vol: 0.075, delay: 0.03 })
      if (heavy) tone({ type: 'square', freq: 260, slide: -160, dur: 0.16, vol: 0.06, delay: 0.05 })
      return
    }
    // 特殊招：属性音色表（频率基调 + 气声点缀）
    const spell = {
      fire: () => { noise({ dur: 0.3, vol: 0.1, filter: 'lowpass', freq: 480, to: 1600 }); tone({ type: 'sawtooth', freq: 220, slide: 300, dur: 0.24, vol: 0.07 }) },
      water: () => { tone({ type: 'sine', freq: 620, slide: -360, dur: 0.2, vol: 0.09 }); noise({ dur: 0.14, vol: 0.05, filter: 'bandpass', freq: 1800, q: 1.4, to: 700 }) },
      thunder: () => { noise({ dur: 0.1, vol: 0.11, filter: 'highpass', freq: 3200 }); tone({ type: 'square', freq: 1480, slide: -900, dur: 0.1, vol: 0.07, delay: 0.04 }); tone({ type: 'square', freq: 980, slide: -500, dur: 0.12, vol: 0.06, delay: 0.1 }) },
      steel: () => { tone({ type: 'triangle', freq: 1560, slide: -200, dur: 0.12, vol: 0.08 }); tone({ type: 'triangle', freq: 2080, dur: 0.08, vol: 0.05, delay: 0.06 }) },
      earth: () => { thud({ vol: 0.13, freq: 150 }); noise({ dur: 0.2, vol: 0.07, filter: 'lowpass', freq: 700 }) },
      rock: () => { thud({ vol: 0.15, freq: 120 }); for (let i = 0; i < 3; i++) noise({ dur: 0.08, vol: 0.05, delay: 0.1 + i * 0.07, filter: 'highpass', freq: 1400 }) },
      wind: () => noise({ dur: 0.34, vol: 0.09, filter: 'bandpass', freq: 500, q: 0.9, to: 3000 }),
      grass: () => { tone({ type: 'triangle', freq: 740, slide: 240, dur: 0.18, vol: 0.07 }); noise({ dur: 0.16, vol: 0.05, filter: 'highpass', freq: 2400, to: 4800 }) },
      normal: () => { noise({ dur: 0.16, vol: 0.1, filter: 'bandpass', freq: 900, q: 1, to: 2400 }); tone({ type: 'square', freq: 440, slide: -180, dur: 0.1, vol: 0.07 }) },
    }
    ;(spell[element] || spell.normal)()
    if (heavy) thud({ vol: 0.1, freq: 160, delay: 0.06 })
  },

  // 命中：短促撞击 + 落点闷响；暴击加重并带一声上行"劈啪"
  hit({ crit = false, value = 0 } = {}) {
    if (crit) {
      noise({ dur: 0.16, vol: 0.16, filter: 'highpass', freq: 1600 })
      tone({ type: 'square', freq: 340, slide: -180, dur: 0.14, vol: 0.13 })
      thud({ vol: 0.18, freq: 110 })
      // 暴击的"劈啪"上行两连
      tone({ type: 'square', freq: 880, dur: 0.05, vol: 0.09, delay: 0.1 })
      tone({ type: 'square', freq: 1320, dur: 0.06, vol: 0.09, delay: 0.16 })
      return
    }
    const big = value >= 38
    noise({ dur: big ? 0.12 : 0.08, vol: big ? 0.11 : 0.07, filter: 'highpass', freq: big ? 1200 : 1800 })
    tone({ type: 'triangle', freq: big ? 180 : 260, slide: big ? -90 : -130, dur: big ? 0.12 : 0.08, vol: big ? 0.1 : 0.07 })
  },
}
