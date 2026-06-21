// ── State ─────────────────────────────────────────────────────────────────────

const DUPLICATE_THRESHOLD_M = 50; // metres — same lat/lng within this = same location
const DEFAULT_START = "1388 Kennedy Road, Scarborough, ON, Canada";
const DEFAULT_END   = "333 Inverness Dr, Oshawa, ON L1J 5T6";

let stops = []; // [{id, orderId, originalAddress, formattedAddress, lat, lng, type, status}]
let startDepot   = JSON.parse(localStorage.getItem("startDepot") || "null");
let endDepot     = JSON.parse(localStorage.getItem("endDepot")   || "null");
let zoneEarnings = {}; // loaded from server on startup
let _routeMap    = null; // Leaflet map instance
let _editingIds  = new Set(); // stop ids currently in inline-edit mode
let _lastResult  = null; // last optimize result {ordered_stops, maps_links, whatsapp_text}
let _lastResultSig = null; // signature of stops+depots when _lastResult was computed

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", async () => {
  setupAutocomplete("start-input", "start-dropdown", onStartSelect);
  setupAutocomplete("end-input",   "end-dropdown",   onEndSelect);
  setupAutocomplete("single-input", "single-dropdown", onSingleSelect);
  setupDragDrop();

  // Load zone earnings from server (persists in data/zone_earnings.json)
  try {
    const res = await fetch("/api/zone-earnings");
    if (res.ok) zoneEarnings = await res.json();
  } catch (_) {}

  // A shared link (#s=…) carries a full working session: stops + start/end depots.
  // When present it takes over depot/stop setup so the recipient sees the sender's data.
  const shared = loadSharedSession();
  if (shared) applySharedSession(shared);

  // Start depot: use whatever we have (saved or shared); otherwise seed the default.
  if (!startDepot) {
    setStatus("start-status", "Setting default start…", "gray");
    const r = await geocodeAddress(DEFAULT_START);
    if (r.lat) {
      startDepot = { formattedAddress: r.formatted_address, lat: r.lat, lng: r.lng };
      localStorage.setItem("startDepot", JSON.stringify(startDepot));
    }
  }
  reflectStartDepot();

  // End depot: seed the default end only on a normal load — a shared round trip
  // (no end in the link) should stay "same as start", not get the default.
  if (!endDepot && !shared) {
    setStatus("end-status", "Setting default end…", "gray");
    const r = await geocodeAddress(DEFAULT_END);
    if (r.lat) {
      endDepot = { formattedAddress: r.formatted_address, lat: r.lat, lng: r.lng };
      localStorage.setItem("endDepot", JSON.stringify(endDepot));
    }
  }
  reflectEndDepot();

  if (shared) {
    renderStops();
    // If the sender had already optimized, show that route so the recipient can
    // open the GPS immediately (they can still edit + re-optimize).
    if (shared.result) {
      try { renderResults(shared.result); } catch (_) {}
    }
  }
  updateUI();
});

// Reflect the current start/end depot objects into the UI inputs + status.
function reflectStartDepot() {
  if (!startDepot) return;
  document.getElementById("start-input").value = startDepot.formattedAddress;
  setStatus("start-status", `✅ ${startDepot.formattedAddress}`, "green");
}

function reflectEndDepot() {
  const sameAsStart = !endDepot;
  document.getElementById("same-as-start").checked = sameAsStart;
  document.getElementById("end-section").style.display = sameAsStart ? "none" : "block";
  if (!sameAsStart) {
    document.getElementById("end-input").value = endDepot.formattedAddress;
    setStatus("end-status", `✅ ${endDepot.formattedAddress}`, "green");
  }
}

// ── Shareable session (state encoded in the URL) ──────────────────────────────

// Parse a shared session from the URL hash (#s=<compressed>). Returns null if absent/invalid.
function loadSharedSession() {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.stops)) return null;
    const depot = d => d ? { formattedAddress: d.a, lat: d.lat, lng: d.lng } : null;
    return { start: depot(data.start), end: depot(data.end), stops: data.stops, result: data.result || null };
  } catch (_) {
    return null;
  }
}

