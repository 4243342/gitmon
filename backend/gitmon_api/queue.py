"""进程内扫描队列。

回合一：设计文档 §8.1 —— 重活只有"扫描仓库"一件事，单 worker 串行消化就够，
不需要 Celery/Redis。前端拿到 job_id 后轮询进度。
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from queue import Empty, Queue
from typing import Any, Callable

from .errors import ScanError

_TERMINAL = {"done", "failed"}
_MAX_JOBS = 400


@dataclass
class Job:
    id: str
    kind: str
    repo: str
    owner_key: str
    status: str = "queued"
    refresh: bool = False
    # 登录用户的令牌（只在内存里传给 worker，不落库、不序列化）
    token: str = ""
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    pet_id: str | None = None
    pet: dict[str, Any] | None = None
    error: str = ""
    hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "jobId": self.id,
            "kind": self.kind,
            "repo": self.repo,
            "status": self.status,
            "queuedAt": self.created_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "petId": self.pet_id,
            "pet": self.pet,
            "error": self.error,
            "hint": self.hint,
            "elapsedMs": int(((self.finished_at or time.time()) - self.created_at) * 1000),
        }


class ScanQueue:
    def __init__(self, worker: Callable[[Job], dict[str, Any]]) -> None:
        self._worker_fn = worker
        self._queue: Queue[str] = Queue()
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._threads: list[threading.Thread] = []
        self._started = False

    # ---------- 生命周期 ----------
    def start(self, workers: int = 1) -> None:
        if self._started:
            return
        self._started = True
        for index in range(max(1, workers)):
            thread = threading.Thread(target=self._loop, name=f"gitmon-scan-{index}", daemon=True)
            thread.start()
            self._threads.append(thread)

    def _loop(self) -> None:
        while True:
            try:
                job_id = self._queue.get(timeout=1.0)
            except Empty:
                continue
            job = self.get(job_id)
            if job is None or job.status in _TERMINAL:
                continue
            job.status = "running"
            job.started_at = time.time()
            try:
                pet = self._worker_fn(job)
                job.pet = pet
                job.pet_id = (pet or {}).get("id")
                job.status = "done"
            except ScanError as exc:
                job.status = "failed"
                job.error = exc.message
                job.hint = exc.hint
            except Exception as exc:  # 兜底：任务线程绝不能挂
                job.status = "failed"
                job.error = f"扫描失败：{exc.__class__.__name__}"
            finally:
                job.finished_at = time.time()
                self._queue.task_done()

    # ---------- 对外 ----------
    def submit(self, kind: str, repo: str, owner_key: str, *, refresh: bool = False,
               token: str = "") -> Job:
        self.start()
        with self._lock:
            self._prune()
            for existing in self._jobs.values():
                if (existing.kind == kind and existing.repo.lower() == repo.lower()
                        and existing.owner_key == owner_key and existing.token == token
                        and existing.status in {"queued", "running"}):
                    return existing
            job = Job(id=uuid.uuid4().hex[:12], kind=kind, repo=repo, owner_key=owner_key,
                      refresh=refresh, token=token)
            self._jobs[job.id] = job
        self._queue.put(job.id)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def pending(self) -> int:
        return sum(1 for job in self._jobs.values() if job.status in {"queued", "running"})

    def _prune(self) -> None:
        if len(self._jobs) <= _MAX_JOBS:
            return
        cutoff = time.time() - 3600
        for job_id in [jid for jid, job in self._jobs.items()
                       if job.status in _TERMINAL and (job.finished_at or 0) < cutoff]:
            self._jobs.pop(job_id, None)


def _worker(job: Job) -> dict[str, Any]:
    from . import services

    if job.kind == "sync":
        return services.sync_by_ref(services.parse_repo(job.repo), job.owner_key, token=job.token or None)
    return services.hatch(job.repo, job.owner_key, refresh=job.refresh, token=job.token or None)


scan_queue = ScanQueue(_worker)
