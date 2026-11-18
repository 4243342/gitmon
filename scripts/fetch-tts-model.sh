#!/usr/bin/env bash
# 下载本地语音模型（Kokoro-82M 中文，sherpa-onnx 格式）。
#
#   bash scripts/fetch-tts-model.sh
#
# 约 348MB，解压后 ~405MB，落到 backend/models/kokoro-multi-lang-v1_1。
# 只用国内可达的源：GitHub release（模型） + PyPI（依赖）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/backend/models"
NAME="kokoro-multi-lang-v1_1"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${NAME}.tar.bz2"

if [ -f "$DEST/$NAME/model.onnx" ]; then
  echo "模型已存在：$DEST/$NAME"
  exit 0
fi

mkdir -p "$DEST"
echo "下载 $URL"
curl -L --retry 3 --fail -o "$DEST/$NAME.tar.bz2" "$URL"
tar xjf "$DEST/$NAME.tar.bz2" -C "$DEST"
rm -f "$DEST/$NAME.tar.bz2"
echo "完成：$DEST/$NAME"
echo
echo "接着装运行时（约 30MB，无 torch 依赖）："
echo "  cd backend && .venv/bin/python -m pip install sherpa-onnx"
