{
  "_readme": "斗码苍穹的成品配音清单。ink 里用 # opening: <文件> / # narration: <文件> 声明「这一屏是解说屏，播这个文件」。文件放在同目录 audio/ 下，缺文件时构建守卫会报错（story-build.mjs）。解说屏一进来就要响，所以配音是包内成品，不是运行时 TTS。",
  "_spec": {
    "format": "mp3 / m4a / wav / ogg / aac / flac 都可以，packAudio.js 都能加载。",
    "naming": "<台词 key 里的点换成下划线>.m4a。比如 narrator.origin_a → narrator_origin_a.m4a。",
    "duration": "解说语速约 6.8 字/秒（贴 opening.mp3 的节奏）。一屏控制在 80 字以内 —— 一屏超过 120 字会排到 8 行、撑破解说屏，宁可拆成两屏。",
    "voice": "默认 Kokoro sid=52（zm_yunyang，低沉男声解说腔），避开宠物（50）和 boss（49）的音。"
  },
  "_rebuild": "改完 lines.json 后重录：backend/.venv/bin/python scripts/tts-narration.py douma narrator.origin_a narrator.origin_b --speed 1.18",
  "_note": "Kokoro 中文词典认不出的写法（GitHub、「」、——）在合成时会被跳过，脚本里已经做了替换；显示给玩家看的文案仍保留原来的写法。",
  "clips": {
    "opening": {
      "file": "opening.mp3",
      "screen": "opening",
      "text_key": "narrator.opening",
      "note": "开章第一段：这是什么样的世界。用户提供的成品配音，未做任何处理。"
    },
    "narrator_origin_a": {
      "file": "narrator_origin_a.m4a",
      "screen": "origin_a",
      "text_key": "narrator.origin_a",
      "note": "身世第一拍：他当年多强 —— 四岁修炼 Python、十岁握有 GitHub Copilot、十一岁凝聚代码之力，最年轻的 P6 码师。"
    },
    "narrator_origin_b": {
      "file": "narrator_origin_b.m4a",
      "screen": "origin_b",
      "text_key": "narrator.origin_b",
      "note": "身世第二拍：他怎么跌下来 —— 十一岁那年「丧失」了写代码的能力，码量从 P6 跌到 P3，三年冷落、被退婚。"
    }
  }
}
