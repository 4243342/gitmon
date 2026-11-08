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

  // ---- 以下补足各属性的同族对手（同类型对战需要每个属性都有得挑） ----
  {
    fullName: 'django/django', repo: 'django', platform: 'github',
    description: 'The Web framework for perfectionists with deadlines.',
    topics: ['python', 'django', 'web', 'framework', 'orm'],
    languages: [{ name: 'Python', pct: 94 }, { name: 'JavaScript', pct: 3 }],
    rootFiles: ['django', 'docs', 'tests', 'setup.cfg', 'README.rst', 'LICENSE', '.github', 'pyproject.toml'],
    sizeKb: 220000, commits: 36000, ageMonths: 220, contributors: 2400, stars: 82000, forks: 32000,
    openIssues: 200, daysSincePush: 1, releaseCount: 400,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 8,
  },
  {
    fullName: 'numpy/numpy', repo: 'numpy', platform: 'github',
    description: 'The fundamental package for scientific computing with Python.',
    topics: ['python', 'numpy', 'scientific-computing', 'arrays', 'math'],
    languages: [{ name: 'Python', pct: 62 }, { name: 'C', pct: 34 }],
    rootFiles: ['numpy', 'doc', 'benchmarks', 'setup.py', 'meson.build', 'README.md', 'LICENSE.txt', '.github'],
    sizeKb: 60000, commits: 28000, ageMonths: 240, contributors: 1500, stars: 29000, forks: 10000,
    openIssues: 2100, daysSincePush: 1, releaseCount: 180,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 9,
  },
  {
    fullName: 'scikit-learn/scikit-learn', repo: 'scikit-learn', platform: 'github',
    description: 'scikit-learn: machine learning in Python.',
    topics: ['machine-learning', 'python', 'data-science', 'statistics', '模型'],
    languages: [{ name: 'Python', pct: 88 }, { name: 'Cython', pct: 9 }],
    rootFiles: ['sklearn', 'doc', 'examples', 'benchmarks', 'setup.py', 'README.rst', 'LICENSE', '.github'],
    sizeKb: 200000, commits: 30000, ageMonths: 240, contributors: 3200, stars: 62000, forks: 26000,
    openIssues: 2400, daysSincePush: 0, releaseCount: 120,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 12,
  },
  {
    fullName: 'BurntSushi/ripgrep', repo: 'ripgrep', platform: 'github',
    description: 'ripgrep recursively searches directories for a regex pattern.',
    topics: ['rust', 'cli', 'search', 'regex', 'tool'],
    languages: [{ name: 'Rust', pct: 96 }, { name: 'Shell', pct: 2 }],
    rootFiles: ['crates', 'tests', 'Cargo.toml', 'README.md', 'LICENSE-MIT', '.github', 'benchsuite'],
    sizeKb: 9000, commits: 1900, ageMonths: 120, contributors: 180, stars: 52000, forks: 2100,
    openIssues: 90, daysSincePush: 12, releaseCount: 60,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Unlicense', archived: false,
    aiRate: 7,
  },
  {
    fullName: 'tokio-rs/tokio', repo: 'tokio', platform: 'github',
    description: 'A runtime for writing reliable asynchronous applications with Rust.',
    topics: ['rust', 'async', 'runtime', 'concurrency', 'network'],
    languages: [{ name: 'Rust', pct: 98 }],
    rootFiles: ['tokio', 'tokio-util', 'tests', 'Cargo.toml', 'README.md', 'LICENSE', '.github'],
    sizeKb: 12000, commits: 4200, ageMonths: 96, contributors: 900, stars: 28000, forks: 2600,
    openIssues: 320, daysSincePush: 0, releaseCount: 100,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 11,
  },
  {
    fullName: 'curl/curl', repo: 'curl', platform: 'github',
    description: 'A command line tool and library for transferring data with URL syntax.',
    topics: ['c', 'http', 'network', 'curl', 'library'],
    languages: [{ name: 'C', pct: 82 }, { name: 'Perl', pct: 8 }, { name: 'Shell', pct: 5 }],
    rootFiles: ['lib', 'src', 'tests', 'docs', 'CMakeLists.txt', 'README.md', 'LICENSE.txt', '.github'],
    sizeKb: 90000, commits: 33000, ageMonths: 240, contributors: 3200, stars: 37000, forks: 6600,
    openIssues: 60, daysSincePush: 0, releaseCount: 220,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'curl', archived: false,
    aiRate: 4,
  },
  {
    fullName: 'sqlite/sqlite', repo: 'sqlite', platform: 'github',
    description: 'Official Git mirror of the SQLite source tree.',
    topics: ['c', 'database', 'sqlite', 'sql', 'embedded'],
    languages: [{ name: 'C', pct: 97 }, { name: 'Tcl', pct: 2 }],
    rootFiles: ['src', 'ext', 'test', 'tool', 'doc', 'Makefile.in', 'README.md', 'manifest.uuid'],
    sizeKb: 350000, commits: 26000, ageMonths: 240, contributors: 120, stars: 7200, forks: 1800,
    openIssues: 0, daysSincePush: 2, releaseCount: 300,
    hasTests: true, hasCI: false, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'Public-Domain', archived: false,
    aiRate: 3,
  },
  {
    fullName: 'kubernetes/kubernetes', repo: 'kubernetes', platform: 'github',
    description: 'Production-Grade Container Scheduling and Management.',
    topics: ['go', 'kubernetes', 'container', 'orchestration', 'cloud'],
    languages: [{ name: 'Go', pct: 94 }, { name: 'Shell', pct: 3 }],
    rootFiles: ['cmd', 'pkg', 'staging', 'test', 'hack', 'go.mod', 'README.md', 'LICENSE', '.github'],
    sizeKb: 900000, commits: 120000, ageMonths: 132, contributors: 4000, stars: 118000, forks: 41000,
    openIssues: 1900, daysSincePush: 0, releaseCount: 700,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 10,
  },
  {
    fullName: 'gin-gonic/gin', repo: 'gin', platform: 'github',
    description: 'Gin is a high-performance HTTP web framework written in Go.',
    topics: ['go', 'web', 'framework', 'http', 'router'],
    languages: [{ name: 'Go', pct: 99 }],
    rootFiles: ['binding', 'render', 'gin.go', 'go.mod', 'README.md', 'LICENSE', '.github', 'docs'],
    sizeKb: 5200, commits: 3800, ageMonths: 120, contributors: 700, stars: 82000, forks: 8200,
    openIssues: 700, daysSincePush: 3, releaseCount: 90,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 13,
  },
  {
    fullName: 'etcd-io/etcd', repo: 'etcd', platform: 'github',
    description: 'Distributed reliable key-value store for the most critical data.',
    topics: ['go', 'etcd', 'distributed', 'consensus', 'database'],
    languages: [{ name: 'Go', pct: 97 }, { name: 'Shell', pct: 2 }],
    rootFiles: ['server', 'client', 'tests', 'etcdctl', 'go.mod', 'README.md', 'LICENSE', '.github'],
    sizeKb: 60000, commits: 22000, ageMonths: 150, contributors: 900, stars: 50000, forks: 10000,
    openIssues: 240, daysSincePush: 1, releaseCount: 300,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 8,
  },
  {
    fullName: 'apache/kafka', repo: 'kafka', platform: 'github',
    description: 'Mirror of Apache Kafka — distributed event streaming platform.',
    topics: ['java', 'kafka', 'streaming', 'messaging', 'distributed'],
    languages: [{ name: 'Java', pct: 94 }, { name: 'Scala', pct: 4 }],
    rootFiles: ['clients', 'core', 'streams', 'connect', 'build.gradle', 'README.md', 'LICENSE', '.github'],
    sizeKb: 300000, commits: 15000, ageMonths: 180, contributors: 1200, stars: 30000, forks: 14000,
    openIssues: 1200, daysSincePush: 0, releaseCount: 400,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    aiRate: 9,
  },
  {
    fullName: 'elastic/elasticsearch', repo: 'elasticsearch', platform: 'github',
    description: 'Free and Open Source, Distributed, RESTful Search Engine.',
    topics: ['java', 'search', 'elasticsearch', 'lucene', 'database'],
    languages: [{ name: 'Java', pct: 92 }, { name: 'Groovy', pct: 3 }],
    rootFiles: ['server', 'client', 'plugins', 'modules', 'build.gradle', 'README.md', 'LICENSE.txt', '.ci'],
    sizeKb: 3000000, commits: 65000, ageMonths: 200, contributors: 2200, stars: 72000, forks: 25000,
    openIssues: 4500, daysSincePush: 0, releaseCount: 600,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'SSPL-1.0', archived: false,
    aiRate: 11,
  },
  {
    fullName: 'Homebrew/brew', repo: 'brew', platform: 'github',
    description: '🍺 The missing package manager for macOS (or Linux).',
    topics: ['ruby', 'macos', 'package-manager', 'homebrew', 'cli'],
    languages: [{ name: 'Ruby', pct: 96 }, { name: 'Shell', pct: 3 }],
    rootFiles: ['Library', 'bin', 'docs', 'manpages', 'README.md', 'LICENSE.txt', '.github'],
    sizeKb: 45000, commits: 40000, ageMonths: 160, contributors: 1300, stars: 44000, forks: 10000,
    openIssues: 40, daysSincePush: 0, releaseCount: 90,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'BSD-2-Clause', archived: false,
    aiRate: 14,
  },
  {
    fullName: 'laravel/laravel', repo: 'laravel', platform: 'github',
    description: 'Laravel is a web application framework with expressive, elegant syntax.',
    topics: ['php', 'laravel', 'web', 'framework', 'mvc'],
    languages: [{ name: 'PHP', pct: 80 }, { name: 'Blade', pct: 12 }],
    rootFiles: ['app', 'config', 'routes', 'resources', 'tests', 'composer.json', 'README.md', 'LICENSE.md'],
    sizeKb: 30000, commits: 10000, ageMonths: 160, contributors: 4000, stars: 79000, forks: 24000,
    openIssues: 30, daysSincePush: 2, releaseCount: 100,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 16,
  },
  {
    fullName: 'flutter/flutter', repo: 'flutter', platform: 'github',
    description: "Flutter makes it easy and fast to build beautiful apps for mobile and beyond.",
    topics: ['dart', 'flutter', 'mobile', 'ui', 'cross-platform'],
    languages: [{ name: 'Dart', pct: 74 }, { name: 'C++', pct: 18 }],
    rootFiles: ['packages', 'bin', 'dev', 'examples', 'engine', 'README.md', 'LICENSE', '.github'],
    sizeKb: 500000, commits: 55000, ageMonths: 120, contributors: 1500, stars: 172000, forks: 29000,
    openIssues: 12000, daysSincePush: 0, releaseCount: 200,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    aiRate: 12,
  },
  {
    fullName: 'ReactiveX/RxSwift', repo: 'RxSwift', platform: 'github',
    description: 'Reactive Programming in Swift.',
    topics: ['swift', 'ios', 'reactive', 'rx', 'mobile'],
    languages: [{ name: 'Swift', pct: 97 }],
    rootFiles: ['RxSwift', 'RxCocoa', 'Tests', 'Package.swift', 'README.md', 'LICENSE.md', '.github'],
    sizeKb: 8000, commits: 2100, ageMonths: 130, contributors: 300, stars: 24000, forks: 4100,
    openIssues: 40, daysSincePush: 20, releaseCount: 60,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    aiRate: 9,
  },
  {
    fullName: 'github/gitignore', repo: 'gitignore', platform: 'github',
    description: 'A collection of useful .gitignore templates.',
    topics: ['gitignore', 'templates', 'git', 'utility'],
    languages: [],
    rootFiles: ['Global', 'community', 'README.md', 'LICENSE', '.github'],
    sizeKb: 2000, commits: 3200, ageMonths: 200, contributors: 2000, stars: 168000, forks: 75000,
    openIssues: 60, daysSincePush: 5, releaseCount: 0,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'CC0-1.0', archived: false,
    aiRate: 5,
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

// 难度 = 对手六维的实打实倍率（在线对手不吃这套，按仓库真实实力打）
export const DIFFICULTY_FACTOR = { easy: 0.65, normal: 1, hard: 1.35 }

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))

