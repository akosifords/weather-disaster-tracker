// API Client for backend communication

import type {
  SubmitReportRequest,
  SubmitReportResponse,
  GetReportsQuery,
  GetReportsResponse,
  GetAreaSeverityQuery,
  GetAreaSeverityResponse,
} from '../../../api/_lib/types';

// Get API base URL from environment or use current host
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new Error(error.error || `Request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Submit a new community report
   */
  async submitReport(
    report: SubmitReportRequest
  ): Promise<SubmitReportResponse> {
    return this.request<SubmitReportResponse>('/api/reports/submit', {
      method: 'POST',
      body: JSON.stringify(report),
    });
  }

  /**
   * Get reports with optional filters
   */
  async getReports(query: GetReportsQuery = {}): Promise<GetReportsResponse> {
    const params = new URLSearchParams();

    if (query.since) params.set('since', query.since);
    if (query.limit !== undefined) params.set('limit', query.limit.toString());
    if (query.offset !== undefined) params.set('offset', query.offset.toString());

    const queryString = params.toString();
    const endpoint = `/api/reports${queryString ? `?${queryString}` : ''}`;

    return this.request<GetReportsResponse>(endpoint);
  }

  /**
   * Get area severity rankings
   */
  async getAreaSeverity(
    query: GetAreaSeverityQuery = {}
  ): Promise<GetAreaSeverityResponse> {
    const params = new URLSearchParams();

    if (query.areaType) params.set('areaType', query.areaType);
    if (query.timeWindowHours !== undefined)
      params.set('timeWindowHours', query.timeWindowHours.toString());
    if (query.limit !== undefined) params.set('limit', query.limit.toString());

    const queryString = params.toString();
    const endpoint = `/api/areas/severity${queryString ? `?${queryString}` : ''}`;

    return this.request<GetAreaSeverityResponse>(endpoint);
  }

  /**
   * Get cached PAGASA data
   */
  async getCachedPagasaData(
    endpoint: 'lightning' | 'current_weather'
  ): Promise<any> {
    return this.request<any>(
      `/api/pagasa/cached?endpoint=${endpoint}`
    );
  }

  /**
   * Health check
   */
  async checkHealth(): Promise<{
    success: boolean;
    status: string;
    timestamp: string;
    database: string;
  }> {
    return this.request<any>('/api/health');
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
