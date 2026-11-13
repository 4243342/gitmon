// 深度审计流水线（docs/AI-AUDIT.md §3/§4）：
//   真实抓取仓库证据 → 里程碑节拍（弹幕 / 弹窗 / 分段加级）→ 证据交给模型总评。
// 职责边界：本模块只做「抓取 + 节拍编排 + 事件流」，不评测——品质六维技能仍全部由模型给出。
import { parseRepoInput, scanRepo } from './scan.js'
import { judge } from './engine.js'
import { t } from './i18n.js' // 双语：事件文案在 emit 时刻取当前语言

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fmt = (n) => {
  const v = Number(n) || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}k`
  return String(v)
}

/** 快照 → evidence（后端 /api/llm/evaluate 的 evidence 字段，只放事实） */
export function buildEvidence(snap, readmeHead = '') {
  const languages = {}
  for (const l of snap.languages || []) languages[l.name] = Number(Number(l.pct).toFixed(1))
  return {
    attrs: {
      stars: snap.stars || 0,
      forks: snap.forks || 0,
      watchers: snap.watchers || 0,
      license: snap.license ?? null,
      created: (snap.createdAt || '').slice(0, 10),
      pushed: (snap.pushedAt || '').slice(0, 10),
      archived: !!snap.archived,
    },
    languages,
    scale: {
      commits: snap.commits || 0,
      contributors: snap.contributors || 0,
      sizeKb: snap.sizeKb || 0,
      ageMonths: Math.round(snap.ageMonths || 0),
      daysSincePush: Math.round(snap.daysSincePush || 0),
    },
    quality: {
      hasCI: !!snap.hasCI,
      hasTests: !!snap.hasTests,
      hasDocs: !!snap.hasDocs,
      hasChangelog: !!snap.hasChangelog,
      releases: snap.releaseCount || 0,
      openIssues: snap.openIssues || 0,
    },
    rootHints: (snap.rootFiles || []).slice(0, 20),
    description: (snap.description || '').slice(0, 200),
    readmeHead: String(readmeHead || '').slice(0, 300),
  }
}

// README 首段（尽力而为，失败不拦流水线）
async function fetchReadme(snap) {
  try {
    if (snap.platform === 'github') {
      let token = ''
      try { token = localStorage.getItem('gitmon:gh_token') || '' } catch { /* 隐私模式 */ }
      const res = await fetch(`https://api.github.com/repos/${snap.owner}/${snap.repo}/readme`, {
        headers: token
          ? { Accept: 'application/vnd.github.raw', Authorization: `Bearer ${token}` }
          : { Accept: 'application/vnd.github.raw' },
        signal: AbortSignal.timeout(8000),
      })
      return res.ok ? (await res.text()).slice(0, 300) : ''
    }
    const res = await fetch(`https://gitee.com/api/v5/repos/${snap.owner}/${snap.repo}/readme`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const body = await res.json()
    const b64 = String(body.content || '').replace(/\s/g, '')
    if (!b64) return ''
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes).slice(0, 300)
  } catch {
    return ''
  }
}

// 预览宠物：属性/种族/立绘种子一次算全（judge 就是本地规则引擎的完整画像）。
// M0 抓取完成后即 emit spawn，但要等 M1「发现属性」才在舞台中央显形（之前是光团）。
function previewPetOf(snap) {
  try {
    return judge(snap)
  } catch {
    return null
  }
}

// 终场等级滚动时长：跨度越大滚得越久，封顶 3.6s（审计台内滚完，不再留到撕卡）
export function finalRollDuration(from, to) {
  const span = Math.max(0, (Number(to) || 1) - (Number(from) || 1))
  return Math.round(Math.min(3600, Math.max(900, 700 + span * 6)))
}

/**
 * 里程碑计划（混合加级制，已拍板）：
 * M0 连接(0) → M1 属性(+1) → M2 生态位(+3) → M3 工程量(+3, 主涨) → M4 质量(+1)，
 * 合计到 Lv.9（幼体），大等级在 M5 模型总评返回时于审计台内一口气滚到终值。
 * beats：各里程碑后的最小展示节拍（毫秒），保证整场落在 2–5 分钟。
 */
