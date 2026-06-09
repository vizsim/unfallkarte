"""CLI-Einstieg: `unfallkarte <gruppe> <befehl>`.

Phase 0 = Gerüst: Struktur + Config-Wiring stehen, die eigentliche Logik folgt in
den späteren Phasen (Stubs sagen, was sie tun werden). Kein Verhaltenswechsel an
den Daten.
"""

from __future__ import annotations

import typer

from unfallkarte import __version__
from unfallkarte.config import get_paths, get_settings, load_yaml

app = typer.Typer(no_args_is_help=True, add_completion=False, help="unfallkarte Pipeline")

accidents_app = typer.Typer(no_args_is_help=True, help="Unfalldaten: laden & bauen")
osm_app = typer.Typer(no_args_is_help=True, help="OSM via Geofabrik + osmium")
scenario_app = typer.Typer(no_args_is_help=True, help="Szenarien rechnen")
telraam_app = typer.Typer(no_args_is_help=True, help="Telraam-Verkehrszähl-Segmente")
hvs_app = typer.Typer(no_args_is_help=True, help="UBA-Verkehrsmengen (Hauptverkehrsstraßen)")
app.add_typer(accidents_app, name="accidents")
app.add_typer(osm_app, name="osm")
app.add_typer(scenario_app, name="scenario")
app.add_typer(telraam_app, name="telraam")
app.add_typer(hvs_app, name="hvs")


def _todo(phase: str, what: str) -> None:
    typer.secho(f"[TODO {phase}] {what}", fg=typer.colors.YELLOW)
    raise typer.Exit(code=0)


@app.command()
def info() -> None:
    """Zeigt aufgelöste Pfade/Config (Smoke-Check, dass das Wiring steht)."""
    paths = get_paths()
    settings = get_settings()
    acc = load_yaml("accidents.yaml")
    years = sorted(acc.get("years", {}))
    typer.echo(f"unfallkarte {__version__}")
    typer.echo(f"root:    {paths.root}")
    typer.echo(f"data:    {paths.data}")
    typer.echo(f"bucket:  {settings.b2_bucket_name}")
    typer.echo(f"accident years: {', '.join(years) or '—'}")


# --- accidents (Phase 1) ---
def _parse_years(years: str | None) -> list[str] | None:
    return [y.strip() for y in years.split(",") if y.strip()] if years else None


@accidents_app.command("fetch")
def accidents_fetch(
    years: str = typer.Option(None, "--years", help="Komma-Liste, z.B. 2023,2024. Default: alle"),
    force: bool = typer.Option(False, "--force", help="Erneut laden, auch wenn vorhanden"),
) -> None:
    """Lädt die Jahres-ZIPs aus der Registry (config/accidents.yaml)."""
    from unfallkarte import accidents

    done = accidents.fetch(_parse_years(years), force=force)
    typer.secho(f"vorhanden/geladen: {', '.join(done) or '—'}", fg=typer.colors.GREEN)


@accidents_app.command("build")
def accidents_build(
    years: str = typer.Option(None, "--years", help="Komma-Liste. Default: alle vorhandenen"),
) -> None:
    """Parst+harmonisiert alle Jahre -> accidents_germany_<min>-<max>_oid.parquet."""
    from unfallkarte import accidents

    out = accidents.build(_parse_years(years))
    typer.secho(f"geschrieben: {out}", fg=typer.colors.GREEN)


