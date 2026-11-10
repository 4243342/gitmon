// 任务模式（占位页）
//
// 功能还在开发（设计见 docs/QUEST.md）。这里只占住顶栏的位置，
// 把玩法一句话讲清楚，别做成一个空页让人以为出错了。
import { useI18n } from '../i18n.js'

export default function Quest({ onGo }) {
  const { t: tf } = useI18n()
  return (
    <main className="home">
      <section className="hero quest-hero">
        <span className="story-kicker">{tf('任务模式 · 开发中', 'Quest mode · in development')}</span>
        <h2>{tf('任务模式', 'Quest Mode')}</h2>
        <p>
          {tf('AI 指出你项目里的真问题，你去改；改完 AI 复审，确认改好了才发奖励。',
            'AI points out a real problem in your project, you fix it, AI re-reviews — only then do you get rewarded.')}
        </p>
        <p className="quest-note">
          {tf('剧情模式是一次性的主线远征，任务模式是可重复的日常副本：随时最多 3 个进行中，每天可领 3 个。',
            'Story mode is a one-off main quest; quest mode is a repeatable daily run: up to 3 in progress, 3 new per day.')}
        </p>
        <p className="quota-note">
          {tf('还没上线 —— 先去竞技场赢几场攒点星尘，商店已经开张了。',
            'Not live yet — win a few arena rounds for stardust, the shop is already open.')}
          <button onClick={() => onGo?.('battle')}>{tf('去竞技场 →', 'To the Arena →')}</button>
        </p>
      </section>
    </main>
  )
}
