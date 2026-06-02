"""Szenarien: kombinieren Unfalldaten mit Kontextebenen zu PMTiles.

Jedes Szenario exportiert `run(ctx) -> Path` und ist in registry.py registriert.
Gemeinsame Spatial-Logik kommt aus unfallkarte.geo, Tiling aus unfallkarte.tiles.
"""
