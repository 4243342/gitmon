// 根基与性格词条（文档 §6.3 / §6.4）——前端 mock 版，与后端 traits.py 同规则。
//
// 差异说明：浏览器里拿不到测试文件数与真实 AI 味，只能拿扫描快照的近似值；
// 后端接入后 foundation / traits / aiRate 全部以 API 返回为准。

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const clamp01 = (v) => clamp(v, 0, 1)

export const FOUNDATION_WEIGHTS = {
  tests: 0.3,
  granularity: 0.2,
  history: 0.15,
  docs: 0.2,
  authenticity: 0.15,
}

const TIERS = [
  [80, 'solid', '稳固'],
  [60, 'fair', '尚可'],
  [40, 'loose', '松动'],
  [0, 'unstable', '根基不稳'],
]

export function foundationTier(score) {
  const hit = TIERS.find(([min]) => score >= min) || TIERS[TIERS.length - 1]
  return { key: hit[1], name: hit[2], min: hit[0] }
}

// mock：用"有没有测试目录"近似测试占比
function testRatioOf(snap) {
  if (typeof snap.testRatio === 'number') return snap.testRatio
  return snap.hasTests ? 0.16 : 0.015
}

function linesPerCommit(snap) {
  const loc = (snap.sizeKb || 0) * 1024 / 36
  const commits = snap.commits || 0
  if (commits <= 0) return 600
  return loc / commits
}

export function foundationOf(snap, aiRate = snap.aiRate ?? null) {
  const tests = clamp01(testRatioOf(snap) / 0.25)
  const perCommit = linesPerCommit(snap)
  const granularity = clamp01(1 - (perCommit - 80) / 520)
  const history = clamp01((snap.ageMonths || 0) / 60)
  const docs =
    0.6 * clamp01((snap.description?.length || 0) / 90) +
    0.2 * (snap.license ? 1 : 0) +
    0.2 * (snap.hasDocs ? 1 : 0)
  const authenticity = aiRate == null ? 0.65 : clamp01(1 - aiRate / 100)

  const dims = {
    tests: Math.round(tests * 1000) / 10,
    granularity: Math.round(granularity * 1000) / 10,
    history: Math.round(history * 1000) / 10,
    docs: Math.round(docs * 1000) / 10,
    authenticity: Math.round(authenticity * 1000) / 10,
  }
  let score = Object.entries(dims).reduce((sum, [key, value]) => sum + value * FOUNDATION_WEIGHTS[key], 0)
  if (aiRate != null) {
    if (aiRate >= 80) score = Math.min(score, 38)
    else if (aiRate >= 60) score = Math.min(score, 55)
  }
  return { score: Math.round(score * 10) / 10, dims }
}

const trait = (key, name, kind, desc, reason, effect) => ({ key, name, kind, desc, reason, effect })

