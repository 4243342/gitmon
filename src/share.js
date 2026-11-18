// 分享卡片导出（文档 §7.3）
import { drawCloudCardTraits, drawPetSprite } from './sprite.js'
import { elementLabel } from './elementLabel.js'
import { cardFoil, isCloudCard } from './cardTraits.js'

export async function exportShareCard(pet) {
  const W = 1080, H = 1350
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const q = cardFoil(pet)

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#1b2740')
  bg.addColorStop(1, '#0b1120')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 品质光晕
  const glow = ctx.createRadialGradient(W / 2, 520, 60, W / 2, 520, 520)
  glow.addColorStop(0, q.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 立绘
  const sprite = document.createElement('canvas')
  sprite.width = 512; sprite.height = 512
  await drawPetSprite(sprite, pet)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sprite, (W - 512) / 2, 180, 512, 512)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#f2f6ff'
  ctx.font = 'bold 76px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText(pet.repo, W / 2, 800)

  if (isCloudCard(pet)) drawCloudCardTraits(ctx, pet, W, 940, 108, 56)
  else drawLocalCardDetails(ctx, pet, q, W, H)

  const link = document.createElement('a')
  link.download = `gitmon-${pet.repo}-${q.key}.png`
  link.href = c.toDataURL('image/png')
  link.click()
}

function drawLocalCardDetails(ctx, pet, q, W, H) {
  ctx.fillStyle = 'rgba(196,210,232,0.8)'
  ctx.font = '36px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText(`${elementLabel(pet)}${pet.elementSecondary ? '/' + pet.elementSecondary.name : ''} · ${pet.species.name}`, W / 2, 862)

  ctx.fillStyle = q.color
  ctx.font = 'bold 54px -apple-system, sans-serif'
  ctx.fillText(`${q.key}  ·  Lv.${pet.level}`, W / 2, 950)

  // 六维条
  const startY = 1010
  pet.stats.forEach((s, i) => {
    const y = startY + i * 46
    ctx.fillStyle = 'rgba(190,204,226,0.7)'
    ctx.font = '28px -apple-system, "PingFang SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(s.name, 120, y + 20)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(240, y, 620, 18)
    ctx.fillStyle = pet.element.color
    ctx.fillRect(240, y, (620 * s.value) / 100, 18)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(220,230,246,0.9)'
    ctx.fillText(`${s.value} ${s.grade}`, 960, y + 18)
  })

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(150,166,192,0.7)'
  ctx.font = '26px -apple-system, sans-serif'
  ctx.fillText(`品质分 ${pet.qualityScore} · 工程量 ${pet.engineeringScore} · ${pet.platform === 'gitee' ? 'Gitee' : 'GitHub'}`, W / 2, H - 60)
}
