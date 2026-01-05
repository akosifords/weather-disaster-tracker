import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../_lib/cors.js';
import { supabaseAdmin } from '../_lib/supabase.js';

// PAGASA API base URL (updated to new domain)
const PAGASA_BASE_URL = 'https://bagong.pagasa.dost.gov.ph';

// Cache TTL in seconds
const CACHE_TTL = 60;

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const endpoint = req.query.endpoint as string;

    if (!endpoint || (endpoint !== 'lightning' && endpoint !== 'current_weather')) {
      res.status(400).json({
        success: false,
        error: 'Invalid endpoint. Must be "lightning" or "current_weather"',
      });
      return;
    }

    // Check cache
    const { data: cached, error: cacheError } = await supabaseAdmin
      .from('pagasa_cache')
      .select('*')
      .eq('endpoint', endpoint)
      .single();

    const now = new Date();

    // Cache hit and not expired
    if (cached && !cacheError && new Date(cached.expires_at) > now) {
      // Update hit count
      await supabaseAdmin
        .from('pagasa_cache')
        .update({
          hit_count: cached.hit_count + 1,
          last_hit_at: now.toISOString(),
        })
        .eq('id', cached.id);

      res.status(200).json({
        success: true,
        data: cached.data,
        cached: true,
        cachedAt: cached.cached_at,
      });
      return;
    }

    // Cache miss - fetch from PAGASA
    const apiPath = endpoint === 'lightning' ? '/api/Lightning' : '/api/CurrentWeather';

    let data;
    try {
      console.log(`Fetching PAGASA data from: ${PAGASA_BASE_URL}${apiPath}`);

      const pagasaRes = await fetch(`${PAGASA_BASE_URL}${apiPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });

      console.log(`PAGASA API response status: ${pagasaRes.status}`);

      if (!pagasaRes.ok) {
        throw new Error(`PAGASA API returned ${pagasaRes.status}`);
      }

      // Get response text first to check if it's valid JSON
      const responseText = await pagasaRes.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('PAGASA API returned empty response');
      }

      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('PAGASA JSON parse error. Response text:', responseText.substring(0, 200));
        throw new Error(`PAGASA API returned invalid JSON: ${jsonError instanceof Error ? jsonError.message : 'parse error'}`);
      }
    } catch (fetchError) {
      console.error('PAGASA fetch error:', fetchError);

      // If PAGASA fetch fails and we have stale cache, return it
      if (cached && cached.data) {
        console.warn('PAGASA API failed, returning stale cache');
        res.status(200).json({
          success: true,
          data: cached.data,
          cached: true,
          stale: true,
          cachedAt: cached.cached_at,
          error: fetchError instanceof Error ? fetchError.message : 'PAGASA API unavailable',
        });
        return;
      }

      // No cache available, return error
      throw fetchError;
    }

    // Store in cache
    const expiresAt = new Date(now.getTime() + CACHE_TTL * 1000);

    if (cached) {
      // Update existing cache entry
      await supabaseAdmin
        .from('pagasa_cache')
        .update({
          data,
          cached_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          hit_count: cached.hit_count + 1,
          last_hit_at: now.toISOString(),
        })
        .eq('id', cached.id);
    } else {
      // Insert new cache entry
      await supabaseAdmin.from('pagasa_cache').insert([
        {
          endpoint,
          data,
          cached_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          hit_count: 1,
          last_hit_at: now.toISOString(),
        },
      ]);
    }

    res.status(200).json({
      success: true,
      data,
      cached: false,
      cachedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('PAGASA cached API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default withCors(handler);
