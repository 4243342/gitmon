# 构建上下文 = gitmon/ 根目录（前端 + 后端一起打成一个镜像）
#   docker build -f backend/Dockerfile -t gitmon .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GITMON_DATA_DIR=/app/data \
    GITMON_STATIC_DIR=/app/web

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/gitmon_api ./gitmon_api

# 前端构建产物；若没构建就跳过这一层（构建前先 npm run build）
COPY dist ./web

RUN mkdir -p /app/data && useradd -m gitmon && chown -R gitmon /app
USER gitmon

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

CMD ["uvicorn", "gitmon_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
