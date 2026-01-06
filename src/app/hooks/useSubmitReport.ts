import { useState, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import type { ReportFormSubmission, UserReport } from '../components/ReportForm';
import type { SubmitReportRequest } from '../../../api/_lib/types';

interface UseSubmitReportResult {
  submitReport: (report: ReportFormSubmission) => Promise<UserReport | null>;
  submitting: boolean;
  error: Error | null;
}

export function useSubmitReport(): UseSubmitReportResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitReport = useCallback(
    async (report: ReportFormSubmission): Promise<UserReport | null> => {
      setSubmitting(true);
      setError(null);

      try {
        const request: SubmitReportRequest = {
          reporterName: report.reporterName,
          description: report.description,
          coordinates: report.coordinates,
          needsRescue: report.needsRescue,
        };

        const response = await apiClient.submitReport(request);

        if (!response.success || !response.report) {
          throw new Error(response.error || 'Failed to submit report');
        }

        return response.report;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error('Failed to submit report');
        setError(errorObj);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return {
    submitReport,
    submitting,
    error,
  };
}
