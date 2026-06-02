"""Deploy: PMTiles + manifest.json via `b2 sync` ins Backblaze-B2-Bucket.

`b2 sync` spiegelt den lokalen data/-Baum 1:1 (Subfolder == Bucket-Pfade) und lädt
nur Geändertes (Name + mtime). Secrets kommen aus .env. Bei dry_run/fehlendem b2
werden die Kommandos nur gezeigt; Keys werden in der Ausgabe nie im Klartext geloggt.
"""

from __future__ import annotations

import subprocess
from shutil import which

from unfallkarte.config import get_paths, get_settings

# Nur diese Dateien hochladen; Zwischenstände (PBF/CSV/fgb/gpkg) bleiben lokal.
_INCLUDE = [r".*\.pmtiles$", r".*manifest\.json$"]


def _sync_cmd(bucket: str, *, dry_run: bool) -> list[str]:
    data = get_paths().data
    cmd = ["b2", "sync", "--no-progress", "--exclude-regex", ".*"]
    for inc in _INCLUDE:
        cmd += ["--include-regex", inc]
    if dry_run:
        cmd.append("--dry-run")
    cmd += [str(data), f"b2://{bucket}"]
    return cmd


def sync(*, dry_run: bool = False, bucket: str | None = None) -> None:
    settings = get_settings()
    bucket = bucket or settings.b2_bucket_name
    sync_cmd = _sync_cmd(bucket, dry_run=dry_run)

    if dry_run or which("b2") is None:
        reason = "dry-run" if dry_run else "'b2' nicht installiert"
        print(f"  [{reason}] b2 account authorize <KEY_ID> ***")
        print(f"  [{reason}] {' '.join(sync_cmd)}")
        return

    missing = [
        k
        for k, v in {
            "B2_APPLICATION_KEY_ID": settings.b2_application_key_id,
            "B2_APPLICATION_KEY": settings.b2_application_key,
        }.items()
        if not v
    ]
    if missing:
        raise RuntimeError(f"Fehlende .env-Werte: {missing}")

    # Authorize (Credentials werden danach von b2 gecached). Keys NICHT loggen.
    print("  $ b2 account authorize <KEY_ID> ***")
    subprocess.run(
        ["b2", "account", "authorize", settings.b2_application_key_id, settings.b2_application_key],
        check=True,
    )
    print(f"  $ {' '.join(sync_cmd)}")
    subprocess.run(sync_cmd, check=True)
