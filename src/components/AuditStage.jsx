// 深度审计演出台（docs/AI-AUDIT.md §4/§7）：
// 中央舞台（光团 → 属性确定后显形宠物）+ 等级随勘测实时滚动 + 跨阶进化演出，
// 外加里程碑进度 / 弹幕层 / 属性·种族弹窗 / 跳过。
// 纯展示：事件流由 App 里的 runDeepAudit 泵进来。
import { useEffect, useMemo, useRef, useState } from 'react'
import { stageFromLevel, stageName } from '../evolution.js'
import { finalRollDuration } from '../audit.js'
import { sfx } from '../sfx.js'
import PixelSprite from './PixelSprite.jsx'
import '../audit.css'

const STEPS = ['M0 连接仓库', 'M1 发现属性', 'M2 生态位', 'M3 工程量勘测', 'M4 质量检验', 'M5 模型总评']

export default function AuditStage({ events = [], onSkip }) {
  const [popup, setPopup] = useState(null)
  const shownPopup = useRef(-1)

  const barrages = useMemo(() => events.filter((e) => e.kind === 'barrage').slice(-7), [events])
  const warn = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === 'warn') return events[i].text
    return ''
  }, [events])
  const activeStep = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === 'milestone') return events[i].step
    return 0
  }, [events])
  const spawnPet = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === 'spawn') return events[i].pet
    return null
  }, [events])
  const skipped = useMemo(() => events.some((e) => e.kind === 'skip'), [events])
  // 目标等级：终场 final 优先，其次里程碑 levelup（isFinal 决定滚动时长）
  const target = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e.kind === 'final') return { level: e.level, isFinal: true }
      if (e.kind === 'levelup') return { level: e.level, isFinal: false }
    }
    return { level: 1, isFinal: false }
  }, [events])
  // 属性弹窗亮起 = 确定属性 → 光团显形为宠物
  const revealed = useMemo(() => events.some((e) => e.kind === 'popup' && e.kindOf === 'element'), [events])
  const finished = events.some((e) => e.kind === 'done')
  const lastLine = barrages.length ? barrages[barrages.length - 1].text : '连接仓库，读取档案...'

  // ---- 等级显示值：目标一变就 countUp 滚动（easeOutExpo，对标 countUp.js）----
  const [disp, setDisp] = useState(1)
  const dispRef = useRef(1)
  useEffect(() => {
    const to = target.level
    if (to === dispRef.current) return undefined
    if (skipped) { dispRef.current = to; setDisp(to); return undefined }
    const from = dispRef.current
    const dur = target.isFinal
      ? finalRollDuration(from, to)
      : Math.min(700, 320 + Math.abs(to - from) * 90)
    const t0 = performance.now()
    let raf = 0
    const tick = (ts) => {
      const t = Math.min(1, (ts - t0) / dur)
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const v = t >= 1 ? to : Math.max(from, Math.round(from + (to - from) * eased))
      dispRef.current = v
      setDisp(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, skipped])

  // ---- 跨阶检测：等级滚过进化节点 → 播进化演出（白闪 + 阶段名，对标 animate.css）----
  const [evolve, setEvolve] = useState(null) // { key, stage, name }
  const lastStageRef = useRef(1)
  useEffect(() => {
    const st = stageFromLevel(disp)
    if (st === lastStageRef.current) return
    lastStageRef.current = st
    setEvolve({ key: st * 1000 + (Date.now() % 997), stage: st, name: stageName(st) })
    sfx.blip() // 进化音：跨过进化节点
  }, [disp])
  // 演出自收：挂在 evolve 上而不是 disp 上（滚动期间 disp 每帧都在变）
  useEffect(() => {
    if (!evolve) return undefined
    const t = setTimeout(() => setEvolve(null), 2000)
    return () => clearTimeout(t)
  }, [evolve])

  // 弹窗：进入即展示，3.6 秒后自动收起
  useEffect(() => {
    const last = [...events].reverse().find((e) => e.kind === 'popup')
    if (!last || last.seq === shownPopup.current) return undefined
    shownPopup.current = last.seq
    setPopup(last)
    const t = setTimeout(() => setPopup(null), 3600)
    return () => clearTimeout(t)
  }, [events])

  // 显形时宠物用当前等级对应形态
  const stagePet = spawnPet ? { ...spawnPet, evolutionStage: stageFromLevel(disp) } : null

  return (
    <main className="scan audit-stage">
      <div className="audit-topline">
        <span className="audit-badge">深度审计 · 真实抓取</span>
        <span className="audit-badge audit-badge--muted">等级随勘测实时结算</span>
      </div>

      {/* 中央舞台：光团 → 属性确定显形宠物；等级大字随勘测滚动 */}
      <div className={`audit-core ${stagePet && revealed ? 'is-revealed' : ''}`}>
        <div className="audit-orb" aria-hidden>
          <span className="audit-orb-core" />
          <span className="audit-orb-ring" />
          <span className="audit-orb-ring audit-orb-ring--2" />
        </div>

        {stagePet && revealed && (
          <div className="audit-pet" key={stagePet.spriteSeed}>
            <PixelSprite pet={stagePet} size={150} />
          </div>
        )}

        {evolve && <span className="audit-evolve-flash" key={`f${evolve.key}`} aria-hidden />}
        {evolve && (
          <strong className="audit-evolve-tag" key={`t${evolve.key}`}>
            进化 · {evolve.name}
          </strong>
        )}

        <div className={`audit-lv ${target.level !== disp ? 'rolling' : ''}`}>
          <em>Lv.</em>
          {disp}
        </div>
        <div className="audit-stage-name">{stageName(stageFromLevel(disp))}</div>
      </div>

      <div className="rpg-box">
        <p className="rpg-line">
          {lastLine}
          <span className="rpg-caret" />
        </p>
      </div>

      <ul className="scan-steps audit-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={finished || i < activeStep ? 'done' : i === activeStep ? 'active' : ''}>
            <span className="dot" />
            {s}
            {(finished || i < activeStep) && <em>OK!</em>}
          </li>
        ))}
      </ul>

      <div className="audit-barrage" aria-hidden>
        {barrages.map((b) => (
          <div key={b.seq} className="audit-bline">{b.text}</div>
        ))}
      </div>

      {popup && (
        <div className={`audit-popup audit-popup--${popup.kindOf}`} key={popup.seq}>
          <span className="audit-popup-tag">{popup.kindOf === 'element' ? '发现属性' : '种族判定'}</span>
          <strong className="audit-popup-name">{popup.name}</strong>
          {popup.sub && <span className="audit-popup-sub">{popup.sub}</span>}
        </div>
      )}

      {warn && <div className="audit-warn">! {warn}</div>}

      {!finished && (
        <button type="button" className="ghost-btn audit-skip" onClick={onSkip}>
          跳过演出 → 直接出卡
        </button>
      )}
    </main>
  )
}