// Signature of the current stops + depots — used to tell whether a stored optimize
// result still matches the stops (so we never share/show a stale route).
function routeSignature() {
  const pt = d => d ? `${d.lat},${d.lng}` : "";
  const stopSig = stops.filter(s => s.lat && s.lng).map(s => `${s.lat},${s.lng}`).join("|");
  return `${pt(startDepot)}>${stopSig}>${pt(endDepot)}`;
}

// Apply a decoded shared session: overwrite depots (persisted) and the stop list.
function applySharedSession(s) {
  if (s.start) {
    startDepot = s.start;
    localStorage.setItem("startDepot", JSON.stringify(startDepot));
  }
  if (s.end) {
    endDepot = s.end;
    localStorage.setItem("endDepot", JSON.stringify(endDepot));
  } else {
    endDepot = null;
    localStorage.removeItem("endDepot");
  }
  stops = s.stops.map(st => ({
    id: Date.now() + Math.random(),
    orderId: st.o || null,
    originalAddress: st.a,
    formattedAddress: st.a,
    lat: st.lat,
    lng: st.lng,
    type: st.t || "unknown",
    status: "ok",  // shared stops already carry confirmed coordinates
  }));
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// ── Route Points (start / end) ────────────────────────────────────────────────

function toggleEndPoint(sameAsStart) {
  document.getElementById("end-section").style.display = sameAsStart ? "none" : "block";
  if (sameAsStart) {
    endDepot = null;
    localStorage.removeItem("endDepot");
    updateUI();
  }
}

async function saveStart() {
  const raw = document.getElementById("start-input").value.trim();
  if (!raw) return;
  setStatus("start-status", "Geocoding…", "gray");
  const result = await geocodeAddress(raw);
  if (result.status === "not_found") {
    setStatus("start-status", "❌ Address not found — try typing and selecting from autocomplete", "red");
    return;
  }
  startDepot = { formattedAddress: result.formatted_address, lat: result.lat, lng: result.lng };
  localStorage.setItem("startDepot", JSON.stringify(startDepot));
  document.getElementById("start-input").value = startDepot.formattedAddress;
  setStatus("start-status", `✅ Saved: ${startDepot.formattedAddress}`, "green");
  updateUI();
}

async function saveEnd() {
  const raw = document.getElementById("end-input").value.trim();
  if (!raw) return;
  setStatus("end-status", "Geocoding…", "gray");
  const result = await geocodeAddress(raw);
  if (result.status === "not_found") {
    setStatus("end-status", "❌ Address not found — try typing and selecting from autocomplete", "red");
    return;
  }
  endDepot = { formattedAddress: result.formatted_address, lat: result.lat, lng: result.lng };
  localStorage.setItem("endDepot", JSON.stringify(endDepot));
  document.getElementById("end-input").value = endDepot.formattedAddress;
  setStatus("end-status", `✅ Saved: ${endDepot.formattedAddress}`, "green");
  updateUI();
}

function onStartSelect(place) {
  geocodeAddress(place.description).then(result => {
    if (!result.lat) return;
    startDepot = { formattedAddress: result.formatted_address, lat: result.lat, lng: result.lng };
    localStorage.setItem("startDepot", JSON.stringify(startDepot));
    document.getElementById("start-input").value = startDepot.formattedAddress;
    setStatus("start-status", `✅ Saved: ${startDepot.formattedAddress}`, "green");
    updateUI();
  });
}

function onEndSelect(place) {
  geocodeAddress(place.description).then(result => {
    if (!result.lat) return;
    endDepot = { formattedAddress: result.formatted_address, lat: result.lat, lng: result.lng };
    localStorage.setItem("endDepot", JSON.stringify(endDepot));
    document.getElementById("end-input").value = endDepot.formattedAddress;
    setStatus("end-status", `✅ Saved: ${endDepot.formattedAddress}`, "green");
    updateUI();
  });
}

function setStatus(elementId, msg, color) {
  const el = document.getElementById(elementId);
  el.textContent = msg;
  el.style.color = color === "green" ? "var(--green)" : color === "red" ? "var(--red)" : "var(--gray-600)";
}

// ── Paste input ───────────────────────────────────────────────────────────────

async function processPaste() {
  const raw = document.getElementById("paste-input").value.trim();
  if (!raw) return;
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  document.getElementById("paste-input").value = "";
  for (const line of lines) {
    await addStop(line);
  }
}

// ── Single autocomplete input ─────────────────────────────────────────────────

let _pendingSinglePlace = null;

function onSingleSelect(place) {
  _pendingSinglePlace = place;
  document.getElementById("single-input").value = place.description;
}

async function addSingleAddress() {
  const raw = document.getElementById("single-input").value.trim();
  if (!raw) return;
  await addStop(raw);
  _pendingSinglePlace = null;
  document.getElementById("single-input").value = "";
}

// ── Image upload ──────────────────────────────────────────────────────────────

async function handleImageUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  setUploadStatus(`🤖 Extracting addresses from ${files.length} image(s)…`);

  const formData = new FormData();
  files.forEach(f => formData.append("files", f));

  try {
    const res = await fetch("/api/extract-addresses", { method: "POST", body: formData });
    if (!res.ok) throw new Error(await res.text());
    const { addresses } = await res.json();

    if (!addresses.length) {
      setUploadStatus("No addresses found in the image(s).");
      return;
    }

    let added = 0, skipped = 0, flagged = 0;
    for (const { address, order_id, confident } of addresses) {
      const result = await addStop(address, !confident, order_id || null);
      if (result === "skipped") { skipped++; continue; }
      added++;
      if (!confident) flagged++;
    }

    const parts = [`✅ Added ${added} address(es)`];
    if (skipped) parts.push(`⏭️ ${skipped} skipped (same order ID)`);
    if (flagged) parts.push(`⚠️ ${flagged} need review`);
    setUploadStatus(parts.join(" · "));
  } catch (err) {
    setUploadStatus(`❌ Error: ${err.message}`);
  }
  event.target.value = "";
}

