"""扫描层错误类型，API 层据此映射 HTTP 状态码。"""

from __future__ import annotations


class ScanError(Exception):
    """扫描失败的基类。"""

    status_code = 502

    def __init__(self, message: str, *, hint: str = "", retry_after: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint
        self.retry_after = retry_after


class RepoNotFound(ScanError):
    status_code = 404


class RateLimited(ScanError):
    status_code = 429


class UpstreamError(ScanError):
    status_code = 502


class PrivateRepo(ScanError):
    status_code = 403


class PetNotFound(ScanError):
    status_code = 404

    def __init__(self, message: str = "精灵不存在") -> None:
        super().__init__(message)
