import type { SubmitReportRequest } from './types.js';

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

  // Type/Severity are not provided by clients (computed server-side)

  // Description
  if (!report.description || typeof report.description !== 'string' || report.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (report.description.length > 2000) {
    errors.push({ field: 'description', message: 'Description must be less than 2000 characters' });
  }

  // Coordinates (required)
  if (!Array.isArray(report.coordinates) || report.coordinates.length !== 2) {
    errors.push({ field: 'coordinates', message: 'Coordinates are required as [latitude, longitude]' });
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
      description: (report.description as string).trim(),
      coordinates: report.coordinates as [number, number] | undefined,
      needsRescue: report.needsRescue as boolean | undefined,
    },
  };
}
