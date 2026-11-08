// 内置对手：用一批知名仓库的公开快照离线生成对手精灵（不依赖网络，保证随时能打）
// 数值为 2026 年中的量级估计，仅用于对战演示；真实数据以扫描结果为准。

import { judge } from './engine.js'

const RIVALS = [
  {
    fullName: 'facebook/react', repo: 'react', platform: 'github',
    description: 'The library for web and native user interfaces.',
    topics: ['react', 'javascript', 'frontend', 'ui'],
    languages: [{ name: 'JavaScript', pct: 62 }, { name: 'TypeScript', pct: 30 }],
    rootFiles: ['packages', 'scripts', 'README.md', 'LICENSE', 'package.json', 'CHANGELOG.md', '.github', 'fixtures'],
    sizeKb: 38000, commits: 17800, ageMonths: 150, contributors: 1700, stars: 232000, forks: 47500,
    openIssues: 780, daysSincePush: 1, releaseCount: 42,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 12,
  },
  {
    fullName: 'vuejs/core', repo: 'core', platform: 'github',
    description: 'Vue.js is a progressive, incrementally-adoptable JavaScript framework for building UI on the web.',
    topics: ['vue', 'typescript', 'framework', 'frontend'],
    languages: [{ name: 'TypeScript', pct: 92 }, { name: 'JavaScript', pct: 6 }],
    rootFiles: ['packages', 'scripts', 'README.md', 'LICENSE', 'package.json', 'CHANGELOG.md', '.github', 'vitest.config.ts'],
    sizeKb: 21000, commits: 12400, ageMonths: 96, contributors: 620, stars: 51000, forks: 8900,
    openIssues: 640, daysSincePush: 2, releaseCount: 120,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 10,
  },
  {
    fullName: 'rust-lang/rust', repo: 'rust', platform: 'github',
    description: 'Empowering everyone to build reliable and efficient software.',
    topics: ['rust', 'compiler', 'systems-programming', 'language'],
    languages: [{ name: 'Rust', pct: 88 }, { name: 'Shell', pct: 6 }, { name: 'Python', pct: 4 }],
    rootFiles: ['compiler', 'library', 'src', 'tests', 'Cargo.toml', 'README.md', 'LICENSE-APACHE', '.github', 'triagebot.toml'],
    sizeKb: 420000, commits: 240000, ageMonths: 180, contributors: 5400, stars: 108000, forks: 14000,
    openIssues: 11000, daysSincePush: 0, releaseCount: 260,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 6,
  },
  {
    fullName: 'torvalds/linux', repo: 'linux', platform: 'github',
    description: 'Linux kernel source tree.',
    topics: ['linux', 'kernel', 'c', 'operating-system'],
    languages: [{ name: 'C', pct: 96 }, { name: 'Shell', pct: 2 }, { name: 'Makefile', pct: 1 }],
    rootFiles: ['arch', 'drivers', 'fs', 'include', 'kernel', 'Makefile', 'README', 'COPYING', 'scripts', 'tools'],
    sizeKb: 4600000, commits: 1200000, ageMonths: 200, contributors: 22000, stars: 196000, forks: 57000,
    openIssues: 0, daysSincePush: 1, releaseCount: 90,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'GPL-2.0', archived: false,
    aiRate: 3,
  },
  {
    fullName: 'pytorch/pytorch', repo: 'pytorch', platform: 'github',
    description: 'Tensors and Dynamic neural networks in Python with strong GPU acceleration.',
    topics: ['machine-learning', 'deep-learning', 'python', 'gpu', 'tensors'],
    languages: [{ name: 'Python', pct: 58 }, { name: 'C++', pct: 34 }, { name: 'CUDA', pct: 5 }],
    rootFiles: ['torch', 'aten', 'c10', 'test', 'setup.py', 'README.md', 'LICENSE', '.github', 'CMakeLists.txt'],
    sizeKb: 980000, commits: 92000, ageMonths: 120, contributors: 3200, stars: 88000, forks: 24000,
    openIssues: 14000, daysSincePush: 0, releaseCount: 70,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 14,
  },
  {
    fullName: 'denoland/deno', repo: 'deno', platform: 'github',
    description: 'A modern runtime for JavaScript and TypeScript.',
    topics: ['deno', 'rust', 'typescript', 'runtime', 'cli'],
    languages: [{ name: 'Rust', pct: 55 }, { name: 'TypeScript', pct: 40 }],
    rootFiles: ['cli', 'runtime', 'ext', 'Cargo.toml', 'README.md', 'LICENSE', '.github', 'tests'],
    sizeKb: 160000, commits: 14200, ageMonths: 78, contributors: 780, stars: 98000, forks: 5400,
    openIssues: 2100, daysSincePush: 0, releaseCount: 210,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 18,
  },
  {
    fullName: 'mrdoob/three.js', repo: 'three.js', platform: 'github',
    description: 'JavaScript 3D Library.',
    topics: ['javascript', 'webgl', 'graphics', '3d', 'renderer', 'game'],
    languages: [{ name: 'JavaScript', pct: 94 }, { name: 'GLSL', pct: 4 }],
    rootFiles: ['src', 'examples', 'build', 'docs', 'package.json', 'README.md', 'LICENSE', 'test'],
    sizeKb: 320000, commits: 44000, ageMonths: 168, contributors: 1800, stars: 104000, forks: 36000,
    openIssues: 780, daysSincePush: 1, releaseCount: 180,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 9,
  },
  {
    fullName: 'FFmpeg/FFmpeg', repo: 'FFmpeg', platform: 'github',
    description: 'Mirror of https://git.ffmpeg.org/ffmpeg.git — complete, cross-platform solution to record, convert and stream audio and video.',
    topics: ['ffmpeg', 'video', 'codec', 'c', 'multimedia'],
    languages: [{ name: 'C', pct: 91 }, { name: 'Assembly', pct: 6 }],
    rootFiles: ['libavcodec', 'libavformat', 'libavutil', 'fftools', 'configure', 'Makefile', 'README.md', 'LICENSE.md', 'tests'],
    sizeKb: 320000, commits: 118000, ageMonths: 190, contributors: 1800, stars: 48000, forks: 12000,
    openIssues: 0, daysSincePush: 3, releaseCount: 30,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'LGPL-2.1', archived: false,
    aiRate: 5,
  },
  {
    fullName: 'microsoft/vscode', repo: 'vscode', platform: 'github',
    description: 'Visual Studio Code — code editing, redefined.',
    topics: ['editor', 'typescript', 'electron', 'ide', 'webapp'],
    languages: [{ name: 'TypeScript', pct: 94 }, { name: 'CSS', pct: 3 }, { name: 'JavaScript', pct: 2 }],
    rootFiles: ['src', 'extensions', 'build', 'package.json', 'product.json', 'README.md', 'LICENSE.txt', '.github', 'test'],
    sizeKb: 460000, commits: 128000, ageMonths: 132, contributors: 2600, stars: 164000, forks: 29000,
    openIssues: 9200, daysSincePush: 0, releaseCount: 300,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 16,
  },
  {
    fullName: 'sindresorhus/is-odd', repo: 'is-odd', platform: 'github',
    description: 'Returns true if the given number is odd.',
    topics: ['javascript', 'util', 'number', 'cli'],
    languages: [{ name: 'JavaScript', pct: 100 }],
    rootFiles: ['index.js', 'package.json', 'README.md', 'LICENSE', 'test.js'],
    sizeKb: 40, commits: 60, ageMonths: 100, contributors: 8, stars: 6200, forks: 480,
    openIssues: 3, daysSincePush: 320, releaseCount: 12,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 30,
  },
  {
    fullName: 'jlevy/the-art-of-command-line', repo: 'the-art-of-command-line', platform: 'github',
    description: 'Master the command line, in one page. 命令行的艺术。',
    topics: ['documentation', 'command-line', 'shell', 'blog', 'cli'],
    languages: [{ name: 'Shell', pct: 40 }, { name: 'Makefile', pct: 20 }, { name: 'HTML', pct: 30 }],
    rootFiles: ['README.md', 'README-zh.md', 'LICENSE', 'assets'],
    sizeKb: 800, commits: 420, ageMonths: 100, contributors: 130, stars: 155000, forks: 14500,
    openIssues: 24, daysSincePush: 210, releaseCount: 0,
    hasTests: false, hasCI: false, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 8,
  },
  {
    fullName: 'gitee.com/dromara/hutool', repo: 'hutool', platform: 'gitee',
    description: '小而全的 Java 工具类库，使 Java 拥有函数式语言般的优雅。',
    topics: ['java', 'hutool', 'util', '工具'],
    languages: [{ name: 'Java', pct: 99 }],
    rootFiles: ['src', 'docs', 'pom.xml', 'README.md', 'LICENSE', 'CHANGELOG.md', '.gitee'],
    sizeKb: 60000, commits: 5600, ageMonths: 120, contributors: 260, stars: 9800, forks: 3200,
    openIssues: 120, daysSincePush: 4, releaseCount: 8,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MulanPSL-2.0', archived: false,
    aiRate: 18,
  },
  {
    fullName: 'golang/go', repo: 'go', platform: 'github',
    description: 'The Go programming language.',
    topics: ['go', 'golang', 'concurrency', 'compiler', 'language'],
    languages: [{ name: 'Go', pct: 92 }, { name: 'Assembly', pct: 4 }, { name: 'Shell', pct: 2 }],
    rootFiles: ['src', 'pkg', 'test', 'doc', 'api', 'go.mod', 'README.md', 'LICENSE', 'CONTRIBUTING.md'],
    sizeKb: 260000, commits: 58000, ageMonths: 170, contributors: 2600, stars: 128000, forks: 18000,
    openIssues: 9200, daysSincePush: 2, releaseCount: 60,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 6,
  },
  {
    fullName: 'spring-projects/spring-boot', repo: 'spring-boot', platform: 'github',
    description: 'Spring Boot helps you to create Spring-powered, production-grade applications.',
    topics: ['java', 'spring', 'framework', 'enterprise', 'web'],
    languages: [{ name: 'Java', pct: 96 }, { name: 'Kotlin', pct: 2 }],
    rootFiles: ['spring-boot-project', 'spring-boot-tests', 'build.gradle', 'README.md', 'LICENSE.txt', '.github', 'CONTRIBUTING.adoc'],
    sizeKb: 78000, commits: 42000, ageMonths: 150, contributors: 1200, stars: 78000, forks: 41000,
    openIssues: 680, daysSincePush: 1, releaseCount: 220,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 9,
  },
  {
    fullName: 'rails/rails', repo: 'rails', platform: 'github',
    description: 'Ruby on Rails — web application framework with a focus on developer happiness.',
    topics: ['ruby', 'rails', 'web', 'framework', 'mvc'],
    languages: [{ name: 'Ruby', pct: 94 }, { name: 'JavaScript', pct: 3 }],
    rootFiles: ['activerecord', 'actionpack', 'railties', 'Gemfile', 'README.md', 'MIT-LICENSE', '.github', 'guides'],
    sizeKb: 220000, commits: 98000, ageMonths: 190, contributors: 5200, stars: 56000, forks: 21000,
    openIssues: 420, daysSincePush: 1, releaseCount: 180,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 8,
  },
  {
    fullName: 'apple/swift', repo: 'swift', platform: 'github',
    description: 'The Swift Programming Language.',
    topics: ['swift', 'compiler', 'language', 'ios', 'mobile'],
    languages: [{ name: 'Swift', pct: 70 }, { name: 'C++', pct: 24 }],
    rootFiles: ['lib', 'stdlib', 'test', 'CMakeLists.txt', 'README.md', 'LICENSE.txt', 'utils', 'docs'],
    sizeKb: 460000, commits: 62000, ageMonths: 140, contributors: 1400, stars: 68000, forks: 10500,
    openIssues: 6200, daysSincePush: 0, releaseCount: 90,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 7,
  },
  {
    fullName: 'gitee.com/mirrors/vue', repo: 'vue', platform: 'gitee',
    description: 'Vue.js 渐进式 JavaScript 框架（Gitee 镜像）',
    topics: ['vue', 'javascript', 'frontend', 'framework'],
    languages: [{ name: 'JavaScript', pct: 78 }, { name: 'TypeScript', pct: 18 }],
    rootFiles: ['src', 'packages', 'test', 'package.json', 'README.md', 'LICENSE', 'build'],
    sizeKb: 26000, commits: 4200, ageMonths: 110, contributors: 240, stars: 8600, forks: 2600,
    openIssues: 60, daysSincePush: 12, releaseCount: 26,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 11,
  },
  {
    fullName: 'gitee.com/mirrors/redis', repo: 'redis', platform: 'gitee',
    description: 'Redis is an in-memory database that persists on disk.（Gitee 镜像）',
    topics: ['redis', 'database', 'c', 'cache', 'nosql'],
    languages: [{ name: 'C', pct: 88 }, { name: 'Tcl', pct: 6 }, { name: 'Shell', pct: 3 }],
    rootFiles: ['src', 'deps', 'tests', 'Makefile', 'README.md', 'LICENSE.txt', 'redis.conf', 'utils'],
    sizeKb: 110000, commits: 24000, ageMonths: 160, contributors: 720, stars: 12000, forks: 4200,
    openIssues: 320, daysSincePush: 6, releaseCount: 40,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 7,
  },
  {
    fullName: 'gitee.com/openharmony/docs', repo: 'docs', platform: 'gitee',
    description: 'OpenHarmony 开发者文档，面向全场景的分布式操作系统。',
    topics: ['documentation', 'openharmony', 'docs site', 'wiki'],
    languages: [{ name: 'Markdown', pct: 96 }, { name: 'HTML', pct: 3 }],
    rootFiles: ['zh-cn', 'en', 'README.md', 'LICENSE', 'docs', '_config.yml', 'website'],
    sizeKb: 120000, commits: 9800, ageMonths: 60, contributors: 460, stars: 2400, forks: 3800,
    openIssues: 140, daysSincePush: 3, releaseCount: 12,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 22,
  },
]

