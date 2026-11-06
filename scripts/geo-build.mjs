#!/usr/bin/env node
/**
 * Builds the compact geography files used by the Explore globe from Natural Earth GeoJSON
 * (public domain, https://www.naturalearthdata.com — "Made with Natural Earth").
 *
 *   1. Download into any folder (NOT the repo):
 *        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/<name>.geojson
 *      for ne_50m_land, ne_110m_land, ne_50m_admin_0_boundary_lines_land,
 *          ne_110m_admin_0_boundary_lines_land, ne_50m_admin_0_countries
 *   2. node scripts/geo-build.mjs <that folder>
 *
 * Outputs (committed):
 *   apps/web/public/geo/{land,borders}-{50m,110m}.json   delta-encoded rings/lines, 0.01° units
 *   apps/web/features/explore/data/countries.json       ISO 3166-1 alpha-2, UN region, label point
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/geo-build.mjs <folder with Natural Earth geojson>");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "apps/web/public/geo");
const dataDir = path.join(root, "apps/web/features/explore/data");
mkdirSync(publicDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const read = (name) => JSON.parse(readFileSync(path.join(src, `${name}.geojson`), "utf8"));

/** Quantise to 0.01°, drop near-duplicate points, delta-encode. */
function encode(coords, minStep) {
  const out = [];
  let px = null;
  let py = null;
  let lx = 0;
  let ly = 0;
  coords.forEach(([lng, lat], i) => {
    const x = Math.round(lng * 100);
    const y = Math.round(lat * 100);
    const last = i === coords.length - 1;
    if (px !== null && !last && Math.abs(x - px) < minStep && Math.abs(y - py) < minStep) return;
    out.push(x - lx, y - ly);
    lx = x;
    ly = y;
    px = x;
    py = y;
  });
  return out;
}

function rings(geojson) {
  const result = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) result.push(ring);
  }
  return result;
}

function lines(geojson) {
  const result = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    if (g.type === "LineString") result.push(g.coordinates);
    else for (const l of g.coordinates) result.push(l);
  }
  return result;
}

function writeGeo(file, items, minStep) {
  const encoded = items.map((c) => encode(c, minStep)).filter((e) => e.length >= 4);
  const body = JSON.stringify({ v: 1, unit: 0.01, delta: true, items: encoded });
  writeFileSync(path.join(publicDir, file), body);
  console.log(`${file}: ${encoded.length} items, ${(body.length / 1024).toFixed(0)} KiB`);
}

writeGeo("land-50m.json", rings(read("ne_50m_land")), 4);
writeGeo("land-110m.json", rings(read("ne_110m_land")), 0);
writeGeo("borders-50m.json", lines(read("ne_50m_admin_0_boundary_lines_land")), 4);
writeGeo("borders-110m.json", lines(read("ne_110m_admin_0_boundary_lines_land")), 0);

// Country metadata: every ISO country/territory in Natural Earth 1:50m (label point, UN region).
const seen = new Set();
const countries = [];
for (const f of read("ne_50m_admin_0_countries").features) {
  const p = f.properties;
  const code = p.ISO_A2_EH;
  if (!/^[A-Z]{2}$/.test(code) || seen.has(code)) continue;
  seen.add(code);
  countries.push({
    code,
    name: p.NAME_EN,
    region: p.REGION_UN,
    subregion: p.SUBREGION,
    lat: Math.round(p.LABEL_Y * 100) / 100,
    lng: Math.round(p.LABEL_X * 100) / 100,
  });
}
countries.sort((a, b) => a.code.localeCompare(b.code));
writeFileSync(path.join(dataDir, "countries.json"), JSON.stringify(countries, null, 0) + "\n");
console.log(`countries.json: ${countries.length} countries`);
