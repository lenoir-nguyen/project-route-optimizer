# Route Optimizer — CLAUDE.md

**Status:** Active Development — v1
**Last Updated:** 2026-06-21
**Owner:** ndnduc@gmail.com

> This file is always loaded into Claude's context. Keep it lean and scannable — an index,
> not an encyclopedia. Put depth in `docs/`. Delete every `<…>` placeholder before you finish.

---

## What This Project Does

A hosted web app that takes a list of delivery addresses (pasted, typed, or extracted from
photos), validates them, and calculates the optimal driving route between a configurable
start and end point (round trip by default). Output is one or more Google Maps links plus
shareable route text. Each stop can also show an estimated earning based on its zone.

User flow:
1. Open web app → set start/end points → paste addresses, add via autocomplete, or upload screenshots
2. App geocodes each address, classifies business/residential, and flags uncertain/unfound ones
3. User reviews summary (total stops, same-location pairs, business count, est. earning) and fixes flagged stops
4. Click Optimize → ORS matrix → OR-Tools solves TSP → ordered stop list + route map appears
5. Open in Google Maps on phone, or share the route link via SMS / copy the text

---

## Architecture

```
Browser (HTML/JS + Leaflet map)
    │
    ├── POST /api/extract-addresses  →  Claude Vision API   (image → addresses)
    ├── GET  /api/places-autocomplete→  Google Places API   (typeahead suggestions)
    ├── POST /api/geocode            →  Google Geocoding +   (address → lat/lng + status)
    │                                   Places Nearby Search (business vs residential)
    ├── POST /api/optimize           →  ORS Matrix API → OR-Tools TSP → ordered list + Maps URLs
    └── GET/POST /api/zone-earnings  →  read/write data/zone_earnings.json (global config)
                                                          ↑
                                               FastAPI (main.py)
                                               served on Railway
```

Zone-earnings amounts are matched **client-side** in `static/app.js` (city + Toronto postal
prefix), using the config served by `/api/zone-earnings`.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla HTML/CSS/JS | No build step; mobile-friendly |
| Map | Leaflet + OpenStreetMap tiles | CDN; renders the optimized route |
| Backend | Python 3.11 + FastAPI | Serves static files + API |
| Image OCR | Claude API (claude-haiku-4-5) | Vision: extract addresses from screenshots |
| Geocoding | Google Geocoding API | Validate addresses, get lat/lng + precision status |
| Address typing | Google Places API | Autocomplete + Nearby Search (business vs residential) |
| Distance matrix | OpenRouteService API | Free tier; ≤3481 elements/request (59×59) |
| Route solver | Google OR-Tools | TSP, 10s timeout, runs server-side |
| Sharing | SMS link + clipboard | `sms:?body=` deep link; WhatsApp was dropped |
| Hosting | Railway | FastAPI + static files |

---

## Critical Files by Task

| To change... | Edit |
|--------------|------|
| Image → address extraction logic | `api/vision.py` |
| Geocoding + business/residential classification | `api/geocoder.py` |
| Distance matrix calculation | `api/matrix.py` |
| Route optimization algorithm | `api/solver.py` |
| All API endpoints (incl. autocomplete, zone-earnings, Maps URL build) | `api/routes.py` |
| FastAPI app entry + static serving | `main.py` |
| UI layout, summary panel, zone-earnings settings | `static/index.html` |
| Frontend logic (fetch, state, share, map, zone-earning matching) | `static/app.js` |
| Styling | `static/style.css` |
| Zone earnings config (persisted, server-side) | `data/zone_earnings.json` |
| Env vars / settings | `.env.example` |

---

## Constraints (hard rules)

- **No per-session database** — address/route state lives in the browser; start/end depots in `localStorage`. The *one* server-side persisted file is `data/zone_earnings.json` (global shared config, not per-user).
- **Start and end are configurable** — default is a round trip (end = start), but a separate end depot is supported.
- **OR-Tools solver timeout = 10 seconds** — sufficient for the supported stop count.
- **Max 57 stops** — depot + stops (+ optional end) must stay ≤ 59 locations; ORS matrix cap is 59×59 = 3481 elements (under the 3500 free-tier limit).
- **Claude Vision** — only extract addresses; never store or log image content.
- **No Tookan API** — user is an agent (no admin API access); all input is manual (incl. Tookan screenshots).

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
- Output for mobile: Google Maps URL(s) + SMS-shareable text are the primary outputs; the Leaflet map is a preview, not the deliverable.
- Earnings are advisory: zone amounts estimate per-stop pay; matching is best-effort by city/postal prefix and falls back to a configurable default.

---

## Project-specific skills & docs

- Project skills: `.claude/skills/` (auto-activate in this project).
- Deep docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md), [docs/VERSIONS.md](docs/VERSIONS.md).
- **Session memory: [conversation.md](conversation.md)** — append a compacted entry before
  switching projects or ending the day (RULES.md §9). Read it first when resuming.
