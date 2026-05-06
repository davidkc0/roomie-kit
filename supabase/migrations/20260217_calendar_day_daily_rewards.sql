-- Per-User Timezone Daily Rewards
--
-- Replaces the old rolling 24h/48h window AND the UTC-only calendar day approach.
-- Each user's "day" is now relative to THEIR local midnight.
--
-- How it works:
--   - profiles.timezone stores the user's IANA timezone (e.g. 'America/Los_Angeles')
--   - "today" and "yesterday" are computed in the user's timezone
--   - Claimed today (in their timezone)? → not eligible
--   - Claimed yesterday? → streak continues
--   - Missed a day? → streak resets
--
-- Day 0 guard preserved: new accounts wait 24h before first claim.

-- ============================================================
-- 1. Add timezone column to profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- ============================================================
-- 2. check_daily_reward (read-only eligibility check)
-- ============================================================
CREATE OR REPLACE FUNCTION check_daily_reward(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_claim timestamp;
  v_streak int;
  v_pending_streak int;
  v_base_reward int;
  v_milestone_bonus int := 0;
  v_user_tz text;
  v_today date;
  v_last_claim_date date;
  v_eligible boolean := false;
  v_account_created timestamp;
BEGIN
  -- Get user's timezone (default to America/New_York if not set)
  SELECT COALESCE(timezone, 'America/New_York') INTO v_user_tz
  FROM profiles WHERE id = p_user_id;

  -- Calculate "today" in the user's local timezone
  v_today := (now() AT TIME ZONE COALESCE(v_user_tz, 'America/New_York'))::date;

  -- Get account creation date from auth.users
  SELECT created_at INTO v_account_created FROM auth.users WHERE id = p_user_id;

  -- Get current streak info
  SELECT last_daily_claim, streak_days
  INTO v_last_claim, v_streak
  FROM user_coins
  WHERE user_id = p_user_id;

  -- CASE 1: Never claimed before (new user)
  IF v_last_claim IS NULL THEN
    -- Must wait 24h after account creation (Day 0 guard)
    IF v_account_created IS NOT NULL AND v_account_created < (now() - interval '24 hours') THEN
      v_eligible := true;
      v_pending_streak := 1;
    ELSE
      v_eligible := false;
      v_pending_streak := 0;
    END IF;
  ELSE
    -- Convert last_claim to the user's local date
    v_last_claim_date := (v_last_claim AT TIME ZONE 'UTC' AT TIME ZONE v_user_tz)::date;

    IF v_last_claim_date = v_today THEN
      -- Already claimed today (in their timezone)
      v_eligible := false;
      v_pending_streak := v_streak;
    ELSIF v_last_claim_date = v_today - 1 THEN
      -- Claimed yesterday → streak continues
      v_eligible := true;
      v_pending_streak := v_streak + 1;
    ELSE
      -- Missed a day (or more) → streak resets
      v_eligible := true;
      v_pending_streak := 1;
    END IF;
  END IF;

  -- If not eligible, return early
  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'streak', COALESCE(v_streak, 0),
      'pending_streak', v_pending_streak,
      'reward', 0
    );
  END IF;

  -- Calculate base reward for pending_streak
  IF v_pending_streak <= 2 THEN
    v_base_reward := 5;
  ELSIF v_pending_streak <= 4 THEN
    v_base_reward := 8;
  ELSIF v_pending_streak <= 6 THEN
    v_base_reward := 10;
  ELSIF v_pending_streak <= 30 THEN
    v_base_reward := 15;
  ELSIF v_pending_streak <= 100 THEN
    v_base_reward := 20;
  ELSE
    v_base_reward := 25;
  END IF;

  -- Calculate milestone bonus
  IF v_pending_streak = 3 THEN v_milestone_bonus := 10;
  ELSIF v_pending_streak = 7 THEN v_milestone_bonus := 25;
  ELSIF v_pending_streak = 14 THEN v_milestone_bonus := 50;
  ELSIF v_pending_streak = 30 THEN v_milestone_bonus := 100;
  ELSIF v_pending_streak = 60 THEN v_milestone_bonus := 200;
  ELSIF v_pending_streak = 100 THEN v_milestone_bonus := 500;
  ELSIF v_pending_streak = 365 THEN v_milestone_bonus := 1000;
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'streak', COALESCE(v_streak, 0),
    'pending_streak', v_pending_streak,
    'base_reward', v_base_reward,
    'milestone_bonus', v_milestone_bonus,
    'reward', v_base_reward + v_milestone_bonus
  );
END;
$$;

