// 8-bit 芯片音效：WebAudio 方波合成，零素材依赖
// 参考 FC/GB 掌机音源风格；首次交互后自动解锁 AudioContext

let ctx = null
let muted = localStorage.getItem('gitmon:muted') === '1'

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
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sfx = {
  get muted() { return muted },
  toggleMute() {
    muted = !muted
    localStorage.setItem('gitmon:muted', muted ? '1' : '0')
    if (!muted) sfx.blip()
    return muted
  },
  // 悬停：短促嘀
  tick() { tone({ freq: 880, dur: 0.03, vol: 0.05 }) },
  // 点击：经典 blip
  blip() { tone({ freq: 520, slide: 260, dur: 0.09, vol: 0.14 }) },
  // 返回/取消：下滑音
  back() { tone({ freq: 420, slide: -180, dur: 0.12, vol: 0.12 }) },
  // 扫描进行：双音
  scanTick() { tone({ freq: 660, dur: 0.05, vol: 0.08 }); tone({ freq: 990, dur: 0.05, vol: 0.06, delay: 0.06 }) },
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
    if (quality === 'SSR') tone({ freq: 1568, dur: 0.4, vol: 0.1, delay: notes.length * 0.09 + 0.05 })
  },
  // 撕包：噪声刮擦（用锯齿快速滑音模拟）
  rip() {
    for (let i = 0; i < 4; i++) tone({ type: 'sawtooth', freq: 180 + i * 60, slide: -90, dur: 0.05, vol: 0.07, delay: i * 0.045 })
  },
  // 升级：上行三连音
  levelUp() {
    tone({ freq: 523, dur: 0.09, vol: 0.14 })
    tone({ freq: 659, dur: 0.09, vol: 0.14, delay: 0.09 })
    tone({ freq: 1047, dur: 0.18, vol: 0.15, delay: 0.18 })
  },
  // 错误：低音双降
  error() { tone({ type: 'triangle', freq: 220, dur: 0.12, vol: 0.15 }); tone({ type: 'triangle', freq: 165, dur: 0.16, vol: 0.15, delay: 0.12 }) },
}
