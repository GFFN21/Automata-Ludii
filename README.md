# Tablecraft

A studio for designing physical board games. One prompt-driven interface for the
three things a tabletop game needs before it can be built:

1. **Ruleset** — turn structure, action economy, edge cases, and an honest
   production manifest.
2. **Visuals** — cover direction, board language, card systems, and print specs.
3. **Simulation** — virtual playtests, balance targets, and tuning hypotheses.

The frontend is a static **HTML / CSS / JavaScript** single-page app served by
**FastAPI**. A small custom agent runtime routes each request through a
**Director → specialist → Critic** pass and writes the reviewed result back into
the project. No build step, no frontend framework.

## Run it

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python run.py
```

`run.py` starts uvicorn on <http://127.0.0.1:8787> and opens the studio in your
browser. The SPA and the JSON API share the same origin, so there is nothing else
to start.

Useful variants:

```bash
TABLECRAFT_NO_BROWSER=1 python3 run.py     # don't open a browser
python3 run.py --reload                    # dev auto-reload
python3 -m uvicorn backend.main:app --reload --port 8787
```

Requirements: Python 3.11+ (developed on 3.13).

## Design system

- **Fonts** — Lexend for display and UI, Roboto for body copy and code-adjacent
  text. Loaded from Google Fonts.
- **Palette** — pure white surfaces, near-black ink, and a purple accent
  (`#6C4CF1`, lavender `#C4B5FD`). No orange anywhere in the UI or artwork.
- **Routing** — hash routes (`#/`, `#/projects`, `#/project/<id>/<tab>`,
  `#/settings`), so the SPA needs no server-side rewrites.
- **Artwork** — project covers and asset previews are generated server-side as
  SVG and injected inline by the client.

## Using the studio

- **Landing page** — describe a game in the prompt composer to open a new
  project. Previous projects are listed with stage progress and cover artwork.
- **Project page** — Ruleset, Assets, Code, and Playtests tabs, plus a stage
  tracker and a downloadable JSON export.
- **Studio agent** — the panel on the right accepts a prompt and a focus
  (auto, ruleset, visuals, simulation). Runs mutate the project and are stored
  in the run history.
- **Settings** — connect a model provider, test the connection, and read the
  agent framework manifest. A reset action restores the demo projects.

Keyboard: `⌘K` / `Ctrl K` jumps to the active composer (agent prompt on a
project page, brief on the studio page).

## Demo mode

No API key is required. With no provider configured, the same agent pipeline runs
with deterministic local heuristics: rules proposals, art direction, and a Monte
Carlo balance model. Every run is still routed through the Critic and persisted.

To use a live provider, open **Settings** and configure one of:

| Provider | Default model | Notes |
| --- | --- | --- |
| OpenAI | `gpt-4.1-mini` | `/v1/chat/completions` |
| Anthropic | `claude-sonnet-4-5` | Messages API |
| Google Gemini | `gemini-2.5-flash` | `generateContent` |
| Local / Ollama | `llama3.2` | no key needed |

Keys can also come from the environment, which takes precedence over saved keys:

```bash
export OPENAI_API_KEY=...
# or ANTHROPIC_API_KEY / GOOGLE_API_KEY / OLLAMA_API_KEY
```

Saved keys live server-side in `.data/settings.json` and the browser only ever
sees a masked hint. If a live provider call fails, the run falls back to the
deterministic framework and records the fallback in the run transcript.

## Project layout

```
backend/
  main.py        FastAPI routes + static frontend mount
  models.py      Pydantic project, ruleset, asset, playtest, run, settings models
  store.py       JSON persistence + masked provider settings
  seed.py        Sample projects and starter project generation
  agent.py       Director → specialist → critic runtime and focus routing
  simulation.py  Monte Carlo playtest engine and balance metrics
  providers.py   OpenAI / Anthropic / Google / Ollama clients
  naming.py      Brief-to-title and asset-kind heuristics
  artwork.py     SVG cover and asset generators
  presenter.py   Attaches cover_svg / preview_svg to project payloads
frontend/
  index.html     App shell (sidebar, topbar, view container, toast)
  styles.css     Purple-on-white design system, responsive layouts
  app.js         Hash router, API client, views, agent runs, settings
run.py           Starts uvicorn and opens the studio
.data/           Runtime store (gitignored): tablecraft.json, settings.json
```

## Data

Projects, runs, and playtest reports are stored in `.data/tablecraft.json`.
Delete that file (or use **Settings → Reset demo data**) to restore the three
sample projects: Emberfall, Tidebound, and Static Bloom.

## API

Interactive docs are at <http://127.0.0.1:8787/docs>. Main routes:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service and provider status |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create a project from a brief |
| GET | `/api/projects/{id}` | Project detail + run history |
| POST | `/api/projects/{id}/agent/run` | Run the studio agent |
| GET/PUT | `/api/settings` | Read or save provider settings |
| POST | `/api/settings/test` | Test the saved provider connection |
| DELETE | `/api/settings/key` | Remove the saved API key |
| GET | `/api/framework` | Agent runtime manifest |
| POST | `/api/demo/reset` | Restore demo projects |
