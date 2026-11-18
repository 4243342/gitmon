import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const PAGE_SIZE = 6
const PACK_WIDTH = 1.57
const PACK_HEIGHT = 2.55
const PACK_DEPTH = .115
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const colorOf = (value, fallback = '#c6a77c') => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas textures unavailable')
  paint(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function mixColor(base, target, amount) {
  return `#${new THREE.Color(base).lerp(new THREE.Color(target), amount).getHexString()}`
}

function drawPack(ctx, pack, image) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const color = colorOf(pack.color, '#71849a')
  const accent = colorOf(pack.accent, color)
  const qualityKey = pack.unrated ? '—' : pack.key || 'N'
  const qualityName = pack.unrated ? '待评估' : pack.name || 'COLLECTION'
  const background = ctx.createLinearGradient(0, 0, w, h)
  background.addColorStop(0, mixColor(color, '#ffffff', .15))
  background.addColorStop(.4, mixColor(color, '#101625', .45))
  background.addColorStop(1, '#111520')
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, w, h)

  // Engraved arcs and a soft foil reflection sit behind the standing artwork.
  ctx.save()
  ctx.globalAlpha = .24
  ctx.strokeStyle = accent
  ctx.lineWidth = 1
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.ellipse(w * .53, h * .57, 108 + i * 24, 197 + i * 31, -.28, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  const sheen = ctx.createLinearGradient(0, 0, w, h * .45)
  sheen.addColorStop(0, '#ffffff00')
  sheen.addColorStop(.42, '#ffffff00')
  sheen.addColorStop(.52, '#ffffff2c')
  sheen.addColorStop(.62, '#ffffff00')
  sheen.addColorStop(1, '#ffffff00')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, w, h)

  if (image) {
    const drawWidth = w * .94
    const drawHeight = h * .76
    const scale = Math.min(drawWidth / image.naturalWidth, drawHeight / image.naturalHeight)
    const iw = image.naturalWidth * scale
    const ih = image.naturalHeight * scale
    ctx.save()
    ctx.shadowColor = '#080a1d99'
    ctx.shadowBlur = 13
    ctx.shadowOffsetY = 5
    ctx.drawImage(image, (w - iw) / 2, h * .89 - ih, iw, ih)
    ctx.restore()
  }

  const shade = ctx.createLinearGradient(0, h * .73, 0, h)
  shade.addColorStop(0, '#10131c00')
  shade.addColorStop(.5, '#10131cbd')
  shade.addColorStop(1, '#10131cf5')
  ctx.fillStyle = shade
  ctx.fillRect(0, h * .73, w, h * .27)
  ctx.strokeStyle = `${accent}95`
  ctx.lineWidth = 1.4
  ctx.strokeRect(20, 34, w - 40, h - 68)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff8ec'
  ctx.font = '600 45px sans-serif'
  ctx.fillText('GITMON', 39, 104)
  ctx.font = '500 15px sans-serif'
  ctx.fillStyle = '#ffffffb3'
  ctx.fillText('MODEL COLLECTION', 41, 130)
  ctx.textAlign = 'right'
  ctx.fillStyle = accent
  ctx.font = '700 30px sans-serif'
  ctx.fillText(qualityKey, w - 39, 102)

  ctx.textAlign = 'left'
  ctx.font = '600 34px sans-serif'
  ctx.fillStyle = '#fff8ec'
  ctx.fillText(pack.model || 'GITMON', 38, h - 104, w - 76)
  ctx.font = '400 17px sans-serif'
  ctx.fillStyle = accent
  ctx.fillText(`${qualityKey} / ${qualityName}`, 40, h - 74, w - 150)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#d7d5d1'
  ctx.font = '400 15px sans-serif'
  ctx.fillText(`${String(pack.count || 0).padStart(2, '0')} CARDS`, w - 39, h - 74)

  // Rolled, ribbed foil at both ends of the wrapper.
  for (const top of [0, h - 25]) {
    const crimp = ctx.createLinearGradient(0, top, 0, top + 25)
    crimp.addColorStop(0, '#e7e8e7')
    crimp.addColorStop(.3, '#71808d')
    crimp.addColorStop(.6, '#d0d3d4')
    crimp.addColorStop(1, '#4c5662')
    ctx.fillStyle = crimp
    ctx.fillRect(0, top, w, 25)
    ctx.fillStyle = '#15233066'
    for (let x = 2; x < w; x += 7) ctx.fillRect(x, top, 1.5, 25)
  }
}

