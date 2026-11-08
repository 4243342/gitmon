"""无状态渲染：README 徽章 SVG 与分享卡片 SVG。

两者都是「输入参数 → 字符串」的纯函数，所以能直接挂 Cache-Control 给 CDN。
"""

from __future__ import annotations

from html import escape
from typing import Any

from . import engine, sprite

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


def _esc(text: Any) -> str:
    return escape(str(text), quote=True)


def _stat_bars(stats: list[dict[str, Any]], x: int, y: int, width: int = 210, gap: int = 26,
               color: str = "#7aa2ff") -> list[str]:
    parts: list[str] = []
    for index, stat in enumerate(stats[:6]):
        value = int(stat.get("value") or 0)
        row = y + index * gap
        parts.append(f'<text x="{x}" y="{row + 10}" font-size="11" fill="#9aa7bd">{_esc(stat.get("name"))}</text>')
        parts.append(f'<rect x="{x + 42}" y="{row + 1}" width="{width}" height="8" rx="4" fill="#1d2433"/>')
        parts.append(
            f'<rect x="{x + 42}" y="{row + 1}" width="{max(2, int(width * value / 100))}" height="8" '
            f'rx="4" fill="{color}"/>'
        )
        parts.append(f'<text x="{x + 42 + width + 8}" y="{row + 10}" font-size="11" fill="#e6ecf5">{value}</text>')
    return parts


