<!-- Title = squash commit on main: `<type>: <what it does> (#<issue>)`, e.g. `feat: add upload endpoint (#12)` -->

## What

<!-- The problem, and the behavior after this PR. Mention important decisions. -->

Closes #

## How to check it

1. 

## API contract

- [ ] No API change
- [ ] Changed, and `backend/app/schemas.py` + `frontend/src/misc/CommonInt.ts` + `apiClient.ts` are updated together

## Checklist

- [ ] `make check` passes locally
- [ ] `make prod && make smoke` passes (needed for Docker, build, serving, config or dependency changes; see AGENTS.md §6)
- [ ] Demo path still works in the browser
- [ ] No secrets committed; new env vars added to `backend/.env.example`
- [ ] Screenshot attached if the UI changed

## Risks / follow-ups

<!-- Data reset needed? Anything not verified? Delete this section if none. -->
