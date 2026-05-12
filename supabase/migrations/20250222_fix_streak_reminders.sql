-- Fix Streak Reminders + Migrate to pg_cron
-- 
-- 1. Add timezone column to user_coins (updated on each claim)
-- 2. Update claim_daily_coins to save timezone
-- 3. Fix get_streak_reminder_candidates (was referencing dropped profiles.timezone)
-- 4. Create send_streak_reminders() using pg_net
-- 5. Schedule hourly via pg_cron

-- ============================================================
-- 1. Add timezone column to user_coins
-- ============================================================
ALTER TABLE user_coins ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- ============================================================
-- 2. Update claim_daily_coins — save timezone on each claim
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

  -- Store claim time in UTC + save the user's timezone
  UPDATE user_coins
  SET
    last_daily_claim = now(),
    streak_days = v_streak,
    timezone = v_tz,
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

-- ============================================================
-- 3. Fix get_streak_reminder_candidates
--    Now reads timezone from user_coins instead of profiles
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
    COALESCE(uc.timezone, 'America/New_York') AS user_tz
  FROM user_coins uc
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
-- 4. Create send_streak_reminders() — uses pg_net
-- ============================================================
CREATE OR REPLACE FUNCTION send_streak_reminders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_user record;
  v_user_hour int;
  v_today_in_tz date;
  v_last_claim_date date;
  v_sent int := 0;
BEGIN
  -- Read secrets from vault
  SELECT decrypted_secret INTO v_supabase_url
  FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE WARNING '[send_streak_reminders] Missing vault secrets';
    RETURN 0;
  END IF;

  FOR v_user IN SELECT * FROM get_streak_reminder_candidates() LOOP
    -- Calculate current hour in user's timezone
    BEGIN
      v_user_hour := EXTRACT(HOUR FROM now() AT TIME ZONE v_user.user_tz);
    EXCEPTION WHEN OTHERS THEN
      -- Invalid timezone, skip
      CONTINUE;
    END;

    -- Only send at 11 PM local time (1 hour before midnight)
    IF v_user_hour != 23 THEN
      CONTINUE;
    END IF;

    -- Check if they already claimed today in their timezone
    v_today_in_tz := (now() AT TIME ZONE v_user.user_tz)::date;
    v_last_claim_date := (v_user.last_daily_claim AT TIME ZONE v_user.user_tz)::date;

    -- Already claimed today — no reminder needed
    IF v_last_claim_date = v_today_in_tz THEN
      CONTINUE;
    END IF;

    -- Streak must still be alive (claimed yesterday)
    IF v_last_claim_date != v_today_in_tz - 1 THEN
      CONTINUE;
    END IF;

    -- Send notification via send-notification Edge Function
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := jsonb_build_object(
        'target_user_id', v_user.user_id::text,
        'notification_type', 'streak_reminders',
        'title', 'Don''t lose your streak! 🔥',
        'message', '🔥 Your ' || v_user.streak_days || '-day streak expires at midnight! Open the app to claim your reward.',
        'data', jsonb_build_object('type', 'streak_reminder', 'streak', v_user.streak_days)
      )
    );

    v_sent := v_sent + 1;
    RAISE LOG '[send_streak_reminders] Sent reminder to user % (%d-day streak)', v_user.user_id, v_user.streak_days;
  END LOOP;

  RAISE LOG '[send_streak_reminders] Done. Sent % reminders.', v_sent;
  RETURN v_sent;
END;
$$;

-- ============================================================
-- 5. Enable pg_cron and schedule hourly job
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule: run every hour at :00
SELECT cron.schedule(
  'streak-reminders',
  '0 * * * *',
  $$SELECT send_streak_reminders()$$
);
