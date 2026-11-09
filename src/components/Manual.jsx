import { useState } from 'react'
import { useI18n } from '../i18n.js'

// 使用说明书：章节内容按当前实现的真实规则撰写（engine.js / traits.js / evolution.js / GrowPanel.jsx / Battle.jsx）
const TIERS = [
  { n: ['1–9', '1–9'], name: '金星', desc: ['1 颗 = 1 级，逐颗并排', '1 star = 1 level, lined up one by one'] },
  { n: ['10', '10'], name: '炫彩星', desc: ['10 级起，每 10 星 1 枚', 'from Lv.10 — 1 badge per 10 stars'] },
  { n: ['100', '100'], name: '月亮', desc: ['每 100 星 1 枚', '1 badge per 100 stars'] },
  { n: ['1,000', '1,000'], name: '地球', desc: ['每 1,000 星 1 枚', '1 badge per 1,000 stars'] },
  { n: ['1 万', '10K'], name: '太阳', desc: ['每 1 万星 1 枚', '1 badge per 10K stars'] },
  { n: ['10 万', '100K'], name: '黑太阳', desc: ['每 10 万星 1 枚', '1 badge per 100K stars'] },
  { n: ['100 万', '1M'], name: '宇宙', desc: ['每 100 万星 1 枚', '1 badge per 1M stars'] },
  { n: ['1,000 万', '10M'], name: '至高', desc: ['金箔文字招牌，不再叠图标', 'gold-foil text plate, no more stacked icons'] },
]