function setUploadStatus(msg) {
  document.getElementById("upload-status").textContent = msg;
}

function setupDragDrop() {
  const zone = document.getElementById("upload-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    document.getElementById("file-input").files = dt.files;
    handleImageUpload({ target: { files: dt.files, value: "" } });
  });
}

// ── Core stop management ──────────────────────────────────────────────────────

// Returns "skipped" if a stop with the same orderId already exists, otherwise undefined.
async function addStop(rawAddress, needsReview = false, orderId = null) {
  // Same order ID from a different image → skip silently (not a new stop)
  if (orderId && stops.some(s => s.orderId === orderId)) {
    return "skipped";
  }

  const id = Date.now() + Math.random();
  const stop = {
    id, orderId,
    originalAddress: rawAddress,
    formattedAddress: rawAddress,
    lat: null, lng: null,
    type: "unknown",
    status: needsReview ? "uncertain" : "pending",
  };
  stops.push(stop);
  renderStops();

  const result = await geocodeAddress(rawAddress);
  Object.assign(stop, {
    formattedAddress: result.formatted_address || rawAddress,
    lat: result.lat,
    lng: result.lng,
    type: result.type || "unknown",
    status: needsReview && result.status === "ok" ? "uncertain" : result.status,
  });
  renderStops();
}

function removeStop(id) {
  _editingIds.delete(id);
  stops = stops.filter(s => s.id !== id);
  renderStops();
}

function clearAll() {
  stops = [];
  _editingIds.clear();
  document.getElementById("results").style.display = "none";
  if (_routeMap) { _routeMap.remove(); _routeMap = null; }
  renderStops();
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

async function geocodeAddress(address) {
  const res = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return res.json();
}

async function fixAddress(id, newAddress) {
  const stop = stops.find(s => s.id === id);
  if (!stop) return;
  stop.status = "pending";
  stop.originalAddress = newAddress;
  renderStops();
  const result = await geocodeAddress(newAddress);
  Object.assign(stop, {
    formattedAddress: result.formatted_address || newAddress,
    lat: result.lat,
    lng: result.lng,
    type: result.type || "unknown",
    status: result.status,
  });
  renderStops();
}

// ── Google Places Autocomplete ────────────────────────────────────────────────

function setupAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let debounceTimer = null;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = "none"; return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q, dropdown, onSelect), 300);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === "Escape") dropdown.style.display = "none";
  });

  document.addEventListener("click", e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = "none";
  });
}

