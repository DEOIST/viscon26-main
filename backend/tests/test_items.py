def test_create_get_delete_item(client):
    created = client.post("/api/items", json={"title": "First", "description": "hello"})
    assert created.status_code == 201
    item = created.json()
    assert item["title"] == "First"
    assert "createdAt" in item  # camelCase on the wire

    fetched = client.get(f"/api/items/{item['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == item

    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.get(f"/api/items/{item['id']}").status_code == 404


def test_create_item_rejects_empty_title(client):
    res = client.post("/api/items", json={"title": ""})

    assert res.status_code == 422


def test_delete_missing_item_returns_404(client):
    assert client.delete("/api/items/does-not-exist").status_code == 404
