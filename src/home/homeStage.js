import * as THREE from 'three'

// 首页中央立体看板：沿用 threePack/displayBox.js 已经验证过的渲染器 / 生命周期写法，
// 只是把收藏盒换成一个悬浮精灵 + 全息基座。素材来自 sprite.js 的 petArtwork()。
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const ACCENT = '#b18c6e'

function shadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(0,0,0,.38)')
  gradient.addColorStop(.55, 'rgba(0,0,0,.13)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function disposeMaterial(material) {
  if (!material) return
  if (material.map) material.map.dispose()
  material.dispose()
}

export function createHomeStage(host, { onUnavailable } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.setClearAlpha(0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  const canvas = renderer.domElement
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;'
  host.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 40)
  camera.position.set(0, .72, 6.6)

  const root = new THREE.Group()
  scene.add(root)

  // 用 Three.js 原生灯光、平面和纹理构建暖纸色的 2.5D 展示台，不新增第二套渲染器。
  scene.add(new THREE.HemisphereLight(0xfff6e5, 0x807467, 1.35))
  const key = new THREE.PointLight(0xffe6c5, 15, 16, 2)
  key.position.set(2.2, 3.4, 3.2)
  scene.add(key)
  const rim = new THREE.PointLight(0xd3bca2, 7, 14, 2)
  rim.position.set(-2.6, 1.8, -1.8)
  scene.add(rim)

  const pedestalMaterial = new THREE.MeshStandardMaterial({ color: 0xd4c8b7, metalness: .14, roughness: .78 })
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.38, .16, 64), pedestalMaterial)
  pedestal.position.y = .02
  root.add(pedestal)

  const ringMaterial = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: .54 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, .012, 8, 120), ringMaterial)
  ring.rotation.x = Math.PI / 2
  ring.position.y = .11
  root.add(ring)

  const discMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: .11, side: THREE.DoubleSide,
    depthWrite: false,
  })
  const disc = new THREE.Mesh(new THREE.RingGeometry(.42, 1.14, 96), discMaterial)
  disc.rotation.x = -Math.PI / 2
  disc.position.y = .12
  root.add(disc)

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({
    map: shadowTexture(), transparent: true, depthWrite: false, opacity: .9,
  }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = .13
  root.add(shadow)

  // 全息背环，让精灵有“投影”感，而不是一张贴图浮在空里。
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: .14, side: THREE.DoubleSide,
    depthWrite: false,
  })
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.32, 1.36, 96), haloMaterial)
  halo.position.set(0, 1.5, -.55)
  root.add(halo)

  const shards = []
  const shardGeometry = new THREE.PlaneGeometry(.14, .2)
  for (let i = 0; i < 10; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: .12, side: THREE.DoubleSide,
      depthWrite: false,
    })
    const shard = new THREE.Mesh(shardGeometry, material)
    const angle = (i / 10) * Math.PI * 2
    const radius = 1.55 + (i % 3) * .1
    shard.position.set(Math.cos(angle) * radius, .75 + (i % 5) * .28, Math.sin(angle) * radius * .5)
    shard.rotation.z = angle
    root.add(shard)
    shards.push(shard)
  }

  // 前景立绘和后景低透明轮廓分成两层，以微小视差模拟 L2D 的空间感。
  // 这不是 Live2D Cubism 骨骼模型，也不依赖未经授权的角色素材。
  const petEcho = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0xb5a18b, transparent: true, opacity: .14, depthWrite: false, toneMapped: false,
  }))
  petEcho.visible = false
  petEcho.renderOrder = 1
  root.add(petEcho)

  const pet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
  }))
  pet.visible = false
  pet.renderOrder = 2
  root.add(pet)

  let petTexture = null
  let petTarget = 1

  function setPet(art) {
    if (petTexture) petTexture.dispose()
    petTexture = null
    if (!art?.image) { pet.visible = false; petEcho.visible = false; invalidate(); return }
    const image = art.image
    petTexture = image instanceof HTMLCanvasElement ? new THREE.CanvasTexture(image) : new THREE.Texture(image)
    petTexture.colorSpace = THREE.SRGBColorSpace
    petTexture.needsUpdate = true
    const width = image.naturalWidth || image.width || 1
    const height = image.naturalHeight || image.height || 1
    const pixelated = Boolean(art.pixelated)
    petTexture.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter
    petTexture.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter
    petTexture.generateMipmaps = false
    pet.material.map = petTexture
    pet.material.needsUpdate = true
    petEcho.material.map = petTexture
    petEcho.material.needsUpdate = true
    const planeHeight = 2.35
    const planeWidth = clamp(planeHeight * (width / height), .9, 3.1)
    pet.userData.base = { width: planeWidth, height: planeHeight }
    pet.scale.set(planeWidth * scale, planeHeight * scale, 1)
    pet.position.set(0, .18 + planeHeight / 2, 0)
    pet.visible = true
    petEcho.visible = true
    petTarget = 1
    invalidate()
  }

  function setAccent(value) {
    const color = /^#[\da-f]{6}$/i.test(value || '') ? value : ACCENT
    // 属性颜色保留个性，但往纸张与铜色收敛，避免回到霓虹全息风。
    const tint = new THREE.Color(color).lerp(new THREE.Color(ACCENT), .72)
    ringMaterial.color.copy(tint)
    discMaterial.color.copy(tint)
    haloMaterial.color.copy(tint)
    for (const shard of shards) shard.material.color.copy(tint)
    invalidate()
  }

  let disposed = false
  let contextLost = false
  let frame = 0
  let visible = true
  let reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let pointerX = 0
  let pointerY = 0
  let targetX = 0
  let targetY = 0
  let elapsed = 0
  let last = 0
  let scale = .88

  function resize() {
    const width = host.clientWidth
    const height = host.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // Canvas 在布局中独占中央列，立绘永远居中，避免宽屏偏移。 
    root.position.x = 0
    camera.updateProjectionMatrix()
    invalidate()
  }

  function render(now) {
    frame = 0
    if (disposed || contextLost || !visible || document.hidden) return
    const delta = last ? Math.min(.05, (now - last) / 1000) : .016
    last = now
    elapsed += delta

    camera.position.x += (targetX * .26 - camera.position.x) * .06
    camera.position.y += (.72 - targetY * .16 - camera.position.y) * .06
    camera.lookAt(root.position.x, .95, 0)

    if (!reducedMotion) {
      pet.position.y = .18 + (pet.userData.base?.height || 2.35) / 2 + Math.sin(elapsed * 1.35) * .045
      pet.rotation.y = Math.sin(elapsed * .55) * .07 + pointerX * .07
      pet.rotation.z = Math.sin(elapsed * .9) * .009
      halo.rotation.z = elapsed * .12
      disc.rotation.z = -elapsed * .2
      ring.rotation.z = elapsed * .35
      for (let i = 0; i < shards.length; i += 1) {
        const shard = shards[i]
        shard.position.y += Math.sin(elapsed * .7 + i) * .0006
        shard.rotation.y = elapsed * .35 + i
      }
    }
    scale += (petTarget - scale) * .12
    if (pet.userData.base) {
      pet.scale.set(pet.userData.base.width * scale, pet.userData.base.height * scale, 1)
      petEcho.scale.copy(pet.scale).multiplyScalar(1.055)
      petEcho.position.set(.12 + pointerX * .04, pet.position.y + .035, -.22)
      petEcho.rotation.y = pet.rotation.y * .55
      petEcho.rotation.z = -pet.rotation.z * .5
    }

    renderer.render(scene, camera)
    frame = requestAnimationFrame(render)
  }

  function invalidate() {
    if (disposed || contextLost || !visible || document.hidden || frame) return
    frame = requestAnimationFrame(render)
  }

  function move(event) {
    const rect = host.getBoundingClientRect()
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
    targetX = clamp(pointerX, -1, 1)
    targetY = clamp(pointerY, -1, 1)
    invalidate()
  }

  function leave() {
    pointerX = 0; pointerY = 0; targetX = 0; targetY = 0
    invalidate()
  }

  function onMotionChange(event) {
    reducedMotion = event.matches
    invalidate()
  }

  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
    cancelAnimationFrame(frame)
    frame = 0
    onUnavailable?.()
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
  observer?.observe(host)
  const visibilityObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) invalidate()
    else { cancelAnimationFrame(frame); frame = 0 }
  }, { rootMargin: '120px' }) : null
  visibilityObserver?.observe(host)
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  motion?.addEventListener?.('change', onMotionChange)
  host.addEventListener('pointermove', move, { passive: true })
  host.addEventListener('pointerleave', leave)
  canvas.addEventListener('webglcontextlost', onContextLost)
  document.addEventListener('visibilitychange', invalidate)
  window.addEventListener('resize', resize)

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    frame = 0
    observer?.disconnect()
    visibilityObserver?.disconnect()
    motion?.removeEventListener?.('change', onMotionChange)
    document.removeEventListener('visibilitychange', invalidate)
    window.removeEventListener('resize', resize)
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    scene.traverse((object) => {
      object.geometry?.dispose?.()
      disposeMaterial(object.material)
    })
    petTexture?.dispose()
    renderer.dispose()
    canvas.remove()
  }

  try {
    resize()
    setAccent(ACCENT)
    invalidate()
  } catch (error) {
    dispose()
    throw error
  }

  return { setPet, setAccent, dispose }
}