function wrapperShape(opened, strip = false) {
  const w = PACK_WIDTH
  const h = PACK_HEIGHT
  const shape = new THREE.Shape()
  if (strip) {
    shape.moveTo(-w / 2, h / 2)
    shape.lineTo(w / 2, h / 2)
    for (let i = 10; i >= 0; i--) shape.lineTo(-w / 2 + w * i / 10, h * (.405 + (i % 2 ? .013 : -.013)))
  } else {
    shape.moveTo(-w / 2, -h / 2)
    shape.lineTo(w / 2, -h / 2)
    if (opened) {
      for (let i = 10; i >= 0; i--) shape.lineTo(-w / 2 + w * i / 10, h * (.375 + (i % 2 ? .013 : -.013)))
    } else {
      shape.lineTo(w / 2, h / 2)
      shape.lineTo(-w / 2, h / 2)
    }
  }
  shape.closePath()
  return shape
}

function printedGeometry(shape) {
  const geometry = new THREE.ShapeGeometry(shape)
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / PACK_WIDTH + .5, pos.getY(i) / PACK_HEIGHT + .5)
  return geometry
}

function disposeTree(root) {
  const resources = new Set()
  root.traverse((object) => {
    if (object.geometry) resources.add(object.geometry)
    if (object.shadow?.dispose) resources.add(object.shadow)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material) continue
      resources.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value)
    }
  })
  for (const resource of resources) resource.dispose()
}

