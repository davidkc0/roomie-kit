-- Whiteboard Persistence
-- Stores whiteboard drawing data per room with auto-expiry on read (24h TTL)

CREATE TABLE IF NOT EXISTS whiteboard_data (
  room_id text PRIMARY KEY,
  strokes jsonb NOT NULL DEFAULT '[]',
  version int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE whiteboard_data ENABLE ROW LEVEL SECURITY;

-- Anyone can read whiteboard data
CREATE POLICY "Anyone can read whiteboard data"
  ON whiteboard_data
  FOR SELECT
  USING (true);

-- Authenticated users can insert/update whiteboard data
CREATE POLICY "Authenticated users can insert whiteboard data"
  ON whiteboard_data
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update whiteboard data"
  ON whiteboard_data
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
