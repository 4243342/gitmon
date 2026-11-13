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
//
// 长旁白怎么办（第二段身世，两百多字）：
//   一屏塞不下，所以按标点切成若干「页」，一页一屏地显现。
//   有成品配音时不切 —— 配音是整段录的，切页会把音画拆散。
//   没配音时按句子边界切，每页读完停一下再翻下一页，
//   像纪录片一段段放。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'

// 音频没到位时的兜底语速：每秒几个字
const FALLBACK_CPS = 7.5
// 无配音时长旁白的语速：比有配音的快一点，长旁白不至于拖太久
const NARRATION_CPS = 12
// 一页放多少字（按字算，标点也算一个字）
const PAGE_SIZE = 46

// 按句读标点切句，标点跟着前一句走
const SENTENCE_RE = /[^。！？；，、…]*[。！？；，、…]?/g

/**
 * 把一段长旁白切成若干页。
 * 目标页数 = ceil(总字数 / 每页字数)，再按句子边界尽量均分 ——
 * 一页至少要有 target 的七成字，不然会出现「最后页只剩两个字」的碎屏。
 */
function splitPages(raw, size) {
  const text = String(raw || '')
  if (!text) return []
  if (!size || size <= 0) return [text]
  const sentences = (text.match(SENTENCE_RE) || []).filter((s) => s.length)
  if (!sentences.length) return [text]
  const target = Math.max(1, Math.ceil(text.length / size))
  const per = Math.ceil(text.length / target)
  const pages = []
  let cur = ''
  for (const sent of sentences) {
    // 当前页已经够厚了就换页 —— 但至少要七成，避免碎页
    if (cur && cur.length >= per * 0.7) {
      pages.push(cur)
      cur = sent
    } else {
      cur += sent
    }
  }
  if (cur) pages.push(cur)
  return pages
}

export default function StoryOpening({ text = '', audioUrl = '', cps = 0, onDone }) {
  const rootRef = useRef(null)
  const audioRef = useRef(null)
  const tlRef = useRef(null)
  const [chars, setChars] = useState(0)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState(0)

  // 音频元信息：拿到真实时长才能把字摊准
  const [duration, setDuration] = useState(0)

  // 有配音就整段显示（配音是整段录的，切页会把音画拆散）；
  // 没配音的长旁白才分页
  const paged = !audioUrl
  const pages = useMemo(
    () => (paged ? splitPages(text, PAGE_SIZE) : [String(text || '')]),
    [text, paged],
  )
  const pageText = pages[page] ?? ''
  const isLastPage = page >= pages.length - 1

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

  // 逐字显现：把当前页切成 span，每个字错开一点时间出现
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !ready) return undefined

    const spans = Array.from(root.querySelectorAll('.story-open-char'))
    if (!spans.length) return undefined

    const speed = cps > 0 ? cps : (audioUrl ? FALLBACK_CPS : NARRATION_CPS)
    const total = duration > 0
      ? duration
      : (pageText.length / speed)
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
  }, [ready, duration, pageText, cps, audioUrl])

  // 点画面 = 跳过。
  //   正在打字 → 把这一页直接敲完，然后往下走（下一页 / 下一屏）
  //   已经敲完 → 直接往下走
  // 一次点击永远只往前推一格 —— 玩家按「跳过」时期待的是这个，
  // 按两下才能跳过太蠢。
  //
  // 注意不要在这里用「已经 done 过了」的 ref 把 onDone 拦掉：
  // 「念完自动推进」和「玩家点击」都走 finish()，两次调用都该放出去 ——
  // 真正保证「只推进一格」的是 advancedRef 这道闸，
  // 而跨屏的重复推进由上层的 advancingRef 拦。
  const advancedRef = useRef(false)
  const advance = useCallback(() => {
    if (advancedRef.current) return
    advancedRef.current = true
    if (!isLastPage) {
      setChars(0)
      setPage((p) => p + 1)
    } else {
      onDone?.()
    }
  }, [isLastPage, onDone])

  // 换页时把闸放开（这个 effect 必须排在下面那个定时 effect 之前，
  // 否则新页一上来就被上一页留下的「已推进」状态挡住）
  useEffect(() => {
    advancedRef.current = false
  }, [page])

  const skip = () => {
    // 先把这一页的字敲完（不管还剩多少）
    if (tlRef.current) {
      const tl = tlRef.current
      if (tl.progress() < 1) {
        tl.progress(1)
        tl.pause()
      }
    }
    // 音频也一并跳过：配音比字长，不掐掉的话下一屏会跟着一段余音
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = audioRef.current.duration || 0
        audioRef.current.pause()
      } catch { /* 忽略 */ }
    }
    advance()
  }

  // 这一页念完 → 停一下再翻页；最后一页念完 → 交给玩家继续
  useEffect(() => {
    if (!ready || chars < pageText.length) return undefined
    const timer = setTimeout(advance, 900)
    return () => clearTimeout(timer)
  }, [ready, chars, pageText.length, advance])

  const charsArr = Array.from(pageText || '')

  return (
    <div
      className="story-opening"
      ref={rootRef}
      // 把音频地址挂在 DOM 上：Audio 对象不把 src 暴露出来，
      // 自动化测试要确认「开章真的带了配音」只能从这里读
      data-audio-src={audioUrl || ''}
      data-opening-page={page + 1}
      data-opening-pages={pages.length}
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
        {chars < charsArr.length
          ? ''
          : (isLastPage ? '点击继续' : '下一页')}
      </span>
      {pages.length > 1 && (
        <span className="story-opening-page" aria-hidden="true">
          {`${page + 1} / ${pages.length}`}
        </span>
      )}
    </div>
  )
}
