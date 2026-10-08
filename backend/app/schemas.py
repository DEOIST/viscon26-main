"""Every API / domain type lives here. Mirrors frontend/src/misc/CommonInt.ts; change both together.

Convention: `XWHid` ("without id") is the create payload the client sends;
`X(XWHid)` is what the server returns, adding `id` and timestamps.
Fields are snake_case in Python and camelCase in JSON (see `CamelModel`).
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for every API schema: `created_at` in Python is `createdAt` on the wire."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class HealthStatus(CamelModel):
    status: str
    environment: str


# --- Example feature (delete once you have real features) ---


class ItemWHid(CamelModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)


class Item(ItemWHid):
    id: str
    created_at: datetime
