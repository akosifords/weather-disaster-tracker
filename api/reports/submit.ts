import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../_lib/cors.js';
import { supabaseAdmin } from '../_lib/supabase.js';
import { validateReportSubmission } from '../_lib/validation.js';
import { dbRecordToUserReport, userReportToDbRecord } from '../_lib/types.js';
import type { SubmitReportResponse, CommunityReportRecord } from '../_lib/types.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    // Validate request body
    const validation = validateReportSubmission(req.body);

    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors,
      });
      return;
    }

    const { data: validData } = validation;

    // Convert to database record format
    const dbRecord = userReportToDbRecord(validData);

    // Insert into database
    const { data, error } = await supabaseAdmin
      .from('community_reports')
      .insert([
        {
          ...dbRecord,
          source: 'community',
          timestamp: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save report',
        details: error.message,
      });
      return;
    }

    // Convert back to UserReport format
    const report = dbRecordToUserReport(data as CommunityReportRecord);

    // Broadcast to all connected clients via Supabase Broadcast (free tier)
    try {
      await supabaseAdmin
        .channel('reports_broadcast')
        .send({
          type: 'broadcast',
          event: 'new_report',
          payload: { reportId: report.id },
        });
      console.log('Broadcast sent for new report:', report.id);
    } catch (broadcastError) {
      // Don't fail the request if broadcast fails
      console.warn('Failed to broadcast new report:', broadcastError);
    }

    const response: SubmitReportResponse = {
      success: true,
      report,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withCors(handler);
