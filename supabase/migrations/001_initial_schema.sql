-- Enable PostGIS extension for geographic data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create ENUM types for severity and disaster types
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE disaster_type AS ENUM ('flood', 'fire', 'storm', 'wind', 'other');
CREATE TYPE report_source AS ENUM ('community', 'pagasa');

-- Community Reports Table
CREATE TABLE community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reporter Information
  reporter_name TEXT NOT NULL,

  -- Location Information
  location TEXT NOT NULL,
  barangay TEXT,
  city TEXT,
  province TEXT,
  region TEXT,
  coordinates GEOGRAPHY(POINT, 4326) NOT NULL,

  -- Report Details
  type disaster_type NOT NULL,
  severity alert_severity NOT NULL,
  description TEXT NOT NULL,

  -- Source Tracking
  source report_source NOT NULL DEFAULT 'community',
  external_id TEXT,
  source_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for community_reports
CREATE INDEX idx_community_reports_timestamp ON community_reports(timestamp DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_community_reports_severity ON community_reports(severity) WHERE deleted_at IS NULL;
CREATE INDEX idx_community_reports_type ON community_reports(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_community_reports_coordinates ON community_reports USING GIST(coordinates) WHERE deleted_at IS NULL;
CREATE INDEX idx_community_reports_query ON community_reports(severity, type, timestamp DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_community_reports_barangay ON community_reports(barangay) WHERE deleted_at IS NULL AND barangay IS NOT NULL;
CREATE INDEX idx_community_reports_city ON community_reports(city) WHERE deleted_at IS NULL AND city IS NOT NULL;
CREATE INDEX idx_community_reports_area_time ON community_reports(barangay, city, timestamp DESC) WHERE deleted_at IS NULL;

-- PAGASA Cache Table
CREATE TABLE pagasa_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ
);

-- Index for cache expiration checks
CREATE INDEX idx_pagasa_cache_endpoint ON pagasa_cache(endpoint);
CREATE INDEX idx_pagasa_cache_expires ON pagasa_cache(expires_at);

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_community_reports_updated_at
  BEFORE UPDATE ON community_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE community_reports IS 'Stores disaster reports from community members and PAGASA';
COMMENT ON TABLE pagasa_cache IS 'Caches PAGASA API responses to reduce external API calls';
COMMENT ON COLUMN community_reports.coordinates IS 'Geographic coordinates as PostGIS GEOGRAPHY type (lon, lat)';
COMMENT ON COLUMN community_reports.deleted_at IS 'Soft delete timestamp - NULL means active';
