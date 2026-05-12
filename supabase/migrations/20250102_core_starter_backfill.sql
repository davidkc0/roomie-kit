-- Core starter compatibility backfill.
-- Safe no-op for fresh databases where 20241227_core_starter_schema.sql
-- already created these columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_config JSONB,
  ADD COLUMN IF NOT EXISTS friends_count INTEGER NOT NULL DEFAULT 0;
