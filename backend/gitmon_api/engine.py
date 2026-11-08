"""判定引擎：仓库快照 → 精灵。

纯函数，零 IO、零网络、零数据库，可以单独跑单测。
同一份快照必然产出同一只精灵；品种与立绘种子只由仓库标识决定，
所以重新扫描不会让精灵"换脸"。
"""

from __future__ import annotations

import math
from typing import Any

from . import traits as trait_mod
from .repo import RepoRef
from .scanner.snapshot import RepoSnapshot

# ---------------------------------------------------------------- 品种常量

ELEMENTS: list[dict[str, Any]] = [
    {"key": "water", "name": "水", "color": "#4a9eff", "langs": ["Python"], "trait": "柔韧多变，数据与 AI 之灵"},
    {"key": "thunder", "name": "雷", "color": "#f5c542", "langs": ["JavaScript", "TypeScript", "Vue", "Svelte"], "trait": "敏捷爆发，无处不在"},
    {"key": "steel", "name": "钢", "color": "#9fb2c8", "langs": ["Rust", "Zig"], "trait": "坚硬安全，极可靠"},
    {"key": "earth", "name": "地", "color": "#a67c52", "langs": ["Go"], "trait": "朴实稳重，并发之力"},
    {"key": "rock", "name": "岩", "color": "#b08968", "langs": ["Java", "Kotlin", "Scala", "C#", "Groovy"], "trait": "厚重耐久，企业级巨兽"},
    {"key": "fire", "name": "火", "color": "#ff6b4a", "langs": ["C", "C++", "Objective-C"], "trait": "原始强大，难以掌控"},
    {"key": "wind", "name": "风", "color": "#7fd4c1", "langs": ["Swift", "Dart"], "trait": "轻快现代，移动之翼"},
    {"key": "grass", "name": "草", "color": "#7bc96f", "langs": ["Ruby", "PHP", "Elixir", "Lua"], "trait": "优雅治愈，注重幸福感"},
    {"key": "normal", "name": "普通", "color": "#b8b8b8", "langs": ["Shell", "HTML", "CSS", "R"], "trait": "平平无奇，潜力未知"},
]

SPECIES: list[dict[str, Any]] = [
    {"key": "beast", "name": "兽型", "type": "Web 应用", "body": "biped"},
    {"key": "bird", "name": "鸟型", "type": "工具/CLI", "body": "winged"},
    {"key": "element", "name": "元素型", "type": "库/框架", "body": "slime"},
    {"key": "dragon", "name": "龙型", "type": "AI/数据", "body": "quadruped"},
    {"key": "flying", "name": "飞行型", "type": "移动端", "body": "winged"},
    {"key": "phantom", "name": "幻兽型", "type": "游戏/图形", "body": "golem"},
    {"key": "fairy", "name": "精灵型", "type": "文档/博客", "body": "spirit"},
]

QUALITIES: list[dict[str, Any]] = [
    {"key": "N", "name": "普通", "min": 0.0, "color": "#9e9e9e", "glow": "rgba(158,158,158,.5)"},
    {"key": "R", "name": "稀有", "min": 40.0, "color": "#42a5f5", "glow": "rgba(66,165,245,.55)"},
    {"key": "SR", "name": "史诗", "min": 60.0, "color": "#ab47bc", "glow": "rgba(171,71,188,.6)"},
    {"key": "SSR", "name": "传说", "min": 80.0, "color": "#ffb300", "glow": "rgba(255,179,0,.7)"},
]

STAT_NAMES = ["攻击", "防御", "速度", "特攻", "特防", "HP"]
# 进化阶梯（文档 §6.1）：Lv.10/50/100/200/300/500/800/999 八个节点，共 9 个形态
# Lv.500 起进入人形态（人类身体 + 种族/属性特征），500 以下是自由兽形
STAGE_LEVELS = (1, 10, 50, 100, 200, 300, 500, 800, 999)
STAGE_NAMES = {
    1: "幼体",
    2: "初生体",
    3: "成长体",
    4: "成熟体",
    5: "强化体",
    6: "完全体",
    7: "人形态",
    8: "人形态·觉醒",
    9: "人形态·神话",
}
HUMANOID_FROM = 7
QUALITY_BOOST = {"N": 0.7, "R": 0.85, "SR": 1.0, "SSR": 1.15}

