# Automata-Ludii (Tablecraft)

Browser-based studio for designing physical board games: rulesets, visuals, and simulated playtests.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Opens at http://127.0.0.1:8787. No API key required (demo mode).

## Layout

- `backend/` — FastAPI API, agent runtime, simulation, storage
- `frontend/` — static HTML/CSS/JS single-page app
- `run.py` — starts uvicorn

Runtime data is stored in `.data/` (gitignored). See full docs in the original README if needed.