// 剧本包 · 斗码苍穹（斗破苍穹骨架）
//
// 语汇：开源项目被拟作宗门，star 是香火，fork 是分家，release 是境界。
// 序章 = 被逐出山门的少年；药老 = 藏在旧代码里的老前辈；魂殿 = 抄袭者组织；
// 云岚宗 = 坐镇山巅的巨头项目。
//
// 结构约定与默认包一致（运行时按标签解析）：
//   # scene: <id> / # bg: <key> / # cast: a,b / # keys: a,b
//   # battle: minion|boss / # win: <knot> / # lose: <knot> / # ending
//
// 变量契约与运行时 KNOWN_VARS 对齐：chapter / chapter_count / trust / deaths / route / ending_id

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

// 序章：被划出宗门名册的那天
=== prologue ===
# scene: prologue
# bg: dawn
# cast: pet,narrator
# keys: narrator.hook,pet.oath
{say("narrator.hook")}
{say("pet.oath")}
+ [接下这道战书]
    ~ trust += 1
    -> growth_loop
+ [先问凭什么]
    ~ trust += 2
    -> growth_loop

// 成长章：chapter_count - 1 章，每章一屏 + 一场杂兵战
=== growth_loop ===
{chapter >= chapter_count - 1: -> finale_route}
{chapter == 1: -> soul_scene}
-> growth_gate

=== growth_gate ===
# scene: growth_gate
# bg: alley
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

// 魂殿：抄作业的组织，专挑没有靠山的人下手
=== soul_scene ===
# scene: soul_gate
# bg: alley
# cast: pet,soul
# keys: soul.taunt,pet.resolve
{say("soul.taunt")}
{say("pet.resolve")}
+ [今晚就把算法开源]
    ~ trust += 2
    -> growth_gate
+ [先藏起来，换个地方炼]
    ~ trust += 1
    -> growth_gate

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
# bg: alchemy
# cast: pet,scout
# keys: scout.lose
{say("scout.lose")}
+ [再来一次]
    -> gate_battle
+ [先撤，回去重炼]
    ~ trust += 1
    -> growth_loop

// 终章分流：信任够高有人接应，否则一个人硬闯
=== finale_route ===
{trust >= 7:
    ~ route = "insider"
    -> finale_insider
- else:
    ~ route = "solo"
    -> finale_solo
}

=== finale_insider ===
# scene: finale_insider
# bg: alchemy
# cast: pet,scout
# keys: scout.ally
{say("scout.ally")}
+ [借这一手，登上山门]
    -> boss_battle

=== finale_solo ===
# scene: finale_solo
# bg: sect
# cast: pet,narrator
# keys: narrator.solo
{say("narrator.solo")}
+ [一个人，踏上石阶]
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
# bg: sect
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
    ~ ending_id = "ending_flame"
- else:
    {deaths >= 2:
        ~ ending_id = "ending_withered"
    - else:
        {trust <= 1:
            ~ ending_id = "ending_lone"
        - else:
            ~ ending_id = "ending_steady"
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