// 战力总和：用来判断「这只对手大概几斤几两」
export function powerOf(pet) {
  return (pet?.stats || []).reduce((sum, s) => sum + (Number(s.value) || 0), 0)
}

// 按倍率缩放一只对手（等级同步缩放，界面上看到的强度就是实际强度）
export function scaleRival(pet, factor = 1) {
  const f = Number(factor) || 1
  if (f === 1) return { ...pet, scaled: 1 }
  return {
    ...pet,
    level: clampNum((Number(pet.level) || 1) * f, 1, 999),
    stats: (pet.stats || []).map((s) => ({ ...s, value: clampNum((Number(s.value) || 0) * f, 1, 99999) })),
    maxHp: clampNum((Number(pet.maxHp) || 100) * f, 1, 999999),
    combatPower: clampNum((Number(pet.combatPower) || 0) * f, 1, 999999),
    scaled: f,
  }
}

// 同属性对手池：主属性相同的排前面，副属性相同的补在后面
export function sameTypePool(elementKey) {
  const pool = rivalPets()
  if (!elementKey) return pool
  const primary = pool.filter((p) => p.element?.key === elementKey)
  const secondary = pool.filter((p) => p.element?.key !== elementKey && p.elementSecondary?.key === elementKey)
  return [...primary, ...secondary]
}

