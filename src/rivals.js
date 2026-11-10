// 内置对手：用一批知名仓库的公开快照离线生成对手精灵（不依赖网络，保证随时能打）
// 前置手挑部分为量级估计；文件尾部的 tier 补全集为 GitHub 真实抓取数据，
// 覆盖 9 属性 × 4 个星级层，保证任意属性层都能凑出 3 只同层对手。

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
  // ---- tier 补全集：9 属性 × 4 层，每层 3 只（T1<1k / T2 1k–10k / T3 10k–50k / T4>50k 星）----
  // 元数据取自 GitHub 真实数据：stars/forks/issues/size/language 来自 Search API，
  // commits/releases/根目录来自仓库页面，contributors 取贡献者接口的精确总数。
  // hasCI 以根目录存在 .github / CI 配置文件推断，未逐仓校验 workflows。
  {
    fullName: 'davidjurgens/potato', repo: 'potato', platform: 'github',
    description: 'potato: the portable annotation tool',
    topics: ['agentic-ai', 'agentic-workflow', 'agents', 'annotation', 'annotation-tool'],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.github/workflows', 'demo', 'deployment/huggingface-spaces', 'docs', 'examples', 'node', 'potato', 'potato_trace', 'scripts', 'tests', '.dockerignore', '.gitignore'],
    sizeKb: 127939, commits: 1433, ageMonths: 79, contributors: 27, stars: 444, forks: 79,
    openIssues: 0, daysSincePush: 0, releaseCount: 34,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'GPL-3.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'lablup/backend.ai', repo: 'backend.ai', platform: 'github',
    description: 'Backend.AI is a streamlined, container-based computing cluster platform that hosts popular computing/ML frameworks and diverse programming languages, with plugg',
    topics: ['api', 'backendai', 'cloud-computing', 'containers', 'distributed-computing'],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.claude/skills', '.devcontainer', '.github', 'CHANGELOG', 'changes', 'configs', 'docker', 'docs', 'fixtures', 'glossary', 'plugins', 'proposals'],
    sizeKb: 893555, commits: 6758, ageMonths: 121, contributors: 99, stars: 679, forks: 185,
    openIssues: 529, daysSincePush: 0, releaseCount: 349,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'LGPL-3.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'UKGovernmentBEIS/inspect_evals', repo: 'inspect_evals', platform: 'github',
    description: 'Collection of evals for Inspect AI',
    topics: [],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.claude/skills', '.devin/workflows', '.github', '.vscode', 'adr', 'agent_artefacts', 'analysis', 'changelog.d', 'docs', 'internal', 'packages', 'register'],
    sizeKb: 324854, commits: 2951, ageMonths: 25, contributors: 227, stars: 736, forks: 479,
    openIssues: 269, daysSincePush: 0, releaseCount: 0,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'dr5hn/countries-states-cities-database', repo: 'countries-states-cities-database', platform: 'github',
    description: '🌍 Discover our global repository of countries, states, and cities!  🏙️ Get comprehensive data in JSON, SQL, PSQL, SQLSERVER, MONGODB, SQLITE, XML, YAML, and C',
    topics: ['cities', 'countries', 'country', 'csv', 'geographical-data'],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.claude', '.github', 'bin', 'contributions', 'csv', 'docs/releases', 'duckdb', 'geojson', 'json', 'migrations', 'parquet', 'prisma'],
    sizeKb: 7561433, commits: 1659, ageMonths: 100, contributors: 102, stars: 9987, forks: 3049,
    openIssues: 9, daysSincePush: 1, releaseCount: 142,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'ODbL-1.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'facebookresearch/pytorch3d', repo: 'pytorch3d', platform: 'github',
    description: 'PyTorch3D is FAIR\'s library of reusable components for deep learning with 3D data',
    topics: [],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.circleci', '.github', 'dev', 'docs', 'packaging', 'projects', 'pytorch3d', 'scripts', 'tests', 'website', '.clang-format', '.flake8'],
    sizeKb: 50844, commits: 1286, ageMonths: 85, contributors: 189, stars: 9995, forks: 1483,
    openIssues: 327, daysSincePush: 9, releaseCount: 20,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'GetBindu/Bindu', repo: 'Bindu', platform: 'github',
    description: 'Bindu: The identity, communication, and payments layer for AI agents.',
    topics: ['a2a', 'agent-communication', 'agent-orchestration', 'ai-agent', 'autonomous-agents'],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.agents', '.github', '.vscode', 'alembic', 'assets', 'bindu', 'bugs', 'docs', 'examples', 'gateway', 'i18n', 'inbox'],
    sizeKb: 49759, commits: 1524, ageMonths: 20, contributors: 78, stars: 9999, forks: 666,
    openIssues: 157, daysSincePush: 65, releaseCount: 19,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'airbytehq/airbyte', repo: 'airbyte', platform: 'github',
    description: 'Open-source data movement for ELT pipelines and AI agents — from APIs, databases & files to warehouses, lakes, and AI applications. Both self-hosted and Cloud.',
    topics: ['bigquery', 'change-data-capture', 'data', 'data-analysis', 'data-collection'],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.claude/skills/my-prs', '.dependabot', '.devcontainer', '.devin', '.github', 'airbyte-cdk', 'airbyte-ci/connectors/ci_credentials', 'airbyte-integrations', 'buildSrc', 'docker-images', 'docs', 'docusaurus'],
    sizeKb: 969238, commits: 56201, ageMonths: 75, contributors: 1262, stars: 22341, forks: 5443,
    openIssues: 2868, daysSincePush: 0, releaseCount: 419,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'stanfordnlp/dspy', repo: 'dspy', platform: 'github',
    description: 'DSPy: The framework for programming—not prompting—language models',
    topics: [],
    languages: [{ name: 'Python', pct: 100 }],
    rootFiles: ['.agents/skills/writing-release-notes', '.github', 'docs', 'dspy', 'scripts', 'tests', '.gitignore', '.pre-commit-config.yaml', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'SECURITY.md'],
    sizeKb: 187900, commits: 4856, ageMonths: 46, contributors: 485, stars: 38985, forks: 3496,
    openIssues: 774, daysSincePush: 0, releaseCount: 114,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'swimlane/ngx-graph', repo: 'ngx-graph', platform: 'github',
    description: 'Graph visualization library for angular',
    topics: ['angular', 'angular2', 'chart', 'dag', 'data-viz'],
    languages: [{ name: 'TypeScript', pct: 100 }],
    rootFiles: ['.cursor', '.github', '.vscode', 'e2e', 'projects/swimlane/ngx-graph', 'public', '.browserslistrc', '.codeclimate.yml', '.editorconfig', '.gitattributes', '.gitignore', '.prettierignore'],
    sizeKb: 50731, commits: 360, ageMonths: 117, contributors: 42, stars: 998, forks: 300,
    openIssues: 114, daysSincePush: 104, releaseCount: 0,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'fabiospampinato/vscode-todo-plus', repo: 'vscode-todo-plus', platform: 'github',
    description: 'Manage todo lists with ease. Powerful, easy to use and customizable.',
    topics: ['extension', 'task', 'taskpaper', 'tasks', 'todo'],
    languages: [{ name: 'TypeScript', pct: 100 }],
    rootFiles: ['resources', 'src', 'syntax', '.editorconfig', '.gitignore', '.todo', '.vscodeignore', 'changelog.md', 'license', 'package.json', 'readme.md', 'tsconfig.json'],
    sizeKb: 3735, commits: 408, ageMonths: 111, contributors: 19, stars: 999, forks: 239,
    openIssues: 106, daysSincePush: 115, releaseCount: 0,
    hasTests: false, hasCI: false, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'gooking/apifm-wxapi', repo: 'apifm-wxapi', platform: 'github',
    description: '微信小程序云开发工具包，借此工具包，你将无需投入服务器、无需接口编程、无需开发后台，将传统开发小程序效率提升百倍',
    topics: [],
    languages: [{ name: 'JavaScript', pct: 100 }],
    rootFiles: ['src', 'test', 'tools', '.babelrc', '.eslintrc.js', '.gitignore', '.npmignore', 'LICENSE', 'README.md', 'gulpfile.js', 'index.d.ts', 'instructions.md'],
    sizeKb: 262, commits: 239, ageMonths: 87, contributors: 3, stars: 999, forks: 169,
    openIssues: 0, daysSincePush: 8, releaseCount: 0,
    hasTests: true, hasCI: false, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'dataform-co/dataform', repo: 'dataform', platform: 'github',
    description: 'Dataform is a framework for managing SQL based data operations in BigQuery',
    topics: [],
    languages: [{ name: 'TypeScript', pct: 100 }],
    rootFiles: ['.github', 'cli', 'common', 'core', 'docs', 'eslint-rules', 'examples', 'packages', 'protos', 'scripts', 'sqlx', 'static'],
    sizeKb: 19275, commits: 2129, ageMonths: 98, contributors: 84, stars: 1000, forks: 209,
    openIssues: 105, daysSincePush: 0, releaseCount: 182,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'gitkraken/vscode-gitlens', repo: 'vscode-gitlens', platform: 'github',
    description: 'Supercharge Git inside VS Code and unlock untapped knowledge within each repository — Visualize code authorship at a glance via Git blame annotations and CodeLe',
    topics: ['git', 'github', 'vscode', 'vscode-extension'],
    languages: [{ name: 'TypeScript', pct: 100 }],
    rootFiles: ['.agents', '.augment', '.claude', '.devcontainer', '.github', '.husky', '.vscode', 'docs', 'images', 'l10n', 'packages', 'patches'],
    sizeKb: 224014, commits: 12737, ageMonths: 123, contributors: 147, stars: 9966, forks: 1829,
    openIssues: 916, daysSincePush: 0, releaseCount: 272,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'WebKit/WebKit', repo: 'WebKit', platform: 'github',
    description: 'Home of the WebKit project, the browser engine used by Safari, Mail, App Store and many other applications on macOS, iOS and Linux.',
    topics: ['browser', 'gtk', 'ios', 'javascript', 'macos'],
    languages: [{ name: 'JavaScript', pct: 100 }],
    rootFiles: ['.claude', '.codex', '.gemini', '.github', 'Configurations', 'JSTests', 'LayoutTests', 'ManualTests', 'PerformanceTests', 'Source', 'TestExpectations', 'Tools'],
    sizeKb: 13319736, commits: 326228, ageMonths: 71, contributors: 2694, stars: 10328, forks: 2330,
    openIssues: 3347, daysSincePush: 0, releaseCount: 0,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: false, license: null, archived: false,
    tier: 'T3',
  },
  {
    fullName: 'FreeTubeApp/FreeTube', repo: 'FreeTube', platform: 'github',
    description: 'An Open Source YouTube app for privacy',
    topics: ['freetube', 'privacy', 'subscriptions', 'video', 'videos'],
    languages: [{ name: 'Vue', pct: 100 }],
    rootFiles: ['.github', '.vscode', '_icons', '_scripts', 'src', 'static', '.editorconfig', '.gitignore', '.stylelintignore', '.whitesource', 'CONTRIBUTING.md', 'LICENSE'],
    sizeKb: 42936, commits: 11130, ageMonths: 104, contributors: 837, stars: 22395, forks: 1582,
    openIssues: 295, daysSincePush: 0, releaseCount: 75,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'AGPL-3.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'slidevjs/slidev', repo: 'slidev', platform: 'github',
    description: 'Presentation Slides for Developers',
    topics: ['markdown', 'presentation', 'slides', 'vite', 'vue'],
    languages: [{ name: 'TypeScript', pct: 100 }],
    rootFiles: ['.claude-plugin', '.github', '.vscode', 'assets', 'cypress', 'demo', 'docs', 'packages', 'patches', 'plans', 'scripts', 'skills'],
    sizeKb: 82177, commits: 3175, ageMonths: 67, contributors: 400, stars: 49412, forks: 2271,
    openIssues: 206, daysSincePush: 5, releaseCount: 436,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'wayle-rs/wayle', repo: 'wayle', platform: 'github',
    description: 'Wayland Elements -  A compositor agnostic shell with extensive customization',
    topics: ['bar', 'catppuccin', 'desktop', 'desktop-shell', 'gtk4'],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.cargo', '.github', 'assets', 'crates', 'docs', 'packaging', 'resources', 'scripts/ci', 'wayle', '.clippy.toml', '.gitignore', '.markdownlint.json'],
    sizeKb: 10440, commits: 544, ageMonths: 17, contributors: 25, stars: 997, forks: 98,
    openIssues: 182, daysSincePush: 8, releaseCount: 13,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'janreges/siteone-crawler', repo: 'siteone-crawler', platform: 'github',
    description: 'SiteOne Crawler is a cross-platform website crawler and analyzer for SEO, security, accessibility, and performance optimization—ideal for developers, DevOps, QA',
    topics: ['accessibility', 'analyzer', 'audit', 'cli', 'command-line'],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.githooks', '.github/workflows', 'docs', 'prompts', 'scripts', 'src', 'tests', 'tmp', '.gitignore', 'CHANGELOG.md', 'CLAUDE.md', 'Cargo.lock'],
    sizeKb: 59359, commits: 776, ageMonths: 37, contributors: 7, stars: 998, forks: 95,
    openIssues: 17, daysSincePush: 44, releaseCount: 17,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'git-bahn/git-graph', repo: 'git-graph', platform: 'github',
    description: 'Command line tool to show clear git graphs arranged for your branching model',
    topics: ['command-line', 'command-line-tool', 'git', 'git-flow', 'git-graph'],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.github/workflows', 'docs', 'src', '.gitignore', 'CHANGELOG.md', 'Cargo.lock', 'Cargo.toml', 'Justfile', 'LICENSE', 'README.md'],
    sizeKb: 289, commits: 242, ageMonths: 71, contributors: 15, stars: 998, forks: 58,
    openIssues: 17, daysSincePush: 6, releaseCount: 23,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'phiresky/ripgrep-all', repo: 'ripgrep-all', platform: 'github',
    description: 'rga: ripgrep, but also search in PDFs, E-Books, Office documents, zip, tar.gz, etc.',
    topics: [],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.cargo', '.github', '.vscode', 'ci', 'doc', 'exampledir', 'src', '.envrc', '.gitignore', '.typos.toml', 'CHANGELOG.md', 'Cargo.lock'],
    sizeKb: 9823, commits: 469, ageMonths: 89, contributors: 37, stars: 9924, forks: 225,
    openIssues: 81, daysSincePush: 54, releaseCount: 12,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'pkgxdev/pkgx', repo: 'pkgx', platform: 'github',
    description: 'Run Anything',
    topics: ['environment-manager', 'package-manager', 'package-runner'],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.github', 'crates', 'docker', 'docs', 'scripts', '.envrc', '.gitbook.yaml', '.gitignore', 'AGENTS.md', 'Cargo.lock', 'Cargo.toml', 'LICENSE.txt'],
    sizeKb: 2010, commits: 1332, ageMonths: 60, contributors: 64, stars: 9931, forks: 1391,
    openIssues: 33, daysSincePush: 1, releaseCount: 235,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'SeaQL/sea-orm', repo: 'sea-orm', platform: 'github',
    description: '🐚 A powerful relational ORM for Rust',
    topics: ['database', 'hacktoberfest', 'loco', 'mariadb', 'mysql'],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.github', 'build-tools', 'changelog', 'docs', 'examples', 'issues', 'sea-orm-arrow', 'sea-orm-cli', 'sea-orm-codegen', 'sea-orm-macros', 'sea-orm-migration', 'sea-orm-rocket'],
    sizeKb: 21481, commits: 3784, ageMonths: 69, contributors: 302, stars: 9955, forks: 748,
    openIssues: 223, daysSincePush: 0, releaseCount: 106,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'vercel-labs/agent-browser', repo: 'agent-browser', platform: 'github',
    description: 'Browser automation CLI for AI agents',
    topics: [],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.agents/skills/technical-writer', '.claude-plugin', '.github', '.husky', 'benchmarks', 'bin', 'cli', 'docker', 'docs', 'evals', 'examples', 'packages'],
    sizeKb: 31632, commits: 822, ageMonths: 10, contributors: 120, stars: 48601, forks: 3309,
    openIssues: 542, daysSincePush: 0, releaseCount: 121,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'bevyengine/bevy', repo: 'bevy', platform: 'github',
    description: 'A refreshingly simple data-driven game engine built in Rust',
    topics: ['bevy', 'game-development', 'game-engine', 'gamedev', 'open-source'],
    languages: [{ name: 'Rust', pct: 100 }],
    rootFiles: ['.cargo', '.github', '_release-content', 'assets', 'benches', 'constants', 'crates', 'docs-rs', 'docs-template', 'docs', 'errors', 'examples'],
    sizeKb: 181561, commits: 12545, ageMonths: 82, contributors: 1716, stars: 49654, forks: 5033,
    openIssues: 3538, daysSincePush: 0, releaseCount: 62,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'piotrnar/gocoin', repo: 'gocoin', platform: 'github',
    description: 'Full Bitcoin node and offline (cold) wallet written in Go (golang)',
    topics: ['bitcoin', 'bitcoin-node', 'bitcoin-wallet', 'blockchain', 'btc'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['client', 'lib', 'tools', 'wallet', 'website', '.gitignore', 'CLAUDE.md', 'LICENSE', 'README.md', 'changelog.txt', 'go.mod', 'todo.txt'],
    sizeKb: 21235, commits: 8036, ageMonths: 163, contributors: 9, stars: 997, forks: 224,
    openIssues: 8, daysSincePush: 0, releaseCount: 3,
    hasTests: false, hasCI: false, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'projectdiscovery/cdncheck', repo: 'cdncheck', platform: 'github',
    description: 'A utility to detect various technology for a given IP address.',
    topics: ['api', 'cdn', 'cli', 'cname', 'detection'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github', 'cmd', 'examples', 'generate', 'integration_tests', 'internal', '.gitignore', '.goreleaser.yaml', 'Dockerfile', 'LICENSE.md', 'Makefile', 'README.md'],
    sizeKb: 9409, commits: 828, ageMonths: 76, contributors: 33, stars: 998, forks: 140,
    openIssues: 1, daysSincePush: 0, releaseCount: 110,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'temporalio/sdk-go', repo: 'sdk-go', platform: 'github',
    description: 'Temporal Go SDK',
    topics: ['durable-execution', 'golang', 'open-source', 'orchestration', 'sdk-go'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github', 'activity', 'client', 'contrib', 'converter', 'interceptor', 'internal', 'internalbindings', 'log', 'mocks', 'temporal', 'temporalnexus'],
    sizeKb: 25311, commits: 2119, ageMonths: 85, contributors: 225, stars: 998, forks: 371,
    openIssues: 228, daysSincePush: 0, releaseCount: 122,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'liweiyi88/onedump', repo: 'onedump', platform: 'github',
    description: 'Effortless database administration tool',
    topics: ['backup', 'database-backup', 'dba', 'dump', 'file-sync'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github/workflows', 'binlog', 'cmd', 'config', 'docs', 'dumper', 'env', 'filesync', 'fileutil', 'handler', 'jobresult', 'notifier'],
    sizeKb: 9987, commits: 129, ageMonths: 50, contributors: 3, stars: 1000, forks: 73,
    openIssues: 9, daysSincePush: 11, releaseCount: 40,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'ThreeDotsLabs/watermill', repo: 'watermill', platform: 'github',
    description: 'Building event-driven applications the easy way in Go.',
    topics: ['cqrs', 'event-driven', 'event-sourcing', 'events', 'go'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github', '_examples', 'components', 'dev', 'docs', 'internal', 'message', 'pubsub', 'tools', '.gitignore', 'CONTRIBUTING.md', 'LICENSE'],
    sizeKb: 28206, commits: 520, ageMonths: 96, contributors: 92, stars: 9951, forks: 513,
    openIssues: 86, daysSincePush: 13, releaseCount: 55,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'lib/pq', repo: 'pq', platform: 'github',
    description: 'Go PostgreSQL driver for database/sql',
    topics: [],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github', 'auth/kerberos', 'hstore', 'internal', 'oid', 'pqerror', 'scram', 'testdata', '.gitattributes', '.gitignore', 'CHANGELOG.md', 'CONTRIBUTING.md'],
    sizeKb: 1313, commits: 854, ageMonths: 176, contributors: 173, stars: 9970, forks: 973,
    openIssues: 54, daysSincePush: 81, releaseCount: 27,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'prometheus-operator/prometheus-operator', repo: 'prometheus-operator', platform: 'github',
    description: 'Prometheus Operator creates/configures/manages Prometheus clusters atop Kubernetes',
    topics: ['hacktoberfest', 'kubernetes', 'monitoring', 'prometheus'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github', 'Documentation', 'cmd', 'contrib/kube-prometheus', 'example', 'helm', 'internal', 'jsonnet', 'pkg', 'scripts', 'test', '.custom-gcl.yaml'],
    sizeKb: 179992, commits: 9283, ageMonths: 122, contributors: 796, stars: 9993, forks: 3895,
    openIssues: 308, daysSincePush: 0, releaseCount: 175,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'containerd/containerd', repo: 'containerd', platform: 'github',
    description: 'An open and reliable container runtime',
    topics: ['cncf', 'containerd', 'containers', 'cri', 'docker'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', 'api', 'client', 'cluster', 'cmd', 'contrib', 'core', 'defaults', 'docs', 'integration', 'internal'],
    sizeKb: 143787, commits: 17600, ageMonths: 132, contributors: 829, stars: 21472, forks: 4198,
    openIssues: 549, daysSincePush: 0, releaseCount: 320,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'milvus-io/milvus', repo: 'milvus', platform: 'github',
    description: 'Milvus is a high-performance, cloud-native vector database built for scalable vector ANN search',
    topics: ['anns', 'cloud-native', 'diskann', 'distributed', 'embedding-database'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.github', 'build', 'ci/jenkins', 'client', 'cmd', 'configs', 'deployments', 'docs', 'githooks', 'internal', 'pkg', 'scripts'],
    sizeKb: 379256, commits: 26059, ageMonths: 86, contributors: 397, stars: 46621, forks: 4323,
    openIssues: 1470, daysSincePush: 0, releaseCount: 180,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'gogs/gogs', repo: 'gogs', platform: 'github',
    description: 'The painless way to host your own Git service',
    topics: ['docker', 'git', 'go', 'gogs', 'mysql'],
    languages: [{ name: 'Go', pct: 100 }],
    rootFiles: ['.agents/skills', '.claude', '.github', '.moon', 'cmd/gogs', 'conf', 'docker-next', 'docker', 'docs', 'internal', 'public', 'scripts'],
    sizeKb: 243437, commits: 6344, ageMonths: 153, contributors: 581, stars: 47926, forks: 5081,
    openIssues: 1030, daysSincePush: 0, releaseCount: 98,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: true,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'THU-DSP-LAB/ventus-gpgpu', repo: 'ventus-gpgpu', platform: 'github',
    description: 'GPGPU processor supporting RISCV-V extension, developed with Chisel HDL',
    topics: [],
    languages: [{ name: 'Scala', pct: 100 }],
    rootFiles: ['.config', '.github', 'dependencies', 'docs', 'scripts', 'sim-verilator-nocache', 'sim-verilator', 'ventus', '.gitignore', '.gitmodules', 'CHANGELOG.md', 'GPGPU_output_diff.py'],
    sizeKb: 40360, commits: 1072, ageMonths: 51, contributors: 21, stars: 971, forks: 136,
    openIssues: 21, daysSincePush: 15, releaseCount: 0,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MulanPSL-2.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'ghostdogpr/caliban', repo: 'caliban', platform: 'github',
    description: 'Functional GraphQL library for Scala',
    topics: ['functional-programming', 'graphql', 'graphql-client', 'graphql-server', 'scala'],
    languages: [{ name: 'Scala', pct: 100 }],
    rootFiles: ['.circleci', '.github', 'adapters', 'apollo-compatibility', 'benchmarks/src', 'client-laminext', 'client/src', 'codegen-sbt/src', 'codegen/src', 'core/src', 'docs', 'examples'],
    sizeKb: 19428, commits: 3035, ageMonths: 86, contributors: 160, stars: 994, forks: 261,
    openIssues: 28, daysSincePush: 0, releaseCount: 93,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'persian-calendar/persian-calendar', repo: 'persian-calendar', platform: 'github',
    description: 'Android Persian Calendar',
    topics: ['android-app', 'jetpack-compose', 'kotlin', 'kotlin-android', 'persian-calendar'],
    languages: [{ name: 'Kotlin', pct: 100 }],
    rootFiles: ['.github', '.idea', 'PersianCalendar', 'assets', 'desktop', 'gradle', 'gradlePlugins', 'ios', 'libs', 'lintChecks', 'shared', 'wear'],
    sizeKb: 57528, commits: 13462, ageMonths: 176, contributors: 91, stars: 995, forks: 214,
    openIssues: 212, daysSincePush: 0, releaseCount: 115,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: false, license: 'GPL-3.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'elipsitz/gamebub', repo: 'gamebub', platform: 'github',
    description: 'Open-source FPGA retro emulation handheld',
    topics: [],
    languages: [{ name: 'Scala', pct: 100 }],
    rootFiles: ['.github', 'assets', 'firmware', 'fpga', 'scripts', '.gitignore', '.gitmodules', 'CONTRIBUTING.md', 'LICENSE-CERN-OHL-S', 'LICENSE-GPL-V3', 'README.md'],
    sizeKb: 12494, commits: 1500, ageMonths: 43, contributors: 3, stars: 1000, forks: 85,
    openIssues: 52, daysSincePush: 8, releaseCount: 6,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'CERN-OHL-S-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'OpenFeign/feign', repo: 'feign', platform: 'github',
    description: 'Feign makes writing java http clients easier',
    topics: ['http-client', 'interface', 'java', 'jax-rs', 'okhttp3'],
    languages: [{ name: 'Java', pct: 100 }],
    rootFiles: ['.circleci', '.github', '.mvn', 'annotation-error-decoder', 'apt-test-generator', 'benchmark', 'codequality', 'core', 'dropwizard-metrics4', 'dropwizard-metrics5', 'example-github-with-coroutine', 'example-github'],
    sizeKb: 13116, commits: 3587, ageMonths: 160, contributors: 348, stars: 9798, forks: 1951,
    openIssues: 196, daysSincePush: 0, releaseCount: 55,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: false, license: 'Apache-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'spinnaker/spinnaker', repo: 'spinnaker', platform: 'github',
    description: 'Spinnaker is an open source, multi-cloud continuous delivery platform for releasing software changes with high velocity and confidence.',
    topics: ['continuous-delivery', 'continuous-deployment', 'spinnaker'],
    languages: [{ name: 'Java', pct: 100 }],
    rootFiles: ['.github', '.run', 'clouddriver', 'deck', 'echo', 'examples', 'fiat', 'front50', 'gate', 'gradle/wrapper', 'igor', 'kayenta'],
    sizeKb: 206770, commits: 51186, ageMonths: 148, contributors: 985, stars: 9815, forks: 1283,
    openIssues: 103, daysSincePush: 0, releaseCount: 47,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'ReactiveX/RxJava', repo: 'RxJava', platform: 'github',
    description: 'RxJava – Reactive Extensions for the JVM – a library for composing asynchronous and event-based programs using observable sequences for the Java VM.',
    topics: ['flow', 'java', 'reactive-streams', 'rxjava'],
    languages: [{ name: 'Java', pct: 100 }],
    rootFiles: ['.github', 'config', 'docs', 'gradle', 'src', '.gitattributes', '.gitignore', 'CONTRIBUTING.md', 'COPYRIGHT', 'DESIGN.md', 'LICENSE', 'README.md'],
    sizeKb: 180194, commits: 6633, ageMonths: 166, contributors: 353, stars: 48154, forks: 7571,
    openIssues: 13, daysSincePush: 1, releaseCount: 267,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'jeecgboot/JeecgBoot', repo: 'JeecgBoot', platform: 'github',
    description: '【AI 时代的业务系统基座】企业级 AI 低代码平台：权限、多租户、工作流、报表、大屏、AI 知识库等通用能力开箱即用，AI 只需生成业务差异部分。AI Skills 一句话生成完整系统——建表、前后端代码、菜单权限、BPM 流程、表单、报表、大屏全自动。内置 AI 应用平台（聊天、知识库、流程编排、MCP），兼容主流',
    topics: ['activiti', 'agent', 'ai', 'antd', 'claude-code'],
    languages: [{ name: 'Java', pct: 100 }],
    rootFiles: ['.github', 'jeecg-boot', 'jeecgboot-vue3', '.gitattributes', '.gitignore', 'LICENSE', 'README-AI.md', 'README.en-US.md', 'README.ja-JP.md', 'README.md', 'check_jeecgenv.py', 'docker-compose-cloud.yml'],
    sizeKb: 103233, commits: 2424, ageMonths: 95, contributors: 40, stars: 48414, forks: 16213,
    openIssues: 6, daysSincePush: 5, releaseCount: 67,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'NationalSecurityAgency/ghidra', repo: 'ghidra', platform: 'github',
    description: 'Ghidra is a software reverse engineering (SRE) framework',
    topics: ['disassembler', 'reverse-engineering', 'software-analysis'],
    languages: [{ name: 'Java', pct: 100 }],
    rootFiles: ['.github', 'GPL', 'Ghidra', 'GhidraBuild', 'GhidraDocs', 'docker', 'eclipse', 'gradle', 'licenses', '.gitattributes', '.gitignore', 'CONTRIBUTING.md'],
    sizeKb: 417982, commits: 19076, ageMonths: 92, contributors: 488, stars: 99132, forks: 11255,
    openIssues: 2198, daysSincePush: 0, releaseCount: 57,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T4',
  },
  {
    fullName: 'matsumotory/ngx_mruby', repo: 'ngx_mruby', platform: 'github',
    description: 'ngx_mruby - A Fast and Memory-Efficient Web Server Extension Mechanism Using Scripting Language mruby for nginx',
    topics: ['mruby', 'nginx', 'ngx-mruby'],
    languages: [{ name: 'C', pct: 100 }],
    rootFiles: ['.github', '.vscode', 'dependence/ngx_devel_kit', 'docker', 'docs', 'example', 'misc', 'mrbgems', 'mruby', 'src', 'test', '.clang-format'],
    sizeKb: 19752, commits: 2423, ageMonths: 174, contributors: 67, stars: 997, forks: 115,
    openIssues: 3, daysSincePush: 0, releaseCount: 75,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'daos-stack/daos', repo: 'daos', platform: 'github',
    description: 'DAOS Storage Stack (client libraries, storage engine, control plane)',
    topics: ['daos', 'distributed-storage', 'hyperconverged', 'hyperscale', 'kvstore'],
    languages: [{ name: 'C', pct: 100 }],
    rootFiles: ['.github', 'ci', 'deps', 'design', 'docs', 'site_scons', 'src', 'utils', '.clang-format', '.clang-format-ignore', '.dockerignore', '.flake8'],
    sizeKb: 203475, commits: 12365, ageMonths: 121, contributors: 148, stars: 998, forks: 363,
    openIssues: 683, daysSincePush: 0, releaseCount: 115,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'sdatkinson/NeuralAmpModelerCore', repo: 'NeuralAmpModelerCore', platform: 'github',
    description: 'Core DSP library for NAM plugins',
    topics: [],
    languages: [{ name: 'C++', pct: 100 }],
    rootFiles: ['.github/workflows', 'Dependencies', 'NAM', 'build', 'build_inline', 'docs', 'example_audio', 'example_models', 'media', 'tools', '.clang-format', '.gitignore'],
    sizeKb: 1995, commits: 183, ageMonths: 44, contributors: 17, stars: 999, forks: 190,
    openIssues: 44, daysSincePush: 40, releaseCount: 12,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'gpg/gnupg', repo: 'gnupg', platform: 'github',
    description: 'The GNU Privacy Guard. NOTE: Maintainers are not tracking this mirror. Do not make pull requests here, nor comment any commits, submit them usual way to bug tra',
    topics: ['openpgp'],
    languages: [{ name: 'C', pct: 100 }],
    rootFiles: ['agent', 'am', 'artwork', 'build-aux', 'common', 'dirmngr', 'doc', 'g10', 'g13', 'kbx', 'm4', 'po'],
    sizeKb: 122054, commits: 11318, ageMonths: 134, contributors: 124, stars: 1000, forks: 219,
    openIssues: 2, daysSincePush: 0, releaseCount: 0,
    hasTests: true, hasCI: false, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: false, hasLicense: false, license: 'GPL-3.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'cocos/cocos-engine', repo: 'cocos-engine', platform: 'github',
    description: 'Cocos simplifies game creation and distribution with Cocos Creator, a free, open-source, cross-platform game engine. Empowering millions of developers to create',
    topics: ['3d', 'cocos', 'cocoscreator', 'engine', 'game-development'],
    languages: [{ name: 'C++', pct: 100 }],
    rootFiles: ['.circleci', '.github', '.idea', '.vscode', '@types', 'cocos', 'docs', 'editor', 'exports', 'extensions/ccpool', 'external', 'licenses'],
    sizeKb: 363796, commits: 22342, ageMonths: 131, contributors: 225, stars: 9913, forks: 2146,
    openIssues: 1012, daysSincePush: 13, releaseCount: 4,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'diasurgical/DevilutionX', repo: 'DevilutionX', platform: 'github',
    description: 'Diablo build for modern operating systems',
    topics: ['debian', 'devilution', 'diablo', 'game', 'hacktober'],
    languages: [{ name: 'C++', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', '3rdParty', 'CMake', 'Packaging', 'Source', 'Translations', 'android-project', 'assets', 'docs', 'mods/hf', 'test'],
    sizeKb: 97260, commits: 12140, ageMonths: 99, contributors: 295, stars: 9995, forks: 1090,
    openIssues: 486, daysSincePush: 1, releaseCount: 22,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'microsoft/PowerToys', repo: 'PowerToys', platform: 'github',
    description: 'Microsoft PowerToys is a collection of utilities that supercharge productivity and customization on Windows',
    topics: ['advanced-paste', 'color-picker', 'command-palette', 'desktop', 'fancyzones'],
    languages: [{ name: 'C', pct: 100 }],
    rootFiles: ['.claude', '.config', '.github', '.pipelines', '.vscode', 'deps', 'doc', 'installer', 'src', 'tools', '.gitattributes', '.gitignore'],
    sizeKb: 594749, commits: 9985, ageMonths: 90, contributors: 704, stars: 140792, forks: 8721,
    openIssues: 8056, daysSincePush: 0, releaseCount: 140,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T4',
  },
  {
    fullName: 'Genymobile/scrcpy', repo: 'scrcpy', platform: 'github',
    description: 'Display and control your Android device',
    topics: ['android', 'c', 'ffmpeg', 'genyteam-system', 'libav'],
    languages: [{ name: 'C', pct: 100 }],
    rootFiles: ['.github', 'app', 'assets', 'config', 'doc', 'gradle/wrapper', 'release', 'server', '.gitignore', 'FAQ.md', 'LICENSE', 'README.md'],
    sizeKb: 9304, commits: 3210, ageMonths: 108, contributors: 186, stars: 154445, forks: 14175,
    openIssues: 2946, daysSincePush: 0, releaseCount: 54,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T4',
  },
  {
    fullName: 'soto-project/soto', repo: 'soto', platform: 'github',
    description: 'Swift SDK for AWS that works on Linux, macOS and iOS',
    topics: ['aws', 'aws-sdk', 'aws-sdk-swift', 'server-side-swift', 'swift'],
    languages: [{ name: 'Swift', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', 'IntegrationTests', 'Sources/Soto', 'docker', 'scripts', '.aws-model-hash', '.gitignore', '.mailmap', '.swift-format', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'],
    sizeKb: 524504, commits: 1148, ageMonths: 116, contributors: 14, stars: 998, forks: 94,
    openIssues: 8, daysSincePush: 1, releaseCount: 120,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'SwiftfulThinking/SwiftfulRouting', repo: 'SwiftfulRouting', platform: 'github',
    description: 'Programmatic navigation for SwiftUI applications.',
    topics: ['ios', 'swift', 'swiftui'],
    languages: [{ name: 'Swift', pct: 100 }],
    rootFiles: ['.claude', '.swiftpm/xcode/package.xcworkspace/xcshareddata', 'Sources/SwiftfulRouting', 'Tests/SwiftfulRoutingTests', '.gitignore', 'LICENSE', 'Package.resolved', 'Package.swift', 'README.md'],
    sizeKb: 332, commits: 185, ageMonths: 54, contributors: 5, stars: 998, forks: 74,
    openIssues: 6, daysSincePush: 103, releaseCount: 31,
    hasTests: true, hasCI: false, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'Mcrich23/Container-Compose', repo: 'Container-Compose', platform: 'github',
    description: 'A docker-compose like tool for Apple Container',
    topics: [],
    languages: [{ name: 'Swift', pct: 100 }],
    rootFiles: ['.github', '.swiftpm/xcode/xcshareddata/xcschemes', 'Sample Compose Files/Healthchecked Redis', 'Sources', 'Tests', '.gitattributes', '.gitignore', 'CONTRIBUTING.md', 'LICENSE', 'Makefile', 'Package.resolved', 'Package.swift'],
    sizeKb: 421, commits: 127, ageMonths: 17, contributors: 23, stars: 999, forks: 61,
    openIssues: 41, daysSincePush: 45, releaseCount: 17,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'lollipopkit/flutter_server_box', repo: 'flutter_server_box', platform: 'github',
    description: 'ServerBox - high performance server toolbox app & server written in Flutter & Rust.',
    topics: ['ai-agents', 'android', 'dart', 'docker', 'flutter'],
    languages: [{ name: 'Dart', pct: 100 }],
    rootFiles: ['.claude/skills', '.github', 'android', 'assets', 'crates', 'docs', 'fastlane/metadata/android', 'hook', 'integration_test', 'ios', 'lib', 'linux'],
    sizeKb: 62447, commits: 1914, ageMonths: 62, contributors: 47, stars: 8963, forks: 577,
    openIssues: 26, daysSincePush: 1, releaseCount: 59,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'AGPL-3.0', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'Anxcye/anx-reader', repo: 'anx-reader', platform: 'github',
    description: 'Featuring powerful AI capabilities and supporting various e-book formats, it makes reading smarter and more focused.',
    topics: ['dart', 'ebook-reader', 'flutter'],
    languages: [{ name: 'Dart', pct: 100 }],
    rootFiles: ['.github', 'android', 'assets', 'docs', 'fastlane/metadata/android', 'ios', 'lib', 'linux', 'macos', 'ohos', 'scripts', 'test'],
    sizeKb: 145344, commits: 2416, ageMonths: 31, contributors: 35, stars: 9222, forks: 675,
    openIssues: 101, daysSincePush: 24, releaseCount: 112,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'firebase/flutterfire', repo: 'flutterfire', platform: 'github',
    description: '🔥 A collection of Firebase plugins for Flutter apps.',
    topics: ['dart', 'firebase', 'flutter', 'google'],
    languages: [{ name: 'Dart', pct: 100 }],
    rootFiles: ['.agent/rules', '.gemini', '.github', '.opensource', '.vscode', 'docs', 'packages', 'scripts', 'tests', '.clang-format', '.editorconfig', '.gitignore'],
    sizeKb: 75700, commits: 4592, ageMonths: 87, contributors: 635, stars: 9269, forks: 4128,
    openIssues: 109, daysSincePush: 0, releaseCount: 6,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'exelban/stats', repo: 'stats', platform: 'github',
    description: 'macOS system monitor in your menu bar',
    topics: ['battery', 'bluetooth', 'clock', 'cpu', 'disk'],
    languages: [{ name: 'Swift', pct: 100 }],
    rootFiles: ['.github', 'Kit', 'LaunchAtLogin', 'Modules', 'SMC', 'Stats.xcodeproj', 'Stats', 'Tests', 'Widgets', '.gitignore', '.swiftlint.yml', 'LICENSE'],
    sizeKb: 61250, commits: 2550, ageMonths: 89, contributors: 195, stars: 43268, forks: 1622,
    openIssues: 22, daysSincePush: 0, releaseCount: 363,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'iina/iina', repo: 'iina', platform: 'github',
    description: 'The modern video player for macOS.',
    topics: ['hacktoberfest', 'macos', 'mpv', 'swift', 'video'],
    languages: [{ name: 'Swift', pct: 100 }],
    rootFiles: ['.github', 'Configs', 'OpenInIINA', 'browser', 'deps/include', 'iina-cli', 'iina-plugin', 'iina.xcodeproj', 'iina', 'other', '.editorconfig', '.gitignore'],
    sizeKb: 252333, commits: 4372, ageMonths: 119, contributors: 211, stars: 47071, forks: 2989,
    openIssues: 1988, daysSincePush: 0, releaseCount: 55,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'GPL-3.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'apple/container', repo: 'container', platform: 'github',
    description: 'A tool for creating and running Linux containers using lightweight virtual machines on a Mac. It is written in Swift, and optimized for Apple silicon.',
    topics: [],
    languages: [{ name: 'Swift', pct: 100 }],
    rootFiles: ['.claude-plugin', '.github', 'Sources', 'Tests', 'assets', 'cluster-shim', 'docs', 'scripts', 'signing', 'skills', '.gitignore', '.spi.yml'],
    sizeKb: 10612, commits: 832, ageMonths: 17, contributors: 129, stars: 51122, forks: 1811,
    openIssues: 593, daysSincePush: 0, releaseCount: 27,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T4',
  },
  {
    fullName: 'heroku/heroku-buildpack-python', repo: 'heroku-buildpack-python', platform: 'github',
    description: 'Heroku\'s classic buildpack for Python apps',
    topics: ['buildpack', 'heroku', 'heroku-languages', 'python'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.github', 'bin', 'builds', 'etc', 'lib', 'requirements', 'spec', 'vendor', '.editorconfig', '.gitignore', '.rubocop.yml', '.shellcheckrc'],
    sizeKb: 59119, commits: 2947, ageMonths: 186, contributors: 103, stars: 993, forks: 1809,
    openIssues: 13, daysSincePush: 0, releaseCount: 103,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'thuss/standalone-migrations', repo: 'standalone-migrations', platform: 'github',
    description: 'A gem to use Rails Database Migrations in non Rails projects',
    topics: [],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.github/workflows', 'example', 'lib', 'spec', 'vendor/migration_helpers', '.gitignore', '.rspec', 'Gemfile', 'LICENSE', 'README.markdown', 'Rakefile', 'VERSION'],
    sizeKb: 766, commits: 549, ageMonths: 215, contributors: 58, stars: 994, forks: 147,
    openIssues: 14, daysSincePush: 63, releaseCount: 0,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'stripe-ruby-mock/stripe-ruby-mock', repo: 'stripe-ruby-mock', platform: 'github',
    description: 'A mocking library for testing stripe ruby',
    topics: [],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.github/workflows', 'bin', 'gemfiles', 'lib', 'spec', '.env', '.gitignore', '.rspec', 'Appraisals', 'CHANGELOG.md', 'Gemfile', 'LICENSE.txt'],
    sizeKb: 1710, commits: 1380, ageMonths: 162, contributors: 234, stars: 998, forks: 735,
    openIssues: 201, daysSincePush: 62, releaseCount: 6,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'ankane/ruby-polars', repo: 'ruby-polars', platform: 'github',
    description: 'Blazingly fast DataFrames for Ruby',
    topics: [],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.github/workflows', 'ext/polars', 'lib', 'test', '.gitignore', '.yardopts', 'CHANGELOG.md', 'Cargo.lock', 'Cargo.toml', 'Gemfile', 'LICENSE.txt', 'README.md'],
    sizeKb: 5844, commits: 2578, ageMonths: 48, contributors: 16, stars: 1000, forks: 49,
    openIssues: 1, daysSincePush: 2, releaseCount: 0,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'resque/resque', repo: 'resque', platform: 'github',
    description: 'Resque is a Redis-backed Ruby library for creating background jobs, placing them on multiple queues, and processing them later.',
    topics: ['asynchronous-tasks', 'asynctask', 'background-jobs', 'background-service', 'background-worker'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', 'bin', 'docs', 'examples', 'lib', 'log', 'test', '.gitignore', '.kick', '.rubocop.yml', '.simplecov'],
    sizeKb: 2807, commits: 1885, ageMonths: 207, contributors: 323, stars: 9467, forks: 1661,
    openIssues: 72, daysSincePush: 8, releaseCount: 16,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'activeadmin/activeadmin', repo: 'activeadmin', platform: 'github',
    description: 'The administration framework for Ruby on Rails applications.',
    topics: ['activeadmin', 'admin-ui', 'arbre', 'rails', 'ruby'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.github', 'app', 'bin', 'config', 'docs', 'features', 'gemfiles', 'lib', 'spec', 'tasks', 'vendor/javascript', '.gherkin-lintrc'],
    sizeKb: 16862, commits: 9027, ageMonths: 199, contributors: 810, stars: 9713, forks: 3318,
    openIssues: 41, daysSincePush: 8, releaseCount: 76,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'wpscanteam/wpscan', repo: 'wpscan', platform: 'github',
    description: 'WPScan WordPress security scanner. Written for security professionals and blog maintainers to test the security of their WordPress websites. Contact us via cont',
    topics: ['hacking-tool', 'scan', 'scanner', 'security', 'security-scanner'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.github', '.qlty', 'app', 'bin', 'lib', 'spec', '.dockerignore', '.gitignore', '.rspec', '.rubocop.yml', '.ruby-gemset', '.ruby-version'],
    sizeKb: 59930, commits: 3424, ageMonths: 172, contributors: 72, stars: 9843, forks: 1346,
    openIssues: 1, daysSincePush: 3, releaseCount: 70,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'chatwoot/chatwoot', repo: 'chatwoot', platform: 'github',
    description: 'Open-source live-chat, email support, omni-channel desk. An alternative to Intercom, Zendesk, Salesforce Service Cloud etc. 🔥💬',
    topics: ['actioncable', 'chat-widget', 'conversation', 'customer-support', 'dashboard'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.circleci', '.dependabot', '.devcontainer', '.github', '.husky', '.qlty', '.vscode', '.windsurf/rules', '__mocks__', 'app', 'bin', 'clevercloud'],
    sizeKb: 307099, commits: 7104, ageMonths: 87, contributors: 409, stars: 39525, forks: 9597,
    openIssues: 1588, daysSincePush: 0, releaseCount: 153,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: false, license: 'NOASSERTION', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'fastlane/fastlane', repo: 'fastlane', platform: 'github',
    description: '🚀 The easiest way to automate building and releasing your iOS and Android apps',
    topics: ['android', 'apps', 'automation', 'deployment', 'fastlane'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.bundle', '.github', 'bin', 'cert', 'credentials_manager', 'deliver', 'docs', 'fastlane', 'fastlane_core', 'frameit', 'gym', 'internal'],
    sizeKb: 86909, commits: 17217, ageMonths: 143, contributors: 1706, stars: 42371, forks: 6054,
    openIssues: 667, daysSincePush: 0, releaseCount: 574,
    hasTests: true, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'mastodon/mastodon', repo: 'mastodon', platform: 'github',
    description: 'Your self-hosted, globally interconnected microblogging community',
    topics: ['activity-stream', 'activitypub', 'docker', 'fediverse', 'mastodon'],
    languages: [{ name: 'Ruby', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', '.husky', '.rubocop', '.storybook', '.yarn', 'app', 'bin', 'chart', 'config', 'db', 'dist'],
    sizeKb: 472353, commits: 23015, ageMonths: 129, contributors: 1132, stars: 50500, forks: 7541,
    openIssues: 4625, daysSincePush: 0, releaseCount: 382,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: false, hasLicense: false, license: 'AGPL-3.0', archived: false,
    tier: 'T4',
  },
  {
    fullName: 'termux-user-repository/tur', repo: 'tur', platform: 'github',
    description: 'A place for all types of Termux packages.',
    topics: ['android', 'termux'],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', 'common-files', 'sample', 'tur-continuous', 'tur-disabled', 'tur-hacking', 'tur-multilib', 'tur-on-device', 'tur', '.gitattributes', '.gitignore'],
    sizeKb: 9154, commits: 4112, ageMonths: 52, contributors: 86, stars: 996, forks: 245,
    openIssues: 323, daysSincePush: 0, releaseCount: 1,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: false, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'deajan/osync', repo: 'osync', platform: 'github',
    description: 'A robust two way (bidirectional) file sync script based on rsync with fault tolerance, POSIX ACL support, time control and near realtime sync',
    topics: ['acl-replication', 'file-replication', 'posix-acl', 'replication', 'rsync-wrapper'],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.github', 'dev', 'packaging', '.travis.yml', 'CHANGELOG.md', 'KNOWNISSUES.md', 'LICENSE.TXT', 'PULL_REQUEST_TEMPLATE.md', 'README.md', 'exclude.list.example', 'install.sh', 'osync v1.2.lyx'],
    sizeKb: 3712, commits: 1882, ageMonths: 161, contributors: 36, stars: 998, forks: 105,
    openIssues: 42, daysSincePush: 13, releaseCount: 18,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: false, hasLicense: true, license: 'BSD-3-Clause', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'openconfig/public', repo: 'public', platform: 'github',
    description: 'Repository for publishing OpenConfig models, documentation, and other material for the community.',
    topics: [],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.gemini', '.github', 'doc', 'regexp-tests', 'release', 'scripts', 'third_party', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'cloudbuild.yaml', 'id_rsa.enc'],
    sizeKb: 4617, commits: 865, ageMonths: 134, contributors: 136, stars: 999, forks: 728,
    openIssues: 92, daysSincePush: 3, releaseCount: 25,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'Apache-2.0', archived: false,
    tier: 'T1',
  },
  {
    fullName: 'flamingo-stack/openframe-oss-tenant', repo: 'openframe-oss-tenant', platform: 'github',
    description: 'Code base for OSS OpenFrame single tenant version',
    topics: [],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.github', '.mvn', '.vscode', 'clients/openframe-client', 'configs/base', 'docs', 'manifests', 'openframe/services', '.doc-orchestrator-source-files.txt', '.dockerignore', '.gitignore', '.trivyignore'],
    sizeKb: 335151, commits: 3211, ageMonths: 24, contributors: 37, stars: 1000, forks: 28,
    openIssues: 38, daysSincePush: 0, releaseCount: 274,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'agenda/agenda', repo: 'agenda', platform: 'github',
    description: 'Lightweight job scheduling for Node.js',
    topics: ['automated', 'cron', 'cronjob', 'crontab', 'frequency'],
    languages: [{ name: 'HTML', pct: 100 }],
    rootFiles: ['.changeset', '.github', 'docs-legacy/4.x', 'docs', 'examples', 'packages', '.editorconfig', '.gitignore', '.pnpmfile.cjs', '.prettierrc', 'CLAUDE.md', 'CODE_OF_CONDUCT.md'],
    sizeKb: 5908, commits: 1192, ageMonths: 156, contributors: 155, stars: 9712, forks: 844,
    openIssues: 20, daysSincePush: 10, releaseCount: 70,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'NOASSERTION', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'HugoBlox/kit', repo: 'kit', platform: 'github',
    description: '🧱 Describe your site, AI builds it, you own it as Markdown. Snap together Tailwind blocks like Lego — landing pages, blogs, portfolios, docs & more. No AI slop',
    topics: ['academic', 'blog', 'documentation-tool', 'github-pages', 'hugo'],
    languages: [{ name: 'HTML', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', 'modules', 'scripts', 'templates', 'test', '.cursorindexingignore', '.editorconfig', '.gitignore', '.prettierignore', '.prettierrc.js', '.stylelintignore'],
    sizeKb: 80148, commits: 2275, ageMonths: 126, contributors: 208, stars: 9791, forks: 2947,
    openIssues: 26, daysSincePush: 98, releaseCount: 55,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: true, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T2',
  },
  {
    fullName: 'ToolJet/ToolJet', repo: 'ToolJet', platform: 'github',
    description: 'Open-source foundation of ToolJet AI - the enterprise app generation platform for internal tools, dashboards, business applications, workflows and AI agents. Bu',
    topics: ['ai-app-builder', 'docker', 'internal-applications', 'internal-project', 'internal-tool'],
    languages: [{ name: 'HTML', pct: 100 }],
    rootFiles: ['.agents', '.claude', '.do', '.githooks', '.github', '.husky', '.vscode', 'cli', 'cypress-tests', 'deploy', 'docker', 'docs'],
    sizeKb: 1783932, commits: 20083, ageMonths: 67, contributors: 683, stars: 41212, forks: 5507,
    openIssues: 942, daysSincePush: 0, releaseCount: 671,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'AGPL-3.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'pyenv/pyenv', repo: 'pyenv', platform: 'github',
    description: 'Simple Python version management',
    topics: ['python', 'shell'],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.github', 'bin', 'completions', 'libexec', 'man/man1', 'plugins', 'pyenv.d', 'src', 'test', '.agignore', '.dockerignore', '.editorconfig'],
    sizeKb: 7287, commits: 3898, ageMonths: 170, contributors: 501, stars: 45185, forks: 3271,
    openIssues: 49, daysSincePush: 2, releaseCount: 174,
    hasTests: true, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: true, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'acmesh-official/acme.sh', repo: 'acme.sh', platform: 'github',
    description: 'A pure Unix shell script ACME client for SSL / TLS certificate automation',
    topics: ['acme', 'acme-challenge', 'acme-protocol', 'acme-v2', 'ash'],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.github', 'deploy', 'dnsapi', 'notify', 'CONTRIBUTING.md', 'Dockerfile', 'LICENSE.md', 'README.md', 'acme.sh', 'acme.sh.completion', 'allowed_signers'],
    sizeKb: 8067, commits: 6930, ageMonths: 130, contributors: 821, stars: 47936, forks: 5702,
    openIssues: 107, daysSincePush: 3, releaseCount: 50,
    hasTests: false, hasCI: true, hasTypeConfig: false, hasLockfile: false, hasDocker: true,
    hasDocs: true, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'GPL-3.0', archived: false,
    tier: 'T3',
  },
  {
    fullName: 'ohmyzsh/ohmyzsh', repo: 'ohmyzsh', platform: 'github',
    description: '🙃   A delightful community-driven (with 2,500+ contributors) framework for managing your zsh configuration. Includes 300+ optional plugins (rails, git, macOS, ',
    topics: ['cli', 'cli-app', 'oh-my-zsh', 'oh-my-zsh-plugin', 'oh-my-zsh-theme'],
    languages: [{ name: 'Shell', pct: 100 }],
    rootFiles: ['.devcontainer', '.github', 'cache', 'custom', 'lib', 'log', 'plugins', 'templates', 'themes', 'tools', '.editorconfig', '.gitignore'],
    sizeKb: 14382, commits: 8009, ageMonths: 206, contributors: 2917, stars: 190398, forks: 27275,
    openIssues: 310, daysSincePush: 1, releaseCount: 0,
    hasTests: false, hasCI: true, hasTypeConfig: true, hasLockfile: false, hasDocker: false,
    hasDocs: false, hasChangelog: false, hasContributing: true, hasLicense: true, license: 'MIT', archived: false,
    tier: 'T4',
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

// ---- 星级分层：T1 <1k / T2 1k–10k / T3 10k–50k / T4 >50k ----
// 等级在高分段会被 logNorm 打满，无法区分同层，所以对手分层用原始星数
const TIER_ORDER = ['T1', 'T2', 'T3', 'T4']
const TIER_TEXT = { T1: '<1k 星', T2: '1k–10k 星', T3: '10k–50k 星', T4: '>50k 星' }
const TIER_BOUNDS = [1000, 10000, 50000]

function tierOfStars(stars) {
  const n = Number(stars)
  if (!Number.isFinite(n) || n <= 0) return null
  for (let i = 0; i < TIER_BOUNDS.length; i++) if (n < TIER_BOUNDS[i]) return TIER_ORDER[i]
  return TIER_ORDER[TIER_ORDER.length - 1]
}

export function tierOfPet(pet) {
  return tierOfStars(pet?.stars)
}

export function tierLabel(tier) {
  return TIER_TEXT[tier] || '未知层'
}

// Pool：多条件取交集圈定候选（属性 / 星级层），对应 Open Match 的 Pool filter
function buildPool({ elementKey = null, tier = null } = {}) {
  return rivalPets().filter((p) => {
    if (elementKey && p.element?.key !== elementKey && p.elementSecondary?.key !== elementKey) return false
    if (tier && tierOfPet(p) !== tier) return false
    return true
  })
}

// 同属性对手池：主属性相同的排前面，副属性相同的补在后面
// 传 leadPet 时只保留同星级层，同层不够由抽取阶段向相邻层借
export function sameTypePool(elementKey, leadPet = null) {
  const pool = buildPool({ elementKey })
  if (!elementKey) return pool
  const primary = pool.filter((p) => p.element?.key === elementKey)
  const secondary = pool.filter((p) => p.element?.key !== elementKey && p.elementSecondary?.key === elementKey)
  const ordered = [...primary, ...secondary]
  const tier = tierOfPet(leadPet)
  if (!tier) return ordered
  return ordered.filter((p) => tierOfPet(p) === tier)
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

// 分层抽取：先锁玩家队伍所在星级层，同层不够再按层距向相邻层借
// 层内沿用 drawNear（等级贴近 + seed 轮转），保证同层里挑到势均力敌的那几只
function drawTierNear(pool, playerTeam, count, seed) {
  if (!pool.length) return []
  const idxs = playerTeam
    .map((p) => TIER_ORDER.indexOf(tierOfPet(p)))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
  if (!idxs.length) return drawNear(pool, playerTeam, count, seed)
  const midIdx = idxs[Math.floor(idxs.length / 2)]

  const buckets = TIER_ORDER
    .map((tier, i) => ({ i, list: pool.filter((p) => tierOfPet(p) === tier) }))
    .filter((b) => b.list.length)
  const unknown = pool.filter((p) => !tierOfPet(p))
  if (unknown.length) buckets.push({ i: TIER_ORDER.length, list: unknown })
  buckets.sort((a, b) => Math.abs(a.i - midIdx) - Math.abs(b.i - midIdx) || a.i - b.i)

  const picked = []
  for (const b of buckets) {
    if (picked.length >= count) break
    picked.push(...drawNear(b.list, playerTeam, count - picked.length, seed + b.i * 7919))
  }
  return picked.slice(0, count)
}

// 同类型对战：只找和你先发同属性的仓库，优先同星级层，按难度缩放
export function pickSameTypeTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const lead = playerTeam[0]
  const key = lead?.element?.key
  const pool = sameTypePool(key)
  const picked = drawTierNear(pool, playerTeam, teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 随机宠物：全体随机，不看等级匹配
export function pickRandomTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const picked = drawRandom(rivalPets(), teamSize(playerTeam, cap), seed)
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1
  return picked.map((p) => scaleRival(p, factor))
}

// 兼容旧调用：全池按「星级层 + 等级贴近」挑，不再只看等级
export function pickRivalTeam(playerTeam = [], seed = Date.now(), difficulty = 'normal', cap = 3) {
  const picked = drawTierNear(rivalPets(), playerTeam, teamSize(playerTeam, cap), seed)
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
