import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../_lib/cors.js';
import { supabaseAdmin } from '../_lib/supabase.js';
import { dbRecordToUserReport } from '../_lib/types.js';
import { calculateAreaSeverity, calculateSeverityForLocation } from '../_lib/severity.js';
import type { GetAreaSeverityResponse, GetAreaSeverityQuery, CommunityReportRecord } from '../_lib/types.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const query: GetAreaSeverityQuery = {
      timeWindowHours: parseInt((req.query.timeWindowHours as string) || '168'), // 7 days default
      limit: parseInt((req.query.limit as string) || '50'),
    };

    // Validate parameters
    if (query.timeWindowHours! > 720) query.timeWindowHours = 720; // Max 30 days
    if (query.timeWindowHours! < 1) query.timeWindowHours = 1;
    if (query.limit! > 100) query.limit = 100;
    if (query.limit! < 1) query.limit = 1;

    // Calculate cutoff time
    const cutoffTime = new Date(Date.now() - query.timeWindowHours! * 60 * 60 * 1000);

    // Check cache first
    const cacheKey = `area_severity:${query.areaType || 'all'}:${query.timeWindowHours}`;
    const cacheExpiry = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    const { data: cached } = await supabaseAdmin
      .from('area_severity_cache')
      .select('*')
      .gte('calculated_at', cacheExpiry.toISOString())
      .limit(1)
      .single();

    // If cache hit, return cached results
    if (cached && cached.calculated_at) {
      // Fetch cached rankings (this would need a separate cache table in production)
      // For now, fall through to calculation
    }

    // Fetch reports from database
    let dbQuery = supabaseAdmin
      .from('community_reports')
      .select('*')
      .is('deleted_at', null)
      .gte('timestamp', cutoffTime.toISOString())
      .order('timestamp', { ascending: false });

    if (query.areaType) {
      // Filter by area type if specified
      // Note: This would require additional database columns or logic
    }

    const { data, error } = await dbQuery;

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
    const baseReports = (data as CommunityReportRecord[]).map(dbRecordToUserReport);
    const now = new Date();
    const reports = baseReports.map((report) => ({
      ...report,
      severity: calculateSeverityForLocation(baseReports, report.coordinates, now),
    }));

    // Calculate severity rankings
    const rankings = calculateAreaSeverity(reports, query.timeWindowHours);

    // Apply limit
    const limitedRankings = rankings.slice(0, query.limit);

    const response: GetAreaSeverityResponse = {
      rankings: limitedRankings,
      calculatedAt: new Date(),
    };

    // TODO: Cache results in area_severity_cache table

    res.status(200).json(response);
  } catch (error) {
    console.error('Get area severity error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withCors(handler);