const CHAPTERS = [
  {
    id: 'start', no: '01', name: ['快速上手', 'Quick Start'],
    body: (t) => (
      <>
        <h4>{t('三步抽到第一只', 'Three steps to your first draw')}</h4>
        <ol>
          <li><b>{t('填地址', 'Enter a URL')}</b>{t('：仓库地址（', ': a repo URL (')}<code>github.com/owner/repo</code>{t('）= ', ') = ')}<b>{t('1 包', '1 pack')}</b>{t('；账号主页（', '; an account page (')}<code>github.com/owner</code>{t('）= ', ') = ')}<b>{t('一整箱', 'a whole box')}</b>{t('，名下每个项目各一包，fork / 空仓库跳过。', ' — one pack per project under it; forks / empty repos are skipped.')}</li>
          <li><b>{t('等扫描', 'Wait for the scan')}</b>{t('：读取项目清单 → 读取技术栈 → 估算工程量 → 评估代码质量，逐项打勾。', ': reads the project list → tech stack → effort estimate → code quality, ticking each item off.')}</li>
          <li><b>{t('开包收下', 'Open & collect')}</b>{t('：出场动画后「收入图鉴」；详情页可导出分享卡、带它去对战、做养成任务。', ': after the entrance animation it’s saved to your dex; the detail page can export a share card, take it to battle, or run growth tasks.')}</li>
        </ol>
        <h4>{t('登录有什么用', 'Why sign in')}</h4>
        <ul>
          <li><b>{t('游客', 'Guest')}</b>{t('：匿名 GitHub / Gitee API 每小时 60 次，整箱抽卡容易打满。', ': anonymous GitHub / Gitee API allows 60 calls/hour — a full box fills that fast.')}</li>
          <li><b>{t('登录 GitHub / Gitee', 'Sign in with GitHub / Gitee')}</b>{t('：只读授权，不写代码；自动列出名下项目（含私有仓库），额度更充裕。', ': read-only access, never writes code; auto-lists your projects (private ones included) with a bigger quota.')}</li>
        </ul>
        <p className="manual-tip">{t('右上角 ', 'Top-right ')}<b>♪ ON / ♪ OFF</b>{t(' 一键静音，同时管住音效与对战 BGM。', ' mutes everything in one tap — SFX and battle BGM alike.')}</p>
      </>
    ),
  },
  {
    id: 'judge', no: '02', name: ['判定规则', 'Rules'],
    body: (t) => (
      <>
        <h4>{t('品种 = 属性 × 生态型', 'Breed = element × habitat')}</h4>
        <ul>
          <li><b>{t('主语言 → 元素属性', 'Main language → element')}</b>{t('：Python 水系 / JS 雷系 / Rust 钢系… 多语言时可能带第二属性。', ': Python 水系 / JS 雷系 / Rust 钢系… multi-language repos may gain a second attribute.')}</li>
          <li><b>{t('项目类型 → 生态型', 'Project type → habitat')}</b>{t('：AI 龙型 / CLI 鸟型 / Web 兽型… 属性决定技能池与克制关系。', ': AI 龙型 / CLI 鸟型 / Web 兽型… the element decides the skill pool and matchups.')}</li>
        </ul>
        <h4>{t('品质：五维加权 → N / R / SR / SSR', 'Rarity: five weighted dims → N / R / SR / SSR')}</h4>
        <ul>
          <li>{t('测试完备度 ', 'Test coverage ')}<b>25%</b>{t(' · 工程质量 ', ' · Code quality ')}<b>20%</b>{t(' · 文档完整度 ', ' · Docs completeness ')}<b>20%</b>{t(' · 维护健康度 ', ' · Maintenance health ')}<b>20%</b>{t(' · 社区认可 ', ' · Community acclaim ')}<b>15%</b>{t('。', '.')}</li>
          <li>{t('总分 ', 'Total ')}<b>≥80 SSR</b>{t('（传说）· ', '（传说）· ')}<b>≥60 SR</b>{t(' · ', ' · ')}<b>≥40 R</b>{t(' · 其余 N；卡面右上角六边形宝石标显示字母。', ' · the rest are N; a hex gem at the card’s top-right shows the letter.')}</li>
        </ul>
        <h4>{t('等级 / 进化 / 六维', 'Level / Evolution / Stats')}</h4>
        <ul>
          <li><b>{t('工程量', 'Engineering')}</b>{t('：代码规模 35% + 提交总量 30% + 根目录条目 10% + 贡献者 15% + 活跃时长 10%，对数归一 → ', ': code size 35% + total commits 30% + root entries 10% + contributors 15% + active span 10%, log-normalized → ')}<b>Lv.1–999</b>{t('。', '.')}</li>
          <li><b>{t('进化 9 段', '9 evolution stages')}</b>{t('：按等级推进（幼体 → 初生体 → 成长体 → … → 人形态·神话），卡面进化条显示距下一段还差多少级。', ': advance with level (幼体 → 初生体 → 成长体 → … → 人形态·神话); the card’s evo bar shows levels to the next stage.')}</li>
          <li><b>{t('六维', 'Six stats')}</b>{t('：攻击 / 防御 / 速度 / 特攻 / 特防 / HP，评级 S ≥90 · A ≥75 · B ≥60 · C ≥40 · D；', ': 攻击 / 防御 / 速度 / 特攻 / 特防 / HP, rated S ≥90 · A ≥75 · B ≥60 · C ≥40 · D; ')}<b>{t('4 个技能', '4 skills')}</b>{t('按 Lv.1 / 1 / 150 / 500 解锁。', ' unlock at Lv.1 / 1 / 150 / 500.')}</li>
          <li><b>{t('根基', 'Foundation')}</b>{t('（测试 30% / 粒度 20% / 提交史 15% / 文档 20% / 真实性 15%）分稳固 / 尚可 / 松动 / 根基不稳；', ' (tests 30% / granularity 20% / commit history 15% / docs 20% / authenticity 15%) is graded 稳固 / 尚可 / 松动 / 根基不稳; ')}<b>{t('性格词条', 'Personality traits')}</b>{t('由仓库特征生成，正面 / 负面影响属性与经验倍率，', ' derive from repo features and raise or lower stats and EXP multipliers; ')}<b>?</b>{t(' 是可修复提示。', ' marks something fixable.')}</li>
        </ul>
        <p className="manual-tip">{t('超过 30 天没有提交的仓库会变成「沉睡」状态，投喂会被拦下——推一次代码就能唤醒。', 'Repos with no commits for 30+ days fall asleep — feeding gets blocked until you push once.')}</p>
      </>
    ),
  },
  {
    id: 'stars', no: '03', name: ['星级段位', 'Star Tiers'],
    body: (t) => (
      <>
        <h4>{t('1 颗星 = 1 级', '1 star = 1 level')}</h4>
        <p>{t('徽章读的是仓库真实 star 数，卡面右上角与图鉴小格都有角标。跨档时按倍数并排多枚图标（最多 9 枚，自动缩小保持单排），不写 ×N。', 'Badges read the repo’s real star count — shown on the card’s top-right and in each dex cell. Across tiers icons line up by multiplier (up to 9, auto-shrunk into one row); no ×N text.')}</p>
        <div className="manual-tiers">
          {TIERS.map((tier) => (
            <div key={tier.n[0]}>
              <b>{t(...tier.n)}</b>
              <span>{tier.name}</span>
              <em>{t(...tier.desc)}</em>
            </div>
          ))}
        </div>
        <p className="manual-tip">{t('例：51,800 ★ → 太阳 ×5；232,000 ★ → 黑太阳 ×2；≥1,000 万 → 只显示「至高」。', 'e.g. 51,800 ★ → 太阳 ×5; 232,000 ★ → 黑太阳 ×2; ≥10M → only 「至高」 shows.')}</p>
      </>
    ),
  },
  {
    id: 'battle', no: '04', name: ['竞技场', 'Arena'],
    body: (t) => (
      <>
        <h4>{t('三种打法', 'Three ways to fight')}</h4>
        <ul>
          <li><b>{t('在线对手', 'Online rival')}</b>{t('：输入对方仓库 / 账号地址，按真实实力 1v1；', ': enter their repo / account URL for a 1v1 on true stats; ')}<b>{t('整仓全员上阵，不限精灵数量', 'the whole account fights — no pet cap')}</b>{t('。', '.')}</li>
          <li><b>{t('同类型对战', 'Same-Type Battle')}</b>{t('：从同属性仓库里挑对手，可调难度。', ': pick rivals from same-element repos; difficulty is adjustable.')}</li>
          <li><b>{t('随机宠物', 'Random pet')}</b>{t('：抽到谁打谁，可调难度。', ': whoever you draw is who you fight; difficulty is adjustable.')}</li>
        </ul>
        <h4>{t('全自动，不用点技能', 'Fully auto — no skill clicks')}</h4>
        <ul>
          <li>{t('开战后双方自动出招：按估伤 × 命中挑最优招式，残血且替补属性更优时自动换人；', 'Both sides act on their own: best move by expected damage × hit rate, and they swap at low HP when the benched pet has the better matchup; ')}<b>{t('没有技能按钮、也不需要手动操作', 'no skill buttons, no manual control')}</b>{t('，看战报和演出即可。', ' — just watch the log and the show.')}</li>
          <li>{t('顶栏 ', 'Top bar ')}<b>{t('» 快进', '» Fast-forward')}</b>{t(' 或 ', ' or ')}<kbd>F</kbd>{t(' 可跳过逐帧演出、让整场更快打完（偏好会被记住）。', ' skips frame-by-frame animations and finishes the fight faster (preference is remembered).')}</li>
          <li>{t('属性克制、先制、异常状态、换人共同决定结果；等级高不一定赢，每回合有战斗日志。', 'Element matchups, priority, status conditions and swaps all decide the outcome; a higher level never guarantees the win — every round has a battle log.')}</li>
        </ul>
        <h4>{t('结算', 'Results')}</h4>
        <ul>
          <li>{t('战斗有专属 BGM 与结算音效；胜利给全队 ', 'Battles have their own BGM and result sounds; winning grants the whole team ')}<b>XP</b>{t(' 与羁绊（胜 +4 / 负 +1）。', ' and Bond (win +4 / lose +1).')}</li>
        </ul>
        <p className="manual-tip">{t('卡面右上角 ♪ 可随时静音 / 恢复；离场自动停 BGM。', 'The ♪ at the card’s top-right mutes / restores anytime; BGM stops when you leave.')}</p>
      </>
    ),
  },
  {
    id: 'grow', no: '05', name: ['养成与图鉴', 'Growth & Dex'],
    body: (t) => (
      <>
        <h4>{t('养成', 'Growth')}</h4>
        <ul>
          <li><b>{t('每日投喂', 'Daily Feed')}</b>{t('：+40 XP、羁绊 +5（每天一次，沉睡时不可投喂）。', ': +40 XP, Bond +5 (once a day; not while asleep).')}</li>
          <li><b>{t('每周训练任务', 'Weekly Training')}</b>{t('：按仓库短板派发 3 个任务（补测试 / 写文档 / 加 CI / 关 issue / 发 release），+90 ~ 200 XP、羁绊 +4。', ': 3 tasks targeting the repo’s weak spots (tests / docs / CI / close an issue / ship a release), +90–200 XP, Bond +4.')}</li>
          <li><b>{t('升级曲线', 'Level curve')}</b>{t('：升下一级需要 100 × Lv^1.5 点 EXP；羁绊称号：初次见面 → 熟悉的朋友(20) → 默契伙伴(50) → 灵魂伴侣(80)。', ': the next level costs 100 × Lv^1.5 EXP; bond titles: First Meeting → Familiar Friend (20) → Trusted Partner (50) → Soulmates (80).')}</li>
        </ul>
        <h4>{t('图鉴 / 卡面 / 分享', 'Dex / Cards / Sharing')}</h4>
        <ul>
          <li>{t('图鉴存在本机浏览器，点小卡随时回详情；卡片支持鼠标跟随倾斜与全息反光。', 'The dex lives in this browser — tap a card to reopen its detail anytime; cards tilt with the mouse and catch holographic glare.')}</li>
          <li><b>{t('换形象', 'Change Sprite')}</b>{t('：详情页点「换形象」或直接把图片拖进立绘区，自定义形象存 IndexedDB，可一键还原。', ': tap “Change Sprite” on the detail page or drop an image straight onto the art area — custom sprites live in IndexedDB and can be restored in one tap.')}</li>
          <li><b>{t('导出分享卡', 'Export share card')}</b>{t('：1080 × 1509 PNG，完整复刻卡面全要素（星级、品质标、六维、技能、词条、页脚）。', ': 1080 × 1509 PNG replicating every card element (stars, rarity badge, stats, skills, traits, footer).')}</li>
        </ul>
        <p className="manual-tip">{t('当前版本 XP 由手动任务结算；正式版会按每日 commit / PR / release 自动结算。', 'For now XP settles through manual tasks; the final build will settle it daily from commits / PRs / releases.')}</p>
      </>
    ),
  },
  {
    id: 'faq', no: '06', name: ['常见问题', 'FAQ'],
    body: (t) => (
      <>
        <h4>{t('提示「名下还没有可抽卡的项目」', 'Prompt: “no drawable projects under this account”')}</h4>
        <ul>
          <li>{t('项目全是 fork / 空仓库会被跳过；也可能是接口返回空或权限不足。登录授权后能列出私有仓库，页上会显示具体跳过原因。', 'Repos that are all forks / empty get skipped; the API may also return nothing or lack permission. Signing in lets private repos show up, and the page lists why each was skipped.')}</li>
        </ul>
        <h4>{t('限流 / 403 / 配额用尽', 'Rate limit / 403 / quota exhausted')}</h4>
        <ul>
          <li>{t('匿名额度 60 次/小时；整箱抽卡会连打多个接口。点「登录后自动读我的仓库」即可换用登录态额度。', 'Anonymous quota: 60/hour; a full box hits several endpoints back to back. Tap “sign in to auto-read my repos” to switch to your signed-in quota.')}</li>
        </ul>
        <h4>{t('数据来源与隐私', 'Data sources & privacy')}</h4>
        <ul>
          <li>{t('数据来自 GitHub / Gitee 公开 API，OAuth 为只读授权，不会往仓库写任何内容；图鉴、自定义形象都只存在本机。', 'Data comes from the public GitHub / Gitee APIs; OAuth is read-only and never writes to a repo — dex and custom sprites stay on this machine.')}</li>
          <li>{t('判定里含少量随机微扰，同一仓库使用固定种子，结果可复现。', 'Judging adds a little random noise; each repo uses a fixed seed, so results are reproducible.')}</li>
        </ul>
        <p className="manual-tip">{t('顶部 GitMon 标志可随时回到首页；图鉴与详情页的「再抽一只」会清空当前流程重新扫描。', 'The GitMon logo up top returns home anytime; “Draw Another” in the dex / detail page clears the current run and rescans.')}</p>
      </>
    ),
  },
]

