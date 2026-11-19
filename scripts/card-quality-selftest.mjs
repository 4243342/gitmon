import assert from 'node:assert/strict'
import { QUALITY_KEYS, QUALITY_RANK, QUALITIES, normalizeQualityKey, qualityForScore, highestQualityKey } from '../src/cardQuality.js'
import { cardFoil, cloudCardTraits } from '../src/cardTraits.js'
import { judge, normalizePet, rollIVs, scoreQuality } from '../src/engine.js'
import { buildPetFromEvaluation } from '../src/llmEval.js'
import { loadCollection, saveCollection, sortPets } from '../src/storage.js'
import { startupSync } from '../src/sync.js'
import { toCombatant } from '../src/battle.js'
import { toArenaPet } from '../src/arenaRoster.js'

let checks = 0
const test = async (name, run) => {
  await run()
  checks++
  console.log(`PASS ${name}`)
}

const snapshot = {
  platform: 'github', owner: 'fixture', repo: 'quality', fullName: 'fixture/quality',
  description: 'A maintained fixture with tests, typed source and complete documentation.',
  languages: [{ name: 'TypeScript', pct: 100 }], topics: [],
  rootFiles: ['src', 'test', 'package.json', 'README.md'],
  hasTests: true, hasCI: true, hasLockfile: true, hasTypeConfig: true, hasDocker: true,
  hasLicense: true, license: 'MIT', hasDocs: true, hasChangelog: true, hasContributing: true,
  homepage: 'https://example.test', releaseCount: 10, daysSincePush: 0, openIssues: 0,
  archived: false, stars: 20000, forks: 5000, contributors: 300,
  sizeKb: 200000, commits: 20000, ageMonths: 120,
}
const cloudCard = (key, status = 'confirmed') => ({
  repoId: '123', fullName: 'fixture/cloud', repo: 'cloud', level: 10,
  quality: { key: 'SSR', name: '传说' }, qualityKey: 'SSR',
  rarity: { key, status, name: status === 'unrated' ? '未公开评级' : '旧名称', color: '#123456' },
  element: { key: 'purpose_tool', name: '工具', color: '#abcdef' },
  qualityRating: { key: 'king', name: '王者', color: '#f3a769', status: 'confirmed', sourceMin: 90, sourceMax: 95, scoreMin: 180, scoreMax: 190 },
})

await test('恰好六档，中文名与模型主题按指定顺序对应', () => {
  assert.deepEqual(QUALITY_KEYS, ['N', 'R', 'SR', 'UR', 'SE', 'PSE'])
  assert.deepEqual(Object.keys(QUALITIES), QUALITY_KEYS)
  assert.deepEqual(QUALITY_KEYS.map((key) => QUALITIES[key].name), ['普卡', '稀有', '面闪', '金闪', '银碎', '镜碎'])
  assert.deepEqual(QUALITY_KEYS.map((key) => QUALITIES[key].model), ['MiMo', 'DeepSeek', 'Grok', 'Gemini', 'GPT', 'Claude Code'])
  assert.deepEqual(QUALITY_KEYS.map((key) => QUALITY_RANK[key]), [1, 2, 3, 4, 5, 6])
  assert.equal(QUALITIES.SSR, undefined)
  assert.equal(normalizeQualityKey(' ssr '), 'UR')
  assert.equal(normalizeQualityKey('pse'), 'PSE')
  assert.equal(normalizeQualityKey('unknown'), 'N')
})

await test('评分边界保持 0/40/60/80，并在 90/97 区分银碎和镜碎', () => {
  for (const [score, expected] of [
    [-1, 'N'], [0, 'N'], [39.99, 'N'], [40, 'R'], [59.99, 'R'],
    [60, 'SR'], [79.99, 'SR'], [80, 'UR'], [89.99, 'UR'],
    [90, 'SE'], [96.99, 'SE'], [97, 'PSE'], [100, 'PSE'], [101, 'PSE'],
  ]) assert.equal(qualityForScore(score).key, expected)
  assert.equal(qualityForScore(undefined).key, 'N')
  assert.equal(qualityForScore(NaN).key, 'N')
  const assessed = scoreQuality(snapshot)
  assert.equal(assessed.version, 'gpi-heuristic-v1')
  assert.equal(assessed.dims.length, 5, '经典卡面仍只展示五项摘要')
  assert.equal(assessed.gpiDimensions.length, 7)
  assert.equal(judge(snapshot).qualityKey, qualityForScore(assessed.score).key)
  assert.ok(assessed.score < 97, '仅凭元数据和文件存在不能得到 PSE')
})