@accidents_app.command("tiles")
def accidents_tiles(
    parquet: str = typer.Argument(..., help="Pfad zum accidents_*.parquet"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Kommandos nur zeigen"),
) -> None:
    """Baut accidents_single.pmtiles + combined_cluster.pmtiles (Tippecanoe)."""
    from pathlib import Path

    from unfallkarte import tiles

    out = tiles.build_accident_tiles(Path(parquet), dry_run=dry_run)
    for name, path in out.items():
        typer.secho(f"{name}: {path}", fg=typer.colors.GREEN)


# --- osm (Phase 2) ---
@osm_app.command("fetch")
def osm_fetch(force: bool = typer.Option(False, "--force")) -> None:
    """Lädt germany-latest.osm.pbf von Geofabrik nach data/raw/osm/."""
    from unfallkarte import osm

    dest = osm.fetch(force=force)
    typer.secho(f"PBF: {dest}", fg=typer.colors.GREEN)


@osm_app.command("build")
def osm_build(
    layer: str = typer.Argument("all", help="Layer-Name aus osm.yaml oder 'all'"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Kommandos nur zeigen"),
) -> None:
    """Geofabrik -> osmium tags-filter -> pyogrio (direkt PBF->FGB) -> pmtiles."""
    from unfallkarte import osm

    out = osm.build(layer, dry_run=dry_run)
    for name, path in out.items():
        typer.secho(f"{name}: {path}", fg=typer.colors.GREEN)


# --- telraam (Kontextlayer) ---
@telraam_app.command("fetch")
def telraam_fetch(force: bool = typer.Option(False, "--force", help="Erneut laden")) -> None:
    """Lädt alle Telraam-Segmente (segments/all) nach data/raw/telraam/."""
    from unfallkarte import telraam

    dest = telraam.fetch(force=force)
    typer.secho(f"JSON: {dest}", fg=typer.colors.GREEN)


@telraam_app.command("build")
def telraam_build(
    refresh: bool = typer.Option(False, "--refresh", help="Snapshot+Traffic neu ziehen"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Kommandos nur zeigen"),
) -> None:
    """Aktive DE-Segmente + Ø Auto/Rad pro Tag -> telraam/telraam_segments.pmtiles."""
    from unfallkarte import telraam

    out = telraam.build(refresh=refresh, dry_run=dry_run)
    typer.secho(f"PMTiles: {out}", fg=typer.colors.GREEN)


# --- hvs / UBA-Verkehrsmengen ---
@hvs_app.command("fetch")
def hvs_fetch(force: bool = typer.Option(False, "--force", help="Erneut laden")) -> None:
    """Lädt Layer 81002 (Hauptverkehrsstraßennetz, 2021) nach data/raw/hvs/."""
    from unfallkarte import hvs

    dest = hvs.fetch(force=force)
    typer.secho(f"GeoJSON: {dest}", fg=typer.colors.GREEN)


@hvs_app.command("build")
def hvs_build(
    dry_run: bool = typer.Option(False, "--dry-run", help="Kommandos nur zeigen"),
) -> None:
    """Verkehrsmengen -> uba/hvs_verkehrsmengen.pmtiles (interner Layer `lines`)."""
    from unfallkarte import hvs

    out = hvs.build(dry_run=dry_run)
    typer.secho(f"PMTiles: {out}", fg=typer.colors.GREEN)


# --- scenarios (Phase 3) ---
@scenario_app.command("list")
def scenario_list() -> None:
    """Listet implementierte (✓) und geplante (·) Szenarien."""
    from unfallkarte.scenarios import registry

    for name in registry.REGISTRY:
        typer.secho(f"  ✓ {name}", fg=typer.colors.GREEN)
    for name, desc in registry.PLANNED.items():
        typer.secho(f"  · {name} — {desc} (TODO)", fg=typer.colors.BRIGHT_BLACK)


@scenario_app.command("run")
def scenario_run(
    name: str,
    dry_run: bool = typer.Option(False, "--dry-run", help="Tile-Kommandos nur zeigen"),
) -> None:
    """Ein Szenario rechnen."""
    from unfallkarte.scenarios import base, registry

    if name not in registry.REGISTRY:
        avail = list(registry.REGISTRY)
        typer.secho(f"'{name}' nicht implementiert. Verfügbar: {avail}", fg=typer.colors.RED)
        raise typer.Exit(code=1)
    ctx = base.default_context(dry_run=dry_run)
    out = registry.REGISTRY[name](ctx)
    typer.secho(f"{name}: {out}", fg=typer.colors.GREEN)


@scenario_app.command("run-all")
def scenario_run_all(
    dry_run: bool = typer.Option(False, "--dry-run", help="Tile-Kommandos nur zeigen"),
) -> None:
    """Alle implementierten Szenarien in Reihenfolge."""
    from unfallkarte.scenarios import base, registry

    ctx = base.default_context(dry_run=dry_run)
    for name in registry.ORDER:
        out = registry.REGISTRY[name](ctx)
        typer.secho(f"{name}: {out}", fg=typer.colors.GREEN)


# --- top-level (Phase 4) ---
@app.command()
def manifest() -> None:
    """Generiert data/manifest.json (Local-first-Index + Datenstand)."""
    from unfallkarte import manifest as manifest_mod

    out = manifest_mod.generate()
    typer.secho(f"geschrieben: {out}", fg=typer.colors.GREEN)


@app.command()
def deploy(
    dry_run: bool = typer.Option(False, "--dry-run", help="b2-Kommandos nur zeigen"),
    bucket: str = typer.Option(None, "--bucket", help="Bucket überschreiben (sonst .env)"),
) -> None:
    """Lädt geänderte PMTiles + manifest.json via b2 sync ins Bucket (Secrets aus .env)."""
    from unfallkarte import deploy as deploy_mod

    deploy_mod.sync(dry_run=dry_run, bucket=bucket)
    typer.secho("deploy abgeschlossen.", fg=typer.colors.GREEN)


if __name__ == "__main__":
    app()
