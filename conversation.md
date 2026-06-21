# Conversation Log — Route Optimizer

A compacted, **append-only** memory of what was discussed and decided on this project.
Read this first when resuming work; nothing important should be lost between sessions.

**How this file works** (see `AI-Projects/guidelines/RULES.md` §9):
- Saved **before switching projects**, at **end of day**, and whenever asked.
- Entries are **compacted summaries**, not raw transcripts.
- **Append** new entries at the bottom; never edit or delete older ones — they're history.
- **Stay compact:** keep the latest ~10–15 entries here; move older ones (verbatim) to
  `conversation-archive.md` so this file never bloats the context that's read on resume.

---

<!-- Newest entries go at the BOTTOM. Copy this template for each session:

## YYYY-MM-DD — <short session topic>
**Discussed:** …
**Decisions:** …
**Changes made:** <files / commits>
**Open / next steps:** …

-->

## 2026-06-15 — Project created + core MVP
**Discussed:** Scaffolded from the AI-Projects template; built the first working version.
**Decisions:** Vanilla JS frontend (no build step), FastAPI backend, OR-Tools for TSP,
Google for geocoding, ORS for the distance matrix, Claude Haiku Vision for image extraction.
Round-trip from a fixed depot. Stateless (browser-held state).
**Changes made:** `0748688` initial scaffold; `267a3b1` separate start/end points, image dedup
by order ID, Leaflet map, WhatsApp share, Google Maps button.
**Open / next steps:** Refine business/residential classification; fix share flow.

## 2026-06-16 — Classification + sharing fixes
**Discussed:** Business vs residential was unreliable; WhatsApp share was clunky.
**Decisions:** Switch to Google **Places API** for classification; replace WhatsApp with **SMS**
share; default start/end depots; use **formatted addresses** (not raw lat/lng) in Maps URLs so
the mobile app parses them reliably.
**Changes made:** `470dc51`, `6b8bfcf`, `4293c53`, `61cb60e`.
**Open / next steps:** Classification still imperfect for bare street addresses.

## 2026-06-20 — Zone earnings feature
**Discussed:** Show an estimated $ earning per stop, and a live total, based on delivery zone.
**Decisions:** Persist a single server-side `data/zone_earnings.json` (global config, not
per-user) via GET/POST `/api/zone-earnings`. Match **client-side**: by city, with **Toronto**
broken out by postal-code prefix (M1–M5…); fall back to a configurable `_default`. Fully
dynamic settings UI (add/remove cities and Toronto prefixes). Also replaced
`findplacefromtext` with **Places Nearby Search** (radius 10m) for classification — it reflects
what's physically at the coordinate instead of the closest matching place name.
**Changes made:** `c1b0319` (nearby-search classification), `ec33cb1`, `a7eb5a0`, `5abb7ad`.
**Open / next steps:** Populate real earning amounts (JSON ships with `null`s). Consider
expanding Toronto prefixes and adding more GTA cities as needed.

## 2026-06-21 — Resume + doc sync
**Discussed:** Resumed the project. Found the code had drifted well ahead of the docs —
`conversation.md`, `docs/VERSIONS.md`, `docs/ARCHITECTURE.md` were still unfilled templates and
`CLAUDE.md` predated the zone-earnings feature and the WhatsApp→SMS switch.
**Decisions:** Sync all docs to the real code before doing further feature work.
**Changes made:** Rewrote `CLAUDE.md` (architecture diagram, tech stack, critical files,
constraints), reconstructed this log from git history, filled `docs/VERSIONS.md` and
`docs/ARCHITECTURE.md`, removed the scaffold-only `STRUCTURE.md`.
**Open / next steps:** Decide today's actual feature/bug work. Note: `.claude/` is untracked;
`data/zone_earnings.json` still has placeholder `null` amounts.
