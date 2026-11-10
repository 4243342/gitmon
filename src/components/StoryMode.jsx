import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { ELEMENTS, QUALITIES, SPECIES } from '../engine.js'
import { createBattle, battleTurn, chooseAutoAction } from '../battle.js'
import { rivalPets, sameTypePool, scaleRival } from '../rivals.js'
import { sfx } from '../sfx.js'
import PixelSprite from './PixelSprite.jsx'
import { CHARACTERS, createStoryRuntime } from '../story/runtime.js'
import { storyApi } from '../story/api.js'
import '../story.css'

const UNLOCK_LEVELS = [1, 1, 150, 500]
const ENDING_TITLES = {
  ending_trust: '内应线 · 有人替你开门',
  ending_scarred: '伤痕线 · 一路硬扛',
  ending_alone: '独行线 · 无人送行',
  ending_standard: '正线 · 各走各路',
}

const keyOf = (p) => `${p.platform}-${p.fullName}`
const shortName = (fullName) => String(fullName || '').split('/').pop() || '未知'
const starsText = (n) => {
  const v = Number(n) || 0
  return v >= 10000 ? `${(v / 10000).toFixed(1)}w` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
}

function bossPetFromRun(run) {
  const b = run?.boss || {}
  const v = b.verdict || {}
  const element = ELEMENTS[v.element_key] || ELEMENTS.normal
  const secondary = v.element_secondary ? ELEMENTS[v.element_secondary] : null
  const species = SPECIES[v.species_key] || SPECIES.element
  const quality = QUALITIES[v.quality] || QUALITIES.N
  const skills = (v.skills || []).map((skill, i) => (
    typeof skill === 'string'
      ? { name: skill, unlockLevel: UNLOCK_LEVELS[i] || 1, unlocked: (Number(v.level) || 1) >= (UNLOCK_LEVELS[i] || 1) }
      : skill
  ))
  return {
    fullName: b.full_name,
    repo: shortName(b.full_name),
    platform: b.platform || 'github',
    level: Number(v.level) || Number(b.level) || 1,
    stats: v.stats || [],
    skills,
    maxHp: Number(v.hp) || 0,
    combatPower: Number(b.cp) || 0,
    element,
    elementSecondary: secondary,
    species,
    quality,
    qualityKey: quality.key,
    spriteSeed: Number(v.sprite_seed) || 0,
  }
}

function pickMinion(player, chapter, seed) {
  const element = player?.element?.key || player?.element_key || 'normal'
  let pool = []
  try { pool = sameTypePool(element, player) } catch { pool = [] }
  if (!pool.length) pool = rivalPets()
  if (!pool.length) return null
  // 杂兵按战力选：目标 = 玩家 CP × 0.55 → 0.95（随章序递增），再按倍率把真实仓库压到该量级
  const playerCp = Number(player?.combatPower) || 500
  const targetCp = Math.max(50, Math.round(playerCp * (0.55 + 0.08 * Math.max(0, chapter))))
  const near = [...pool].sort((a, b) => Math.abs((a.combatPower || 0) - targetCp) - Math.abs((b.combatPower || 0) - targetCp))
  const window = near.slice(0, Math.max(3, Math.min(near.length, 6)))
  const index = Math.abs((Number(seed) || 1) + chapter * 7) % window.length
  const base = window[index]
  const factor = Math.max(0.08, Math.min(2.5, targetCp / Math.max(1, Number(base.combatPower) || 1)))
  return scaleRival(base, factor)
}

