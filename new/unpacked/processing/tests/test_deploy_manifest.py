"""Tests für manifest (_resolve_date) und deploy (Kommando-Konstruktion, Masking)."""

from __future__ import annotations

from unfallkarte import deploy, manifest


def test_resolve_date_fixed_and_auto_unknown() -> None:
    assert manifest._resolve_date("uber_speed", {"fixed": "2019-Q2"}) == "2019-Q2"
    # auto für unbekanntes Präfix -> None
    assert manifest._resolve_date("foobar", "auto") is None


def test_sync_cmd_filters_and_dryrun() -> None:
    cmd = deploy._sync_cmd("unfallkarte-data-v2", dry_run=True)
    assert cmd[:2] == ["b2", "sync"]
    assert "--exclude-regex" in cmd and ".*" in cmd
    # nur pmtiles + manifest werden inkludiert
    assert r".*\.pmtiles$" in cmd
    assert r".*manifest\.json$" in cmd
    assert "--dry-run" in cmd
    assert cmd[-1] == "b2://unfallkarte-data-v2"


def test_deploy_dry_run_masks_secrets(capsys) -> None:
    deploy.sync(dry_run=True, bucket="test-bucket")
    out = capsys.readouterr().out
    assert "b2 sync" in out
    assert "b2://test-bucket" in out
    # Keys dürfen nie im Klartext auftauchen
    assert "authorize <KEY_ID> ***" in out
