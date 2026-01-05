import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface CorsHeaders {
  'Access-Control-Allow-Origin': string;
  'Access-Control-Allow-Methods': string;
  'Access-Control-Allow-Headers': string;
  'Access-Control-Max-Age'?: string;
}

export function getCorsHeaders(): CorsHeaders {
  return {
    'Access-Control-Allow-Origin': '*', // TODO: restrict in production
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

export type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse
) => Promise<void> | void;

export function withCors(handler: ApiHandler): ApiHandler {
  return async (req: VercelRequest, res: VercelResponse) => {
    // Set CORS headers
    const corsHeaders = getCorsHeaders();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Call the actual handler
    try {
      await handler(req, res);
    } catch (error) {
      console.error('API handler error:', error);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    }
  };
}