function milestonePlan(snap) {
  const guess = previewPetOf(snap)
  const top = (snap.languages || [])[0]
  const years = Math.max(1, Math.round((snap.ageMonths || 0) / 12))
  return [
    {
      step: 0,
      title: t('M0 连接仓库', 'M0 Connect repo'),
      gain: 0,
      barrages: [
        t(`★ ${fmt(snap.stars)} 枚星 · fork ${fmt(snap.forks)}`, `★ ${fmt(snap.stars)} stars · fork ${fmt(snap.forks)}`),
        t(`创建于 ${snap.createdAt ? snap.createdAt.slice(0, 10) : '未知'}`, `Created ${snap.createdAt ? snap.createdAt.slice(0, 10) : 'unknown'}`),
        snap.license ? t(`许可证 ${snap.license}`, `License ${snap.license}`) : t('未声明许可证', 'No license declared'),
      ],
    },
    {
      step: 1,
      title: t('M1 发现属性', 'M1 Discover element'),
      gain: 1,
      popup: { kind: 'element', name: `${guess.element?.name || t('未知', 'unknown')} · ${t('勘测预览', 'survey preview')}`, sub: top ? `${top.name} ${top.pct.toFixed(0)}%` : t('语言构成未知', 'Language mix unknown') },
      barrages: [
        top ? t(`语言构成：${top.name} 占 ${top.pct.toFixed(0)}%`, `Language mix: ${top.name} ${top.pct.toFixed(0)}%`) : t('语言构成读取失败', 'Language mix unreadable'),
        t('元素反应已确认', 'Elemental reaction confirmed'),
      ],
    },
    {
      step: 2,
      title: t('M2 生态位', 'M2 Ecological niche'),
      gain: 3,
      popup: { kind: 'species', name: guess.species?.name || '未知', sub: (snap.topics || []).slice(0, 3).join(' · ') || (snap.description || '').slice(0, 30) },
      barrages: [
        t(`根目录线索：${(snap.rootFiles || []).slice(0, 4).join(' / ') || '（空仓库）'}`, `Root clues: ${(snap.rootFiles || []).slice(0, 4).join(' / ') || '(empty repo)'}`),
        snap.hasTests ? t('测试目录在岗', 'Test dir present') : t('未见测试目录', 'No test dir found'),
        snap.hasDocs ? t('文档库在岗', 'Docs present') : t('未见独立文档目录', 'No separate docs dir'),
      ],
    },
    {
      step: 3,
      title: t('M3 工程量勘测', 'M3 Scale survey'),
      gain: 3,
      barrages: [
        t(`足迹：${fmt(snap.commits)} 次提交`, `Trail: ${fmt(snap.commits)} commits`),
        t(`贡献者 ${fmt(snap.contributors)} 人`, `${fmt(snap.contributors)} contributors`),
        t(`代码库 ${fmt(snap.sizeKb)}KB`, `Codebase ${fmt(snap.sizeKb)}KB`),
        t(`维护历史 ${years} 年`, `Maintained for ${years} years`),
      ],
    },
    {
      step: 4,
      title: t('M4 质量检验', 'M4 Quality check'),
      gain: 1,
      barrages: [
        snap.hasCI ? t('CI 徽章亮起', 'CI badge lit') : t('未见 CI 配置', 'No CI config found'),
        t(`发布 ${fmt(snap.releaseCount)} 个 release`, `${fmt(snap.releaseCount)} releases`),
        t(`开放 issue ${fmt(snap.openIssues)}`, `${fmt(snap.openIssues)} open issues`),
        t(`最近提交 ${fmt(snap.daysSincePush)} 天前`, `Last commit ${snap.daysSincePush} days ago`),
        (snap.daysSincePush || 0) > 180 ? t('沉睡风险 · 维护健康度承压', 'Slumbering · maintenance under strain') : t('仍在活跃提交', 'Still actively committing'),
      ],
    },
  ]
}

// 抓取失败的降级计划：文案改口「模型推测」，但等级节拍照常推进——
// 终值仍由模型给，中途 1→9 的勘测是演出骨架，停着不动会让等级/进化动画整体消失。
function fallbackPlan(reason) {
  return [
    { step: 0, title: t('M0 连接仓库', 'M0 Connect repo'), gain: 0, barrages: [t(`真实审计受阻：${reason}`, `Real audit blocked: ${reason}`), t('转为模型推测模式', 'Switching to model guess mode')] },
    { step: 1, title: t('M1 发现属性', 'M1 Discover element'), gain: 1, barrages: [t('属性改由模型推测', 'Element left to model guess')] },
    { step: 2, title: t('M2 生态位', 'M2 Ecological niche'), gain: 3, barrages: [t('种族改由模型推测', 'Species left to model guess')] },
    { step: 3, title: t('M3 工程量勘测', 'M3 Scale survey'), gain: 3, barrages: [t('工程量改由模型推测', 'Scale left to model guess')] },
    { step: 4, title: t('M4 质量检验', 'M4 Quality check'), gain: 1, barrages: [t('品质证据缺失，模型按知识给估值', 'Quality evidence missing; model estimates from knowledge')] },
  ]
}

const BASE_BEATS = [8000, 22000, 16000, 26000, 22000] // M0..M4 后的最小节拍 ≈ 94s（弹幕填充）

/** 节拍器：把弹幕分批打进事件流，等满 ms；shouldSkip() 为真时快进 */
async function pace(ms, lines, emit, shouldSkip) {
  const dump = (from) => { for (let i = from; i < lines.length; i++) emit({ kind: 'barrage', text: lines[i] }) }
  if (shouldSkip() || ms <= 0) { dump(0); return }
  const start = Date.now()
  const step = Math.max(2200, ms / (lines.length + 1))
  for (let i = 0; i < lines.length; i++) {
    emit({ kind: 'barrage', text: lines[i] })
    if (shouldSkip()) { dump(i + 1); return }
    const elapsed = Date.now() - start
    if (elapsed >= ms) return
    await sleep(Math.min(step, ms - elapsed))
    if (shouldSkip()) { dump(i + 1); return }
  }
  const left = ms - (Date.now() - start)
  if (left > 0 && !shouldSkip()) await sleep(left)
}

