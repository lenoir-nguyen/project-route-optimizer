// ── State ─────────────────────────────────────────────────────────────────────

const GOOGLE_MAPS_KEY = null; // set via window.GOOGLE_MAPS_KEY injected by backend if needed
const DUPLICATE_THRESHOLD_M = 50; // metres

let stops = []; // [{id, originalAddress, formattedAddress, lat, lng, type, status}]
let depot = JSON.parse(localStorage.getItem("depot") || "null");
let autocompleteSession = {}; // per-field debounce timers & controllers

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  if (depot) {
    document.getElementById("depot-input").value = depot.formattedAddress;
    setDepotStatus(`✅ ${depot.formattedAddress}`, "green");
  }
  setupAutocomplete("depot-input", "depot-dropdown", onDepotSelect);
  setupAutocomplete("single-input", "single-dropdown", onSingleSelect);
  setupDragDrop();
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// ── Depot ─────────────────────────────────────────────────────────────────────

async function saveDepot() {
  const raw = document.getElementById("depot-input").value.trim();
  if (!raw) return;
  setDepotStatus("Geocoding…", "gray");
  const result = await geocodeAddress(raw);
  if (result.status === "not_found") {
    setDepotStatus("❌ Address not found — try Google autocomplete", "red");
    return;
  }
  depot = { formattedAddress: result.formatted_address, lat: result.lat, lng: result.lng };
  localStorage.setItem("depot", JSON.stringify(depot));
  document.getElementById("depot-input").value = depot.formattedAddress;
  setDepotStatus(`✅ Saved: ${depot.formattedAddress}`, "green");
  updateUI();
}

function onDepotSelect(place) {
  depot = { formattedAddress: place.description, lat: null, lng: null };
  // Geocode to get coordinates
  geocodeAddress(place.description).then(result => {
    if (result.lat) {
      depot.lat = result.lat;
      depot.lng = result.lng;
      depot.formattedAddress = result.formatted_address;
      localStorage.setItem("depot", JSON.stringify(depot));
      document.getElementById("depot-input").value = depot.formattedAddress;
      setDepotStatus(`✅ Saved: ${depot.formattedAddress}`, "green");
      updateUI();
    }
  });
}

function setDepotStatus(msg, color) {
  const el = document.getElementById("depot-status");
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
  if (_pendingSinglePlace && _pendingSinglePlace.description === raw) {
    // Use the place prediction directly (already has formatted address)
    await addStop(raw);
    _pendingSinglePlace = null;
  } else {
    await addStop(raw);
  }
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

    let added = 0, flagged = 0;
    for (const { address, confident } of addresses) {
      await addStop(address, !confident);
      added++;
      if (!confident) flagged++;
    }
    setUploadStatus(`✅ Added ${added} address(es)${flagged ? ` · ⚠️ ${flagged} need review` : ""}`);
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

async function addStop(rawAddress, needsReview = false) {
  const id = Date.now() + Math.random();
  const stop = { id, originalAddress: rawAddress, formattedAddress: rawAddress, lat: null, lng: null, type: "unknown", status: "pending" };
  if (needsReview) stop.status = "uncertain";
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
  stops = stops.filter(s => s.id !== id);
  renderStops();
}

function clearAll() {
  stops = [];
  document.getElementById("results").style.display = "none";
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

// Fix an uncertain address using the autocomplete result
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
  let abortController = null;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = "none"; return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q, dropdown, onSelect, () => abortController), 300);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { dropdown.style.display = "none"; }
    if (e.key === "Escape") { dropdown.style.display = "none"; }
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

