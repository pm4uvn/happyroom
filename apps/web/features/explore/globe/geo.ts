/**
 * Geography for the globe: compact Natural Earth outlines (public domain) from /public/geo,
 * decoded into [lng, lat] arrays. Built by scripts/geo-build.mjs.
 */
export type LngLat = [number, number];
export type Path = LngLat[];

export interface GeoData {
  land: Path[];
  borders: Path[];
}

export type GeoDetail = "50m" | "110m";

interface Encoded {
  v: 1;
  unit: number;
  delta: boolean;
  items: number[][];
}

export function decode(file: Encoded): Path[] {
  return file.items.map((flat) => {
    const out: Path = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i + 1 < flat.length; i += 2) {
      x += flat[i]!;
      y += flat[i + 1]!;
      out.push([x * file.unit, y * file.unit]);
    }
    return out;
  });
}

const cache = new Map<GeoDetail, Promise<GeoData>>();

export function loadGeo(detail: GeoDetail): Promise<GeoData> {
  let p = cache.get(detail);
  if (!p) {
    const get = async (name: string) => {
      const res = await fetch(`/geo/${name}-${detail}.json`);
      if (!res.ok) throw new Error(`geo ${name} ${res.status}`);
      return decode((await res.json()) as Encoded);
    };
    p = Promise.all([get("land"), get("borders")]).then(([land, borders]) => ({ land, borders }));
    p.catch(() => cache.delete(detail));
    cache.set(detail, p);
  }
  return p;
}

const RAD = Math.PI / 180;

/**
 * lat/lng → point on a sphere, matching three.js SphereGeometry's equirectangular UVs
 * (u = (lng + 180) / 360), so textures, lines and markers line up exactly.
 */
export function latLngToXYZ(lat: number, lng: number, radius = 1): [number, number, number] {
  const phi = (lng + 180) * RAD;
  const cosLat = Math.cos(lat * RAD);
  return [-Math.cos(phi) * cosLat * radius, Math.sin(lat * RAD) * radius, Math.sin(phi) * cosLat * radius];
}

/** Inverse of latLngToXYZ for a unit direction. */
export function xyzToLatLng(x: number, y: number, z: number): { lat: number; lng: number } {
  const r = Math.hypot(x, y, z) || 1;
  const lat = Math.asin(y / r) / RAD;
  let lng = Math.atan2(z, -x) / RAD - 180;
  if (lng < -180) lng += 360;
  return { lat, lng };
}

/** Line-segment pairs on the sphere (for THREE.LineSegments). */
export function pathsToSegments(paths: Path[], radius: number): Float32Array {
  let count = 0;
  for (const p of paths) count += Math.max(0, p.length - 1);
  const out = new Float32Array(count * 6);
  let o = 0;
  for (const p of paths) {
    let prev = latLngToXYZ(p[0]![1], p[0]![0], radius);
    for (let i = 1; i < p.length; i++) {
      const next = latLngToXYZ(p[i]![1], p[i]![0], radius);
      out[o++] = prev[0];
      out[o++] = prev[1];
      out[o++] = prev[2];
      out[o++] = next[0];
      out[o++] = next[1];
      out[o++] = next[2];
      prev = next;
    }
  }
  return out;
}

/** Graticule (every `step` degrees), as paths. */
export function graticule(step = 20): Path[] {
  const paths: Path[] = [];
  for (let lat = -80; lat <= 80; lat += step) {
    const p: Path = [];
    for (let lng = -180; lng <= 180; lng += 3) p.push([lng, lat]);
    paths.push(p);
  }
  for (let lng = -180; lng < 180; lng += step) {
    const p: Path = [];
    for (let lat = -85; lat <= 85; lat += 3) p.push([lng, lat]);
    paths.push(p);
  }
  return paths;
}

/**
 * Draws land onto an equirectangular canvas. Rings crossing the antimeridian are unwrapped and
 * drawn at ±360° offsets; rings that encircle a pole (Antarctica) are closed through the pole.
 */
export function drawLand(
  ctx: CanvasRenderingContext2D,
  land: Path[],
  width: number,
  height: number,
  style: { fill: string; stroke?: string; strokeWidth?: number },
) {
  const sx = width / 360;
  const sy = height / 180;
  ctx.beginPath();
  for (const ring of land) {
    if (ring.length < 3) continue;
    const pts: LngLat[] = [];
    let offset = 0;
    let prevLng = ring[0]![0];
    for (const [lng, lat] of ring) {
      const d = lng - prevLng;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
      pts.push([lng + offset, lat]);
      prevLng = lng;
    }
    const span = pts[pts.length - 1]![0] - pts[0]![0];
    if (Math.abs(span) > 180) {
      const poleLat = pts.reduce((s, p) => s + p[1], 0) < 0 ? -90 : 90;
      pts.push([pts[pts.length - 1]![0], poleLat], [pts[0]![0], poleLat]);
    }
    for (const shift of [-360, 0, 360]) {
      pts.forEach(([lng, lat], i) => {
        const x = (lng + 180 + shift) * sx;
        const y = (90 - lat) * sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  ctx.fillStyle = style.fill;
  ctx.fill("evenodd");
  if (style.stroke) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth ?? 1;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}
