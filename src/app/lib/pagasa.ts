import type { AlertSeverity } from '../components/DisasterAlerts';
import type { UserReport } from '../components/ReportForm';

export type ReportSource = 'community' | 'pagasa';

export interface PagasaLightningEvent {
  type: 'in_cloud' | 'cloud_to_ground' | string;
  url?: string;
  flash_type?: string;
  latitude: string;
  longitude: string;
  timestamp: string; // e.g. "2025-12-31 07:05:11 AM"
  amplitude?: string;
}

export interface PagasaCurrentWeatherStation {
  datetime?: string; // e.g. "December 31, 2025, 5:00 am"
  site_id?: string;
  temperature?: string; // e.g. "20°C"
  humidity?: string; // e.g. "91%"
  wind_speed?: string; // e.g. "3.6 km/hr"
  wind_direction?: string; // e.g. "E"
  precipitation?: string; // e.g. "- mm/hr"
  site_name?: string; // e.g. "LAOAG"
  latitude?: string;
  longitude?: string;
  url?: string; // icon
  desc?: string; // e.g. "Partly cloudy skies"
}

export type PagasaCurrentWeatherMap = Record<string, PagasaCurrentWeatherStation>;

const PH_UTC_OFFSET_MINUTES = 8 * 60;

function toNumberOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parsePagasaMonthName(name: string): number | null {
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  return months[name.toLowerCase()] ?? null;
}

export function parsePagasaDateTimeTextPH(ts: string): Date | null {
  // Format seen from /api/CurrentWeather: "December 31, 2025, 5:00 am"
  const m =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(
      ts.trim(),
    );
  if (!m) return null;

  const month = parsePagasaMonthName(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour12 = Number(m[4]);
  const minute = Number(m[5]);
  const ampm = m[6].toUpperCase() as 'AM' | 'PM';

  if (month == null) return null;
  if (!Number.isFinite(year) || !Number.isFinite(day) || !Number.isFinite(hour12) || !Number.isFinite(minute)) return null;
  if (day < 1 || day > 31 || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;

  let hour24 = hour12 % 12;
  if (ampm === 'PM') hour24 += 12;

  const utcMillis =
    Date.UTC(year, month - 1, day, hour24, minute, 0) - PH_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMillis);
}

export function parsePagasaTimestampPH(ts: string): Date | null {
  // Format seen from /api/Lightning: "YYYY-MM-DD hh:mm:ss AM"
  const m =
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i.exec(
      ts.trim(),
    );
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  let hour12 = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const ampm = m[7].toUpperCase() as 'AM' | 'PM';

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!Number.isFinite(hour12) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  let hour24 = hour12 % 12;
  if (ampm === 'PM') hour24 += 12;

  const utcMillis =
    Date.UTC(year, month - 1, day, hour24, minute, second) - PH_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMillis);
}

export function severityFromLightningAmplitude(amplitude: number | null): AlertSeverity {
  // Heuristic thresholds (absolute amplitude), tuned for "fast scanning" rather than science-grade.
  const a = amplitude == null ? null : Math.abs(amplitude);
  if (a == null) return 'medium';
  if (a >= 80_000) return 'critical';
  if (a >= 30_000) return 'high';
  if (a >= 10_000) return 'medium';
  return 'low';
}

function parseFirstNumber(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = /-?\d+(\.\d+)?/.exec(text);
  return m ? Number(m[0]) : null;
}

export function severityFromPagasaCurrentWeather(desc: string | undefined, windKph: number | null): AlertSeverity {
  const d = (desc ?? '').toLowerCase();
  let s: AlertSeverity = 'low';
  if (d.includes('thunder')) s = 'medium';
  if (windKph != null) {
    if (windKph >= 80) return 'critical';
    if (windKph >= 50) return 'high';
    if (windKph >= 30) s = 'medium';
  }
  return s;
}

export function normalizePagasaLightningToReports(events: PagasaLightningEvent[]): UserReport[] {
  const reports: UserReport[] = [];

  for (const ev of events) {
    const lat = toNumberOrNull(ev.latitude);
    const lng = toNumberOrNull(ev.longitude);
    if (lat == null || lng == null) continue;

    const amp = toNumberOrNull(ev.amplitude);
    const severity = severityFromLightningAmplitude(amp);

    // Only include high and critical severity lightning
    if (severity !== 'high' && severity !== 'critical') continue;

    const ts = parsePagasaTimestampPH(ev.timestamp) ?? new Date();

    const isC2G = ev.type === 'cloud_to_ground' || ev.flash_type === '0';
    const kindLabel = isC2G ? 'Cloud-to-ground' : 'In-cloud';

    const id = `pagasa-lightning:${ev.timestamp}:${lat.toFixed(4)},${lng.toFixed(4)}:${amp ?? 'na'}`;

    reports.push({
      id,
      reporterName: 'PAGASA',
      severity,
      description:
        `${kindLabel} lightning detected. ` +
        `Amplitude: ${amp == null ? 'N/A' : amp.toLocaleString()}. ` +
        `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
      timestamp: ts,
      source: 'pagasa',
      coordinates: [lat, lng],
    });
  }

  // newest first
  reports.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return reports;
}

export async function fetchPagasaLightningEvents(baseUrl: string): Promise<PagasaLightningEvent[]> {
  const res = await fetch(`${baseUrl}/api/Lightning`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`PAGASA Lightning request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return Array.isArray(json) ? (json as PagasaLightningEvent[]) : [];
}

export async function fetchPagasaCurrentWeather(baseUrl: string): Promise<PagasaCurrentWeatherMap> {
  const res = await fetch(`${baseUrl}/api/CurrentWeather`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`PAGASA CurrentWeather request failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  return json && typeof json === 'object' && !Array.isArray(json) ? (json as PagasaCurrentWeatherMap) : {};
}

export function normalizePagasaCurrentWeatherToReports(map: PagasaCurrentWeatherMap): UserReport[] {
  const reports: UserReport[] = [];

  for (const [, station] of Object.entries(map)) {
    const site = (station.site_name ?? '').trim();
    const lat = toNumberOrNull(station.latitude);
    const lng = toNumberOrNull(station.longitude);
    if (!site || lat == null || lng == null) continue;

    const windKph = parseFirstNumber(station.wind_speed);
    const desc = (station.desc ?? '').trim();
    const severity = severityFromPagasaCurrentWeather(desc, windKph);

    // Only include high and critical severity weather
    if (severity !== 'high' && severity !== 'critical') continue;

    const ts = station.datetime ? parsePagasaDateTimeTextPH(station.datetime) : null;

    const temp = (station.temperature ?? '').trim();
    const rh = (station.humidity ?? '').trim();
    const windDir = (station.wind_direction ?? '').trim();
    const precip = (station.precipitation ?? '').trim();

    reports.push({
      id: `pagasa-current:${station.site_id ?? 'na'}:${station.datetime ?? ''}:${lat.toFixed(4)},${lng.toFixed(4)}`,
      reporterName: 'PAGASA',
      coordinates: [lat, lng],
      severity,
      description:
        `Current weather observation: ${desc || '—'}. ` +
        `Temp: ${temp || '—'}, RH: ${rh || '—'}, Wind: ${station.wind_speed ?? '—'} ${windDir || ''}, ` +
        `Precip: ${precip || '—'}.`,
      timestamp: ts ?? new Date(),
      source: 'pagasa',
      externalId: station.site_id,
    });
  }

  reports.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return reports;
}

