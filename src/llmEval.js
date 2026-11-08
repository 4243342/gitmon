// 高级模式：模型评测结果 → 完整 pet
//
// 这里**不做任何评测**：品质、六维、根基、词条、技能、等级、属性、种族全部来自模型。
// 技能尤其完整：名称 / 属性 / 威力 / 解锁等级 / 描述 / 定制依据都由模型按项目制定，
// 本地不再套 [1,1,150,500] 这类固定门槛表。
// 本地只做三件机械的事：枚举查表（把 key 变成带颜色/名称的对象）、展示换算
// （grade / maxHp / 进化阶段 / 解锁态）、以及补上渲染必需的固定字段。

import { ELEMENTS, SPECIES, QUALITIES, expForLevel, hashSeed, stageFromLevel } from './engine.js'
import { STAT_NAMES, foundationTier, traitHints, traitSummary, xpMultiplier } from './traits.js'
import { parseRepoInput } from './scan.js'

const QUALITY_DIMS = [
  { key: 'tests', name: '测试完备度', weight: 25 },
  { key: 'engineering', name: '工程质量', weight: 20 },
  { key: 'docs', name: '文档完整度', weight: 20 },
  { key: 'health', name: '维护健康度', weight: 20 },
  { key: 'community', name: '社区认可', weight: 15 },
]

// 展示档位：由模型给的数值机械映射，不参与评分
const gradeOf = (v) => (v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : 'D')
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)))

export function buildPetFromEvaluation(ev, {
  input = '', platform = 'github', model = '', warnings = [], hint = '', binding = null,
} = {}) {
  if (!ev || typeof ev !== 'object') throw new Error('模型评测结果为空')

  const info = parseRepoInput(input)
  const realPlatform = info?.platform || (platform === 'gitee' ? 'gitee' : 'github')
  const owner = info?.owner || ev.owner || 'ai'
  const repoName = (info?.kind === 'repo' && info.repo) || ev.repo || String(input || 'unknown').trim().split(/\s+/)[0] || 'unknown'
  const fullName = info?.fullName || (ev.owner && ev.repo ? `${ev.owner}/${ev.repo}` : `${owner}/${repoName}`)

  const element = ELEMENTS[ev.element] || ELEMENTS.normal
  const elementSecondary = ev.elementSecondary ? ELEMENTS[ev.elementSecondary] || null : null
  const species = SPECIES[ev.species] || SPECIES.beast
  const quality = QUALITIES[ev.quality] || QUALITIES.N
  const level = Math.max(1, Math.min(999, Math.round(Number(ev.level) || 1)))
  const evolutionStage = stageFromLevel(level)

  const stats = STAT_NAMES.map((name, i) => {
    const value = clamp(ev.stats?.[i])
    return { name, value, grade: gradeOf(value) }
  })
  const traits = (ev.traits || []).map((t, i) => ({
    key: t.key || `ai_trait_${i}`,
    name: t.name || '未名词条',
    kind: t.kind === 'negative' ? 'negative' : 'positive',
    desc: t.desc || '',
    reason: t.reason || '模型评测',
    effect: {}, // 不套用规则词条修正：模型给的就是最终六维
  }))
  const skills = (ev.skills || [])
    .map((s) => (typeof s === 'string' ? { name: s } : s)) // 兼容只给名字的旧模型输出
    .filter((s) => s && String(s.name || '').trim())
    .map((s) => {
      const given = s.unlockLevel == null
        ? null
        : Math.max(1, Math.min(999, Math.round(Number(s.unlockLevel) || 1)))
      return {
        name: String(s.name).trim(),
        element: ELEMENTS[s.element] || element,
        power: s.power == null ? null : clamp(s.power),
        desc: String(s.desc || '').trim(),
        reason: String(s.reason || '').trim(),
        unlockLevel: given ?? 1,
        unlocked: given == null ? true : level >= given,
      }
    })

  const seed = hashSeed(`${realPlatform}/${fullName}`)
  const exp = expForLevel(level)
  const mult = xpMultiplier(traits)
  const hp = stats.find((s) => s.name === 'HP')?.value ?? 50

  return {
    // ---- 身份 ----
    platform: realPlatform,
    owner,
    repo: repoName,
    fullName,
    description: ev.summary || '',
    seed,
    spriteSeed: hashSeed(`${seed}:${element.key}:${species.key}`),
    stars: Math.max(0, Math.round(Number(ev.stars) || 0)),
    aiRate: clamp(ev.aiRate),
    source: 'llm',

    // ---- 模型给出的全部评测（原样搬运）----
    element,
    elementSecondary,
    species,
    quality,
    qualityKey: quality.key,
    qualityScore: clamp(ev.qualityScore),
    qualityDims: QUALITY_DIMS.map((d, i) => ({ ...d, value: clamp(ev.qualityDims?.[i]) })),
    engineeringScore: clamp(ev.engineeringScore),
    engineeringParts: [],
    level,
    evolutionStage,
    stats,
    skills,
    foundation: clamp(ev.foundation),
    foundationDims: [],
    traits,

    // ---- 展示换算（不评测）----
    foundationTier: foundationTier(clamp(ev.foundation)),
    traitSummary: traitSummary(traits),
    traitHints: traitHints(traits),
    xpMultiplier: mult,
    exp,
    expToNext: Math.round(exp * mult),
    maxHp: hp * 10,
    status: 'active',
    bond: 0,
    fedAt: 0,
    createdAt: Date.now(),
    syncedAt: Date.now(),

    // ---- AI 推测标记与依据 ----
    aiEvaluated: true,
    aiModel: model,
    aiProvider: binding?.provider || '',
    aiProviderLabel: binding?.label || '',
    aiBinding: binding ? {
      provider: binding.provider || '',
      label: binding.label || '',
      baseUrl: binding.baseUrl || '',
      model: binding.model || model,
      verified: binding.verified !== false,
      detectedBy: binding.detectedBy || '',
    } : null,
    aiWarnings: warnings || [],
    aiSummary: ev.summary || '',
    aiComment: ev.comment || '',
    aiEvidence: ev.evidence || '',
    aiHint: hint || '',
  }
}
