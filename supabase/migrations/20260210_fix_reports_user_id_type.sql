-- Fix: reported_user_id must accept Playroom player IDs (not just Supabase UUIDs)
-- Chat messages only carry Playroom IDs, not Supabase user IDs.

-- Drop the FK constraint and self-report constraint
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reported_user_id_fkey,
  DROP CONSTRAINT IF EXISTS reports_not_self;

-- Change column type from uuid to text to accept any identifier
ALTER TABLE public.reports
  ALTER COLUMN reported_user_id TYPE text USING reported_user_id::text;
