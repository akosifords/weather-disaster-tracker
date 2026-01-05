-- Enable Realtime for community_reports table
-- This allows clients to subscribe to INSERT/UPDATE/DELETE events via WebSocket

ALTER PUBLICATION supabase_realtime ADD TABLE community_reports;

-- Verify Realtime is enabled
-- You can check in Supabase Dashboard > Database > Replication
