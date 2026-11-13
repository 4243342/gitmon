"""平台令牌隔离。

GitHub 令牌有前缀，Gitee 私人令牌是一串裸十六进制 —— 用前缀挡住「跨平台串令牌」。
独立成模块是为了让扫描器与任务验真共用同一套判定，又不产生循环导入。
"""

from __future__ import annotations

# GitHub 令牌都有前缀，Gitee 私人令牌是一串裸十六进制 —— 用它来挡住"跨平台串令牌"
_GITHUB_TOKEN_PREFIXES = ("ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_")


def token_for(token: str | None, platform: str) -> str | None:
    """登录令牌只发给它自己的平台：GitHub 令牌不发给 Gitee，反之亦然。"""
    if not token:
        return token
    looks_github = token.startswith(_GITHUB_TOKEN_PREFIXES)
    if platform == "github" and not looks_github:
        return None
    if platform == "gitee" and looks_github:
        return None
    return token
