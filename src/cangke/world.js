/* 仓可梦 · 像素版 —— 地图与像素绘制
 *
 * 纯 canvas 画的 16px 图块，不依赖任何外部 tileset：颜色和形状都在这里定义，
 * 一个字符一块地，改地图就是改 buildMap() 里的矩形。
 * 视角 20×13 格（320×208），CSS 放大时用 image-rendering: pixelated 保住像素边。
 */

export const TILE = 16
export const VIEW_W = 20
export const VIEW_H = 13
export const MAP_W = 40
export const MAP_H = 30

// 稳定的地块噪点：同一格每次画出来都一样，不会闪
export function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967296
}

export function buildMap() {
  const W = MAP_W
  const H = MAP_H
  const g = Array.from({ length: H }, () => Array(W).fill('.'))
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c }
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) set(x, y, c)
  }

  // 外圈树林：地图边界都是走不过去的树
  rect(0, 0, W - 1, 1, '#')
  rect(0, H - 2, W - 1, H - 1, '#')
  rect(0, 0, 1, H - 1, '#')
  rect(W - 2, 0, W - 1, H - 1, '#')

  // 主路：横向大街 + 村内纵向小街
  rect(2, 14, 37, 15, ':')
  rect(6, 8, 7, 27, ':')

  // 两间屋子（屋顶 R / 墙 W / 门 D）
  rect(4, 4, 7, 4, 'R'); rect(4, 5, 7, 6, 'W'); set(6, 6, 'D')
  rect(10, 4, 13, 4, 'R'); rect(10, 5, 13, 6, 'W'); set(12, 6, 'D')

  // 池塘
  rect(21, 3, 27, 8, '~')
  set(21, 8, '.'); set(27, 8, '.')

  // 草丛：北边一块（等级高些）+ 南边一块
  rect(29, 5, 36, 12, ',')
  rect(20, 18, 33, 26, ',')
  rect(24, 16, 27, 17, ',')

  // 零散树林
  rect(16, 18, 18, 21, '#')
  rect(16, 3, 18, 5, '#')
  rect(30, 21, 32, 22, '#')

  // 花丛 + 告示牌 + 栅栏
  rect(3, 9, 5, 10, 'F')
  rect(9, 10, 10, 11, 'F')
  set(9, 13, 'S')
  set(8, 12, '='); set(9, 12, '='); set(10, 12, '=')

  return g
}

export const MAP = buildMap()

const BLOCKED = new Set(['#', '~', 'R', 'W', '=', 'S'])
export const PLAYER_START = { x: 6, y: 14 }

export const NPCS = [
  {
    id: 'elder',
    x: 12,
    y: 16,
    lines: [
      '老爷爷：这片草地不太平，草丛里全是野生的仓可梦。',
      '老爷爷：带一只在身边，走进去就会遇上它们。',
      '老爷爷：打不过就跑，跑不掉就用精灵球——满血是抓不住的。',
    ],
  },
  {
    id: 'kid',
    // 站在大街北侧的路肩上，不占道——摆在路上会把 14 行堵死，玩家只能贴另一条道走
    x: 16,
    y: 13,
    lines: [
      '小孩：听说北边的草丛里有更凶的家伙，等级比这边高一截。',
      '小孩：屋门口那块木门是治疗点，站上去队伍就全恢复了。',
    ],
  },
]

export function charAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#'
  return MAP[y][x]
}

export function blockedAt(x, y) {
  if (BLOCKED.has(charAt(x, y))) return true
  return NPCS.some((n) => n.x === x && n.y === y)
}

export function isTallGrass(x, y) {
  return charAt(x, y) === ','
}

export function isHealTile(x, y) {
  return charAt(x, y) === 'D'
}

// 越往北 / 越往右，野怪等级越高
export function zoneAt(x, y) {
  if (y < 15) return { min: 5, max: 10 }
  if (x >= 24) return { min: 4, max: 8 }
  return { min: 2, max: 5 }
}

// ---------------------------------------------------------------- 图块绘制

const C = {
  grass: '#4f9d45', grassD: '#3d8639', grassL: '#63b357',
  tall: '#2f7a35', tallL: '#43a94e',
  path: '#cbb07a', pathD: '#b3975f',
  water: '#2f6fd0', waterL: '#5b9bf2', waterD: '#24559f',
  trunk: '#6b4a2f', leaf: '#2f7a3a', leafL: '#47a04d',
  roof: '#b3453c', roofD: '#8c332c', wall: '#e3cda2', wallD: '#c3ab7f',
  door: '#6b4a2f', doorL: '#8a6238',
  flower: ['#f2e05a', '#ef7fb0', '#f2f2f2'],
}

