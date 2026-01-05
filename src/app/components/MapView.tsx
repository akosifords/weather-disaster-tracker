import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import type { UserReport } from './ReportForm';
import type { AlertSeverity } from './DisasterAlerts';
import { coordsKey, getApproxCoordinates, PH_BOUNDS, PH_CENTER } from '../lib/geo';
import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  reports: UserReport[];
  variant?: 'embedded' | 'full';
  visualization?: 'poi' | 'areas' | 'admin' | 'barangay';
  /**
   * When provided, the map will fly to the corresponding aggregated hotspot marker key.
   * Use `coordsKey([lat,lng])` to generate the same key as the map.
   */
  focusKey?: string | null;
}

type GeoJSONPolygon = number[][][]; // [ring][point][lng,lat]
type GeoJSONMultiPolygon = number[][][][]; // [polygon][ring][point][lng,lat]

type AdminGeometry =
  | { type: 'Polygon'; coordinates: GeoJSONPolygon }
  | { type: 'MultiPolygon'; coordinates: GeoJSONMultiPolygon };

type AdminFeature = {
  type: 'Feature';
  properties?: Record<string, unknown>;
  geometry: AdminGeometry;
};

type AdminFeatureCollection = {
  type: 'FeatureCollection';
  features: AdminFeature[];
};

type AdminBBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

type AdminIndexItem = {
  id: string;
  name: string;
  bbox: AdminBBox;
  feature: AdminFeature;
};

type AdminStats = { count: number; highestSeverity: AlertSeverity };

const ADMIN_ADM3_GEOJSON_URL = '/geo/phl-adm3-municities-simplified.geojson';
const PSA_BRGY_ARCGIS_QUERY_URL =
  'https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/4/query';

const parseCoordsKey = (key: string): [number, number] | null => {
  const [a, b] = key.split(',');
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
};

const bboxContains = (bbox: AdminBBox, lat: number, lng: number) =>
  lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;

const computeBBoxForGeometry = (geom: AdminGeometry): AdminBBox => {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const eat = (pt: number[]) => {
    const lng = pt[0];
    const lat = pt[1];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };

  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) for (const pt of ring) eat(pt);
  } else {
    for (const poly of geom.coordinates) for (const ring of poly) for (const pt of ring) eat(pt);
  }

  // fallbacks (shouldn't happen, but prevents NaNs)
  if (!Number.isFinite(minLng)) minLng = 0;
  if (!Number.isFinite(minLat)) minLat = 0;
  if (!Number.isFinite(maxLng)) maxLng = 0;
  if (!Number.isFinite(maxLat)) maxLat = 0;

  return { minLng, minLat, maxLng, maxLat };
};

// Ray casting on a single ring (expects [lng,lat] points)
const pointInRing = (lng: number, lat: number, ring: number[][]) => {
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
};

const pointInPolygon = (lng: number, lat: number, poly: GeoJSONPolygon) => {
  if (poly.length === 0) return false;
  const outer = poly[0];
  if (!pointInRing(lng, lat, outer)) return false;

  // holes
  for (let i = 1; i < poly.length; i++) {
    if (pointInRing(lng, lat, poly[i])) return false;
  }
  return true;
};

const pointInAdminGeometry = (lng: number, lat: number, geom: AdminGeometry) => {
  if (geom.type === 'Polygon') return pointInPolygon(lng, lat, geom.coordinates);
  for (const poly of geom.coordinates) {
    if (pointInPolygon(lng, lat, poly)) return true;
  }
  return false;
};

const getSeverityColor = (severity: AlertSeverity): string => {
  switch (severity) {
    case 'critical':
      return '#ef4444'; // red-500
    case 'high':
      return '#e85002'; // brand orange
    case 'medium':
      return '#eab308'; // yellow-500
    case 'low':
      return '#3b82f6'; // blue-500
    default:
      return '#6b7280'; // gray-500
  }
};

const getSeverityRadius = (severity: AlertSeverity): number => {
  switch (severity) {
    case 'critical':
      return 15;
    case 'high':
      return 12;
    case 'medium':
      return 10;
    case 'low':
      return 8;
    default:
      return 8;
  }
};

const markerSizeFor = (severity: AlertSeverity): number => {
  switch (severity) {
    case 'critical':
      return 52;
    case 'high':
      return 46;
    case 'medium':
      return 42;
    case 'low':
    default:
      return 38;
  }
};

const clusterSizeFor = (hotspotCount: number) => {
  if (hotspotCount >= 15) return 66;
  if (hotspotCount >= 7) return 58;
  if (hotspotCount >= 3) return 52;
  return 46;
};

