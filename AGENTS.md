# Repository Guidelines

## Project Structure & Module Organization

GitMon turns GitHub/Gitee repositories into collectible pixel monsters.

- `src/`: React frontend; `components/` contains UI components, while `engine.js`, `battle.js`, and `traits.js` contain gameplay logic. Images and fonts live in `src/assets/`.
- `backend/gitmon_api/`: FastAPI service, SQLite persistence, authentication, and growth logic. Platform scanners live in `scanner/`; orchestration belongs in `services.py`.
- `backend/tests/`: pytest suites and shared fixtures. `scripts/` contains standalone JavaScript battle checks.
- `docs/DESIGN.md` and `docs/BATTLE.md`: gameplay specifications. `THIRD-PARTY.md` records dependency and asset attribution.

## Build, Test, and Development Commands

Run frontend commands from the repository root:

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start Vite at `http://127.0.0.1:5173`; API requests proxy to port 8000.
- `npm run build`: generate production files in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run test:battle`: check battle invariants, convergence, and seeded reproducibility.
- `npm run test:parity`: compare type effectiveness and damage against Pokémon Showdown.

For the backend, enter `backend/`, create a Python 3.10+ environment with `python -m venv .venv`, and activate it (`.venv\Scripts\Activate.ps1` on PowerShell; `source .venv/bin/activate` on Unix):

- `python -m pip install -r requirements.txt`: install backend and test dependencies.
- `python -m uvicorn gitmon_api.main:app --host 127.0.0.1 --port 8000 --reload`: start the API.
- `python -m pytest`: run backend tests.

## Coding Style & Naming Conventions

Follow existing styles: JavaScript uses two-space indentation, single quotes, ES modules, and generally omits semicolons. Use PascalCase for React component files and camelCase for functions. Python uses four-space indentation, snake_case names, and type hints. No formatter or lint command is configured.

Keep gameplay engines pure and randomness explicitly seeded. Preserve reproducibility for identical repository snapshots and seeds.

## Testing Guidelines

Name Python tests `test_*.py` with `test_*` functions. Reuse `conftest.py` snapshots and mock platform calls; keep tests offline. Extend the Node scripts for battle changes. No coverage threshold is configured. Run relevant suites and the frontend build; manually check changed UI flows.

## Commit & Pull Request Guidelines

History uses `feat:`, `fix:`, and `docs:` prefixes, commonly with Chinese summaries. Keep commits focused. PRs should explain behavior changes, link relevant issues, list validation results, and include screenshots for UI changes.

## Configuration & Assets

Keep credentials in ignored `backend/.env`; never commit tokens or `backend/data/`. Update `THIRD-PARTY.md` when adding external code or assets.