SKILL_LIB: dict[str, list[str]] = {
    "water": ["数据缠绕", "爬虫之网", "张量洪流", "梯度俯冲"],
    "thunder": ["全栈突袭", "npm 风暴", "热更新闪避", "异步电击"],
    "steel": ["所有权锁链", "零成本抽象", "编译期预判", "无畏并发"],
    "earth": ["协程之墙", "信道封锁", "地脉震荡", "简洁之力"],
    "rock": ["虚拟机碾压", "企业级壁垒", "泛型重击", "巨石阵"],
    "fire": ["指针烈焰", "内存灼烧", "内核爆裂", "汇编之怒"],
    "wind": ["滑翔突袭", "Swift 之翼", "气流屏障", "轻装疾行"],
    "grass": ["优雅治愈", "块之缠绕", "幸福光环", "藤蔓束缚"],
    "normal": ["管道连击", "脚本冲锋", "万能胶水", "隐身守护"],
}

# 生态类型的判定线索（依赖名，全部小写）
WEB_DEPS = {
    "react", "vue", "next", "nuxt", "svelte", "angular", "@angular/core", "solid-js", "astro",
    "express", "koa", "fastify", "nest", "nestjs", "@nestjs/core", "hono", "django", "flask",
    "fastapi", "starlette", "rails", "sinatra", "spring-boot", "spring-webmvc", "laravel",
    "symfony", "gin", "echo", "fiber", "actix-web", "axum", "rocket", "phoenix", "vapor",
}
CLI_DEPS = {
    "commander", "yargs", "oclif", "@oclif/core", "ink", "meow", "cac", "minimist",
    "click", "typer", "argparse", "docopt", "cobra", "urfave/cli", "clap", "structopt",
    "commander-js", "rich", "questionary", "inquirer", "prompts", "picocli", "thor",
}
ML_DEPS = {
    "torch", "pytorch", "tensorflow", "tensorflow-gpu", "jax", "jaxlib", "keras", "scikit-learn",
    "sklearn", "transformers", "datasets", "accelerate", "xgboost", "lightgbm", "catboost",
    "onnx", "onnxruntime", "vllm", "langchain", "openai", "anthropic", "diffusers", "peft",
    "timm", "spacy", "nltk", "pandas", "numpy", "polars", "dask", "pyspark", "mlflow",
    "wandb", "optuna", "deepspeed", "triton", "sentence-transformers", "llama-index",
}
MOBILE_DEPS = {
    "react-native", "expo", "flutter", "@capacitor/core", "cordova", "ionic", "androidx.core",
    "com.android.application", "swiftui", "uikit", "alamofire", "xamarin.forms", "kotlinx-coroutines-android",
}
GAME_DEPS = {
    "three", "pixi.js", "phaser", "babylonjs", "@babylonjs/core", "bevy", "macroquad", "ggez",
    "pygame", "arcade", "raylib", "sfml", "sdl2", "glfw", "wgpu", "vulkan", "unity",
    "godot", "monogame", "love2d", "playcanvas", "aframe",
}
DOCS_DEPS = {
    "hugo", "vitepress", "vuepress", "docusaurus", "@docusaurus/core", "mkdocs", "mkdocs-material",
    "nextra", "gatsby", "jekyll", "hexo", "astro", "docsify", "sphinx", "furo", "mdbook",
    "typedoc", "jsdoc", "storybook", "@storybook/react",
}

TOPIC_HINTS: dict[str, tuple[str, int]] = {
    "machine-learning": ("dragon", 3), "deep-learning": ("dragon", 3), "llm": ("dragon", 3),
    "artificial-intelligence": ("dragon", 3), "data-science": ("dragon", 3), "ai": ("dragon", 2),
    "cli": ("bird", 3), "command-line": ("bird", 2), "terminal": ("bird", 2), "tool": ("bird", 1),
    "game": ("phantom", 3), "gamedev": ("phantom", 3), "graphics": ("phantom", 2), "shader": ("phantom", 2),
    "android": ("flying", 3), "ios": ("flying", 3), "flutter": ("flying", 2), "mobile": ("flying", 2),
    "blog": ("fairy", 3), "documentation": ("fairy", 3), "static-site": ("fairy", 2), "docs": ("fairy", 2),
    "web": ("beast", 2), "frontend": ("beast", 2), "backend": ("beast", 2), "api": ("beast", 1),
    "framework": ("beast", 1), "library": ("element", 1),
}

