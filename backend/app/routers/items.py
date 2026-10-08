"""Example feature router. Thin HTTP layer: validate input, call the service, map None → 404."""

from fastapi import APIRouter, HTTPException, status

from app.schemas import Item, ItemWHid
from app.services import items as items_service

router = APIRouter(prefix="/items", tags=["items"])


@router.get("")
def list_items() -> list[Item]:
    return items_service.list_items()


@router.get("/{item_id}")
def get_item_by_id(item_id: str) -> Item:
    item = items_service.get_item_by_id(item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return item


@router.post("", status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemWHid) -> Item:
    return items_service.create_item(payload)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: str) -> None:
    if not items_service.delete_item(item_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
