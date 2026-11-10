// 任务模式 · 活动任务板
//
// 当前上线的活动任务只有一个：给本项目自己的仓库点一颗星。
// 目标固定，没有得挑 —— 活动的号召力来自「就是这一个」。
//
// 玩法三步（和剧情模式最大的不同在这里）：
//   ① 领取 —— 锁定任务，后端记下目标仓库此刻的星数作为基线
//   ② 去 GitHub 点 ★ —— 玩家自己去点，前端不代劳
//   ③ 复审 —— 后端重新拉一次星数比对，涨了才算数
//
// 判定全在后端：这里不读星数、不算奖励、不决定通过没通过，只把后端给的结果显示出来。
// 领奖也由后端发（幂等），前端只负责在拿到结果后刷新背包余额。
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { fetchQuestBoard, fetchQuestHistory, issueQuest, verifyQuest } from '../quest.js'
import { sfx } from '../sfx.js'
import '../quest.css'

// 三态结果的中文标签与配色。partial 是「星确实涨了，但没法证明是你点的」。
const RESULT_META = {
  passed: { label: '通过', color: '#9be15d' },
  partial: { label: '部分通过', color: '#f5c542' },
  failed: { label: '未通过', color: '#ff6b6b' },
}

const fmtTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const platformLabel = (p) => (p === 'gitee' ? 'Gitee' : 'GitHub')

// 奖励条目 → 人话。物品名跟背包一致（星尘 / 词条碎片 …）。
const REWARD_LABEL = {
  stardust: '星尘',
  trait_shard: '词条碎片',
  bond_charm: '羁绊符',
  exp_tonic: '经验液',
}

const rewardText = (reward) =>
  Object.entries(reward || {})
    .map(([k, v]) => `${REWARD_LABEL[k] || k}×${v}`)
    .join(' · ')