TYPED_LANGS = {"Rust", "Go", "TypeScript", "Java", "Kotlin", "C#", "Swift", "Scala", "Dart"}


# ---------------------------------------------------------------- 基础工具

def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def lognorm(value: float, cap: float) -> float:
    """对数归一化到 0~1，防止巨型 monorepo 碾压一切。"""
    if value <= 0:
        return 0.0
    return clamp(math.log10(1.0 + value) / math.log10(1.0 + cap), 0.0, 1.0)


def fnv1a32(text: str) -> int:
    """与前端 hashSeed 完全一致（FNV-1a，按 UTF-16 码元）。"""
    h = 2166136261
    data = text.encode("utf-16-le", "surrogatepass")
    for i in range(0, len(data), 2):
        unit = data[i] | (data[i + 1] << 8)
        h ^= unit
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def make_rng(seed: int):
    """与前端 makeRng 相同的 mulberry32 序列，保证服务端立绘与前端一致。"""
    state = seed & 0xFFFFFFFF

    def _rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61))) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return _rand


# ---------------------------------------------------------------- 品种

def element_by_key(key: str) -> dict[str, Any]:
    for element in ELEMENTS:
        if element["key"] == key:
            return element
    return ELEMENTS[-1]


def species_by_key(key: str) -> dict[str, Any]:
    for species in SPECIES:
        if species["key"] == key:
            return species
    return SPECIES[2]


def quality_by_key(key: str) -> dict[str, Any]:
    for quality in QUALITIES:
        if quality["key"] == key:
            return quality
    return QUALITIES[0]


def element_for_language(language: str) -> str:
    for element in ELEMENTS:
        if language in element["langs"]:
            return element["key"]
    low = (language or "").lower()
    if low in {"jupyter notebook", "python"}:
        return "water"
    if low in {"html", "css", "scss", "shell", "dockerfile"}:
        return "normal"
    if low in {"sql"}:
        return "rock"
    return "normal"


def _dep_hits(deps: set[str], table: set[str]) -> int:
    return sum(1 for dep in deps if dep in table)


def derive_species(snapshot: RepoSnapshot) -> tuple[str, str | None, str]:
    """返回 (主属性, 副属性或 None, 生态类型)。"""
    share: dict[str, float] = snapshot.tree.get("lang_share") or {}
    primary_lang = snapshot.tree.get("primary_language") or snapshot.language or ""
    if not share and primary_lang:
        share = {primary_lang: 1.0}
    if share and not primary_lang:
        primary_lang = next(iter(share))

    element = element_for_language(primary_lang)
    secondary: str | None = None
    for lang, ratio in list(share.items())[1:]:
        if ratio < 0.3:
            continue
        candidate = element_for_language(lang)
        if candidate != element:
            secondary = candidate
            break

    deps = {d.lower() for d in snapshot.dependencies}
    topics = {t.lower() for t in snapshot.topics}
    description = (snapshot.description or "").lower()
    tree = snapshot.tree
    flags = tree.get("flags") or {}

    scores = {species["key"]: 0 for species in SPECIES}
    scores["beast"] += 3 * _dep_hits(deps, WEB_DEPS)
    scores["bird"] += 3 * _dep_hits(deps, CLI_DEPS)
    scores["dragon"] += 3 * _dep_hits(deps, ML_DEPS)
    scores["flying"] += 3 * _dep_hits(deps, MOBILE_DEPS)
    scores["phantom"] += 3 * _dep_hits(deps, GAME_DEPS)
    scores["fairy"] += 3 * _dep_hits(deps, DOCS_DEPS)

    if "__bin__" in deps:
        scores["bird"] += 4
    if flags.get("has_android") or flags.get("has_ios"):
        scores["flying"] += 3
    if flags.get("has_notebooks"):
        scores["dragon"] += 3
    if flags.get("has_shaders"):
        scores["phantom"] += 2
    if float(tree.get("md_ratio") or 0) >= 0.6 and int(tree.get("code_files") or 0) <= 40:
        scores["fairy"] += 4

    for topic in topics:
        hint = TOPIC_HINTS.get(topic)
        if hint:
            scores[hint[0]] += hint[1]

    for keyword, key, weight in (
        ("machine learning", "dragon", 2), ("neural", "dragon", 2), ("llm", "dragon", 2),
        ("command line", "bird", 2), ("cli", "bird", 2),
        ("game engine", "phantom", 2), ("rendering", "phantom", 1),
        ("framework", "beast", 1), ("web app", "beast", 2), ("server", "beast", 1),
        ("library", "element", 1), ("sdk", "element", 1),
    ):
        if keyword in description:
            scores[key] += weight

    # 稳定的平局裁决：按 SPECIES 声明顺序
    order = {species["key"]: index for index, species in enumerate(SPECIES)}
    best_key, best_score = max(scores.items(), key=lambda kv: (kv[1], -order[kv[0]]))
    if best_score <= 0:
        best_key = "element"
    return element, secondary, best_key


