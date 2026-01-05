import type { UserReport } from '../components/ReportForm';
import { coordsKey, getApproxCoordinates, PH_BOUNDS } from './geo';

export type ResolvedBarangay = {
  region?: string;
  regionCode?: string;
  province?: string;
  provinceCode?: string;
  city?: string;
  cityCode?: string;
  barangay?: string;
  barangayCode?: string;
  psgc10d?: string;
};

export type BarangayResolveStatus = 'hit' | 'nohit' | 'error';

export type BarangayResolveResult =
  | { status: 'hit'; data: ResolvedBarangay }
  | { status: 'nohit'; data: null }
  | { status: 'error'; data: null; message?: string };

const PSA_BRGY_ARCGIS_QUERY_URL =
  'https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/4/query';

const cache = new Map<string, ResolvedBarangay | null>();
const cityCache = new Map<string, string[]>();
const barangayCache = new Map<string, string[]>();

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}

function inPhilippinesBounds(lat: number, lng: number) {
  return (
    lat >= PH_BOUNDS.southWest[0] &&
    lat <= PH_BOUNDS.northEast[0] &&
    lng >= PH_BOUNDS.southWest[1] &&
    lng <= PH_BOUNDS.northEast[1]
  );
}

export async function resolveBarangayFromCoordsDetailed(
  coords: [number, number],
  opts?: { signal?: AbortSignal },
): Promise<BarangayResolveResult> {
  const [lat, lng] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'nohit', data: null };
  if (!inPhilippinesBounds(lat, lng)) return { status: 'nohit', data: null };

  const key = coordsKey([Number(lat.toFixed(5)), Number(lng.toFixed(5))]);
  if (cache.has(key)) {
    const cached = cache.get(key) ?? null;
    return cached ? { status: 'hit', data: cached } : { status: 'nohit', data: null };
  }

  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'reg_name,prov_name,city_name,brgy_name,reg_code,prov_code,city_code,brgy_code,psgc_10d',
    returnGeometry: 'false',
    resultRecordCount: '1',
    resultOffset: '0',
  });

  const url = `${PSA_BRGY_ARCGIS_QUERY_URL}?${params.toString()}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      mode: 'cors',
      credentials: 'include',
      signal: opts?.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 'error', data: null, message: msg };
  }

  if (!resp.ok) {
    // don't cache failures, but keep app usable
    return { status: 'error', data: null, message: `HTTP ${resp.status}` };
  }

  const json = (await resp.json()) as any;
  const attrs = json?.features?.[0]?.attributes;
  if (!attrs || typeof attrs !== 'object') {
    cache.set(key, null);
    return { status: 'nohit', data: null };
  }

  const resolved: ResolvedBarangay = {
    region: attrs.reg_name ?? undefined,
    regionCode: attrs.reg_code ?? undefined,
    province: attrs.prov_name ?? undefined,
    provinceCode: attrs.prov_code ?? undefined,
    city: attrs.city_name ?? undefined,
    cityCode: attrs.city_code ?? undefined,
    barangay: attrs.brgy_name ?? undefined,
    barangayCode: attrs.brgy_code ?? undefined,
    psgc10d: attrs.psgc_10d ?? undefined,
  };

  cache.set(key, resolved);
  return { status: 'hit', data: resolved };
}

export async function resolveBarangayFromCoords(
  coords: [number, number],
  opts?: { signal?: AbortSignal },
): Promise<ResolvedBarangay | null> {
  const res = await resolveBarangayFromCoordsDetailed(coords, opts);
  return res.status === 'hit' ? res.data : null;
}

export async function fetchCityOptions(opts?: { signal?: AbortSignal }): Promise<string[]> {
  const cacheKey = 'cities';
  if (cityCache.has(cacheKey)) return cityCache.get(cacheKey) ?? [];

  const params = new URLSearchParams({
    f: 'json',
    where: '1=1',
    outFields: 'city_name',
    returnDistinctValues: 'true',
    orderByFields: 'city_name',
    returnGeometry: 'false',
  });

  const url = `${PSA_BRGY_ARCGIS_QUERY_URL}?${params.toString()}`;
  const resp = await fetch(url, { mode: 'cors', credentials: 'include', signal: opts?.signal });
  if (!resp.ok) return [];
  const json = (await resp.json()) as any;
  const values = (json?.features ?? [])
    .map((f: any) => f?.attributes?.city_name)
    .filter((name: any): name is string => typeof name === 'string' && name.trim().length > 0);
  const unique = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  cityCache.set(cacheKey, unique);
  return unique;
}

export async function fetchBarangayOptions(
  cityName: string,
  opts?: { signal?: AbortSignal },
): Promise<string[]> {
  if (!cityName) return [];
  const cacheKey = cityName.trim().toLowerCase();
  if (barangayCache.has(cacheKey)) return barangayCache.get(cacheKey) ?? [];

  const params = new URLSearchParams({
    f: 'json',
    where: `city_name='${escapeSqlString(cityName)}'`,
    outFields: 'brgy_name',
    returnDistinctValues: 'true',
    orderByFields: 'brgy_name',
    returnGeometry: 'false',
  });

  const url = `${PSA_BRGY_ARCGIS_QUERY_URL}?${params.toString()}`;
  const resp = await fetch(url, { mode: 'cors', credentials: 'include', signal: opts?.signal });
  if (!resp.ok) return [];
  const json = (await resp.json()) as any;
  const values = (json?.features ?? [])
    .map((f: any) => f?.attributes?.brgy_name)
    .filter((name: any): name is string => typeof name === 'string' && name.trim().length > 0);
  const unique = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  barangayCache.set(cacheKey, unique);
  return unique;
}

export function formatBarangayLocation(r: Pick<UserReport, 'barangay' | 'city' | 'province' | 'region' | 'location'>) {
  if (r.barangay) {
    const parts = [r.barangay, r.city, r.province].filter(Boolean);
    return parts.join(', ');
  }
  if (r.location) return r.location;
  const parts = [r.city, r.province, r.region].filter(Boolean);
  return parts.join(', ');
}

export function coordsForReport(report: Pick<UserReport, 'coordinates' | 'location'>): [number, number] {
  return report.coordinates ?? getApproxCoordinates(report.location);
}