export function traitsOf(snap, { aiRate = snap.aiRate ?? null } = {}) {
  const list = []
  const perCommit = linesPerCommit(snap)
  const testRatio = testRatioOf(snap)

  if (aiRate != null && aiRate >= 75) {
    list.push(trait('generated_body', '生成体', 'negative',
      '骨架是补全出来的：结构完整、注释齐整，但没人真正走过每一步。',
      `AI 味 ${Math.round(aiRate)}/100（几乎全生成）`,
      { statsPct: -12, expPct: 25, milestone: 2 }))
  } else if (aiRate != null && aiRate >= 50) {
    list.push(trait('unstable_foundation', '根基不稳', 'negative',
      '跑得起来，但底座是浮的：一改就塌，一压就裂。',
      `AI 味 ${Math.round(aiRate)}/100（以生成稿为主）`,
      { statsPct: -8, expPct: 15, milestone: 1 }))
  }
  if (!snap.hasTests) {
    list.push(trait('naked', '裸奔无测试', 'negative',
      '没有任何安全网，敢动一下都算勇气。', '仓库里找不到测试目录', { 防御: -15 }))
  }
  if (perCommit > 600 && (snap.commits || 0) >= 5) {
    list.push(trait('giant_commits', '巨提交史', 'negative',
      '历史上习惯一次糊完，回滚成本比开发成本还高。', `平均 ${Math.round(perCommit)} 行/提交`, { 速度: -8 }))
  }
  if (snap.daysSincePush > 180) {
    list.push(trait('sleeping', '沉睡症', 'negative',
      '很久没有动静，肌肉已经开始萎缩。', `${Math.round(snap.daysSincePush)} 天未推送`, { 速度: -20, HP: -10 }))
  }
  if (snap.contributors <= 1 && snap.openIssues >= 20) {
    list.push(trait('island', '孤岛项目', 'negative',
      '只有一个人，issue 堆成了山，没人复核也没人接力。', '单人维护且 issue 堆积', { 特攻: -8 }))
  }
  if (snap.archived) {
    list.push(trait('half_done', '半途而废', 'negative',
      '被归档的仓库，故事停在了半页。', '仓库已归档', { HP: -12, 攻击: -8 }))
  }
  if (testRatio >= 0.25) {
    list.push(trait('test_monk', '测试苦行僧', 'positive',
      '先写测试再写实现，改代码时心里有底。', `测试占比 ${Math.round(testRatio * 100)}%`, { 防御: 12 }))
  }
  if (snap.hasDocs && (snap.description?.length || 0) >= 40) {
    list.push(trait('doc_neat', '文档洁癖', 'positive',
      '文档和代码一起长，读的人不用猜。', '有 docs 目录且描述完整', { 特防: 10 }))
  }
  if ((snap.commits || 0) >= 100 && perCommit <= 120 && snap.releaseCount >= 2) {
    list.push(trait('steady', '稳如老狗', 'positive',
      '小步提交、按时发版，出问题也能精准回滚。',
      `平均 ${Math.round(perCommit)} 行/提交，${snap.releaseCount} 次发版`, { 防御: 6, HP: 5 }))
  }
  if (snap.contributors >= 10 && snap.openIssues < 30) {
    list.push(trait('evangelist', '开源传教士', 'positive',
      '有人提、有人改、有人收尾，社区自己在转。', `${snap.contributors} 位贡献者`, { HP: 8 }))
  }
  if (snap.contributors === 1 && snap.stars >= 50) {
    list.push(trait('lone_wolf', '独行侠', 'positive',
      '一个人也能打出名声，只是没人帮你守夜。', `单人维护，${snap.stars} star`, { 特攻: 8, 特防: -4 }))
  }
  if ((snap.ageMonths || 0) >= 60) {
    list.push(trait('veteran', '十年老店', 'positive',
      '活得够久，什么坑都踩过一遍了。', `仓库已有 ${Math.round(snap.ageMonths)} 个月`, { HP: 10 }))
  }

  list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'negative' ? -1 : 1))
  return list.slice(0, 4)
}

export const STAT_NAMES = ['攻击', '防御', '速度', '特攻', '特防', 'HP']

const gradeOf = (v) => (v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : 'D')

export function applyTraits(stats, traits) {
  const globalPct = traits.reduce((sum, t) => sum + (t.effect.statsPct || 0), 0)
  const flat = {}
  for (const t of traits) {
    for (const key of STAT_NAMES) {
      if (t.effect[key]) flat[key] = (flat[key] || 0) + t.effect[key]
    }
  }
  return stats.map((s) => {
    const value = Math.round(clamp(s.value * (1 + globalPct / 100) + (flat[s.name] || 0), 5, 100))
    return { ...s, value, grade: gradeOf(value) }
  })
}

export function xpMultiplier(traits) {
  const pct = traits.reduce((sum, t) => sum + (t.effect.expPct || 0), 0)
  return 1 + pct / 100
}

export function traitSummary(traits) {
  return traits.length ? traits.map((t) => t.name).join(' · ') : '性格未定'
}

export function traitHints(traits) {
  return traits.filter((t) => t.kind === 'negative').map((t) => ({
    name: t.name,
    fix: FIX_HINTS[t.key] || '',
  }))
}

const FIX_HINTS = {
  unstable_foundation: '人工重构核心模块、补测试，把 AI 味压到 50 以下',
  generated_body: '同上，压到 50 以下',
  naked: '补测试到 3% 以上',
  giant_commits: '连续 20 次小提交摊薄历史',
  sleeping: '推一次代码就醒',
  island: '关掉一批 issue，或引入贡献者',
  half_done: '解除归档',
}
