import { useEffect, useMemo, useRef, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import '../battle-arena.css'
import {
  STATUS_INFO,
  battleTurn,
  createBattle,
  hpPercent,
} from '../battle.js'
import {
  matchBuiltinOwnerTeam,
  matchBuiltinRival,
  modeLabel,
  pickRandomTeam,
  pickSameTypeTeam,
  powerOf,
  rivalFromSnapshot,
  rivalPets,
  rivalTeamLabel,
  sameTypePool,
} from '../rivals.js'
import { parseRepoInput, scanOwnerBox, scanRepo } from '../scan.js'
import { bgm } from '../bgm.js'

// 三种挑战：在线对手（输入仓库/账号，真实强度）／同类型（找同属性仓库）／随机宠物
const MODES = [
  {
    key: 'online',
    index: '01',
    name: '在线对手',
    tag: '单项目 1v1 · 整仓全员',
    desc: '填一个仓库打它的单项目，或填一个账号让它的整仓项目排队上。按对方的真实强度来，不设难度。',
  },
  {
    key: 'same',
    index: '02',
    name: '同类型对战',
    tag: '找同属性的仓库',
    desc: '只从和你先发精灵同属性的知名仓库里挑对手。克制关系一眼看得懂，适合摸清属性打法。',
  },
  {
    key: 'random',
    index: '03',
    name: '随机宠物',
    tag: '抽到谁打谁',
    desc: '从全部对手池里随机抽。可能撞上 SSR 巨兽，也可能抽到 N 级小玩意——难度自己定。',
  },
]

const DIFFICULTIES = [
  { key: 'easy', name: '新手', desc: '对手六维 ×0.65' },
  { key: 'normal', name: '相当', desc: '对手原样实力' },
  { key: 'hard', name: '强敌', desc: '对手六维 ×1.35' },
]

const XP_BASE = { easy: 90, normal: 150, hard: 240 }
const ONLINE_XP = { single: 200, team: 280 }

const ONLINE_SIZES = [
  { key: 'single', name: '单项目', hint: '1v1 · 一个仓库' },
  { key: 'team', name: '整仓', hint: '全员 · 整个账号' },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function unitPet(unit) {
  return {
    spriteSeed: unit.spriteSeed,
    // 自定义形象按 platform + fullName 索引，必须透传
    platform: unit.platform,
    fullName: unit.fullName,
    element: { key: unit.element.key, name: unit.element.name, color: unit.element.color },
    elementSecondary: unit.elementSecondary,
    species: unit.species,
    evolutionStage: unit.evolutionStage,
  }
}

function typeChips(unit) {
  const chips = [{ key: unit.element.key, name: unit.element.name, color: unit.element.color }]
  if (unit.elementSecondary) chips.push({ key: unit.elementSecondary.key, name: unit.elementSecondary.name, color: unit.elementSecondary.color })
  return chips
}

function HPBar({ unit, side }) {
  const pct = hpPercent(unit)
  const low = pct <= 25
  return (
    <div className={`hpbar ${low ? 'hpbar-low' : ''}`}>
      <span className="hp-label">HP</span>
      <div className="hpbar-track">
        <div
          className={`hpbar-fill ${pct <= 20 ? 'hp-red' : pct <= 50 ? 'hp-yellow' : 'hp-green'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="hpbar-num">{unit.hp} / {unit.maxHp}</span>
    </div>
  )
}

function UnitPanel({ unit, side, fx, shaking }) {
  const status = unit.status ? STATUS_INFO[unit.status] : null
  return (
    <div
      className={`unit-panel ${side} ${shaking ? 'is-hit' : ''}`}
      style={{ '--unit-color': unit.element.color }}
    >
      <div className="unit-top">
        <div className="unit-name-row">
          <span className="unit-name">{unit.name}</span>
          <span className="unit-level">Lv.{unit.level}</span>
          <span className={`mini-quality q-${unit.qualityKey}`}>{unit.qualityKey}</span>
        </div>
        <div className="unit-tags">
          {typeChips(unit).map((t) => (
            <span key={t.key} className="type-chip" style={{ color: t.color, borderColor: `${t.color}66` }}>{t.name}</span>
          ))}
          {status && <span className="status-chip" style={{ color: status.color, borderColor: `${status.color}66` }}>{status.name}</span>}
          <span className="passive-chip" title={unit.passiveInfo?.desc}>{unit.passiveInfo?.name}</span>
        </div>
      </div>
      <HPBar unit={unit} side={side} />
      {fx && (
        <span key={fx.id} className={`damage-float ${fx.mult > 1 ? 'super' : fx.mult < 1 ? 'weak' : ''} ${fx.crit ? 'crit' : ''}`}>
          -{fx.value}
        </span>
      )}
    </div>
  )
}

function EmptyState({ onExit }) {
  return (
    <div className="picker-empty">
      <p>图鉴里还没有精灵。</p>
      <button className="primary-btn" onClick={onExit}>先去抽一只</button>
    </div>
  )
}

// 第一步：选挑战方式
function ModePicker({ pets, onPick, onExit }) {
  return (
    <div className="battle-picker">
      <div className="picker-head">
        <h2>竞技场</h2>
        <p>挑一种挑战方式。在线对手打的是对方仓库的真实实力；同类型和随机宠物可以自己定难度。开战后双方自动出招，无需点技能。</p>
      </div>

      {pets.length === 0 ? (
        <EmptyState onExit={onExit} />
      ) : (
        <div className="mode-grid">
          {MODES.map((m) => (
            <button key={m.key} className={`mode-card mode-${m.key}`} onClick={() => onPick(m.key)}>
              <span className="mode-top">
                <span className="mode-index">{m.index}</span>
                <span className="mode-go">选择 →</span>
              </span>
              <span className="mode-title">{m.name}</span>
              <span className="mode-tag">{m.tag}</span>
              <span className="mode-desc">{m.desc}</span>
              <span className="mode-foot">
                {m.key === 'online' ? '1v1 · 固定真实强度' : '1–3v1–3 · 可选难度'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="picker-actions">
        <button className="ghost-btn" onClick={onExit}>返回</button>
      </div>
    </div>
  )
}

// 在线对手：单项目（一个仓库 1v1）／整仓（一个账号的全部项目 3v3）
function OnlineSetup({ size, setSize, repoInput, setRepoInput, onScan, scanning, scanError, opponent, ownerTeam, opponentNote, onClear }) {
  const isTeam = size === 'team'
  const hasOpponent = isTeam ? ownerTeam.length > 0 : !!opponent
  return (
    <div className="online-setup">
      <div className="size-toggle">
        {ONLINE_SIZES.map((s) => (
          <button
            key={s.key}
            className={`size-btn ${size === s.key ? 'on' : ''}`}
            onClick={() => setSize(s.key)}
            disabled={scanning}
          >
            <b>{s.name}</b>
            <small>{s.hint}</small>
          </button>
        ))}
      </div>

      <div className="repo-row">
        <input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !scanning) onScan() }}
          placeholder={isTeam ? '对方账号：github.com/owner（也可填仓库，按它的账号整仓出战）' : '对方的仓库：https://github.com/owner/repo'}
          spellCheck={false}
          disabled={scanning}
        />
        <button className="primary-btn" onClick={onScan} disabled={scanning}>
          {scanning ? (isTeam ? '整仓扫描中…' : '扫描中…') : hasOpponent ? '重新扫描' : isTeam ? '扫描整仓' : '扫描仓库'}
        </button>
      </div>
      {scanError && <p className="online-error">! {scanError}</p>}

      {isTeam ? (
        ownerTeam.length > 0 ? (
          <div className="opponent-team">
            <div className="opponent-team-head">
              <span>整仓出战 · {ownerTeam.length} 个项目</span>
              <span className="opponent-source">{opponentNote}</span>
              <button className="ghost-btn tiny" onClick={onClear}>换一个</button>
            </div>
            <div className="opponent-team-list">
              {ownerTeam.map((p) => (
                <div key={p.fullName} className="opponent-card mini">
                  <PixelSprite pet={p} size={54} animate={false} />
                  <div className="opponent-info">
                    <div className="opponent-name">
                      <b>{p.repo}</b>
                      <span className={`mini-quality q-${p.qualityKey}`}>{p.qualityKey}</span>
                    </div>
                    <small>Lv.{p.level} · {p.element.name}系</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="online-hint">
            整仓 = 对方账号下的项目全部上场，有几只打几只，不设人数上限。整仓按真实数值打，不叠难度；扫描会消耗 API 额度，内置快照账号可离线直接打。
          </p>
        )
      ) : opponent ? (
        <div className="opponent-card">
          <PixelSprite pet={opponent} size={76} animate={false} />
          <div className="opponent-info">
            <div className="opponent-name">
              <b>{opponent.fullName || opponent.repo}</b>
              <span className={`mini-quality q-${opponent.qualityKey}`}>{opponent.qualityKey}</span>
            </div>
            <small>
              Lv.{opponent.level} · {opponent.element.name}系
              {opponent.elementSecondary ? `/${opponent.elementSecondary.name}` : ''} · {opponent.species?.name}
            </small>
            <span className="opponent-source">{opponentNote}</span>
          </div>
          <button className="ghost-btn tiny" onClick={onClear}>换一个</button>
        </div>
      ) : (
        <p className="online-hint">
          单项目 PK 只打对方一个仓库，按仓库真实数值生成，等级、品质、六维都是它自己的，不叠加难度系数。已经内置快照的仓库可以离线直接打。
        </p>
      )}
    </div>
  )
}

function Setup({ mode, pets, team, setTeam, difficulty, setDifficulty, onStart, onBack, onExit, online }) {
  const onlineCap = online.size === 'team' ? Math.max(1, online.ownerTeam.length) : 1
  const cap = mode === 'online' ? onlineCap : 3
  const toggle = (pet) => {
    const exists = team.some((p) => p.fullName === pet.fullName && p.platform === pet.platform)
    if (exists) setTeam(team.filter((p) => !(p.fullName === pet.fullName && p.platform === pet.platform)))
    else if (team.length < cap) setTeam([...team, pet])
  }

  const lead = team[0]
  const samePool = useMemo(
    () => (mode === 'same' && lead ? sameTypePool(lead.element?.key) : []),
    [mode, lead],
  )

  const modeInfo = MODES.find((m) => m.key === mode)
  const hasEnemy = online.size === 'team' ? online.ownerTeam.length > 0 : !!online.opponent
  const ready = team.length > 0 && (mode !== 'online' || hasEnemy)

  return (
    <div className="battle-picker">
      <button className="back-link" onClick={onBack}>← 换挑战方式</button>

      <div className="picker-head">
        <h2>{modeInfo.name}</h2>
        <p>{modeInfo.desc}</p>
      </div>

      {mode === 'online' && <OnlineSetup {...online} />}

      {mode === 'same' && (
        <div className="same-type-bar">
          {lead ? (
            <>
              <span className="same-label">你的先发属性</span>
              <span className="type-chip big" style={{ color: lead.element.color, borderColor: `${lead.element.color}66` }}>
                {lead.element.name}系
              </span>
              <span className="same-pool">
                同属性仓库 {samePool.length} 个：
                {samePool.slice(0, 6).map((p) => p.repo).join(' · ')}
                {samePool.length > 6 ? ' …' : ''}
              </span>
            </>
          ) : (
            <span className="same-pool">先选一只精灵，我再去找和它同属性的仓库。</span>
          )}
        </div>
      )}

      {mode === 'random' && (
        <div className="same-type-bar">
          <span className="same-label">对手池</span>
          <span className="same-pool">全部 {rivalPets().length} 只知名仓库精灵随机抽取，抽到谁都事先不知道。</span>
        </div>
      )}

      <div className="picker-subhead">
        <span>出战精灵（{team.length}/{cap}）</span>
        {mode === 'online' && (
          <em>
            {online.size === 'team'
              ? `整仓 ${cap}v${cap}：对方账号下每个项目一只`
              : '单项目 1v1：只能带一只'}
          </em>
        )}
      </div>

      {pets.length === 0 ? (
        <EmptyState onExit={onExit} />
      ) : (
        <div className="picker-list">
          {pets.map((pet) => {
            const active = team.some((p) => p.fullName === pet.fullName && p.platform === pet.platform)
            const blocked = !active && team.length >= cap
            return (
              <button
                key={`${pet.platform}/${pet.fullName}`}
                className={`picker-card ${active ? 'picked' : ''} ${blocked ? 'blocked' : ''}`}
                onClick={() => toggle(pet)}
              >
                <PixelSprite pet={pet} size={64} animate={false} />
                <span className="picker-info">
                  <b>{pet.repo}</b>
                  <small>Lv.{pet.level} · {pet.element.name}系 · {pet.quality.key}</small>
                </span>
                <span className="picker-check">{active ? '✓' : '+'}</span>
              </button>
            )
          })}
        </div>
      )}

      {mode !== 'online' ? (
        <div className="difficulty-row">
          <span className="difficulty-label">对手强度</span>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              className={`diff-btn ${difficulty === d.key ? 'on' : ''}`}
              onClick={() => setDifficulty(d.key)}
            >
              {d.name}
              <small>{d.desc}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="difficulty-row">
          <span className="difficulty-label">对手强度</span>
          <span className="fixed-diff">在线对战按仓库真实实力，不设难度</span>
        </div>
      )}

      <div className="picker-actions">
        <button className="primary-btn" disabled={!ready} onClick={onStart}>
          {mode === 'online'
            ? online.size === 'team'
              ? online.ownerTeam.length ? `整仓出战（${team.length}/${cap}）` : '先扫描整仓'
              : online.opponent ? `挑战 ${online.opponent.repo}` : '先扫描对手仓库'
            : `出战（${team.length}/${cap}）`}
        </button>
        <button className="ghost-btn" onClick={onExit}>返回</button>
      </div>
    </div>
  )
}

export default function Battle({ pets = [], initial = null, onExit, onReward }) {
  const candidates = useMemo(() => {
    const list = [...pets]
    if (initial && !list.some((p) => p.fullName === initial.fullName)) list.unshift(initial)
    return list
  }, [pets, initial])

  const [phase, setPhase] = useState('mode') // mode | select | fight | result
  const [mode, setMode] = useState('random')
  const [team, setTeam] = useState(() => (initial ? [initial] : candidates.slice(0, 3)))
  const [difficulty, setDifficulty] = useState('normal')
  const [state, setState] = useState(null)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [fx, setFx] = useState({ player: null, enemy: null })
  const [shake, setShake] = useState({ player: false, enemy: false })
  const [reward, setReward] = useState(0)
  const [lunging, setLunging] = useState(null)
  const [hurt, setHurt] = useState({ player: false, enemy: false })
  // 快进：跳过逐帧演出，点一下就结算整回合（偏好记住，下次进来还是快进）
  const [fast, setFast] = useState(() => {
    try { return localStorage.getItem('gitmon:battle:fast') === '1' } catch { return false }
  })

  const toggleFast = () => setFast((prev) => {
    const next = !prev
    try { localStorage.setItem('gitmon:battle:fast', next ? '1' : '0') } catch { /* 隐私模式忽略 */ }
    return next
  })

  // 在线对手：单项目（一个仓库）／整仓（一个账号的项目）
  const [onlineSize, setOnlineSize] = useState('single')
  const [repoInput, setRepoInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [opponent, setOpponent] = useState(null)
  const [ownerTeam, setOwnerTeam] = useState([])
  const [opponentNote, setOpponentNote] = useState('')

  const rewardedRef = useRef(false)
  const logRef = useRef(null)
  const fxLayerRef = useRef(null)
  const playerSlotRef = useRef(null)
  const enemySlotRef = useRef(null)
  const timersRef = useRef([])
  const vfxRef = useRef(null)

  // 特效层单独拆包：不进首屏，进竞技场时才加载（pixelfx 的 30+ 个特效模块约 240KB）
  useEffect(() => {
    let alive = true
    import('../vfx.js').then((mod) => {
      if (alive) vfxRef.current = mod
    })
    return () => {
      alive = false
      timersRef.current.forEach(clearTimeout)
      vfxRef.current?.clearFx(fxLayerRef.current)
      // 离开战场一定要收掉循环，否则 BGM 会跟到别的页面
      bgm.stop()
    }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const playerUnit = state ? state.sides.player.team[state.sides.player.active] : null
  const enemyUnit = state ? state.sides.enemy.team[state.sides.enemy.active] : null

  const pickMode = (key) => {
    setMode(key)
    setPhase('select')
    setScanError('')
    // 在线对战 1v1：多带的先收回去
    if (key === 'online' && team.length > 1) setTeam(team.slice(0, 1))
  }

  const clearOpponent = () => {
    setOpponent(null)
    setOwnerTeam([])
    setOpponentNote('')
  }

  // 整仓扫完后按对手人数补满我方队伍（玩家进模式时被单项目裁到 1 只，这里再补回来）
  const fillTeam = (count) => {
    setTeam((prev) => {
      const out = [...prev]
      for (const p of candidates) {
        if (out.length >= count) break
        if (!out.some((x) => x.fullName === p.fullName && x.platform === p.platform)) out.push(p)
      }
      return out.slice(0, count)
    })
  }

  // 切换单项目 / 整仓：单项目只能留一只，整仓不设上限（对方多少项目就上多少只）
  const changeOnlineSize = (size) => {
    setOnlineSize(size)
    setScanError('')
    clearOpponent()
    if (size === 'single' && team.length > 1) setTeam(team.slice(0, 1))
  }

  const scanOpponent = async () => {
    const raw = repoInput.trim()
    if (!raw) { setScanError(onlineSize === 'team' ? '先填一个账号或仓库地址' : '先填一个仓库地址'); return }
    const info = parseRepoInput(raw)
    if (!info) { setScanError('无法识别的地址，请输入 GitHub / Gitee 仓库或账号链接'); return }

    setScanError('')
    setScanning(true)
    try {
      // ① 单项目：只打对方一个仓库
      if (onlineSize === 'single') {
        if (info.kind !== 'repo') throw new Error('单项目 PK 需要具体仓库地址，例如 github.com/owner/repo')
        const builtin = matchBuiltinRival(info.platform, info.fullName)
        if (builtin) {
          setOpponent(builtin)
          setOpponentNote('内置快照 · 离线可打')
          return
        }
        const snap = await scanRepo(raw)
        setOpponent(rivalFromSnapshot(snap))
        setOpponentNote(snap.cached ? '线上数据 · 本地缓存' : '线上数据 · 刚刚扫描')
        return
      }

      // ② 整仓：对方账号下的全部项目依次上场（填仓库时按它的账号算）
      const owner = info.owner
      const platform = info.platform
      const localTeam = matchBuiltinOwnerTeam(platform, owner)
      if (localTeam.length >= 2) {
        setOwnerTeam(localTeam)
        fillTeam(localTeam.length)
        setOpponentNote(`内置快照 · ${owner} 的 ${localTeam.length} 个项目`)
        return
      }
      const res = await scanOwnerBox({ kind: 'owner', platform, owner }, { limit: 30 })
      if (!res.snaps.length) {
        throw new Error(res.rateLimited
          ? 'API 触发限流，稍后再试（设置 Token 可提高额度）'
          : '这个账号没有可挑战的公开项目')
      }
      const pets = res.snaps
        .map((s) => rivalFromSnapshot(s))
        .sort((a, b) => powerOf(b) - powerOf(a))
      if (!pets.length) throw new Error('这个账号没有可挑战的公开项目')
      setOwnerTeam(pets)
      fillTeam(pets.length)
      setOpponentNote(`线上数据 · ${owner} 的 ${pets.length} 个项目`)
    } catch (e) {
      setScanError(e.message || '扫描失败，请检查地址')
    } finally {
      setScanning(false)
    }
  }

  const start = () => {
    if (!team.length) return
    const teamMode = mode === 'online' && onlineSize === 'team'
    if (mode === 'online') {
      if (teamMode ? !ownerTeam.length : !opponent) return
    }

    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const cap = mode === 'online' ? (teamMode ? Math.max(1, ownerTeam.length) : 1) : 3
    let enemies
    if (mode === 'online') enemies = teamMode ? ownerTeam : [opponent]
    else if (mode === 'same') enemies = pickSameTypeTeam(team, seed, difficulty, cap)
    else enemies = pickRandomTeam(team, seed, difficulty, cap)
    if (!enemies.length) return

    // 对手几只、我方就上几只（整仓没扫满 3 个时不会出现以多打少）
    const line = team.slice(0, Math.max(1, Math.min(cap, enemies.length)))
    const foes = enemies.slice(0, Math.max(1, line.length))

    const built = createBattle({
      playerTeam: line,
      enemyTeam: foes,
      seed,
      // 在线对手不吃难度系数，AI 用标准水平
      difficulty: mode === 'online' ? 'normal' : difficulty,
      playerName: '你',
      enemyName: '对手',
    })
    rewardedRef.current = false
    setReward(0)
    setState(built.state)
    setLog(built.events.map((e) => e.text))
    setPhase('fight')
    // 开战按钮是用户手势，在这里起 BGM 才能解锁 AudioContext
    bgm.startBattle()
  }

  const flash = (side, ev) => {
    if (!ev) return
    setFx((prev) => ({ ...prev, [side]: { id: `${Date.now()}-${Math.random()}`, value: ev.value, mult: ev.mult, crit: ev.crit } }))
    setShake((prev) => ({ ...prev, [side]: true }))
    setTimeout(() => setShake((prev) => ({ ...prev, [side]: false })), 380)
    setTimeout(() => setFx((prev) => ({ ...prev, [side]: null })), 900)
  }

  const act = async (action) => {
    if (!state || state.winner || busy) return
    setBusy(true)
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    const { state: next, events } = battleTurn(state, action)
    // 快进模式：不排任何演出定时器，回合点完即刻结算
    const schedule = fast ? () => {} : (fn, ms) => timersRef.current.push(setTimeout(fn, ms))
    const slotOf = (side) => (side === 'player' ? playerSlotRef : enemySlotRef)

    setState(next)
    setLog((prev) => [...prev, ...events.map((e) => e.text)].slice(-40))

    // 按事件顺序重放：出手 → 命中 → 倒下 / 换人，特效跟着事件走而不是一次性全炸
    let at = 80
    events.forEach((ev) => {
      if (ev.t === 'move') {
        const target = ev.side === 'player' ? 'enemy' : 'player'
        schedule(() => {
          setLunging(ev.side)
          vfxRef.current?.playAttack(fxLayerRef.current, slotOf(target).current, {
            element: ev.move?.type,
            power: ev.move?.power ?? 65,
            seed: (Date.now() ^ Math.floor(Math.random() * 1e6)) >>> 0,
          })
          setTimeout(() => setLunging(null), 300)
        }, at)
        at += 360
      } else if (ev.t === 'damage') {
        schedule(() => {
          flash(ev.side, ev)
          setHurt((prev) => ({ ...prev, [ev.side]: true }))
          setTimeout(() => setHurt((prev) => ({ ...prev, [ev.side]: false })), 320)
          if (ev.crit) vfxRef.current?.playCrit(fxLayerRef.current, slotOf(ev.side).current)
        }, at)
        at += 240
      } else if (ev.t === 'faint') {
        schedule(() => vfxRef.current?.playFaint(fxLayerRef.current, slotOf(ev.side).current), at)
        at += 220
      } else if (ev.t === 'switch') {
        schedule(() => vfxRef.current?.playSwitchIn(fxLayerRef.current, slotOf(ev.side).current), at)
        at += 180
      }
    })

    await wait(fast ? 0 : Math.max(560, at + 200))

    if (next.winner) {
      const base = mode === 'online' ? ONLINE_XP[onlineSize] : XP_BASE[difficulty]
      const xp = Math.round(base * (next.winner === 'player' ? 1.4 : 0.6))
      setReward(xp)
      if (!rewardedRef.current) {
        rewardedRef.current = true
        onReward?.(team, xp, next.winner === 'player')
      }
      setPhase('result')
      // 循环收尾，换成一段胜利/失败的小结句
      bgm.stop()
      if (next.winner === 'player') bgm.victory()
      else bgm.defeat()
    }
    setBusy(false)
  }

  // 自动对战：进入战斗后按节奏自动出招 / 换人，直到分出胜负，全程无需点击
  useEffect(() => {
    if (phase !== 'fight' || !state || state.winner || busy) return undefined
    const t = setTimeout(() => act({ type: 'auto' }), fast ? 160 : 780)
    return () => clearTimeout(t)
  }, [phase, state, busy, fast])

  // 键盘：F 切换快进（输入框里不抢键）
  useEffect(() => {
    if (phase !== 'fight' || !state || state.winner) return undefined
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFast() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, state, fast])

  if (phase === 'mode') {
    return (
      <main className="battle-wrap">
        <ModePicker pets={candidates} onPick={pickMode} onExit={onExit} />
      </main>
    )
  }

  if (phase === 'select') {
    return (
      <main className="battle-wrap">
        <Setup
          mode={mode}
          pets={candidates}
          team={team}
          setTeam={setTeam}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStart={start}
          onBack={() => setPhase('mode')}
          onExit={onExit}
          online={{
            size: onlineSize,
            setSize: changeOnlineSize,
            repoInput,
            setRepoInput,
            onScan: scanOpponent,
            scanning,
            scanError,
            opponent,
            ownerTeam,
            opponentNote,
            onClear: clearOpponent,
          }}
        />
      </main>
    )
  }

  if (!state || !playerUnit || !enemyUnit) return null

  const myTeamAlive = state.sides.player.team.filter((u) => !u.fainted).length
  const foeTeamAlive = state.sides.enemy.team.filter((u) => !u.fainted).length

  return (
    <main className="battle-wrap">
      <div className="battle-topbar">
        <span className="hud-turn">TURN {String(state.turn + 1).padStart(2, '0')}</span>
        <span>{rivalTeamLabel(difficulty, mode, onlineSize)}</span>
        <span className="hud-dots" title={`我方存活 ${myTeamAlive}`}>
          {state.sides.player.team.map((u, i) => <i key={i} className={u.fainted ? 'down' : ''} />)}
        </span>
        <span className="hud-vs">VS</span>
        <span className="hud-dots foe" title={`对手存活 ${foeTeamAlive}`}>
          {state.sides.enemy.team.map((u, i) => <i key={i} className={u.fainted ? 'down' : ''} />)}
        </span>
        <span className="hud-actions">
          <button className={`hud-btn ${fast ? 'on' : ''}`} onClick={toggleFast} title="跳过出手演出，点一下立即结算（F）">
            » {fast ? '快进中' : '快进'}
          </button>
          <button className="ghost-btn tiny" onClick={onExit}>离开</button>
        </span>
      </div>

      <div className="battle-field">
        <div className="field-sky" />
        <div className="field-grid" />
        <div className="arena-sparks" aria-hidden="true"><i /><i /><i /><i /><i /></div>

        <div className="battle-row enemy-row">
          <div
            ref={enemySlotRef}
            className={`sprite-slot enemy-slot ${lunging === 'enemy' ? 'is-attacking' : ''} ${hurt.enemy ? 'is-hurt' : ''}`}
          >
            <PixelSprite pet={unitPet(enemyUnit)} size={148} />
          </div>
          <UnitPanel unit={enemyUnit} side="enemy" fx={fx.enemy} shaking={shake.enemy} />
        </div>

        <div className="battle-row player-row">
          <UnitPanel unit={playerUnit} side="player" fx={fx.player} shaking={shake.player} />
          <div
            ref={playerSlotRef}
            className={`sprite-slot player-slot ${lunging === 'player' ? 'is-attacking' : ''} ${hurt.player ? 'is-hurt' : ''}`}
          >
            <PixelSprite pet={unitPet(playerUnit)} size={182} />
          </div>
        </div>

        <div className="vfx-layer" ref={fxLayerRef} />
      </div>

      {/* 战报独立成播报条，不再压在精灵身上当调试日志 */}
      <div className="battle-log" ref={logRef} aria-live="polite">
        {log.slice(-4).map((line, i, arr) => (
          <p key={`${log.length - arr.length + i}-${line}`} className={i === arr.length - 1 ? 'latest' : ''}>{line}</p>
        ))}
      </div>

      {phase === 'result' && (
        <div className={`battle-result ${state.winner === 'player' ? 'win' : 'lose'}`}>
          <div className="result-card">
            <div className="result-mark" aria-hidden="true">{state.winner === 'player' ? '✦' : '◇'}</div>
            <h2 className={state.winner === 'player' ? 'win' : 'lose'}>
              {state.winner === 'player' ? '胜利' : '惜败'}
            </h2>
            <p>{state.winner === 'player' ? '对手的仓库被你压了一头。' : '属性与节奏都被对手抓到了。'}</p>
            <div className="result-stats">
              <span>回合<b>{state.turn}</b></span>
              <span>存活<b>{myTeamAlive}</b></span>
              <span>击倒<b>{state.sides.enemy.team.filter((u) => u.fainted).length}</b></span>
            </div>
            <p className="reward">全队获得 <b>+{reward} EXP</b></p>
            <div className="actions">
              <button className="primary-btn" onClick={start}>{mode === 'random' ? '再抽一只' : '再战一场'}</button>
              <button className="ghost-btn" onClick={() => setPhase('select')}>换阵容</button>
              <button className="ghost-btn" onClick={() => setPhase('mode')}>换模式</button>
              <button className="ghost-btn" onClick={onExit}>返回图鉴</button>
            </div>
          </div>
        </div>
      )}

      <div className="battle-controls auto-controls">
        <div className="control-head">
          <span className="control-title">
            {state.winner ? '战斗结束' : busy ? '自动结算中…' : '自动对战中'}
          </span>
          <span className="control-hint">AI 自动挑招式 / 换人 · <kbd>F</kbd> 快进</span>
        </div>
        <div className="auto-status">
          <span className={`auto-pulse ${state.winner ? 'done' : ''}`} aria-hidden="true" />
          <span className="auto-unit">
            <b>{playerUnit.name}</b>
            <small>Lv.{playerUnit.level} · 战力 {playerUnit.combatPower} · HP {playerUnit.hp}/{playerUnit.maxHp}</small>
          </span>
          <span className="auto-vs">VS</span>
          <span className="auto-unit foe">
            <b>{enemyUnit.name}</b>
            <small>Lv.{enemyUnit.level} · 战力 {enemyUnit.combatPower} · HP {enemyUnit.hp}/{enemyUnit.maxHp}</small>
          </span>
        </div>
        <div className="battle-side-actions">
          <span className="battle-tip">
            {[enemyUnit.element.name, enemyUnit.elementSecondary?.name].filter(Boolean).join('/')}系 · 我方速度 {Math.round(playerUnit.stats.spe * (playerUnit.passive === 'static' ? 1.15 : 1))}
            {mode !== 'online' && ` · ${modeLabel(mode)}`}
          </span>
        </div>
      </div>
    </main>
  )
}