/**
 * 深度审计主流程。
 * @param {object} opts
 * @param {string} opts.input   仓库地址 / owner/repo
 * @param {(evidence: object|null) => Promise<{evaluation, meta}>} opts.evaluate 模型总评（App 注入，便于并行）
 * @param {(ev: object) => void} opts.onEvent  事件流：barrage/milestone/popup/levelup/warn/done
 * @param {() => boolean} opts.shouldSkip  用户点了「跳过」→ 节拍归零
 * @returns {Promise<{data, snap, evidence, midLevel}>}
 */
export async function runDeepAudit({ input, evaluate, onEvent, shouldSkip = () => false, buildPreview = null }) {
  let seq = 0
  const emit = (ev) => onEvent({ seq: seq++, ...ev })

  const info = parseRepoInput(input)
  if (info?.kind === 'owner') {
    throw new Error(t('深度审计只支持单个仓库地址（账号请走整箱抽卡）', 'Deep audit takes a single repo (use box draw for whole accounts)'))
  }

  emit({ kind: 'barrage', text: t('档案库连接已建立', 'Archive link established') })
  emit({ kind: 'milestone', step: 0, title: t('M0 连接仓库', 'M0 Connect repo') })

  // ---- 真实抓取（失败则降级为纯推测，流水线不中断）----
  let snap = null
  try {
    emit({ kind: 'barrage', text: t('正在读取仓库元数据与文件树…', 'Reading repo metadata & file tree…') })
    snap = await scanRepo(input)
    emit({ kind: 'barrage', text: snap.cached ? t('命中快照缓存，直接开卷', 'Snapshot cache hit — fast track') : t('档案已调取', 'Archive retrieved') })
    // 预览宠物入流（舞台先捏好形态，M1 属性弹窗时才显形；M5 会用模型定稿覆盖）
    const previewPet = previewPetOf(snap)
    if (previewPet) emit({ kind: 'spawn', pet: previewPet })
  } catch (e) {
    emit({ kind: 'warn', text: e.message || t('仓库抓取失败', 'Repo fetch failed') })
  }

  const readme = snap ? await fetchReadme(snap) : ''
  const evidence = snap ? buildEvidence(snap, readme) : null

  // ---- 模型总评与里程碑节拍并行 ----
  emit({ kind: 'barrage', text: t('已把证据交给评测官，落章与勘测同时进行…', 'Evidence handed to the rater; stamping while surveying…') })
  const evalP = Promise.resolve().then(() => evaluate(evidence))

  const plan = snap ? milestonePlan(snap) : fallbackPlan(t('仓库抓取失败', 'Repo fetch failed'))
  let level = 1
  emit({ kind: 'levelup', level })

  for (let i = 0; i < plan.length; i++) {
    const m = plan[i]
    if (i > 0) {
      emit({ kind: 'milestone', step: m.step, title: m.title })
      // 注意：不能 spread m.popup——它自带 kind:'element' 会把事件 kind 覆盖掉
      if (m.popup) emit({ kind: 'popup', kindOf: m.popup.kind, name: m.popup.name, sub: m.popup.sub })
    }
    await pace(BASE_BEATS[i], m.barrages, emit, shouldSkip)
    if (m.gain) {
      level = Math.min(9, level + m.gain) // 中途上限 Lv.9：大等级在 M5 台内一口气滚到终值
      emit({ kind: 'levelup', level })
      emit({ kind: 'barrage', text: t(`勘测等级 Lv.${level}`, `Survey level Lv.${level}`) })
    }
  }

  emit({ kind: 'barrage', text: t('评测官正在落章…', 'The rater is stamping…') })
  emit({ kind: 'milestone', step: 5, title: t('M5 模型总评', 'M5 Model verdict') })
  const data = await evalP
  // M5 定稿：高级模式的属性/种族由模型给，和前面本地规则引擎的「勘测预览」可能不同。
  // 这里用模型结果重新显形一次，保证舞台上看到的物种 = 最终卡面（抓取失败时也靠它补形态）。
  if (typeof buildPreview === 'function') {
    try {
      const preview = buildPreview(data)
      if (preview) {
        emit({ kind: 'popup', kindOf: 'element', name: `${preview.element?.name || ''} · ${t('模型定稿', 'model verdict')}`, sub: preview.species?.name || '' })
        emit({ kind: 'spawn', pet: preview })
        await sleep(700) // 留一拍给「显形 → 进化」的过渡
      }
    } catch { /* 预览失败不影响出卡 */ }
  }
  // 终场等级：审计台内直接滚到模型终值（等级与勘测同步动，不再等撕卡才炸出来）
  const parsed = Math.round(Number(data?.evaluation?.level))
  const finalLevel = Number.isFinite(parsed) && parsed > 0 ? Math.max(parsed, level) : level
  if (shouldSkip()) emit({ kind: 'skip' })
  emit({ kind: 'final', level: finalLevel })
  emit({ kind: 'done' })
  return { data, snap, evidence, midLevel: level, finalLevel }
}
