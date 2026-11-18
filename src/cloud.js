const API = '/api/cloud'
const portraits = import.meta.glob('./assets/creatures/*/*.png', { eager: true, import: 'default', query: '?url' })
const DIMENSIONS = {
  tests: '测试',
  engineering: '工程',
  docs: '文档',
  maintenance: '维护',
  community: '社区',
}

function toPet(data) {
  return {
    ...data,
    cardSpriteUrl: portraits[`./assets/creatures/${data.cardArt}`] ?? data.spriteUrl,
    maxHp: data.hp,
    stars: data.metrics.stars ?? 0,
    qualityDims: Object.entries(data.qualityDims).map(([key, value]) => ({ key, value, name: DIMENSIONS[key] })),
    skills: data.skills.map((name) => ({ name, unlocked: true })),
    stats: data.stats.map((stat) => ({
      ...stat,
      grade: stat.value >= 90 ? 'S' : stat.value >= 75 ? 'A' : stat.value >= 60 ? 'B' : stat.value >= 40 ? 'C' : 'D',
    })),
  }
}

async function request(path, signal, { method = 'GET', body } = {}) {
  const response = await fetch(API + path, {
    credentials: 'same-origin',
    signal,
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  signal.throwIfAborted()
  if (!response.ok || !data) throw new Error(data?.error || '云图鉴请求失败，请稍后重试')
  return data
}

function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 1500)
    signal.addEventListener('abort', abort, { once: true })
  })
}

async function waitForJob(path, signal, { timeout, onProgress }) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await waitForPoll(signal)
    const job = await request(path, signal)
    if (job.progress) onProgress?.(job.progress)
    if (job.status === 'done') return job
    if (job.status === 'failed') throw new Error(job.error || '扫描失败')
  }
  throw new Error('扫描等待超时，请稍后重试')
}

export async function previewCloudPet(repo, signal) {
  const { jobId } = await request('/previews', signal, { method: 'POST', body: { repo } })
  const { pet } = await waitForJob(`/previews/${jobId}`, signal, { timeout: 180_000 })
  return { ...toPet(pet), previewId: jobId }
}

export async function previewCloudBox(signal, onProgress) {
  const { jobId } = await request('/boxes', signal, { method: 'POST' })
  const { box } = await waitForJob(`/boxes/${jobId}`, signal, { timeout: 900_000, onProgress })
  return { ...box, id: jobId, pets: box.pets.map((pet) => ({ ...toPet(pet), boxId: jobId })) }
}

export async function collectCloudPet(pet, signal) {
  const path = pet.boxId ? `/boxes/${pet.boxId}/pets/${pet.id}` : `/previews/${pet.previewId}`
  return toPet(await request(`${path}/collect`, signal, { method: 'POST' }))
}

export async function collectCloudBox(boxId, signal) {
  const { items } = await request(`/boxes/${boxId}/collect`, signal, { method: 'POST' })
  return items.map(toPet)
}

export async function refreshCloudPet(id, signal) {
  return toPet(await request(`/pets/${id}/refresh`, signal, { method: 'POST' }))
}

export async function loadCloudPets(signal) {
  const pets = []
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const { items } = await request(`/pets?limit=${limit}&offset=${offset}`, signal)
    pets.push(...items.map(toPet))
    if (items.length < limit) return pets
  }
}