# ---------------------------------------------------------------- 品质

TEST_FRAMEWORKS = {
    "pytest", "unittest", "nose", "tox", "jest", "vitest", "mocha", "jasmine", "ava", "karma",
    "cypress", "playwright", "@playwright/test", "testing-library", "junit", "junit-jupiter",
    "testng", "mockito", "rspec", "minitest", "phpunit", "pest", "testify", "gomock",
    "gtest", "googletest", "catch2", "doctest", "bats", "xunit", "nunit",
}


def quality_dimensions(snapshot: RepoSnapshot) -> dict[str, float]:
    tree = snapshot.tree
    deps = {d.lower() for d in snapshot.dependencies}
    has_ci = bool(tree.get("ci_files"))
    has_lint = bool(tree.get("lint_files"))

    # 1) 测试完备度 25%
    ratio = snapshot.test_ratio
    tests = min(60.0, ratio / 0.25 * 60.0) if ratio else 0.0
    if deps & TEST_FRAMEWORKS:
        tests += 25.0
    if has_ci:
        tests += 15.0

    # 2) 工程质量 20%
    primary = tree.get("primary_language") or snapshot.language or ""
    engineering = (40.0 if has_ci else 0.0) + (20.0 if has_lint else 0.0)
    if tree.get("type_files") or primary in TYPED_LANGS:
        engineering += 15.0
    engineering += min(25.0, snapshot.releases_last_year * 8.0)

    # 3) 文档完整度 20%
    readme = snapshot.readme_chars
    docs = 40.0 if readme >= 2000 else 28.0 if readme >= 800 else 15.0 if readme >= 200 else 0.0
    if snapshot.license:
        docs += 20.0
    if tree.get("flags", {}).get("has_changelog"):
        docs += 15.0
    if tree.get("flags", {}).get("has_contributing"):
        docs += 10.0
    if tree.get("flags", {}).get("has_docs_dir"):
        docs += 15.0

    # 4) 维护健康度 20%
    days = snapshot.days_since_push
    maintenance = 40.0 if days <= 90 else 30.0 if days <= 180 else 18.0 if days <= 365 else 6.0 if days <= 730 else 0.0
    maintenance += snapshot.issue_close_ratio * 25.0
    maintenance += 15.0 if snapshot.releases_last_year > 0 else 0.0
    maintenance += 10.0 if snapshot.contributors >= 2 else 0.0
    maintenance += snapshot.merged_ratio * 10.0

    # 5) 社区认可 15%
    community = (
        lognorm(snapshot.stars, 20000) * 60.0
        + lognorm(snapshot.forks, 5000) * 20.0
        + lognorm(snapshot.watchers, 2000) * 10.0
    )
    if snapshot.archived:
        community -= 10.0

    return {
        "tests": round(clamp(tests), 1),
        "engineering": round(clamp(engineering), 1),
        "docs": round(clamp(docs), 1),
        "maintenance": round(clamp(maintenance), 1),
        "community": round(clamp(community), 1),
    }


QUALITY_WEIGHTS = {"tests": 0.25, "engineering": 0.20, "docs": 0.20, "maintenance": 0.20, "community": 0.15}


def quality_score(snapshot: RepoSnapshot) -> tuple[float, dict[str, float], dict[str, Any]]:
    dims = quality_dimensions(snapshot)
    total = round(sum(dims[key] * weight for key, weight in QUALITY_WEIGHTS.items()), 1)
    quality = quality_by_key("N")
    for candidate in QUALITIES:
        if total >= candidate["min"]:
            quality = candidate
    return total, dims, quality