await test('UR/SE/PSE 即使共用旧特效，也必须选出真正最高的包品质', () => {
  const foils = ['UR', 'PSE', 'SE'].map((key) => cardFoil(cloudCard(key)))
  assert.deepEqual(foils.map((foil) => foil.effect), ['SSR', 'SSR', 'SSR'])
  assert.deepEqual(foils.map((foil) => foil.key), ['UR', 'PSE', 'SE'])
  assert.equal(highestQualityKey(foils.map((foil) => foil.key)), 'PSE')
  assert.equal(highestQualityKey(['UR', 'SE']), 'SE')
  assert.equal(highestQualityKey(['N', 'SSR', 'SR']), 'UR')
  assert.equal(highestQualityKey([]), 'N')
})

await test('云卡以确认的六档 rarity 为准，未知/私有不借旧 quality 冒充评级', () => {
  for (const key of QUALITY_KEYS) {
    const foil = cardFoil(cloudCard(key))
    assert.equal(foil.key, key)
    assert.equal(foil.name, QUALITIES[key].name)
    assert.equal(foil.color, QUALITIES[key].color)
  }
  for (const [key, status] of [['pending', 'pending'], ['unrated', 'unrated'], ['PSE', 'pending'], ['invalid', 'confirmed']]) {
    const foil = cardFoil(cloudCard(key, status))
    assert.equal(foil.key, 'pending')
    assert.equal(foil.effect, 'N')
  }
  assert.equal(cardFoil({ repoId: '123', quality: QUALITIES.PSE }).key, 'pending')
  assert.equal(cardFoil(cloudCard('unrated', 'unrated')).name, '未公开评级')
})

await test('云端八档仍留作内部选图依据，对外主展示是六档与数值源码评分', () => {
  const card = cloudCard('PSE')
  const original = structuredClone(card)
  const traits = cloudCardTraits(card)
  assert.equal(traits.find((trait) => trait.key === 'rarity').label, '品质')
  assert.equal(traits.find((trait) => trait.key === 'rarity').value, 'PSE 镜碎')
  assert.equal(traits.find((trait) => trait.key === 'rating').label, '源码评分')
  assert.equal(traits.find((trait) => trait.key === 'rating').value, '90–95/100')
  assert.ok(!JSON.stringify(traits).includes('王者'))
  assert.deepEqual(card, original, '展示转换不能重写内部八档评级')
  card.qualityRating = { status: 'not_applicable' }
  assert.equal(cloudCardTraits(card).find((trait) => trait.key === 'rating').value, '不适用')
})

await test('历史 SSR 读档映射 UR，保留既有种子、个体值、数值和评测来源', () => {
  const current = judge(snapshot)
  const legacy = { ...current, quality: { key: 'SSR', name: '传说' }, qualityKey: 'SSR', qualityScore: 99,
    aiModel: 'actual-model', aiBinding: { model: 'actual-model', provider: 'test' }, createdAt: 123, syncedAt: 456 }
  const migrated = normalizePet(legacy)
  assert.equal(migrated.qualityKey, 'UR')
  assert.equal(migrated.quality.key, 'UR')
  assert.equal(migrated.quality.name, '金闪')
  for (const key of ['seed', 'spriteSeed', 'ivs', 'stats', 'level', 'combatPower', 'maxHp', 'qualityScore', 'aiModel', 'aiBinding', 'createdAt', 'syncedAt']) {
    assert.deepEqual(migrated[key], legacy[key], key)
  }
  assert.deepEqual(normalizePet(migrated), migrated)
  assert.equal(normalizePet({ qualityKey: 'SSR', stats: [] }).qualityKey, 'UR')
  assert.equal(normalizePet({ quality: 'SSR' }).qualityKey, 'UR')
  assert.equal(normalizePet({}).qualityKey, 'N')
  assert.equal(normalizePet(cloudCard('PSE')).qualityKey, 'PSE')
  assert.equal(normalizePet(cloudCard('unrated', 'unrated')).qualityKey, 'pending')
  assert.equal(normalizePet(null), null)
  for (const key of ['UR', 'SE', 'PSE']) assert.deepEqual(rollIVs(9876, key), rollIVs(9876, 'SSR'))
})

await test('AI 自报的高品质不能跳过 GPI 证据判定', () => {
  const evaluation = { element: 'water', species: 'element', level: 50, stats: [70, 70, 70, 70, 70, 70], traits: [], skills: [] }
  for (const quality of ['UR', 'SE', 'PSE', 'SSR', 'unknown']) {
    const pet = buildPetFromEvaluation({ ...evaluation, quality, qualityScore: 99 }, { input: 'fixture/quality' })
    assert.equal(pet.qualityKey, 'R')
    assert.equal(pet.qualityScore, 50)
    assert.equal(pet.qualityConfidence, 0)
    assert.equal(pet.qualityStatus, 'provisional')
    assert.equal(pet.gpiDimensions.length, 7)
    assert.equal(pet.qualityDims.length, 5)
  }
})

