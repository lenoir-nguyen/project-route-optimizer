import os
from typing import Literal

import httpx

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

_PRECISE_LOCATION_TYPES = {"ROOFTOP", "RANGE_INTERPOLATED"}


async def geocode(address: str) -> dict:
    """
    Geocode a single address string.
    Returns {formatted_address, lat, lng, type, status}

    type: "business" | "residential" | "unknown"
    status: "ok" | "uncertain" | "not_found"

    Classification uses Places Nearby Search at the geocoded coordinates (radius=10m).
    Businesses registered in Google Places appear in that search; residential addresses don't.
    findplacefromtext was replaced because it's a text search engine — it finds the closest
    matching place name, not what's physically at the address, causing misclassification
    in both directions for bare street addresses with no business name.
    """
    api_key = os.environ["GOOGLE_MAPS_API_KEY"]

    async with httpx.AsyncClient() as client:
        geo = await client.get(
            _GEOCODE_URL,
            params={"address": address, "key": api_key},
            timeout=10,
        )
        geo.raise_for_status()
        geo_data = geo.json()

        if not geo_data["results"]:
            return {
                "formatted_address": address,
                "lat": None,
                "lng": None,
                "type": "unknown",
                "status": "not_found",
            }

        result = geo_data["results"][0]
        location = result["geometry"]["location"]
        location_type = result["geometry"].get("location_type", "")
        lat, lng = location["lat"], location["lng"]
        status = "ok" if location_type in _PRECISE_LOCATION_TYPES else "uncertain"

        place_type: Literal["business", "residential", "unknown"] = "unknown"

        if location_type in _PRECISE_LOCATION_TYPES:
            nearby = await client.get(
                _PLACES_NEARBY_URL,
                params={
                    "location": f"{lat},{lng}",
                    "radius": 10,
                    "type": "establishment",
                    "key": api_key,
                },
                timeout=10,
            )
            place_type = "business" if nearby.json().get("results") else "residential"

    return {
        "formatted_address": result["formatted_address"],
        "lat": lat,
        "lng": lng,
        "type": place_type,
        "status": status,
    }
