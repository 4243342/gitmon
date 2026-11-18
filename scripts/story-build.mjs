// 剧情内容构建：src/story/packs/<id>/ → src/story/packs.js
//
// 这一步是「离线定稿」的入口：
//   1. 用 inkjs 编译器把每个剧本包的 story.ink 编译成运行时 JSON（语法 / 跳转错误在这一步暴露）
//   2. 用 ajv 校验每个包的 characters.json 与 lines.json 的结构
//   3. 校验每条 {say("key")} 都有 fallback 台词、说话人都在角色表里
//
// 产物 packs.js 汇总所有剧本包，运行时按 pack id 装载：
//   export const PACKS = { default: {...}, douma: {...} }
//
// 用法：npm run story:build（vite build 前会自动跑）
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Compiler } from 'inkjs/compiler/Compiler'
import Ajv from 'ajv'

const here = dirname(fileURLToPath(import.meta.url))
const storyDir = resolve(here, '../src/story')
const packsDir = resolve(storyDir, 'packs')

function fail(message) {
  console.error(`\n[story:build] ${message}\n`)
  process.exit(1)
}

// ① 收集剧本包：packs/ 下每个含 meta.json 的子目录就是一个包
if (!existsSync(packsDir)) fail(`找不到剧本包目录：${packsDir}`)

const packIds = readdirSync(packsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => existsSync(resolve(packsDir, id, 'meta.json')))
  .sort()

if (!packIds.length) fail('packs/ 下没有任何剧本包')
if (!packIds.includes('default')) fail('packs/ 下缺少 default 包（它是所有剧本包的兜底）')

const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'))
// schema 是所有剧本包共用的校验契约，放在 src/story/ 下，不随包走
const schema = readJSON(resolve(storyDir, 'schema.json'))

const ajv = new Ajv({ allErrors: true, strict: false })
const validateCharacters = ajv.compile(schema.definitions.characters)
const validateLines = ajv.compile(schema.definitions.lines)

const packs = {}

