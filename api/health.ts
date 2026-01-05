import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from './_lib/cors.js';
import { supabaseAdmin } from './_lib/supabase.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    // Test database connection
    const { data, error } = await supabaseAdmin
      .from('community_reports')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Database health check failed:', error);
      res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: error.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withCors(handler);
