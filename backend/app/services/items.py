"""Example feature data layer. In-memory: data is lost on every restart (including --reload).

Swap the dict for a real database here; routers and the frontend shouldn't need to change.
"""

from datetime import UTC, datetime
from uuid import uuid4

from app.schemas import Item, ItemWHid

_items: dict[str, Item] = {}


def list_items() -> list[Item]:
    return sorted(_items.values(), key=lambda item: item.created_at, reverse=True)


def get_item_by_id(item_id: str) -> Item | None:
    return _items.get(item_id)


def create_item(payload: ItemWHid) -> Item:
    item = Item(id=uuid4().hex, created_at=datetime.now(UTC), **payload.model_dump())
    _items[item.id] = item
    return item


def delete_item(item_id: str) -> bool:
    return _items.pop(item_id, None) is not None
