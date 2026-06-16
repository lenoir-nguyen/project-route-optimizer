import os

import httpx

_ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix/driving-car"
_MAX_LOCATIONS = 59  # 59×59 = 3481 elements, just under ORS free-tier limit of 3500


async def build_duration_matrix(locations: list[tuple[float, float]]) -> list[list[int]]:
    """
    Build an NxN driving-duration matrix (seconds) for a list of (lat, lng) tuples.
    The depot must be at index 0.
    """
    if len(locations) > _MAX_LOCATIONS:
        raise ValueError(f"Too many locations: {len(locations)} > {_MAX_LOCATIONS}")

    # ORS expects [lng, lat] order
    coords = [[lng, lat] for lat, lng in locations]

    api_key = os.environ["ORS_API_KEY"]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _ORS_MATRIX_URL,
            json={"locations": coords, "metrics": ["duration"]},
            headers={"Authorization": api_key},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

    # Round to integers for OR-Tools (which works with integer costs)
    return [[int(cell) for cell in row] for row in data["durations"]]
