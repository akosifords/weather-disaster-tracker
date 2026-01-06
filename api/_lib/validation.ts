import type { AlertSeverity, AlertType, SubmitReportRequest } from './types.js';

// Philippines bounding box
const PH_BOUNDS = {
  north: 21.3,
  south: 4.5,
  east: 127.0,
  west: 116.0,
};

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateReportSubmission(
  data: unknown
): { valid: true; data: SubmitReportRequest } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: 'Request body must be an object' }] };
  }

  const report = data as Record<string, unknown>;

  // Reporter name
  if (!report.reporterName || typeof report.reporterName !== 'string' || report.reporterName.trim().length === 0) {
    errors.push({ field: 'reporterName', message: 'Reporter name is required' });
  } else if (report.reporterName.length > 200) {
    errors.push({ field: 'reporterName', message: 'Reporter name must be less than 200 characters' });
  }

  // Location
  if (!report.location || typeof report.location !== 'string' || report.location.trim().length === 0) {
    errors.push({ field: 'location', message: 'Location is required' });
  } else if (report.location.length > 500) {
    errors.push({ field: 'location', message: 'Location must be less than 500 characters' });
  }

  // Type (optional)
  const validTypes: AlertType[] = ['flood', 'fire', 'storm', 'wind', 'other'];
  if (report.type !== undefined && !validTypes.includes(report.type as AlertType)) {
    errors.push({ field: 'type', message: `Type must be one of: ${validTypes.join(', ')}` });
  }

  // Severity (optional)
  const validSeverities: AlertSeverity[] = ['low', 'medium', 'high', 'critical'];
  if (report.severity !== undefined && !validSeverities.includes(report.severity as AlertSeverity)) {
    errors.push({ field: 'severity', message: `Severity must be one of: ${validSeverities.join(', ')}` });
  }

  // Description
  if (!report.description || typeof report.description !== 'string' || report.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (report.description.length > 2000) {
    errors.push({ field: 'description', message: 'Description must be less than 2000 characters' });
  }

  // Optional coordinates
  if (report.coordinates !== undefined) {
    if (!Array.isArray(report.coordinates) || report.coordinates.length !== 2) {
      errors.push({ field: 'coordinates', message: 'Coordinates must be an array of [latitude, longitude]' });
    } else {
      const [lat, lng] = report.coordinates;

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        errors.push({ field: 'coordinates', message: 'Coordinates must be numbers' });
      } else if (
        lat < PH_BOUNDS.south ||
        lat > PH_BOUNDS.north ||
        lng < PH_BOUNDS.west ||
        lng > PH_BOUNDS.east
      ) {
        errors.push({
          field: 'coordinates',
          message: `Coordinates must be within Philippines bounds (${PH_BOUNDS.south}-${PH_BOUNDS.north}N, ${PH_BOUNDS.west}-${PH_BOUNDS.east}E)`,
        });
      }
    }
  }

  // Optional administrative fields
  if (report.barangay !== undefined && (typeof report.barangay !== 'string' || report.barangay.length > 200)) {
    errors.push({ field: 'barangay', message: 'Barangay must be a string less than 200 characters' });
  }

  if (report.city !== undefined && (typeof report.city !== 'string' || report.city.length > 200)) {
    errors.push({ field: 'city', message: 'City must be a string less than 200 characters' });
  }

  if (report.province !== undefined && (typeof report.province !== 'string' || report.province.length > 200)) {
    errors.push({ field: 'province', message: 'Province must be a string less than 200 characters' });
  }

  if (report.region !== undefined && (typeof report.region !== 'string' || report.region.length > 200)) {
    errors.push({ field: 'region', message: 'Region must be a string less than 200 characters' });
  }

  if (report.needsRescue !== undefined && typeof report.needsRescue !== 'boolean') {
    errors.push({ field: 'needsRescue', message: 'Needs rescue must be a boolean' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      reporterName: (report.reporterName as string).trim(),
      location: (report.location as string).trim(),
      type: report.type as AlertType | undefined,
      severity: report.severity as AlertSeverity | undefined,
      description: (report.description as string).trim(),
      coordinates: report.coordinates as [number, number] | undefined,
      barangay: report.barangay ? (report.barangay as string).trim() : undefined,
      city: report.city ? (report.city as string).trim() : undefined,
      province: report.province ? (report.province as string).trim() : undefined,
      region: report.region ? (report.region as string).trim() : undefined,
      needsRescue: report.needsRescue as boolean | undefined,
    },
  };
}
