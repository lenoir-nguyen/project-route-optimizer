import base64
import json
from typing import BinaryIO

import anthropic

client = anthropic.Anthropic()

_PROMPT = """Look at this image and extract every delivery order you can see.
Return ONLY a JSON array, no other text. Each item:
{"address": "<full delivery address>", "order_id": "<order or task ID if visible, otherwise null>", "confident": true/false}.
Set confident=false if the address text is unclear or you are unsure it is a real delivery address.
Set order_id to null if no order/task ID is visible next to this entry.
Do not include customer names, phone numbers, or prices in the address field."""


def extract_addresses_from_image(image_data: bytes, media_type: str) -> list[dict]:
    """Return list of {address: str, confident: bool} extracted from one image."""
    b64 = base64.standard_b64encode(image_data).decode("utf-8")
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": b64},
                    },
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def extract_addresses_from_images(files: list[tuple[bytes, str]]) -> list[dict]:
    """Process multiple images and merge results. Each file is (data, media_type)."""
    results: list[dict] = []
    for data, media_type in files:
        results.extend(extract_addresses_from_image(data, media_type))
    return results
