// 深度审计流水线（docs/AI-AUDIT.md §3/§4）：
//   真实抓取仓库证据 → 里程碑节拍（弹幕 / 弹窗 / 分段加级）→ 证据交给模型总评。
// 职责边界：本模块只做「抓取 + 节拍编排 + 事件流」，不评测——品质六维技能仍全部由模型给出。
import { parseRepoInput, scanRepo } from './scan.js'
import { judge } from './engine.js'

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
      title: 'M0 连接仓库',
      gain: 0,
      barrages: [
        `★ ${fmt(snap.stars)} 枚星 · fork ${fmt(snap.forks)}`,
        `创建于 ${snap.createdAt ? snap.createdAt.slice(0, 10) : '未知'}`,
        snap.license ? `许可证 ${snap.license}` : '未声明许可证',
      ],
    },
    {
      step: 1,
      title: 'M1 发现属性',
      gain: 1,
      popup: { kind: 'element', name: guess.element?.name || '未知', sub: top ? `${top.name} ${top.pct.toFixed(0)}%` : '语言构成未知' },
      barrages: [
        top ? `语言构成：${top.name} 占 ${top.pct.toFixed(0)}%` : '语言构成读取失败',
        '元素反应已确认',
      ],
    },
    {
      step: 2,
      title: 'M2 生态位',
      gain: 3,
      popup: { kind: 'species', name: guess.species?.name || '未知', sub: (snap.topics || []).slice(0, 3).join(' · ') || (snap.description || '').slice(0, 30) },
      barrages: [
        `根目录线索：${(snap.rootFiles || []).slice(0, 4).join(' / ') || '（空仓库）'}`,
        snap.hasTests ? '测试目录在岗' : '未见测试目录',
        snap.hasDocs ? '文档库在岗' : '未见独立文档目录',
      ],
    },
    {
      step: 3,
      title: 'M3 工程量勘测',
      gain: 3,
      barrages: [
        `足迹：${fmt(snap.commits)} 次提交`,
        `贡献者 ${fmt(snap.contributors)} 人`,
        `代码库 ${fmt(snap.sizeKb)}KB`,
        `维护历史 ${years} 年`,
      ],
    },
    {
      step: 4,
      title: 'M4 质量检验',
      gain: 1,
      barrages: [
        snap.hasCI ? 'CI 徽章亮起' : '未见 CI 配置',
        `发布 ${fmt(snap.releaseCount)} 个 release`,
        `开放 issue ${fmt(snap.openIssues)}`,
        `最近提交 ${fmt(snap.daysSincePush)} 天前`,
        (snap.daysSincePush || 0) > 180 ? '沉睡风险 · 维护健康度承压' : '仍在活跃提交',
      ],
    },
  ]
}

// 抓取失败的降级计划：全部文案改口「模型推测」，不加级（真实感不能靠编）
function fallbackPlan(reason) {
  return [
    { step: 0, title: 'M0 连接仓库', gain: 0, barrages: [`真实审计受阻：${reason}`, '转为模型推测模式'] },
    { step: 1, title: 'M1 发现属性', gain: 0, barrages: ['属性改由模型推测'] },
    { step: 2, title: 'M2 生态位', gain: 0, barrages: ['种族改由模型推测'] },
    { step: 3, title: 'M3 工程量勘测', gain: 0, barrages: ['工程量改由模型推测'] },
    { step: 4, title: 'M4 质量检验', gain: 0, barrages: ['品质证据缺失，模型按知识给估值'] },
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
export async function runDeepAudit({ input, evaluate, onEvent, shouldSkip = () => false }) {
  let seq = 0
  const emit = (ev) => onEvent({ seq: seq++, ...ev })

  const info = parseRepoInput(input)
  if (info?.kind === 'owner') {
    throw new Error('深度审计只支持单个仓库地址（账号请走整箱抽卡）')
  }

  emit({ kind: 'barrage', text: '档案库连接已建立' })
  emit({ kind: 'milestone', step: 0, title: 'M0 连接仓库' })

  // ---- 真实抓取（失败则降级为纯推测，流水线不中断）----
  let snap = null
  try {
    emit({ kind: 'barrage', text: '正在读取仓库元数据与文件树…' })
    snap = await scanRepo(input)
    emit({ kind: 'barrage', text: snap.cached ? '命中快照缓存，直接开卷' : '档案已调取' })
    // 预览宠物入流（舞台先捏好形态，M1 属性弹窗时才显形）
    const previewPet = previewPetOf(snap)
    if (previewPet) emit({ kind: 'spawn', pet: previewPet })
  } catch (e) {
    emit({ kind: 'warn', text: e.message || '仓库抓取失败' })
  }

  const readme = snap ? await fetchReadme(snap) : ''
  const evidence = snap ? buildEvidence(snap, readme) : null

  // ---- 模型总评与里程碑节拍并行 ----
  emit({ kind: 'barrage', text: '已把证据交给评测官，落章与勘测同时进行…' })
  const evalP = Promise.resolve().then(() => evaluate(evidence))

  const plan = snap ? milestonePlan(snap) : fallbackPlan('仓库抓取失败')
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
      emit({ kind: 'barrage', text: `勘测等级 Lv.${level}` })
    }
  }

  emit({ kind: 'barrage', text: '评测官正在落章…' })
  emit({ kind: 'milestone', step: 5, title: 'M5 模型总评' })
  const data = await evalP
  // 终场等级：审计台内直接滚到模型终值（等级与勘测同步动，不再等撕卡才炸出来）
  const parsed = Math.round(Number(data?.evaluation?.level))
  const finalLevel = Number.isFinite(parsed) && parsed > 0 ? Math.max(parsed, level) : level
  if (shouldSkip()) emit({ kind: 'skip' })
  emit({ kind: 'final', level: finalLevel })
  emit({ kind: 'done' })
  return { data, snap, evidence, midLevel: level, finalLevel }
}
