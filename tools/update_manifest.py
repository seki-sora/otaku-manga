#!/usr/bin/env python3
"""
Scans content/<manga>/<chapter> folders and writes content/_updated.yml
with the last commit timestamp for each chapter path.

Run in CI (GitHub Actions) or locally.
"""
from __future__ import annotations
import subprocess
from pathlib import Path
from datetime import datetime, timezone
import yaml

ROOT = Path(__file__).resolve().parents[1]  # repo root
CONTENT = ROOT / "content"
OUT = CONTENT / "_updated.yml"

def git_last_commit_iso(path: Path) -> str | None:
    """ISO 8601 (UTC) of the last commit that touched `path`."""
    rel = path.relative_to(ROOT).as_posix()
    try:
        ts = subprocess.check_output(
            ["git", "log", "-1", "--format=%cI", "--", rel],
            cwd=str(ROOT),
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return ts or None
    except subprocess.CalledProcessError:
        return None

def main() -> int:
    if not CONTENT.exists():
        print("No content/ folder — nothing to do.")
        return 0

    data: dict[str, dict[str, str]] = {}
    for manga_dir in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
        manga_slug = manga_dir.name
        if manga_slug.startswith("_"):
            continue

        chapters: dict[str, str] = {}
        for chapter_dir in sorted(p for p in manga_dir.iterdir() if p.is_dir()):
            iso = git_last_commit_iso(chapter_dir)
            if not iso:
                # fallback to HEAD if path has no distinct commit yet
                iso = git_last_commit_iso(ROOT) or datetime.now(timezone.utc).isoformat()
            chapters[chapter_dir.name] = iso

        if chapters:
            data[manga_slug] = chapters

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=True)

    print(f"Wrote {OUT.relative_to(ROOT)} with {sum(len(v) for v in data.values())} entries.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
