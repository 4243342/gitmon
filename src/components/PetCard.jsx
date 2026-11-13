import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import RadarChart from './RadarChart.jsx'
import { hasCustomSprite, setCustomSprite, clearCustomSprite, onCustomSprite } from '../customSprite.js'
import { MAX_STAGE, nextStage, stageInfo, stageProgress } from '../evolution.js'
import { derivedFieldsOf } from '../engine.js'
import { StarBadge } from '../starBadge.jsx'
import ModelSeal from './ModelSeal.jsx'
import { useI18n } from '../i18n.js'

// 卡面材质由 GPL-3.0 库 pokemon-cards-css（simeydotme，8.3k★）接管，
// 拼接内置在 src/vendor/pokemon-cards.css（同目录附 LICENSE，GPL-3.0）。
// 品质 → data-rarity 分档：N → basic（哑光）· R → rare holo（经典横纹镭射）
// SR → rare holo cosmos（星空闪）· SSR → rare rainbow（彩虹流光）
const RARITY_BY_QUALITY = { N: 'basic', R: 'rare holo', SR: 'rare holo cosmos', SSR: 'rare rainbow' }

// 指针离开后的静止值（等价于原库 Svelte 弹簧回中到 50/50；材质常亮由样式的 --card-opacity:1 提供）
const REST_VARS = {
  '--pointer-x': '50%', '--pointer-y': '50%',
  '--pointer-from-center': '0', '--pointer-from-top': '.5', '--pointer-from-left': '.5',
  '--background-x': '50%', '--background-y': '50%',
  '--rotate-x': '0deg', '--rotate-y': '0deg',
  '--mx': '50%', '--my': '50%',   // 模型钢印高光（advanced.css）复用同一指针位置
}