function drawGround(ctx, px, py, x, y) {
  ctx.fillStyle = C.grass
  ctx.fillRect(px, py, TILE, TILE)
  const h = hash2(x, y)
  if (h > 0.55) {
    ctx.fillStyle = C.grassD
    const ox = 2 + Math.floor(h * 9)
    const oy = 4 + Math.floor((h * 7) % 8)
    ctx.fillRect(px + ox, py + oy, 2, 3)
  }
  if (h > 0.9) {
    ctx.fillStyle = C.grassL
    ctx.fillRect(px + 3, py + 11, 3, 2)
  }
}

function drawTile(ctx, ch, px, py, x, y, tick) {
  drawGround(ctx, px, py, x, y)
  switch (ch) {
    case ',': {
      ctx.fillStyle = C.tall
      ctx.fillRect(px, py, TILE, TILE)
      const sway = Math.sin(tick / 320 + x * 0.6 + y * 0.3) * 1
      ctx.fillStyle = C.tallL
      for (let i = 0; i < 3; i += 1) {
        const bx = px + 3 + i * 4
        ctx.fillRect(bx + sway, py + 5, 2, 8)
        ctx.fillRect(bx - 1 + sway, py + 8, 4, 2)
      }
      ctx.fillStyle = '#25612b'
      ctx.fillRect(px, py + 13, TILE, 3)
      break
    }
    case ':': {
      ctx.fillStyle = C.path
      ctx.fillRect(px, py, TILE, TILE)
      const h = hash2(x + 7, y + 3)
      ctx.fillStyle = C.pathD
      ctx.fillRect(px + 2 + Math.floor(h * 8), py + 3 + Math.floor(h * 9), 2, 2)
      ctx.fillRect(px + 9, py + 11, 3, 2)
      break
    }
    case '~': {
      ctx.fillStyle = C.water
      ctx.fillRect(px, py, TILE, TILE)
      ctx.fillStyle = C.waterL
      const off = Math.round(Math.sin(tick / 420 + x) * 2)
      ctx.fillRect(px + 2 + off, py + 5, 6, 2)
      ctx.fillRect(px + 8 - off, py + 11, 5, 2)
      ctx.fillStyle = C.waterD
      ctx.fillRect(px, py + 14, TILE, 2)
      break
    }
    case '#': {
      ctx.fillStyle = C.trunk
      ctx.fillRect(px + 6, py + 10, 4, 6)
      ctx.fillStyle = C.leaf
      ctx.fillRect(px + 2, py + 1, 12, 10)
      ctx.fillRect(px + 4, py + 9, 8, 3)
      ctx.fillStyle = C.leafL
      ctx.fillRect(px + 3, py + 2, 5, 3)
      ctx.fillRect(px + 9, py + 5, 4, 3)
      break
    }
    case 'R': {
      ctx.fillStyle = C.roof
      ctx.fillRect(px, py, TILE, TILE)
      ctx.fillStyle = C.roofD
      ctx.fillRect(px, py + 12, TILE, 4)
      ctx.fillRect(px + 5, py, 2, 12)
      ctx.fillRect(px + 12, py, 2, 12)
      break
    }
    case 'W': {
      ctx.fillStyle = C.wall
      ctx.fillRect(px, py, TILE, TILE)
      ctx.fillStyle = C.wallD
      ctx.fillRect(px, py + 13, TILE, 3)
      ctx.fillStyle = '#6b88b8'
      ctx.fillRect(px + 3, py + 3, 6, 6)
      ctx.fillStyle = '#9fc0e8'
      ctx.fillRect(px + 4, py + 4, 4, 2)
      break
    }
    case 'D': {
      ctx.fillStyle = C.door
      ctx.fillRect(px + 1, py + 1, 14, 15)
      ctx.fillStyle = C.doorL
      ctx.fillRect(px + 3, py + 3, 10, 13)
      ctx.fillStyle = '#f2d05a'
      ctx.fillRect(px + 11, py + 9, 2, 2)
      break
    }
    case 'S': {
      ctx.fillStyle = C.trunk
      ctx.fillRect(px + 7, py + 9, 2, 7)
      ctx.fillStyle = '#a67c52'
      ctx.fillRect(px + 2, py + 2, 12, 8)
      ctx.fillStyle = '#f6efc8'
      ctx.fillRect(px + 4, py + 4, 8, 1)
      ctx.fillRect(px + 4, py + 6, 6, 1)
      break
    }
    case 'F': {
      const h = hash2(x, y)
      const color = C.flower[Math.floor(h * 3) % 3]
      ctx.fillStyle = color
      ctx.fillRect(px + 4, py + 5, 2, 2)
      ctx.fillRect(px + 10, py + 9, 2, 2)
      ctx.fillRect(px + 7, py + 11, 2, 2)
      break
    }
    case '=': {
      ctx.fillStyle = '#8a6238'
      ctx.fillRect(px, py + 6, TILE, 3)
      ctx.fillRect(px + 3, py, 2, 14)
      ctx.fillRect(px + 11, py, 2, 14)
      break
    }
    default:
      break
  }
}

