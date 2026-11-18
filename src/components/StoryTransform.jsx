// 变身过场：卡片形象 → 光团 → 画面变暗 → 醒来变成人形态。
//
// 为什么单独一个组件（而不是复用底部对话框）：
//   过场是一段没有对话的动画。塞进对话框会把「过场」和「角色说话」
//   两种体裁混在一起，而且对话框的点击推进会和动画抢节奏。
//   这一屏由 StoryMode 单独渲染，动画播完才进正片。
//
// 四段怎么接：
//   ① 卡片：主角的仓库精灵卡浮在画面中央，微微上下浮动
//   ② 光团：卡片碎成光点向内塌缩成一颗光球（fx/orb-cyan.gif 是脉动动画）
//   ③ 变暗：光球炸开成满屏白闪，然后整屏压暗 —— 「意识断了」的那一下
//   ④ 醒来：黑幕里慢慢亮出人形态立绘（hero_early.png）
//
// 素材从哪来：
//   meta.transforms.awaken = { orb: "orb-cyan.gif", hero: "hero_early.png", caption }
//   orb 走 fx/ 目录（特效），hero 走 art/ 目录（立绘），都由包隔离。
//
// 为什么要 portal 到 body：
//   过场要盖住整个视口（「画面变暗」得是整个画面暗，不是一小块暗）。
//   但它渲染在剧情模式的容器里，那一带 CSS 带了 transform / filter，
//   会把 position:fixed 的定位基准从视口改成那个容器 —— 结果过场被压成一小块。
//   挂到 body 上就没有这层干扰。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'

// 四段时长（秒）。总和就是这段过场的长度。
const T_CARD = 1.5     // 卡片浮现
const T_ORB = 1.8     // 塌缩成光团
const T_DARK = 1.1    // 白闪 → 变暗
const T_WAKE = 1.6    // 黑暗中亮出人形态

export default function StoryTransform({ sprite = null, orbUrl = '', heroUrl = '', caption = '', onDone }) {
  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const orbRef = useRef(null)
  const heroRef = useRef(null)
  const tlRef = useRef(null)
  const [phase, setPhase] = useState('card')
  const [done, setDone] = useState(false)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const card = cardRef.current
    const orb = orbRef.current
    const hero = heroRef.current

    // 白闪层与字幕层：取元素引用而不是用全局选择器 ——
    // 这一层挂在 body 上（portal），全局选择器会误伤页面上别的东西
    const flash = root.querySelector('.story-tf-flash')
    const caption = root.querySelector('.story-tf-caption')

    // 初始态：只有卡片在，光团和人形态都藏着
    gsap.set(orb, { opacity: 0, scale: 0.2 })
    gsap.set(hero, { opacity: 0, scale: 1.04, y: 18 })
    gsap.set(card, { opacity: 0, y: 30, scale: 0.86 })

    const tl = gsap.timeline({
      onComplete: () => {
        setDone(true)
      },
    })
    tlRef.current = tl

    // ① 卡片浮现
    tl.to(card, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: T_CARD,
      ease: 'power3.out',
    })
    tl.to(card, {
      y: -10,
      duration: 0.9,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: 1,
    }, `-=${T_CARD * 0.5}`)

    // ② 卡片碎成光点，向内塌缩成光团
    tl.to(card, {
      opacity: 0,
      scale: 0.72,
      filter: 'blur(10px)',
      duration: 0.9,
      ease: 'power2.in',
      onStart: () => setPhase('orb'),
    })
    tl.fromTo(orb,
      { opacity: 0, scale: 0.2 },
      { opacity: 1, scale: 1, duration: 1.0, ease: 'back.out(2)' },
      `-=0.6`)
    // 光团稳住之后轻轻搏动一下（gif 本身也在脉动，这里只做一个呼吸感）
    tl.to(orb, {
      scale: 1.12,
      duration: 0.45,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: 1,
    })

    // ③ 光团炸开 → 画面变暗
    tl.to(orb, {
      scale: 3.4,
      opacity: 0,
      duration: 0.7,
      ease: 'power3.in',
      onStart: () => setPhase('dark'),
    })
    // 白闪：一层全屏白，走得快退得也快
    tl.fromTo(flash,
      { opacity: 0 },
      { opacity: 0.92, duration: 0.16, ease: 'power2.out' },
      '-=0.45')
    tl.to(flash, { opacity: 0, duration: 0.5, ease: 'power2.in' })
    // 变暗：压暗层用 GSAP 直接动画 opacity（不用 CSS 变量 ——
    // GSAP 3 动画 CSS 自定义属性需要额外注册，直接动元素更稳）
    const dark = root.querySelector('.story-tf-dark')
    tl.fromTo(dark, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.inOut' }, '-=0.4')

    // ④ 黑暗里亮出人形态
    tl.to(hero, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: T_WAKE,
      ease: 'power2.out',
      onStart: () => setPhase('hero'),
    })
    // 标题在立绘稳定后才出
    if (caption) {
      tl.fromTo(caption,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' },
        `-=${T_WAKE * 0.45}`)
    }

    return () => {
      tl.kill()
      tlRef.current = null
    }
  }, [])

  // 动画播完一小会儿，把控制权交回 StoryMode
  useEffect(() => {
    if (!done) return undefined
    const timer = setTimeout(() => onDone?.(), 1100)
    return () => clearTimeout(timer)
  }, [done, onDone])

  // 点画面可以跳过：直接跳到最后一帧
  const skip = () => {
    if (tlRef.current) {
      tlRef.current.progress(1).pause()
    }
    setDone(true)
  }

  // 挂到 body 上：过场要盖住整个视口，不受剧情模式容器的 CSS 上下文影响
  return createPortal(
    <div
      // 类名用 tf-phase-* 前缀，不能直接拼 phase ——
      // phase 的值（card / orb / dark / hero）会和子元素类名 .story-tf-card
      // 撞上，把根元素的 position:fixed 覆盖成 absolute，过场就被压成一小块。
      className={`story-tf story-tf-phase-${phase}`}
      ref={rootRef}
      onClick={skip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip() }
      }}
    >
      <div className="story-tf-dark" aria-hidden="true" />
      <div className="story-tf-flash" aria-hidden="true" />
      <div className="story-tf-stage" aria-hidden="true">
        {/* ① 卡片形象：玩家自己的仓库精灵 */}
        <div className="story-tf-card" ref={cardRef}>
          {sprite}
        </div>
        {/* ② 光团 */}
        {orbUrl && <img className="story-tf-orb" ref={orbRef} src={orbUrl} alt="" />}
        {/* ④ 人形态 */}
        {heroUrl && <img className="story-tf-hero" ref={heroRef} src={heroUrl} alt="" />}
      </div>
      {caption && <p className="story-tf-caption">{caption}</p>}
      {done && <span className="story-tf-hint">点击继续</span>}
    </div>,
    document.body,
  )
}
