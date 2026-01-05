import type { AlertSeverity, AreaSeverityRanking, UserReport } from './types.js';

// Severity weights for scoring
const SEVERITY_WEIGHTS: Record<AlertSeverity, number> = {
  critical: 4.0,
  high: 3.0,
  medium: 2.0,
  low: 1.0,
};

// Severity thresholds for area-level classification
const SEVERITY_THRESHOLDS = {
  critical: 12,
  high: 6,
  medium: 3,
};

// Time-based thresholds for severity override (hours)
const TIME_THRESHOLDS = {
  critical: 6,
  high: 12,
  medium: 24,
};

/**
 * Calculate recency weight using exponential decay
 * Formula: weight = e^(-age_hours / 24)
 */
export function getRecencyWeight(timestamp: Date, now: Date = new Date()): number {
  const ageHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
  return Math.exp(-ageHours / 24);
}

/**
 * Get severity weight for scoring
 */
export function getSeverityWeight(severity: AlertSeverity): number {
  return SEVERITY_WEIGHTS[severity];
}

/**
 * Calculate severity score for a group of reports
 */
export function calculateSeverityScore(reports: UserReport[], now: Date = new Date()): number {
  return reports.reduce((sum, report) => {
    const severityWeight = getSeverityWeight(report.severity);
    const recencyWeight = getRecencyWeight(report.timestamp, now);
    return sum + severityWeight * recencyWeight;
  }, 0);
}

/**
 * Assign severity level based on score and recent critical reports
 */
export function assignSeverityLevel(score: number, reports: UserReport[], now: Date = new Date()): AlertSeverity {
  // Check for recent critical/high/medium reports that override score
  for (const report of reports) {
    const ageHours = (now.getTime() - report.timestamp.getTime()) / (1000 * 60 * 60);

    if (report.severity === 'critical' && ageHours < TIME_THRESHOLDS.critical) {
      return 'critical';
    }
    if (report.severity === 'high' && ageHours < TIME_THRESHOLDS.high) {
      return 'high';
    }
    if (report.severity === 'medium' && ageHours < TIME_THRESHOLDS.medium) {
      return 'medium';
    }
  }

  // Use score thresholds
  if (score >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (score >= SEVERITY_THRESHOLDS.high) return 'high';
  if (score >= SEVERITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Count reports by severity level
 */
export function countReportsBySeverity(reports: UserReport[]): AreaSeverityRanking['reportCounts'] {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const report of reports) {
    counts[report.severity]++;
  }

  return counts;
}

export function countNeedsRescue(reports: UserReport[]): number {
  return reports.reduce((sum, report) => sum + (report.needsRescue ? 1 : 0), 0);
}

/**
 * Get the latest timestamp from a group of reports
 */
export function getLatestTimestamp(reports: UserReport[]): Date {
  if (reports.length === 0) return new Date();

  return reports.reduce((latest, report) => {
    return report.timestamp > latest ? report.timestamp : latest;
  }, reports[0].timestamp);
}

/**
 * Calculate the centroid (center point) of a group of reports
 */
export function calculateCentroid(reports: UserReport[]): [number, number] {
  const validReports = reports.filter(r => r.coordinates && r.coordinates.length === 2);

  if (validReports.length === 0) {
    // Default to center of Philippines if no coordinates
    return [12.8797, 121.774]; // [lat, lng]
  }

  let sumLat = 0;
  let sumLng = 0;

  for (const report of validReports) {
    if (report.coordinates) {
      sumLat += report.coordinates[0];
      sumLng += report.coordinates[1];
    }
  }

  return [sumLat / validReports.length, sumLng / validReports.length];
}

/**
 * Calculate bounding box for a group of reports
 */
export function calculateBounds(
  reports: UserReport[]
): { type: 'Polygon'; coordinates: number[][][] } | undefined {
  const validReports = reports.filter(r => r.coordinates && r.coordinates.length === 2);

  if (validReports.length === 0) return undefined;

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const report of validReports) {
    if (report.coordinates) {
      const [lat, lng] = report.coordinates;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  }

  // Add padding (approximately 0.01 degrees = ~1km)
  const padding = 0.01;
  minLat -= padding;
  maxLat += padding;
  minLng -= padding;
  maxLng += padding;

  // Create GeoJSON Polygon (closed ring)
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat], // Close the ring
      ],
    ],
  };
}

interface AreaGroup {
  identifier: string;
  type: 'barangay' | 'city' | 'cluster';
  reports: UserReport[];
}

/**
 * Group reports by administrative area (barangay/city)
 * Falls back to spatial clustering for reports without administrative data
 */
export function groupReportsByArea(reports: UserReport[]): AreaGroup[] {
  const groups = new Map<string, AreaGroup>();

  // First, group by barangay
  for (const report of reports) {
    if (report.barangay && report.city) {
      const key = `${report.city}||${report.barangay}`.toLowerCase();

      if (!groups.has(key)) {
        groups.set(key, {
          identifier: `${report.barangay}, ${report.city}`,
          type: 'barangay',
          reports: [],
        });
      }

      groups.get(key)!.reports.push(report);
    }
  }

  // TODO: Implement spatial clustering (DBSCAN) for reports without barangay data
  // For now, group remaining reports by city if available
  for (const report of reports) {
    if (!report.barangay && report.city) {
      const key = `city||${report.city}`.toLowerCase();

      if (!groups.has(key)) {
        groups.set(key, {
          identifier: report.city,
          type: 'city',
          reports: [],
        });
      }

      groups.get(key)!.reports.push(report);
    }
  }

  return Array.from(groups.values());
}

/**
 * Calculate area severity rankings from a list of reports
 */
export function calculateAreaSeverity(
  reports: UserReport[],
  timeWindowHours: number = 168 // 7 days default
): AreaSeverityRanking[] {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);

  // Filter reports within time window (include both community and PAGASA reports)
  const recentReports = reports.filter(r => r.timestamp >= cutoffTime);

  // Group by area
  const groups = groupReportsByArea(recentReports);

  // Calculate score for each group
  const rankings: AreaSeverityRanking[] = groups.map(group => {
    const score = calculateSeverityScore(group.reports, now);
    const severity = assignSeverityLevel(score, group.reports, now);

    return {
      areaIdentifier: group.identifier,
      areaType: group.type,
      severity,
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      needsRescueCount: countNeedsRescue(group.reports),
      reportCounts: countReportsBySeverity(group.reports),
      latestReportAt: getLatestTimestamp(group.reports),
      bounds: calculateBounds(group.reports),
      coordinates: calculateCentroid(group.reports),
    };
  });

  // Sort by score descending
  return rankings.sort((a, b) => b.score - a.score);
}
