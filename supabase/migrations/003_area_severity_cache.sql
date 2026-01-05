-- Area Severity Cache Table
-- Stores pre-calculated area severity rankings for performance
CREATE TABLE area_severity_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Area Identification
  area_type TEXT NOT NULL CHECK (area_type IN ('barangay', 'city', 'province', 'region', 'cluster')),
  area_identifier TEXT NOT NULL,

  -- Calculated Severity
  calculated_severity alert_severity NOT NULL,
  severity_score DECIMAL(10, 2) NOT NULL,

  -- Report Counts by Severity
  report_count_critical INTEGER NOT NULL DEFAULT 0,
  report_count_high INTEGER NOT NULL DEFAULT 0,
  report_count_medium INTEGER NOT NULL DEFAULT 0,
  report_count_low INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  latest_report_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Geographic Bounds (for mapping)
  bounds GEOMETRY(POLYGON, 4326),

  -- Unique constraint on area type + identifier
  UNIQUE(area_type, area_identifier)
);

-- Indexes for area_severity_cache
CREATE INDEX idx_area_severity_type_score ON area_severity_cache(area_type, severity_score DESC);
CREATE INDEX idx_area_severity_identifier ON area_severity_cache(area_identifier);
CREATE INDEX idx_area_severity_calculated_at ON area_severity_cache(calculated_at DESC);
CREATE INDEX idx_area_severity_bounds ON area_severity_cache USING GIST(bounds);

-- Enable RLS
ALTER TABLE area_severity_cache ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public can read area severity cache"
  ON area_severity_cache
  FOR SELECT
  USING (true);

-- Service role can write
CREATE POLICY "Service role has full access to area severity cache"
  ON area_severity_cache
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE area_severity_cache IS 'Pre-calculated area severity rankings based on report clustering';
COMMENT ON COLUMN area_severity_cache.severity_score IS 'Weighted score calculated from reports (higher = more severe)';
COMMENT ON COLUMN area_severity_cache.bounds IS 'Geographic bounding box for the area';
