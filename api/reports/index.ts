import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../_lib/cors.js';
import { supabaseAdmin } from '../_lib/supabase.js';
import { dbRecordToUserReport } from '../_lib/types.js';
import type { GetReportsResponse, GetReportsQuery, CommunityReportRecord } from '../_lib/types.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const query: GetReportsQuery = {
      limit: parseInt((req.query.limit as string) || '100'),
      offset: parseInt((req.query.offset as string) || '0'),
    };

    // Validate limit
    if (query.limit! > 500) query.limit = 500;
    if (query.limit! < 1) query.limit = 1;

    // Build query
    let dbQuery = supabaseAdmin
      .from('community_reports')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .order('timestamp', { ascending: false });

    // Apply filters
    if (req.query.severity) {
      const severities = Array.isArray(req.query.severity)
        ? req.query.severity
        : [req.query.severity];
      dbQuery = dbQuery.in('severity', severities);
    }

    if (req.query.type) {
      const types = Array.isArray(req.query.type) ? req.query.type : [req.query.type];
      dbQuery = dbQuery.in('type', types);
    }

    if (req.query.since) {
      dbQuery = dbQuery.gte('timestamp', req.query.since);
    }

    if (req.query.barangay) {
      dbQuery = dbQuery.eq('barangay', req.query.barangay);
    }

    if (req.query.city) {
      dbQuery = dbQuery.eq('city', req.query.city);
    }

    // Apply pagination
    dbQuery = dbQuery.range(query.offset!, query.offset! + query.limit! - 1);

    // Execute query
    const { data, error, count } = await dbQuery;

    if (error) {
      console.error('Database query error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reports',
        details: error.message,
      });
      return;
    }

    // Convert to UserReport format
    const reports = (data as CommunityReportRecord[]).map(dbRecordToUserReport);

    const response: GetReportsResponse = {
      reports,
      total: count || 0,
      hasMore: (count || 0) > query.offset! + query.limit!,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withCors(handler);
