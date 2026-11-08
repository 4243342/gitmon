.PHONY: install dev test lint run docker clean

install:
	python3 -m venv .venv
	.venv/bin/pip install -q --upgrade pip
	.venv/bin/pip install -q -r requirements.txt

test:
	.venv/bin/python -m pytest -p no:warnings

run:
	.venv/bin/python -m uvicorn gitmon_api.main:app --host 127.0.0.1 --port 8000 --reload

docker:
	cd .. && docker build -f backend/Dockerfile -t gitmon .

clean:
	rm -rf .venv .pytest_cache **/__pycache__ data/gitmon.db*
