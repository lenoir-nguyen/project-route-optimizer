# Route Optimizer — CLAUDE.md

**Status:** Active Development — v1
**Last Updated:** 2026-06-15
**Owner:** ndnduc@gmail.com

> This file is always loaded into Claude's context. Keep it lean and scannable — an index,
> not an encyclopedia. Put depth in `docs/`. Delete every `<…>` placeholder before you finish.

---

## What This Project Does

A hosted web app that takes a list of delivery addresses (pasted, typed, or extracted from
photos), validates them, and calculates the optimal driving route as a round trip from a
fixed depot. Output is a Google Maps link + WhatsApp-ready text.

User flow:
1. Open web app → paste addresses, add via autocomplete, or upload screenshots
2. App geocodes each address and flags uncertain/unfound ones
3. User reviews summary (total, duplicates, residential vs business) and fixes flagged stops
4. Click Optimize → OR-Tools solves TSP → ordered stop list appears
5. Open in Google Maps on phone or copy for WhatsApp

---

## Architecture

```
Browser (HTML/JS)
    │
    ├── POST /api/extract-addresses  →  Claude Vision API  (image → addresses)
    ├── POST /api/geocode            →  Google Geocoding API (address → lat/lng + type)
    └── POST /api/optimize           →  ORS Matrix API → OR-Tools TSP → ordered list
                                                          ↑
                                               FastAPI (main.py)
                                               served on Railway
```

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla HTML/CSS/JS | No build step; mobile-friendly |
| Backend | Python 3.11 + FastAPI | Serves static files + API |
| Image OCR | Claude API (claude-haiku-4-5) | Vision: extract addresses from screenshots |
| Geocoding | Google Geocoding API | Validate addresses, get lat/lng, residential/business type |
| Distance matrix | OpenRouteService API | Free tier; 3500 elements/request covers 50×50 |
| Route solver | Google OR-Tools | TSP/VRP, free, runs server-side |
| Hosting | Railway | FastAPI + static files |

---

## Critical Files by Task

| To change... | Edit |
|--------------|------|
| Image → address extraction logic | `api/vision.py` |
| Geocoding / address validation | `api/geocoder.py` |
| Distance matrix calculation | `api/matrix.py` |
| Route optimization algorithm | `api/solver.py` |
| All API endpoints | `api/routes.py` |
| FastAPI app entry + static serving | `main.py` |
| UI layout and address list state | `static/index.html` |
| Frontend logic (fetch, state, share) | `static/app.js` |
| Styling | `static/style.css` |
| Env vars / settings | `.env.example` |

---

## Constraints (hard rules)

- **No database** — stateless; all state lives in the browser session.
- **Depot is always start AND end** — round-trip optimization only.
- **OR-Tools solver timeout = 10 seconds** — sufficient for ≤ 50 stops.
- **ORS matrix limit** — never exceed 3500 elements (60×60 grid) in one request.
- **Claude Vision** — only extract addresses; never store or log image content.
- **No Tookan API** — user is an agent (no admin API access); all input is manual.

---

## Commands

```bash
# Dev
uvicorn main:app --reload

# Install deps
pip install -r requirements.txt

# Test (once tests are added)
pytest

# Lint
ruff check .
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=...
GOOGLE_MAPS_API_KEY=...
ORS_API_KEY=...
```
See `.env.example` for the full list. Secrets: `environment-secrets-management` skill.

---

## Key Principles

- Input flexibility: three input methods (paste, autocomplete, image) all feed one unified address list.
- Validate before optimizing: every address must have a confirmed lat/lng before the solver runs.
- Output for mobile: Google Maps URL and WhatsApp text are the primary outputs — not a map embed.

---

## Project-specific skills & docs

- Project skills: `.claude/skills/` (auto-activate in this project).
- Deep docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md), [docs/VERSIONS.md](docs/VERSIONS.md).
- **Session memory: [conversation.md](conversation.md)** — append a compacted entry before
  switching projects or ending the day (RULES.md §9). Read it first when resuming.
