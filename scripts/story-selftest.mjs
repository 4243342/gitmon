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
  // 首屏是开章解说（不是序章）：旁白独占屏幕中央 + 成品配音
  eq('斗码苍穹首屏是开章', scene.sceneId, 'opening')
  eq('开章声明了音频', scene.opening, 'opening.mp3')
  eq('开章背景是 void', scene.bg, 'void')
  check('开章只有旁白在说话', scene.cast.join(',') === 'narrator', scene.cast.join(','))
  check('开章台词是世界观开场白',
    /码气/.test(scene.lines[0]?.text || ''),
    scene.lines[0]?.text?.slice(0, 30) || '')
  // 走完开章先进过场（变身动画），过场之后才是序章
  douma.choose(0)
  const transformScene = await douma.enter()
  eq('开章之后进过场', transformScene.sceneId, 'awaken')
  eq('过场声明了过场键', transformScene.transform, 'awaken')
  check('过场有素材规格', Boolean(transformScene.transformSpec?.orb && transformScene.transformSpec?.hero),
    JSON.stringify(transformScene.transformSpec || {}))
  check('过场没有台词', transformScene.lines.length === 0, transformScene.lines.length)
  check('过场有推进选项', transformScene.choices.length > 0, String(transformScene.choices.length))
  douma.choose(0)
  const after = await douma.enter()
  eq('过场之后进序章', after.sceneId, 'prologue')
  check('序章没有音频声明', !after.opening, String(after.opening))
  check('序章没有过场声明', !after.transform, String(after.transform))
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
  eq('斗码苍穹的焚决线标题', endingTitles('douma')['ending_flame'], '焚决线 · 名碑换名，规矩由你定')
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

