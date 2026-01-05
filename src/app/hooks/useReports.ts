import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import { getSupabaseClient } from '../lib/supabase';
import type { UserReport } from '../components/ReportForm';
import type { GetReportsQuery } from '../../../api/_lib/types';

interface UseReportsOptions {
  query?: GetReportsQuery;
  enableRealtime?: boolean;
}

interface UseReportsResult {
  reports: UserReport[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  hasMore: boolean;
  total: number;
}

export function useReports(options: UseReportsOptions = {}): UseReportsResult {
  const { query = {}, enableRealtime = true } = options;

  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.getReports(query);

      // Ensure timestamp is a Date object (API returns Date, but after JSON parsing it's a string)
      const reportsWithDates = response.reports.map(report => ({
        ...report,
        timestamp: report.timestamp instanceof Date
          ? report.timestamp
          : new Date(report.timestamp),
      }));

      // Only update state if data has actually changed (prevent unnecessary re-renders)
      setReports(prevReports => {
        // Compare by length and first/last report IDs
        if (prevReports.length !== reportsWithDates.length) {
          return reportsWithDates;
        }
        if (prevReports.length === 0) {
          return reportsWithDates;
        }
        // Check if first and last reports are the same (quick change detection)
        if (
          prevReports[0]?.id !== reportsWithDates[0]?.id ||
          prevReports[prevReports.length - 1]?.id !== reportsWithDates[reportsWithDates.length - 1]?.id
        ) {
          return reportsWithDates;
        }
        // No changes detected, return previous state to prevent re-render
        return prevReports;
      });

      setHasMore(response.hasMore);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch reports'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [query]);

  // Initial fetch
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Set up Supabase Broadcast (free tier, no replication needed)
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!enableRealtime || !supabase) {
      return;
    }

    // Subscribe to broadcast events when new reports are submitted
    const channel = supabase
      .channel('reports_broadcast')
      .on('broadcast', { event: 'new_report' }, (payload) => {
        console.log('New report broadcast received:', payload);
        // Refetch all reports when a new one is submitted
        fetchReports(true); // silent mode
      })
      .subscribe((status) => {
        console.log('Broadcast subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enableRealtime, fetchReports]);

  return {
    reports,
    loading,
    error,
    refetch: fetchReports,
    hasMore,
    total,
  };
}

// Helper to parse coordinates from PostGIS format
function parseCoordinates(coordsStr: string): [number, number] | undefined {
  try {
    if (coordsStr.startsWith('POINT')) {
      const match = /POINT\(([^ ]+) ([^ ]+)\)/.exec(coordsStr);
      if (match) {
        return [parseFloat(match[2]), parseFloat(match[1])]; // [lat, lng]
      }
    } else if (coordsStr.startsWith('{')) {
      const geojson = JSON.parse(coordsStr);
      if (geojson.type === 'Point' && Array.isArray(geojson.coordinates)) {
        return [geojson.coordinates[1], geojson.coordinates[0]]; // [lat, lng]
      }
    }
  } catch (e) {
    console.error('Failed to parse coordinates:', e);
  }
  return undefined;
}

// Helper to show notification for high/critical reports
function showReportNotification(report: UserReport) {
  // Check if browser supports notifications
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`${report.severity.toUpperCase()} Alert: ${report.type}`, {
      body: `${report.location}: ${report.description.substring(0, 100)}`,
      icon: '/favicon.ico',
      tag: report.id,
    });
  }
}
