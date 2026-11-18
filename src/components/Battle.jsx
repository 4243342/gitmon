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
  tierLabel,
  tierOfPet,
} from '../rivals.js'
import { parseRepoInput, scanOwnerBox, scanRepo } from '../scan.js'
import { battleWithLLM } from '../llm.js'
import { bgm } from '../bgm.js'
import { sfx } from '../sfx.js'
import { useI18n, t as bt } from '../i18n.js'

// 三种挑战：在线对手（输入仓库/账号，真实强度）／同类型（找同属性仓库）／随机宠物
const MODES = [
  {
    key: 'online',
    index: '01',
    name: ['在线对手', 'Online Rival'],
    tag: ['单项目 1v1 · 整仓全员', '1v1 single repo · full-repo squad'],
    desc: ['填一个仓库打它的单项目，或填一个账号让它的整仓项目排队上。按对方的真实强度来，不设难度。', 'Enter a repo to fight it 1v1, or an account to field its whole portfolio. Strength mirrors the real repo — no difficulty setting.'],
  },
  {
    key: 'same',
    index: '02',
    name: ['同类型对战', 'Same-Type Battle'],
    tag: ['同属性 · 同星级层', 'Same element & star tier'],
    desc: ['从和你先发精灵同属性、同星级层（按仓库星数分层）的仓库里挑对手，同层不够才向相邻层借。克制关系一眼看得懂，适合摸清属性打法。', 'Rivals share your lead pet’s element and star tier (repo stars). Adjacent tiers only fill in when the same tier runs short. Type matchups stay readable — ideal for learning the meta.'],
  },
  {
    key: 'random',
    index: '03',
    name: ['随机宠物', 'Random Foe'],
    tag: ['抽到谁打谁', 'Whoever you draw'],
    desc: ['从全部对手池里随机抽。可能撞上 SSR 巨兽，也可能抽到 N 级小玩意——难度自己定。', 'Rolled from the whole rival pool. Could be an SSR giant or a no-name N — you set your own stakes.'],
  },
]

const DIFFICULTIES = [
  { key: 'easy', name: ['新手', 'Rookie'], desc: ['对手六维 ×0.65', 'Rival stats ×0.65'] },
  { key: 'normal', name: ['相当', 'Even'], desc: ['对手原样实力', 'Rival at full strength'] },
  { key: 'hard', name: ['强敌', 'Fierce'], desc: ['对手六维 ×1.35', 'Rival stats ×1.35'] },
]

const XP_BASE = { easy: 90, normal: 150, hard: 240 }
const ONLINE_XP = { single: 200, team: 280 }

const ONLINE_SIZES = [
  { key: 'single', name: ['单项目', 'Single Repo'], hint: ['1v1 · 一个仓库', '1v1 · one repo'] },
  { key: 'team', name: ['整仓', 'Full Repo'], hint: ['全员 · 整个账号', 'Everyone · one account'] },
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

const HP_SEGMENTS = 20

function HPBar({ unit, side }) {
  const pct = hpPercent(unit)
  const lit = Math.max(pct > 0 ? 1 : 0, Math.ceil((pct / 100) * HP_SEGMENTS))
  const low = pct <= 25
  const tone = pct <= 20 ? 'red' : pct <= 50 ? 'yellow' : 'green'
  return (
    <div className={`hpbar ${low ? 'hpbar-low' : ''} hp-tone-${tone}`}>
      <span className="hp-label">HP</span>
      <div className="hpbar-track">
        {Array.from({ length: HP_SEGMENTS }, (_, i) => (
          <i key={i} className={i < lit ? 'on' : ''} />
        ))}
      </div>
      <span className="hpbar-num">{unit.hp} / {unit.maxHp}</span>
    </div>
  )
}

// 结算评级：胜局起步 A（存活多/回合短冲 S），惜败保底 B
function battleGrade(winner, turn, alive, total) {
  if (winner !== 'player') return 'B'
  const score = 50 + (total > 0 ? (alive / total) * 30 : 0) + Math.max(0, 30 - turn * 2)
  return score >= 85 ? 'S' : score >= 55 ? 'A' : 'B'
}

// AI 对比用的项目画像：只取事实字段交给模型做水平对比（后端截断到 4KB）
function aiProfile(pet) {
  if (!pet) return {}
  const stats = Array.isArray(pet.stats)
    ? Object.fromEntries(pet.stats.map((s) => [s.name, s.value]))
    : { ...(pet.stats || {}) }
  return {
    name: pet.repo || pet.name || '',
    fullName: pet.fullName || '',
    platform: pet.platform || 'github',
    level: pet.level || 1,
    quality: pet.qualityKey || pet.quality?.key || 'N',
    qualityScore: pet.qualityScore ?? null,
    element: pet.element?.name || '',
    elementSecondary: pet.elementSecondary?.name || null,
    species: pet.species?.name || '',
    combatPower: pet.combatPower || 0,
    stars: pet.stars ?? null,
    summary: String(pet.summary || pet.description || '').slice(0, 120),
    stats,
    foundation: pet.foundation ?? null,
    engineeringScore: pet.engineeringScore ?? null,
    traits: (pet.traits || []).map((t) => t.name).slice(0, 4),
    skills: (pet.skills || []).map((s) => s.name).filter(Boolean).slice(0, 4),
  }
}

// 审计报告 → Markdown（结算页导出用）
function reportMarkdown(report, me, foe, win) {
  const side = (w) => (w === 'player' ? bt('我方', 'Mine') : w === 'enemy' ? bt('对手', 'Foe') : bt('持平', 'Even'))
  return [
    bt('# GitMon 高级竞技场 · 审计报告', '# GitMon Advanced Arena · Audit Report'), '',
    bt(`- **对局**：${me} vs ${foe}`, `- **Match**: ${me} vs ${foe}`),
    bt(`- **结果**：${win ? '胜利' : '惜败'}`, `- **Result**: ${win ? 'Victory' : 'Defeat'}`),
    bt(`- **结论**：${report.verdict}`, `- **Verdict**: ${report.verdict}`), '',
    bt('## 维度对比', '## Dimension Comparison'), '',
    bt('| 维度 | 我方 | 对手 | 优势 | 说明 |', '| Dimension | Mine | Foe | Edge | Note |'),
    '| --- | ---: | ---: | --- | --- |',
    ...report.dims.map((d) => `| ${d.name} | ${d.player} | ${d.enemy} | ${side(d.winner)} | ${d.note} |`),
    '', bt('## 证据引用', '## Evidence'), ...report.evidence.map((x) => `- ${x}`),
    '', bt('## 风险', '## Risks'), ...report.risks.map((x) => `- ${x}`),
    '', bt('## 建议', '## Suggestions'), ...report.suggestions.map((x) => `- ${x}`),
    '', bt(`> 生成：${new Date().toLocaleString('zh-CN')} · GitMon 高级竞技场`, `> Generated: ${new Date().toLocaleString('en-US')} · GitMon Advanced Arena`),
  ].join('\n')
}

function UnitPanel({ unit, side, fx, shaking, juiceRef }) {
  const status = unit.status ? STATUS_INFO[unit.status] : null
  const juice = juiceRef?.current
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
        <span
          key={fx.id}
          ref={(el) => {
            // GSAP 接管时禁用 CSS 上浮，改由 popDamage 做「砸出来→回弹」缩放；
            // dataset.popped 保证每个数字只在挂载时弹一次，不随父组件重渲染重复触发。
            if (el && juice && !el.dataset.popped) {
              el.dataset.popped = '1'
              juice.popDamage(el, { crit: fx.crit })
            }
          }}
          className={`damage-float ${fx.mult > 1 ? 'super' : fx.mult < 1 ? 'weak' : ''} ${fx.crit ? 'crit' : ''} ${juice ? 'gsap-pop' : ''}`}
        >
          -{fx.value}
        </span>
      )}
    </div>
  )
}

