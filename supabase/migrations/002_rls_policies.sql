-- Enable Row Level Security
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagasa_cache ENABLE ROW LEVEL SECURITY;

-- Community Reports Policies

-- Allow public read access for non-deleted reports
CREATE POLICY "Public can read active reports"
  ON community_reports
  FOR SELECT
  USING (deleted_at IS NULL);

-- Allow public insert for community reports
CREATE POLICY "Public can insert community reports"
  ON community_reports
  FOR INSERT
  WITH CHECK (source = 'community');

-- Service role can do anything (for PAGASA data insertion and cache management)
CREATE POLICY "Service role has full access to reports"
  ON community_reports
  FOR ALL
  USING (auth.role() = 'service_role');

-- PAGASA Cache Policies

-- Service role only for cache writes
CREATE POLICY "Service role has full access to cache"
  ON pagasa_cache
  FOR ALL
  USING (auth.role() = 'service_role');

-- Allow public read access to cache (for client-side caching strategies)
CREATE POLICY "Public can read cache"
  ON pagasa_cache
  FOR SELECT
  USING (true);
