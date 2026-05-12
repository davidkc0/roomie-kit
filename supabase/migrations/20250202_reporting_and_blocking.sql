-- ============================================================
-- UGC Reporting & Blocking System
-- Apple App Store compliance: report mechanism + user blocking
-- ============================================================

-- Reports table: stores user-submitted reports of objectionable content
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,              -- 'harassment', 'inappropriate_content', 'spam', 'other'
  context_type text NOT NULL,        -- 'chat', 'profile', 'whiteboard', 'stream'
  context_detail text,               -- optional: message text, room slug, player IDs, etc.
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'reviewed', 'actioned', 'dismissed'
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT reports_reason_check CHECK (reason IN ('harassment', 'inappropriate_content', 'spam', 'other')),
  CONSTRAINT reports_context_type_check CHECK (context_type IN ('chat', 'profile', 'whiteboard', 'stream')),
  CONSTRAINT reports_status_check CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  CONSTRAINT reports_not_self CHECK (reporter_id != reported_user_id)
);

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON public.reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

-- Blocked users table: one-directional blocking
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_not_self CHECK (blocker_id != blocked_id)
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Reports: users can insert their own reports
CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Reports: users can view their own reports
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Blocked users: users can read their own block list
CREATE POLICY "Users can view own blocks"
  ON public.blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

-- Blocked users: users can insert their own blocks
CREATE POLICY "Users can create blocks"
  ON public.blocked_users FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Blocked users: users can delete their own blocks (unblock)
CREATE POLICY "Users can delete own blocks"
  ON public.blocked_users FOR DELETE
  USING (auth.uid() = blocker_id);

-- ============================================================
-- Helper function
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_blocked(check_blocker uuid, check_blocked uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE blocker_id = check_blocker AND blocked_id = check_blocked
  );
$$;