console.log('\n[story] 路线名随包走')
{
  // 「内应线 / 独行线」是通用包的词；斗码苍穹那条是「有人作证线 / 独自赴约线」。
  // 结局屏要按包显示，路线名就得跟角色表 / 结局标题一样随包走。
  const douma = createStoryRuntime({ vars: { chapter_count: 3 }, pack: 'douma' })
  const scene = await douma.enter()
  eq('斗码苍穹的路线名来自包内', scene.routeLabels?.insider, '有人作证线')
  eq('斗码苍穹的独行路线名', scene.routeLabels?.solo, '独自赴约线')

  const fallback = createStoryRuntime({ vars: { chapter_count: 3 } })
  const fallbackScene = await fallback.enter()
  check('通用包没有自定义路线名（前端回落通用文案）',
    !fallbackScene.routeLabels?.insider,
    JSON.stringify(fallbackScene.routeLabels || {}))
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

console.log('\n[story] 斗码苍穹的主线是「三年之约」')
{
  // 这条线换了骨架：序章立约 → 成长章公开复现 → 魂殿 → 立约 → Boss 战 → 结局
  const run = await playthrough({ pack: 'douma', pick: () => 1 })
  check('有立约场景', run.visited.includes('vow_scene'), run.visited.join(','))
  check('有魂殿场景', run.visited.includes('soul_gate'), run.visited.join(','))
  check('序章之后进成长章', run.visited.includes('growth_gate'), run.visited.join(','))
  // 三年之约的题眼：约期与名碑（不是「被逐出宗门」那套）
  const douma = PACKS.douma
  check('世界观里写的是三年之约', douma.meta.world.includes('三年之约'), douma.meta.world.slice(0, 40))
  check('世界观里有名碑', douma.meta.world.includes('名碑'), douma.meta.world.slice(0, 40))
  check('方案卡属三年之约',
    douma.meta.variants.every((v) => v.title.includes('约')),
    douma.meta.variants.map((v) => v.title).join(' | '))
  check('方案卡 beats 提到名碑或规矩',
    douma.meta.variants.some((v) => v.beats.some((b) => b.includes('碑') || b.includes('规矩'))),
    'beats 没提到')
}

console.log('\n[story] 斗码苍穹只留《三年之约》一案')
{
  // 主线只有一条，方案卡也就只有一张：另外两个角度（《焚决》《名碑》）已删
  const douma = PACKS.douma
  eq('斗码苍穹只有一张方案卡', douma.meta.variants.length, 1)
  eq('留下的是《三年之约》', douma.meta.variants[0].title, '《三年之约：{boss}》')
  check('删掉的《焚决》没有残留',
    !douma.meta.variants.some((v) => v.title.includes('焚决')),
    douma.meta.variants.map((v) => v.title).join(' | '))
  check('删掉的《名碑》没有残留',
    !douma.meta.variants.some((v) => v.title.includes('名碑')),
    douma.meta.variants.map((v) => v.title).join(' | '))
  // 通用包换成「仓可梦」占位：先只放一张占位卡，主线待定稿（AI / 自定义剧本仍走它兜底）
  eq('通用包只留一张占位方案', PACKS.default.meta.variants.length, 1)
  check('占位方案已标明占位',
    PACKS.default.meta.variants[0].title.includes('占位'),
    PACKS.default.meta.variants[0].title)
}

console.log('\n[story] 斗码苍穹的角色立绘声明')
{
  // 立绘加载走 import.meta.glob（Vite 独有），Node 下测不了 glob 本身；
  // 但真正的风险是「声明了却没有文件」—— 那会让界面静默少一个人。
  // 所以这里断言声明和 art/ 目录里的文件严格对得上。
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const packsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/story/packs')

  const douma = PACKS.douma
  const artDir = path.join(packsDir, 'douma', 'art')
  // 声明有两个来源：角色的顶层 art/face，以及 stages 里各阶段的 art/face。
  // 阶段化角色（云岚宗前期、主角人形态早期）只有 stages，没有顶层字段。
  const declared = []
  for (const [who, ch] of Object.entries(douma.characters)) {
    for (const slot of ['art', 'face']) {
      if (ch[slot]) declared.push({ who, slot, file: ch[slot] })
    }
    for (const [stage, files] of Object.entries(ch.stages || {})) {
      for (const slot of ['art', 'face']) {
        if (files[slot]) declared.push({ who: `${who}.${stage}`, slot, file: files[slot] })
      }
    }
  }
  check('有角色声明了立绘', declared.length > 0, `${declared.length} 条`)

  const missing = declared.filter((d) => !fs.existsSync(path.join(artDir, d.file)))
  eq('声明的立绘文件都存在', missing.map((d) => `${d.who}.${d.slot}`).join(','), '')

  // 反向：art/ 里的每个文件都该被某个角色用上，否则是放错了名字的孤儿
  const onDisk = fs.existsSync(artDir) ? fs.readdirSync(artDir).filter((f) => /\.(png|webp|jpg|jpeg)$/.test(f)) : []
  const used = new Set(declared.map((d) => d.file))
  const orphans = onDisk.filter((f) => !used.has(f))
  eq('art/ 下没有没人用的孤儿文件', orphans.join(','), '')

  // 云岚宗与主角都是阶段化角色：顶层不声明图，只在 stages 里给
  check('云岚宗是阶段化角色',
    !douma.characters.boss.art && Boolean(douma.characters.boss.stages?.early?.art),
    douma.characters.boss.stages?.early?.art || '')
  check('主角是阶段化角色',
    !douma.characters.pet.art && Boolean(douma.characters.pet.stages?.early?.art),
    douma.characters.pet.stages?.early?.art || '')
  // 阶段立绘必须带阶段后缀，否则 packStageArtUrl 找不到（它按 stages 里声明的文件名取）
  // 立绘是 <角色>_<阶段>.png，头像是 <角色>_<阶段>_face.png
  eq('阶段立绘都带阶段后缀',
    Object.values(douma.characters)
      .flatMap((c) => Object.values(c.stages || {}))
      .flatMap((f) => [f.art, f.face].filter(Boolean))
      .filter((f) => !/_(early|mid|late|final)(_face)?\.png$/.test(f))
      .join(','),
    '')
  // 仓可梦包（default）：口袋宝贝整包移植——精灵立绘随包走，
  // boss 不配静态立绘（用剧情里选中的那只）
  {
    const dflt = PACKS.default
    check('仓可梦包声明了精灵立绘',
      Boolean(dflt.characters.pet.art) && Boolean(dflt.characters.scout.art),
      `${dflt.characters.pet.art || '-'} / ${dflt.characters.scout.art || '-'}`)
    check('boss 不配静态立绘（用选中的）',
      !dflt.characters.boss.art && !dflt.characters.boss.face,
      dflt.characters.boss.art || '')
    const dfltDeclared = Object.entries(dflt.characters)
      .flatMap(([who, ch]) => ['art', 'face']
        .filter((slot) => ch[slot])
        .map((slot) => ({ who, slot, file: ch[slot] })))
    const dfltMissing = dfltDeclared
      .filter((d) => !fs.existsSync(path.join(packsDir, 'default', 'art', d.file)))
    eq('仓可梦声明的立绘文件都存在', dfltMissing.map((d) => `${d.who}.${d.slot}`).join(','), '')

    // 口袋宝贝图鉴随包移植：383 只的立绘都得真在 art/ 里
    const roster = JSON.parse(fs.readFileSync(path.join(packsDir, 'default', 'roster.json'), 'utf8'))
    const rosterMissing = roster
      .filter((r) => !r.art || !fs.existsSync(path.join(packsDir, 'default', 'art', r.art)))
      .map((r) => `${r.id}:${r.name}`)
    check('口袋宝贝图鉴随包移植', roster.length >= 300 && !rosterMissing.length,
      `${roster.length} 只${rosterMissing.length ? `，缺图 ${rosterMissing.slice(0, 5).join(',')}` : ''}`)
  }

  // 阶段标签：ink 里的 # stage: 必须在角色表里有对应声明，
  // 否则这一屏的角色会静默用错形象（看着没报错，图就是不对）
  const fs2 = await import('node:fs')
  const path2 = await import('node:path')
  const { fileURLToPath: fileURLToPath2 } = await import('node:url')
  const packsDir2 = path2.resolve(path2.dirname(fileURLToPath2(import.meta.url)), '../src/story/packs')
  const ink2 = fs2.readFileSync(path2.join(packsDir2, 'douma', 'story.ink'), 'utf8')
  const stageTags = [...new Set([...ink2.matchAll(/^\s*#\s*stage:\s*(\S+)/gm)].map((m) => m[1]))]
  check('ink 声明了阶段', stageTags.length > 0, stageTags.join(','))
  const declaredStages = new Set(
    Object.values(douma.characters).flatMap((c) => Object.keys(c.stages || {})),
  )
  eq('ink 的阶段都在角色表里声明过',
    stageTags.filter((s) => !declaredStages.has(s)),
    [])
  eq('角色表声明的阶段都被 ink 用到',
    [...declaredStages].filter((s) => !stageTags.includes(s)),
    [])
}

console.log('\n[story] 斗码苍穹的开章解说')
{
  // 开章是「片头解说」：旁白独占屏幕中央，配成品音频，逐字显现。
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const packsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/story/packs')

  const douma = PACKS.douma
  const ink = fs.readFileSync(path.join(packsDir, 'douma', 'story.ink'), 'utf8')

  // ink 里声明的 # opening 音频必须真有那个文件
  const declared = [...ink.matchAll(/^\s*#\s*opening:\s*(\S+)/gm)].map((m) => m[1])
  check('开章声明了音频', declared.length === 1, declared.join(','))
  const audioOk = declared.every((f) =>
    ['mp3', 'wav', 'ogg', 'm4a'].some((ext) =>
      fs.existsSync(path.join(packsDir, 'douma', 'audio', f.replace(/\.\w+$/, `.${ext}`)))))
  check('开章音频文件存在', audioOk, declared.join(','))

  // 开场白台词必须在兜底表里（模型不可用时也要能念）
  check('开场白有台词兜底', Boolean(douma.lines['narrator.opening']), '缺 narrator.opening')
  check('开场白讲的是码气',
    /码气/.test(douma.lines['narrator.opening'] || ''),
    (douma.lines['narrator.opening'] || '').slice(0, 30))
  // 通用包没有开章：界面不能因为这一屏不存在而挂
  check('通用包没有开章',
    !/^\s*#\s*opening:/m.test(fs.readFileSync(path.join(packsDir, 'default', 'story.ink'), 'utf8')),
    'default 不该有开章')
}

console.log('\n[story] 斗码苍穹的变身过场')
{
  // 过场：卡片形象 → 光团 → 变暗 → 醒来变成人形态。
  // 素材全部随包走：光团在 fx/，人形态立绘在 art/。
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const packsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/story/packs')

  const douma = PACKS.douma
  const transforms = douma.meta?.transforms || {}
  check('meta 声明了过场', Object.keys(transforms).length > 0, Object.keys(transforms).join(','))

  const awaken = transforms.awaken || {}
  // 光团特效必须在 fx/ 目录里
  check('过场声明了光团特效', Boolean(awaken.orb), String(awaken.orb))
  check('光团特效文件存在',
    fs.existsSync(path.join(packsDir, 'douma', 'fx', String(awaken.orb || '').replace(/\.\w+$/, '.gif'))),
    String(awaken.orb))
  // 人形态立绘必须在 art/ 目录里，且是主角的早期阶段形象
  check('过场声明了人形态立绘', Boolean(awaken.hero), String(awaken.hero))
  check('人形态立绘文件存在',
    fs.existsSync(path.join(packsDir, 'douma', 'art', String(awaken.hero || ''))),
    String(awaken.hero))
  eq('人形态立绘就是主角的早期阶段形象',
    awaken.hero,
    douma.characters?.pet?.stages?.early?.art)
  // 过场有字幕：过场屏没有台词，字幕是唯一的文字线索
  check('过场有字幕', Boolean(awaken.caption), String(awaken.caption))

  // ink 里声明的过场键必须在 meta.transforms 里有对应项
  const ink = fs.readFileSync(path.join(packsDir, 'douma', 'story.ink'), 'utf8')
  const tags = [...new Set([...ink.matchAll(/^\s*#\s*transform:\s*(\S+)/gm)].map((m) => m[1]))]
  check('ink 声明了过场', tags.length > 0, tags.join(','))
  eq('ink 的过场都在 meta 里声明过',
    tags.filter((t) => !transforms[t]),
    [])

  // 通用包没有过场：界面不能因为这一屏不存在而挂
  check('通用包没有过场',
    !/^\s*#\s*transform:/m.test(fs.readFileSync(path.join(packsDir, 'default', 'story.ink'), 'utf8')),
    'default 不该有过场')
}

console.log('\n[story] 系统剧本不接 AI 生成')
{
  // 系统剧本（source=system）的每一句都已在剧本包 lines.json 里定稿。
  // 前端在 isSystemScript() 时直接返回 { texts:{}, source:'script' }，
  // runtime 据此把 textSource 标成 script，界面显示「剧本定稿」而不是「台词兜底」。
  const douma = PACKS.douma

  // 前端 isSystemScript 分支的形状：一次模型都不调，直接交回包内定稿
  let modelCalls = 0
  const systemFetcher = async () => {
    modelCalls += 1
    return { texts: {}, source: 'script' }
  }
  const runtime = createStoryRuntime({ vars: { chapter_count: 3 }, pack: 'douma' })
  const scene = await runtime.enter({ fetchTexts: systemFetcher })
  eq('台词来源标为 script', scene.textSource, 'script')

  // 定稿文案必须原样来自包内 lines.json —— 没被任何模型改写
  const pkgLines = douma.lines
  check('每句台词都能在包内 lines.json 找到',
    scene.lines.every((l) => l.key && typeof pkgLines[l.key] === 'string' && pkgLines[l.key].trim()),
    scene.lines.map((l) => l.key).join(','))
  check('台词文本与包内定稿一致',
    scene.lines.every((l) => l.text === pkgLines[l.key]),
    scene.lines.map((l) => `${l.key}:${l.text}`).join(' | ').slice(0, 120))

  // 斗码苍穹的语汇必须在场：定稿里出现「码气 / 魂殿 / 宗门」这类词，
  // 而不是什么都没说的通用占位（模型改写一遍就会把语汇冲掉）
  const allText = scene.lines.map((l) => l.text).join('')
  check('定稿保留了斗码苍穹的语汇',
    /码气|魂殿|宗门|斗气|三年之约/.test(allText),
    allText.slice(0, 60))

  // AI 剧本照旧：fetchTexts 返回 llm 时标成 llm
  const runtime2 = createStoryRuntime({ vars: { chapter_count: 3 }, pack: 'douma' })
  const scene2 = await runtime2.enter({ fetchTexts: async () => ({ texts: {}, source: 'llm' }) })
  eq('模型台词标成 llm', scene2.textSource, 'llm')

  // fetchTexts 返回 null（模型不可用）：整屏退回包内定稿，不能空着
  const runtime3 = createStoryRuntime({ vars: { chapter_count: 3 }, pack: 'douma' })
  const scene3 = await runtime3.enter({ fetchTexts: async () => null })
  eq('模型不可用时退回 fallback', scene3.textSource, 'fallback')
  check('退回时仍有台词可念',
    scene3.lines.length > 0 && scene3.lines.every((l) => l.text && l.text !== '……'),
    scene3.lines.length ? '' : '没有台词')
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过'}\n`)
process.exit(failures ? 1 : 0)