function EmptyState({ onExit }) {
  const { t } = useI18n()
  return (
    <div className="picker-empty">
      <p>{t('图鉴里还没有精灵。', 'No pets in your dex yet.')}</p>
      <button className="primary-btn" onClick={onExit}>{t('先去抽一只', 'Go draw one')}</button>
    </div>
  )
}

// 第一步：选挑战方式（channel='ai' 时为高级竞技场：选择页一样，战斗改 AI 对比）
function ModePicker({ pets, onPick, onExit, channel, advanced = false, onChannel = null }) {
  const { t } = useI18n()
  const ai = channel === 'ai'
  return (
    <div className="battle-picker">
      <div className="picker-head">
        <div className="picker-title-row">
          <h2>{t('竞技场', 'Arena')}{ai && <span className="picker-ai-badge">{t('AI 高级', 'AI Advanced')}</span>}</h2>
          {advanced && onChannel && (
            <div className="picker-channel" role="tablist" aria-label={t('竞技场通道', 'Arena channel')}>
              <button role="tab" aria-selected={!ai} className={!ai ? 'on' : ''} onClick={() => onChannel('classic')}>
                {t('常规', 'Classic')}
              </button>
              <button role="tab" aria-selected={ai} className={ai ? 'on' : ''} onClick={() => onChannel('ai')}>
                <span className="picker-channel-ai">AI</span>{t('高级', ' Advanced')}
              </button>
            </div>
          )}
        </div>
        {ai ? (
          <p>{t('选法和常规竞技场一样。开战后', 'Same setup as the classic arena. Once the fight starts, ')}<b>{t('由模型逐回合对比两个项目的真实水平', 'the model compares both projects round by round')}</b>{t('出招解说（不用点技能），结算会附一份', ' to call every move — no skill picking needed. The result ships an ')}<b>{t('审计报告', 'audit report')}</b>{t('：维度对比、证据引用、风险与建议，可导出 Markdown。消耗模型额度。', ': dimension comparison, evidence, risks and suggestions, exportable as Markdown. Uses model quota.')}</p>
        ) : (
          <p>{t('挑一种挑战方式。在线对手打的是对方仓库的真实实力；同类型和随机宠物可以自己定难度。开战后双方自动出招，无需点技能。', 'Pick a challenge. Online rivals use their repo’s real stats; same-type and random let you choose difficulty. Once the fight starts both sides act on their own — no skill picking.')}</p>
        )}
      </div>

      {pets.length === 0 ? (
        <EmptyState onExit={onExit} />
      ) : (
        <div className="mode-grid">
          {MODES.map((m) => (
            <button key={m.key} className={`mode-card mode-${m.key}`} onClick={() => onPick(m.key)}>
              <span className="mode-top">
                <span className="mode-index">{m.index}</span>
                <span className="mode-go">{t('选择 →', 'Pick →')}</span>
              </span>
              <span className="mode-title">{t(...m.name)}</span>
              <span className="mode-tag">{t(...m.tag)}</span>
              <span className="mode-desc">{t(...m.desc)}</span>
              <span className="mode-foot">
                {m.key === 'online' ? t('1v1 · 固定真实强度', '1v1 · true strength') : t('1–3v1–3 · 可选难度', '1–3v1–3 · choose difficulty')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 在线对手：单项目（一个仓库 1v1）／整仓（一个账号的全部项目 3v3）；AI 通道只有单项目
function OnlineSetup({ size, setSize, repoInput, setRepoInput, onScan, scanning, scanError, opponent, ownerTeam, opponentNote, onClear, channel }) {
  const { t } = useI18n()
  const isTeam = size === 'team' && channel !== 'ai'
  const hasOpponent = isTeam ? ownerTeam.length > 0 : !!opponent
  return (
    <div className="online-setup">
      {channel !== 'ai' && (
        <div className="size-toggle">
          {ONLINE_SIZES.map((s) => (
            <button
              key={s.key}
              className={`size-btn ${size === s.key ? 'on' : ''}`}
              onClick={() => setSize(s.key)}
              disabled={scanning}
            >
              <b>{t(...s.name)}</b>
              <small>{t(...s.hint)}</small>
            </button>
          ))}
        </div>
      )}

      <div className="repo-row">
        <input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !scanning) onScan() }}
          placeholder={isTeam ? t('对方账号：github.com/owner（也可填仓库，按它的账号整仓出战）', 'Opponent account: github.com/owner (a repo works too — its whole account fights)') : t('对方的仓库：https://github.com/owner/repo', 'Opponent repo: https://github.com/owner/repo')}
          spellCheck={false}
          disabled={scanning}
        />
        <button className="primary-btn" onClick={onScan} disabled={scanning}>
          {scanning ? (isTeam ? t('整仓扫描中…', 'Scanning repo…') : t('扫描中…', 'Scanning…')) : hasOpponent ? t('重新扫描', 'Rescan') : isTeam ? t('扫描整仓', 'Scan Full Repo') : t('扫描仓库', 'Scan Repo')}
        </button>
      </div>
      {scanError && <p className="online-error">! {scanError}</p>}

      {isTeam ? (
        ownerTeam.length > 0 ? (
          <div className="opponent-team">
            <div className="opponent-team-head">
              <span>{t(`整仓出战 · ${ownerTeam.length} 个项目`, `Full-repo squad · ${ownerTeam.length} projects`)}</span>
              <span className="opponent-source">{opponentNote}</span>
              <button className="ghost-btn tiny" onClick={onClear}>{t('换一个', 'Swap')}</button>
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
                    <small>Lv.{p.level} · {p.element.name}{t('系', ' type')}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="online-hint">
            {t('整仓 = 对方账号下的项目全部上场，有几只打几只，不设人数上限。整仓按真实数值打，不叠难度；扫描会消耗 API 额度，内置快照账号可离线直接打。', 'Full repo = every project under that account takes the field, no cap. They fight on true stats with no difficulty stacking; scanning spends API quota, while built-in snapshot accounts fight offline.')}
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
              Lv.{opponent.level} · {opponent.element.name}{t('系', ' type')}
              {opponent.elementSecondary ? `/${opponent.elementSecondary.name}` : ''} · {opponent.species?.name}
            </small>
            <span className="opponent-source">{opponentNote}</span>
          </div>
          <button className="ghost-btn tiny" onClick={onClear}>{t('换一个', 'Swap')}</button>
        </div>
      ) : (
        <p className="online-hint">
          {t('单项目 PK 只打对方一个仓库，按仓库真实数值生成，等级、品质、六维都是它自己的，不叠加难度系数。已经内置快照的仓库可以离线直接打。', 'Single-repo PK fights just one repo, generated from its real numbers — level, rarity and stats are its own, with no difficulty scaling. Repos with built-in snapshots can fight offline.')}
        </p>
      )}
    </div>
  )
}

function Setup({ mode, pets, team, setTeam, difficulty, setDifficulty, onStart, onBack, onExit, online, channel = 'classic' }) {
  const { t } = useI18n()
  const onlineCap = online.size === 'team' ? Math.max(1, online.ownerTeam.length) : 1
  // AI 高级竞技场恒为 1v1：只比两个项目
  const cap = channel === 'ai' ? 1 : mode === 'online' ? onlineCap : 3
  const toggle = (pet) => {
    const exists = team.some((p) => p.fullName === pet.fullName && p.platform === pet.platform)
    if (exists) setTeam(team.filter((p) => !(p.fullName === pet.fullName && p.platform === pet.platform)))
    else if (team.length < cap) setTeam([...team, pet])
  }

  const lead = team[0]
  const samePool = useMemo(
    () => (mode === 'same' && lead ? sameTypePool(lead.element?.key, lead) : []),
    [mode, lead],
  )
  const leadTier = lead ? tierOfPet(lead) : null

  const modeInfo = MODES.find((m) => m.key === mode)
  const hasEnemy = online.size === 'team' ? online.ownerTeam.length > 0 : !!online.opponent
  const ready = team.length > 0 && (mode !== 'online' || hasEnemy)

  return (
    <div className="battle-picker">
      <button className="back-link" onClick={onBack}>{t('← 换挑战方式', '← Change challenge')}</button>

      <div className="picker-head">
        <h2>{t(...modeInfo.name)}</h2>
        <p>{t(...modeInfo.desc)}</p>
      </div>

      {mode === 'online' && <OnlineSetup {...online} channel={channel} />}

      {mode === 'same' && (
        <div className="same-type-bar">
          {lead ? (
            <>
              <span className="same-label">{t('你的先发属性', 'Your lead type')}</span>
              <span className="type-chip big" style={{ color: lead.element.color, borderColor: `${lead.element.color}66` }}>
                {lead.element.name}{t('系', ' type')}
              </span>
              <span className="same-pool">
                {t(
                  `同属性同层（${tierLabel(leadTier)}）仓库 ${samePool.length} 个：`,
                  `${samePool.length} same-type, same-tier (${tierLabel(leadTier)}) repos: `,
                )}
                {samePool.slice(0, 6).map((p) => p.repo).join(' · ')}
                {samePool.length > 6 ? ' …' : ''}
              </span>
            </>
          ) : (
            <span className="same-pool">{t('先选一只精灵，我再去找和它同属性的仓库。', 'Pick a pet first, then I’ll find repos of the same type.')}</span>
          )}
        </div>
      )}

      {mode === 'random' && (
        <div className="same-type-bar">
          <span className="same-label">{t('对手池', 'Rival pool')}</span>
          <span className="same-pool">{t(`全部 ${rivalPets().length} 只知名仓库精灵随机抽取，抽到谁都事先不知道。`, `Random draw from all ${rivalPets().length} famous-repo pets — never know what’s coming.`)}</span>
        </div>
      )}

      <div className="picker-subhead">
        <span>{t(`出战精灵（${team.length}/${cap}）`, `Team (${team.length}/${cap})`)}</span>
        {mode === 'online' && (
          <em>
            {online.size === 'team'
              ? t(`整仓 ${cap}v${cap}：对方账号下每个项目一只`, `Full repo ${cap}v${cap}: one pet per project in that account`)
              : t('单项目 1v1：只能带一只', 'Single repo 1v1: one pet only')}
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
                  <small>Lv.{pet.level} · {pet.element.name}{t('系', ' type')} · {pet.quality.key}</small>
                </span>
                <span className="picker-check">{active ? '✓' : '+'}</span>
              </button>
            )
          })}
        </div>
      )}

      {mode !== 'online' ? (
        <div className="difficulty-row">
          <span className="difficulty-label">{t('对手强度', 'Rival strength')}</span>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              className={`diff-btn ${difficulty === d.key ? 'on' : ''}`}
              onClick={() => setDifficulty(d.key)}
            >
              {t(...d.name)}
              <small>{t(...d.desc)}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="difficulty-row">
          <span className="difficulty-label">{t('对手强度', 'Rival strength')}</span>
          <span className="fixed-diff">{t('在线对战按仓库真实实力，不设难度', 'Online battles use true repo strength — no difficulty')}</span>
        </div>
      )}

      <div className="picker-actions">
        <button className="primary-btn" disabled={!ready} onClick={onStart}>
          {mode === 'online'
            ? online.size === 'team'
              ? online.ownerTeam.length ? t(`整仓出战（${team.length}/${cap}）`, `Full-repo squad (${team.length}/${cap})`) : t('先扫描整仓', 'Scan the full repo first')
              : online.opponent ? t(`挑战 ${online.opponent.repo}`, `Challenge ${online.opponent.repo}`) : t('先扫描对手仓库', 'Scan the rival repo first')
            : t(`出战（${team.length}/${cap}）`, `Deploy (${team.length}/${cap})`)}
        </button>
      </div>
    </div>
  )
}

export default function Battle({ pets = [], initial = null, challenge = null, channel = 'classic', llmConfig = null, advanced = false, onChannel = null, onExit, onReward }) {
  const { t: tf } = useI18n()
  const candidates = useMemo(() => {
    const list = [...pets]
    if (initial && !list.some((p) => p.fullName === initial.fullName)) list.unshift(initial)
    return list
  }, [pets, initial])

  const [phase, setPhase] = useState('mode') // mode | select | fight | result
  // 战斗场景池：每次进场随机换一张地图
  const [arena, setArena] = useState('volcano') // volcano | space | island | sakura
  // AI 高级竞技场（channel='ai'）：模型推演状态 + 审计报告
  const [aiStatus, setAiStatus] = useState('idle') // idle | thinking | playing | error
  const [aiReport, setAiReport] = useState(null)
  const [aiError, setAiError] = useState('')
  const [reportTip, setReportTip] = useState('')
  const aiMatchRef = useRef(null) // { baseState, playerPet, enemyPet }，供失败重试复用

  // 进入战斗/结算时滚到舞台：窄屏下 sticky 顶栏会盖住 TURN 行，scroll-margin 让出高度
  useEffect(() => {
    if (phase === 'fight' || phase === 'result') {
      document.querySelector('.battle-stage')?.scrollIntoView({ block: 'start' })
    }
    if (phase === 'fight') {
      const pools = ['volcano', 'space', 'island', 'sakura']
      setArena(pools[Math.floor(Math.random() * pools.length)])
    }
  }, [phase])
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
    window.dispatchEvent(new Event('gitmon:fast-change'))
    return next
  })

  // 与顶栏"设置"面板的战斗快进开关联动（读值同步，避免反向翻转）
  useEffect(() => {
    const onFastChange = () => setFast(() => {
      try { return localStorage.getItem('gitmon:battle:fast') === '1' } catch { return false }
    })
    window.addEventListener('gitmon:fast-change', onFastChange)
    return () => window.removeEventListener('gitmon:fast-change', onFastChange)
  }, [])

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
  const juiceRef = useRef(null)
  const fieldRef = useRef(null)

  // 特效层单独拆包：不进首屏，进竞技场时才加载（pixelfx 的 30+ 个特效模块约 240KB；
  // GSAP 手感层另拆一个 chunk，只在这里用到）
  useEffect(() => {
    let alive = true
    import('../vfx.js').then((mod) => {
      if (alive) vfxRef.current = mod
    })
    import('../battle-juice.js').then((mod) => {
      if (alive) juiceRef.current = mod
    })
    return () => {
      alive = false
      timersRef.current.forEach(clearTimeout)
      vfxRef.current?.clearFx(fxLayerRef.current)
      juiceRef.current?.stopShake()
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

  const scanOpponent = async (rawInput) => {
    const raw = (rawInput ?? repoInput).trim()
    if (!raw) { setScanError(onlineSize === 'team' ? tf('先填一个账号或仓库地址', 'Enter an account or repo URL first') : tf('先填一个仓库地址', 'Enter a repo URL first')); return }
    const info = parseRepoInput(raw)
    if (!info) { setScanError(tf('无法识别的地址，请输入 GitHub / Gitee 仓库或账号链接', 'Unrecognized URL — paste a GitHub / Gitee repo or account link')); return }

    setScanError('')
    setScanning(true)
    try {
      // ① 单项目：只打对方一个仓库
      if (onlineSize === 'single') {
        if (info.kind !== 'repo') throw new Error(tf('单项目 PK 需要具体仓库地址，例如 github.com/owner/repo', 'Single-repo PK needs a concrete repo URL, e.g. github.com/owner/repo'))
        const builtin = matchBuiltinRival(info.platform, info.fullName)
        if (builtin) {
          setOpponent(builtin)
          setOpponentNote(tf('内置快照 · 离线可打', 'Built-in snapshot · offline ready'))
          return
        }
        const snap = await scanRepo(raw)
        setOpponent(rivalFromSnapshot(snap))
        setOpponentNote(snap.cached ? tf('线上数据 · 本地缓存', 'Live data · cached locally') : tf('线上数据 · 刚刚扫描', 'Live data · just scanned'))
        return
      }

      // ② 整仓：对方账号下的全部项目依次上场（填仓库时按它的账号算）
      const owner = info.owner
      const platform = info.platform
      const localTeam = matchBuiltinOwnerTeam(platform, owner)
      if (localTeam.length >= 2) {
        setOwnerTeam(localTeam)
        fillTeam(localTeam.length)
        setOpponentNote(tf(`内置快照 · ${owner} 的 ${localTeam.length} 个项目`, `Built-in snapshot · ${localTeam.length} projects of ${owner}`))
        return
      }
      const res = await scanOwnerBox({ kind: 'owner', platform, owner }, { limit: 30 })
      if (!res.snaps.length) {
        throw new Error(res.rateLimited
          ? tf('API 触发限流，稍后再试（设置 Token 可提高额度）', 'API rate limited — try again later (set a Token for more quota)')
          : tf('这个账号没有可挑战的公开项目', 'This account has no public projects to challenge'))
      }
      const pets = res.snaps
        .map((s) => rivalFromSnapshot(s))
        .sort((a, b) => powerOf(b) - powerOf(a))
      if (!pets.length) throw new Error(tf('这个账号没有可挑战的公开项目', 'This account has no public projects to challenge'))
      setOwnerTeam(pets)
      fillTeam(pets.length)
      setOpponentNote(tf(`线上数据 · ${owner} 的 ${pets.length} 个项目`, `Live data · ${pets.length} projects of ${owner}`))
    } catch (e) {
      setScanError(e.message || tf('扫描失败，请检查地址', 'Scan failed — check the URL'))
    } finally {
      setScanning(false)
    }
  }

  // 排行榜"挑战"进来：直接进在线单项目模式，自动填好并扫描对手仓库
  useEffect(() => {
    if (!challenge) return
    setMode('online')
    setOnlineSize('single')
    setPhase('select')
    setRepoInput(challenge)
    setScanError('')
    setTeam((prev) => (prev.length > 1 ? prev.slice(0, 1) : prev))
    scanOpponent(challenge)
    // scanOpponent 是渲染内函数，只在 challenge 变化时触发一次即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge])

  const start = () => {
    if (!team.length) return
    const teamMode = mode === 'online' && onlineSize === 'team' && channel !== 'ai'
    if (mode === 'online') {
      if (teamMode ? !ownerTeam.length : !opponent) return
    }

    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
    // AI 高级竞技场只比两个项目（1v1），其余按原规则
    const cap = channel === 'ai' ? 1 : mode === 'online' ? (teamMode ? Math.max(1, ownerTeam.length) : 1) : 3
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
    setAiStatus('idle')
    setAiReport(null)
    setAiError('')
    setPhase('fight')
    // 开战按钮是用户手势，在这里起 BGM 才能解锁 AudioContext
    bgm.startBattle()
    if (channel === 'ai') runAiBattle(built.state, line[0], foes[0])
  }

  // —— AI 高级竞技场：模型对比两个项目水平，逐回合推演 + 攒审计报告 ——
  const runAiBattle = async (baseState, playerPet, enemyPet) => {
    const match = { baseState, playerPet, enemyPet }
    aiMatchRef.current = match
    setAiStatus('thinking')
    setAiError('')
    setBusy(true)
    try {
      const data = await battleWithLLM({
        player: aiProfile(playerPet),
        opponent: aiProfile(enemyPet),
        difficulty: mode === 'online' ? 'normal' : difficulty,
        config: llmConfig,
      })
      const { rounds, winner, report } = data.battle
      setAiReport(report)
      setAiStatus('playing')
      // 逐回合回放：血量按模型给的百分比写回双方单位，不做本地伤害计算
      const applyRound = (i) => {
        const r = rounds[i]
        const pctToHp = (unit, pct) => Math.max(0, Math.round((unit.maxHp * pct) / 100))
        setState((prev) => {
          if (!prev) return prev
          const pTeam = prev.sides.player.team.map((u, k) => (k === prev.sides.player.active ? { ...u, hp: pctToHp(u, r.hpPlayer) } : u))
          const eTeam = prev.sides.enemy.team.map((u, k) => (k === prev.sides.enemy.active ? { ...u, hp: pctToHp(u, r.hpEnemy) } : u))
          return {
            ...prev,
            turn: i,
            sides: { player: { ...prev.sides.player, team: pTeam }, enemy: { ...prev.sides.enemy, team: eTeam } },
          }
        })
        const actor = r.actor === 'player' ? playerPet : enemyPet
        const target = r.actor === 'player' ? 'enemy' : 'player'
        setLog((prev) => [...prev, tf(`${actor.repo || actor.name} 使出「${r.move}」—— ${r.text}`, `${actor.repo || actor.name} uses「${r.move}」 — ${r.text}`)].slice(-40))
        setLunging(r.actor)
        sfx.attack({ physical: true, element: 'normal', power: 65 })
        setTimeout(() => setLunging(null), 300)
        // 掉血量：按 hp 差 × maxHp 换算，做受击演出
        const prevPct = i === 0 ? 100 : rounds[i - 1][target === 'player' ? 'hpPlayer' : 'hpEnemy']
        const nowPct = target === 'player' ? r.hpPlayer : r.hpEnemy
        const lost = Math.max(0, prevPct - nowPct)
        if (lost > 0) {
          const unitMax = target === 'player'
            ? baseState.sides.player.team[0].maxHp
            : baseState.sides.enemy.team[0].maxHp
          const value = Math.max(1, Math.round((unitMax * lost) / 100))
          setTimeout(() => {
            sfx.hit({ crit: lost >= 40, value })
            flash(target, { value, mult: lost >= 40 ? 1.5 : 1, crit: lost >= 40 })
            setHurt((prev) => ({ ...prev, [target]: true }))
            setTimeout(() => setHurt((prev) => ({ ...prev, [target]: false })), 320)
            juiceRef.current?.shakeField(fieldRef.current, { intensity: Math.min(0.7, 0.22 + lost / 100) })
          }, 340)
        }
      }

      for (let i = 0; i < rounds.length; i++) {
        applyRound(i)
        const isLast = i === rounds.length - 1
        await wait(fast ? (isLast ? 400 : 120) : isLast ? 1500 : 1400)
      }

      const finalWinner = winner
      setState((prev) => (prev ? { ...prev, winner: finalWinner } : prev))
      const xp = finalWinner === 'player' ? 300 : 180
      setReward(xp)
      if (!rewardedRef.current) {
        rewardedRef.current = true
        onReward?.(team, xp, finalWinner === 'player')
      }
      setAiStatus('idle')
      setPhase('result')
      bgm.stop()
      if (finalWinner === 'player') bgm.victory()
      else bgm.defeat()
      juiceRef.current?.shakeField(fieldRef.current, { intensity: finalWinner === 'player' ? 0.8 : 0.5 })
    } catch (e) {
      setAiStatus('error')
      setAiError(e.message || tf('模型推演失败，请重试', 'Model simulation failed — please retry'))
      setLog((prev) => [...prev, tf(`AI 推演失败：${e.message || '请重试'}`, `AI simulation failed: ${e.message || 'please retry'}`)].slice(-40))
    } finally {
      setBusy(false)
    }
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
          const physical = ev.move?.category === 'physical'
          // 出招音效 + 特效：物理走近战挥砍系，敌方（右侧）出手时特效镜像
          sfx.attack({ physical, element: ev.move?.type, power: ev.move?.power ?? 65 })
          vfxRef.current?.playAttack(fxLayerRef.current, slotOf(target).current, {
            element: ev.move?.type,
            power: ev.move?.power ?? 65,
            physical,
            flip: ev.side === 'enemy',
            seed: (Date.now() ^ Math.floor(Math.random() * 1e6)) >>> 0,
          })
          setTimeout(() => setLunging(null), 300)
        }, at)
        at += 360
      } else if (ev.t === 'damage') {
        const juice = juiceRef.current
        const field = fieldRef.current
        const holder = slotOf(ev.side).current?.querySelector('.sprite-holder')
        const isCrit = !!ev.crit
        schedule(() => {
          sfx.hit({ crit: isCrit, value: ev.value })
          flash(ev.side, ev)
          setHurt((prev) => ({ ...prev, [ev.side]: true }))
          setTimeout(() => setHurt((prev) => ({ ...prev, [ev.side]: false })), 320)
          if (ev.crit) vfxRef.current?.playCrit(fxLayerRef.current, slotOf(ev.side).current)
          // —— GSAP 手感层：震荡 / 击退 / 闪白 / 暴击推近 ——
          if (juice && field) {
            const intensity = isCrit ? 0.95 : Math.min(0.7, 0.22 + ev.value / 90)
            juice.shakeField(field, { intensity })
            if (holder) juice.knockback(holder, { power: isCrit ? 1.25 : Math.min(1, ev.value / 60) })
            if (isCrit) {
              juice.impactPunch(field, { scale: 1.05 })
              juice.impactFlash(fxLayerRef.current, { strength: 0.7 })
            } else if (ev.value >= 38) {
              juice.impactFlash(fxLayerRef.current, { strength: 0.32 })
            }
          }
        }, at)
        // 暴击附带「顿帧」：把后续演出整体延后，砸下去的瞬间画面像卡了一帧
        at += isCrit ? 360 : 240
      } else if (ev.t === 'faint') {
        const juice = juiceRef.current
        schedule(() => {
          vfxRef.current?.playFaint(fxLayerRef.current, slotOf(ev.side).current)
          juice?.shakeField(fieldRef.current, { intensity: 0.6 })
        }, at)
        at += 240
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
      // 结算收尾演出：赢家来一发更强、输家轻颤
      juiceRef.current?.shakeField(fieldRef.current, { intensity: next.winner === 'player' ? 0.8 : 0.5 })
      juiceRef.current?.impactFlash(fxLayerRef.current, {
        strength: next.winner === 'player' ? 0.55 : 0.3,
        color: next.winner === 'player' ? 'rgba(255, 226, 120, 1)' : 'rgba(255, 255, 255, 1)',
      })
    }
    setBusy(false)
  }

  // 自动对战：进入战斗后按节奏自动出招 / 换人，直到分出胜负，全程无需点击
  // AI 通道（高级竞技场）由 runAiBattle 推演回放，不走规则引擎
  useEffect(() => {
    if (channel === 'ai') return undefined
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
        <ModePicker pets={candidates} onPick={pickMode} onExit={onExit} channel={channel} advanced={advanced} onChannel={onChannel} />
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
          channel={channel}
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

  // 审计报告导出：复制到剪贴板 / 下载 .md
  const exportReport = async (kind) => {
    if (!aiReport) return
    const md = reportMarkdown(aiReport, playerUnit.name, enemyUnit.name, state.winner === 'player')
    if (kind === 'copy') {
      try {
        await navigator.clipboard.writeText(md)
        setReportTip(tf('已复制 Markdown', 'Markdown copied'))
        setTimeout(() => setReportTip(''), 1800)
      } catch {
        setReportTip(tf('复制失败，请用下载', 'Copy failed — use download'))
        setTimeout(() => setReportTip(''), 1800)
      }
      return
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gitmon-audit-${playerUnit.name}-vs-${enemyUnit.name}.md`.replace(/[\\/:*?"<>|]/g, '_')
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="battle-wrap">
      <div className="battle-topbar">
        <span className="hud-turn">TURN {String(state.turn + 1).padStart(2, '0')}</span>
        <span>{rivalTeamLabel(difficulty, mode, onlineSize)}</span>
        <span className="hud-dots" title={tf(`我方存活 ${myTeamAlive}`, `${myTeamAlive} alive on our side`)}>
          {state.sides.player.team.map((u, i) => <i key={i} className={u.fainted ? 'down' : ''} />)}
        </span>
        <span className="hud-vs">VS</span>
        <span className="hud-dots foe" title={tf(`对手存活 ${foeTeamAlive}`, `${foeTeamAlive} alive on the rival side`)}>
          {state.sides.enemy.team.map((u, i) => <i key={i} className={u.fainted ? 'down' : ''} />)}
        </span>
        <span className="hud-actions">
          <button className={`hud-btn ${fast ? 'on' : ''}`} onClick={toggleFast} title={tf('跳过出手演出，点一下立即结算（F）', 'Skip the attack animation — tap to resolve instantly (F)')}>
            » {fast ? tf('快进中', 'Fast▸') : tf('快进', 'Fast')}
          </button>
          <button className="ghost-btn tiny" onClick={onExit}>{tf('离开', 'Leave')}</button>
        </span>
      </div>

      <div className={`battle-field arena-${arena}`} ref={fieldRef}>
        <div className="field-sky" />
        <div className="field-grid" />
        <div className="arena-sparks" aria-hidden="true"><i /><i /><i /><i /><i /></div>

        <div className="battle-row enemy-row">
          <div
            ref={enemySlotRef}
            className={`sprite-slot enemy-slot ${lunging === 'enemy' ? 'is-attacking' : ''} ${hurt.enemy ? 'is-hurt' : ''}`}
          >
            <div className="sprite-holder">
              <PixelSprite pet={unitPet(enemyUnit)} size={148} />
            </div>
          </div>
          <UnitPanel unit={enemyUnit} side="enemy" fx={fx.enemy} shaking={shake.enemy} />
        </div>

        <div className="battle-row player-row">
          <UnitPanel unit={playerUnit} side="player" fx={fx.player} shaking={shake.player} />
          <div
            ref={playerSlotRef}
            className={`sprite-slot player-slot ${lunging === 'player' ? 'is-attacking' : ''} ${hurt.player ? 'is-hurt' : ''}`}
          >
            <div className="sprite-holder">
              <PixelSprite pet={unitPet(playerUnit)} size={182} />
            </div>
          </div>
        </div>

        {/* 招式横幅：取最近一条出招播报，索引变化即重挂载重播动画（播完停在透明） */}
        {(() => {
          let idx = -1
          for (let i = log.length - 1; i >= 0; i--) { if (/使出|使用|uses/.test(log[i])) { idx = i; break } }
          return (
            <div className="move-banner" key={idx} aria-hidden={idx < 0}>
              {idx >= 0 ? log[idx] : ''}
            </div>
          )
        })()}

        <div className="vfx-layer" ref={fxLayerRef} />
      </div>

      {/* 战报独立成播报条，不再压在精灵身上当调试日志 */}
      <div className="battle-log" ref={logRef} aria-live="polite">
        {log.slice(-4).map((line, i, arr) => (
          <p key={`${log.length - arr.length + i}-${line}`} className={i === arr.length - 1 ? 'latest' : ''}>{line}</p>
        ))}
      </div>

      {phase === 'result' && (() => {
        const win = state.winner === 'player'
        const alive = myTeamAlive
        const total = state.sides.player.team.length
        const grade = battleGrade(state.winner, state.turn, alive, total)
        const mvp = [...state.sides.player.team]
          .filter((u) => !u.fainted)
          .sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0] || state.sides.player.team[0]
        return (
          <div className={`battle-result ${win ? 'win' : 'lose'}`}>
            <div className="result-card px-box">
              <div className="confetti" aria-hidden>
                {win && Array.from({ length: 24 }, (_, i) => <i key={i} />)}
              </div>
              <div className={`result-grade g-${grade.toLowerCase()}`} key={grade}>
                <b>{grade}</b>
                <small>{tf('评级', 'Rank')}</small>
              </div>
              <h2 className={win ? 'win' : 'lose'}>{win ? tf('胜利', 'VICTORY') : tf('惜败', 'DEFEAT')}</h2>
              <p>{win ? tf('对手的仓库被你压了一头。', 'You out-classed the rival repo.') : tf('属性与节奏都被对手抓到了。', 'They read your typing and tempo.')}</p>
              <div className="result-stats">
                <span>{tf('回合', 'Turns')}<b>{state.turn}</b></span>
                <span>{tf('存活', 'Alive')}<b>{alive}/{total}</b></span>
                <span>{tf('击倒', 'KO')}<b>{state.sides.enemy.team.filter((u) => u.fainted).length}</b></span>
              </div>
              <div className="result-exp">
                <p className="reward">{tf('全队获得 ', 'Team earned ')}<b>+{reward} EXP</b></p>
                <div className="exp-track" aria-hidden>
                  {Array.from({ length: 20 }, (_, i) => (
                    <i key={i} className={i < Math.min(20, Math.ceil(reward / 15)) ? 'on' : ''} />
                  ))}
                </div>
              </div>
              {mvp && (
                <div className="result-mvp">
                  <PixelSprite pet={unitPet(mvp)} size={72} animate={false} />
                  <span><small>MVP</small><b>{mvp.name}</b><em>Lv.{mvp.level} · {mvp.qualityKey}</em></span>
                </div>
              )}
              <div className="actions">
                <button className="primary-btn" onClick={start}>{mode === 'random' ? tf('再抽一只', 'Draw Another') : tf('再战一场', 'Battle Again')}</button>
                <button className="ghost-btn" onClick={() => setPhase('select')}>{tf('换阵容', 'Change Team')}</button>
                <button className="ghost-btn" onClick={() => setPhase('mode')}>{tf('换模式', 'Change Mode')}</button>
                <button className="ghost-btn" onClick={onExit}>{tf('返回图鉴', 'Back to Dex')}</button>
              </div>
            </div>

            {/* AI 高级竞技场：结算审计报告（维度对比 / 证据 / 风险 / 建议，可导出 Markdown） */}
            {channel === 'ai' && aiReport && (
              <div className="audit-report px-box">
                <div className="audit-head">
                  <h3>{tf('审计报告', 'Audit Report')}</h3>
                  <span className="audit-sub">{tf('AI 对比 · ', 'AI compare · ')}{playerUnit.name} vs {enemyUnit.name}</span>
                </div>
                <p className="audit-verdict">{aiReport.verdict}</p>

                {aiReport.dims.length > 0 && (
                  <div className="audit-dims">
                    {aiReport.dims.map((d) => (
                      <div className="audit-dim" key={d.name}>
                        <span className="dim-name">{d.name}</span>
                        <span className="dim-nums">
                          <b className="me">{d.player}</b>
                          <i className={d.winner === 'player' ? 'lead me' : d.winner === 'enemy' ? 'lead foe' : ''}>
                            {d.winner === 'player' ? tf('◀ 我方领先', '◀ Ours') : d.winner === 'enemy' ? tf('对手领先 ▶', 'Rival ▶') : tf('持平', 'Even')}
                          </i>
                          <b className="foe">{d.enemy}</b>
                        </span>
                        <div className="dim-track">
                          <i className="me" style={{ width: `${d.player}%` }} />
                          <i className="foe" style={{ width: `${d.enemy}%` }} />
                        </div>
                        <small className="dim-note">{d.note}</small>
                      </div>
                    ))}
                  </div>
                )}

                {aiReport.evidence.length > 0 && (
                  <div className="audit-sec">
                    <h4>{tf('证据引用', 'Evidence')}</h4>
                    <ul>{aiReport.evidence.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
                <div className="audit-cols">
                  {aiReport.risks.length > 0 && (
                    <div className="audit-sec">
                      <h4>{tf('风险', 'Risks')}</h4>
                      <ul>{aiReport.risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                  {aiReport.suggestions.length > 0 && (
                    <div className="audit-sec">
                      <h4>{tf('建议', 'Suggestions')}</h4>
                      <ul>{aiReport.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                </div>

                <div className="audit-actions">
                  <button className="ghost-btn" onClick={() => exportReport('copy')}>{tf('复制 Markdown', 'Copy Markdown')}</button>
                  <button className="ghost-btn" onClick={() => exportReport('download')}>{tf('下载 .md', 'Download .md')}</button>
                  {reportTip && <span className="audit-tip">{reportTip}</span>}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* AI 高级竞技场：模型推演失败时给重试出口，不进结算 */}
      {channel === 'ai' && aiStatus === 'error' && (
        <div className="ai-error-bar px-box">
          <p>! {aiError}</p>
          <div className="ai-error-actions">
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() => { const m = aiMatchRef.current; if (m) runAiBattle(m.baseState, m.playerPet, m.enemyPet) }}
            >
              {tf('重试', 'Retry')}
            </button>
            <button className="ghost-btn" onClick={() => setPhase('select')}>{tf('回上一步', 'Back')}</button>
          </div>
        </div>
      )}

      <div className="battle-controls auto-controls">
        <div className="control-head">
          <span className="control-title">
            {channel === 'ai'
              ? state.winner ? tf('推演结束', 'Simulation done') : aiStatus === 'thinking' ? tf('AI 正在对比两个项目水平…', 'AI comparing both projects…') : tf('AI 逐回合推演中', 'AI simulating round by round')
              : state.winner ? tf('战斗结束', 'Battle over') : busy ? tf('自动结算中…', 'Resolving…') : tf('自动对战中', 'Auto-battling')}
          </span>
          <span className="control-hint">
            {channel === 'ai' ? tf('模型推演 · 结算附审计报告', 'Model-driven · report included') : <>AI {tf('自动挑招式 / 换人 · ', 'auto picks moves / swaps · ')}<kbd>F</kbd>{tf(' 快进', ' fast')}</>}
          </span>
        </div>
        <div className="auto-status">
          <span className={`auto-pulse ${state.winner ? 'done' : ''}`} aria-hidden="true" />
          <span className="auto-unit">
            <b>{playerUnit.name}</b>
            <small>Lv.{playerUnit.level} · {tf('战力', 'PWR')} {playerUnit.combatPower} · HP {playerUnit.hp}/{playerUnit.maxHp}</small>
          </span>
          <span className="auto-vs">VS</span>
          <span className="auto-unit foe">
            <b>{enemyUnit.name}</b>
            <small>Lv.{enemyUnit.level} · {tf('战力', 'PWR')} {enemyUnit.combatPower} · HP {enemyUnit.hp}/{enemyUnit.maxHp}</small>
          </span>
        </div>
        <div className="battle-side-actions">
          <span className="battle-tip">
            {[enemyUnit.element.name, enemyUnit.elementSecondary?.name].filter(Boolean).join('/')}{tf('系', ' type')} · {tf('我方速度', 'Our speed')} {Math.round(playerUnit.stats.spe * (playerUnit.passive === 'static' ? 1.15 : 1))}
            {mode !== 'online' && ` · ${modeLabel(mode)}`}
          </span>
        </div>
      </div>
    </main>
  )
}
