import os
from typing import Literal

import httpx

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Google Places types that indicate a business/establishment
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


def _classify_type(place_types: list[str], location_type: str) -> Literal["residential", "business", "unknown"]:
    # Business wins if any business type is present
    if any(t in _BUSINESS_TYPES for t in place_types):
        return "business"
    # Explicit residential type in result
    if any(t in _RESIDENTIAL_TYPES for t in place_types):
        return "residential"
    # ROOFTOP/RANGE_INTERPOLATED means Google matched to a specific building/address —
    # treat as residential when no business types were found
    if location_type in _PRECISE_LOCATION_TYPES:
        return "residential"
    return "unknown"


async def geocode(address: str) -> dict:
    """
    Geocode a single address string.
    Returns {formatted_address, lat, lng, type, status}
    status: "ok" | "uncertain" | "not_found"
    """
    api_key = os.environ["GOOGLE_MAPS_API_KEY"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            _GEOCODE_URL,
            params={"address": address, "key": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

    if not data["results"]:
        return {"formatted_address": address, "lat": None, "lng": None, "type": "unknown", "status": "not_found"}

    result = data["results"][0]
    location = result["geometry"]["location"]
    location_type = result["geometry"].get("location_type", "")
    place_types = result.get("types", [])

    # ROOFTOP = exact match; RANGE_INTERPOLATED = estimated; others = less precise
    status = "ok" if location_type in _PRECISE_LOCATION_TYPES else "uncertain"

    return {
        "formatted_address": result["formatted_address"],
        "lat": location["lat"],
        "lng": location["lng"],
        "type": _classify_type(place_types, location_type),
        "status": status,
    }
