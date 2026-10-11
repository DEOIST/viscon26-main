"""Serves the esbuild output in frontend/dist: one HTML file per page, plus bundles and assets.

`/` → dist/index.html, `/<page>` → dist/<page>.html. Nothing here needs editing when you add
a page; the frontend build generates the HTML.
"""

import mimetypes
import re

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings

PAGE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")
STATIC_DIRS = ("pages", "assets", "static", "audio")
NO_CACHE = {"Cache-Control": "no-cache"}

# The slim Docker image has no /etc/mime.types, and Python's built-in table lacks these, so the
# game's music, images and fonts would otherwise be sent as application/octet-stream.
for _type, _extension in (
    ("audio/ogg", ".ogg"),
    ("audio/mp4", ".m4a"),
    ("image/webp", ".webp"),
    ("font/woff2", ".woff2"),
):
    mimetypes.add_type(_type, _extension)


class _RevalidatingStaticFiles(StaticFiles):
    """Static files the browser must revalidate (cheap ETag check) so rebuilds show on refresh."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers.update(NO_CACHE)
        return response


def _page_response(page_name: str) -> FileResponse:
    html_path = settings.frontend_dist / f"{page_name}.html"
    if not PAGE_NAME.match(page_name) or not html_path.is_file():
        raise HTTPException(404, f"No page '{page_name}'. Has the frontend been built?")
    return FileResponse(html_path, headers=NO_CACHE)


def mount_frontend(app: FastAPI) -> None:
    """Register after all API routers: `/{page_name}` matches any single-segment path."""
    for directory in STATIC_DIRS:
        app.mount(
            f"/{directory}",
            _RevalidatingStaticFiles(directory=settings.frontend_dist / directory, check_dir=False),
            name=directory,
        )

    @app.get("/", include_in_schema=False)
    def index_page() -> FileResponse:
        return _page_response("index")

    @app.get("/favicon.svg", include_in_schema=False)
    def favicon() -> FileResponse:
        return FileResponse(settings.frontend_dist / "favicon.svg", headers=NO_CACHE)

    @app.get("/{page_name}", include_in_schema=False)
    def named_page(page_name: str) -> FileResponse:
        return _page_response(page_name)
