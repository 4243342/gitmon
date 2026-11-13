// 种族立绘覆盖检查：node scripts/art-check.mjs
// 列出 7 种族 × 9 属性 共 63 格里哪些已有素材、哪些还缺
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ELEMENTS, SPECIES } from '../src/engine.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/species')
const EXT = /\.(png|webp)$/i

const found = new Map() // "species:element" -> [stage...]
let total = 0

for (const sp of Object.values(SPECIES)) {
  const dir = path.join(root, sp.key)
  if (!fs.existsSync(dir)) continue
  for (const f of fs.readdirSync(dir)) {
    if (!EXT.test(f)) continue
    const m = f.replace(EXT, '').match(/^([a-z]+)(?:-s([2-9]))?$/)
    if (!m) {
      console.log(`! 文件名不合规：${sp.key}/${f}`)
      continue
    }
    const key = `${sp.key}:${m[1]}`
    if (!ELEMENTS[m[1]]) {
      console.log(`! 未知属性：${sp.key}/${f}`)
      continue
    }
    const stages = found.get(key) || []
    stages.push(m[2] ? Number(m[2]) : 1)
    found.set(key, stages)
    total += 1
  }
}

const elements = Object.values(ELEMENTS)
const species = Object.values(SPECIES)

console.log(`\n素材文件：${total} 个 · 覆盖 ${found.size} / ${species.length * elements.length} 格\n`)

const head = ['种族 \\ 属性', ...elements.map((e) => e.name)].map((s) => s.padEnd(8, ' ')).join('')
console.log(head)
for (const sp of species) {
  const row = [sp.name.padEnd(10, ' ')]
  for (const el of elements) {
    const stages = found.get(`${sp.key}:${el.key}`)
    const max = stages ? Math.max(...stages) : 0
    row.push((stages ? (max > 1 ? `●s${max}` : '●') : '·').padEnd(8, ' '))
  }
  console.log(row.join(''))
}

const missing = []
for (const sp of species) for (const el of elements) if (!found.has(`${sp.key}:${el.key}`)) missing.push(`${sp.key}/${el.key}.png`)

if (missing.length) {
  console.log(`\n还缺 ${missing.length} 格：`)
  console.log(missing.join('  '))
} else {
  console.log('\n63 格全部到位 ✓')
}
