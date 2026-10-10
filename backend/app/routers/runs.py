"""HTTP layer for runs: enroll, read, save a minigame score, graduate."""

from fastapi import APIRouter, HTTPException, status

from app.schemas import Run, RunWHid, ScoreSubmission
from app.services import runs as runs_service

router = APIRouter(prefix="/runs", tags=["runs"])

RUN_NOT_FOUND = "Run not found"


@router.post("", status_code=status.HTTP_201_CREATED)
def create_run(payload: RunWHid) -> Run:
    return runs_service.create_run(payload)


@router.get("/{run_id}")
def get_run_by_id(run_id: str) -> Run:
    run = runs_service.get_run_by_id(run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RUN_NOT_FOUND)
    return run


@router.post("/{run_id}/scores")
def submit_score(run_id: str, payload: ScoreSubmission) -> Run:
    try:
        run = runs_service.submit_score(run_id, payload)
    except runs_service.RunStateError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from None
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RUN_NOT_FOUND)
    return run


@router.post("/{run_id}/graduate")
def graduate_run(run_id: str) -> Run:
    try:
        run = runs_service.graduate_run(run_id)
    except runs_service.RunStateError as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from None
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RUN_NOT_FOUND)
    return run
