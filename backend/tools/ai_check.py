"""Check every key in OPENAI_API_KEYS: `make ai-check` (from the repo root).

Free by default: it only lists the models each key can use. `make ai-check LIVE=1` adds one
16-token text call per key (a fraction of a cent) to detect keys that are out of credit.
Keys are printed masked, never in full.
"""

import argparse
import sys

from app import ai
from app.config import settings

LABELS = {"ok": "ok", "invalid": "INVALID", "no_credit": "OUT OF CREDIT", "error": "ERROR"}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--live", action="store_true", help="spend one tiny call per key")
    args = parser.parse_args(argv)

    if not settings.openai_api_keys:
        print("No keys configured: add OPENAI_API_KEYS=key1,key2 to backend/.env")
        return 1

    cost = "one 16-token call per key" if args.live else "free: lists models only"
    print(f"Checking {len(settings.openai_api_keys)} OpenAI key(s) ({cost})")
    checks = ai.check_keys(live=args.live)
    for check in checks:
        line = f"  {check.key}  {LABELS[check.status]}"
        if check.missing_models:
            line += f"  missing models: {', '.join(check.missing_models)}"
        if check.detail:
            line += f"  ({check.detail})"
        print(line)
    print(
        f"AI_MODE={settings.ai_mode}, text {settings.openai_text_model}, "
        f"speech {settings.openai_tts_model}/{settings.openai_tts_voice}, "
        f"images {settings.openai_image_model}"
    )
    return 0 if any(check.status == "ok" for check in checks) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
