import os
from typing import Literal

import httpx

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_ADDRESS_VALIDATION_URL = "https://addressvalidation.googleapis.com/v1:validateAddress"

_PRECISE_LOCATION_TYPES = {"ROOFTOP", "RANGE_INTERPOLATED"}

PlaceType = Literal["business", "residential"]


async def geocode(address: str) -> dict:
    """
    Geocode a single address string.
    Returns {formatted_address, lat, lng, type, status}

    type:   "business" | "residential"  (best-effort; the driver can flip it in the UI)
    status: "ok" | "uncertain" | "not_found"

    Classification uses Google's **Address Validation API** metadata (business/residential),
    which is purpose-built for this. The previous Places Nearby Search approach was abandoned
    because home-based businesses registered at residential addresses made it mark nearly every
    stop "business". When the API has no signal for an address (Canadian coverage is partial) or
    isn't enabled, we default to "residential" — most deliveries are homes — and the UI lets the
    driver correct it with a tap.
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
                "type": "residential",
                "status": "not_found",
            }

        result = geo_data["results"][0]
        location = result["geometry"]["location"]
        location_type = result["geometry"].get("location_type", "")
        lat, lng = location["lat"], location["lng"]
        status = "ok" if location_type in _PRECISE_LOCATION_TYPES else "uncertain"

        place_type = await _classify(client, address, api_key)

    return {
        "formatted_address": result["formatted_address"],
        "lat": lat,
        "lng": lng,
        "type": place_type,
        "status": status,
    }


async def _classify(client: httpx.AsyncClient, address: str, api_key: str) -> PlaceType:
    """
    Best-effort business/residential via Address Validation metadata.
    Falls back to "residential" on any error (incl. the API not being enabled) or no signal.
    """
    try:
        resp = await client.post(
            _ADDRESS_VALIDATION_URL,
            params={"key": api_key},
            json={"address": {"regionCode": "CA", "addressLines": [address]}},
            timeout=10,
        )
        if resp.status_code != 200:
            return "residential"
        metadata = resp.json().get("result", {}).get("metadata", {})
        # Only trust an explicit business flag; everything else (residential, or no signal)
        # is treated as residential and left for the driver to override if wrong.
        return "business" if metadata.get("business") is True else "residential"
    except Exception:
        return "residential"
