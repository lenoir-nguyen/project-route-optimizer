# Architecture — Route Optimizer

## Overview

Route Optimizer is a single-page web app for a delivery driver/agent. The user enters delivery
addresses (paste, autocomplete, or screenshot), the app geocodes and validates them, then solves
the optimal driving order between a configurable start and end point and produces Google Maps
links plus shareable text. It also estimates per-stop earnings from a configurable zone table.
There is no per-user account or database — address/route state lives in the browser; the only
server-side persisted state is a single global zone-earnings config file.

## Components

| Component | Responsibility | Location |
|-----------|----------------|----------|
| Frontend (SPA) | UI, address-list state, autocomplete, Leaflet map, share, zone-earning matching | `static/index.html`, `static/app.js`, `static/style.css` |
| FastAPI app | App entry, static serving, router include | `main.py` |
| API router | All `/api/*` endpoints + Google Maps URL construction | `api/routes.py` |
| Vision | Image → addresses via Claude Haiku Vision | `api/vision.py` |
| Geocoder | Address → lat/lng + status + business/residential | `api/geocoder.py` |
| Matrix | Locations → driving-duration matrix (ORS) | `api/matrix.py` |
| Solver | Duration matrix → optimized stop order (OR-Tools TSP) | `api/solver.py` |
| Zone config | Persisted global earnings table | `data/zone_earnings.json` |
| External | Claude API, Google Geocoding/Places, OpenRouteService, OSM tiles | third-party |

## Data / Request Flow

```
                          ┌──────────────────────────────────────────────┐
   Browser (app.js)       │              FastAPI (api/routes.py)          │
   ──────────────         │                                              │
   upload images  ──────► POST /api/extract-addresses ─► vision.py ─────► Claude Vision
   type address   ──────► GET  /api/places-autocomplete ───────────────► Google Places
   add a stop     ──────► POST /api/geocode ─► geocoder.py ────────────► Google Geocoding
                          │                                  └─────────► Google Places Nearby
   click Optimize ──────► POST /api/optimize ─┬─ matrix.py ────────────► ORS Matrix API
                          │                    └─ solver.py (OR-Tools TSP, local)
                          │                       └─► ordered stops + chunked Maps URLs
   open settings  ──────► GET/POST /api/zone-earnings ─► read/write data/zone_earnings.json
                          └──────────────────────────────────────────────┘

   Render: Leaflet map (OSM tiles) + ordered list + per-stop earning badges (matched in app.js)
   Share:  Google Maps link(s), SMS deep link, copy route text
```

Earning amounts are **not** computed server-side: `app.js` reads the config from
`/api/zone-earnings` and matches each stop by city (and Toronto postal-code prefix), falling
back to `_default`.

## Key Decisions (and why)

> Record WHY, so future changes extend the design instead of undoing it.

- **No build step / vanilla JS** — keeps the app trivially deployable as static files behind
  FastAPI; no toolchain to maintain for a single-user utility.
- **Formatted addresses in Maps URLs (not lat/lng)** — the Google Maps mobile app parses
  human-readable addresses more reliably than raw coordinates.
- **Maps URLs chunked at ≤23 waypoints** — Google Maps `dir/` URLs cap at 23 waypoints +
  origin + destination; long routes split into "Part N" links.
- **Places Nearby Search for classification** — reflects what is physically at the coordinate;
  `findplacefromtext` is a text search and returned the closest *named* place, misclassifying
  bare street addresses in both directions.
- **Zone earnings persisted server-side, matched client-side** — one shared JSON config (the
  user is the only operator), but matching logic stays in the browser so the summary updates
  live without round-trips.
- **SMS share over WhatsApp** — `sms:?body=` is universally available on mobile and was more
  reliable than the WhatsApp deep link for sending route links.

## Constraints

- **≤57 delivery stops** — depot + stops (+ optional end) must stay ≤59 locations; ORS free
  tier caps the matrix at 59×59 = 3481 elements (< 3500 limit).
- **OR-Tools timeout 10s** — bounds solve time for the supported stop count.
- **No image retention** — Claude Vision is used only to extract address text; image bytes are
  never stored or logged.
- **Single persisted file** — `data/zone_earnings.json` is the only server-side state; on
  Railway this is ephemeral unless backed by a volume (see SETUP_GUIDE).