async function fetchSuggestions(query, dropdown, onSelect) {
  try {
    const res = await fetch(`/api/places-autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const { predictions } = await res.json();
    renderDropdown(predictions, dropdown, onSelect);
  } catch (_) {}
}

function renderDropdown(predictions, dropdown, onSelect) {
  if (!predictions || !predictions.length) { dropdown.style.display = "none"; return; }
  dropdown.innerHTML = "";
  predictions.forEach(p => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.textContent = p.description;
    item.addEventListener("mousedown", e => {
      e.preventDefault();
      onSelect(p);
      dropdown.style.display = "none";
    });
    dropdown.appendChild(item);
  });
  dropdown.style.display = "block";
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderStops() {
  updateSummary();
  updateUI();

  const container = document.getElementById("address-list");
  if (!stops.length) {
    container.innerHTML = '<div class="empty-state">No stops added yet.</div>';
    return;
  }

  const sameLocIds = findSameLocationIds();

  container.innerHTML = stops.map(stop => {
    const isSameLoc = sameLocIds.has(stop.id);
    const statusIcon = { ok: "✓", uncertain: "?", not_found: "✗", pending: "…" }[stop.status] || "…";
    const isBiz     = stop.type === "business";  // anything not "business" shows as residential
    const typeBadge = `<span class="address-type-badge type-toggle" onclick="toggleType(${stop.id})" title="Tap to switch business / residential">${isBiz ? "🏢 Business" : "🏠 Residential"}</span>`;
    const orderTag  = stop.orderId ? `<span class="order-id-tag">#${stop.orderId}</span>` : "";
    const earning   = getEarning(stop.formattedAddress);
    const earningBadge = earning !== null ? `<span class="earning-badge">💰 $${earning}</span>` : "";
    const editing   = _editingIds.has(stop.id);
    const flagged   = stop.status === "uncertain" || stop.status === "not_found";
    const showFix   = flagged || editing;  // flagged stops auto-show; others open via Edit
    const fixValue  = editing ? stop.formattedAddress.replace(/"/g, "&quot;") : "";
    const fixPlaceholder = flagged ? "Search correct address…" : "Search new address…";

    return `
    <div class="address-item${isSameLoc ? " same-loc" : ""}" data-id="${stop.id}">
      <div class="badge badge-${stop.status}">${statusIcon}</div>
      <div class="address-text">
        <div>${stop.formattedAddress}${orderTag}${isSameLoc ? ' <span class="same-loc-label">⚠ same location</span>' : ""}</div>
        ${stop.originalAddress !== stop.formattedAddress ? `<div class="original">Original: ${stop.originalAddress}</div>` : ""}
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
        ${typeBadge}
        ${earningBadge}
      </div>
      <button class="edit-btn" onclick="toggleEdit(${stop.id})" title="${editing ? "Cancel edit" : "Edit address"}">${editing ? "↩" : "✎"}</button>
      <button class="remove-btn" onclick="removeStop(${stop.id})" title="Remove">×</button>
      ${showFix ? `
        <div class="fix-row">
          <div class="autocomplete-wrapper" style="position:relative">
            <input type="text" class="fix-input" value="${fixValue}" placeholder="${fixPlaceholder}"
              onkeydown="if(event.key==='Enter'){applyFix(this,${stop.id})}"
            />
            <div class="autocomplete-dropdown fix-dd-${stop.id}" style="display:none"></div>
          </div>
          <button class="btn-secondary btn-sm" onclick="applyFix(this.previousElementSibling.querySelector('input'),${stop.id})">Save</button>
        </div>` : ""}
    </div>`;
  }).join("");

  // Wire up fix-row autocomplete after rendering
  document.querySelectorAll(".fix-input").forEach(input => {
    const item = input.closest(".address-item");
    const id = parseFloat(item.dataset.id);
    const dd = item.querySelector(`[class*="fix-dd-"]`);
    input.addEventListener("input", () => {
      clearTimeout(input._timer);
      const q = input.value.trim();
      if (q.length < 3) { if (dd) dd.style.display = "none"; return; }
      input._timer = setTimeout(() => fetchSuggestions(q, dd, p => {
        input.value = p.description;
        if (dd) dd.style.display = "none";
      }), 300);
    });
  });
}

function applyFix(input, id) {
  const val = input.value.trim();
  if (!val) return;
  _editingIds.delete(id);
  fixAddress(id, val);
}

// Toggle inline edit mode for an existing stop, then re-render to show/hide its search box.
function toggleEdit(id) {
  if (_editingIds.has(id)) _editingIds.delete(id);
  else _editingIds.add(id);
  renderStops();
}

// Manually flip a stop between business and residential (the auto-guess is best-effort).
function toggleType(id) {
  const stop = stops.find(s => s.id === id);
  if (!stop) return;
  stop.type = stop.type === "business" ? "residential" : "business";
  renderStops();  // recomputes the business count in the summary
}

// ── Summary ───────────────────────────────────────────────────────────────────

// Returns set of stop IDs where two different stops are within DUPLICATE_THRESHOLD_M of each other
function findSameLocationIds() {
  const ids = new Set();
  const confirmed = stops.filter(s => s.lat && s.lng);
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      if (distanceM(confirmed[i], confirmed[j]) < DUPLICATE_THRESHOLD_M) {
        ids.add(confirmed[i].id);
        ids.add(confirmed[j].id);
      }
    }
  }
  return ids;
}

