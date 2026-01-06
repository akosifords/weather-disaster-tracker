// Shared types between frontend and backend

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 'flood' | 'fire' | 'storm' | 'wind' | 'other';
export type ReportSource = 'community' | 'pagasa';

// Frontend UserReport interface (camelCase)
export interface UserReport {
  id: string;
  reporterName: string;
  location: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  type: AlertType;
  severity: AlertSeverity;
  description: string;
  timestamp: Date;
  needsRescue?: boolean;
  source?: ReportSource;
  coordinates?: [number, number]; // [lat, lng]
  sourceUrl?: string;
  externalId?: string;
}

// Database record (snake_case)
export interface CommunityReportRecord {
  id: string;
  reporter_name: string;
  location: string;
  barangay: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  type: AlertType;
  severity: AlertSeverity;
  description: string;
  coordinates:
    | string
    | { type?: string; coordinates?: [number, number] }
    | { coordinates?: [number, number] }; // PostGIS geography as WKT or GeoJSON
  needs_rescue: boolean;
  source: ReportSource;
  external_id: string | null;
  source_url: string | null;
  created_at: string; // ISO timestamp
  updated_at: string;
  timestamp: string;
  deleted_at: string | null;
}

// API Request/Response types
export interface SubmitReportRequest {
  reporterName: string;
  location: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  type?: AlertType;
  severity?: AlertSeverity;
  description: string;
  coordinates?: [number, number];
  needsRescue?: boolean;
}

export interface SubmitReportResponse {
  success: boolean;
  report?: UserReport;
  error?: string;
}

export interface GetReportsQuery {
  severity?: AlertSeverity[];
  type?: AlertType[];
  since?: string; // ISO timestamp
  limit?: number;
  offset?: number;
  barangay?: string;
  city?: string;
}

export interface GetReportsResponse {
  reports: UserReport[];
  total: number;
  hasMore: boolean;
}

export interface AreaSeverityRanking {
  areaIdentifier: string;
  areaType: 'barangay' | 'city' | 'province' | 'region' | 'cluster';
  severity: AlertSeverity;
  score: number;
  needsRescueCount?: number;
  reportCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  latestReportAt: Date;
  bounds?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  coordinates: [number, number]; // Center point [lat, lng]
}

export interface GetAreaSeverityQuery {
  areaType?: 'barangay' | 'city' | 'province' | 'region';
  timeWindowHours?: number;
  limit?: number;
}

export interface GetAreaSeverityResponse {
  rankings: AreaSeverityRanking[];
  calculatedAt: Date;
}

const PH_COORD_BOUNDS = {
  latMin: 4.4,
  latMax: 21.6,
  lngMin: 116.0,
  lngMax: 127.3,
};

function parsePointText(wkt: string): [number, number] | undefined {
  const match = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(wkt);
  if (!match) return undefined;
  const lng = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return [lat, lng];
}

function parseWkbPoint(hex: string): [number, number] | undefined {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length < 18 || clean.length % 2 !== 0) {
    return undefined;
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }

  const dv = new DataView(bytes.buffer);
  let offset = 0;
  const byteOrder = dv.getUint8(offset);
  offset += 1;
  const littleEndian = byteOrder === 1;
  const type = dv.getUint32(offset, littleEndian);
  offset += 4;

  const hasSrid = (type & 0x20000000) !== 0;
  const geomType = type & 0x000000ff;
  if (geomType !== 1) return undefined;
  if (hasSrid) {
    offset += 4;
  }
  if (offset + 16 > dv.byteLength) return undefined;
  const x = dv.getFloat64(offset, littleEndian);
  const y = dv.getFloat64(offset + 8, littleEndian);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return [y, x];
}

function normalizeLatLng(coords: [number, number]): [number, number] {
  const [a, b] = coords;
  const aLat = a >= PH_COORD_BOUNDS.latMin && a <= PH_COORD_BOUNDS.latMax;
  const aLng = a >= PH_COORD_BOUNDS.lngMin && a <= PH_COORD_BOUNDS.lngMax;
  const bLat = b >= PH_COORD_BOUNDS.latMin && b <= PH_COORD_BOUNDS.latMax;
  const bLng = b >= PH_COORD_BOUNDS.lngMin && b <= PH_COORD_BOUNDS.lngMax;

  if (aLat && bLng) return [a, b];
  if (aLng && bLat) return [b, a];
  return [a, b];
}

// Conversion utilities
export function dbRecordToUserReport(record: CommunityReportRecord): UserReport {
  // Parse coordinates from PostGIS geography
  let coordinates: [number, number] | undefined;

  if (record.coordinates) {
    try {
      // Handle WKT string or GeoJSON-like object formats
      if (typeof record.coordinates === 'string') {
        if (record.coordinates.startsWith('POINT') || record.coordinates.startsWith('SRID=')) {
          // WKT/EWKT format: "POINT(lng lat)" or "SRID=4326;POINT(lng lat)"
          const parsed = parsePointText(record.coordinates);
          if (parsed) {
            coordinates = parsed;
          }
        } else if (record.coordinates.startsWith('{')) {
          // GeoJSON string
          const geojson = JSON.parse(record.coordinates);
          if (geojson.type === 'Point' && Array.isArray(geojson.coordinates)) {
            coordinates = [geojson.coordinates[1], geojson.coordinates[0]]; // [lat, lng]
          }
        } else {
          const parsed = parseWkbPoint(record.coordinates);
          if (parsed) {
            coordinates = parsed;
          }
        }
      } else if (typeof record.coordinates === 'object' && record.coordinates !== null) {
        const geojson = record.coordinates as { type?: string; coordinates?: [number, number] };
        if (Array.isArray(geojson.coordinates) && geojson.coordinates.length >= 2) {
          coordinates = [geojson.coordinates[1], geojson.coordinates[0]]; // [lat, lng]
        }
      }
    } catch (e) {
      console.error('Failed to parse coordinates:', e);
    }
  }

  return {
    id: record.id,
    reporterName: record.reporter_name,
    location: record.location,
    barangay: record.barangay ?? undefined,
    city: record.city ?? undefined,
    province: record.province ?? undefined,
    region: record.region ?? undefined,
    type: record.type,
    severity: record.severity,
    description: record.description,
    timestamp: new Date(record.timestamp),
    needsRescue: record.needs_rescue,
    source: record.source,
    coordinates: coordinates ? normalizeLatLng(coordinates) : undefined,
    sourceUrl: record.source_url ?? undefined,
    externalId: record.external_id ?? undefined,
  };
}

export function userReportToDbRecord(
  report: Omit<UserReport, 'id' | 'timestamp'>,
  id?: string
): Partial<CommunityReportRecord> {
  // Convert coordinates to PostGIS POINT format
  let coordinatesWKT: string | undefined;

  if (report.coordinates && report.coordinates.length === 2) {
    const [lat, lng] = report.coordinates;
    coordinatesWKT = `POINT(${lng} ${lat})`; // PostGIS uses lng lat order
  }

  return {
    ...(id && { id }),
    reporter_name: report.reporterName,
    location: report.location,
    barangay: report.barangay ?? null,
    city: report.city ?? null,
    province: report.province ?? null,
    region: report.region ?? null,
    type: report.type,
    severity: report.severity,
    description: report.description,
    ...(coordinatesWKT && { coordinates: coordinatesWKT }),
    needs_rescue: report.needsRescue ?? false,
    source: report.source ?? 'community',
    external_id: report.externalId ?? null,
    source_url: report.sourceUrl ?? null,
  };
}
