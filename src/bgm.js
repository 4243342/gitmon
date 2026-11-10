// BGM：WebAudio 现场合成的 8-bit 芯片音乐，零素材依赖
// 和 sfx.js 同源（方波/三角波 + 噪声），但走独立调度器：16 分音符步进、64 步循环
// 两条曲子共用一套总线（低通 + 总音量），切换只换谱子，不重建 AudioContext：
//   battle  对战曲 —— 152 BPM，Am-F-C-G，密集琶音 + 走句贝斯 + 鼓组
//   story   远征曲 —— 92 BPM，Dm-Bb-F-C，八音盒旋律 + 长音铺底 + 稀疏脉冲

const LEVEL = 0.8
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)

// 每首曲子自带谱面：bpm / 根音与和声音阶 / 主旋律位置 / 是否要鼓
const TRACKS = {
  battle: {
    bpm: 152,
    level: 1,
    cutoff: 5200,
    // 每小节的低音根音与琶音音阶（MIDI 编号）
    chords: [
      { root: 45, tones: [57, 60, 64, 69] }, // Am
      { root: 41, tones: [53, 57, 60, 65] }, // F
      { root: 48, tones: [60, 64, 67, 72] }, // C
      { root: 43, tones: [55, 59, 62, 67] }, // G
    ],
    // 16 步的主旋律取音顺序，来回跳进，像 FC 战斗曲的分解和弦
    arp: [0, 1, 2, 3, 2, 1, 0, 2, 1, 2, 3, 2, 0, 1, 2, 1],
    drums: 'battle',
  },
  story: {
    bpm: 92,
    level: 0.62, // 选卡页面是"读题"场景，压一档，别抢人声/文字的注意力
    cutoff: 3600, // 更暗的低通，八音盒不刺耳
    chords: [
      { root: 38, tones: [57, 62, 65, 69] }, // Dm
      { root: 34, tones: [53, 58, 62, 65] }, // Bb
      { root: 41, tones: [57, 60, 65, 69] }, // F
      { root: 36, tones: [55, 60, 64, 67] }, // C
    ],
    // 不按步进跑琶音，改用"八音盒点句"：每小节只落几个音，留白多、有呼吸
    // 格式 [第几步, MIDI]，跨小节循环时按 bar 位移到对应和弦附近
    melody: [
      [[0, 69], [6, 65], [10, 74]],
      [[0, 70], [4, 65], [10, 62]],
      [[0, 72], [6, 69], [10, 77]],
      [[0, 67], [4, 64], [8, 72], [12, 76]],
    ],
    drums: 'story',
  },
}

let ctx = null
let filter = null
let master = null
let noiseBuf = null
let timer = null
let playing = false
let wanted = false
let nextTime = 0
let step = 0
let trackKey = 'battle'
// 音乐有独立开关：老用户只有总静音键时回退沿用，之后各记各的
const bgmMutedRaw = localStorage.getItem('gitmon:bgm-muted')
let muted = bgmMutedRaw !== null ? bgmMutedRaw === '1' : localStorage.getItem('gitmon:muted') === '1'
const rawVolume = localStorage.getItem('gitmon:volume')
let volume = rawVolume === null ? 1 : Number(rawVolume)
if (!Number.isFinite(volume) || volume < 0) volume = 1
// 说话时把音乐压下去（ducking）：只改这个因子，换曲 / 调音量都还按原公式走
let duckFactor = 1
const lvl = () => LEVEL * (TRACKS[trackKey]?.level ?? 1) * volume * duckFactor
const track = () => TRACKS[trackKey] || TRACKS.battle

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    // 芯片音高频刺耳，整体过一道低通收敛一点
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = track().cutoff
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

// 战斗曲：密集琶音 + 八分贝斯 + 底鼓/军鼓/踩镲
function battleStep(i, t) {
  const bar = Math.floor(i / 16)
  const s = i % 16
  const chord = track().chords[bar]

  // 贝斯：八分音符走根音，第 7/15 步跳八度，撑住战斗的推进感
  if (s % 2 === 0) tone('triangle', midi(chord.root), t, 0.15, 0.085)
  if (s === 7 || s === 15) tone('triangle', midi(chord.root + 12), t, 0.09, 0.05)

  // 主旋律：16 分音符琶音，每拍头加一层高八度点一下
  const note = chord.tones[track().arp[s]]
  tone('square', midi(note), t, 0.075, 0.036)
  if (s % 4 === 0) tone('square', midi(note + 12), t, 0.05, 0.016)

  // 鼓组
  if (s === 0 || s === 6 || s === 8 || s === 14) tone('sine', 132, t, 0.15, 0.12, 46)
  if (s === 4 || s === 12) noiseHit(t, { freq: 1900, dur: 0.09, vol: 0.042 })
  if (s % 2 === 1) noiseHit(t, { freq: 7400, type: 'highpass', dur: 0.028, vol: 0.012 })
}

