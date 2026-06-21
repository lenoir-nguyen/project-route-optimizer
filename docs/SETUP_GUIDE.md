# Setup Guide — Route Optimizer

## Prerequisites

- Python 3.11+
- API keys for: Anthropic (Claude), Google Maps Platform (Geocoding + Places enabled),
  OpenRouteService (free account)

## 1. Clone & configure

```bash
git clone <repo-url>
cd project-route-optimizer
cp .env.example .env   # fill in real values
```

Required env vars (see `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_MAPS_API_KEY=AIza...      # enable Geocoding API + Places API + Address Validation API
ORS_API_KEY=...
```

## 2. Install & run

There is **no separate frontend build** — the SPA in `static/` is served directly by FastAPI.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload          # serves on http://localhost:8000
```

## 3. Verify

- Open http://localhost:8000 — the app loads and auto-sets the default start/end depots.
- Paste an address or two → confirm they geocode (green check) and show business/residential.
- Click **Optimize Route** → an ordered list, Leaflet map, and Google Maps link appear.
- Open **⚙️ Zone Earnings** → add a city/amount, Save, confirm the earning badge updates.

## Deployment (Railway)

FastAPI + static files deploy as one service. Set the same env vars in the Railway project.

> **Note:** `data/zone_earnings.json` is written at runtime by `/api/zone-earnings`. On Railway
> the filesystem is ephemeral — attach a persistent volume (or move this config to a store) if
> zone settings must survive redeploys.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `KeyError: 'GOOGLE_MAPS_API_KEY'` on a request | `.env` missing or not loaded | Ensure `.env` exists; `main.py` calls `load_dotenv()` at startup |
| Autocomplete / geocode returns nothing | Places or Geocoding API not enabled, or key restricted | Enable the APIs in Google Cloud; check key restrictions |
| Every stop shows as Residential | Address Validation API not enabled, or key blocks it (`API_KEY_SERVICE_BLOCKED`) | Enable Address Validation API **and** add it to the key's API-restrictions allowlist. Classification still works via the manual 🏠/🏢 toggle regardless. |
| Optimize fails with a 4xx from ORS | Too many stops or bad ORS key | Keep ≤57 stops; verify `ORS_API_KEY` |
| Address flagged "uncertain" | Geocoder returned a non-rooftop match | Use the inline fix box to pick a precise address |
| Zone settings reset after deploy | Ephemeral filesystem on host | Attach a persistent volume for `data/` |