const svgForType = (type: UserReport['type']) => {
  // Minimal inline SVGs (small, fast, no external deps)
  const common =
    'width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"';
  switch (type) {
    case 'storm':
      return `<svg ${common}><path d="M13 2L3 14h7l-1 8 12-14h-7l-1-6z" fill="currentColor"/></svg>`;
    case 'flood':
      return `<svg ${common}><path d="M12 2c3 4 6 7 6 11a6 6 0 1 1-12 0c0-4 3-7 6-11z" fill="currentColor"/></svg>`;
    case 'fire':
      return `<svg ${common}><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-4 2-6 0 2 2 3 2 3s0-3 0-5z" fill="currentColor"/></svg>`;
    case 'wind':
      return `<svg ${common}><path d="M3 9h11a3 3 0 1 0-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 13h15a3 3 0 1 1-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    case 'other':
    default:
      return `<svg ${common}><path d="M12 2l10 18H2L12 2z" fill="currentColor"/><path d="M12 9v5" stroke="#000" stroke-width="2" stroke-linecap="round"/><path d="M12 17h.01" stroke="#000" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
};

const poiIcon = (opts: {
  severity: AlertSeverity;
  type: UserReport['type'];
  isCluster: boolean;
  hotspotCount: number;
}) => {
  const size = opts.isCluster ? clusterSizeFor(opts.hotspotCount) : markerSizeFor(opts.severity);
  const kindClass = opts.isCluster ? 'poi-marker--cluster' : 'poi-marker--single';
  const severityClass = `poi-marker--${opts.severity}`;
  const iconSvg = opts.isCluster ? '' : svgForType(opts.type);

  // Cluster markers intentionally omit numbers (per request). They visually “stack”.
  const html = `
    <div class="poi-marker ${kindClass} ${severityClass}" style="--poi-size:${size}px" aria-label="${
      opts.isCluster ? `${opts.hotspotCount} hotspots` : `${opts.type} incident`
    }">
      <span class="poi-marker__halo"></span>
      ${opts.isCluster ? '<span class="poi-marker__stack" aria-hidden="true"></span>' : ''}
      <span class="poi-marker__pin">
        <span class="poi-marker__icon" aria-hidden="true">${iconSvg}</span>
      </span>
      <span class="poi-marker__tip" aria-hidden="true"></span>
    </div>
  `;

  return L.divIcon({
    className: 'poi-marker-wrap',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size * 0.88],
    popupAnchor: [0, -size * 0.75],
  });
};

const severityMultiplier: Record<AlertSeverity, number> = {
  low: 1,
  medium: 1.25,
  high: 1.55,
  critical: 1.95,
};

const EARTH_R = 6378137; // meters

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// Approx geodesic circle polygon (good enough for UI, not for surveying)
const circleToPolygon = (
  center: [number, number],
  radiusM: number,
  steps: number,
): [number, number][] => {
  const [lat0, lng0] = center;
  const latR = toRad(lat0);
  const lngR = toRad(lng0);
  const angDist = radiusM / EARTH_R;
  const pts: [number, number][] = [];

  for (let i = 0; i < steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(latR) * Math.cos(angDist) +
        Math.cos(latR) * Math.sin(angDist) * Math.cos(brng),
    );
    const lng =
      lngR +
      Math.atan2(
        Math.sin(brng) * Math.sin(angDist) * Math.cos(latR),
        Math.cos(angDist) - Math.sin(latR) * Math.sin(lat),
      );
    pts.push([toDeg(lat), toDeg(lng)]);
  }

  return pts;
};

const haversineMeters = (a: [number, number], b: [number, number]) => {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
};

// Convert report density into an "affected area" radius (meters)
const getRadarRadiusMeters = (count: number, severity: AlertSeverity): number => {
  const base = 450; // meters
  const perReport = 220; // meters/report
  const scaled = base + perReport * Math.sqrt(Math.max(1, count));
  return Math.round(scaled * severityMultiplier[severity]);
};


interface LocationData {
  key: string;
  location: string;
  coordinates: [number, number];
  count: number;
  reports: UserReport[];
  highestSeverity: AlertSeverity;
  primaryType: UserReport['type'];
  needsRescueCount: number;
}

interface ClusterData extends LocationData {
  isCluster: boolean;
  memberKeys: string[];
  hotspotCount: number;
}

const severityOrder: Record<AlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const cellSizeForZoom = (zoom: number) => {
  if (zoom <= 6) return 90;
  if (zoom <= 7) return 72;
  if (zoom <= 8) return 60;
  if (zoom <= 9) return 50;
  if (zoom <= 10) return 42;
  if (zoom <= 11) return 36;
  return 0; // no clustering
};