// Inline fix autocomplete for a specific stop
function setupFixAutocomplete(inputEl, id) {
  let debounceTimer = null;
  const dropdown = inputEl.nextElementSibling;

  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = inputEl.value.trim();
    if (q.length < 3) { if (dropdown) dropdown.style.display = "none"; return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q, dropdown, p => {
      inputEl.value = p.description;
      if (dropdown) dropdown.style.display = "none";
    }), 300);
  });
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

  const dupes = findDuplicates();

  container.innerHTML = stops.map(stop => {
    const isDupe = dupes.has(stop.id);
    const statusIcon = { ok: "✓", uncertain: "?", not_found: "✗", pending: "…" }[stop.status] || "…";
    const typeLabel = stop.type === "business" ? "🏢 Business" : stop.type === "residential" ? "🏠 Residential" : "";

    return `
    <div class="address-item${isDupe ? ' style="border-color:var(--yellow)"' : ''}" data-id="${stop.id}">
      <div class="badge badge-${stop.status}">${statusIcon}</div>
      <div class="address-text">
        <div>${stop.formattedAddress}${isDupe ? ' <span style="color:var(--yellow);font-size:.72rem">⚠ duplicate</span>' : ""}</div>
        ${stop.originalAddress !== stop.formattedAddress ? `<div class="original">Original: ${stop.originalAddress}</div>` : ""}
        ${stop.status === "uncertain" || stop.status === "not_found" ? `
          <div class="fix-row">
            <div class="autocomplete-wrapper" style="position:relative">
              <input type="text" class="fix-input" placeholder="Search correct address…"
                oninput="debounceFix(this, ${stop.id})"
                onkeydown="if(event.key==='Enter'){applyFix(this,${stop.id})}"
              />
              <div class="autocomplete-dropdown fix-dropdown-${stop.id}" style="display:none"></div>
            </div>
            <button class="btn-secondary btn-sm" onclick="applyFix(this.previousElementSibling.querySelector('input'),${stop.id})">Fix</button>
          </div>` : ""}
      </div>
      ${typeLabel ? `<span class="address-type-badge">${typeLabel}</span>` : ""}
      <button class="remove-btn" onclick="removeStop(${stop.id})" title="Remove">×</button>
    </div>`;
  }).join("");

  // Wire up fix-dropdown autocomplete
  document.querySelectorAll(".fix-input").forEach(input => {
    const id = parseFloat(input.closest(".address-item").dataset.id);
    const dropdown = input.parentElement.querySelector(`[class*="fix-dropdown"]`);
    input.addEventListener("input", () => {
      clearTimeout(input._timer);
      const q = input.value.trim();
      if (q.length < 3) { dropdown.style.display = "none"; return; }
      input._timer = setTimeout(() => fetchSuggestions(q, dropdown, p => {
        input.value = p.description;
        dropdown.style.display = "none";
      }), 300);
    });
  });
}

function debounceFix(input, id) {
  // handled by inline event wiring above via input event
}

function applyFix(inputOrEl, id) {
  const input = inputOrEl.tagName === "INPUT" ? inputOrEl : inputOrEl;
  const val = input.value.trim();
  if (!val) return;
  fixAddress(id, val);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function findDuplicates() {
  const dupeIds = new Set();
  const confirmed = stops.filter(s => s.lat && s.lng);
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      if (distanceM(confirmed[i], confirmed[j]) < DUPLICATE_THRESHOLD_M) {
        dupeIds.add(confirmed[i].id);
        dupeIds.add(confirmed[j].id);
      }
    }
  }
  return dupeIds;
}

function distanceM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(sin2));
}

function updateSummary() {
  const total = stops.length;
  const dupes = findDuplicates().size / 2 | 0; // pairs
  const business = stops.filter(s => s.type === "business").length;

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-duplicates").textContent = dupes;
  document.getElementById("stat-business").textContent = business;
  document.getElementById("stop-count").textContent = total ? `(${total})` : "";
}

function updateUI() {
  const ready = stops.length > 0 && depot && stops.every(s => s.status === "ok" || s.status === "uncertain");
  const allGood = stops.length > 0 && depot && stops.every(s => s.status === "ok");
  const btn = document.getElementById("optimize-btn");
  btn.disabled = !ready;
  btn.title = !depot ? "Save your depot first" : !ready ? "Fix flagged addresses first" : "";
}

// ── Optimize ──────────────────────────────────────────────────────────────────

async function optimize() {
  if (!depot) { showToast("Set your depot first"); return; }
  const confirmed = stops.filter(s => s.lat && s.lng);
  if (!confirmed.length) { showToast("No geocoded stops to optimize"); return; }

  const btn = document.getElementById("optimize-btn");
  btn.innerHTML = '<span class="spinner"></span> Optimizing…';
  btn.disabled = true;

  try {
    const res = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depot, stops: confirmed }),
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

function renderResults({ ordered_stops, maps_links, whatsapp_text }) {
  const resultsEl = document.getElementById("results");
  resultsEl.style.display = "block";
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });

  const linksEl = document.getElementById("maps-links");
  linksEl.innerHTML = maps_links.map((url, i) =>
    `<a href="${url}" target="_blank">🗺️ Open in Google Maps${maps_links.length > 1 ? ` (Part ${i + 1})` : ""}</a>`
  ).join("");

  const listEl = document.getElementById("result-list");
  listEl.innerHTML = ordered_stops.map((stop, i) => `
    <div class="result-item">
      <div class="result-num">${i + 1}</div>
      <div>
        <div class="result-address">${stop.formatted_address}</div>
        <div class="result-type">${stop.type === "business" ? "🏢 Business" : stop.type === "residential" ? "🏠 Residential" : ""}</div>
      </div>
    </div>`).join("");

  document.getElementById("whatsapp-text").value = whatsapp_text;
}

// ── WhatsApp copy ─────────────────────────────────────────────────────────────

function copyWhatsapp() {
  const text = document.getElementById("whatsapp-text").value;
  navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard!"));
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}
