#!/usr/bin/env bash
# 本地一键启动：FastAPI(8000) + Vite(5173)
#
# 两处坑，脚本里都绕开了：
# 1) .venv/bin/uvicorn 的 shebang 写死了旧的虚拟路径，直接跑会 bad interpreter → 一律用 python -m uvicorn。
# 2) 被 IDE / 沙箱注入的 HTTP(S)_PROXY（如 127.0.0.1:50728）一旦端口失效，后台所有外网模型请求
#    都会先撞死代理再直连兜底，最终统一报「连不上模型接口」。这里清掉进程级代理变量，
#    让 httpx 回落到 macOS 系统代理（Clash 等），本地端点仍是直连（llm._outbound_proxy 判定）。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x backend/.venv/bin/python ]; then
  echo "缺少 backend/.venv，先创建虚拟环境并安装依赖" >&2
  exit 1
fi

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done }
trap cleanup INT TERM EXIT

echo "→ 后端 http://127.0.0.1:8000"
(
  cd backend
  exec env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
    .venv/bin/python -m uvicorn gitmon_api.main:app --host 127.0.0.1 --port 8000 --reload
) &
PIDS+=($!)

echo "→ 前端 http://127.0.0.1:5173"
npm run dev &
PIDS+=($!)

wait
