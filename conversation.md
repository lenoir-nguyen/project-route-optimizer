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

## 2026-06-21 — Zone-earning matching made case/spacing-insensitive
**Discussed:** Verify that a city/postal entered in Zone Earnings settings matches regardless
of case or spacing ("North York" / "north york" / "NorthYork").
**Findings:** Case was already handled (both sides lowercased); postal codes too. Gap: the
no-space form ("NorthYork") stored as `northyork` ≠ Google's `north york`, so it silently fell
back to the default earning.
**Decisions:** Match on a canonical city key, not exact string equality.
**Changes made:** `static/app.js` — added `normalizeCity()` (lowercase + strip
non-alphanumerics); `getEarning()` now looks up the stored key by canonical form;
`saveZoneSettings()` dedups by canonical form so two spellings can't both be saved. Verified
with a Node harness (10/10 cases incl. regressions). Updated `docs/ARCHITECTURE.md`.
**Open / next steps:** Known limitation — does NOT bridge Google returning a *different* city
name than configured (e.g. "Toronto" for a North York address); would need an alias map.
`data/zone_earnings.json` still has placeholder `null` amounts.

## 2026-06-21 — Edit/remove any stop, with live total refresh
**Discussed:** Be able to remove AND update an existing delivery stop, and have the estimated
earning total update accordingly.
**Findings:** Remove already existed and already refreshed the total; editing was only offered
for *flagged* (uncertain/not-found) stops — confirmed stops couldn't be edited.
**Decisions:** Add an inline Edit affordance to every stop, reusing the existing fix-row /
`fixAddress` re-geocode path rather than a parallel edit flow (DRY).
**Changes made:** `static/app.js` — `_editingIds` state, ✎ Edit / ↩ Cancel button per stop,
`toggleEdit()`, edit-state cleanup in `applyFix`/`removeStop`/`clearAll`; `showFix` now opens
for flagged OR editing stops (input pre-filled with current address). `static/style.css` —
`.edit-btn`. Both edit and remove flow through `renderStops → updateSummary`, so the earning
total recomputes live. Updated `docs/VERSIONS.md`. Syntax verified (`node --check`); browser
verification deferred to the user (testing on Vercel).
**Open / next steps:** Note — the optimized-results panel is still a snapshot from the last
Optimize; editing/removing stops after optimizing doesn't refresh that panel until re-run.

## 2026-06-21 — Make the edit address field full-width / mobile-friendly
**Discussed:** The inline edit field (opened by the ✎ button) was too small; user is mostly on
a phone and wants it full-size and responsive.
**Findings:** Two causes — the input had `flex:1` but lived inside a non-flex
`.autocomplete-wrapper`, so it rendered at the default tiny width; and the fix-row was nested
inside the narrow `.address-text` column, competing with badges/buttons.
**Changes made:** `static/app.js` — moved the fix-row out of `.address-text` to be a direct
child of `.address-item` so it wraps to its own line. `static/style.css` — `flex-wrap` on
`.address-item`; `.fix-row` full width (`flex-basis:100%`); input `width:100%` + `font-size:16px`
(avoids iOS zoom-on-focus) + larger padding; Save button kept from shrinking. Layout-only;
autocomplete wiring unaffected (`closest('.address-item')`). Syntax verified.
**Open / next steps:** User to test on Vercel/phone.

## 2026-06-21 — Share = WhatsApp link that reopens the whole session (incl. route)
**Discussed:** Change Share from "Google Maps link with ordered points" to a link to the *app*
that reopens with all current data so the recipient can keep working and open GPS themselves;
include the pre-optimized route if present; share via WhatsApp (SMS hit length limits).
**Decisions:** Encode the session (stops + start/end depots, + optimized route if still current)
into the URL `#fragment`, compressed with LZ-string — stateless, no backend storage, host-
agnostic. Hand off to WhatsApp (`wa.me/?text=`), which handles long links. Guard against sharing
a stale route via a stops+depots signature.
**Changes made:** `static/index.html` — button → "💬 Share on WhatsApp", added lz-string CDN.
`static/app.js` — `shareSession()` (WhatsApp + clipboard backup), `loadSharedSession()` /
`applySharedSession()`, init refactored to restore a shared session (and render the route if
included), `routeSignature()` + `_lastResult`/`_lastResultSig`, `reflect*Depot()` helpers.
Docs updated (CLAUDE.md, ARCHITECTURE.md, VERSIONS.md). Verified with Node round-trip +
staleness tests (13/13 across two suites); browser/WhatsApp hand-off to be tested by user.
**Open / next steps:** Known tradeoff — very large routes make a long link (fine for WhatsApp;
would need a server short-link only if a tiny URL is required). Results panel still doesn't
auto-hide when stops change after optimizing (the share correctly omits the stale route, though).

## 2026-06-21 — Fix business/residential classification (Address Validation + toggle)
**Discussed:** Classification marked nearly every stop "business".
**Findings (with real API tests):** Root cause = old logic asked Places "any establishment
within 10m?" → home-based businesses are registered at residential addresses, so almost
everything matched. Distance/threshold can't fix it (home businesses sit at 0m). Tested the
Google **Address Validation API**: better, but Canadian coverage is partial — it returns
`business=True` for some commercial addresses, **never** affirmatively `residential`, and "no
signal" for most (incl. some real businesses like 290 Yonge / 1 Dundas). It also still false-
flagged one home-business residential (25 Cougar Crt). ~5/8 correct on the sample — a useful
hint, not authoritative.
**Decisions:** Use Address Validation as a best-effort hint (trust `business=True`, default
everything else to residential) **plus** a manual per-stop tap-toggle as the source of truth.
User enabled the Address Validation API (had to add it to the key's API-restriction allowlist —
`API_KEY_SERVICE_BLOCKED` until then).
**Changes made:** `api/geocoder.py` — replaced Places Nearby hack with `_classify()` calling
Address Validation; graceful fallback to residential on any error/no-signal. `static/app.js` —
`toggleType()`; type badge is now a tap-to-flip control. `static/style.css` — `.type-toggle`.
Docs synced (CLAUDE.md, ARCHITECTURE.md, VERSIONS.md, SETUP_GUIDE.md, .env.example).
**Open / next steps:** Classification is "acceptable" per user. Possible future: alias map for
Google returning a different city name in earnings matching; results-panel auto-refresh after
edits; populate real `zone_earnings.json` amounts.