// 远征曲：八音盒点句 + 长音铺底 + 心跳般的稀疏脉冲
function storyStep(i, t) {
  const bar = Math.floor(i / 16)
  const s = i % 16
  const chord = track().chords[bar]
  const melody = track().melody[bar] || []

  // 铺底：每小节一根长音，跟随和弦根音高八度，像老 RPG 的"和声垫"
  if (s === 0) {
    tone('triangle', midi(chord.root + 24), t, 1.5, 0.022)
    tone('triangle', midi(chord.root), t, 1.2, 0.05)
  }

  // 主旋律：八音盒质感（方波 + 长衰减），只落 3-4 个音，靠留白撑气氛
  for (const [at, note] of melody) {
    if (at === s) {
      tone('square', midi(note), t, 0.5, 0.038)
      tone('triangle', midi(note - 12), t, 0.55, 0.024) // 低八度加厚，避免单薄
    }
  }

  // 八分音符的轻声分解和弦：把留白填成"滴答"的律动，音量压到只当质感
  if (s % 2 === 0) tone('triangle', midi(chord.tones[(s / 2) % 4] - 12), t, 0.24, 0.014)

  // 第 14 步一颗高音星点，把句子收住
  if (s === 14) tone('square', midi(chord.tones[2] + 12), t, 0.22, 0.012)

  // 脉冲：小节头的软底鼓 + 半拍的刷声，慢速心跳
  if (s === 0) tone('sine', 110, t, 0.28, 0.07, 48)
  if (s === 8) noiseHit(t, { freq: 320, type: 'bandpass', q: 0.8, dur: 0.13, vol: 0.022 })
  if (s === 4 || s === 12) noiseHit(t, { freq: 8200, type: 'highpass', dur: 0.02, vol: 0.006 })
}

const RENDERERS = { battle: battleStep, story: storyStep }

function tick() {
  if (!playing || !ctx) return
  const stepDur = 60 / track().bpm / 4
  const render = RENDERERS[trackKey] || battleStep
  while (nextTime < ctx.currentTime + 0.2) {
    render(step, nextTime)
    nextTime += stepDur
    step = (step + 1) % 64
  }
}

function startLoop(key) {
  const c = ensure()
  if (!c) return
  // 换曲：已在本曲里就不重启，避免每次进下一屏都重新淡入
  if (playing && trackKey === key) return
  const wasPlaying = playing
  trackKey = key
  playing = true
  step = 0
  // 换曲时把低通跟着谱面走（战斗曲亮、远征曲暗）
  filter.frequency.cancelScheduledValues(c.currentTime)
  filter.frequency.setValueAtTime(filter.frequency.value, c.currentTime)
  filter.frequency.linearRampToValueAtTime(track().cutoff, c.currentTime + 0.3)
  master.gain.cancelScheduledValues(c.currentTime)
  master.gain.setValueAtTime(wasPlaying ? Math.max(0.0001, master.gain.value) : 0.0001, c.currentTime)
  master.gain.linearRampToValueAtTime(lvl(), c.currentTime + (wasPlaying ? 0.12 : 0.35))
  nextTime = c.currentTime + 0.06
  tick()
  if (timer) clearInterval(timer)
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
  master.gain.setValueAtTime(lvl(), ctx.currentTime)
}

// 语音开口时压低音乐；返回后由调用方在语音结束时 unduck
function applyDuck(level, ms) {
  duckFactor = Math.max(0.05, Math.min(1, Number(level) || 0.35))
  if (!ctx || !playing) return
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
  master.gain.linearRampToValueAtTime(Math.max(0.0001, lvl()), now + Math.max(0.05, ms / 1000))
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
  get track() {
    return playing ? trackKey : null
  },
  get muted() { return muted },
  // 浏览器要求 AudioContext 在用户手势里创建/恢复：点击入口时先叫一声
  unlock() {
    ensure()
  },
  // 进入战斗：循环起，静音状态下只记意愿不发声
  startBattle() {
    wanted = true
    if (muted) return
    startLoop('battle')
  },
  // 剧情准备阶段（选主角 / 选对手 / 选剧本）：慢速远征曲
  startStory() {
    wanted = true
    if (muted) return
    startLoop('story')
  },
  stop() {
    wanted = false
    stopLoop()
  },
  // 语音朗读期间压低音乐：level=0.35 表示降到 35%，ms 是渐变时长
  duck(level = 0.35, ms = 200) {
    applyDuck(level, ms)
  },
  unduck(ms = 500) {
    if (duckFactor === 1) return
    applyDuck(1, ms)
  },
  get ducked() { return duckFactor < 1 },
  // 与设置页联动：音乐独立开关
  setMuted(value) {
    muted = !!value
    localStorage.setItem('gitmon:bgm-muted', muted ? '1' : '0')
    if (muted) stopLoop()
    else if (wanted) startLoop(trackKey)
  },
  // 设置页音量滑条（与音效共享 gitmon:volume），播放中即时生效
  setVolume(v) {    volume = Math.max(0, Math.min(1, Number(v) || 0))
    localStorage.setItem('gitmon:volume', String(volume))
    if (ctx && playing) {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.linearRampToValueAtTime(Math.max(0.0001, lvl()), ctx.currentTime + 0.08)
    }
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
