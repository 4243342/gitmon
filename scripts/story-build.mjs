// 剧情内容构建：story.ink → story.json / story-data.js
//
// 这一步是「离线定稿」的入口：
//   1. 用 inkjs 编译器把 ink 剧本编译成运行时 JSON（语法 / 跳转错误在这一步暴露）
//   2. 用 ajv 校验 characters.json 与 lines.json 的结构
//   3. 校验每条 {say("key")} 都有 fallback 台词、说话人都在角色表里
//
// 用法：npm run story:build（vite build 前会自动跑）
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Compiler } from 'inkjs/compiler/Compiler'
import Ajv from 'ajv'

const here = dirname(fileURLToPath(import.meta.url))
const storyDir = resolve(here, '../src/story')

const readJSON = (name) => JSON.parse(readFileSync(resolve(storyDir, name), 'utf8'))
const ink = readFileSync(resolve(storyDir, 'story.ink'), 'utf8')
const characters = readJSON('characters.json')
const lines = readJSON('lines.json')
const schema = readJSON('schema.json')

function fail(message) {
  console.error(`\n[story:build] ${message}\n`)
  process.exit(1)
}

// ① 编译 ink（语法错误、未定义 knot 的 -> 都会在这里失败）
const compiler = new Compiler(ink)
let compiled
try {
  compiled = compiler.Compile()
} catch {
  const errors = (compiler.errors || []).map((e) => `${e.message || e.toString()}${e.lineNumber ? `（第 ${e.lineNumber} 行）` : ''}`)
  fail(`ink 编译失败：\n  - ${errors.join('\n  - ') || '未知错误'}`)
}
if (compiler.errors?.length) {
  fail(`ink 编译告警/错误：\n  - ${compiler.errors.map((e) => e.message).join('\n  - ')}`)
}

// ② schema 校验
const ajv = new Ajv({ allErrors: true, strict: false })
for (const [name, data] of [['characters', characters], ['lines', lines]]) {
  const validate = ajv.compile(schema.definitions[name])
  if (!validate(data)) {
    fail(`${name}.json 不符合 schema：\n  - ${ajv.errorsText(validate.errors, { separator: '\n  - ' })}`)
  }
}

// ③ 台词 key 全覆盖：每个 say("key") 必须有 fallback，且说话人在角色表里
const inkCode = ink.replace(/^\s*\/\/.*$/gm, '') // 注释里的示例不算台词
const sayKeys = [...inkCode.matchAll(/say\("([^"]+)"\)/g)].map((m) => m[1])
const missing = [...new Set(sayKeys)].filter((key) => !lines[key])
if (missing.length) fail(`以下台词缺少 fallback（lines.json）：${missing.join(', ')}`)

const unknownSpeakers = [...new Set(sayKeys)]
  .map((key) => key.split('.')[0])
  .filter((who) => !characters[who])
if (unknownSpeakers.length) fail(`台词说话人不在 characters.json 里：${unknownSpeakers.join(', ')}`)

// ④ 结局表非空、终点标签存在
const endingIds = [...ink.matchAll(/ending_id = "([^"]+)"/g)].map((m) => m[1])
if (!endingIds.length) fail('没有找到任何 ending_id，结局表为空')
if (!/#\s*ending/.test(ink)) fail('缺少 # ending 终点标签')
for (const id of endingIds) {
  if (!lines[`narrator.${id}`] && !lines[`narrator.ending_a`]) {
    fail(`结局 ${id} 缺少 fallback 文案`)
  }
}

// ⑤ 产物
const json = compiled.ToJson()
writeFileSync(resolve(storyDir, 'story.json'), `${JSON.stringify(JSON.parse(json))}\n`)

const banner = '// 由 scripts/story-build.mjs 自动生成，请勿手改。\n// 改结构请编辑 story.ink，改台词兜底请编辑 lines.json。\n'
writeFileSync(
  resolve(storyDir, 'story-data.js'),
  `${banner}export const STORY_JSON = ${json}\n\nexport const CHARACTERS = ${JSON.stringify(characters, null, 2)}\n\nexport const LINES = ${JSON.stringify(lines, null, 2)}\n`,
)

console.log(`[story:build] ok · ${sayKeys.length} 条台词占位 · ${new Set(sayKeys).size} 个 key · ${endingIds.length} 个结局`)
