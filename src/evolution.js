// 进化阶梯（文档 §6.1）：Lv.10 / 50 / 100 / 200 / 300 / 500 / 800 / 999 八个节点，共 9 个形态
// Lv.500 起进入人形态，500 以下是兽形/元素形等自由形态（具体长相由种族 × 属性决定，见 docs/ASSETS.md）
export const EVOLUTION = [
  { stage: 1, min: 1,   name: '幼体', form: 'beast', humanoid: false },
  { stage: 2, min: 10,  name: '初生体', form: 'beast', humanoid: false },
  { stage: 3, min: 50,  name: '成长体', form: 'beast', humanoid: false },
  { stage: 4, min: 100, name: '成熟体', form: 'beast', humanoid: false },
  { stage: 5, min: 200, name: '强化体', form: 'beast', humanoid: false },
  { stage: 6, min: 300, name: '完全体', form: 'beast', humanoid: false },
  { stage: 7, min: 500, name: '人形态', form: 'humanoid', humanoid: true },
  { stage: 8, min: 800, name: '人形态·觉醒', form: 'humanoid', humanoid: true },
  { stage: 9, min: 999, name: '人形态·神话', form: 'humanoid', humanoid: true },
]

export const MAX_STAGE = EVOLUTION.length

export function stageFromLevel(level) {
  const lv = Math.max(1, Math.min(999, Math.floor(Number(level) || 1)))
  let out = 1
  for (const row of EVOLUTION) if (lv >= row.min) out = row.stage
  return out
}

export function stageInfo(stage) {
  const s = Math.max(1, Math.min(MAX_STAGE, Math.floor(Number(stage) || 1)))
  return EVOLUTION[s - 1]
}

export function stageName(stage) {
  return stageInfo(stage).name
}

export function isHumanoid(stage) {
  return stageInfo(stage).humanoid
}

// 下一阶段（已到顶返回 null）
export function nextStage(stage) {
  const s = Math.max(1, Math.min(MAX_STAGE, Math.floor(Number(stage) || 1)))
  return EVOLUTION[s] || null
}

// 当前阶段内的进度：0–100，到顶恒为 100
export function stageProgress(level) {
  const lv = Math.max(1, Math.min(999, Math.floor(Number(level) || 1)))
  const cur = stageInfo(stageFromLevel(lv))
  const nxt = nextStage(cur.stage)
  if (!nxt) return 100
  const span = nxt.min - cur.min
  if (span <= 0) return 100
  return Math.max(0, Math.min(100, ((lv - cur.min) / span) * 100))
}