# ---------------------------------------------------------------- 工程量与等级

def engineering_score(snapshot: RepoSnapshot) -> float:
    tree = snapshot.tree
    loc = float(tree.get("loc") or 0)
    parts = {
        "loc": (lognorm(loc, 800_000), 0.35),
        "commits": (lognorm(snapshot.commits_total, 20_000), 0.20),
        "files": (lognorm(int(tree.get("code_files") or 0), 5_000), 0.15),
        "contributors": (lognorm(snapshot.contributors, 500), 0.15),
        "age": (lognorm(snapshot.age_months, 120), 0.15),
    }
    return round(clamp(sum(value * weight for value, weight in parts.values()) * 100.0), 1)


def level_from_engineering(score: float) -> int:
    """设计文档 §5.2：工程量只决定初始等级，不封顶于出生。"""
    if score < 20:
        level = 1 + score / 20 * 48
    elif score < 40:
        level = 50 + (score - 20) / 20 * 99
    elif score < 60:
        level = 150 + (score - 40) / 20 * 149
    elif score < 80:
        level = 300 + (score - 60) / 20 * 199
    elif score < 95:
        level = 500 + (score - 80) / 15 * 299
    else:
        level = 800 + (score - 95) / 5 * 199
    return int(clamp(level, 1, 999))


def evolution_stage(level: int, snapshot: RepoSnapshot | None = None) -> int:
    """阶段只看等级（snapshot 参数保留兼容）。Lv.500+ 进入人形态。"""
    stage = 1
    for i, min_level in enumerate(STAGE_LEVELS):
        if level >= min_level:
            stage = i + 1
    return stage


def is_humanoid(stage: int) -> bool:
    return int(stage) >= HUMANOID_FROM


def next_stage_level(stage: int) -> int | None:
    idx = int(stage)
    return STAGE_LEVELS[idx] if 0 < idx < len(STAGE_LEVELS) else None


# ---------------------------------------------------------------- 六维与技能

def stats_for(snapshot: RepoSnapshot, quality_key: str) -> list[dict[str, Any]]:
    tree = snapshot.tree
    deps = snapshot.dependencies
    boost = QUALITY_BOOST.get(quality_key, 1.0)

    atk = lognorm(snapshot.commits_90d, 300) * 70 + lognorm(len(deps), 120) * 15 + 15
    def_score = (
        (35 if tree.get("ci_files") else 0)
        + min(35.0, snapshot.test_ratio / 0.25 * 35.0)
        + (20 if snapshot.releases_last_year else 0)
        + (10 if snapshot.merged_ratio > 0.5 else 0)
    )
    freshness = 1.0 - min(1.0, snapshot.days_since_push / 365.0)
    spd = freshness * 55 + snapshot.issue_close_ratio * 25 + lognorm(snapshot.prs_merged, 2000) * 20
    satk = lognorm(len(deps), 120) * 55 + min(25.0, int(tree.get("language_count") or 1) * 4.0) + 20
    complexity = float(tree.get("complexity_per_file") or 0)
    sdef = (
        (35 if snapshot.readme_chars >= 1500 else 20 if snapshot.readme_chars else 0)
        + (30 if snapshot.license else 0)
        + (20 if tree.get("lint_files") else 10)
        + max(0.0, 15.0 - complexity * 1.2)
        + (0 if tree.get("source") == "scc" else 5)
    )
    hp = lognorm(snapshot.age_months, 120) * 55 + lognorm(snapshot.active_months, 24) * 45

    raw = [atk, def_score, spd, satk, sdef, hp]
    stats = []
    for name, value in zip(STAT_NAMES, raw):
        adjusted = clamp(value * boost, 5, 100)
        stats.append({"name": name, "value": int(round(adjusted))})
    return stats


