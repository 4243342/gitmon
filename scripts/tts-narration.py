#!/usr/bin/env python3
"""合成剧本包的成品旁白配音。

为什么要有这个脚本：
    开章解说屏的配音是「随包走」的成品文件（packs/<id>/audio/xxx.mp3），
    不是运行时 TTS —— 运行时合成会等、而且本地引擎是 CPU 串行的，
    一屏解说要等十几秒才开口。成品文件随包走，打开就能响。

    但旁白台词是定稿文案，改一句就要重录。这里把「改文案 → 重录」这条
    链路做成一���命令：改 lines.json → 跑这个脚本 → 音频文件更新。

用法：
    python3 scripts/tts-narration.py douma                     # 录全部带标记的台词
    python3 scripts/tts-narration.py douma narrator.origin     # 只录这一条
    python3 scripts/tts-narration.py douma --sid 52            # 指定音色

音色（sherpa-onnx + Kokoro 中文）：
    45 zf_xiaobei / 46 zf_xiaoni / 47 zf_xiaoxiao / 48 zf_xiaoyi
    49 zm_yunjian / 50 zm_yunxi / 51 zm_yunxia / 52 zm_yunyang
    解说腔要低沉稳，所以默认用 52（zm_yunyang），避开宠物 / boss 的音。

输出：
    packs/<id>/audio/<key 里的点换成下划线>.wav
    wav 是无损的、体积比 mp3 大；能转 mp3 就转（macOS 自带 afconvert）。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PACKS = ROOT / "src" / "story" / "packs"

sys.path.insert(0, str(BACKEND))

# 解说默认音色：zm_yunyang（低沉男声），避���宠物 / boss 的音
DEFAULT_SID = 52
# 每条旁白的上限：再长就分屏（ink 里多写一屏）
MAX_CHARS = 180


def synth(text: str, sid: int, speed: float = 1.0) -> tuple[bytes, int]:
    """合成一段音频，返回 (wav 字节, 采样率)。"""
    from gitmon_api import tts

    audio = tts._load_local()
    with tts._synth_lock:
        out = audio.generate(text, sid=int(sid), speed=float(speed))
    if not out.samples:
        raise SystemExit("本地合成返回空音频")
    return tts._wav_bytes(out), int(out.sample_rate)


def to_audio(wav_path: Path) -> Path:
    """macOS 自带 afconvert 能转成 m4a（AAC）；转不了就留着 wav（浏览器一样能播）。

    注意别把 m4a 改名成 mp3 —— 容器和扩展名对不上，某些浏览器会拒播。
    """
    m4a = wav_path.with_suffix(".m4a")
    try:
        proc = subprocess.run(
            ["afconvert", "-f", "mp4f", "-d", "aac", "-b", "64000",
             str(wav_path), str(m4a)],
            capture_output=True, timeout=180,
        )
        if proc.returncode == 0 and m4a.exists() and m4a.stat().st_size > 0:
            wav_path.unlink()
            return m4a
    except Exception:
        pass
    return wav_path


# Kokoro 中文词典里没有的写法，念出来会变成空洞（OOV 直接被跳过）。
# 这些是剧本里必然会出现的：英文项目名、中文书名号、破折号。
# 只在合成时替换 —— 显示给玩家看的文案仍保留原来的书名号。
OOV_FIXES = [
    ("GitHub Copilot", "Git Hub Copilot 助手"),
    ("GitHub", "Git Hub"),
    ("Python", "派森"),
    ("python", "派森"),
    ("「", ""),
    ("」", ""),
    ("“", ""),
    ("”", ""),
    ("——", "，"),
    ("…", "，"),
]


def for_speech(text: str) -> str:
    """把文本收拾成 Kokoro 念得出来的样子。"""
    out = str(text)
    for src, dst in OOV_FIXES:
        out = out.replace(src, dst)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pack")
    ap.add_argument("keys", nargs="*", help="要录的台词 key；不给就录所有标记过的")
    ap.add_argument("--sid", type=int, default=DEFAULT_SID, help="Kokoro 音色 id")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--out-dir", default="")
    args = ap.parse_args()

    pack_dir = PACKS / args.pack
    lines_path = pack_dir / "lines.json"
    if not lines_path.exists():
        raise SystemExit(f"找不到剧本包：{pack_dir}")

    lines = json.loads(lines_path.read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir) if args.out_dir else pack_dir / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 要录哪些：显式指定就按指定；否则录所有以 narrator. 开头的
    if args.keys:
        targets = [k for k in args.keys if k in lines]
        missing = [k for k in args.keys if k not in lines]
        if missing:
            raise SystemExit(f"lines.json 里没有这些 key：{', '.join(missing)}")
    else:
        targets = [k for k in lines if k.startswith("narrator.")]
    if not targets:
        raise SystemExit("没有要录的台词")

    for key in targets:
        text = str(lines[key]).strip()
        if len(text) > MAX_CHARS:
            print(f"  ! {key} 有 {len(text)} 字，超过 {MAX_CHARS} —— 建议在 ink 里分屏")
        wav, rate = synth(for_speech(text), args.sid, args.speed)
        stem = key.replace(".", "_")
        wav_path = out_dir / f"{stem}.wav"
        wav_path.write_bytes(wav)
        final = to_audio(wav_path)
        # 16bit 单声道 = 2 字节一个采样
        secs = len(wav) / (rate * 2)
        print(f"  ✓ {key} → {final.name}（{secs:.1f}s，{len(text)} 字，sid={args.sid}）")

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
