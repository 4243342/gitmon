// 一包 5 个项目
//
// 账号下扫描到的项目先按名称散列一次，再每 5 个装成一包。
// 散列用的是名称本身的哈希，所以同一个账号每次进来分到的包都一样，
// 刷新页面不会把已经开过的包打乱；同一个项目也只会出现在一包里，
// 不会出现一包里塞了两个相同项目的情况。

const PACK_SIZE = 5

// FNV-1a：拿名字算一个稳定的散列值
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const petKey = (pet) => pet.id || pet.fullName

export function groupIntoPacks(pets, size = PACK_SIZE) {
  // 同一个项目只留一份，保证一包里不会出现重复的项目
  const seen = new Set()
  const list = []
  for (const pet of pets || []) {
    const key = petKey(pet)
    if (seen.has(key)) continue
    seen.add(key)
    list.push(pet)
  }
  list.sort((a, b) => {
    const d = hash(petKey(a)) - hash(petKey(b))
    return d || petKey(a).localeCompare(petKey(b))
  })
  const packs = []
  for (let i = 0; i < list.length; i += size) packs.push(list.slice(i, i + size))
  return packs
}
