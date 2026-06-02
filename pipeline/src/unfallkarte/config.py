"""Zentrale Konfiguration: Pfade, .env-Secrets und YAML-Configs.

Eine Quelle der Wahrheit für: wo liegen Daten, wie heißen die Buckets/Secrets,
und welche deklarativen Configs (accidents/sources/...) gibt es. Pipeline-Module
importieren von hier statt Pfade/ENV selbst zu raten.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict


def repo_root() -> Path:
    """Repo-Wurzel: .../src/unfallkarte/config.py -> parents[2]."""
    return Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Paths:
    """Kanonische Pfade. `data/` ist gitignored (lokal + B2, nicht im Git)."""

    root: Path

    @property
    def config(self) -> Path:
        return self.root / "config"

    @property
    def data(self) -> Path:
        return self.root / "data"

    @property
    def raw(self) -> Path:
        return self.data / "raw"  # Downloads/Zwischenstände (PBF, ZIPs, CSVs)

    def out(self, subdir: str) -> Path:
        """Output-Unterordner unter data/ (== Subfolder im B2-Bucket)."""
        return self.data / subdir

    def ensure(self) -> None:
        for p in (self.data, self.raw):
            p.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    """Secrets/Env aus `.env`. Niemals committen."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = "unfallkarte-data-v2"
    mapillary_token: str = ""


@lru_cache
def get_paths() -> Paths:
    return Paths(root=repo_root())


@lru_cache
def get_settings() -> Settings:
    return Settings()


def load_yaml(name: str) -> dict[str, Any]:
    """Lädt config/<name> (z.B. 'accidents.yaml')."""
    path = get_paths().config / name
    if not path.exists():
        raise FileNotFoundError(f"Config fehlt: {path}")
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"Config {name} ist kein Mapping")
    return data
