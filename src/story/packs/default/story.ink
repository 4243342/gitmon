// GitMon 剧情模式 · 离线路线（唯一真相源）
//
// 这里只定稿「结构」：场景、选项、变量、跳转、结局。
// 每屏台词是占位符 {say("key")}，运行时由模型填充；模型不可用时取 lines.json 的 fallback。
// 编译：npm run story:build  →  src/story/story.json（inkjs 运行时读它）
//
// 标签约定（运行时解析）：
//   # scene: <id>     当前场景 id
//   # bg: <key>       背景
//   # cast: a,b       登场角色
//   # keys: a,b       本屏需要生成的台词 key（前缀 = 说话人）
//   # battle: minion|boss   进入战斗；win / lose 指向打完后的分支
//   # win: <knot> / # lose: <knot>
//   # ending          剧情终点

EXTERNAL say(key)

VAR chapter_count = 3
VAR chapter = 0
VAR trust = 0
VAR deaths = 0
VAR route = "solo"
VAR pet_name = "主角"
VAR boss_name = "宿敌"
VAR ending_id = ""

-> prologue

=== prologue ===
# scene: prologue
# bg: dawn
# cast: pet,narrator
# keys: narrator.hook,pet.oath
{say("narrator.hook")}
{say("pet.oath")}
+ [接下这份战书]
    ~ trust += 1
    -> growth_loop
+ [先问它凭什么]
    ~ trust += 2
    -> growth_loop

// 成长章：chapter_count - 1 章，每章一屏 + 一场杂兵战
=== growth_loop ===
{chapter >= chapter_count - 1: -> finale_route}
# scene: growth_gate
# bg: street_night
# cast: pet,scout
# keys: scout.hook,scout.offer
{say("scout.hook")}
{say("scout.offer")}
+ [正面碾过去]
    ~ trust += 1
    -> gate_battle
+ [先摸清底细]
    ~ trust += 2
    -> gate_battle
+ [绕开它，省点力气]
    {trust > 0:
        ~ trust -= 1
    }
    ~ route = "solo"
    -> gate_battle

=== gate_battle ===
# battle: minion
# win: gate_win
# lose: gate_lose
-> DONE

=== gate_win ===
~ chapter += 1
-> growth_loop

=== gate_lose ===
~ deaths += 1
{trust > 0:
    ~ trust -= 1
}
# scene: gate_lose
# bg: street_night
# cast: pet,scout
# keys: scout.lose
{say("scout.lose")}
+ [再来一次]
    -> gate_battle
+ [先撤，换个打法]
    ~ trust += 1
    -> growth_loop

// 路线分流：信任够高走「内应线」，否则「独行线」
=== finale_route ===
{trust >= 7:
    ~ route = "insider"
    -> finale
- else:
    ~ route = "solo"
    -> finale
}

=== finale ===
# scene: finale
# bg: summit
# cast: pet,boss
# keys: boss.hook,boss.challenge
{say("boss.hook")}
{say("boss.challenge")}
+ [决战]
    -> boss_battle
+ [回头看一眼走过的路]
    ~ trust += 1
    -> boss_battle

=== boss_battle ===
# battle: boss
# win: boss_win
# lose: boss_lose
-> DONE

=== boss_win ===
-> ending_check

=== boss_lose ===
~ deaths += 1
# scene: boss_lose
# bg: summit
# cast: pet,boss
# keys: boss.glory
{say("boss.glory")}
+ [再战]
    -> boss_battle
+ [认输，收兵]
    {trust >= 2:
        ~ trust -= 2
    }
    -> ending_check

// 结局匹配：按顺序取第一条命中的，最后一条兜底
=== ending_check ===
{trust >= 7 && deaths == 0:
    ~ ending_id = "ending_trust"
- else:
    {deaths >= 2:
        ~ ending_id = "ending_scarred"
    - else:
        {trust <= 1:
            ~ ending_id = "ending_alone"
        - else:
            ~ ending_id = "ending_standard"
        }
    }
}
-> ending

=== ending ===
# scene: ending
# ending
# bg: dawn
# cast: pet,narrator
# keys: narrator.ending_a,narrator.ending_b
{say("narrator.ending_a")}
{say("narrator.ending_b")}
-> END