export function drawWorld(ctx, cam, tick, player) {
  const x0 = Math.floor(cam.x / TILE)
  const y0 = Math.floor(cam.y / TILE)
  for (let ty = y0; ty <= y0 + VIEW_H + 1; ty += 1) {
    for (let tx = x0; tx <= x0 + VIEW_W + 1; tx += 1) {
      drawTile(ctx, charAt(tx, ty), Math.round(tx * TILE - cam.x), Math.round(ty * TILE - cam.y), tx, ty, tick)
    }
  }
  NPCS.forEach((n) => {
    drawPerson(ctx, Math.round(n.x * TILE - cam.x), Math.round(n.y * TILE - cam.y), 'down', 0, {
      hair: '#d8d8d8', shirt: '#4a9d5a', cap: null,
    })
  })
  drawPerson(ctx, Math.round(player.px - cam.x), Math.round(player.py - cam.y), player.dir, player.frame, {
    hair: '#3a2a22', shirt: '#3f7ad6', cap: '#e34b4b',
  })
}

// 16×16 的小人：帽子 / 脸 / 身子 / 两条腿，两帧交替做出走路感
export function drawPerson(ctx, px, py, dir, frame, look) {
  const skin = '#f2c9a0'
  const pants = '#27354f'
  const boot = '#1b2233'
  ctx.fillStyle = 'rgba(0,0,0,.25)'
  ctx.fillRect(px + 3, py + 15, 10, 2)

  const step = frame === 1 ? 1 : 0
  // 腿
  ctx.fillStyle = pants
  ctx.fillRect(px + 4, py + 11, 3, 3 + step)
  ctx.fillRect(px + 9, py + 11, 3, 4 - step)
  ctx.fillStyle = boot
  ctx.fillRect(px + 4, py + 14 + step, 3, 1)
  ctx.fillRect(px + 9, py + 14 - step + 1, 3, 1)

  // 身子
  ctx.fillStyle = look.shirt
  ctx.fillRect(px + 4, py + 8, 8, 4)
  // 手
  ctx.fillStyle = skin
  ctx.fillRect(px + 3, py + 8, 1, 3)
  ctx.fillRect(px + 12, py + 8, 1, 3)

  // 头
  ctx.fillStyle = skin
  ctx.fillRect(px + 4, py + 3, 8, 6)
  // 头发 / 帽子
  ctx.fillStyle = look.cap || look.hair
  ctx.fillRect(px + 3, py + 1, 10, 3)
  if (look.cap) {
    ctx.fillStyle = '#b93b3b'
    ctx.fillRect(px + 3, py + 3, 10, 1)
  } else {
    ctx.fillStyle = look.hair
    ctx.fillRect(px + 3, py + 4, 2, 2)
    ctx.fillRect(px + 11, py + 4, 2, 2)
  }

  // 眼睛跟着朝向走
  ctx.fillStyle = '#2a1d16'
  if (dir === 'down') {
    ctx.fillRect(px + 6, py + 6, 1, 2)
    ctx.fillRect(px + 9, py + 6, 1, 2)
  } else if (dir === 'left') {
    ctx.fillRect(px + 5, py + 6, 1, 2)
  } else if (dir === 'right') {
    ctx.fillRect(px + 10, py + 6, 1, 2)
  }
}
