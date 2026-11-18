import { matchBuiltinOwnerTeam, matchBuiltinRival, rivalFromSnapshot, rivalPets } from './rivals.js'
import { powerOf } from './arenaModes.js'
import { toArenaPet } from './arenaRoster.js'
import { parseRepoInput, scanOwnerBox, scanRepo } from './scan.js'

const publicScan = { anonymous: true, cache: false }

export function arenaRivals() {
  return rivalPets().map(toArenaPet)
}

export async function loadArenaOpponents(input, size) {
  const info = parseRepoInput(input)
  if (!info) throw new Error('无法识别的地址，请输入 GitHub / Gitee 仓库或账号链接')
  const { platform, owner } = info
  if (size === 'single') {
    if (info.kind !== 'repo') throw new Error('单项目 PK 需要具体仓库地址，例如 github.com/owner/repo')
    const local = matchBuiltinRival(platform, info.fullName)
    if (local) return { pets: [toArenaPet(local)], note: '内置快照 · 离线可打' }
    const pet = rivalFromSnapshot(await scanRepo(info, publicScan))
    return { pets: [toArenaPet(pet)], note: '公开仓库数据 · 刚刚扫描' }
  }

  const local = matchBuiltinOwnerTeam(platform, owner).slice(0, 3)
  if (local.length >= 2) {
    return { pets: local.map(toArenaPet), note: `内置快照 · ${owner} 的 ${local.length} 个项目` }
  }
  const result = await scanOwnerBox({ kind: 'owner', platform, owner }, { ...publicScan, limit: 4 })
  if (!result.snaps.length) {
    throw new Error(result.rateLimited ? '平台匿名配额已用尽，稍后再试' : '这个账号没有可挑战的公开项目')
  }
  const pets = result.snaps.map(rivalFromSnapshot).sort((a, b) => powerOf(b) - powerOf(a)).slice(0, 3)
  return { pets: pets.map(toArenaPet), note: `公开仓库数据 · ${owner} 的 ${pets.length} 个项目` }
}
