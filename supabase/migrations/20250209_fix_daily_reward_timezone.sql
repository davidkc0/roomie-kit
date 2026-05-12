-- Fix Daily Reward Timezone Bug
--
-- Root cause: Both RPCs hardcoded 'America/New_York' as the user's timezone.
-- Users in other timezones had their "today"/"yesterday" calculated wrong,
-- causing streaks to reset incorrectly.
--
-- Fix: Accept the user's device-detected timezone from the client
-- as a parameter (p_timezone). The client sends
-- Intl.DateTimeFormat().resolvedOptions().timeZone (e.g. 'America/Los_Angeles').
--
-- Server stores everything in UTC. Calendar-day logic uses the CLIENT's timezone.

-- ============================================================
-- 1. check_daily_reward — now accepts p_timezone from client
-- ============================================================
CREATE OR REPLACE FUNCTION check_daily_reward(p_user_id uuid, p_timezone text DEFAULT 'America/New_York')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_claim timestamptz;
  v_streak int;
  v_pending_streak int;
  v_base_reward int;
  v_milestone_bonus int := 0;
  v_tz text;
  v_today date;
  v_last_claim_date date;
  v_eligible boolean := false;
  v_account_created timestamptz;
BEGIN
  -- Use client-provided timezone, fallback to New York
  v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'America/New_York');

  -- Validate timezone — if invalid, fall back
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'America/New_York';
  END;

  -- "today" in the user's local timezone
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- Account creation date
  SELECT created_at INTO v_account_created FROM auth.users WHERE id = p_user_id;

  -- Current streak info
  SELECT last_daily_claim, streak_days
  INTO v_last_claim, v_streak
  FROM user_coins
  WHERE user_id = p_user_id;

  -- CASE 1: Never claimed (new user)
  IF v_last_claim IS NULL THEN
    IF v_account_created IS NOT NULL AND v_account_created < (now() - interval '24 hours') THEN
      v_eligible := true;
      v_pending_streak := 1;
    ELSE
      v_eligible := false;
      v_pending_streak := 0;
    END IF;
  ELSE
    -- Convert stored UTC claim time to user's local date
    v_last_claim_date := (v_last_claim AT TIME ZONE v_tz)::date;

    IF v_last_claim_date = v_today THEN
      -- Already claimed today
      v_eligible := false;
      v_pending_streak := v_streak;
    ELSIF v_last_claim_date = v_today - 1 THEN
      -- Claimed yesterday → streak continues
      v_eligible := true;
      v_pending_streak := v_streak + 1;
    ELSE
      -- Missed a day → reset
      v_eligible := true;
      v_pending_streak := 1;
    END IF;
  END IF;

  -- Not eligible → return early
  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'streak', COALESCE(v_streak, 0),
      'pending_streak', v_pending_streak,
      'reward', 0
    );
  END IF;

  -- Base reward
  IF v_pending_streak <= 2 THEN v_base_reward := 5;
  ELSIF v_pending_streak <= 4 THEN v_base_reward := 8;
  ELSIF v_pending_streak <= 6 THEN v_base_reward := 10;
  ELSIF v_pending_streak <= 30 THEN v_base_reward := 15;
  ELSIF v_pending_streak <= 100 THEN v_base_reward := 20;
  ELSE v_base_reward := 25;
  END IF;

  -- Milestone bonus
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
-- 2. claim_daily_coins — now accepts p_timezone from client
-- ============================================================
CREATE OR REPLACE FUNCTION claim_daily_coins(p_user_id uuid, p_timezone text DEFAULT 'America/New_York')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_claim timestamptz;
  v_streak int;
  v_base_reward int;
  v_milestone_bonus int := 0;
  v_tz text;
  v_today date;
  v_last_claim_date date;
  v_next_milestone_day int;
  v_next_milestone_bonus int;
  v_account_created timestamptz;
BEGIN
  -- Use client-provided timezone, fallback
  v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'America/New_York');

  -- Validate timezone
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'America/New_York';
  END;

  -- "today" in user's local timezone
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- Account creation date
  SELECT created_at INTO v_account_created FROM auth.users WHERE id = p_user_id;

  -- Ensure user_coins row exists
  INSERT INTO user_coins (user_id, balance, streak_days, last_daily_claim)
  VALUES (p_user_id, 0, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current streak info
  SELECT last_daily_claim, streak_days
  INTO v_last_claim, v_streak
  FROM user_coins
  WHERE user_id = p_user_id;

  -- CASE 1: Never claimed — enforce 24h Day-0 guard
  IF v_last_claim IS NULL THEN
    IF v_account_created IS NULL OR v_account_created >= (now() - interval '24 hours') THEN
      RAISE EXCEPTION 'Account too new for daily rewards';
    END IF;
    v_streak := 1;
  ELSE
    -- Convert stored UTC time to user's local date
    v_last_claim_date := (v_last_claim AT TIME ZONE v_tz)::date;

    IF v_last_claim_date = v_today THEN
      RAISE EXCEPTION 'Already claimed today';
    ELSIF v_last_claim_date = v_today - 1 THEN
      -- Claimed yesterday → continue streak
      v_streak := COALESCE(v_streak, 0) + 1;
    ELSE
      -- Missed a day → reset
      v_streak := 1;
    END IF;
  END IF;

  -- Base reward
  IF v_streak <= 2 THEN v_base_reward := 5;
  ELSIF v_streak <= 4 THEN v_base_reward := 8;
  ELSIF v_streak <= 6 THEN v_base_reward := 10;
  ELSIF v_streak <= 30 THEN v_base_reward := 15;
  ELSIF v_streak <= 100 THEN v_base_reward := 20;
  ELSE v_base_reward := 25;
  END IF;

  -- Milestone bonus
  IF v_streak = 3 THEN v_milestone_bonus := 10;
  ELSIF v_streak = 7 THEN v_milestone_bonus := 25;
  ELSIF v_streak = 14 THEN v_milestone_bonus := 50;
  ELSIF v_streak = 30 THEN v_milestone_bonus := 100;
  ELSIF v_streak = 60 THEN v_milestone_bonus := 200;
  ELSIF v_streak = 100 THEN v_milestone_bonus := 500;
  ELSIF v_streak = 365 THEN v_milestone_bonus := 1000;
  END IF;

  -- Store claim time in UTC (now() is always UTC on Supabase)
  UPDATE user_coins
  SET
    last_daily_claim = now(),
    streak_days = v_streak,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Credit coins
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

  -- Next milestone
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
