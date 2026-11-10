// 剧情路线自检（不依赖浏览器 / 后端 / 模型）
// 覆盖：场景进入、选项生效、变量只由声明处写入、战斗分支、动态章节数、存档回滚、多结局、fallback。
import { createStoryRuntime } from '../src/story/runtime.js'

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
async function playthrough({ chapterCount = 3, pick = () => 0, winBattles = true } = {}) {
  const runtime = createStoryRuntime({ vars: { chapter_count: chapterCount } })
  const visited = []
  const battles = []
  let endingId = ''
  let scene = await runtime.enter()

  for (let step = 0; step < 80; step += 1) {
    if (scene.sceneId) visited.push(scene.sceneId)

    if (scene.battle) {
      battles.push({ type: scene.battle, chapter: runtime.vars.chapter })
      // 输的时候只输第一场，后面照常赢，避免死循环
      const win = winBattles || battles.length > 1
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

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`)
process.exit(failures ? 1 : 0)