// 精灵卡片：标准集换式卡比例 63:88；倾斜/全息材质全部由 pokemon-cards-css 接管。
// readOnly：别人的卡（剧情模式的对手）——不提供换形象 / 拖图 / 模型钢印，只展示。
export default function PetCard({ pet, revealed = false, readOnly = false }) {
  const { t: tf } = useI18n()
  const rootRef = useRef(null)
  const contentRef = useRef(null)
  const fileRef = useRef(null)
  const [, bump] = useReducer((x) => x + 1, 0)
  const [dragOver, setDragOver] = useState(false)

  // 自定义形象变化时刷新按钮状态
  useEffect(() => onCustomSprite(bump), [])

  // cosmos 星空贴图每张卡固定一个随机偏移（原库同款做法）
  const cosmosBg = useMemo(() => `${Math.floor(Math.random() * 734)}px ${Math.floor(Math.random() * 1280)}px`, [])

  // 指针跟随：把指针在卡面上的位置换算成 pokemon-cards-css 需要的一组 CSS 变量
  //（原库由 Svelte 弹簧驱动；这里等价换算，离开时回中）。
  // 事件挂内容层原生监听：材质叠层 pointer-events:none，命中测试永远落回内容层；
  // pointerleave 不冒泡，挂到实际命中元素上最稳，不依赖 React 对 pointerout 的派生。
  // 陀螺仪一旦给出数据，指针跟随就让位，避免触屏拖动和重力感应互相打架。
  const gyroRef = useRef(false)
  useEffect(() => {
    const hit = contentRef.current
    if (!hit) return
    const move = (e) => {
      if (gyroRef.current) return
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
      const x = px * 100
      const y = py * 100
      const set = (k, v) => el.style.setProperty(k, v)
      set('--pointer-x', `${Math.round(x)}%`)
      set('--pointer-y', `${Math.round(y)}%`)
      set('--pointer-from-center', String(Math.min(1, Math.hypot(x - 50, y - 50) / 50)))
      set('--pointer-from-top', String(py))
      set('--pointer-from-left', String(px))
      set('--rotate-x', `${Math.round(-(x - 50) / 3.5)}deg`)
      set('--rotate-y', `${Math.round((y - 50) / 3.5)}deg`)
      set('--background-x', `${37 + px * 26}%`)
      set('--background-y', `${33 + py * 34}%`)
      set('--mx', `${Math.round(x)}%`)
      set('--my', `${Math.round(y)}%`)
    }
    const leave = () => {
      const el = rootRef.current
      if (!el) return
      for (const [k, v] of Object.entries(REST_VARS)) el.style.setProperty(k, v)
    }
    hit.addEventListener('pointermove', move)
    hit.addEventListener('pointerleave', leave)
    return () => {
      hit.removeEventListener('pointermove', move)
      hit.removeEventListener('pointerleave', leave)
    }
  }, [])

  // 移动端：陀螺仪微旋转。手机倾斜时驱动同一组 pokemon-cards-css 变量（与桌面指针跟随二选一），
  // 幅度限制在 ±6°，只做轻微视差，不晃眼。iOS 需要用户手势里申请权限，安卓首次触摸后自动生效。
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (typeof window === 'undefined') return
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    if (typeof window.DeviceOrientationEvent === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let baseline = null
    let running = false
    let latest = null

    const apply = () => {
      raf = 0
      if (!latest) return
      const { beta, gamma } = latest
      latest = null
      if (baseline == null) baseline = Math.min(75, Math.max(20, beta))
      const gx = Math.max(-1, Math.min(1, gamma / 30))
      const gy = Math.max(-1, Math.min(1, (beta - baseline) / 20))
      gyroRef.current = true
      const px = 50 - gx * 24
      const py = 50 + gy * 20
      const set = (k, v) => el.style.setProperty(k, v)
      set('--pointer-x', `${Math.round(px)}%`)
      set('--pointer-y', `${Math.round(py)}%`)
      set('--pointer-from-center', String(Math.min(1, Math.hypot(px - 50, py - 50) / 50)))
      set('--pointer-from-top', String(py / 100))
      set('--pointer-from-left', String(px / 100))
      set('--rotate-x', `${(-gx * 6).toFixed(1)}deg`)
      set('--rotate-y', `${(gy * 6).toFixed(1)}deg`)
      set('--background-x', `${37 + (px / 100) * 26}%`)
      set('--background-y', `${33 + (py / 100) * 34}%`)
      set('--mx', `${Math.round(px)}%`)
      set('--my', `${Math.round(py)}%`)
    }

    const onOrient = (e) => {
      if (e.beta == null || e.gamma == null) return
      latest = { beta: e.beta, gamma: e.gamma }
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const start = () => {
      if (running) return
      running = true
      window.addEventListener('deviceorientation', onOrient, true)
    }

    const requestAndStart = () => {
      const DOE = window.DeviceOrientationEvent
      if (typeof DOE.requestPermission === 'function') {
        DOE.requestPermission()
          .then((state) => { if (state === 'granted') start() })
          .catch(() => {}) // 用户拒绝或非安全上下文：保持指针跟随（触屏上即静止）
      } else {
        start()
      }
    }

    const onFirstTouch = () => {
      el.removeEventListener('pointerdown', onFirstTouch)
      requestAndStart()
    }
    el.addEventListener('pointerdown', onFirstTouch, { passive: true })
    // 没有 requestPermission 的浏览器（安卓）直接监听；拿不到数据就静默不动
    if (typeof window.DeviceOrientationEvent.requestPermission !== 'function') requestAndStart()

    const onOrientChange = () => { baseline = null }

    window.addEventListener('orientationchange', onOrientChange)
    return () => {
      el.removeEventListener('pointerdown', onFirstTouch)
      window.removeEventListener('deviceorientation', onOrient, true)
      window.removeEventListener('orientationchange', onOrientChange)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const acceptFile = (file) => {
    if (file && file.type.startsWith('image/')) setCustomSprite(pet, file)
  }

  // 归一化口径：卡面上的条和雷达必须跟同屏数字用同一把尺子。
  // 存档里的 statCap / hpCap 可能是旧版本按绝对制算出来的（Lv.999 会到 3916），
  // 而六维其实是 AI 的 0–100 评分——用旧上限去画，条会缩成一根细丝、雷达缩成一个点，
  // 看着就像「数值没了」。这里按当前六维重新判断尺度，只用于展示，不改存档。
  const scale = useMemo(() => derivedFieldsOf(pet), [pet])
  const statCap = Number(scale.statCap) || Number(pet.statCap) || 100
  const hpCap = Number(scale.hpCap) || Number(pet.hpCap) || statCap

  const q = pet.quality
  const evo = stageInfo(pet.evolutionStage)
  const nextEvo = nextStage(pet.evolutionStage)
  const progress = stageProgress(pet.level)
  const repoHost = pet.platform === 'gitee' ? 'gitee.com' : 'github.com'
  const repoUrl = `https://${repoHost}/${pet.fullName || pet.repo}`

  return (
    <div className="gm-holo">
      <div
        className={`card interactive ${revealed ? 'card-flip-in' : ''}`}
        ref={rootRef}
        data-rarity={RARITY_BY_QUALITY[q.key] ?? 'basic'}
        data-supertype="pokémon"
        data-subtypes="basic"
      >
        <div className="card__translater">
          <div className="card__rotator">
            <div className="card__front" style={{ '--cosmosbg': cosmosBg }}>
              <div
                ref={contentRef}
                className={`pet-card quality-${q.key}`}
                style={{ '--q-color': q.color, '--q-glow': q.glow }}
              >
                <div className="card-head">
                  <div className="card-head-text">
                    <div className="pet-name">{pet.repo}</div>
                    <div className="pet-sub">
                      {tf(`${pet.element.name}系`, `${pet.element.name}-type`)}
                      {pet.elementSecondary && <span className="dual">/{pet.elementSecondary.name}</span>}
                      {' · '}{pet.species.name} · {evo.name}
                      {pet.status === 'sleeping' && <span className="sleep-tag">{tf('沉睡', 'Sleep')}</span>}
                      {pet.aiEvaluated && (
                        <span
                          className="ai-tag"
                          title={pet.audited
                            ? tf(`深度审计：真实抓取后由模型 ${pet.aiModel || ''} 总评`, `Deep audit: overall rating by model ${pet.aiModel || ''} after real fetch`)
                            : tf(`全部评测由模型 ${pet.aiModel || ''} 给出，非真实扫描`, `All ratings by model ${pet.aiModel || ''} · not a real scan`)}
                        >
                          {pet.audited ? tf('深度审计', 'Deep Audit') : tf('AI 推测', 'AI Guess')}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 星级段位：GitHub / Gitee star，1 颗 = 1 级，右上角 */}
                  <StarBadge stars={pet.stars} size={26} />
                  <div className={`quality-badge len-${q.key.length}`} title={tf(`品质：${q.name}`, `Quality: ${q.name}`)}>
                    <span>{q.key}</span>
                  </div>
                </div>

                <div
                  className={`sprite-frame ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={readOnly ? undefined : () => setDragOver(false)}
                  onDrop={readOnly ? undefined : (e) => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]) }}
                >
                  <div className="sprite-aura" />
                  <PixelSprite pet={pet} size={132} />
                  {!readOnly && <ModelSeal pet={pet} />}
                  {!readOnly && (
                    <div className="sprite-tools">
                      {hasCustomSprite(pet) && (
                        <button className="sprite-tool" title={tf('恢复默认立绘', 'Restore default art')} onClick={() => clearCustomSprite(pet)}>{tf('还原', 'Reset')}</button>
                      )}
                      <button className="sprite-tool" title={tf('上传自定义形象，也可以直接把图片拖到这里', 'Upload a custom sprite, or drop an image here')} onClick={() => fileRef.current?.click()}>
                        {tf('换形象', 'Change Sprite')}
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = '' }}
                  />
                </div>

                <div className="card-row">
                  <span className="lv">Lv.{pet.level}</span>
                  <div className="hp-bar">
                    <div className="hp-fill" style={{ width: `${Math.min(100, ((pet.maxHp || 0) / hpCap) * 100)}%` }} />
                  </div>
                  <span className="hp-num">HP {pet.maxHp}</span>
                </div>

                <div className="mini-rows">
                  <div className="mini-row">
                    <span className="mini-label">{pet.evolutionStage}/{MAX_STAGE}</span>
                    <div className="evo-bar"><div className="evo-fill" style={{ width: `${progress}%` }} /></div>
                    <span className="mini-val">{nextEvo ? `Lv.${nextEvo.min}` : tf('最终', 'Final')}</span>
                  </div>
                  <div className="mini-row">
                    <span className="mini-label">根基</span>
                    <div className="foundation-bar">
                      <div
                        className={`foundation-fill tier-${pet.foundationTier?.key || 'fair'}`}
                        style={{ width: `${pet.foundation || 0}%` }}
                      />
                    </div>
                    <span className={`mini-val tier-${pet.foundationTier?.key || 'fair'}`}>
                      {pet.foundationTier?.name || tf('未评估', 'Not rated')}
                    </span>
                  </div>
                </div>

                <div className="card-body">
                  <RadarChart stats={pet.stats} color={pet.element.color} size={120} compact max={statCap} />
                  <div className="stats-list">
                    {pet.stats.map((s) => (
                      <div key={s.name} className="stat-row">
                        <span className="stat-name">{s.name}</span>
                        <div className="stat-bar">
                          <div className="stat-fill" style={{ width: `${Math.min(100, (s.value / statCap) * 100)}%`, background: pet.element.color }} />
                        </div>
                        <span className="stat-val">{s.value}</span>
                        <span className={`stat-grade g-${s.grade}`}>{s.grade}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="skills">
                  {pet.skills.map((s, i) => {
                    // 高级模式：技能名 / 属性 / 威力 / 解锁等级 / 描述 / 依据全部来自模型，hover 可看定制依据
                    const tip = [
                      s.name,
                      s.element ? tf(`${s.element.name}系`, `${s.element.name}-type`) : '',
                      s.power != null ? tf(`威力 ${s.power}`, `Power ${s.power}`) : '',
                      tf(`Lv.${s.unlockLevel} 解锁`, `Unlocks at Lv.${s.unlockLevel}`),
                      s.desc,
                      s.reason ? tf(`定制依据：${s.reason}`, `Basis: ${s.reason}`) : '',
                    ].filter(Boolean).join('\n')
                    return (
                      <div
                        key={`${s.name}-${i}`}
                        className={`skill ${s.unlocked ? '' : 'locked'}`}
                        title={s.unlocked ? tip : tf(`Lv.${s.unlockLevel} 解锁 · ${s.name}`, `Unlocks at Lv.${s.unlockLevel} · ${s.name}`)}
                        style={s.element ? { '--skill-color': s.element.color } : undefined}
                      >
                        <span className="skill-dot" />
                        <span className="skill-name">{s.unlocked ? s.name : `Lv.${s.unlockLevel}`}</span>
                        {s.unlocked && s.power != null && <span className="skill-power">{s.power}</span>}
                      </div>
                    )
                  })}
                </div>

                {(pet.traits?.length > 0 || pet.traitHints?.filter((h) => h.fix).length > 0) && (
                  <div className="traits">
                    {pet.traits.slice(0, 3).map((t) => (
                      <span key={t.key} className={`trait-chip ${t.kind}`} title={`${t.desc}\n${tf('触发：', 'Trigger: ')}${t.reason}`}>
                        {t.kind === 'negative' ? '▾' : '▴'} {t.name}
                      </span>
                    ))}
                    {pet.traitHints?.filter((h) => h.fix).slice(0, 1).map((h) => (
                      <span className="trait-fix-inline" key={h.name} title={h.fix}>?</span>
                    ))}
                  </div>
                )}

                <div className="quality-dims">
                  {pet.qualityDims.map((d) => (
                    <div key={d.key} className="qd" title={`${d.name} ${d.value}`}>
                      <div className="qd-bar"><div style={{ width: `${d.value}%`, background: q.color }} /></div>
                      <span className="qd-name">{d.name}</span>
                    </div>
                  ))}
                </div>

                <div className="card-foot">
                  <span>{tf('品质', 'Quality')} {pet.qualityScore} · {tf('工程量', 'Engineering')} {pet.engineeringScore} · {tf('战力', 'Power')} {pet.combatPower ?? '—'}</span>
                  <span className="card-foot-right">
                    <a
                      className="card-repo-url"
                      href={repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={repoUrl}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {repoUrl}
                    </a>
                    <span className="card-foot-stars">· ★{pet.stars}</span>
                  </span>
                </div>
              </div>
              <div className="card__shine" />
              <div className="card__glare" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
