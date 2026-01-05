-- Add rescue flag for stranded reports
ALTER TABLE community_reports
  ADD COLUMN needs_rescue BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_community_reports_needs_rescue
  ON community_reports(needs_rescue)
  WHERE deleted_at IS NULL;