-- ============================================================
-- 3. claim_daily_coins (write — actually claims the reward)
-- ============================================================
CREATE OR REPLACE FUNCTION claim_daily_coins(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_claim timestamp;
  v_streak int;
  v_base_reward int;
  v_milestone_bonus int := 0;
  v_now timestamp := now();
  v_user_tz text;
  v_today date;
  v_last_claim_date date;
  v_next_milestone_day int;
  v_next_milestone_bonus int;
  v_account_created timestamp;
BEGIN
  -- Get user's timezone
  SELECT COALESCE(timezone, 'America/New_York') INTO v_user_tz
  FROM profiles WHERE id = p_user_id;

  -- Calculate "today" in the user's local timezone
  v_today := (v_now AT TIME ZONE COALESCE(v_user_tz, 'America/New_York'))::date;

  -- Get account creation date from auth.users
  SELECT created_at INTO v_account_created FROM auth.users WHERE id = p_user_id;

  -- Ensure user has a row in user_coins (upsert)
  INSERT INTO user_coins (user_id, balance, streak_days, last_daily_claim)
  VALUES (p_user_id, 0, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current streak info
  SELECT last_daily_claim, streak_days
  INTO v_last_claim, v_streak
  FROM user_coins
  WHERE user_id = p_user_id;

  -- CASE 1: Never claimed before — enforce 24h after account creation
  IF v_last_claim IS NULL THEN
    IF v_account_created IS NULL OR v_account_created >= (v_now - interval '24 hours') THEN
      RAISE EXCEPTION 'Account too new for daily rewards';
    END IF;
    v_streak := 1;
  ELSE
    -- Convert last_claim to the user's local date
    v_last_claim_date := (v_last_claim AT TIME ZONE 'UTC' AT TIME ZONE v_user_tz)::date;

    -- Already claimed today (in their timezone)
    IF v_last_claim_date = v_today THEN
      RAISE EXCEPTION 'Already claimed today';
    -- Claimed yesterday → continue streak
    ELSIF v_last_claim_date = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    -- Missed a day → streak resets
    ELSE
      v_streak := 1;
    END IF;
  END IF;

  -- Calculate base reward
  IF v_streak <= 2 THEN
    v_base_reward := 5;
  ELSIF v_streak <= 4 THEN
    v_base_reward := 8;
  ELSIF v_streak <= 6 THEN
    v_base_reward := 10;
  ELSIF v_streak <= 30 THEN
    v_base_reward := 15;
  ELSIF v_streak <= 100 THEN
    v_base_reward := 20;
  ELSE
    v_base_reward := 25;
  END IF;

  -- Calculate milestone bonus
  IF v_streak = 3 THEN v_milestone_bonus := 10;
  ELSIF v_streak = 7 THEN v_milestone_bonus := 25;
  ELSIF v_streak = 14 THEN v_milestone_bonus := 50;
  ELSIF v_streak = 30 THEN v_milestone_bonus := 100;
  ELSIF v_streak = 60 THEN v_milestone_bonus := 200;
  ELSIF v_streak = 100 THEN v_milestone_bonus := 500;
  ELSIF v_streak = 365 THEN v_milestone_bonus := 1000;
  END IF;

  -- Update streak info in DB (store timestamp in UTC as always)
  UPDATE user_coins
  SET
    last_daily_claim = v_now,
    streak_days = v_streak,
    updated_at = v_now
  WHERE user_id = p_user_id;

  -- Add coins (Base + Bonus)
  PERFORM modify_coins(
    p_user_id,
    v_base_reward + v_milestone_bonus,
    'daily_login',
    jsonb_build_object(
      'streak', v_streak,
      'base', v_base_reward,
      'bonus', v_milestone_bonus
    )
  );

  -- Calculate next milestone for UI return
  IF v_streak < 3 THEN v_next_milestone_day := 3; v_next_milestone_bonus := 10;
  ELSIF v_streak < 7 THEN v_next_milestone_day := 7; v_next_milestone_bonus := 25;
  ELSIF v_streak < 14 THEN v_next_milestone_day := 14; v_next_milestone_bonus := 50;
  ELSIF v_streak < 30 THEN v_next_milestone_day := 30; v_next_milestone_bonus := 100;
  ELSIF v_streak < 60 THEN v_next_milestone_day := 60; v_next_milestone_bonus := 200;
  ELSIF v_streak < 100 THEN v_next_milestone_day := 100; v_next_milestone_bonus := 500;
  ELSIF v_streak < 365 THEN v_next_milestone_day := 365; v_next_milestone_bonus := 1000;
  END IF;

  RETURN jsonb_build_object(
    'reward', v_base_reward + v_milestone_bonus,
    'base_reward', v_base_reward,
    'milestone_bonus', v_milestone_bonus,
    'streak', v_streak,
    'next_milestone_day', v_next_milestone_day,
    'next_milestone_bonus', v_next_milestone_bonus
  );
END;
$$;

-- ============================================================
-- 4. Add streak_reminders to notification_preferences
-- ============================================================
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS streak_reminders BOOLEAN DEFAULT true;

-- ============================================================
-- 5. RPC helper for the streak-reminder-cron Edge Function
--    Returns users who might need a streak reminder.
--    The Edge Function handles timezone hour checks + OneSignal.
-- ============================================================
CREATE OR REPLACE FUNCTION get_streak_reminder_candidates()
RETURNS TABLE(
  user_id uuid,
  streak_days int,
  last_daily_claim timestamp,
  user_tz text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.user_id,
    uc.streak_days,
    uc.last_daily_claim,
    COALESCE(p.timezone, 'America/New_York') AS user_tz
  FROM user_coins uc
  JOIN profiles p ON p.id = uc.user_id
  LEFT JOIN push_tokens pt ON pt.user_id = uc.user_id
  LEFT JOIN notification_preferences np ON np.user_id = uc.user_id
  WHERE uc.streak_days >= 2
    AND uc.last_daily_claim IS NOT NULL
    AND pt.onesignal_player_id IS NOT NULL
    AND COALESCE(np.streak_reminders, true) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_streak_reminder_candidates TO service_role;

-- ============================================================
-- 6. Streak reminder notifications are handled by the
--    streak-reminder-cron Edge Function (scheduled hourly
--    via cron-job.org or Supabase Dashboard).
-- ============================================================
