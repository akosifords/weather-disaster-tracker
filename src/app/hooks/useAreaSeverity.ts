import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import type { AreaSeverityRanking, GetAreaSeverityQuery } from '../../../api/_lib/types';

interface UseAreaSeverityOptions {
  query?: GetAreaSeverityQuery;
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
}

interface UseAreaSeverityResult {
  rankings: AreaSeverityRanking[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  calculatedAt: Date | null;
}

export function useAreaSeverity(options: UseAreaSeverityOptions = {}): UseAreaSeverityResult {
  const { query = {}, autoRefresh = false, refreshInterval = 5 * 60 * 1000 } = options;

  const [rankings, setRankings] = useState<AreaSeverityRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [calculatedAt, setCalculatedAt] = useState<Date | null>(null);

  const fetchRankings = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.getAreaSeverity(query);

      // Convert calculatedAt to Date if it's a string
      const calcDate = response.calculatedAt instanceof Date
        ? response.calculatedAt
        : new Date(response.calculatedAt);

      // Convert latestReportAt strings to Dates in rankings
      const rankingsWithDates = response.rankings.map(ranking => ({
        ...ranking,
        latestReportAt: ranking.latestReportAt instanceof Date
          ? ranking.latestReportAt
          : new Date(ranking.latestReportAt),
      }));

      // Only update state if data has actually changed (prevent unnecessary re-renders)
      setRankings(prevRankings => {
        // Compare by length and first ranking
        if (prevRankings.length !== rankingsWithDates.length) {
          return rankingsWithDates;
        }
        if (prevRankings.length === 0) {
          return rankingsWithDates;
        }
        // Check if first ranking is the same (quick change detection)
        if (
          prevRankings[0]?.areaIdentifier !== rankingsWithDates[0]?.areaIdentifier ||
          prevRankings[0]?.score !== rankingsWithDates[0]?.score
        ) {
          return rankingsWithDates;
        }
        // No changes detected, return previous state to prevent re-render
        return prevRankings;
      });

      setCalculatedAt(calcDate);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch area severity'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [query]);

  // Initial fetch
  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  // Auto-refresh interval (silent mode to avoid loading spinners)
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      fetchRankings(true); // silent = true
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, fetchRankings]);

  return {
    rankings,
    loading,
    error,
    refetch: fetchRankings,
    calculatedAt,
  };
}
