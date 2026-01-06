const fs = require('fs');
const path = require('path');

const API_BASE = 'https://ph-flood-disaster-tracker.vercel.app';
const TARGET_COUNT = 115;
const SEED_NAME = 'Seeded Reporter';
const LOOKBACK_HOURS = 2;
const BOUNDS = { latMin: 12.0, latMax: 21.6, lngMin: 119.0, lngMax: 124.8 };

const geoPath = path.join(__dirname, '..', 'public', 'geo', 'phl-adm3-municities-simplified.geojson');
const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8'));

function bboxForCoords(coords) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const pt of coords) {
    const [lng, lat] = pt;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, polygon) {
  if (!polygon || polygon.length === 0) return false;
  if (!pointInRing(lng, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lng, lat, polygon[i])) return false;
  }
  return true;
}

const polygons = [];
for (const feature of geo.features || []) {
  const geom = feature.geometry;
  if (!geom) continue;
  if (geom.type === 'Polygon') {
    const bbox = bboxForCoords(geom.coordinates.flat());
    polygons.push({ type: 'Polygon', coordinates: geom.coordinates, bbox });
  } else if (geom.type === 'MultiPolygon') {
    const flat = geom.coordinates.flat(2);
    const bbox = bboxForCoords(flat);
    polygons.push({ type: 'MultiPolygon', coordinates: geom.coordinates, bbox });
  }
}

function onLand(lat, lng) {
  for (const poly of polygons) {
    if (lng < poly.bbox.minLng || lng > poly.bbox.maxLng || lat < poly.bbox.minLat || lat > poly.bbox.maxLat) {
      continue;
    }
    if (poly.type === 'Polygon') {
      if (pointInPolygon(lng, lat, poly.coordinates)) return true;
    } else {
      for (const polygon of poly.coordinates) {
        if (pointInPolygon(lng, lat, polygon)) return true;
      }
    }
  }
  return false;
}

function randomCoord() {
  const lat = BOUNDS.latMin + Math.random() * (BOUNDS.latMax - BOUNDS.latMin);
  const lng = BOUNDS.lngMin + Math.random() * (BOUNDS.lngMax - BOUNDS.lngMin);
  return [lat, lng];
}

function randomDescription() {
  const items = [
    'Street flooding reported, water pooling near intersections.',
    'Heavy rain causing minor flooding along a main road.',
    'Drainage overflow observed, water rising slowly.',
    'Flooded low-lying area, passable with caution.',
    'Rapid runoff after rain, water on the roadway.',
  ];
  return items[Math.floor(Math.random() * items.length)];
}

async function fetchExistingSeedCount() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const res = await fetch(`${API_BASE}/api/reports?since=${encodeURIComponent(since)}&limit=500`);
  if (!res.ok) {
    return 0;
  }
  const data = await res.json();
  const reports = Array.isArray(data.reports) ? data.reports : [];
  return reports.filter((r) => r.reporterName === SEED_NAME).length;
}

async function postReport(report) {
  const res = await fetch(`${API_BASE}/api/reports/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const existingCount = await fetchExistingSeedCount();
  const remaining = Math.max(0, TARGET_COUNT - existingCount);

  if (remaining === 0) {
    console.log(`Already have ${existingCount} seeded reports in the last ${LOOKBACK_HOURS}h.`); 
    return;
  }

  const reports = [];
  let attempts = 0;
  while (reports.length < remaining && attempts < remaining * 200) {
    attempts += 1;
    const [lat, lng] = randomCoord();
    if (!onLand(lat, lng)) continue;
    reports.push([lat, lng]);
  }

  if (reports.length < remaining) {
    throw new Error(`Only found ${reports.length} land points after ${attempts} attempts.`);
  }

  console.log(`Submitting ${reports.length} reports...`);

  for (let i = 0; i < reports.length; i++) {
    const [lat, lng] = reports[i];
    const payload = {
      reporterName: SEED_NAME,
      description: randomDescription(),
      coordinates: [lat, lng],
      needsRescue: Math.random() < 0.06,
    };

    await postReport(payload);
    if ((i + 1) % 10 === 0) {
      console.log(`Submitted ${i + 1}/${reports.length}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