for (const id of packIds) {
  const dir = resolve(packsDir, id)
  const meta = readJSON(resolve(dir, 'meta.json'))
  const characters = readJSON(resolve(dir, 'characters.json'))
  const lines = readJSON(resolve(dir, 'lines.json'))
  const ink = readFileSync(resolve(dir, 'story.ink'), 'utf8')

  if (meta.id !== id) fail(`剧本包 ${id} 的 meta.id 是「${meta.id}」，必须和目录名一致`)

  // 编译 ink（语法错误、未定义 knot 的 -> 都会在这里失败）
  const compiler = new Compiler(ink)
  let compiled
  try {
    compiled = compiler.Compile()
  } catch {
    const errors = (compiler.errors || []).map((e) => `${e.message || e.toString()}${e.lineNumber ? `（第 ${e.lineNumber} 行）` : ''}`)
    fail(`剧本包 ${id} 的 ink 编译失败：\n  - ${errors.join('\n  - ') || '未知错误'}`)
  }
  if (compiler.errors?.length) {
    fail(`剧本包 ${id} 的 ink 编译告警/错误：\n  - ${compiler.errors.map((e) => e.message).join('\n  - ')}`)
  }

  // schema 校验
  if (!validateCharacters(characters)) {
    fail(`剧本包 ${id} 的 characters.json 不符合 schema：\n  - ${ajv.errorsText(validateCharacters.errors, { separator: '\n  - ' })}`)
  }
  if (!validateLines(lines)) {
    fail(`剧本包 ${id} 的 lines.json 不符合 schema：\n  - ${ajv.errorsText(validateLines.errors, { separator: '\n  - ' })}`)
  }

  // 台词 key 全覆盖：每个 say("key") 必须有 fallback，且说话人在角色表里
  const inkCode = ink.replace(/^\s*\/\/.*$/gm, '') // 注释里的示例不算台词
  const sayKeys = [...inkCode.matchAll(/say\("([^"]+)"\)/g)].map((m) => m[1])
  const missing = [...new Set(sayKeys)].filter((key) => !lines[key])
  if (missing.length) fail(`剧本包 ${id} 以下台词缺少 fallback（lines.json）：${missing.join(', ')}`)

  const unknownSpeakers = [...new Set(sayKeys)]
    .map((key) => key.split('.')[0])
    .filter((who) => !characters[who])
  if (unknownSpeakers.length) {
    fail(`剧本包 ${id} 的台词说话人不在 characters.json 里：${unknownSpeakers.join(', ')}`)
  }

  // 结局表非空、终点标签存在
  const endingIds = [...ink.matchAll(/ending_id = "([^"]+)"/g)].map((m) => m[1])
  if (!endingIds.length) fail(`剧本包 ${id} 没有找到任何 ending_id，结局表为空`)
  if (!/#\s*ending/.test(ink)) fail(`剧本包 ${id} 缺少 # ending 终点标签`)
  for (const endingId of endingIds) {
    if (!lines[`narrator.${endingId}`] && !lines['narrator.ending_a']) {
      fail(`剧本包 ${id} 的结局 ${endingId} 缺少 fallback 文案`)
    }
  }

  // meta 里的结局标题必须盖住 ink 里真正会走到的结局，否则结算界面会显示裸 id
  const metaEndings = meta.endings || {}
  const uncovered = endingIds.filter((endingId) => !metaEndings[endingId])
  if (uncovered.length) {
    fail(`剧本包 ${id} 的 meta.endings 缺少这些结局的标题：${uncovered.join(', ')}`)
  }

  // meta.variants 是这个包提供的系统剧本方案（界面上给玩家三选一的那几张卡）
  if (!Array.isArray(meta.variants) || !meta.variants.length) {
    fail(`剧本包 ${id} 的 meta.variants 为空：系统剧本至少要有一个方案`)
  }

  // 角色立绘：声明了 art / face 就必须真有那张图，否则界面上会静默少一个人
  const artDir = resolve(dir, 'art')
  const missingArt = []
  const artHit = (file) => ['png', 'webp', 'jpg', 'jpeg']
    .map((ext) => resolve(artDir, file.replace(/\.(png|webp|jpg|jpeg)$/, `.${ext}`)))
    .find((p) => existsSync(p))
  for (const [who, ch] of Object.entries(characters)) {
    for (const slot of ['art', 'face']) {
      const file = ch[slot]
      if (!file) continue
      if (!artHit(file)) missingArt.push(`${who}.${slot} → art/${file}`)
    }
    // 阶段形象：stages.<stage>.art / .face 同样必须真有那张图。
    // 阶段化角色（云岚宗前期、主角人形态早期）只在这里声明图，
    // 不声明的话界面会一路退回「色块 + 名字」。
    for (const [stage, files] of Object.entries(ch.stages || {})) {
      for (const slot of ['art', 'face']) {
        const file = files[slot]
        if (!file) continue
        if (!artHit(file)) missingArt.push(`${who}.${stage}.${slot} → art/${file}`)
      }
    }
  }
  if (missingArt.length) {
    fail(`剧本包 ${id} 的角色声明了立绘但文件不存在：\n  - ${missingArt.join('\n  - ')}`)
  }

  // 阶段标签：ink 里写了 # stage: xxx，角色表里就至少有一个角色声明了这个阶段。
  // 否则这一屏的角色会静默用错形象（玩家看不出哪里错，只是图不对）。
  const stageTags = [...new Set([...ink.matchAll(/^\s*#\s*stage:\s*(\S+)/gm)].map((m) => m[1]))]
  const declaredStages = new Set(
    Object.values(characters).flatMap((ch) => Object.keys(ch.stages || {})),
  )
  const unknownStages = stageTags.filter((s) => !declaredStages.has(s))
  if (unknownStages.length) {
    fail(`剧本包 ${id} 的 ink 用了角色表里没声明的阶段：\n  - ${unknownStages.join(', ')}（已声明：${[...declaredStages].join(', ') || '无'}）`)
  }

  // 解说屏音频：ink 里写了 # opening: xxx / # narration: xxx 就必须真有那个文件
  const audioDir = resolve(dir, 'audio')
  const audioTags = [
    ...[...ink.matchAll(/^\s*#\s*opening:\s*(\S+)/gm)].map((m) => m[1]),
    ...[...ink.matchAll(/^\s*#\s*narration:\s*(\S+)/gm)].map((m) => m[1]),
  ]
  const openingFiles = [...new Set(audioTags)]
  const missingAudio = []
  for (const file of openingFiles) {
    const hit = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']
      .map((ext) => resolve(audioDir, file.replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/, `.${ext}`)))
      .find((p) => existsSync(p))
    if (!hit) missingAudio.push(file)
  }
  if (missingAudio.length) {
    fail(`剧本包 ${id} 的解说屏声明了音频但文件不存在：\n  - ${missingAudio.join('\n  - ')}`)
  }

  // 过场：ink 里写了 # transform: xxx，meta.transforms 里就得有这一项，
  // 而且它引用的素材（fx/ 的特效、art/ 的立绘）必须真的在包里。
  // 少一样的表现是「过场屏一片黑」—— 不报错，但玩家只看到黑屏。
  const fxDir = resolve(dir, 'fx')
  const transforms = meta.transforms || {}
  const transformTags = [...new Set([...ink.matchAll(/^\s*#\s*transform:\s*(\S+)/gm)].map((m) => m[1]))]
  const unknownTransforms = transformTags.filter((t) => !transforms[t])
  if (unknownTransforms.length) {
    fail(`剧本包 ${id} 的 ink 用了 meta.transforms 里没声明的过场：\n  - ${unknownTransforms.join(', ')}（已声明：${Object.keys(transforms).join(', ') || '无'}）`)
  }
  const missingFx = []
  const missingHero = []
  for (const [key, spec] of Object.entries(transforms)) {
    if (spec.orb) {
      const hit = ['gif', 'png', 'webp', 'jpg', 'jpeg', 'svg']
        .map((ext) => resolve(fxDir, spec.orb.replace(/\.\w+$/, `.${ext}`)))
        .find((p) => existsSync(p))
      if (!hit) missingFx.push(`${key}.orb → fx/${spec.orb}`)
    }
    if (spec.hero) {
      const hit = ['png', 'webp', 'jpg', 'jpeg']
        .map((ext) => resolve(artDir, spec.hero.replace(/\.(png|webp|jpg|jpeg)$/, `.${ext}`)))
        .find((p) => existsSync(p))
      if (!hit) missingHero.push(`${key}.hero → art/${spec.hero}`)
    }
  }
  if (missingFx.length) {
    fail(`剧本包 ${id} 的过场声明了特效但文件不存在：\n  - ${missingFx.join('\n  - ')}`)
  }
  if (missingHero.length) {
    fail(`剧本包 ${id} 的过场声明了立绘但文件不存在：\n  - ${missingHero.join('\n  - ')}`)
  }

  packs[id] = {
    id,
    meta,
    characters,
    lines,
    story: JSON.parse(compiled.ToJson()),
  }
}

// ② 产物：所有剧本包汇总成一个模块
const banner = '// 由 scripts/story-build.mjs 自动生成，请勿手改。\n// 改结构请编辑 src/story/packs/<id>/story.ink，改台词兜底请编辑同目录的 lines.json。\n'
writeFileSync(
  resolve(storyDir, 'packs.js'),
  `${banner}export const PACKS = ${JSON.stringify(packs)}\nexport const DEFAULT_PACK = ${JSON.stringify('default')}\n`,
)

const summary = Object.entries(packs)
  .map(([id, pack]) => `${id}(${Object.keys(pack.lines).length} 台词 / ${Object.keys(pack.meta.endings || {}).length} 结局)`)
  .join(' · ')
console.log(`[story:build] ok · ${summary}`)
