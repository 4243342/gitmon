// 剧情路线自检（不依赖浏览器 / 后端 / 模型）
// 覆盖：场景进入、选项生效、变量只由声明处写入、战斗分支、动态章节数、存档回滚、多结局、fallback、多剧本包。
import { createStoryRuntime, getPack, endingTitles, PACKS } from '../src/story/runtime.js'

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)

// 用纯 fallback 推进完整一局；choiceIndex 决定每个选项点哪一项
async function playthrough({ chapterCount = 3, pick = () => 0, winBattles = true, loseBattles = 0, pack = 'default' } = {}) {
  const runtime = createStoryRuntime({ vars: { chapter_count: chapterCount }, pack })
  const visited = []
  const battles = []
  let endingId = ''
  let scene = await runtime.enter()

  for (let step = 0; step < 80; step += 1) {
    if (scene.sceneId) visited.push(scene.sceneId)

    if (scene.battle) {
      battles.push({ type: scene.battle, chapter: runtime.vars.chapter })
      // loseBattles 指定前几场故意输；没指定时 winBattles=false 表示只输第一场
      const loseCount = loseBattles > 0 ? loseBattles : (winBattles ? 0 : 1)
      const win = battles.length > loseCount
      scene = await runtime.resumeFromBattle(win)
      continue
    }

    if (scene.ended) {
      endingId = scene.endingId
      break
    }

    if (!scene.choices.length) throw new Error(`场景 ${scene.sceneId} 既无选项也未结束`)

    const index = Math.min(pick(scene, runtime), scene.choices.length - 1)
    runtime.choose(index)
    scene = await runtime.enter()
  }

  return { runtime, scene, visited, battles, endingId }
}

console.log('\n[story] 场景图与台词兜底')
{
  const runtime = createStoryRuntime({ vars: { chapter_count: 3 } })
  const scene = await runtime.enter()
  eq('首屏是 prologue', scene.sceneId, 'prologue')
  check('首屏有背景与登场角色', Boolean(scene.bg) && scene.cast.length >= 1)
  eq('首屏两句台词', scene.lines.length, 2)
  check('台词都有说话人', scene.lines.every((line) => line.who && line.text))
  eq('首屏两个选项', scene.choices.length, 2)
  check('无模型时走 fallback', scene.textSource === 'fallback')
}

console.log('\n[story] 选项 / 变量')
{
  const runtime = createStoryRuntime({ vars: { chapter_count: 3 } })
  let scene = await runtime.enter()
  const trust0 = runtime.vars.trust
  runtime.choose(0) // 接下战书：trust += 1
  scene = await runtime.enter()
  eq('选「接下战书」只加 1 点信任', runtime.vars.trust, trust0 + 1)
  eq('进入成长章', scene.sceneId, 'growth_gate')
  const before = { ...runtime.vars }
  runtime.choose(1) // 先摸清底细：trust += 2
  const after = await runtime.enter()
  eq('未声明的变量保持不变', { deaths: after.vars.deaths, route: after.vars.route, chapter: after.vars.chapter },
    { deaths: before.deaths, route: before.route, chapter: before.chapter })
}

console.log('\n[story] 动态章节数')
for (const count of [3, 4, 5, 6]) {
  const run = await playthrough({ chapterCount: count })
  const growth = run.battles.filter((b) => b.type === 'minion').length
  eq(`chapter_count=${count} → 成长战 ${count - 1} 场`, growth, count - 1)
  eq(`chapter_count=${count} → 终章 Boss 只有 1 个`, run.battles.filter((b) => b.type === 'boss').length, 1)
  eq(`chapter_count=${count} → 最后一场是 Boss`, run.battles[run.battles.length - 1]?.type, 'boss')
}

console.log('\n[story] 存档 / 回滚')
{
  const runtime = createStoryRuntime({ vars: { chapter_count: 3 } })
  const first = await runtime.enter()
  const saved = first.stateIn
  const trustBefore = runtime.vars.trust
  runtime.choose(1)
  await runtime.enter()
  check('推进后信任变化', runtime.vars.trust !== trustBefore)
  runtime.restore(saved)
  const scene = await runtime.enter()
  eq('读档回到同一个 choice', scene.sceneId, 'prologue')
  eq('读档恢复 trust', runtime.vars.trust, trustBefore)
}

console.log('\n[story] 多结局')
{
  const trusting = await playthrough({ pick: () => 0 })
  const rude = await playthrough({ pick: (scene) => (scene.sceneId === 'growth_gate' ? 2 : 0) })
  check('高信任线可到结局', Boolean(trusting.endingId), trusting.endingId)
  check('不同选择可能落到不同结局', trusting.endingId !== rude.endingId, `${trusting.endingId} vs ${rude.endingId}`)
  check('结局都是已定义的四选一', ['ending_trust', 'ending_scarred', 'ending_alone', 'ending_standard'].includes(trusting.endingId))
}

console.log('\n[story] 战斗失败不阻断')
{
  const run = await playthrough({ chapterCount: 3, winBattles: false })
  check('首战失败后仍能通关', Boolean(run.endingId), run.endingId)
  check('失败计入 deaths', run.runtime.vars.deaths >= 1, String(run.runtime.vars.deaths))
}

console.log('\n[story] 模型台词回注')
{
  const runtime = createStoryRuntime({ vars: { chapter_count: 3 } })
  const scene = await runtime.enter({
    fetchTexts: async ({ keys }) => ({ texts: Object.fromEntries(keys.map((key) => [key, `模型写的：${key}`])), source: 'llm' }),
  })
  check('预取台词替换 fallback', scene.lines.every((line) => line.text.startsWith('模型写的：')), JSON.stringify(scene.lines))
  eq('标记为 llm 来源', scene.textSource, 'llm')
}

