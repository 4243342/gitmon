// GPI seven-dimensional quality heuristic for local scans and AI-mode cards.
// Same 70/30 weights and six grade thresholds as backend gpi_quality.py.
// Missing measurements are neutral-prior (50), not fabricated evidence.
import { qualityForScore } from './cardQuality.js'

export const GPI_WEIGHTS = Object.freeze({
  evolution: 22, reliability: 18, architecture: 16, innovation: 14,
  demand: 15, ecosystem: 10, sustainability: 5,
})
export const GPI_NAMES = Object.freeze({
  evolution: '技术进化', reliability: '工程可靠', architecture: '架构成长', innovation: '技术创新',
  demand: '真实需求', ecosystem: '生态影响', sustainability: '商业持续',
})
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo))
const signal = (value, confidence) => ({ value: clamp(value), confidence: clamp(confidence, 0, 1) })
const evidence = (signals = []) => {
  if (!signals.length) return { value: 50, confidence: 0 }
  const value = signals.reduce((sum, s) => sum + 50 + s.confidence * (s.value - 50), 0) / signals.length
  const confidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
  return { value: Number(value.toFixed(2)), confidence: Number(confidence.toFixed(3)) }
}
const known = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0
const ratio = (num, den) => known(num) && known(den) && den > 0 ? clamp(100 * num / den) : 50
const boundedLog = (n, upper) => clamp(40 + upper * Math.log1p(Math.max(0, n || 0)))

export function gpiForSnapshot(snap = {}) {
  // A root file or CI configuration is only a weak static signal, not proof tests pass.
  const hasFiles = Array.isArray(snap.rootFiles) && snap.rootFiles.length > 0
  const hasMeta = typeof snap.stars === 'number' && typeof snap.forks === 'number' && !snap.private
  const merged = snap.prsMerged ?? snap.prs_merged
  const closed = snap.prsClosed ?? snap.prs_closed
  const active = Number.isFinite(snap.daysSincePush) && snap.daysSincePush < 30
  const dims = {
    evolution: evidence([
      signal(ratio(merged, closed), known(closed) && closed > 0 ? .55 : 0),
      // Commit count alone never establishes successful evolution.
    ]),
    reliability: evidence([
      signal(snap.hasTests ? 65 : 35, hasFiles ? .25 : 0),
      signal(snap.hasCI ? 65 : 35, hasFiles ? .3 : 0),
    ]),
    architecture: evidence([
      signal(snap.hasTypeConfig ? 65 : 45, hasFiles ? .25 : 0),
      signal(snap.hasLockfile ? 60 : 45, hasFiles ? .15 : 0),
    ]),
    innovation: evidence([]), // requires verified novelty, not activity alone
    demand: evidence([signal(boundedLog(snap.stars, 6), hasMeta ? .25 : 0)]),
    ecosystem: evidence([
      signal(boundedLog(snap.contributors, 7), known(snap.contributors) ? .3 : 0),
      signal(boundedLog(snap.forks, 5), hasMeta ? .2 : 0),
    ]),
    sustainability: evidence([
      signal(active ? 70 : (snap.daysSincePush < 180 ? 50 : 25), Number.isFinite(snap.daysSincePush) ? .4 : 0),
      signal(snap.releaseCount > 0 ? 65 : 45, known(snap.releaseCount) ? .2 : 0),
      signal(snap.hasDocs ? 65 : 35, hasFiles ? .2 : 0),
    ]),
  }
  return buildGpi(dims, 'local-static')
}

export function gpiForAiEvidence(ev = {}) {
  // LLM self-assigned quality or legacy qualityDims are NOT independent evidence.
  // Only separately verified GPI evidence is accepted for a non-neutral grade.
  const verified = ev.gpiEvidenceVerified === true
  const source = verified && ev.gpiDimensions && typeof ev.gpiDimensions === 'object' ? ev.gpiDimensions : {}
  const dims = Object.fromEntries(Object.keys(GPI_WEIGHTS).map((key) => [
    key, evidence([signal(source[key], verified && known(source[key]) ? .8 : 0)]),
  ]))
  return buildGpi(dims, verified ? 'ai-evidence-verified' : 'ai-evidence-unverified')
}

function buildGpi(dims, source) {
  const score = Number((Object.entries(GPI_WEIGHTS).reduce((sum, [key, weight]) => sum + weight * dims[key].value, 0) / 100).toFixed(2))
  const confidence = Number((Object.entries(GPI_WEIGHTS).reduce((sum, [key, weight]) => sum + weight * dims[key].confidence, 0) / 100).toFixed(3))
  const values = Object.entries(GPI_WEIGHTS).map(([key, weight]) => ({
    key, name: GPI_NAMES[key], weight, value: dims[key].value, confidence: dims[key].confidence,
  }))
  return {
    version: 'gpi-heuristic-v1', score, confidence, source,
    // In legacy local/AI card types there is no 'pending' quality rendering support:
    // neutral prior grades R with explicit low-confidence metadata.
    status: confidence >= .25 ? 'confirmed' : 'provisional',
    quality: qualityForScore(score),
    dims: values,
  }
}

/** Classic five-slot card summary; the full seven dimensions remain in gpiDimensions. */
export function cardGpiDims(result) {
  const map = Object.fromEntries(result.dims.map((d) => [d.key, d.value]))
  const business = (15 * map.demand + 10 * map.ecosystem + 5 * map.sustainability) / 30
  return [
    ...['evolution', 'reliability', 'architecture', 'innovation'].map((key) => ({
      key, name: GPI_NAMES[key], value: map[key],
    })),
    { key: 'business', name: '商业综合', value: Number(business.toFixed(2)) },
  ]
}