let cache = null

// 生成全部对手精灵（判定引擎是纯函数，结果稳定，缓存起来即可）
export function rivalPets() {
  if (cache) return cache
  cache = RIVALS.map((r) => {
    const snap = {
      ...r,
      url: r.platform === 'gitee' ? `https://gitee.com/${r.fullName.replace('gitee.com/', '')}` : `https://github.com/${r.fullName}`,
      watchers: Math.round(r.stars * 0.03),
      createdAt: new Date(Date.now() - r.ageMonths * 30.44 * 86400000).toISOString(),
      pushedAt: new Date(Date.now() - r.daysSincePush * 86400000).toISOString(),
      source: 'builtin',
    }
    const pet = judge(snap)
    return { ...pet, seed: pet.seed, isRival: true, battleLevel: pet.level }
  })
  return cache
}

const DIFFICULTY_TEXT = {
  easy: '新手',
  normal: '旗鼓相当',
  hard: '强敌',
}

// 依据玩家队伍的等级中位数挑选对手，保证「打得动」也「打得疼」
export function pickRivalTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal') {
  const pool = rivalPets()
  const levels = playerTeam.map((p) => Number(p.level) || 1)
  const mid = levels.length ? levels.sort((a, b) => a - b)[Math.floor(levels.length / 2)] : 200

  const factor = { easy: 0.55, normal: 1, hard: 1.8 }[difficulty] || 1
  const target = Math.max(1, mid * factor)
  const sorted = [...pool].sort((a, b) => Math.abs(a.level - target) - Math.abs(b.level - target))

  // 取最接近的 5 只，按种子稳定地挑 3 只
  const near = sorted.slice(0, 5)
  const picked = []
  let cursor = Math.abs(Math.floor(seed)) % near.length
  while (picked.length < 3 && picked.length < near.length) {
    picked.push(near[cursor % near.length])
    cursor += 1
  }
  return picked
}

export function rivalTeamLabel(difficulty) {
  return DIFFICULTY_TEXT[difficulty] || DIFFICULTY_TEXT.normal
}