await test('七三比例和本地证据缺口不会因 Star 暴增变成 PSE', () => {
  const dims = scoreQuality(snapshot).gpiDimensions
  assert.equal(dims.slice(0, 4).reduce((sum, d) => sum + d.weight, 0), 70)
  assert.equal(dims.slice(4).reduce((sum, d) => sum + d.weight, 0), 30)
  const high = scoreQuality({ ...snapshot, stars: 999999999, forks: 999999999 })
  assert.ok(high.score < 90)
})

const previousStorage = globalThis.localStorage
const memory = new Map()
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
}
try {
  await test('旧 collection:v2 原地兼容，六档排序不被等级或旧 SSR 覆盖', () => {
    memory.set('gitmon:collection:v2', JSON.stringify([{ fullName: 'fixture/old', quality: { key: 'SSR' }, level: 100 }]))
    const list = loadCollection()
    assert.equal(list[0].qualityKey, 'UR')
    saveCollection(list)
    assert.equal(JSON.parse(memory.get('gitmon:collection:v2'))[0].quality.key, 'UR')
    const cards = [
      { fullName: 'fixture/ur', quality: { key: 'SSR' }, level: 999 },
      { fullName: 'fixture/n', level: 999 },
      { ...cloudCard('PSE'), fullName: 'fixture/pse', level: 1 },
      { qualityKey: 'SE', fullName: 'fixture/se', level: 1 },
      { ...cloudCard('unrated', 'unrated'), fullName: 'fixture/pending', level: 999 },
    ]
    assert.deepEqual(sortPets(cards).map((pet) => cardFoil(pet).key), ['PSE', 'SE', 'UR', 'N', 'pending'])
  })

  await test('旧服务器回传 SSR 时，同步返回给 UI 的对象也立即变成 UR', async () => {
    memory.clear()
    memory.set('gitmon:device', 'test-quality-device')
    const oldFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [
      { platform: 'github', fullName: 'fixture/remote', quality: { key: 'SSR', name: '传说' }, qualityKey: 'SSR', level: 1 },
    ] }) })
    try {
      const merged = await startupSync()
      assert.equal(merged[0].quality.key, 'UR')
      assert.equal(merged[0].qualityKey, 'UR')
      assert.equal(loadCollection()[0].qualityKey, 'UR')
    } finally {
      globalThis.fetch = oldFetch
    }
  })
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = previousStorage
}

await test('战斗单位只转换品质展示，既有战斗属性和 HP 保持原值', () => {
  const legacy = { ...judge(snapshot), quality: { key: 'SSR' }, qualityKey: 'SSR' }
  const unit = toCombatant(legacy)
  assert.equal(unit.qualityKey, 'UR')
  assert.equal(unit.quality.name, '金闪')
  assert.equal(unit.maxHp, legacy.maxHp)
  assert.equal(unit.level, legacy.level)
  assert.equal(unit.combatPower, legacy.combatPower)
  const cloud = toCombatant({ ...legacy, ...cloudCard('PSE') })
  assert.equal(cloud.qualityKey, 'PSE')
})

await test('竞技场剥离完整云卡字段后仍保留确认品质，私有卡继续未评级', () => {
  const base = judge(snapshot)
  for (const key of QUALITY_KEYS) {
    const card = normalizePet({ ...base, ...cloudCard(key) })
    const arena = toArenaPet(card)
    assert.equal(arena.rarity, undefined, '覆盖真实竞技场投影边界')
    assert.equal(cardFoil(arena).key, key)
    assert.equal(toCombatant(arena).qualityKey, key)
    assert.deepEqual(arena.stats, card.stats.map(({ name, value }) => ({ name, value })))
  }
  const privateCard = normalizePet({ ...base, ...cloudCard('unrated', 'unrated') })
  const arena = toArenaPet(privateCard)
  assert.equal(cardFoil(arena).key, 'pending')
  assert.equal(cardFoil(arena).status, 'unrated')
  assert.equal(cardFoil(arena).name, '未公开评级')
  assert.equal(toCombatant(arena).qualityKey, 'pending')
  assert.equal(cardFoil({ repoId: '123', quality: QUALITIES.PSE }).key, 'pending', '没有确认状态的旧值仍不可回填评级')
})

console.log(`card quality: ${checks} checks passed`)
