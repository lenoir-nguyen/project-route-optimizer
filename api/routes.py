import os
import urllib.parse
from typing import Annotated

import httpx
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from api.geocoder import geocode
from api.matrix import build_duration_matrix
from api.solver import solve_tsp
from api.vision import extract_addresses_from_images

router = APIRouter(prefix="/api")

_ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAPS_WAYPOINT_LIMIT = 25  # Google Maps URL supports up to 23 waypoints + origin + destination


# ── Models ──────────────────────────────────────────────────────────────────

class GeocodeRequest(BaseModel):
    address: str


class Stop(BaseModel):
    address: str = ""
    formatted_address: str
    lat: float
    lng: float
    type: str = "unknown"


class OptimizeRequest(BaseModel):
    depot: Stop
    end_depot: Stop | None = None  # None = round trip (end same as start)
    stops: list[Stop]


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/extract-addresses")
async def extract_addresses(files: Annotated[list[UploadFile], File()]):
    """Accept image uploads → return extracted addresses via Claude Vision."""
    image_files: list[tuple[bytes, str]] = []
    for upload in files:
        if upload.content_type not in _ALLOWED_MEDIA_TYPES:
            raise HTTPException(400, f"Unsupported file type: {upload.content_type}")
        data = await upload.read()
        image_files.append((data, upload.content_type))

    extracted = extract_addresses_from_images(image_files)
    return {"addresses": extracted}


@router.get("/places-autocomplete")
async def places_autocomplete(q: str = Query(..., min_length=2)):
    """Proxy Google Places Autocomplete — keeps API key server-side."""
    api_key = os.environ["GOOGLE_MAPS_API_KEY"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/place/autocomplete/json",
            params={"input": q, "key": api_key, "types": "address"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    predictions = [
        {"description": p["description"], "place_id": p["place_id"]}
        for p in data.get("predictions", [])
    ]
    return {"predictions": predictions}


@router.post("/geocode")
async def geocode_address(body: GeocodeRequest):
    """Geocode a single address string → lat/lng, formatted address, type, status."""
    result = await geocode(body.address)
    return result


@router.post("/optimize")
async def optimize_route(body: OptimizeRequest):
    """Accept a depot + optional end depot + validated stops → optimized order + Maps URLs."""
    if not body.stops:
        raise HTTPException(400, "At least one stop is required.")
    if len(body.stops) > 57:
        raise HTTPException(400, "Maximum 57 stops supported.")

    end_depot = body.end_depot
    round_trip = end_depot is None or (
        abs(end_depot.lat - body.depot.lat) < 1e-6
        and abs(end_depot.lng - body.depot.lng) < 1e-6
    )

    if round_trip:
        locations = [(body.depot.lat, body.depot.lng)] + [(s.lat, s.lng) for s in body.stops]
        end_idx = 0
        actual_end = body.depot
    else:
        locations = (
            [(body.depot.lat, body.depot.lng)]
            + [(s.lat, s.lng) for s in body.stops]
            + [(end_depot.lat, end_depot.lng)]
        )
        end_idx = len(locations) - 1
        actual_end = end_depot

    duration_matrix = await build_duration_matrix(locations)
    ordered_indices = solve_tsp(duration_matrix, end_idx=end_idx)
    ordered_stops = [body.stops[i - 1] for i in ordered_indices]

    maps_links = _build_maps_links(body.depot, ordered_stops, actual_end)

    return {
        "ordered_stops": ordered_stops,
        "maps_links": maps_links,
        "whatsapp_text": _build_whatsapp_text(ordered_stops),
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _maps_url(waypoints: list[str]) -> str:
    # safe="" so commas/spaces in addresses are percent-encoded; Maps decodes them fine
    encoded = "/".join(urllib.parse.quote(w, safe="") for w in waypoints)
    return f"https://www.google.com/maps/dir/{encoded}"


def _build_maps_links(depot: Stop, stops: list[Stop], end_depot: Stop) -> list[str]:
    """Split into chunks of ≤23 stops per Maps URL using formatted addresses.
    Addresses are more reliably parsed by the Maps mobile app than raw lat/lng coordinates.
    """
    links: list[str] = []
    chunk_size = _MAPS_WAYPOINT_LIMIT - 2  # leave room for origin + destination

    for i in range(0, len(stops), chunk_size):
        chunk = stops[i : i + chunk_size]
        origin = depot.formatted_address if i == 0 else stops[i - 1].formatted_address
        is_last_chunk = i + chunk_size >= len(stops)
        destination = end_depot.formatted_address if is_last_chunk else stops[i + chunk_size].formatted_address
        waypoints = [origin] + [s.formatted_address for s in chunk] + [destination]
        links.append(_maps_url(waypoints))

    return links


def _build_whatsapp_text(stops: list[Stop]) -> str:
    lines = ["🗺️ Today's optimized route:\n"]
    for i, stop in enumerate(stops, 1):
        icon = "🏢" if stop.type == "business" else "🏠"
        lines.append(f"{i}. {icon} {stop.formatted_address}")
    lines.append(f"\nTotal stops: {len(stops)}")
    return "\n".join(lines)
