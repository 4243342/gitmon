import { useEffect, useMemo, useRef, useState } from 'react'
import PixelSprite from './PixelSprite.jsx'
import {
  STATUS_INFO,
  battleTurn,
  createBattle,
  benchOf,
  effectivenessLabel,
  hpPercent,
  moveEffectiveness,
} from '../battle.js'
import { pickRivalTeam, rivalTeamLabel } from '../rivals.js'

const DIFFICULTIES = [
  { key: 'easy', name: '新手', desc: '对手等级约 55%' },
  { key: 'normal', name: '相当', desc: '对手等级相当' },
  { key: 'hard', name: '强敌', desc: '对手等级约 180%' },
]

const XP_BASE = { easy: 90, normal: 150, hard: 240 }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function unitPet(unit) {
  return {
    spriteSeed: unit.spriteSeed,
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
    <div className={`unit-panel ${side} ${shaking ? 'is-hit' : ''}`}>
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

function MoveButton({ move, foe, disabled, onClick }) {
  const mult = moveEffectiveness(move, foe)
  const hint = mult === 0 ? '无效' : mult > 1 ? effectivenessLabel(mult) : mult < 1 ? '效果不佳' : ''
  return (
    <button
      className={`move-btn ${move.category} ${disabled ? 'disabled' : ''} ${mult === 0 ? 'no-effect' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="move-head">
        <span className="move-name">{move.name}</span>
        <span className="move-type" style={{ color: move.type === foe?.types?.[0] ? '#ffd166' : undefined }}>{move.label}</span>
      </span>
      <span className="move-meta">
        <span>威力 {move.power}</span>
        <span>命中 {move.acc}</span>
        <span>PP {move.pp}/{move.maxPp}</span>
      </span>
      {hint && <span className={`move-hint ${mult > 1 ? 'good' : mult === 0 ? 'none' : 'bad'}`}>{hint}</span>}
    </button>
  )
}

function TeamPicker({ pets, team, setTeam, difficulty, setDifficulty, onStart, onExit }) {
  const toggle = (pet) => {
    const exists = team.some((p) => p.fullName === pet.fullName && p.platform === pet.platform)
    if (exists) setTeam(team.filter((p) => !(p.fullName === pet.fullName && p.platform === pet.platform)))
    else if (team.length < 3) setTeam([...team, pet])
  }

  return (
    <div className="battle-picker">
      <div className="picker-head">
        <h2>竞技场</h2>
        <p>选 1–3 只精灵出战。属性克制、先制、状态与换人都会影响胜负——不是数值碾压就行。</p>
      </div>

      {pets.length === 0 ? (
        <div className="picker-empty">
          <p>图鉴里还没有精灵。</p>
          <button className="primary-btn" onClick={onExit}>先去孵化一只</button>
        </div>
      ) : (
        <>
          <div className="picker-list">
            {pets.map((pet) => {
              const active = team.some((p) => p.fullName === pet.fullName && p.platform === pet.platform)
              return (
                <button
                  key={`${pet.platform}/${pet.fullName}`}
                  className={`picker-card ${active ? 'picked' : ''}`}
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

          <div className="picker-actions">
            <button className="primary-btn" disabled={team.length === 0} onClick={onStart}>
              出战（{team.length}/3）
            </button>
            <button className="ghost-btn" onClick={onExit}>返回</button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Battle({ pets = [], initial = null, onExit, onReward }) {
  const candidates = useMemo(() => {
    const list = [...pets]
    if (initial && !list.some((p) => p.fullName === initial.fullName)) list.unshift(initial)
    return list
  }, [pets, initial])

  const [phase, setPhase] = useState('select')
  const [team, setTeam] = useState(() => (initial ? [initial] : candidates.slice(0, 3)))
  const [difficulty, setDifficulty] = useState('normal')
  const [state, setState] = useState(null)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [fx, setFx] = useState({ player: null, enemy: null })
  const [shake, setShake] = useState({ player: false, enemy: false })
  const [showBench, setShowBench] = useState(false)
  const [reward, setReward] = useState(0)
  const [lunging, setLunging] = useState(null)
  const [hurt, setHurt] = useState({ player: false, enemy: false })
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
    }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const playerUnit = state ? state.sides.player.team[state.sides.player.active] : null
  const enemyUnit = state ? state.sides.enemy.team[state.sides.enemy.active] : null

  const start = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    const enemies = pickRivalTeam(team, seed, difficulty).slice(0, Math.max(1, team.length))
    const built = createBattle({
      playerTeam: team,
      enemyTeam: enemies,
      seed,
      difficulty,
      playerName: '你',
      enemyName: '对手',
    })
    rewardedRef.current = false
    setReward(0)
    setState(built.state)
    setLog(built.events.map((e) => e.text))
    setPhase('fight')
    setShowBench(false)
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
    setShowBench(false)
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    const { state: next, events } = battleTurn(state, action)
    const schedule = (fn, ms) => timersRef.current.push(setTimeout(fn, ms))
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

    await wait(Math.max(560, at + 200))

    if (next.winner) {
      const xp = Math.round(XP_BASE[difficulty] * (next.winner === 'player' ? 1.4 : 0.6))
      setReward(xp)
      if (!rewardedRef.current) {
        rewardedRef.current = true
        onReward?.(team, xp, next.winner === 'player')
      }
      setPhase('result')
    }
    setBusy(false)
  }

  const switchTo = (index) => {
    act({ type: 'switch', index })
  }

  const bench = state ? benchOf(state, 'player') : []
  const benchIndexes = state
    ? state.sides.player.team.map((u, i) => ({ u, i })).filter(({ u, i }) => i !== state.sides.player.active && !u.fainted)
    : []

  if (phase === 'select') {
    return (
      <main className="battle-wrap">
        <TeamPicker
          pets={candidates}
          team={team}
          setTeam={setTeam}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          onStart={start}
          onExit={onExit}
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
        <span>第 {state.turn + 1} 回合 · {rivalTeamLabel(difficulty)}</span>
        <span className="battle-count">我方 {myTeamAlive} · 对手 {foeTeamAlive}</span>
        <button className="ghost-btn tiny" onClick={onExit}>离开</button>
      </div>

      <div className="battle-field">
        <div className="field-sky" />
        <div className="field-grid" />

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

        <div className="battle-log" ref={logRef}>
          {log.slice(-5).map((line, i, arr) => (
            <p key={`${line}-${i}`} className={i === arr.length - 1 ? 'latest' : ''}>{line}</p>
          ))}
        </div>
      </div>

      {phase === 'result' && (
        <div className="battle-result">
          <h2 className={state.winner === 'player' ? 'win' : 'lose'}>
            {state.winner === 'player' ? '胜利' : '惜败'}
          </h2>
          <p>{state.winner === 'player' ? '对手的仓库被你压了一头。' : '属性与节奏都被对手抓到了。'}</p>
          <p className="reward">全队获得 <b>+{reward} EXP</b></p>
          <div className="actions">
            <button className="primary-btn" onClick={start}>再战一场</button>
            <button className="ghost-btn" onClick={() => setPhase('select')}>换阵容</button>
            <button className="ghost-btn" onClick={onExit}>返回图鉴</button>
          </div>
        </div>
      )}

      <div className="battle-controls">
        <div className="move-grid" style={{ '--mv': playerUnit.element.color }}>
          {playerUnit.moves.map((move, i) => (
            <MoveButton
              key={move.name + i}
              move={move}
              foe={enemyUnit}
              disabled={busy || !!state.winner || !move.unlocked || move.pp <= 0}
              onClick={() => act({ type: 'move', index: i })}
            />
          ))}
        </div>

        <div className="battle-side-actions">
          <button
            className="ghost-btn"
            disabled={busy || !!state.winner || benchIndexes.length === 0}
            onClick={() => setShowBench((v) => !v)}
          >
            换人（{bench.length}）
          </button>
          <span className="battle-tip">
            {[enemyUnit.element.name, enemyUnit.elementSecondary?.name].filter(Boolean).join('/')}系 · 我方速度 {Math.round(playerUnit.stats.spe * (playerUnit.passive === 'static' ? 1.15 : 1))}
          </span>
        </div>

        {showBench && (
          <div className="bench-panel">
            {benchIndexes.map(({ u, i }) => (
              <button key={u.key} className="bench-card" onClick={() => switchTo(i)}>
                <b>{u.name}</b>
                <small>Lv.{u.level} · {u.element.name}系</small>
                <div className="hpbar-track slim">
                  <div className={`hpbar-fill ${hpPercent(u) <= 25 ? 'hp-red' : hpPercent(u) <= 50 ? 'hp-yellow' : 'hp-green'}`} style={{ width: `${hpPercent(u)}%` }} />
                </div>
                <span className="bench-hp">{u.hp}/{u.maxHp}</span>
              </button>
            ))}
            {benchIndexes.length === 0 && <p className="bench-empty">没有可换的精灵了</p>}
          </div>
        )}
      </div>
    </main>
  )
}
