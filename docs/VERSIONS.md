# Versions — Route Optimizer

Release notes, newest first.

## v1 — 2026-06-21 (in progress)

**Goal:** A working hosted web app that turns a list of delivery addresses into an optimized,
shareable driving route, with per-stop earning estimates.

Delivered so far:

- **Address input** — three methods feeding one unified list: paste (one per line),
  Google Places autocomplete (typeahead), and image upload (Claude Haiku Vision extracts
  addresses from screenshots, dedupes by order ID).
- **Geocoding & validation** — Google Geocoding for lat/lng + precision status; uncertain /
  not-found stops are flagged with an inline "fix" autocomplete.
- **Edit / remove any stop** — every stop has ✎ Edit and × Remove. Editing re-geocodes the new
  address through the same fix path; both actions recompute the summary totals live (stop count,
  same-location, business, and estimated earning).
- **Business vs residential** — Google Places **Nearby Search** (radius 10m) at the geocoded
  point; replaced the earlier `findplacefromtext` approach, which misclassified bare addresses.
- **Route points** — configurable start and end depot (default round trip = end is start),
  persisted in `localStorage`.
- **Optimization** — ORS driving-duration matrix → OR-Tools TSP (10s timeout, ≤57 stops) →
  ordered stop list, Leaflet route map, and chunked Google Maps URLs (≤23 waypoints each).
- **Sharing** — Share opens **WhatsApp** with a link that encodes the whole working session
  (stops + depots, plus the optimized route if current) in the URL `#fragment` (LZ-string).
  Opening it rehydrates the app so the recipient can keep editing and open GPS themselves.
  Also: copy-to-clipboard route text and the direct Google Maps link.
- **Summary panel** — total stops, same-location pairs (within 50m), business count, and a
  live total estimated earning.
- **Zone earnings** — server-side `data/zone_earnings.json` (global config) read/written via
  `/api/zone-earnings`; matched client-side by city, with Toronto split by postal-code prefix,
  and a configurable default for unmatched zones. Fully dynamic settings UI.

Known gaps:

- `data/zone_earnings.json` ships with placeholder `null` amounts — real values not yet entered.
- No automated tests yet.

---

<!-- Template for future entries:

## vN — YYYY-MM-DD

**Goal:** ...

- ...
-->