// ------------------------------------------------------------------ 剧本包
// 一个包 = 一条完整路线 + 一套角色 + 一套台词兜底 + 一份世界观。
// 这一段盯的是「换包等于没换」：选了斗码苍穹就不能跑成通用路线。

console.log('\n[story] 剧本包装载')
{
  const ids = Object.keys(PACKS)
  check('至少有两个包', ids.length >= 2, ids.join(', '))
  check('default 是兜底包', PACKS.default?.id === 'default')
  check('斗码苍穹已装载', PACKS.douma?.id === 'douma')

  // 未知包 id 不能让正片挂掉
  const fallbackRuntime = createStoryRuntime({ pack: 'no-such-pack' })
  eq('未知包退回 default', fallbackRuntime.packId, 'default')

  const douma = createStoryRuntime({ vars: { chapter_count: 3 }, pack: 'douma' })
  eq('斗码苍穹装的是它自己', douma.packId, 'douma')
  const scene = await douma.enter()
  eq('斗码苍穹首屏也是序章', scene.sceneId, 'prologue')
  check('角色表来自包内', Boolean(scene.characters?.scout), Object.keys(scene.characters || {}).join(','))
  check('背景牌来自包内', Boolean(scene.bgLabels?.alley), Object.keys(scene.bgLabels || {}).join(','))
  check('结局标题来自包内', Boolean(scene.endingTitles?.ending_flame), Object.keys(scene.endingTitles || {}).join(','))
  // 台词兜底也必须是包内的，不能串到通用包
  check('台词兜底来自包内', douma.lines['narrator.hook'] !== undefined && douma.lines['scout.hook'] !== undefined)
}

console.log('\n[story] 两个包的路线互不串')
{
  const doumaRun = await playthrough({ pack: 'douma', pick: () => 0 })
  const defaultRun = await playthrough({ pack: 'default', pick: () => 0 })
  check('斗码苍穹走自己的结局 id', doumaRun.endingId.startsWith('ending_'), doumaRun.endingId)
  check('斗码苍穹的结局不是通用包那几个',
    !['ending_trust', 'ending_scarred', 'ending_alone', 'ending_standard'].includes(doumaRun.endingId),
    doumaRun.endingId)
  check('通用包结局仍是原来那四个',
    ['ending_trust', 'ending_scarred', 'ending_alone', 'ending_standard'].includes(defaultRun.endingId),
    defaultRun.endingId)
  // 场景序列也该不同：斗码苍穹有「魂殿追杀」这一屏
  check('斗码苍穹有魂殿场景', doumaRun.visited.includes('soul_gate'), doumaRun.visited.join(','))
  check('通用包没有魂殿场景', !defaultRun.visited.includes('soul_gate'))
}

console.log('\n[story] 结局标题表按包隔离')
{
  eq('斗码苍穹的焚决线标题', endingTitles('douma')['ending_flame'], '焚决线 · 一把火烧穿山门')
  eq('通用包的内应线标题', endingTitles('default')['ending_trust'], '内应线 · 有人替你开门')
  check('两个包的结局表不是同一套',
    Object.keys(endingTitles('douma')).join() !== Object.keys(endingTitles('default')).join())
}

console.log('\n[story] 斗码苍穹的分支与四结局')
{
  // 全程选「攒信任」的选项：序章先问凭什么 +2 / 坊市先摸清底细 +2 / 魂殿今晚开源 +2
  const greedy = (scene) => (scene.sceneId === 'soul_gate' ? 0 : 1)
  const flame = await playthrough({ pack: 'douma', pick: greedy })
  eq('高信任线把信任攒到 7 以上', flame.runtime.vars.trust >= 7, true)
  eq('终章分流到内应', flame.runtime.vars.route, 'insider')
  eq('一路无败落到焚决结局', flame.endingId, 'ending_flame')

  // 一直选最怂的选项：信任被扣光，走独行线
  const lone = await playthrough({
    pack: 'douma',
    pick: (scene) => (scene.sceneId === 'growth_gate' ? 2 : 0),
  })
  eq('低信任线落到独行结局', lone.endingId, 'ending_lone')
  eq('终章分流到独行', lone.runtime.vars.route, 'solo')

  // 四个结局 id 都得在包里的结局表里
  const titles = endingTitles('douma')
  check('焚决线有标题', Boolean(titles.ending_flame))
  check('陨落线有标题', Boolean(titles.ending_withered))
  check('独行线有标题', Boolean(titles.ending_lone))
  check('正线有标题', Boolean(titles.ending_steady))
}

console.log('\n[story] 斗码苍穹的四个结局都可达')
{
  // 逐个结局找一条路：结局不能是「写了但永远走不到」
  const found = new Set()
  const strategies = [
    { pick: (s) => (s.sceneId === 'soul_gate' ? 0 : 1), winBattles: true },   // 焚决
    { pick: (s) => (s.sceneId === 'growth_gate' ? 2 : 0), winBattles: true },   // 独行
    { pick: () => 0, winBattles: true },                                        // 正线
    { pick: () => 0, loseBattles: 2 },                                          // 陨落（连输两场）
  ]
  for (const s of strategies) {
    const run = await playthrough({ pack: 'douma', ...s })
    found.add(run.endingId)
  }
  for (const id of ['ending_flame', 'ending_lone', 'ending_steady', 'ending_withered']) {
    check(`${id} 有路可走`, found.has(id), [...found].join(','))
  }
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`)
process.exit(failures ? 1 : 0)
