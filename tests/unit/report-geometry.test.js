// Metrik des Reports (lokale Tangentialebene, Abstände, Zuschnitt) — browserlos.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  localProjection, nearestOnLine, lineLength, sliceLine, pointInPolygon, distToPolygon, distGeomLine,
  centroidOf, clipLineBox, clipRingBox, ringArea, areaInCircle, circleRing, emptyGeom,
} from "../../js/report/geometry.js";

test("lokale Projektion: 1 km in Hamburg stimmt auf < 0,1 % mit der Geodäsie überein", () => {
  const P = localProjection(53.55, 10.0);
  // Referenz aus den Krümmungsradien des WGS84-Ellipsoids bei 53,55° N:
  // Meridian M = 6 376 806 m -> 1 km = 0.0089850° Breite; Querkrümmung N·cosφ -> 1 km = 0.0150856° Länge
  const [xN, yN] = P.xy([10.0, 53.55 + 0.008985]);
  const [xE, yE] = P.xy([10.0 + 0.0150856, 53.55]);
  assert.ok(Math.abs(yN - 1000) < 0.5 && Math.abs(xN) < 1e-9, `Nord: ${yN}`);
  assert.ok(Math.abs(xE - 1000) < 0.5 && Math.abs(yE) < 1e-9, `Ost: ${xE}`);
  const back = P.lngLat(P.xy([10.01, 53.56]));
  assert.ok(Math.abs(back[0] - 10.01) < 1e-12 && Math.abs(back[1] - 53.56) < 1e-12);
});

test("nächster Punkt auf einer Linie, Bogenlänge und Teilstück", () => {
  const line = [[0, 0], [100, 0], [100, 100]];
  const r = nearestOnLine([150, 50], line);
  assert.equal(r.d, 50);
  assert.equal(r.s, 150);
  assert.equal(lineLength(line), 200);
  assert.deepEqual(sliceLine(line, 50, 150), [[50, 0], [100, 0], [100, 50]]);
});

test("Polygon: innen/außen, Abstand, Schwerpunkt; Abstand Fläche–Linie", () => {
  const sq = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
  assert.ok(pointInPolygon([5, 5], sq));
  assert.ok(!pointInPolygon([15, 5], sq));
  assert.equal(distToPolygon([15, 5], sq), 5);
  assert.equal(distToPolygon([5, 5], sq), 0);
  const g = { ...emptyGeom(), polygons: [sq] };
  assert.deepEqual(centroidOf(g), [5, 5]);
  assert.equal(distGeomLine(g, [[-5, 30], [20, 30]]), 20, "Straße 20 m nördlich der Fläche");
  assert.equal(distGeomLine(g, [[-5, 5], [20, 5]]), 0, "Straße quert die Fläche");
});

test("Zuschnitt an der Kachel: Linienstücke und Ringe", () => {
  const box = [0, 0, 100, 100];
  const pieces = clipLineBox([[-50, 50], [50, 50], [50, 150], [150, 150], [150, 50], [80, 50]], box);
  assert.deepEqual(pieces, [[[0, 50], [50, 50], [50, 100]], [[100, 50], [80, 50]]]);
  const ring = clipRingBox([[-50, -50], [50, -50], [50, 50], [-50, 50]], box);
  assert.equal(Math.abs(ringArea(ring)), 2500);
});

test("Fläche im Kreis: halbe Zelle, ganze Zelle", () => {
  const cell = [[0, -50], [100, -50], [100, 50], [0, 50]];
  const inside = areaInCircle(cell, [50, 0], 500);
  assert.ok(Math.abs(inside - 10000) < 1e-6);
  const half = areaInCircle([[-50, -50], [50, -50], [50, 50], [-50, 50]], [0, 0], 1000);
  assert.ok(Math.abs(half - 10000) < 1e-6);
  const c = Math.abs(ringArea(circleRing([0, 0], 100, 72)));
  assert.ok(Math.abs(c - Math.PI * 1e4) / (Math.PI * 1e4) < 0.002, "72-Eck ≈ Kreis");
});