// 依据玩家队伍等级中位数，从池子里取「打得动、也打得疼」的几只
function drawNear(pool, playerTeam, count, seed) {
  if (!pool.length) return []
  const levels = playerTeam.map((p) => Number(p.level) || 1).sort((a, b) => a - b)
  const mid = levels.length ? levels[Math.floor(levels.length / 2)] : 200
  const sorted = [...pool].sort((a, b) => Math.abs(a.level - mid) - Math.abs(b.level - mid))

  const window = Math.min(sorted.length, Math.max(count + 2, count))
  const near = sorted.slice(0, window)
  const start = Math.abs(Math.floor(seed)) % near.length
  const picked = []
  for (let i = 0; i < Math.min(count, near.length); i++) picked.push(near[(start + i) % near.length])
  return picked
}

// 完全随机抽取
function drawRandom(pool, count, seed) {
  const arr = [...pool]
  let s = (Math.abs(Math.floor(seed)) || 1) >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}

function teamSize(playerTeam, cap = 3) {
  return Math.max(1, Math.min(cap, playerTeam.length || 1))
}

// 同类型对战：只找和你先发同属性的仓库，按难度缩放
export function pickSameTypeTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const lead = playerTeam[0]
  const key = lead?.element?.key
  const pool = sameTypePool(key)
  const picked = drawNear(pool, playerTeam, teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 随机宠物：全体随机，不看等级匹配
export function pickRandomTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const picked = drawRandom(rivalPets(), teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 兼容旧调用：等同「随机宠物」但按等级贴近挑选
export function pickRivalTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const picked = drawNear(rivalPets(), playerTeam, teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 内置快照命中（在线对手直接打内置数据，不耗网络）
export function matchBuiltinRival(platform, fullName) {
  if (!fullName) return null
  const target = `${platform === 'gitee' ? 'gitee.com/' : ''}${fullName}`.toLowerCase()
  return rivalPets().find((p) => String(p.fullName).toLowerCase() === target) || null
}

// 整仓：该账号在内置池里的全部项目（能凑出多只就离线打，不用联网）
export function matchBuiltinOwnerTeam(platform, owner) {
  if (!owner) return []
  const prefix = `${platform === 'gitee' ? 'gitee.com/' : ''}${owner}/`.toLowerCase()
  return rivalPets()
    .filter((p) => String(p.fullName).toLowerCase().startsWith(prefix))
    .sort((a, b) => b.level - a.level)
}

// 在线扫描结果 → 对手精灵
export function rivalFromSnapshot(snap) {
  const pet = judge(snap)
  return { ...pet, isRival: true, battleLevel: pet.level, source: snap.source || 'live' }
}

const MODE_TEXT = { online: '在线对手', same: '同类型', random: '随机宠物' }

export function modeLabel(mode) {
  return MODE_TEXT[mode] || MODE_TEXT.random
}

export function rivalTeamLabel(difficulty, mode = 'random', onlineSize = 'single') {
  if (mode === 'online') return `${MODE_TEXT.online} · ${onlineSize === 'team' ? '整仓' : '单项目'}`
  return `${MODE_TEXT[mode] || MODE_TEXT.random} · ${DIFFICULTY_TEXT[difficulty] || DIFFICULTY_TEXT.normal}`
}

export function onlineSizeLabel(size = 'single') {
  return size === 'team' ? '整仓' : '单项目'
}