function distanceM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

function updateSummary() {
  const sameLocPairs = findSameLocationIds().size / 2 | 0;
  const totalEarning = stops
    .filter(s => s.lat && s.lng)
    .reduce((sum, s) => {
      const e = getEarning(s.formattedAddress);
      return e !== null ? sum + e : sum;
    }, 0);

  document.getElementById("stat-total").textContent    = stops.length;
  document.getElementById("stat-duplicates").textContent = sameLocPairs;
  document.getElementById("stat-business").textContent  = stops.filter(s => s.type === "business").length;
  document.getElementById("stat-earning").textContent   = `$${totalEarning}`;
  document.getElementById("stop-count").textContent     = stops.length ? `(${stops.length})` : "";
}

function updateUI() {
  const ready = stops.length > 0 && startDepot && stops.every(s => s.status === "ok" || s.status === "uncertain");
  const btn = document.getElementById("optimize-btn");
  btn.disabled = !ready;
  btn.title = !startDepot ? "Save your starting point first" : !ready ? "Fix flagged addresses first" : "";
}

// ── Optimize ──────────────────────────────────────────────────────────────────

async function optimize() {
  if (!startDepot) { showToast("Set your starting point first"); return; }
  const confirmed = stops.filter(s => s.lat && s.lng);
  if (!confirmed.length) { showToast("No geocoded stops to optimize"); return; }

  const btn = document.getElementById("optimize-btn");
  btn.innerHTML = '<span class="spinner"></span> Optimizing…';
  btn.disabled = true;

  try {
    const payload = {
      depot: toStopPayload(startDepot),
      end_depot: endDepot ? toStopPayload(endDepot) : null,
      stops: confirmed.map(s => ({
        formatted_address: s.formattedAddress,
        lat: s.lat,
        lng: s.lng,
        type: s.type,
      })),
    };

    const res = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    btn.innerHTML = "⚡ Optimize Route";
    btn.disabled = false;
  }
}

function toStopPayload(depot) {
  return {
    formatted_address: depot.formattedAddress,
    lat: depot.lat,
    lng: depot.lng,
    type: "unknown",
  };
}

// ── Results ───────────────────────────────────────────────────────────────────