def skills_for(element_key: str, stage: int, seed: int, species_key: str = "element") -> list[str]:
    lib = list(SKILL_LIB.get(element_key, SKILL_LIB["normal"]))
    rng = make_rng(seed ^ 0x5EED)
    # Fisher-Yates，用种子决定顺序，保证同一只精灵技能固定
    for index in range(len(lib) - 1, 0, -1):
        swap = int(rng() * (index + 1))
        lib[index], lib[swap] = lib[swap], lib[index]
    count = 2 if stage == 1 else 3 if stage == 2 else 4
    chosen = lib[:count]
    if species_key == "dragon" and "张量洪流" in chosen:
        chosen = ["张量洪流"] + [skill for skill in chosen if skill != "张量洪流"]
    return chosen


# ---------------------------------------------------------------- 主入口

def sprite_seed_for(ref: RepoRef) -> tuple[int, int]:
    """与前端 engine.js 同算法：同仓库必得同一只立绘。"""
    seed = fnv1a32(f"{ref.platform}/{ref.full_name}")
    sprite_seed = fnv1a32(f"{seed}{ref.full_name}")
    return seed, sprite_seed


def judge(snapshot: RepoSnapshot, *, keep_species: tuple[str, str | None, str] | None = None) -> dict[str, Any]:
    """快照 → 精灵判定结果。keep_species 用于重新扫描时锁定原品种。"""
    ref = snapshot.ref
    seed, sprite_seed = sprite_seed_for(ref)

    if keep_species:
        element_key, secondary, species_key = keep_species
    else:
        element_key, secondary, species_key = derive_species(snapshot)

    score, dims, quality = quality_score(snapshot)
    eng = engineering_score(snapshot)
    level = level_from_engineering(eng)
    stage = evolution_stage(level, snapshot)
    stats = stats_for(snapshot, quality["key"])

    # §6.3 / §6.4：根基与性格词条。AI 味只压根基与词条，不改品质分。
    # 置信度 low 的检测结果直接忽略——宁可漏判，不可误伤（§12.5）。
    raw_ai_rate = snapshot.tree.get("ai_rate")
    if snapshot.tree.get("ai_confidence") == "low":
        raw_ai_rate = None
    ai_rate = float(raw_ai_rate) if raw_ai_rate is not None else None
    foundation, foundation_dims = trait_mod.foundation_score(snapshot, ai_rate)
    trait_list = trait_mod.derive_traits(
        snapshot, ai_rate=ai_rate, element_secondary=secondary
    )
    stats = trait_mod.apply_to_stats(stats, trait_list)

    return {
        "seed": seed,
        "sprite_seed": sprite_seed,
        "element_key": element_key,
        "element_secondary": secondary,
        "species_key": species_key,
        "quality": quality["key"],
        "quality_score": score,
        "quality_dims": dims,
        "engineering_score": eng,
        "level": level,
        "evolution_stage": stage,
        "stats": stats,
        "skills": skills_for(element_key, stage, sprite_seed, species_key),
        "hp": stats[5]["value"] * 10,
        "foundation": foundation,
        "foundation_dims": foundation_dims,
        "foundation_tier": trait_mod.foundation_tier(foundation),
        "traits": trait_list,
        "trait_summary": trait_mod.summary(trait_list),
        "ai_rate": ai_rate,
        "xp_multiplier": trait_mod.xp_multiplier(trait_list),
        "milestone_bonus": trait_mod.milestone_bonus(trait_list),
        "metrics": snapshot.metrics(),
        "notes": list(snapshot.notes),
        "degraded": snapshot.degraded,
    }


def presentation(spec: dict[str, Any]) -> dict[str, Any]:
    """把判定结果补齐成前端直接可用的字段。"""
    element = element_by_key(spec["element_key"])
    species = species_by_key(spec["species_key"])
    quality = quality_by_key(spec["quality"])
    return {
        "element": {
            "key": element["key"], "name": element["name"], "color": element["color"], "trait": element["trait"],
        },
        "elementSecondary": (
            {"key": element_by_key(spec["element_secondary"])["key"], "name": element_by_key(spec["element_secondary"])["name"],
             "color": element_by_key(spec["element_secondary"])["color"]}
            if spec.get("element_secondary") else None
        ),
        "species": {
            "key": species["key"], "name": species["name"], "type": species["type"], "body": species["body"],
        },
        "quality": {
            "key": quality["key"], "name": quality["name"], "color": quality["color"], "glow": quality["glow"],
        },
        "evolutionStageName": STAGE_NAMES.get(spec["evolution_stage"], "幼体"),
    }
