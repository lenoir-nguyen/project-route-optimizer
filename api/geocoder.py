import asyncio
import os
from typing import Literal

import httpx

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_PLACES_FIND_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"

_BUSINESS_TYPES = {
    "establishment",
    "point_of_interest",
    "store",
    "food",
    "health",
    "school",
    "hospital",
    "bank",
    "lodging",
    "restaurant",
    "cafe",
    "bar",
}

_RESIDENTIAL_TYPES = {
    "street_address",
    "premise",
    "subpremise",
    "residential",
}

_PRECISE_LOCATION_TYPES = {"ROOFTOP", "RANGE_INTERPOLATED"}


def _classify_from_types(place_types: list[str]) -> Literal["residential", "business", "unknown"]:
    if any(t in _BUSINESS_TYPES for t in place_types):
        return "business"
    if any(t in _RESIDENTIAL_TYPES for t in place_types):
        return "residential"
    return "unknown"


async def geocode(address: str) -> dict:
    """
    Geocode a single address string.
    Returns {formatted_address, lat, lng, type, status}
    status: "ok" | "uncertain" | "not_found"

    Runs geocoding + Places findplacefromtext in parallel.
    Places API gives reliable business vs. residential types;
    the Geocoding API types field only describes result precision, not land use.
    """
    api_key = os.environ["GOOGLE_MAPS_API_KEY"]

    async with httpx.AsyncClient() as client:
        geocode_resp, places_resp = await asyncio.gather(
            client.get(_GEOCODE_URL, params={"address": address, "key": api_key}, timeout=10),
            client.get(
                _PLACES_FIND_URL,
                params={"input": address, "inputtype": "textquery", "fields": "types", "key": api_key},
                timeout=10,
            ),
        )
        geocode_resp.raise_for_status()

    geocode_data = geocode_resp.json()

    if not geocode_data["results"]:
        return {"formatted_address": address, "lat": None, "lng": None, "type": "unknown", "status": "not_found"}

    result = geocode_data["results"][0]
    location = result["geometry"]["location"]
    location_type = result["geometry"].get("location_type", "")
    status = "ok" if location_type in _PRECISE_LOCATION_TYPES else "uncertain"

    # Classify using Places types (authoritative) then fall back to geocoding types
    place_type: Literal["residential", "business", "unknown"] = "unknown"
    try:
        candidates = places_resp.json().get("candidates", [])
        if candidates:
            place_type = _classify_from_types(candidates[0].get("types", []))
    except Exception:
        pass

    if place_type == "unknown":
        place_type = _classify_from_types(result.get("types", []))

    return {
        "formatted_address": result["formatted_address"],
        "lat": location["lat"],
        "lng": location["lng"],
        "type": place_type,
        "status": status,
    }