export default function Quest({ onGo, onReward }) {
  const { t: tf } = useI18n()
  const [board, setBoard] = useState(null)
  const [history, setHistory] = useState(null)
  const [busy, setBusy] = useState('')      // 正在处理的按钮标识
  const [msg, setMsg] = useState(null)      // { kind: 'ok' | 'err', text }
  const [openId, setOpenId] = useState('')  // 展开证据的任务
  // 刚复审完的任务：后端把它移出「进行中」了（status 变 passed），
  // 但玩家得看见这张卡 —— 奖励到账、证据都在上面。不留一份的话，
  // 点完「我点好了」卡片就凭空消失，只剩一条消息条。
  const [finished, setFinished] = useState({})

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([fetchQuestBoard(), fetchQuestHistory()])
      setBoard(b)
      setHistory(h)
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || tf('任务板打不开', 'Could not open the quest board') })
    }
  }, [tf])

  useEffect(() => { load() }, [load])

  const guard = async (id, fn) => {
    setBusy(id)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || tf('操作失败', 'Something went wrong') })
    } finally {
      setBusy('')
    }
  }

  const doIssue = (goal, target) => guard(`issue:${target?.petKey || goal.key}`, async () => {
    const res = await issueQuest(goal.key, target ? `${target.platform}-${target.fullName}` : '')
    sfx.reveal('R')
    setMsg({
      kind: 'ok',
      text: tf(
        `任务已领取：${target?.fullName || ''}。去点个 ★，回来点「我点好了」。`,
        `Task claimed: ${target?.fullName || ''}. Go star it, then come back and hit "I starred it".`,
      ),
    })
    setOpenId(res.run?.id || '')
    await load()
  })

  const doVerify = (run) => guard(`verify:${run.id}`, async () => {
    const res = await verifyQuest(run.id)
    const meta = RESULT_META[res.result] || RESULT_META.failed
    setOpenId(run.id)
    // 复审后的任务留在本地：后端会把通过的任务移出「进行中」列表
    if (res.run) setFinished((prev) => ({ ...prev, [res.run.id]: res.run }))
    if (res.result === 'passed') sfx.reveal('SR')
    else sfx.blip()
    const gained = rewardText(res.reward)
    setMsg({
      kind: res.result === 'failed' ? 'err' : 'ok',
      text: res.result === 'failed'
        ? (res.missing || tf('还没通过，再看看还差什么', 'Not there yet — see what is missing'))
        : `${meta.label}${gained ? ` · 到账 ${gained}` : ''}${res.missing ? ` · ${res.missing}` : ''}`,
    })
    await load()
    // 复审可能发了奖励：让 App 刷新背包余额
    if (res.result === 'passed' || res.result === 'partial') onReward?.()
  })

  if (!board) {
    return (
      <main className="quest-wrap">
        <p className="inv-empty">{msg ? msg.text : tf('任务板加载中…', 'Loading the quest board…')}</p>
      </main>
    )
  }

  const goal = board.goals?.[0]
  if (!goal) {
    return (
      <main className="quest-wrap">
        <p className="inv-empty">{tf('现在没有开放中的活动任务。', 'No active quest right now.')}</p>
      </main>
    )
  }

  const quota = goal.quota || {}
  const dailyLeft = Math.max(0, (quota.dailyLimit || 0) - (quota.issuedToday || 0))
  const slotLeft = Math.max(0, (quota.slotsLimit || 0) - (quota.slotsUsed || 0))
  const runs = goal.runs || []
  // 目标固定，只有一个
  const target = goal.target || null
  // 已经领过（还在进行中）就不能再领 —— 目标唯一，重复领没有意义
  const claimed = Boolean(target) && runs.some((r) => r.petKey === target.petKey)
  const stats = history?.stats || {}
  // 进行中的任务 + 本次会话里刚复审完的任务（后端会把通过的移出「进行中」）
  const allRuns = [...runs]
  for (const id of Object.keys(finished)) {
    if (!allRuns.some((r) => r.id === id)) allRuns.push(finished[id])
  }

  return (
    <main className="quest-wrap">
      {/* ---------- 活动任务卡 ---------- */}
      <section className="quest-hero">
        <span className="quest-kicker">{tf('活动任务', 'Active quest')}</span>
        <h2>{goal.title}</h2>
        <p>{goal.brief}</p>
        <div className="quest-quota">
          <span>
            {tf('今日额度', 'Daily')}{' '}
            <b>{quota.issuedToday || 0}/{quota.dailyLimit || 0}</b>
          </span>
          <span>
            {tf('进行中', 'In progress')}{' '}
            <b>{quota.slotsUsed || 0}/{quota.slotsLimit || 0}</b>
          </span>
          <span>
            {tf('冷却', 'Cooldown')}{' '}
            <b>{quota.cooldownDays || 0}{tf('天', 'd')}</b>
          </span>
        </div>
      </section>

      {msg && <p className={`quest-msg ${msg.kind}`}>{msg.text}</p>}

      {/* ---------- 任务目标（固定一个） ---------- */}
      <section className="quest-panel">
        <h4 className="quest-h">
          {tf('任务目标', 'Quest target')}
          <em>{tf('本项目的仓库', 'this project’s repo')}</em>
        </h4>

        {!target ? (
          <p className="inv-empty">
            {tf(
              '活动任务的目标还没配置好 —— 稍后再来看看。',
              'The quest target is not configured yet — check back later.',
            )}
          </p>
        ) : (
          <div className="quest-target is-fixed">
            <div className="quest-target-main">
              <span className="quest-repo">{target.fullName}</span>
              <span className="quest-badge">{platformLabel(target.platform)}</span>
              {typeof target.stars === 'number' && (
                <span className="quest-stars">★ {target.stars}</span>
              )}
            </div>
            <p className="quest-desc">
              {tf(
                '给这个仓库点一颗 ★ —— 你的这颗星会直接算进社区认可分。',
                'Star this repo — your star counts straight into the community score.',
              )}
            </p>
            <div className="quest-target-foot">
              {/* 「去点 ★」是这次活动真正要玩家做的动作 —— 用主按钮（.quest-btn 默认样式）；
                  「领取」只是记录基线，用 ghost 退后一步。 */}
              <a
                className="quest-btn"
                href={target.htmlUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => sfx.tick()}
              >
                {tf('去点 ★', 'Go star it')}
              </a>
              <button
                className="quest-btn ghost"
                disabled={
                  busy === `issue:${target.petKey}` ||
                  claimed ||
                  dailyLeft <= 0 ||
                  slotLeft <= 0
                }
                onClick={() => doIssue(goal, target)}
              >
                {claimed
                  ? tf('已领取', 'Claimed')
                  : busy === `issue:${target.petKey}`
                    ? tf('领取中…', 'Claiming…')
                    : tf('领取', 'Claim')}
              </button>
            </div>
          </div>
        )}

        {dailyLeft <= 0 && (
          <p className="quest-note">
            {tf('今天的额度用完了 —— 明天再来。', 'Daily quota used up — come back tomorrow.')}
          </p>
        )}
      </section>

      {/* ---------- 我手上的任务 ---------- */}
      <section className="quest-panel">
        <h4 className="quest-h">
          {tf('我手上的任务', 'My quests')}
          <em>{allRuns.length ? tf(`（${allRuns.length}）`, `(${allRuns.length})`) : ''}</em>
        </h4>

        {allRuns.length === 0 ? (
          <p className="inv-empty">
            {tf(
              '还没有领任务 —— 上面就是这次活动的目标，给它点一颗星。',
              'No quest yet — the target is above, give it a star.',
            )}
          </p>
        ) : (
          <ul className="quest-runs">
            {allRuns.map((run) => {
              const payload = run.payload || {}
              const meta = RESULT_META[run.result] || null
              const ev = (run.evidence || [])[run.evidence.length - 1] || null
              const expanded = openId === run.id
              return (
                <li key={run.id} className={`quest-run${run.result ? ` is-${run.result}` : ''}`}>
                  <div className="quest-run-main">
                    <span className="quest-repo">{payload.fullName || run.petKey}</span>
                    <span className="quest-badge">{platformLabel(payload.platform)}</span>
                    {meta && (
                      <span className="quest-result" style={{ color: meta.color }}>{meta.label}</span>
                    )}
                    <span className="quest-attempts">
                      {tf('复审', 'Tries')} {run.attempts}/{run.maxAttempts}
                    </span>
                  </div>

                  <div className="quest-run-detail">
                    {typeof payload.starsBefore === 'number' && (
                      <span>
                        {tf('领取时星数', 'Stars at claim')} <b>{payload.starsBefore}</b>
                        {ev && typeof ev.after === 'number' && (
                          <>
                            {' → '}
                            <b className={ev.delta > 0 ? 'up' : 'flat'}>{ev.after}</b>
                            {typeof ev.delta === 'number' && (
                              <em className={ev.delta > 0 ? 'up' : 'flat'}>
                                {' '}({ev.delta > 0 ? '+' : ''}{ev.delta})
                              </em>
                            )}
                          </>
                        )}
                      </span>
                    )}
                    {run.result && run.missing && <span className="quest-missing">{run.missing}</span>}
                    {run.reward && Object.keys(run.reward).length > 0 && (
                      <span className="quest-got">
                        {tf('已到账', 'Got')} {rewardText(run.reward)}
                      </span>
                    )}
                    <span className="quest-time">{fmtTime(run.issuedAt)}</span>
                  </div>

                  <div className="quest-run-actions">
                    <a
                      className="quest-btn ghost"
                      href={payload.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => sfx.tick()}
                    >
                      {tf('去点 ★', 'Go star it')}
                    </a>
                    {run.canVerify && (
                      <button
                        className="quest-btn"
                        disabled={busy === `verify:${run.id}`}
                        onClick={() => doVerify(run)}
                      >
                        {busy === `verify:${run.id}` ? tf('核对中…', 'Checking…') : tf('我点好了', 'I starred it')}
                      </button>
                    )}
                    {run.evidence?.length > 0 && (
                      <button
                        className="quest-btn ghost"
                        onClick={() => { sfx.tick(); setOpenId(expanded ? '' : run.id) }}
                      >
                        {expanded ? tf('收起证据', 'Hide evidence') : tf('看证据', 'Evidence')}
                      </button>
                    )}
                  </div>

                  {expanded && run.evidence?.length > 0 && (
                    <ul className="quest-evidence">
                      {run.evidence.map((e, i) => (
                        <li key={`${e.at}-${i}`}>
                          <span className="quest-ev-time">{fmtTime(e.at)}</span>
                          <span style={{ color: (RESULT_META[e.result] || {}).color }}>
                            {(RESULT_META[e.result] || {}).label || e.result}
                          </span>
                          <span>
                            {tf('星数', 'stars')} {e.before ?? '?'} → {e.after ?? '?'}
                            {typeof e.delta === 'number' && ` (${e.delta > 0 ? '+' : ''}${e.delta})`}
                          </span>
                          <span className="quest-ev-attr">
                            {e.attributed === true && tf('确认是你点的', 'confirmed yours')}
                            {e.attributed === false && tf('这个账号没收藏过', 'this account never starred it')}
                            {e.attributed === null && tf('无法归因', 'not attributable')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ---------- 历史 ---------- */}
      <section className="quest-panel">
        <h4 className="quest-h">
          {tf('任务记录', 'History')}
          {stats.total > 0 && (
            <em>
              {tf('共', 'total')} {stats.total} · {tf('通过率', 'pass rate')} {stats.passRate}%
            </em>
          )}
        </h4>
        {!history?.items?.length ? (
          <p className="inv-empty">{tf('还没有记录。', 'Nothing here yet.')}</p>
        ) : (
          <ul className="quest-history">
            {history.items.slice(0, 12).map((item) => {
              const meta = RESULT_META[item.result] || null
              return (
                <li key={item.id}>
                  <span className="quest-repo">{item.repo || item.petKey}</span>
                  <span className="quest-badge">{platformLabel((item.petKey || '').split('-')[0])}</span>
                  {meta && <span className="quest-result" style={{ color: meta.color }}>{meta.label}</span>}
                  {item.reward && Object.keys(item.reward).length > 0 && (
                    <span className="quest-got">{rewardText(item.reward)}</span>
                  )}
                  <span className="quest-time">{fmtTime(item.issuedAt)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
