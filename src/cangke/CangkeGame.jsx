/* 仓可梦 · 像素版 —— 游戏主体
 *
 * 一块 320×208 的像素画布跑地图，战斗用 DOM 面板（中文像素字体更清楚）。
 * 玩法照口袋妖怪那套来：走草丛遇野怪 → 回合制 → 打残了扔球抓 → 升级进化。
 * 队伍 / 精灵球 / 位置存在 localStorage，关掉再进来接着走。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { drawSprite } from '../sprite.js'
import {
  TILE, VIEW_W, VIEW_H, MAP_W, MAP_H,
  PLAYER_START, NPCS, blockedAt, isTallGrass, isHealTile, zoneAt, drawWorld,
} from './world.js'
import {
  makeMon, gainExp, damageOf, captureChance, randomWild, healParty,
  spriteOf, elementName, elementColor, DEX,
} from './mons.js'
import './cangke.css'

const CW = VIEW_W * TILE
const CH = VIEW_H * TILE
const STEP_MS = 145
const SAVE_KEY = 'gitmon:cangke/v1'
const BALL_NAME = '精灵球'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function newGame() {
  // 初始精灵直接给 Lv.10：金波姆在图鉴里是垫底那一档，等级补一点才够打村口 Lv.2–5 的野怪
  const party = [makeMon(1, 10)]
  return {
    party,
    active: 0,
    balls: 12,
    seen: new Set([1]),
    player: { tx: PLAYER_START.x, ty: PLAYER_START.y, dir: 'down' },
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return newGame()
    const data = JSON.parse(raw)
    if (!Array.isArray(data.party) || !data.party.length) return newGame()
    const party = data.party.map((m) => ({ ...makeMon(m.id, m.level), ...m }))
    return {
      party,
      active: clamp(Number(data.active) || 0, 0, party.length - 1),
      balls: Math.max(0, Number(data.balls) || 0),
      seen: new Set(data.seen || []),
      player: {
        tx: Number(data.player?.tx) ?? PLAYER_START.x,
        ty: Number(data.player?.ty) ?? PLAYER_START.y,
        dir: data.player?.dir || 'down',
      },
    }
  } catch {
    return newGame()
  }
}

export default function CangkeGame({ onExit }) {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const keysRef = useRef(new Set())
  const aliveRef = useRef(true)
  const spritesRef = useRef({ enemy: null, ally: null })
  const [snap, setSnap] = useState({ phase: 'world', party: [], balls: 0, seen: 0, dialog: null, battle: null, hint: '' })

  // ---- 初始化：读档 + 建立运行时状态
  if (!gameRef.current) {
    const save = loadGame()
    gameRef.current = {
      ...save,
      move: null,
      phase: 'world',
      battle: null,
      dialog: null,
      hint: '',
      tick: 0,
      cam: { x: 0, y: 0 },
      toast: '',
    }
  }

  const playerPos = useCallback(() => {
    const g = gameRef.current
    return { px: g.player.tx * TILE, py: g.player.ty * TILE }
  }, [])

  // ---- 把运行时状态里界面要用的部分镜像给 React
  const sync = useCallback(() => {
    const g = gameRef.current
    const b = g.battle
    setSnap({
      phase: g.phase,
      balls: g.balls,
      seen: g.seen.size,
      hint: g.hint,
      dialog: g.dialog ? { text: g.dialog.lines[g.dialog.index], more: g.dialog.index < g.dialog.lines.length - 1 } : null,
      party: g.party.map((m) => ({
        uid: m.uid, name: m.name, level: m.level, hp: m.hp, maxHp: m.maxHp,
        element: m.element, active: g.party[g.active]?.uid === m.uid,
      })),
      battle: b ? {
        enemy: { name: b.enemy.name, level: b.enemy.level, hp: b.enemy.hp, maxHp: b.enemy.maxHp, element: b.enemy.element },
        ally: { name: b.ally.name, level: b.ally.level, hp: b.ally.hp, maxHp: b.ally.maxHp, element: b.ally.element, exp: b.ally.exp, expToNext: b.ally.expToNext },
        moves: b.ally.moves,
        log: b.log.slice(-1)[0] || '',
        busy: b.busy,
        ended: b.ended,
      } : null,
    })
  }, [])

  const save = useCallback(() => {
    const g = gameRef.current
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        party: g.party.map((m) => ({ ...m })),
        active: g.active,
        balls: g.balls,
        seen: [...g.seen],
        player: g.player,
      }))
    } catch { /* 存不下不影响这一局 */ }
  }, [])

  // ---- 对话
  const say = useCallback((lines) => {
    const g = gameRef.current
    g.dialog = { lines, index: 0 }
    sync()
  }, [sync])

  const advanceDialog = useCallback(() => {
    const g = gameRef.current
    if (!g.dialog) return false
    if (g.dialog.index < g.dialog.lines.length - 1) {
      g.dialog.index += 1
    } else {
      g.dialog = null
    }
    sync()
    return true
  }, [sync])

  // ---- 战斗
  const beginBattle = useCallback((wild) => {
    const g = gameRef.current
    const ally = g.party[g.active]
    g.phase = 'battle'
    g.battle = { enemy: wild, ally, log: [], busy: false, ended: false, fx: { shake: 0, flash: 0, popups: [] }, menu: 'main' }
    g.seen.add(wild.id)

    const enemyCanvas = document.createElement('canvas')
    enemyCanvas.width = 160
    enemyCanvas.height = 160
    drawSprite(enemyCanvas, spriteOf(wild))
    const allyCanvas = document.createElement('canvas')
    allyCanvas.width = 160
    allyCanvas.height = 160
    drawSprite(allyCanvas, spriteOf(ally))
    spritesRef.current = { enemy: enemyCanvas, ally: allyCanvas }
    sync()
  }, [sync])

  const endBattle = useCallback((result) => {
    const g = gameRef.current
    if (g.battle) g.battle.ended = true
    const wasEnemy = g.battle?.enemy
    g.phase = 'world'
    g.battle = null
    g.move = null
    sync()
    save()
    if (result === 'win' && wasEnemy) {
      const zone = zoneAt(g.player.tx, g.player.ty)
      g.hint = `收服机会：${wasEnemy.name} 残血时扔球最稳（当前 ${g.balls} 个）`
      void zone
    }
  }, [save, sync])

  const logBattle = (text) => {
    const g = gameRef.current
    if (!g.battle) return
    g.battle.log.push(text)
    if (g.battle.log.length > 30) g.battle.log.shift()
    sync()
  }

  const popup = (text, x, y, color = '#fff') => {
    const g = gameRef.current
    if (!g.battle) return
    g.battle.fx.popups.push({ text, x, y, color, t: 0 })
  }

  const enemyTurn = async () => {
    const g = gameRef.current
    const b = g.battle
    if (!b || b.ended) return
    const move = b.enemy.moves[Math.floor(Math.random() * b.enemy.moves.length)]
    logBattle(`野生的 ${b.enemy.name} 使出了 ${move.name}！`)
    await sleep(520)
    if (!b.ended) {
      const { dmg, mult } = damageOf(b.enemy, b.ally, move)
      b.ally.hp = Math.max(0, b.ally.hp - dmg)
      b.fx.shake = 1
      popup(`-${dmg}`, 84, 112, mult > 1 ? '#ff8f5a' : mult < 1 ? '#2f6fd0' : '#1b2a3a')
      if (mult > 1) logBattle('效果拔群！')
      else if (mult < 1) logBattle('效果不太好…')
      sync()
      await sleep(520)
    }
    if (b.ally.hp <= 0) {
      logBattle(`${b.ally.name} 倒下了…`)
      await sleep(700)
      const next = g.party.findIndex((m) => m.hp > 0)
      if (next >= 0) {
        g.active = next
        b.ally = g.party[next]
        const c = spritesRef.current.ally
        drawSprite(c, spriteOf(b.ally))
        logBattle(`换上了 ${b.ally.name}！`)
        sync()
        await sleep(600)
      } else {
        logBattle('眼前一黑，被送回了村子…')
        await sleep(800)
        healParty(g.party)
        g.player.tx = PLAYER_START.x
        g.player.ty = PLAYER_START.y
        endBattle('lose')
        say(['你和仓可梦都撑不住了，好在门前的治疗点把大家都救了回来。'])
        return
      }
    }
    b.busy = false
    sync()
  }

  const useMove = async (index) => {
    const g = gameRef.current
    const b = g.battle
    if (!b || b.busy || b.ended) return
    const move = b.ally.moves[index]
    if (!move) return
    b.busy = true
    sync()
    logBattle(`${b.ally.name} 使出了 ${move.name}！`)
    await sleep(420)
    if (b.ended) return

    const { dmg, mult } = damageOf(b.ally, b.enemy, move)
    b.enemy.hp = Math.max(0, b.enemy.hp - dmg)
    b.fx.flash = 1
    popup(`-${dmg}`, 224, 52, mult > 1 ? '#e04a2a' : mult < 1 ? '#2f6fd0' : '#1b2a3a')
    if (mult > 1) logBattle('效果拔群！')
    else if (mult < 1) logBattle('效果不太好…')
    sync()
    await sleep(600)

    if (b.enemy.hp <= 0) {
      logBattle(`野生的 ${b.enemy.name} 倒下了！`)
      const gain = Math.round(b.enemy.level * 9 + b.enemy.maxHp * 0.25)
      const events = gainExp(b.ally, gain)
      sync()
      await sleep(500)
      for (const ev of events) {
        logBattle(ev.text)
        sync()
        await sleep(900)
      }
      logBattle(`${b.ally.name} 获得 ${gain} 点经验。`)
      await sleep(700)
      endBattle('win')
      return
    }
    await enemyTurn()
  }

  const throwBall = async () => {
    const g = gameRef.current
    const b = g.battle
    if (!b || b.busy || b.ended) return
    if (g.balls <= 0) {
      logBattle('精灵球用完了…')
      await enemyTurn()
      return
    }
    b.busy = true
    g.balls -= 1
    sync()
    logBattle(`扔出了${BALL_NAME}！`)
    await sleep(650)
    const chance = captureChance(b.enemy)
    if (Math.random() < chance) {
      logBattle(`咔嗒——收服了 ${b.enemy.name}！`)
      b.fx.flash = 1
      sync()
      await sleep(700)
      if (g.party.length < 6) {
        g.party.push(b.enemy)
        logBattle(`${b.enemy.name} 加入了队伍。`)
      } else {
        logBattle('队伍已经满了，只好把它放回草丛。')
      }
      sync()
      await sleep(600)
      endBattle('catch')
      return
    }
    logBattle('它挣脱了！')
    await sleep(500)
    await enemyTurn()
  }

  const runAway = async () => {
    const g = gameRef.current
    const b = g.battle
    if (!b || b.busy || b.ended) return
    b.busy = true
    sync()
    const speed = (b.ally.spd + 20) / (b.enemy.spd + 20)
    const ok = Math.random() < clamp(0.35 + speed * 0.4, 0.2, 0.95)
    if (ok) {
      logBattle('成功逃走了！')
      sync()
      await sleep(500)
      endBattle('run')
      return
    }
    logBattle('没能逃掉！')
    await sleep(450)
    await enemyTurn()
  }

  const switchTo = async (uid) => {
    const g = gameRef.current
    const b = g.battle
    const idx = g.party.findIndex((m) => m.uid === uid)
    if (idx < 0 || g.party[idx].hp <= 0) return
    if (b) {
      if (b.busy || b.ended) return
      g.active = idx
      b.ally = g.party[idx]
      drawSprite(spritesRef.current.ally, spriteOf(b.ally))
      logBattle(`换上了 ${b.ally.name}！`)
      b.busy = true
      sync()
      await sleep(500)
      await enemyTurn()
      return
    }
    g.active = idx
    sync()
    save()
  }

  // ---- 走动
  const tryStep = useCallback((dir) => {
    const g = gameRef.current
    if (g.phase !== 'world' || g.dialog) return
    const p = g.player
    if (g.move) return
    p.dir = dir
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
    const nx = p.tx + dx
    const ny = p.ty + dy
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return
    if (blockedAt(nx, ny)) {
      // 撞到东西也要转身，但不迈步
      sync()
      return
    }
    g.move = { fromX: p.tx, fromY: p.ty, toX: nx, toY: ny, dir, t: 0 }
    sync()
  }, [sync])

  const onArrive = useCallback(() => {
    const g = gameRef.current
    const p = g.player

    if (isHealTile(p.tx, p.ty)) {
      healParty(g.party)
      save()
      say(['屋门口的垫子暖烘烘的——队伍恢复精神了！'])
      return
    }
    if (isTallGrass(p.tx, p.ty)) {
      const zone = zoneAt(p.tx, p.ty)
      if (Math.random() < 0.16) {
        beginBattle(randomWild(zone.min, zone.max))
        return
      }
      if (Math.random() < 0.06) g.hint = '草丛沙沙作响…好像有东西在附近。'
    }
  }, [beginBattle, save, say])

  const interact = useCallback(() => {
    const g = gameRef.current
    if (g.phase !== 'world') return
    if (advanceDialog()) return
    const p = g.player
    const dx = p.dir === 'left' ? -1 : p.dir === 'right' ? 1 : 0
    const dy = p.dir === 'up' ? -1 : p.dir === 'down' ? 1 : 0
    const npc = NPCS.find((n) => n.x === p.tx + dx && n.y === p.ty + dy)
    if (npc) {
      say(npc.lines)
      return
    }
    // 站在草丛里按 A：提示
    if (isTallGrass(p.tx, p.ty)) say(['草丛很密，往前走两步说不定就会窜出来一只。'])
  }, [advanceDialog, say])

  // ---- 键盘
  useEffect(() => {
    const down = (e) => {
      const g = gameRef.current
      const k = e.key.toLowerCase()
      const dirMap = {
        arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
        arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
      }
      if (dirMap[k]) {
        e.preventDefault()
        keysRef.current.add(dirMap[k])
        if (g.phase === 'world' && !g.dialog) tryStep(dirMap[k])
        return
      }
      if (k === ' ' || k === 'enter') {
        e.preventDefault()
        if (g.phase === 'world') interact()
        else advanceDialog()
        return
      }
      if (k === 'escape') {
        // 交给外层（剧情模式）统一处理退出，这里只拦住浏览器默认行为
        return
      }
    }
    const up = (e) => {
      const k = e.key.toLowerCase()
      const dirMap = {
        arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
        arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
      }
      if (dirMap[k]) keysRef.current.delete(dirMap[k])
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [advanceDialog, interact, tryStep])

  useEffect(() => () => { aliveRef.current = false }, [])

  // ---- 主循环
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    let raf = 0
    let last = performance.now()

    const frame = (now) => {
      const dt = Math.min(64, now - last)
      last = now
      const g = gameRef.current
      g.tick += dt

      // 走动补间
      if (g.move) {
        g.move.t += dt / STEP_MS
        if (g.move.t >= 1) {
          g.player.tx = g.move.toX
          g.player.ty = g.move.toY
          g.move = null
          onArrive()
        }
      }
      const p = g.player
      const fromX = g.move ? g.move.fromX : p.tx
      const fromY = g.move ? g.move.fromY : p.ty
      const toX = g.move ? g.move.toX : p.tx
      const toY = g.move ? g.move.toY : p.ty
      const k = g.move ? Math.min(1, g.move.t) : 1
      const px = (fromX + (toX - fromX) * k) * TILE
      const py = (fromY + (toY - fromY) * k) * TILE

      // 相机：跟住玩家，夹在地图内
      const camTx = clamp(px + TILE / 2 - CW / 2, 0, MAP_W * TILE - CW)
      const camTy = clamp(py + TILE / 2 - CH / 2, 0, MAP_H * TILE - CH)
      g.cam.x += (camTx - g.cam.x) * 0.18
      g.cam.y += (camTy - g.cam.y) * 0.18

      ctx.clearRect(0, 0, CW, CH)
      if (g.phase === 'battle' && g.battle) {
        drawBattle(ctx, g, spritesRef.current, dt)
      } else {
        // 按住方向键就连续走：走到一格后自动迈下一步
        if (!g.move && !g.dialog && keysRef.current.size) {
          const dir = [...keysRef.current].pop()
          tryStep(dir)
        }
        g.cam.x = clamp(g.cam.x, 0, MAP_W * TILE - CW)
        g.cam.y = clamp(g.cam.y, 0, MAP_H * TILE - CH)
        drawWorld(ctx, g.cam, g.tick, {
          px: (g.move ? g.move.fromX + (g.move.toX - g.move.fromX) * k : p.tx) * TILE,
          py: (g.move ? g.move.fromY + (g.move.toY - g.move.fromY) * k : p.ty) * TILE,
          dir: p.dir,
          frame: g.move ? (Math.floor(g.tick / 90) % 2) : 0,
        })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [onArrive, tryStep])

  // 初次进入先给一句提示
  useEffect(() => {
    const g = gameRef.current
    sync()
    if (!g.dialog && g.phase === 'world') {
      g.hint = '方向键 / WASD 走动 · 空格 交谈 · 走进草丛会遇到野生的仓可梦'
      sync()
    }
  }, [sync])

  const inBattle = snap.phase === 'battle' && snap.battle

  // 开发期把运行时挂到 window，方便在控制台 / 自动化脚本里看坐标、队伍与战斗状态
  useEffect(() => {
    if (import.meta.env.DEV) window.__cangke = gameRef.current
  }, [snap])

  return (
    <section className="ck-root" role="dialog" aria-modal="true" aria-label="仓可梦 像素版">
      <div className="ck-topbar">
        <b>仓可梦 · 像素版</b>
        <div className="ck-topbar-right">
          <span className="ck-dex">图鉴 {snap.seen}/{DEX.length}</span>
          <span className="ck-ball-count">◓ {snap.balls}</span>
          <button className="ck-btn ck-btn-ghost" onClick={() => { save(); onExit?.() }}>退出 · Esc</button>
        </div>
      </div>

      <div className="ck-stage">
        <canvas ref={canvasRef} width={CW} height={CH} className="ck-canvas" />

        {/* 队伍小条 */}
        {!inBattle && (
          <div className="ck-party-bar">
            {snap.party.map((m) => (
              <button
                key={m.uid}
                className={`ck-chip${m.active ? ' is-active' : ''}${m.hp <= 0 ? ' is-down' : ''}`}
                onClick={() => switchTo(m.uid)}
                title={`${m.name} Lv.${m.level}`}
              >
                <i style={{ background: elementColor(m.element) }} />
                {m.name}
                <em>{m.hp}/{m.maxHp}</em>
              </button>
            ))}
          </div>
        )}

        {/* 战斗面板 */}
        {inBattle && (
          <>
            <div className="ck-hpbox ck-hpbox-enemy">
              <div className="ck-hpbox-head">
                <span>{snap.battle.enemy.name}</span>
                <em>Lv.{snap.battle.enemy.level}</em>
              </div>
              <div className="ck-hpbar">
                <div style={{ width: `${(snap.battle.enemy.hp / snap.battle.enemy.maxHp) * 100}%` }} />
              </div>
              <span className="ck-hp-num">{snap.battle.enemy.hp} / {snap.battle.enemy.maxHp}</span>
            </div>

            <div className="ck-hpbox ck-hpbox-ally">
              <div className="ck-hpbox-head">
                <span>{snap.battle.ally.name}</span>
                <em>Lv.{snap.battle.ally.level}</em>
              </div>
              <div className="ck-hpbar ck-hpbar-ally">
                <div style={{ width: `${(snap.battle.ally.hp / snap.battle.ally.maxHp) * 100}%` }} />
              </div>
              <span className="ck-hp-num">{snap.battle.ally.hp} / {snap.battle.ally.maxHp}</span>
            </div>

            <div className="ck-battle-panel">
              <p className="ck-log">{snap.battle.log || '—'}</p>
              <div className="ck-moves">
                {snap.battle.moves.map((m, i) => (
                  <button
                    key={m.name}
                    className="ck-btn ck-move"
                    disabled={snap.battle.busy}
                    onClick={() => useMove(i)}
                  >
                    <span>{m.name}</span>
                    <em style={{ color: elementColor(m.element) }}>{elementName(m.element)} {m.power}</em>
                  </button>
                ))}
              </div>
              <div className="ck-actions">
                <button className="ck-btn" disabled={snap.battle.busy} onClick={throwBall}>◓ {BALL_NAME}</button>
                <button className="ck-btn" disabled={snap.battle.busy} onClick={runAway}>逃跑</button>
                <button className="ck-btn" disabled={snap.battle.busy} onClick={() => {
                  const next = snap.party.find((m) => !m.active && m.hp > 0)
                  if (next) switchTo(next.uid)
                }}>换人</button>
              </div>
            </div>
          </>
        )}

        {/* 对话框 */}
        {snap.dialog && (
          <button className="ck-dialog" onClick={advanceDialog}>
            <span>{snap.dialog.text}</span>
            <i>{snap.dialog.more ? '▼' : '■'}</i>
          </button>
        )}

        {/* 底部提示 */}
        {!snap.dialog && !inBattle && snap.hint && <p className="ck-hint">{snap.hint}</p>}
      </div>

      {/* 手机上的方向键 */}
      <div className="ck-dpad">
        <button onClick={() => tryStep('up')} aria-label="上">▲</button>
        <button onClick={() => tryStep('left')} aria-label="左">◀</button>
        <button onClick={() => tryStep('down')} aria-label="下">▼</button>
        <button onClick={() => tryStep('right')} aria-label="右">▶</button>
        <button className="ck-dpad-a" onClick={interact} aria-label="确定">A</button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- 战斗画面
//
// 320×208 的舞台要同时塞下两只精灵、两个血条框和底部操作面板（占下方 34%）：
// 精灵必须完整落在面板上沿以上，所以纵向可用区只有 y≈10..136。

const PANEL_H = CH * 0.34
const FIELD_BOTTOM = CH - PANEL_H

function drawBattle(ctx, g, sprites, dt) {
  const b = g.battle
  ctx.imageSmoothingEnabled = false

  // 背景：白天的天空 + 草地，接近掌机那种亮调
  const sky = ctx.createLinearGradient(0, 0, 0, FIELD_BOTTOM * 0.72)
  sky.addColorStop(0, '#8fc9ee')
  sky.addColorStop(1, '#cfe8f8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, CW, FIELD_BOTTOM)
  ctx.fillStyle = '#6cbb5a'
  ctx.fillRect(0, FIELD_BOTTOM * 0.68, CW, FIELD_BOTTOM)
  ctx.fillStyle = '#7ecb69'
  ctx.fillRect(0, FIELD_BOTTOM * 0.68, CW, 5)

  // 闪光（扔球 / 命中）
  if (b.fx.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${b.fx.flash * 0.7})`
    ctx.fillRect(0, 0, CW, FIELD_BOTTOM)
    b.fx.flash = Math.max(0, b.fx.flash - dt / 260)
  }

  const ellipse = (cx, cy, rx, ry, color) => {
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  const shake = b.fx.shake > 0 ? Math.sin(g.tick / 18) * b.fx.shake * 4 : 0
  if (b.fx.shake > 0) b.fx.shake = Math.max(0, b.fx.shake - dt / 320)
  const bob = Math.sin(g.tick / 420) * 2

  // 敌方：右上，站台在脚下
  ellipse(250, 100, 46, 12, 'rgba(40,80,45,.35)')
  if (sprites.enemy) ctx.drawImage(sprites.enemy, 210 + shake, 18 + bob, 80, 80)

  // 我方：左下，镜像面向敌人才对（精灵默认朝左）
  ellipse(96, 132, 50, 13, 'rgba(40,80,45,.35)')
  if (sprites.ally) {
    const ax = 58 + shake
    const ay = 54 + bob * 1.2
    ctx.save()
    ctx.translate(ax + 78, ay)
    ctx.scale(-1, 1)
    ctx.drawImage(sprites.ally, -78, 0, 78, 78)
    ctx.restore()
  }

  // 伤害数字
  b.fx.popups.forEach((p) => {
    p.t += dt
    const life = 1 - p.t / 900
    if (life <= 0) return
    ctx.globalAlpha = Math.max(0, life)
    ctx.font = 'bold 12px monospace'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,.65)'
    ctx.strokeText(p.text, p.x, p.y - p.t / 30)
    ctx.fillStyle = p.color
    ctx.fillText(p.text, p.x, p.y - p.t / 30)
    ctx.globalAlpha = 1
  })
  b.fx.popups = b.fx.popups.filter((p) => p.t < 900)
}