// Deliberately kept separate from the React component: Three.js is loaded only
// when a collection is shown and owns exactly one renderer for that mount.
export function createPackDisplayBox(host, { onSelect, onUnavailable } = {}) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.28
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  renderer.domElement.setAttribute('role', 'presentation')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 90)
  const showcase = new THREE.Group()
  const packShelf = new THREE.Group()
  showcase.add(packShelf)
  scene.add(showcase)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = motion.matches
  let disposed = false
  let contextLost = false
  let visible = true
  let disabled = false
  let frame = 0
  let width = 0
  let height = 0
  let activeIndex = -1
  let hoveredIndex = -1
  let currentSignature = ''
  let pageGeneration = 0
  let pointerStart = null
  let targetX = 0
  let targetY = 0
  let previousTime = 0
  let environment = null
  let observer = null
  let visibilityObserver = null
  const canvas = renderer.domElement
  const images = new Set()
  const packetMeshes = []
  const packets = []

  function invalidate() {
    if (disposed || contextLost || !visible || document.hidden || !width || !height || frame) return
    frame = requestAnimationFrame(render)
  }

  function render(time) {
    frame = 0
    if (disposed || contextLost || !visible || document.hidden) return
    const elapsed = previousTime ? Math.min(64, time - previousTime) : 16
    previousTime = time
    const ease = reducedMotion ? 1 : 1 - Math.exp(-elapsed / 95)
    showcase.rotation.x += (targetX - showcase.rotation.x) * ease
    showcase.rotation.y += (targetY - showcase.rotation.y) * ease
    let moving = Math.abs(targetX - showcase.rotation.x) + Math.abs(targetY - showcase.rotation.y) > .0002
    for (const packet of packets) {
      const selected = packet.index === activeIndex
      const hovered = packet.index === hoveredIndex
      const y = packet.baseY + (selected ? .42 : hovered ? .12 : 0)
      packet.group.position.y += (y - packet.group.position.y) * ease
      const z = selected ? .035 : packet.tilt
      packet.group.rotation.z += (z - packet.group.rotation.z) * ease
      moving ||= Math.abs(y - packet.group.position.y) > .001 || Math.abs(z - packet.group.rotation.z) > .001
    }
    renderer.render(scene, camera)
    if (moving && !reducedMotion) invalidate()
  }

  function material(color, metalness = 0, roughness = .6) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness })
  }
  function buildShowcase() {
    const shell = material('#151b24', .45, .43)
    const inner = material('#101720', .05, .94)
    const trim = material('#b89b73', .82, .27)
    const silver = material('#aab2b9', .9, .25)
    const rubber = material('#080c12', 0, .95)

    function block(parent, dimensions, position, mat, radius = .035) {
      const geometry = radius
        ? new RoundedBoxGeometry(...dimensions, 2, Math.min(radius, ...dimensions.map((v) => v / 3)))
        : new THREE.BoxGeometry(...dimensions)
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.position.set(...position)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    function decal(parent, texture, w, h, position, metalness = .25) {
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, metalness, roughness: .58, transparent: true }))
      mesh.position.set(...position)
      parent.add(mesh)
      return mesh
    }

    // A rigid collector's case: bottom, four walls, inset velvet, edge strips,
    // hinge barrels, feet, latches and the raised exhibition lid are real meshes.
    block(showcase, [6.9, .27, 3.94], [0, .3, 0], shell, .10)
    block(showcase, [6.49, .08, 3.50], [0, .48, 0], inner, .05)
    block(showcase, [6.9, 1.02, .2], [0, .92, 1.86], shell, .05)
    block(showcase, [6.9, 1.02, .2], [0, .92, -1.86], shell, .05)
    for (const side of [-1, 1]) {
      block(showcase, [.2, 1.02, 3.64], [side * 3.35, .92, 0], shell, .05)
      block(showcase, [.04, .035, 3.82], [side * 3.45, 1.43, 0], trim, .01)
      block(showcase, [.045, .055, 3.82], [side * 3.45, .4, 0], trim, .01)
      block(showcase, [.13, .5, .035], [side * 2.49, .95, 1.976], trim, .02)
      block(showcase, [.2, .08, .07], [side * 2.49, .97, 2.01], silver, .012)
      for (const end of [-1, 1]) block(showcase, [.48, .12, .40], [side * 2.93, .1, end * 1.48], rubber, .05)
    }
    for (const z of [-1.97, 1.97]) {
      block(showcase, [6.88, .035, .045], [0, 1.43, z], trim, .01)
      block(showcase, [6.88, .055, .045], [0, .4, z], trim, .01)
    }
    const plaque = canvasTexture(768, 160, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#c3a77d')
      g.addColorStop(.5, '#e4d2ae')
      g.addColorStop(1, '#a9895d')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#705635'
      ctx.lineWidth = 2
      ctx.strokeRect(12, 12, w - 24, h - 24)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#342e27'
      ctx.font = '600 50px sans-serif'
      ctx.fillText('G I T M O N', w / 2, 77)
      ctx.font = '400 19px sans-serif'
      ctx.fillText('COLLECTOR’S ARCHIVE  /  SERIES 01', w / 2, 117)
    })
    decal(showcase, plaque, 2.65, .55, [0, .91, 1.968], .6)

    const lid = new THREE.Group()
    lid.position.set(0, 1.43, -1.84)
    lid.rotation.x = -.19
    showcase.add(lid)
    block(lid, [6.9, 3.08, .2], [0, 1.54, 0], shell, .10)
    block(lid, [6.57, 2.77, .055], [0, 1.54, .125], inner, .06)
    block(lid, [6.75, .035, .04], [0, 3.035, .12], trim, .01)
    for (const x of [-3.39, 3.39]) block(lid, [.035, 2.94, .04], [x, 1.54, .12], trim, .01)
    const lidPrint = canvasTexture(1536, 660, (ctx, w, h) => {
      ctx.strokeStyle = '#b69b6f7a'
      ctx.lineWidth = 2
      ctx.strokeRect(24, 22, w - 48, h - 44)
      ctx.strokeStyle = '#b69b6f33'
      ctx.strokeRect(36, 34, w - 72, h - 68)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#b6a38a'
      ctx.font = '400 22px sans-serif'
      ctx.fillText('A R C H I V E   N O .   0 0 1', w / 2, 98)
      ctx.fillStyle = '#e7d2ad'
      ctx.font = '500 114px sans-serif'
      ctx.fillText('G I T M O N', w / 2, 244)
      ctx.fillStyle = '#aa9c8d'
      ctx.font = '400 26px sans-serif'
      ctx.fillText('M O D E L   C O L L E C T I O N', w / 2, 305)
      ctx.strokeStyle = '#b69b6f55'
      ctx.beginPath(); ctx.moveTo(350, 350); ctx.lineTo(w - 350, 350); ctx.stroke()
      ctx.fillStyle = '#7c807f'
      ctx.font = '400 22px sans-serif'
      ctx.fillText('SIX FOILS. SIX IDENTITIES.', w / 2, 400)
      ctx.fillStyle = '#ad9473'
      ctx.font = '500 24px sans-serif'
      ctx.fillText('N     /     R     /     SR     /     UR     /     SE     /     PSE', w / 2, 467)
    })
    decal(lid, lidPrint, 6.12, 2.63, [0, 1.58, .16], .35)
    for (const x of [-2.2, 2.2]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .6, 12), trim)
      hinge.rotation.z = Math.PI / 2
      hinge.position.set(x, 1.4, -1.83)
      showcase.add(hinge)
    }

    // Six recessed slots keep the packaging grounded in the case rather than
    // floating in front of a decorative background.
    for (const z of [-.78, .82]) {
      for (const x of [-2.1, 0, 2.1]) {
        block(showcase, [1.91, .06, 1.35], [x, .54, z], rubber, .06)
        for (const offset of [-.96, .96]) block(showcase, [.055, .16, 1.45], [x + offset, .61, z], inner, .02)
        block(showcase, [1.9, .10, .045], [x, .59, z + .67], inner, .015)
      }
    }

    scene.add(new THREE.HemisphereLight('#d8e1ff', '#504338', 2.4))
    const keyLight = new THREE.DirectionalLight('#fff2d8', 3.6)
    keyLight.position.set(-3, 8, 6)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    keyLight.shadow.camera.left = -6
    keyLight.shadow.camera.right = 6
    keyLight.shadow.camera.top = 7
    keyLight.shadow.camera.bottom = -5
    keyLight.shadow.normalBias = .035
    keyLight.shadow.bias = -.00012
    keyLight.shadow.radius = 4
    keyLight.target.position.set(0, 1.8, 0)
    scene.add(keyLight, keyLight.target)
    const rimLight = new THREE.DirectionalLight('#a8beed', 2.5)
    rimLight.position.set(4, 5, -5)
    scene.add(rimLight)
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    try {
      environment = pmrem.fromScene(room, .04)
      scene.environment = environment.texture
    } finally {
      room.dispose()
      pmrem.dispose()
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ opacity: .28 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const shadowMap = canvasTexture(256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2)
      g.addColorStop(0, '#0000009e')
      g.addColorStop(.42, '#00000060')
      g.addColorStop(1, '#00000000')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    })
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.9), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }))
    contact.rotation.x = -Math.PI / 2
    contact.position.y = .015
    scene.add(contact)
  }

  function fitCamera() {
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    // A fixed envelope includes a lifted selected pack. Selection and loading
    // therefore never resize the scene or make the collection jump.
    const bounds = new THREE.Box3(new THREE.Vector3(-3.75, -.12, -2.65), new THREE.Vector3(3.75, 4.67, 2.25))
    const target = bounds.getCenter(new THREE.Vector3())
    const direction = new THREE.Vector3(.52, .51, 1).normalize()
    let distance = 10
    for (let attempt = 0; attempt < 35; attempt++) {
      camera.position.copy(target).addScaledVector(direction, distance)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      let fits = true
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera)
        if (Math.abs(projected.x) > .90 || Math.abs(projected.y) > .90) fits = false
      }
      if (fits) break
      distance *= 1.055
    }
    invalidate()
  }

  function resize() {
    if (disposed || contextLost) return
    const rect = host.getBoundingClientRect()
    width = Math.max(0, Math.round(rect.width))
    height = Math.max(0, Math.round(rect.height))
    if (!width || !height) return
    renderer.setSize(width, height, false)
    fitCamera()
  }

  function clearPackets() {
    pageGeneration++
    for (const image of images) { image.onload = null; image.onerror = null; image.src = '' }
    images.clear()
    disposeTree(packShelf)
    packShelf.clear()
    packetMeshes.length = 0
    packets.length = 0
  }

  function addPacket(pack, absoluteIndex, offset, visibleCount) {
    const row = Math.floor(offset / 3)
    const col = offset % 3
    const rowCount = Math.min(3, visibleCount - row * 3)
    const slot = rowCount === 1 ? 1 : rowCount === 2 ? col * 2 : col
    const group = new THREE.Group()
    group.userData.packIndex = absoluteIndex
    const baseY = row ? 2.16 : 1.81
    const tilt = (slot - 1) * -.035
    group.position.set((slot - 1) * 2.1, baseY - (reducedMotion ? 0 : .14), row ? -.78 : .83)
    group.rotation.x = -.10
    group.rotation.z = tilt
    packShelf.add(group)
    const color = colorOf(pack.color, '#71849a')
    const shape = wrapperShape(pack.opened)
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: PACK_DEPTH, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .009, bevelThickness: .009 }), material(mixColor(color, '#dce1eb', .22), .65, .38))
    body.position.z = -PACK_DEPTH / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)
    const texture = canvasTexture(512, 832, (ctx) => drawPack(ctx, pack))
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    const printMaterial = new THREE.MeshStandardMaterial({ map: texture, metalness: .25, roughness: .43 })
    const print = new THREE.Mesh(printedGeometry(shape), printMaterial)
    print.position.z = PACK_DEPTH / 2 + .011
    print.castShadow = true
    print.receiveShadow = true
    group.add(print)
    if (pack.opened) {
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(PACK_WIDTH - .05, PACK_DEPTH * .85), material('#080b12', 0, .9))
      mouth.rotation.x = -Math.PI / 2
      mouth.position.y = PACK_HEIGHT * .365
      group.add(mouth)
      const strip = new THREE.Mesh(printedGeometry(wrapperShape(true, true)), printMaterial)
      strip.position.set(.07, .15, PACK_DEPTH / 2 + .04)
      strip.rotation.z = -.13
      strip.castShadow = true
      group.add(strip)
    }
    packetMeshes.push(body, print)
    packets.push({ group, index: absoluteIndex, baseY, tilt })

    if (pack.art) {
      const image = new Image()
      const generation = pageGeneration
      images.add(image)
      image.onload = () => {
        images.delete(image)
        if (disposed || generation !== pageGeneration || !image.naturalWidth) return
        drawPack(texture.image.getContext('2d'), pack, image)
        texture.needsUpdate = true
        image.onload = null
        image.onerror = null
        invalidate()
      }
      image.onerror = () => { images.delete(image); image.onload = null; image.onerror = null }
      image.src = pack.art
    }
  }

  function setPacks(packs, selected = 0) {
    if (disposed || contextLost) return
    activeIndex = packs.length ? clamp(Number.isFinite(selected) ? Math.trunc(selected) : 0, 0, packs.length - 1) : -1
    const page = Math.floor(Math.max(0, activeIndex) / PAGE_SIZE)
    const visiblePacks = packs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const signature = JSON.stringify([page, visiblePacks.map(({ id, count, opened, key, name, model, color, accent, art, pending, unrated }) => ({ id, count, opened, key, name, model, color, accent, art, pending, unrated }))])
    if (signature !== currentSignature) {
      currentSignature = signature
      clearPackets()
      visiblePacks.forEach((pack, offset) => addPacket(pack, page * PAGE_SIZE + offset, offset, visiblePacks.length))
      hoveredIndex = -1
    }
    invalidate()
  }

  function hitAt(event) {
    const rect = renderer.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return -1
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    scene.updateMatrixWorld()
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(packetMeshes, false)[0]
    return hit ? hit.object.parent.userData.packIndex : -1
  }

  function move(event) {
    if (disabled || contextLost) return
    const fine = event.pointerType !== 'touch'
    if (fine && !reducedMotion) {
      const rect = host.getBoundingClientRect()
      targetY = clamp((event.clientX - rect.left) / Math.max(1, rect.width) - .5, -.5, .5) * .18
      targetX = clamp((event.clientY - rect.top) / Math.max(1, rect.height) - .5, -.5, .5) * .055
    }
    hoveredIndex = fine ? hitAt(event) : -1
    renderer.domElement.style.cursor = hoveredIndex >= 0 ? 'pointer' : 'default'
    invalidate()
  }

  function leave() {
    targetX = 0
    targetY = 0
    hoveredIndex = -1
    pointerStart = null
    renderer.domElement.style.cursor = 'default'
    invalidate()
  }

  function down(event) {
    if (disabled || !event.isPrimary || event.button !== 0) return
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }

  function up(event) {
    const start = pointerStart
    pointerStart = null
    if (disabled || !start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return
    const index = hitAt(event)
    if (index >= 0) onSelect?.(index)
  }

  function onMotionChange(event) {
    reducedMotion = event.matches
    if (reducedMotion) { targetX = 0; targetY = 0 }
    invalidate()
  }

  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
    cancelAnimationFrame(frame)
    frame = 0
    onUnavailable?.()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    frame = 0
    clearPackets()
    observer?.disconnect()
    visibilityObserver?.disconnect()
    motion.removeEventListener?.('change', onMotionChange)
    document.removeEventListener('visibilitychange', invalidate)
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerleave', leave)
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointercancel', leave)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    disposeTree(scene)
    environment?.dispose()
    renderer.dispose()
    canvas.remove()
  }

  try {
    buildShowcase()
    canvas.addEventListener('pointermove', move, { passive: true })
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointerdown', down, { passive: true })
    canvas.addEventListener('pointerup', up, { passive: true })
    canvas.addEventListener('pointercancel', leave)
    canvas.addEventListener('webglcontextlost', onContextLost)
    motion.addEventListener?.('change', onMotionChange)
    document.addEventListener('visibilitychange', invalidate)
    window.addEventListener('resize', resize)
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    observer?.observe(host)
    visibilityObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) invalidate()
      else { cancelAnimationFrame(frame); frame = 0 }
    }, { rootMargin: '80px' }) : null
    visibilityObserver?.observe(host)
    resize()
  } catch (error) {
    dispose()
    throw error
  }

  return {
    setPacks,
    setDisabled(value) { disabled = Boolean(value); if (disabled) leave() },
    dispose,
  }
}