export default function Manual() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(CHAPTERS[0].id)
  const chapter = CHAPTERS.find((c) => c.id === active) || CHAPTERS[0]
  return (
    <section className={`manual ${open ? 'open' : 'closed'}`}>
      <button className="manual-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="manual-title">
          <h3>{t('说明书', 'Manual')}</h3>
          <small>{t('GitMon v0.3 · 共 6 章', 'GitMon v0.3 · 6 chapters')}</small>
        </span>
        <span className="manual-toggle">{open ? t('收起 ▴', 'Collapse ▴') : t('展开 ▾', 'Expand ▾')}</span>
      </button>
      {!open && (
        <button className="manual-peek" onClick={() => setOpen(true)}>
          {t('快速上手 · 判定规则 · 星级段位 · 竞技场 · 养成与图鉴 · 常见问题', 'Quick Start · Rules · Star Tiers · Arena · Growth & Dex · FAQ')}
          <span>{t('点开查看完整规则 →', 'Open for the full rules →')}</span>
        </button>
      )}
      {open && (
        <div className="manual-wrap">
          <nav className="manual-tabs" aria-label={t('说明书目录', 'Manual contents')}>
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                className={`manual-tab ${c.id === active ? 'active' : ''}`}
                onClick={() => setActive(c.id)}
                aria-current={c.id === active ? 'page' : undefined}
              >
                <i>{c.no}</i>{t(...c.name)}
              </button>
            ))}
          </nav>
          <div className="manual-page" key={chapter.id}>
            <div className="manual-page-head">
              <span>{chapter.no}</span>
              <h4>{t(...chapter.name)}</h4>
            </div>
            {chapter.body(t)}
          </div>
        </div>
      )}
    </section>
  )
}
