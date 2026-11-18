const repoPath = (pet) => `${pet.platform}/${pet.fullName}`.toLowerCase()

export function arenaPetKey(pet) {
  return pet.repoId ? `${pet.platform}/id:${pet.repoId}` : repoPath(pet)
}

export function toArenaPet(pet) {
  const { platform, repoId, repo, fullName, level, spriteSeed, spriteUrl, evolutionStage } = pet
  const element = pet.battleElement ?? pet.element
  const secondary = pet.battleElement ? pet.battleElementSecondary : pet.elementSecondary
  return Object.freeze({
    platform, repoId, repo, fullName, level, spriteSeed, spriteUrl, evolutionStage,
    element: Object.freeze({ ...element }),
    elementSecondary: secondary ? Object.freeze({ ...secondary }) : null,
    species: Object.freeze({ ...pet.species }),
    quality: Object.freeze({ ...pet.quality }),
    stats: Object.freeze((pet.stats || []).map(({ name, value }) => Object.freeze({ name, value }))),
    skills: Object.freeze((pet.skills || []).map(({ name, unlocked, unlockLevel }) => Object.freeze({ name, unlocked, unlockLevel }))),
  })
}

export function prepareArenaRoster(cloudPets, localPets, selected) {
  const cloudPaths = new Set(cloudPets.map(repoPath))
  const initial = selected ? toArenaPet(selected) : null
  const roster = new Map()
  if (initial) roster.set(arenaPetKey(initial), initial)
  for (const pet of [...cloudPets, ...localPets.filter((pet) => !cloudPaths.has(repoPath(pet)))]) {
    if (selected && !selected.repoId && repoPath(pet) === repoPath(selected)) continue
    const key = arenaPetKey(pet)
    if (!roster.has(key)) roster.set(key, toArenaPet(pet))
  }
  return { pets: [...roster.values()], initial }
}
