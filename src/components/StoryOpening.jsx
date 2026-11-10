// 开章解说屏：旁白独占屏幕中央，成品配音 + 逐字显现。
//
// 为什么单独一个组件（而不是复用底部对话框）：
//   开章是「片头解说」，不是对话 —— 没有角色在说话、没有选项、
//   文字要居中、要跟着配音一个个字敲出来。塞进对话框会把
//   「解说」和「角色说话」两种体裁混在一起。
//
// 逐字显现怎么和配音对齐：
//   音频长度已知（4.88 秒），文字长度已知（36 字），
//   两者一除就知道每个字该在什么时候出来。用 GSAP 的 stagger
//   把总时长摊平到每个字上，最后一个字的显现点正好落在音频结束。
//   音频没加载出来就退回按字数估算的节奏，不卡住剧情。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

// 音频没到位时的兜底语速：每秒几个字
const FALLBACK_CPS = 7.5

export default function StoryOpening({ text = '', audioUrl = '', onDone }) {
  const rootRef = useRef(null)
  const audioRef = useRef(null)
  const tlRef = useRef(null)
  const [chars, setChars] = useState(0)
  const [ready, setReady] = useState(false)

  // 音频元信息：拿到真实时长才能把字摊准
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!audioUrl) {
      setReady(true)
      return undefined
    }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    let alive = true
    const onMeta = () => {
      if (!alive) return
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
      setReady(true)
    }
    const onErr = () => {
      if (!alive) return
      setDuration(0)
      setReady(true)
    }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('error', onErr)
    // 某些浏览器要等 canplay 才拿到 duration
    if (audio.readyState >= 1) onMeta()
    return () => {
      alive = false
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('error', onErr)
      try { audio.pause() } catch { /* 已停 */ }
    }
  }, [audioUrl])

  // 逐字显现：把整段文字切成 span，每个字错开一点时间出现
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !ready) return undefined

    const spans = Array.from(root.querySelectorAll('.story-open-char'))
    if (!spans.length) return undefined

    const total = duration > 0
      ? duration
      : (text.length / FALLBACK_CPS)
    // 留 12% 尾巴：最后一个字要在音频结束前一点点出来
    const perChar = Math.max(0.03, (total * 0.88) / Math.max(1, spans.length))

    gsap.set(spans, { opacity: 0, y: 14, filter: 'blur(6px)' })
    const tl = gsap.timeline()
    tl.to(spans, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.34,
      ease: 'power2.out',
      stagger: perChar,
      onUpdate: () => setChars(Math.round(tl.progress() * spans.length)),
    })
    tlRef.current = tl

    // 配音跟着一起放
    if (audioRef.current) {
      try {
        const p = audioRef.current.play()
        if (p && typeof p.catch === 'function') p.catch(() => { /* 自动播放被拦就静音跑 */ })
      } catch { /* 忽略 */ }
    }

    return () => {
      tl.kill()
      tlRef.current = null
    }
  }, [ready, duration, text])

  // 点画面可以跳过：直接把字全亮、音频快进
  const skip = () => {
    if (tlRef.current) {
      tlRef.current.progress(1)
      tlRef.current.pause()
    }
    setChars(text.length)
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = audioRef.current.duration || 0
        audioRef.current.pause()
      } catch { /* 忽略 */ }
    }
    onDone?.()
  }

  // 打字机结束后停一小会儿，再交给玩家继续
  useEffect(() => {
    if (!ready || chars < text.length) return undefined
    const timer = setTimeout(() => onDone?.(), 900)
    return () => clearTimeout(timer)
  }, [ready, chars, text.length, onDone])

  const charsArr = Array.from(text || '')

  return (
    <div
      className="story-opening"
      ref={rootRef}
      // 把音频地址挂在 DOM 上：Audio 对象不把 src 暴露出来，
      // 自动化测试要确认「开章真的带了配音」只能从这里读
      data-audio-src={audioUrl || ''}
      onClick={skip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip() }
      }}
    >
      <div className="story-opening-frame" aria-hidden="true" />
      <p className="story-opening-text">
        {charsArr.map((ch, i) => (
          <span key={`${ch}-${i}`} className="story-open-char">{ch}</span>
        ))}
      </p>
      <span className="story-opening-hint">
        {chars < charsArr.length ? '' : '点击继续'}
      </span>
    </div>
  )
}