def badge_svg(pet: dict[str, Any], *, subtitle: str = "") -> str:
    q = pet["quality"]
    element = pet["element"]
    level = int(pet.get("level") or 1)
    label = pet.get("fullName") or pet.get("repo") or "repo"
    sub = subtitle or f"{element['name']}系{pet['species']['name']} · {q['name']}"
    width, height = 460, 112

    sprite_svg = sprite.sprite_svg(
        sprite_seed=int(pet.get("spriteSeed") or 0),
        color=element["color"],
        body=pet["species"]["body"],
        stage=int(pet.get("evolutionStage") or 1),
        x=18, y=22, size=68,
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="GitMon {_esc(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="q" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{q['color']}"/>
      <stop offset="1" stop-color="{element['color']}"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" rx="14" fill="url(#bg)" stroke="{q['color']}" stroke-opacity="0.45"/>
  <rect x="0" y="0" width="{width}" height="3" rx="1.5" fill="url(#q)"/>
  {sprite_svg}
  <text x="100" y="40" font-family="{FONT}" font-size="17" font-weight="700" fill="#f4f7fb">{_esc(label)}</text>
  <text x="100" y="61" font-family="{FONT}" font-size="12" fill="#9aa7bd">{_esc(sub)}</text>
  <g font-family="{FONT}">
    <rect x="100" y="74" width="34" height="20" rx="6" fill="{q['color']}" fill-opacity="0.16" stroke="{q['color']}" stroke-opacity="0.6"/>
    <text x="117" y="88" font-size="12" font-weight="700" fill="{q['color']}" text-anchor="middle">{_esc(q['key'])}</text>
    <text x="146" y="89" font-size="13" fill="#e6ecf5">Lv.{level}</text>
    <text x="200" y="89" font-size="11" fill="#7f8ba1">品质 {int(pet.get('qualityScore') or 0)} · 工程量 {int(pet.get('engineeringScore') or 0)}</text>
  </g>
  <g transform="translate(348,22)">
    <circle cx="22" cy="22" r="20" fill="none" stroke="#1d2433" stroke-width="5"/>
    <circle cx="22" cy="22" r="20" fill="none" stroke="{element['color']}" stroke-width="5"
      stroke-dasharray="{2 * 3.14159 * 20 * min(100, int(pet.get('qualityScore') or 0)) / 100:.1f} 999"
      transform="rotate(-90 22 22)" stroke-linecap="round"/>
    <text x="22" y="27" font-family="{FONT}" font-size="12" text-anchor="middle" fill="#f4f7fb">{int(pet.get('qualityScore') or 0)}</text>
  </g>
</svg>"""


def card_svg(pet: dict[str, Any]) -> str:
    q = pet["quality"]
    element = pet["element"]
    stats = pet.get("stats") or []
    skills = pet.get("skills") or []
    stage_name = engine.STAGE_NAMES.get(int(pet.get("evolutionStage") or 1), "幼体")
    width, height = 520, 880

    sprite_svg = sprite.sprite_svg(
        sprite_seed=int(pet.get("spriteSeed") or 0),
        color=element["color"],
        body=pet["species"]["body"],
        stage=int(pet.get("evolutionStage") or 1),
        x=110, y=86, size=300,
    )
    skill_parts: list[str] = []
    for index, skill in enumerate(skills[:4]):
        col = index % 2
        row = index // 2
        x = 60 + col * 210
        y = 690 + row * 32
        skill_parts.append(
            f'<rect x="{x}" y="{y}" width="190" height="26" rx="8" fill="#151b2b" stroke="{q["color"]}" stroke-opacity="0.35"/>'
            f'<text x="{x + 95}" y="{y + 18}" font-family="{FONT}" font-size="12" text-anchor="middle" fill="#e6ecf5">{_esc(skill)}</text>'
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="GitMon 卡片 {_esc(pet.get('fullName'))}">
  <defs>
    <linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1424"/>
      <stop offset="0.55" stop-color="#101a2e"/>
      <stop offset="1" stop-color="#070b14"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.34" r="0.62">
      <stop offset="0" stop-color="{q['color']}" stop-opacity="0.5"/>
      <stop offset="0.55" stop-color="{q['color']}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="{q['color']}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{q['color']}"/>
      <stop offset="1" stop-color="{element['color']}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="{width}" height="{height}" rx="26" fill="url(#bgg)"/>
  <rect x="0" y="0" width="{width}" height="{height}" rx="26" fill="url(#halo)"/>
  <rect x="1" y="1" width="{width - 2}" height="{height - 2}" rx="25" fill="none" stroke="{q['color']}" stroke-opacity="0.55"/>
  {sprite_svg}
  <text x="40" y="52" font-family="{FONT}" font-size="19" font-weight="700" fill="#f4f7fb">{_esc(pet.get('fullName'))}</text>
  <text x="40" y="74" font-family="{FONT}" font-size="12" fill="#9aa7bd">{_esc(pet.get('platform').upper())} · {stage_name} · {_esc(pet['element']['trait'])}</text>
  <g font-family="{FONT}">
    <rect x="{width - 96}" y="32" width="56" height="30" rx="9" fill="{q['color']}" fill-opacity="0.18" stroke="{q['color']}" stroke-opacity="0.7"/>
    <text x="{width - 68}" y="52" font-size="15" font-weight="700" text-anchor="middle" fill="{q['color']}">{_esc(q['key'])}</text>
    <text x="40" y="410" font-size="13" fill="#9aa7bd">{_esc(element['name'])}系 · {_esc(pet['species']['name'])} · {_esc(pet['species']['type'])}</text>
    <text x="40" y="446" font-size="30" font-weight="700" fill="#f4f7fb">Lv.{int(pet.get('level') or 1)}</text>
    <rect x="40" y="458" width="440" height="10" rx="5" fill="#1a2233"/>
    <rect x="40" y="458" width="{max(8, int(440 * min(999, int(pet.get('level') or 1)) / 999))}" height="10" rx="5" fill="url(#accent)"/>
    <text x="{width - 40}" y="446" font-size="12" text-anchor="end" fill="#9aa7bd">HP {int(pet.get('hp') or 0)}</text>
    <text x="40" y="498" font-size="11" fill="#7f8ba1">品质 {int(pet.get('qualityScore') or 0)} / 100　工程量 {int(pet.get('engineeringScore') or 0)} / 100</text>
  </g>
  {''.join(_stat_bars(stats, 40, 516, width=190, gap=24, color=q['color']))}
  {''.join(skill_parts)}
  <text x="{width / 2}" y="{height - 18}" font-family="{FONT}" font-size="11" text-anchor="middle" fill="#5f6b80">GitMon · 编码即养成</text>
</svg>"""


def placeholder_badge(message: str = "repo not scanned") -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="300" height="40" role="img" aria-label="GitMon">
  <rect width="300" height="40" rx="8" fill="#111827"/>
  <rect x="0.5" y="0.5" width="299" height="39" rx="8" fill="none" stroke="#2a3345"/>
  <text x="16" y="25" font-family="{FONT}" font-size="12" fill="#9aa7bd">GitMon · {_esc(message)}</text>
</svg>"""