function renderResults({ ordered_stops, maps_links, whatsapp_text }) {
  const resultsEl = document.getElementById("results");
  resultsEl.style.display = "block";

  // Remember this route so Share can include it — tagged with a signature of the
  // current stops+depots so we never share a route that no longer matches the stops.
  _lastResult = {
    ordered_stops: ordered_stops.map(s => ({
      formatted_address: s.formatted_address, lat: s.lat, lng: s.lng, type: s.type,
    })),
    maps_links,
    whatsapp_text,
  };
  _lastResultSig = routeSignature();

  // Map
  renderMap(ordered_stops);

  // Primary Google Maps button (first link)
  const mapsBtn = document.getElementById("maps-btn-primary");
  mapsBtn.href = maps_links[0];

  // Extra part links (only when route splits into multiple)
  const extraEl = document.getElementById("maps-extra-links");
  if (maps_links.length > 1) {
    extraEl.innerHTML = maps_links.slice(1).map((url, i) =>
      `<a href="${url}" target="_blank" class="maps-part-link">🗺️ Open Part ${i + 2} in Google Maps</a>`
    ).join("");
  } else {
    extraEl.innerHTML = "";
  }

  // Ordered stop list
  const listEl = document.getElementById("result-list");
  let totalEarning = 0;
  listEl.innerHTML = ordered_stops.map((stop, i) => {
    const earning = getEarning(stop.formatted_address);
    if (earning !== null) totalEarning += earning;
    const earningBadge = earning !== null ? `<span class="earning-badge">💰 $${earning}</span>` : "";
    return `
    <div class="result-item">
      <div class="result-num">${i + 1}</div>
      <div style="flex:1">
        <div class="result-address">${stop.formatted_address}</div>
        <div class="result-type">${stop.type === "business" ? "🏢 Business" : stop.type === "residential" ? "🏠 Residential" : ""}</div>
      </div>
      ${earningBadge}
    </div>`;
  }).join("");
  if (totalEarning > 0) {
    listEl.innerHTML += `<div class="total-earning">💰 Total estimated earning: $${totalEarning}</div>`;
  }

  document.getElementById("whatsapp-text").textContent = whatsapp_text;

  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Leaflet Map ───────────────────────────────────────────────────────────────

function renderMap(orderedStops) {
  const mapEl = document.getElementById("route-map");

  if (_routeMap) {
    _routeMap.remove();
    _routeMap = null;
  }

  _routeMap = L.map(mapEl);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(_routeMap);

  const latlngs = [];

  // Start marker
  const startLL = [startDepot.lat, startDepot.lng];
  latlngs.push(startLL);
  L.marker(startLL, { icon: depotIcon("S", "#16a34a") })
    .addTo(_routeMap)
    .bindPopup(`<b>🟢 Start</b><br>${startDepot.formattedAddress}`);

  // Numbered stop markers
  orderedStops.forEach((stop, i) => {
    const ll = [stop.lat, stop.lng];
    latlngs.push(ll);
    L.marker(ll, { icon: numIcon(i + 1) })
      .addTo(_routeMap)
      .bindPopup(`<b>${i + 1}.</b> ${stop.formatted_address}`);
  });

  // End marker
  const actualEnd = endDepot || startDepot;
  const endLL = [actualEnd.lat, actualEnd.lng];
  latlngs.push(endLL);
  const isSameStartEnd = !endDepot || (endDepot.lat === startDepot.lat && endDepot.lng === startDepot.lng);
  if (!isSameStartEnd) {
    L.marker(endLL, { icon: depotIcon("E", "#dc2626") })
      .addTo(_routeMap)
      .bindPopup(`<b>🔴 End</b><br>${actualEnd.formattedAddress}`);
  }

  // Route polyline
  L.polyline(latlngs, { color: "#2563eb", weight: 3, opacity: 0.8, dashArray: "8 5" }).addTo(_routeMap);

  _routeMap.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
}

function numIcon(n) {
  return L.divIcon({
    className: "",
    html: `<div class="map-num-marker">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function depotIcon(label, color) {
  return L.divIcon({
    className: "",
    html: `<div class="map-depot-marker" style="background:${color}">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

// ── Share ─────────────────────────────────────────────────────────────────────

// Share a link to the app that restores the whole current session (stops + depots,
// plus the optimized route if it's still current), so the recipient can keep editing
// and open the GPS themselves. Hands off to WhatsApp, which handles long links well.
async function shareSession() {
  const confirmed = stops.filter(s => s.lat && s.lng);
  if (!confirmed.length) { showToast("Add some stops first"); return; }

  const payload = {
    v: 1,
    start: startDepot ? { a: startDepot.formattedAddress, lat: startDepot.lat, lng: startDepot.lng } : null,
    end:   endDepot   ? { a: endDepot.formattedAddress,   lat: endDepot.lat,   lng: endDepot.lng   } : null,
    stops: confirmed.map(s => {
      const o = { a: s.formattedAddress, lat: s.lat, lng: s.lng, t: s.type };
      if (s.orderId) o.o = s.orderId;
      return o;
    }),
  };
  // Include the optimized route only if it still matches the current stops/depots.
  if (_lastResult && _lastResultSig === routeSignature()) {
    payload.result = _lastResult;
  }

  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = `${location.origin}${location.pathname}#s=${encoded}`;
  const message = `Open my delivery route in the app:\n${url}`;

  // Copy as a backup, then open WhatsApp prefilled with the link.
  try { await navigator.clipboard.writeText(url); } catch (_) {}
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
}

function copyWhatsapp() {
  const text = document.getElementById("whatsapp-text").textContent;
  navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard!"));
}

// ── Zone Earnings ─────────────────────────────────────────────────────────────

let _settingsOpen = false;

function extractZoneKey(formattedAddress) {
  // Canadian postal code A1A 1A1 → capture first 2 chars (e.g. "M4" from "M4L 2T3")
  const m = (formattedAddress || "").match(/\b([A-Z]\d)[A-Z]\s?\d[A-Z]\d\b/i);
  return m ? m[1].toUpperCase() : null;
}

function extractCity(formattedAddress) {
  // Canadian formatted address: "123 Main St, City, ON A1B 2C3, Canada"
  const m = (formattedAddress || "").match(/,\s*([^,]+?),\s*ON\b/i);
  return m ? m[1].trim().toLowerCase() : null;
}

// Canonical key for a city name so matching ignores case, spacing, and punctuation:
// "North York", "north york", and "NorthYork" all collapse to "northyork".
function normalizeCity(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getEarning(formattedAddress) {
  const city = normalizeCity(extractCity(formattedAddress));
  let earning = null;

  if (city === "toronto" && zoneEarnings.toronto) {
    const zoneKey = extractZoneKey(formattedAddress);
    if (zoneKey && zoneKey in zoneEarnings.toronto) {
      earning = zoneEarnings.toronto[zoneKey];
    }
  } else if (city) {
    // Match a stored city key by its canonical form, so however the user typed it
    // in settings (case/spacing) still lines up with Google's formatted address.
    const key = Object.keys(zoneEarnings).find(
      k => k !== "_default" && k !== "toronto" && normalizeCity(k) === city
    );
    if (key) earning = zoneEarnings[key];
  }

  // null means not configured for this zone → fall back to default
  if (earning === null || earning === undefined) {
    earning = (zoneEarnings._default != null) ? zoneEarnings._default : null;
  }
  return earning;
}

function toggleSettings() {
  _settingsOpen = !_settingsOpen;
  document.getElementById("settings-body").style.display = _settingsOpen ? "block" : "none";
  document.getElementById("settings-toggle-btn").textContent = _settingsOpen ? "▲" : "▼";
  if (_settingsOpen) {
    document.getElementById("default-earning-input").value =
      (zoneEarnings._default != null) ? zoneEarnings._default : "";
    renderTorontoTable();
    renderCityTable();
  }
}

function _torontoRowHtml(zone, amount) {
  return `
    <td><input type="text" class="zone-short-input toronto-zone-input" value="${zone}"
        placeholder="M4" maxlength="3" style="text-transform:uppercase" /></td>
    <td><input type="number" class="zone-short-input toronto-amount-input"
        value="${amount != null ? amount : ''}" min="0" step="0.5" placeholder="not set" /></td>
    <td><button class="btn-secondary btn-sm remove-toronto-btn">Remove</button></td>`;
}

function renderTorontoTable() {
  const tbody   = document.getElementById("toronto-zone-tbody");
  const entries = Object.entries(zoneEarnings.toronto || {}).sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="zone-empty">No Toronto zones — add one below</td></tr>';
  } else {
    tbody.innerHTML = entries.map(([zone, amount]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = _torontoRowHtml(zone, amount);
      return tr.outerHTML;
    }).join("");
  }

  tbody.onclick = e => {
    const btn = e.target.closest(".remove-toronto-btn");
    if (!btn) return;
    btn.closest("tr").remove();
    if (!tbody.querySelector("tr")) {
      tbody.innerHTML = '<tr><td colspan="3" class="zone-empty">No Toronto zones — add one below</td></tr>';
    }
  };
}

function addTorontoZone() {
  const zoneInput   = document.getElementById("new-toronto-zone-input");
  const amountInput = document.getElementById("new-toronto-amount-input");
  const zone   = zoneInput.value.trim().toUpperCase();
  const amount = parseFloat(amountInput.value);
  if (!zone) { showToast("Enter a postal prefix (e.g. M6)"); return; }

  const tbody = document.getElementById("toronto-zone-tbody");
  const empty = tbody.querySelector(".zone-empty");
  if (empty) empty.closest("tr").remove();

  const tr = document.createElement("tr");
  tr.innerHTML = _torontoRowHtml(zone, isNaN(amount) ? null : amount);
  tbody.appendChild(tr);

  zoneInput.value   = "";
  amountInput.value = "";
}

function _cityRowHtml(cityName, amount) {
  const label = cityName.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
  return `
    <td><input type="text" class="city-name-input" value="${label}" placeholder="City name" /></td>
    <td><input type="number" class="zone-short-input city-amount-input"
        value="${amount != null ? amount : ''}" min="0" step="0.5" placeholder="not set" /></td>
    <td><button class="btn-secondary btn-sm remove-city-btn">Remove</button></td>`;
}

function renderCityTable() {
  const tbody = document.getElementById("city-tbody");
  const entries = Object.entries(zoneEarnings)
    .filter(([k]) => k !== "_default" && k !== "toronto")
    .sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="zone-empty">No cities configured</td></tr>';
  } else {
    tbody.innerHTML = entries.map(([city, amount]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = _cityRowHtml(city, amount);
      return tr.outerHTML;
    }).join("");
  }

  // Wire up remove buttons (event delegation avoids inline onclick with escaping issues)
  tbody.onclick = e => {
    const btn = e.target.closest(".remove-city-btn");
    if (!btn) return;
    const row = btn.closest("tr");
    row.remove();
    if (!tbody.querySelector("tr")) {
      tbody.innerHTML = '<tr><td colspan="3" class="zone-empty">No cities configured</td></tr>';
    }
  };
}

function addCityEntry() {
  const cityInput   = document.getElementById("new-city-input");
  const amountInput = document.getElementById("new-city-amount-input");
  const city   = cityInput.value.trim();
  const amount = parseFloat(amountInput.value);
  if (!city) { showToast("Enter a city name"); return; }
  if (city.toLowerCase() === "toronto") { showToast("Toronto is configured in its own section above"); return; }

  const tbody = document.getElementById("city-tbody");
  // Remove empty-state row if present
  const empty = tbody.querySelector(".zone-empty");
  if (empty) empty.closest("tr").remove();

  const tr = document.createElement("tr");
  tr.innerHTML = _cityRowHtml(city, isNaN(amount) ? null : amount);
  tbody.appendChild(tr);

  cityInput.value   = "";
  amountInput.value = "";
}

async function saveZoneSettings() {
  const payload = { _default: null, toronto: {} };

  const defaultVal = parseFloat(document.getElementById("default-earning-input").value);
  payload._default = isNaN(defaultVal) ? null : defaultVal;

  const seenZones = new Set();
  document.querySelectorAll("#toronto-zone-tbody tr").forEach(row => {
    const zoneEl   = row.querySelector(".toronto-zone-input");
    const amountEl = row.querySelector(".toronto-amount-input");
    if (!zoneEl) return;
    const zone = zoneEl.value.trim().toUpperCase();
    const val  = parseFloat(amountEl?.value);
    if (zone && !seenZones.has(zone)) {
      seenZones.add(zone);
      payload.toronto[zone] = isNaN(val) ? null : val;
    }
  });

  // Read city name + earning directly from DOM rows (name is editable).
  // Dedup by canonical form so "North York" and "northyork" can't both be saved.
  const seen = new Set();
  document.querySelectorAll("#city-tbody tr").forEach(row => {
    const nameEl   = row.querySelector(".city-name-input");
    const amountEl = row.querySelector(".city-amount-input");
    if (!nameEl) return; // empty-state row
    const city = nameEl.value.trim().toLowerCase();
    const norm = normalizeCity(city);
    const val  = parseFloat(amountEl?.value);
    if (norm && norm !== "toronto" && city !== "_default" && !seen.has(norm)) {
      seen.add(norm);
      payload[city] = isNaN(val) ? null : val;
    }
  });

  try {
    const res = await fetch("/api/zone-earnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    zoneEarnings = payload;
    renderStops();
    showToast("Zone settings saved!");
  } catch (err) {
    showToast(`Error saving: ${err.message}`);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}
