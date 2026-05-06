-- Update gift gem values to be 85% of the cost (Streamer gets 85%, Platform keeps 15%)
-- Migration: 20260130_update_payout_split.sql

-- Update all existing gifts to use 85% payout
UPDATE gifts SET gem_value = CAST(cost * 0.85 AS INTEGER);

-- Add a comment for future reference
COMMENT ON COLUMN gifts.gem_value IS 'Gems earned by recipient (85% of cost, platform keeps 15%)';