export default function StoryMode({ pets = [], llmConfig = null, onExit, onReward, onLockChange }) {
  const { t } = useI18n()
  const [view, setView] = useState('loading') // loading | cast | boss | script | play | ended
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const [pet, setPet] = useState(null)
  const [preview, setPreview] = useState(null)
  const [bossPick, setBossPick] = useState(null)
  const [scripts, setScripts] = useState(null)
  const [scriptPick, setScriptPick] = useState(null)

  const [run, setRun] = useState(null)
  const [scene, setScene] = useState(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [battleUi, setBattleUi] = useState(null)
  const [history, setHistory] = useState([])
  const [saves, setSaves] = useState([])
  const [endings, setEndings] = useState([])
  const [latest, setLatest] = useState(null)
  const [reward, setReward] = useState(null)
  const [panel, setPanel] = useState('')
  const [customBoss, setCustomBoss] = useState('')
  const [customScript, setCustomScript] = useState('')

  const runtimeRef = useRef(null)
  const runRef = useRef(null)
  const petRef = useRef(null)
  const sceneRef = useRef(null)
  const historyRef = useRef([])
  const visitedRef = useRef([])
  const stackRef = useRef([])
  const rollbackRef = useRef('')
  const bossPetRef = useRef(null)
  // 推进锁：台词生成期间（最多 8s）禁止重复点选项 / 点两次「继续」
  const advancingRef = useRef(false)

  useEffect(() => { runRef.current = run }, [run])
  useEffect(() => { petRef.current = pet }, [pet])
  useEffect(() => { sceneRef.current = scene }, [scene])

  const makeFetcher = useCallback(() => async ({ sceneId, keys, vars }) => {
    const cfg = llmConfig
    const r = runRef.current
    if (!cfg?.apiKey || !keys?.length) return null
    return storyApi.text({
      sceneId,
      keys,
      vars,
      context: {
        pet_name: r?.pet_name || petRef.current?.fullName || '',
        boss_name: r?.boss?.full_name || '',
        brief: r?.script_brief || '',
      },
      config: cfg,
    })
  }, [llmConfig])

  const persistScene = useCallback(async (next) => {
    const r = runRef.current
    if (!r) return
    try {
      const res = await storyApi.progress({
        run_id: r.id,
        step: r.step,
        scene_id: next.sceneId || (next.ended ? 'ending' : ''),
        // 存「本屏开始前」的快照：读档 / 重进时能重新渲染同一屏
        ink_state: next.stateIn || '',
        vars: next.vars || {},
        visited: visitedRef.current,
        history: historyRef.current.slice(-100),
        rollback_state: rollbackRef.current,
        ending_id: next.ended ? (next.endingId || '') : '',
      })
      runRef.current = res.run
      setRun(res.run)
      if (res.cleared && res.reward) setReward(res.reward)
    } catch (err) {
      if (!/过期/.test(err.message)) setError(err.message)
    }
  }, [])

  const applyScene = useCallback((next, { persist = true } = {}) => {
    sceneRef.current = next
    setScene(next)
    setLineIndex(0)
    setBattleUi(null)
    setView(next.ended ? 'ended' : 'play')

    const lines = (next.lines || []).map((line) => ({ ...line, sceneId: next.sceneId }))
    if (lines.length) {
      const merged = [...historyRef.current, ...lines].slice(-100)
      historyRef.current = merged
      setHistory(merged)
    }
    if (next.sceneId && !visitedRef.current.includes(next.sceneId)) {
      visitedRef.current = [...visitedRef.current, next.sceneId]
    }
    stackRef.current = [...stackRef.current, next.stateIn].slice(-30)
    rollbackRef.current = stackRef.current.length > 1 ? stackRef.current[stackRef.current.length - 2] : ''
    if (persist) persistScene(next)
  }, [persistScene])

  const resume = useCallback(async (activeRun, slotList) => {
    const owner = pets.find((p) => keyOf(p) === activeRun.pet_key)
    const fallbackPet = owner || { fullName: activeRun.pet_name, repo: shortName(activeRun.pet_name), platform: 'github' }
    setPet(fallbackPet)
    petRef.current = fallbackPet
    setRun(activeRun)
    runRef.current = activeRun
    setSaves(slotList || [])
    bossPetRef.current = bossPetFromRun(activeRun)
    onLockChange?.(activeRun.pet_key)
    const runtime = createStoryRuntime({ vars: activeRun.vars || {} })
    if (activeRun.ink_state) runtime.restore(activeRun.ink_state)
    runtimeRef.current = runtime
    const next = await runtime.enter({ fetchTexts: makeFetcher() })
    applyScene(next, { persist: false })
  }, [pets, onLockChange, makeFetcher, applyScene])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cur, ends] = await Promise.all([
          storyApi.current(),
          storyApi.endings().catch(() => ({ items: [] })),
        ])
        if (!alive) return
        setEndings(ends?.items || [])
        if (cur.run) {
          await resume(cur.run, cur.saves)
        } else {
          setLatest(cur.latest || null)
          setView('cast')
        }
      } catch (err) {
        if (alive) { setError(err.message); setView('cast') }
      }
    })()
    return () => { alive = false }
    // 只在进入剧情模式时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 图鉴异步加载完成后补齐主角对象（战斗要用 stats / element）
  useEffect(() => {
    if (!run || !pets.length) return
    const found = pets.find((p) => keyOf(p) === run.pet_key)
    if (found && found !== petRef.current) {
      setPet(found)
      petRef.current = found
    }
  }, [pets, run])

  const storyCast = useMemo(() => pets.filter((p) => p.aiEvaluated), [pets])

  // —— 选主角 → 选 Boss ——
  const startPreview = async (target, seed = (Date.now() & 0x7fffffff), refresh = true) => {
    setPet(target)
    petRef.current = target
    setBossPick(null)
    setScripts(null)
    setScriptPick(null)
    setView('boss')
    setBusy(t('正在检索同赛道的顶级项目…', 'Searching top projects in this track…'))
    setError('')
    try {
      const data = await storyApi.preview({ pet: target, config: llmConfig, seed, refresh })
      setPreview(data)
    } catch (err) {
      setError(err.message)
      setPreview(null)
    } finally {
      setBusy('')
    }
  }

  const checkCustomBoss = async () => {
    if (!customBoss.trim()) return
    setBusy(t('校验仓库…', 'Checking repo…'))
    setError('')
    try {
      const card = await storyApi.checkBoss({ fullName: customBoss.trim() })
      const manual = { ...card, reason: t('你的自选方向', 'Your own pick'), manual: true }
      setPreview((prev) => ({ ...(prev || { track: '', rationale: '', bosses: [], selection_source: 'manual' }), bosses: [manual], manual }))
      setBossPick(manual)
      setPanel('')
      setCustomBoss('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const confirmBoss = async () => {
    if (!bossPick) return
    setView('script')
    setBusy(t('正在围绕这位对手写剧本…', 'Writing scripts around this rival…'))
    setError('')
    try {
      const data = await storyApi.scripts({ pet: petRef.current, boss: bossPick, config: llmConfig })
      setScripts(data.scripts || [])
    } catch (err) {
      setError(err.message)
      setScripts([])
    } finally {
      setBusy('')
    }
  }

  const submitCustomScript = async () => {
    if (!customScript.trim()) return
    setBusy(t('正在做桥接测试…', 'Bridging your story…'))
    setError('')
    try {
      const data = await storyApi.customScript({ pet: petRef.current, boss: bossPick, input: customScript.trim(), config: llmConfig })
      const item = { title: data.title, logline: data.brief, beats: [data.bridge], bridge: data.bridge, strongFit: data.strong_fit, source: 'manual' }
      setScripts([item])
      setScriptPick(item)
      setPanel('')
      setCustomScript('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const startRun = async () => {
    if (!scriptPick || !bossPick) return
    setBusy(t('正在建线…', 'Creating your run…'))
    setError('')
    try {
      const data = await storyApi.start({
        pet: petRef.current,
        boss: bossPick,
        script: scriptPick,
        track: preview?.track || '',
        rationale: preview?.rationale || '',
        queries: preview?.queries || [],
        selectionSource: bossPick.manual ? 'manual' : (preview?.selection_source || 'ai'),
        seed: preview?.seed,
        config: llmConfig,
      })
      const activeRun = data.run
      setRun(activeRun)
      runRef.current = activeRun
      // 统一用 run.boss.verdict 转成战斗单位（后端 bossPet 是蛇形字段，前端不直接用）
      bossPetRef.current = bossPetFromRun(activeRun)
      onLockChange?.(activeRun.pet_key)
      if (data.desk?.key) onLockChange?.(data.desk.key)
      const runtime = createStoryRuntime({ vars: activeRun.vars || {} })
      runtimeRef.current = runtime
      stackRef.current = []
      visitedRef.current = []
      historyRef.current = []
      setHistory([])
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next, { persist: true })
      sfx.swoosh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // —— 场景推进 ——
  const advance = async () => {
    const runtime = runtimeRef.current
    if (!runtime || advancingRef.current) return
    advancingRef.current = true
    setBusy(t('正在写这一屏的台词…', 'Writing this scene…'))
    try {
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next)
    } catch (err) {
      setError(err.message)
    } finally {
      advancingRef.current = false
      setBusy('')
    }
  }

  const choose = async (index) => {
    const runtime = runtimeRef.current
    if (!runtime || advancingRef.current) return
    advancingRef.current = true
    sfx.blip()
    try {
      runtime.choose(index)
      setBusy(t('正在写这一屏的台词…', 'Writing this scene…'))
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next)
    } catch (err) {
      setError(err.message)
    } finally {
      advancingRef.current = false
      setBusy('')
    }
  }

  // —— 战斗 ——
  const battleEnemy = useMemo(() => {
    if (!scene?.battle) return null
    if (scene.battle === 'boss') return bossPetRef.current || bossPetFromRun(runRef.current)
    return pickMinion(petRef.current || pet, Number(scene.vars?.chapter) || 0, runRef.current?.seed || 1)
  }, [scene, pet])

  const fight = () => {
    const player = petRef.current || pet
    if (!player || !battleEnemy) return
    sfx.swoosh()
    try {
      const built = createBattle({
        playerTeam: [player],
        enemyTeam: [battleEnemy],
        seed: ((runRef.current?.seed || 1) ^ (Number(scene?.vars?.chapter) || 0) ^ 0x5f3a) >>> 0,
        difficulty: 'normal',
        playerName: shortName(player.fullName),
        enemyName: shortName(battleEnemy.fullName || battleEnemy.repo),
      })
      let state = built.state
      const log = built.events.map((e) => e.text)
      let guard = 0
      while (!state.winner && guard < 300) {
        const turn = battleTurn(state, chooseAutoAction(state))
        state = turn.state
        log.push(...turn.events.map((e) => e.text))
        guard += 1
      }
      setBattleUi({
        enemy: battleEnemy,
        player,
        state,
        log,
        result: state.winner === 'player' ? 'win' : 'lose',
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const afterBattle = async () => {
    const runtime = runtimeRef.current
    if (!runtime || !battleUi || advancingRef.current) return
    advancingRef.current = true
    setBusy(t('…', '…'))
    try {
      const next = await runtime.resumeFromBattle(battleUi.result === 'win', { fetchTexts: makeFetcher() })
      applyScene(next)
    } catch (err) {
      setError(err.message)
    } finally {
      advancingRef.current = false
      setBusy('')
    }
  }

  // —— 存档 / 读档 / 回滚 ——
  const saveSlot = async (slot) => {
    const r = runRef.current
    const sc = sceneRef.current
    if (!r) return
    try {
      const res = await storyApi.save({
        run_id: r.id,
        slot,
        scene_id: sc?.sceneId || '',
        vars: sc?.vars || {},
        visited: visitedRef.current,
        ink_state: sc?.stateIn || '',
      })
      setSaves(res.saves || [])
      sfx.blip()
    } catch (err) { setError(err.message) }
  }

  const loadSlot = async (slot) => {
    const r = runRef.current
    if (!r) return
    setBusy(t('读取存档…', 'Loading save…'))
    try {
      const res = await storyApi.load({ run_id: r.id, slot })
      const snapshot = res.snapshot
      if (!snapshot?.ink_state) throw new Error(t('这个存档缺少 ink 快照，无法读取', 'This save has no ink snapshot'))
      const runtime = createStoryRuntime({ vars: snapshot.vars || {} })
      runtime.restore(snapshot.ink_state)
      runtimeRef.current = runtime
      runRef.current = res.run
      setRun(res.run)
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next, { persist: false })
      setPanel('')
      sfx.blip()
    } catch (err) {
      setError(err.message)
    } finally { setBusy('') }
  }

  const doRollback = async () => {
    const r = runRef.current
    if (!r) return
    try {
      const res = await storyApi.rollback(r.id)
      const runtime = runtimeRef.current
      runtime.restore(res.ink_state)
      stackRef.current = stackRef.current.slice(0, -1)
      runRef.current = res.run
      setRun(res.run)
      const next = await runtime.enter({ fetchTexts: makeFetcher() })
      applyScene(next, { persist: false })
      sfx.blip()
    } catch (err) { setError(err.message) }
  }

  const finishRun = async (reason = 'clear') => {
    const r = runRef.current
    if (r) {
      try { await storyApi.close(r.id, reason) } catch { /* 已经结案也算成功 */ }
    }
    onLockChange?.(null)
    if (reason === 'clear') onReward?.(petRef.current, reward?.xp || 0)
    sfx.swoosh()
    onExit?.()
  }

  const lines = scene?.lines || []
  const currentLine = lines[Math.min(lineIndex, Math.max(0, lines.length - 1))]
  const showChoices = scene && !scene.battle && !scene.ended && lineIndex >= lines.length - 1

  return (
    <main className="story-wrap">
      <div className="story-head">
        <div>
          <span className="story-kicker">{t('剧情模式 · 单项目远征', 'STORY MODE · SOLO EXPEDITION')}</span>
          <h2>{run?.script_title || t('挑一只精灵，去打一场有始有终的仗', 'Pick one sprite and fight a story with an ending')}</h2>
          {run && (
            <p className="story-meta">
              {t(`第 ${Math.min((run.vars?.chapter || 0) + 1, run.chapter_count)} / ${run.chapter_count} 章`, `Chapter ${Math.min((run.vars?.chapter || 0) + 1, run.chapter_count)} / ${run.chapter_count}`)}
              {' · '}{t('信任', 'Trust')} {run.vars?.trust ?? 0}
              {' · '}{t('失败', 'Defeats')} {run.vars?.deaths ?? 0}
              {run.boss?.full_name ? ` · Boss ${run.boss.full_name}` : ''}
            </p>
          )}
        </div>
        <div className="story-head-actions">
          {view === 'play' && (
            <>
              <button className="ghost-btn" onClick={() => setPanel('save')}>{t('存档', 'Save')}</button>
              <button className="ghost-btn" onClick={() => setPanel('load')}>{t('读档', 'Load')}</button>
              <button className="ghost-btn" onClick={doRollback}>{t('回滚', 'Rollback')}</button>
              <button className="ghost-btn" onClick={() => setPanel('history')}>{t('回想', 'History')}</button>
            </>
          )}
          <button className="ghost-btn" onClick={() => { if (runRef.current && view === 'play') setPanel('close'); else onExit?.() }}>
            {t('退出剧情模式', 'Exit')}
          </button>
        </div>
      </div>

      {error && <p className="error story-error">! {error}</p>}
      {busy && <p className="story-busy">{busy}</p>}

      {/* 选主角 */}
      {view === 'cast' && (
        <section className="story-section">
          <div className="story-section-head">
            <h3>{t('① 选主角', '① Pick the protagonist')}</h3>
            <span>{t('只有通过 AI 认证的精灵能当主角', 'Only AI-certified sprites can star')}</span>
          </div>
          {storyCast.length === 0 ? (
            <p className="story-empty">{t('还没有 AI 认证精灵：先在高级模式里完成一次模型评测。', 'No AI-certified sprite yet — run one model evaluation in AI Pro mode first.')}</p>
          ) : (
            <div className="story-cast">
              {storyCast.map((p) => (
                <button key={keyOf(p)} className="story-cast-card" onClick={() => startPreview(p)}>
                  <PixelSprite pet={p} size={72} animate={false} />
                  <b>{p.repo || shortName(p.fullName)}</b>
                  <span>Lv.{p.level} · {p.quality?.key || 'N'}</span>
                  <span>{p.element?.name || ''}{p.elementSecondary ? ` / ${p.elementSecondary.name}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {latest && (
            <p className="story-archive-note">
              {t('上一段远征：', 'Last expedition: ')}{latest.script_title} · {ENDING_TITLES[latest.ending] || latest.status}
            </p>
          )}
          {endings.length > 0 && (
            <p className="story-archive-note">
              {t('结局收集：', 'Endings: ')}{endings.map((e) => e.title || ENDING_TITLES[e.ending_id] || e.ending_id).join(' / ')}
            </p>
          )}
        </section>
      )}

      {/* 选 Boss */}
      {view === 'boss' && (
        <section className="story-section">
          <div className="story-section-head">
            <h3>{t('② 选最终方向', '② Pick the final direction')}</h3>
            <div className="story-section-actions">
              <button className="ghost-btn" onClick={() => startPreview(petRef.current)} disabled={Boolean(busy)}>{t('换一批', 'Reroll')}</button>
              <button className="ghost-btn" onClick={() => setPanel('customBoss')}>{t('自选 Boss', 'Custom Boss')}</button>
            </div>
          </div>
          {preview?.track && <p className="story-track">{t('赛道', 'Track')}：{preview.track}</p>}
          {preview?.rationale && <p className="story-rationale">{preview.rationale}</p>}
          <div className="story-boss-grid">
            {(preview?.bosses || []).map((boss) => (
              <button
                key={boss.full_name}
                className={`story-boss${bossPick?.full_name === boss.full_name ? ' sel' : ''}`}
                onClick={() => setBossPick(boss)}
              >
                <span className="story-boss-tier">{boss.tier}</span>
                <b>{boss.full_name}</b>
                <span className="story-boss-meta">{boss.language || '—'} · ★{starsText(boss.stars)} · Lv.{boss.level}</span>
                <span className="story-boss-cp">CP {boss.cp}</span>
                <p>{boss.reason || boss.description}</p>
              </button>
            ))}
          </div>
          {preview?.selection_source === 'fallback_pool' && (
            <p className="story-source-note">{t('GitHub 检索不可用，当前为离线兜底池。', 'GitHub search unavailable — offline fallback pool.')}</p>
          )}
          <div className="story-confirm">
            <button className="primary-btn" disabled={!bossPick || Boolean(busy)} onClick={confirmBoss}>
              {t('就选它，继续写剧本', 'Lock this rival and write scripts')}
            </button>
          </div>
        </section>
      )}

      {/* 选剧本 */}
      {view === 'script' && (
        <section className="story-section">
          <div className="story-section-head">
            <h3>{t('③ 选剧本', '③ Pick the script')}</h3>
            <button className="ghost-btn" onClick={() => setPanel('customScript')}>{t('自定义', 'Custom')}</button>
          </div>
          <p className="story-rationale">{t('对手：', 'Rival: ')}{bossPick?.full_name}</p>
          <div className="story-script-grid">
            {(scripts || []).map((item) => (
              <button
                key={item.title}
                className={`story-script${scriptPick?.title === item.title ? ' sel' : ''}`}
                onClick={() => setScriptPick(item)}
              >
                <b>{item.title}</b>
                <span>{item.logline}</span>
                <ul>
                  {(item.beats || []).map((beat) => <li key={beat}>{beat}</li>)}
                </ul>
                {item.strongFit === false && <em className="story-bridge-warn">{t('桥接偏弱 · 强行演绎', 'Weak bridge · forced adaptation')}</em>}
              </button>
            ))}
          </div>
          <div className="story-confirm">
            <button className="primary-btn" disabled={!scriptPick || Boolean(busy)} onClick={startRun}>
              {t('建线，出发', 'Start the run')}
            </button>
          </div>
        </section>
      )}

      {/* 场景 / 战斗 */}
      {view === 'play' && scene && (
        <section className={`story-stage story-bg-${scene.bg || 'dawn'}`}>
          <div className="story-stage-cast">
            {(scene.cast || []).map((who) => {
              const char = CHARACTERS[who] || CHARACTERS.narrator
              const active = currentLine?.who === who
              return (
                <span key={who} className={`story-chip${active ? ' active' : ''}`} style={{ '--chip': char.color }}>
                  {char.name}
                </span>
              )
            })}
            {scene.textSource === 'fallback' && <span className="story-source-note">{t('台词兜底', 'fallback text')}</span>}
          </div>

          {scene.battle ? (
            <div className="story-battle">
              <h3>{scene.battle === 'boss' ? t('终章 · 决战', 'Finale · Boss fight') : t(`第 ${(scene.vars?.chapter || 0) + 1} 章 · 杂兵战`, `Chapter ${(scene.vars?.chapter || 0) + 1} · Skirmish`)}</h3>
              <div className="story-battle-row">
                <div className="story-battle-side">
                  <PixelSprite pet={pet} size={96} animate={false} />
                  <b>{shortName(pet?.fullName)}</b>
                  <span>Lv.{pet?.level} · CP {pet?.combatPower}</span>
                </div>
                <span className="story-vs">VS</span>
                <div className="story-battle-side">
                  {battleEnemy?.spriteSeed ? <PixelSprite pet={battleEnemy} size={96} animate={false} /> : <span className="story-no-sprite">?</span>}
                  <b>{shortName(battleEnemy?.fullName || battleEnemy?.repo)}</b>
                  <span>Lv.{battleEnemy?.level} · CP {battleEnemy?.combatPower}</span>
                </div>
              </div>
              {!battleUi ? (
                <button className="primary-btn" onClick={fight}>{t('开战（自动回合）', 'Fight (auto turns)')}</button>
              ) : (
                <>
                  <p className={`story-battle-result ${battleUi.result}`}>
                    {battleUi.result === 'win' ? t('胜利', 'Victory') : t('失败 · 剧情继续', 'Defeat · story continues')}
                  </p>
                  <div className="story-battle-log">
                    {battleUi.log.slice(-60).map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}
                  </div>
                  <button className="primary-btn" onClick={afterBattle}>{t('继续剧情', 'Continue')}</button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="story-dialog" onClick={() => { if (lineIndex < lines.length - 1) { setLineIndex(lineIndex + 1); sfx.blip() } }}>
                <span className="story-speaker" style={{ color: CHARACTERS[currentLine?.who]?.color || '#ffcb05' }}>
                  {CHARACTERS[currentLine?.who]?.name || t('旁白', 'Narrator')}
                </span>
                <p>{currentLine?.text || t('……', '…')}</p>
                {lines.length > 1 && <span className="story-line-dots">{lines.map((_, i) => <i key={i} className={i === lineIndex ? 'on' : ''} />)}</span>}
              </div>
              {showChoices && (
                <div className={`story-choices${busy ? ' busy' : ''}`}>
                  {scene.choices.map((choice) => (
                    <button key={choice.index} onClick={() => choose(choice.index)} disabled={Boolean(busy)}>{choice.text}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 结局 */}
      {view === 'ended' && (
        <section className="story-ending">
          <span className="story-kicker">{t('END', 'END')}</span>
          <h3>{ENDING_TITLES[scene?.endingId] || reward?.title || t('抵达终点', 'The end')}</h3>
          <p>
            {t('信任', 'Trust')} {scene?.vars?.trust ?? 0}
            {' · '}{t('失败', 'Defeats')} {scene?.vars?.deaths ?? 0}
            {' · '}{t('路线', 'Route')} {scene?.vars?.route === 'insider' ? t('内应线', 'Insider') : t('独行线', 'Solo')}
          </p>
          {reward?.xp ? <p className="story-reward">+{reward.xp} EXP</p> : null}
          <div className="story-confirm">
            <button className="primary-btn" onClick={() => finishRun('clear')}>{t('领取奖励并结案', 'Claim & close')}</button>
            <button className="ghost-btn" onClick={() => setPanel('history')}>{t('回看剧情', 'Review story')}</button>
          </div>
        </section>
      )}

      {/* 弹层 */}
      {panel && (
        <div className="story-panel-backdrop" onClick={() => setPanel('')}>
          <div className="story-panel" onClick={(e) => e.stopPropagation()}>
            <div className="story-panel-head">
              <b>{panel === 'save' ? t('存档', 'Save') : panel === 'load' ? t('读档', 'Load') : panel === 'history' ? t('回想', 'History') : panel === 'customBoss' ? t('自选 Boss', 'Custom Boss') : panel === 'customScript' ? t('自定义剧本', 'Custom script') : t('结案', 'Close run')}</b>
              <button className="ghost-btn" onClick={() => setPanel('')}>{t('关闭', 'Close')}</button>
            </div>

            {(panel === 'save' || panel === 'load') && (
              <div className="story-slots">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const saved = saves.find((s) => s.slot === slot)
                  return (
                    <div key={slot} className="story-slot">
                      <b>{t(`槽 ${slot}`, `Slot ${slot}`)}</b>
                      <span>{saved ? `${saved.scene_id || '—'} · ${new Date(saved.created_at * 1000).toLocaleString()}` : t('空', 'Empty')}</span>
                      <div>
                        {panel === 'save'
                          ? <button className="ghost-btn" onClick={() => saveSlot(slot)}>{t('存入', 'Save')}</button>
                          : <button className="ghost-btn" disabled={!saved} onClick={() => loadSlot(slot)}>{t('读取', 'Load')}</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {panel === 'history' && (
              <div className="story-history">
                {history.length === 0 && <p className="story-empty">{t('还没有读过的台词。', 'No lines read yet.')}</p>}
                {history.map((line, i) => (
                  <p key={`${i}-${line.text}`}><b style={{ color: CHARACTERS[line.who]?.color }}>{CHARACTERS[line.who]?.name || line.who}</b>：{line.text}</p>
                ))}
              </div>
            )}

            {panel === 'customBoss' && (
              <div className="story-custom">
                <p>{t('粘贴 GitHub / Gitee 仓库地址或 owner/repo，跳过 AI 推荐，直接把它当最终方向。', 'Paste a GitHub / Gitee repo or owner/repo to skip AI suggestions.')}</p>
                <input value={customBoss} onChange={(e) => setCustomBoss(e.target.value)} placeholder="https://github.com/owner/repo" spellCheck={false} />
                <button className="primary-btn" disabled={Boolean(busy)} onClick={checkCustomBoss}>{t('校验并选定', 'Check & pick')}</button>
              </div>
            )}

            {panel === 'customScript' && (
              <div className="story-custom">
                <p>{t('输入你喜欢的小说名（≤40 字），或一句故事梗概（>40 字）。', 'Enter a novel title (≤40 chars) or a one-paragraph premise.')}</p>
                <textarea value={customScript} onChange={(e) => setCustomScript(e.target.value)} rows={4} />
                <button className="primary-btn" disabled={Boolean(busy)} onClick={submitCustomScript}>{t('用它写剧本', 'Use this story')}</button>
              </div>
            )}

            {panel === 'close' && (
              <div className="story-custom">
                <p>{t('放弃这条线会解除桌宠锁定，已获得的进度不会保留。', 'Abandoning unlocks the desktop pet and discards progress.')}</p>
                <button className="primary-btn" onClick={() => finishRun('abandon')}>{t('放弃这条线', 'Abandon run')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'loading' && <p className="story-busy">{t('读取剧情进度…', 'Loading your run…')}</p>}
    </main>
  )
}