export function MapView({
  reports,
  variant = 'embedded',
  visualization = 'barangay',
  focusKey,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(6);
  const adminLayerRef = useRef<L.GeoJSON | null>(null);
  const adminIndexRef = useRef<AdminIndexItem[] | null>(null);
  const adminStatsRef = useRef<Map<string, AdminStats>>(new Map());
  const [adminReady, setAdminReady] = useState(false);
  const [adminUnitCount, setAdminUnitCount] = useState(0);
  const [adminAffectedCount, setAdminAffectedCount] = useState(0);
  const [adminTopArea, setAdminTopArea] = useState<{
    name: string;
    count: number;
    highestSeverity: AlertSeverity;
  } | null>(null);

  const barangayLayerRef = useRef<L.GeoJSON | null>(null);
  const barangayAbortRef = useRef<AbortController | null>(null);
  const barangayCacheRef = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());
  const barangayGeometriesRef = useRef<Map<string, GeoJSON.Feature>>(new Map());
  const [barangaysEnabled, setBarangaysEnabled] = useState(visualization === 'barangay');
  const barangaysEnabledRef = useRef(false);
  const [barangayLoading, setBarangayLoading] = useState(false);
  const [barangayError, setBarangayError] = useState<string | null>(null);
  const [barangayForName, setBarangayForName] = useState<string | null>(null);
  const [barangayCount, setBarangayCount] = useState<number>(0);

  const markersRef = useRef<
    Map<
      string,
      {
        center: L.Marker;
        rings: L.Circle[]; // legacy (poi mode)
        outer: L.Layer; // circle/polygon (area mode)
      }
    >
  >(new Map());

  // Aggregate reports by location (hotspot mode)
  const locationData = useMemo(() => {
    const dataMap = new Map<string, LocationData>();
    
    reports.forEach((report) => {
      const coords = report.coordinates ?? getApproxCoordinates(report.location);
      const key = coordsKey(coords);
      const locationLabel =
        report.barangay && report.city ? `${report.barangay}, ${report.city}` : report.location;
      
      if (dataMap.has(key)) {
        const existing = dataMap.get(key)!;
        existing.count += 1;
        existing.reports.push(report);
        if (report.needsRescue) {
          existing.needsRescueCount += 1;
        }
        
        // Update highest severity
        if (severityOrder[report.severity] > severityOrder[existing.highestSeverity]) {
          existing.highestSeverity = report.severity;
        }
      } else {
        dataMap.set(key, {
          key,
          location: locationLabel,
          coordinates: coords,
          count: 1,
          reports: [report],
          highestSeverity: report.severity,
          primaryType: report.type,
          needsRescueCount: report.needsRescue ? 1 : 0,
        });
      }
    });
    
    const items = Array.from(dataMap.values());
    // choose a stable-ish primary type for the icon (most common type within that hotspot)
    for (const item of items) {
      const counts: Partial<Record<UserReport['type'], number>> = {};
      for (const r of item.reports) counts[r.type] = (counts[r.type] ?? 0) + 1;
      let best: UserReport['type'] = item.primaryType;
      let bestCount = -1;
      for (const [t, c] of Object.entries(counts) as Array<[UserReport['type'], number]>) {
        if (c > bestCount) {
          bestCount = c;
          best = t;
        }
      }
      item.primaryType = best;
    }
    return items;
  }, [reports]);

  const displayData: ClusterData[] = useMemo(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return locationData.map((d) => ({
        ...d,
        isCluster: false,
        memberKeys: [d.key],
        hotspotCount: 1,
      }));
    }

    const cell = cellSizeForZoom(mapZoom);
    if (cell <= 0) {
      return locationData.map((d) => ({
        ...d,
        isCluster: false,
        memberKeys: [d.key],
        hotspotCount: 1,
      }));
    }

    const zoom = mapZoom;
    const buckets = new Map<
      string,
      {
        points: LocationData[];
        sumLat: number;
        sumLng: number;
        reportCount: number;
        needsRescueCount: number;
        highest: AlertSeverity;
        reports: UserReport[];
      }
    >();

    for (const p of locationData) {
      const projected = map.project(L.latLng(p.coordinates[0], p.coordinates[1]), zoom);
      const cx = Math.floor(projected.x / cell);
      const cy = Math.floor(projected.y / cell);
      const bucketKey = `${cx},${cy}`;

      const existing = buckets.get(bucketKey);
      if (!existing) {
        buckets.set(bucketKey, {
          points: [p],
          sumLat: p.coordinates[0],
          sumLng: p.coordinates[1],
          reportCount: p.count,
          needsRescueCount: p.needsRescueCount,
          highest: p.highestSeverity,
          reports: [...p.reports],
        });
      } else {
        existing.points.push(p);
        existing.sumLat += p.coordinates[0];
        existing.sumLng += p.coordinates[1];
        existing.reportCount += p.count;
        existing.needsRescueCount += p.needsRescueCount;
        if (severityOrder[p.highestSeverity] > severityOrder[existing.highest]) {
          existing.highest = p.highestSeverity;
        }
        // keep popup payload bounded for perf
        if (existing.reports.length < 40) {
          existing.reports.push(...p.reports.slice(0, Math.max(0, 40 - existing.reports.length)));
        }
      }
    }

    const clusters: ClusterData[] = [];
    for (const [, b] of buckets) {
      const hotspotCount = b.points.length;
      const coords: [number, number] = [b.sumLat / hotspotCount, b.sumLng / hotspotCount];
      const memberKeys = b.points.map((p) => p.key);
      const isCluster = hotspotCount > 1;
      // choose a primary type for cluster icon based on bounded report list
      const counts: Partial<Record<UserReport['type'], number>> = {};
      for (const r of b.reports) counts[r.type] = (counts[r.type] ?? 0) + 1;
      let primaryType: UserReport['type'] = b.points[0].primaryType;
      let bestCount = -1;
      for (const [t, c] of Object.entries(counts) as Array<[UserReport['type'], number]>) {
        if (c > bestCount) {
          bestCount = c;
          primaryType = t;
        }
      }
      clusters.push({
        key: isCluster ? `cluster:${memberKeys[0]}:${hotspotCount}` : b.points[0].key,
        location: isCluster ? `${hotspotCount} hotspots (zoom in)` : b.points[0].location,
        coordinates: isCluster ? coords : b.points[0].coordinates,
        count: b.reportCount,
        reports: b.reports,
        highestSeverity: b.highest,
        primaryType,
        needsRescueCount: b.needsRescueCount,
        isCluster,
        memberKeys,
        hotspotCount,
      });
    }

    // stable-ish ordering
    clusters.sort((a, b) => b.count - a.count);
    return clusters;
  }, [locationData, mapZoom]);

  // Find most affected area
  const mostAffectedArea = useMemo(() => {
    if (locationData.length === 0) return null;
    return locationData.reduce((max, current) => 
      current.count > max.count ? current : max
    );
  }, [locationData]);

  const sortedLocationData = useMemo(() => {
    return [...displayData].sort((a, b) => b.count - a.count);
  }, [displayData]);

  useEffect(() => {
    barangaysEnabledRef.current = barangaysEnabled;
  }, [barangaysEnabled]);

  // Barangay-first mode: keep barangays always enabled.
  useEffect(() => {
    if (visualization === 'barangay') setBarangaysEnabled(true);
  }, [visualization]);

  // If we switch away from admin mode, ensure any admin layer is removed.
  useEffect(() => {
    if (visualization === 'admin') return;
    if (adminLayerRef.current) {
      adminLayerRef.current.remove();
      adminLayerRef.current = null;
    }
    adminIndexRef.current = null;
    adminStatsRef.current = new Map();
    setAdminReady(false);
    setAdminUnitCount(0);
    setAdminAffectedCount(0);
    setAdminTopArea(null);
  }, [visualization]);

  // When barangays are enabled, render ONLY barangays that have reports (country-wide).
  // This matches the UX: polygons should cover report barangays, not entire municipalities.
  useEffect(() => {
    if (!barangaysEnabled) return;
    if (visualization !== 'barangay') return;

    const normalizeCity = (s: string) => s.replace(/^City of\s+/i, '').trim().toLowerCase();

    const statsByBarangay = new Map<string, { count: number; highestSeverity: AlertSeverity }>();
    const pairKeySet = new Set<string>();
    const pairs: Array<{ city: string; barangay: string }> = [];

    for (const r of reports) {
      const city = r.city ?? '';
      const brgy = r.barangay ?? '';
      if (!city || !brgy) continue;

      const key = `${normalizeCity(city)}||${brgy}`;
      if (!pairKeySet.has(key)) {
        pairKeySet.add(key);
        pairs.push({ city, barangay: brgy });
      }

      const prev = statsByBarangay.get(key);
      if (!prev) {
        statsByBarangay.set(key, { count: 1, highestSeverity: r.severity });
      } else {
        const highest =
          severityOrder[r.severity] > severityOrder[prev.highestSeverity] ? r.severity : prev.highestSeverity;
        statsByBarangay.set(key, { count: prev.count + 1, highestSeverity: highest });
      }
    }

    // Keep it safe: don't try to fetch hundreds at once.
    const limited = pairs.slice(0, 50);
    if (limited.length === 0) {
      clearBarangays();
      return;
    }

    void loadAffectedBarangays({
      cacheKey: `affected:global:${limited
        .map((p) => `${normalizeCity(p.city)}||${p.barangay}`)
        .sort()
        .join('|')}`,
      label: 'Affected barangays',
      pairs: limited,
      statsByBarangay,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangaysEnabled, visualization, reports]);

  const mostAffectedBarangay = useMemo(() => {
    const normalizeCity = (s: string) => s.replace(/^City of\s+/i, '').trim();
    const counts = new Map<string, number>();
    for (const r of reports) {
      if (!r.barangay || !r.city) continue;
      const key = `${r.barangay}||${normalizeCity(r.city)}||${r.province ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best: { label: string; count: number } | null = null;
    for (const [k, c] of counts.entries()) {
      if (!best || c > best.count) {
        const [brgy, city, prov] = k.split('||');
        best = { label: [brgy, city, prov].filter(Boolean).join(', '), count: c };
      }
    }
    return best;
  }, [reports]);

  const clearBarangays = () => {
    barangayAbortRef.current?.abort();
    barangayAbortRef.current = null;
    setBarangayLoading(false);
    setBarangayError(null);
    setBarangayForName(null);
    setBarangayCount(0);
    if (barangayLayerRef.current) {
      barangayLayerRef.current.remove();
      barangayLayerRef.current = null;
    }
  };

  const loadAffectedBarangays = async (opts: {
    cacheKey: string;
    label: string;
    pairs: Array<{ city: string; barangay: string }>;
    statsByBarangay: Map<string, { count: number; highestSeverity: AlertSeverity }>;
  }) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // cancel any in-flight request
    barangayAbortRef.current?.abort();
    const ctrl = new AbortController();
    barangayAbortRef.current = ctrl;

    setBarangayLoading(true);
    setBarangayError(null);
    setBarangayForName(opts.label);
    setBarangayCount(0);

    // cached?
    const cached = barangayCacheRef.current.get(opts.cacheKey);
    const apply = (fc: GeoJSON.FeatureCollection) => {
      if (barangayLayerRef.current) barangayLayerRef.current.remove();
      const normalizeCity = (s: string) => s.replace(/^City of\s+/i, '').trim().toLowerCase();

      // Store barangay geometries for clipping circles
      barangayGeometriesRef.current.clear();
      fc.features?.forEach((feature: any) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const city = String(props.city_name ?? props.cityName ?? '');
        const brgy = String(props.brgy_name ?? props.brgyName ?? '');
        const key = `${normalizeCity(city)}||${brgy}`;
        barangayGeometriesRef.current.set(key, feature);
      });

      // Don't render barangay boundaries - only circles will be shown
      barangayLayerRef.current = null;
      setBarangayCount(fc.features?.length ?? 0);
    };

    try {
      if (cached) {
        apply(cached);
        setBarangayLoading(false);
        return;
      }

      const escapeSqlString = (s: string) => s.replace(/'/g, "''");
      const normalizeCityName = (name: string) => name.replace(/^City of\s+/i, '').trim().toLowerCase();

      const fetchForCityAndBarangay = async (cityName: string, barangayName: string) => {
        const where = `city_name='${escapeSqlString(cityName)}' AND brgy_name='${escapeSqlString(barangayName)}'`;
        const params = new URLSearchParams({
          f: 'geojson',
          where,
          outFields: '*',
          returnGeometry: 'true',
          outSR: '4326',
          resultRecordCount: '2000',
          resultOffset: '0',
        });

        const url = `${PSA_BRGY_ARCGIS_QUERY_URL}?${params.toString()}`;
        const resp = await fetch(url, {
          mode: 'cors',
          credentials: 'include',
          signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error(`Barangay query failed: ${resp.status}`);
        return (await resp.json()) as GeoJSON.FeatureCollection;
      };

      const merged: GeoJSON.Feature[] = [];

      for (const pair of opts.pairs) {
        const cityVariants = Array.from(
          new Set([pair.city, `City of ${pair.city}`].map((x) => x.trim()).filter(Boolean)),
        );

        let got: GeoJSON.FeatureCollection | null = null;
        for (const c of cityVariants) {
          got = await fetchForCityAndBarangay(c, pair.barangay);
          if ((got.features?.length ?? 0) > 0) break;
        }

        if (!got || (got.features?.length ?? 0) === 0) {
          const altCity = pair.city.startsWith('City of ') ? pair.city.replace(/^City of\s+/i, '') : `City of ${pair.city}`;
          got = await fetchForCityAndBarangay(altCity, pair.barangay).catch(() => null);
        }

        if (got?.features?.length) merged.push(...(got.features as GeoJSON.Feature[]));
      }

      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: merged,
      };

      barangayCacheRef.current.set(opts.cacheKey, fc);
      apply(fc);
      setBarangayLoading(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      setBarangayLoading(false);
      setBarangayError(msg);
    }
  };

  const perfMode = useMemo<'full' | 'lite'>(() => {
    // Heuristics: the expensive part is lots of animated DOM/SVG layers.
    // Switch to lite mode automatically when volume gets high.
    if (locationData.length > 18) return 'lite';
    if (reports.length > 160) return 'lite';
    return 'full';
  }, [locationData.length, reports.length]);

  const flyToKey = (key: string) => {
    const marker = markersRef.current.get(key)?.center;
    const map = mapInstanceRef.current;
    if (!map) return;
    if (marker) {
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 13), { animate: true, duration: 0.6 });
      return;
    }

    // Fallback: parse coords from key (coordsKey format: "lat,lng")
    const parts = key.split(',');
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { animate: true, duration: 0.6 });
    }
  };

  const centerMap = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo(PH_CENTER, 6, { animate: true, duration: 0.6 });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  };

  const popupHtml = (data: LocationData) => {
    const severityLabel = data.highestSeverity.toUpperCase();
    const radiusM = getRadarRadiusMeters(data.count, data.highestSeverity);
    const rescueBadge =
      data.needsRescueCount > 0
        ? `<span class="leaflet-pop__rescue">Rescue: ${data.needsRescueCount}</span>`
        : '';
    return `
      <div class="leaflet-pop">
        <div class="leaflet-pop__top">
          <div class="leaflet-pop__title">${data.location}</div>
          <div class="leaflet-pop__pill" style="border-color:${getSeverityColor(data.highestSeverity)};color:${getSeverityColor(data.highestSeverity)}">
            ${severityLabel}
          </div>
        </div>
        <div class="leaflet-pop__meta">
          <span class="leaflet-pop__dot" style="background:${getSeverityColor(data.highestSeverity)}"></span>
          <span>${data.count} report${data.count > 1 ? 's' : ''}</span>
          <span style="opacity:.5">•</span>
          <span>${radiusM.toLocaleString()}m radius</span>
          ${rescueBadge}
        </div>
        <div class="leaflet-pop__divider"></div>
        <div class="leaflet-pop__list">
          ${data.reports
            .slice(0, 5)
            .map(
              (report) => `
              <div class="leaflet-pop__item">
                <div class="leaflet-pop__item-top">
                  <span class="leaflet-pop__tag" style="border-color:${getSeverityColor(report.severity)};color:${getSeverityColor(report.severity)}">
                    ${report.severity.toUpperCase()}
                  </span>
                  <span class="leaflet-pop__type">${report.type}</span>
                </div>
                <div class="leaflet-pop__desc">${truncateText(report.description, 110)}</div>
                <div class="leaflet-pop__by">— ${report.reporterName}</div>
              </div>
            `,
            )
            .join('')}
          ${data.reports.length > 5 ? `<div class="leaflet-pop__more">+${data.reports.length - 5} more</div>` : ''}
        </div>
      </div>
    `;
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const bounds = L.latLngBounds(PH_BOUNDS.southWest, PH_BOUNDS.northEast);
    const map = L.map(mapRef.current, {
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
      minZoom: 5,
      maxZoom: 20,
      worldCopyJump: false,
    }).setView(PH_CENTER, 6);
    
    // Stadia dark basemap to match ops UI
    const stadiaKey = import.meta.env.VITE_STADIA_API_KEY || '';
    const tileUrl = `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png${
      stadiaKey ? `?api_key=${stadiaKey}` : ''
    }`;
    L.tileLayer(tileUrl, {
      attribution:
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
        '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20,
    }).addTo(map);

    mapInstanceRef.current = map;

    setMapZoom(map.getZoom());
    const onZoom = () => setMapZoom(map.getZoom());
    map.on('zoomend', onZoom);

    return () => {
      map.off('zoomend', onZoom);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Mark map container for CSS-level perf tuning
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.getContainer().dataset.perf = perfMode;
  }, [perfMode]);

  // Admin boundaries: load municipality/city polygons (ADM3) once, then style them based on reports
  useEffect(() => {
    if (visualization !== 'admin') return;
    const map = mapInstanceRef.current;
    if (!map) return;

    let cancelled = false;

    const load = async () => {
      try {
        const resp = await fetch(ADMIN_ADM3_GEOJSON_URL);
        if (!resp.ok) throw new Error(`Failed to load ADM3 boundaries: ${resp.status}`);
        const data = (await resp.json()) as AdminFeatureCollection;
        if (cancelled) return;

        const items: AdminIndexItem[] = data.features
          .filter((f) => f?.type === 'Feature' && f.geometry)
          .map((f) => {
            const props = f.properties ?? {};
            const id = String(props.shapeID ?? props.shapeId ?? props.shape_id ?? props.id ?? '');
            const name = String(props.shapeName ?? props.shape_name ?? props.name ?? 'Unknown');
            return {
              id,
              name,
              bbox: computeBBoxForGeometry(f.geometry),
              feature: f,
            };
          })
          .filter((it) => it.id.length > 0);

        adminIndexRef.current = items;
        setAdminUnitCount(items.length);
        setAdminAffectedCount(0);
        setAdminTopArea(null);

        if (adminLayerRef.current) {
          adminLayerRef.current.remove();
          adminLayerRef.current = null;
        }

        const layer = L.geoJSON(data as unknown as GeoJSON.GeoJsonObject, {
          style: (feature: any) => {
            const props = (feature?.properties ?? {}) as Record<string, unknown>;
            const id = String(props.shapeID ?? props.shapeId ?? props.shape_id ?? props.id ?? '');
            const stats = adminStatsRef.current.get(id);
            const severity = stats?.highestSeverity ?? 'low';
            const color = getSeverityColor(severity);
            const hasReports = (stats?.count ?? 0) > 0;
              const dimFill = barangaysEnabled && (barangayForName != null || barangayLayerRef.current != null);
            return {
              className: `admin-boundary admin-boundary--${severity}`,
              color: hasReports ? color : 'rgba(148,163,184,0.35)',
              weight: hasReports ? 1.25 : 0.8,
              opacity: 0.9,
              fillColor: color,
                fillOpacity: dimFill ? 0.03 : hasReports ? 0.14 : 0,
            } as L.PathOptions;
          },
          onEachFeature: (feature: any, layer: any) => {
            const props = (feature?.properties ?? {}) as Record<string, unknown>;
            const id = String(props.shapeID ?? props.shapeId ?? props.shape_id ?? props.id ?? '');
            const name = String(props.shapeName ?? props.shape_name ?? props.name ?? 'Unknown');

            layer.on('mouseover', () => {
              layer.setStyle({ weight: 2.25, opacity: 1 });
            });

            layer.on('mouseout', () => {
              if (adminLayerRef.current) adminLayerRef.current.resetStyle(layer);
            });

            layer.on('click', (e: any) => {
              // Barangay drill-down: ONLY show barangays that actually have reports in this city/municipality.
              if (barangaysEnabledRef.current) {
                const b = layer.getBounds?.();
                if (b) map.flyToBounds(b.pad(0.08), { animate: true, duration: 0.55 });

                const normalizeCity = (s: string) => s.replace(/^City of\s+/i, '').trim().toLowerCase();
                const wantedCity = normalizeCity(name);

                const statsByBarangay = new Map<string, { count: number; highestSeverity: AlertSeverity }>();
                const pairKeySet = new Set<string>();
                const pairs: Array<{ city: string; barangay: string }> = [];

                for (const r of reports) {
                  const city = r.city ?? '';
                  const brgy = r.barangay ?? '';
                  if (!city || !brgy) continue;
                  if (normalizeCity(city) !== wantedCity) continue;

                  const key = `${normalizeCity(city)}||${brgy}`;
                  const pairKey = `${normalizeCity(city)}||${brgy}`;
                  if (!pairKeySet.has(pairKey)) {
                    pairKeySet.add(pairKey);
                    pairs.push({ city, barangay: brgy });
                  }
                  const prev = statsByBarangay.get(key);
                  if (!prev) {
                    statsByBarangay.set(key, { count: 1, highestSeverity: r.severity });
                  } else {
                    const highest =
                      severityOrder[r.severity] > severityOrder[prev.highestSeverity]
                        ? r.severity
                        : prev.highestSeverity;
                    statsByBarangay.set(key, { count: prev.count + 1, highestSeverity: highest });
                  }
                }

                if (pairs.length === 0) {
                  clearBarangays();
                  setBarangayError('No report-specific barangays for this municipality yet.');
                } else {
                  void loadAffectedBarangays({
                    cacheKey: `affected:${id || name}:${pairs
                      .map((p) => `${normalizeCity(p.city)}||${p.barangay}`)
                      .sort()
                      .join('|')}`,
                    label: name,
                    pairs,
                    statsByBarangay,
                  });
                }
              }

              const stats = adminStatsRef.current.get(id);
              const count = stats?.count ?? 0;
              const sev = stats?.highestSeverity ?? 'low';
              const popupHtml = `
                <div class="space-y-1">
                  <div class="font-semibold">${name}</div>
                  <div class="text-xs text-muted-foreground">${count} report${count === 1 ? '' : 's'}</div>
                  <div class="text-xs">Highest severity: <b>${sev}</b></div>
                  <div class="text-[11px] text-muted-foreground">Tip: zoom in for more detail.</div>
                </div>
              `;
              L.popup({ closeButton: true, autoPan: true })
                .setLatLng(e.latlng)
                .setContent(popupHtml)
                .openOn(map);
            });
          },
        });

        layer.addTo(map);
        adminLayerRef.current = layer;
        setAdminReady(true);
      } catch (err) {
        console.error(err);
        // Keep the map usable even if the boundary layer fails to load
        setAdminReady(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (adminLayerRef.current) {
        adminLayerRef.current.remove();
        adminLayerRef.current = null;
      }
      clearBarangays();
      adminIndexRef.current = null;
      adminStatsRef.current = new Map();
      setAdminReady(false);
    };
  }, [visualization, barangaysEnabled]);

  // Compute municipality stats from report coordinates, then restyle the admin layer.
  useEffect(() => {
    if (!adminReady) return;
    const index = adminIndexRef.current;
    const layer = adminLayerRef.current;
    if (!index || !layer) return;

    const next = new Map<string, AdminStats>();

    // Join reports to polygons using coordinates when available,
    // otherwise fall back to our deterministic approximate lookup.
    for (const r of reports) {
      const coords = r.coordinates ?? getApproxCoordinates(r.location);
      const lat = coords[0];
      const lng = coords[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      for (const it of index) {
        if (!bboxContains(it.bbox, lat, lng)) continue;
        if (!pointInAdminGeometry(lng, lat, it.feature.geometry)) continue;

        const prev = next.get(it.id);
        const sev = r.severity ?? 'low';
        if (!prev) {
          next.set(it.id, { count: 1, highestSeverity: sev });
        } else {
          const highest =
            severityOrder[sev] > severityOrder[prev.highestSeverity] ? sev : prev.highestSeverity;
          next.set(it.id, { count: prev.count + 1, highestSeverity: highest });
        }
        break; // each point belongs to a single municipality
      }
    }

    adminStatsRef.current = next;
    setAdminAffectedCount(next.size);

    // Find "top" affected municipality (by count, then by severity)
    let top: { id: string; count: number; highestSeverity: AlertSeverity } | null = null;
    for (const [id, st] of next.entries()) {
      if (
        !top ||
        st.count > top.count ||
        (st.count === top.count &&
          severityOrder[st.highestSeverity] > severityOrder[top.highestSeverity])
      ) {
        top = { id, count: st.count, highestSeverity: st.highestSeverity };
      }
    }
    if (top) {
      const name = index.find((x) => x.id === top.id)?.name ?? 'Unknown';
      setAdminTopArea({ name, count: top.count, highestSeverity: top.highestSeverity });
    } else {
      setAdminTopArea(null);
    }

    layer.setStyle((feature: any) => {
      const props = (feature?.properties ?? {}) as Record<string, unknown>;
      const id = String(props.shapeID ?? props.shapeId ?? props.shape_id ?? props.id ?? '');
      const stats = adminStatsRef.current.get(id);
      const severity = stats?.highestSeverity ?? 'low';
      const color = getSeverityColor(severity);
      const hasReports = (stats?.count ?? 0) > 0;
      return {
        className: `admin-boundary admin-boundary--${severity}`,
        color: hasReports ? color : 'rgba(148,163,184,0.35)',
        weight: hasReports ? 1.25 : 0.8,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: hasReports ? 0.14 : 0,
      } as L.PathOptions;
    });
  }, [adminReady, reports]);

  // Update markers when reports change (hotspot polygons)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // In admin mode, keep the map clean: no hotspot rings/areas/circles.
    if (visualization === 'admin') {
      markersRef.current.forEach(({ center, rings, outer }) => {
        center.remove();
        rings.forEach((r) => r.remove());
        outer.remove();
      });
      markersRef.current = new Map();
      return;
    }

    // Remove existing markers
    markersRef.current.forEach(({ center, rings, outer }) => {
      center.remove();
      rings.forEach((r) => r.remove());
      outer.remove();
    });
    markersRef.current = new Map();

    const isLite = perfMode === 'lite';
    const steps = isLite ? 18 : 28;
    const map = mapInstanceRef.current!;

    // Step 1: Generate circles with metadata
    const circles = displayData.map((data) => {
      const radiusM = getRadarRadiusMeters(data.count, data.highestSeverity);

      // For clusters, expand radius to cover member points
      let areaRadius = radiusM;
      if (data.isCluster) {
        let maxD = 0;
        for (const memberKey of data.memberKeys) {
          const member = locationData.find((x) => x.key === memberKey);
          if (!member) continue;
          maxD = Math.max(maxD, haversineMeters(data.coordinates, member.coordinates));
        }
        areaRadius = Math.max(areaRadius, maxD + 350);
      }

      return { center: data.coordinates, radiusKm: areaRadius / 1000, radiusM: areaRadius, data };
    });

    // Step 2: Create Leaflet circles (no merging)
    circles.forEach(({ radiusM, data }) => {
      const key = data.key;
      const color = getSeverityColor(data.highestSeverity);
      const rings: L.Circle[] = [];

      // In barangay mode, only show circles for reports with barangay data
      if (visualization === 'barangay') {
        const hasBarangay = data.reports.some(r => r.barangay && r.city);
        if (!hasBarangay) return;
      }

      // In barangay mode, make circles much smaller to fit within barangay boundaries
      const adjustedRadius = visualization === 'barangay' ? radiusM * 0.2 : radiusM;

      // Render circles for all modes
      const center = L.marker(data.coordinates, {
        icon: L.divIcon({ className: 'area-anchor', html: '' }),
        interactive: false,
        opacity: 0,
      });

      // Create popup content
      const popupContent = document.createElement('div');
      popupContent.innerHTML = popupHtml(data);

      center.bindPopup(popupContent);

      // Create multiple concentric circles for gradient effect (center to edge fade)
      const numRings = isLite ? 3 : 5;
      const gradientRings: L.Circle[] = [];

      for (let i = 0; i < numRings; i++) {
        const ringRadius = adjustedRadius * ((i + 1) / numRings);
        const ringOpacity = (1 - i / numRings) * (isLite ? 0.3 : 0.4);

        const ring = L.circle(data.coordinates, {
          radius: ringRadius,
          color: color,
          weight: 0,
          opacity: 0,
          fillColor: color,
          fillOpacity: ringOpacity,
          className: `area-circle area-circle--${data.highestSeverity}`,
        });

        ring.addTo(map);
        gradientRings.push(ring);
      }

      // Use the outermost ring for interactions
      const area = gradientRings[gradientRings.length - 1];

      // Interactions
      if (data.isCluster) {
        area.on('click', () => {
          const m = mapInstanceRef.current;
          if (!m) return;
          m.flyTo(area.getBounds().getCenter(), Math.min(12, Math.max(m.getZoom() + 2, 9)), {
            animate: true,
            duration: 0.5,
          });
        });
      } else {
        area.on('click', () => center.openPopup());
      }

      center.addTo(map);

      markersRef.current.set(key, { center, rings: gradientRings, outer: area });

      // Index member keys for focus support
      if (data.isCluster) {
        data.memberKeys.forEach((memberKey) => {
          markersRef.current.set(memberKey, { center, rings, outer: area });
        });
      }
    });
  }, [displayData, perfMode, visualization]);

  // External focus (from overlays / lists)
  useEffect(() => {
    if (!focusKey) return;
    flyToKey(focusKey);
  }, [focusKey, locationData]);

  if (variant === 'full') {
    return (
      <div className="relative h-full w-full">
        <div ref={mapRef} className="h-full w-full" style={{ zIndex: 0 }} />

        <div className="absolute left-3 bottom-3 z-10 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-[10px] tracking-[0.18em] uppercase"
            onClick={centerMap}
          >
            Center PH
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full bg-card shadow-sm overflow-hidden">
      <div className="h-1 w-full brand-stripe-45" />
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm tracking-[0.18em] uppercase font-mono text-muted-foreground">
            Affected areas map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="font-mono text-[10px] tracking-[0.18em] uppercase" onClick={centerMap}>
              Center
            </Button>
            {mostAffectedArea && (
              <Badge className="border-0 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
                Hotspot: {mostAffectedArea.location} ({mostAffectedArea.count})
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="relative">
              <div 
                ref={mapRef} 
                className="h-[360px] sm:h-[420px] lg:h-[520px] rounded-xl overflow-hidden border bg-background/40 shadow-inner"
                style={{ zIndex: 0 }}
              />
              <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
                <div className="rounded-lg border bg-background/65 px-2.5 py-1.5 text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
                  {sortedLocationData.length} locations
                </div>
                <div className="rounded-lg border bg-background/65 px-2.5 py-1.5 text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
                  {reports.length} reports
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm bg-background/40 p-4 rounded-xl border">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500 shadow-md"></div>
                <span className="text-sm">Low</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-yellow-500 shadow-md"></div>
                <span className="text-sm">Medium</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full shadow-md" style={{ backgroundColor: '#e85002' }}></div>
                <span className="text-sm">High</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500 shadow-md"></div>
                <span className="text-sm">Critical</span>
              </div>
              <div className="flex items-center gap-2 ml-auto text-muted-foreground">
                <span className="text-[10px] font-mono tracking-[0.18em] uppercase">Radius = affected area</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-muted-foreground">
                Hotspots
              </div>
              <Badge variant="secondary" className="rounded-full font-mono text-[10px] tracking-[0.18em] uppercase">
                Top {Math.min(sortedLocationData.length, 8)}
              </Badge>
            </div>

            <div className="mt-3 space-y-2">
              {sortedLocationData.slice(0, 8).map((data) => {
                const key = data.key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => flyToKey(key)}
                    className="w-full rounded-lg border bg-background/35 px-3 py-2 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{data.location}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex size-2 rounded-full" style={{ backgroundColor: getSeverityColor(data.highestSeverity) }} />
                          <span className="font-mono tracking-[0.14em] uppercase">{data.highestSeverity}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-lg font-semibold tabular-nums">{data.count}</div>
                        <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-muted-foreground">
                          reports
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Tip: hotspots are aggregated by approximate coordinates.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
