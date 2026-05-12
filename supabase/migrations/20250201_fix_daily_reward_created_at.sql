-- Fix check_daily_reward AND claim_daily_coins:
-- 1. profiles table does not have created_at — use auth.users
-- 2. Streak reset must also require 24h before new Day 1 reward
--    (prevents getting a reward the instant your streak breaks)

-- ============================================================
-- check_daily_reward (read-only eligibility check)
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
  v_now timestamp := now();
  v_eligible boolean := false;
  v_account_created timestamp;
BEGIN
  -- Get account creation date from auth.users (profiles doesn't have created_at)
  SELECT created_at INTO v_account_created FROM auth.users WHERE id = p_user_id;

  -- Get current streak info
  SELECT last_daily_claim, streak_days
  INTO v_last_claim, v_streak
  FROM user_coins
  WHERE user_id = p_user_id;
  
  -- If no record exists (new user), check if account is old enough
  IF v_last_claim IS NULL THEN
    -- Only eligible if account is at least 24 hours old
    IF v_account_created IS NOT NULL AND v_account_created < (v_now - interval '24 hours') THEN
      v_eligible := true;
      v_pending_streak := 1;
    ELSE
      v_eligible := false;
      v_pending_streak := 0;
    END IF;
  -- If already claimed today, not eligible
  ELSIF v_last_claim::date = v_now::date THEN
    v_eligible := false;
    v_pending_streak := v_streak; -- Current streak (already claimed)
  -- If claimed yesterday, continue streak
  ELSIF v_last_claim::date = (v_now - interval '1 day')::date THEN
    v_eligible := true;
    v_pending_streak := v_streak + 1;
  -- If more than 1 day ago, streak resets
  -- Must wait at least 24h from last claim before starting new streak
  ELSE
    IF v_last_claim < (v_now - interval '24 hours') THEN
      v_eligible := true;
    ELSE
      v_eligible := false;
    END IF;
    v_pending_streak := 1;
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
  
  -- Calculate reward for pending_streak (same logic as claim_daily_coins)
  IF v_pending_streak <= 7 THEN
    IF v_pending_streak = 7 THEN
       v_base_reward := 60;
    ELSE
       v_base_reward := 25 + (v_pending_streak - 1) * 5;
    END IF;
  ELSIF v_pending_streak <= 30 THEN
    v_base_reward := 60 + (v_pending_streak - 7) * 3;
  ELSIF v_pending_streak <= 100 THEN
    v_base_reward := least(130 + floor((v_pending_streak - 30) / 2), 200);
  ELSE
    v_base_reward := 200;
  END IF;

  -- Calculate milestone bonus
  IF v_pending_streak = 3 THEN v_milestone_bonus := 50;
  ELSIF v_pending_streak = 7 THEN v_milestone_bonus := 100;
  ELSIF v_pending_streak = 14 THEN v_milestone_bonus := 200;
  ELSIF v_pending_streak = 30 THEN v_milestone_bonus := 500;
  ELSIF v_pending_streak = 60 THEN v_milestone_bonus := 1000;
  ELSIF v_pending_streak = 100 THEN v_milestone_bonus := 2500;
  ELSIF v_pending_streak = 365 THEN v_milestone_bonus := 10000;
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
-- claim_daily_coins (write — actually claims the reward)
-- Also needs the 24h guard for streak resets and new accounts
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
  v_next_milestone_day int;
  v_next_milestone_bonus int;
  v_account_created timestamp;
BEGIN
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
  
  -- Check if already claimed today
  IF v_last_claim IS NOT NULL AND v_last_claim::date = v_now::date THEN
    RAISE EXCEPTION 'Already claimed today';
  END IF;

  -- Guard: new users must wait 24h after account creation
  IF v_last_claim IS NULL AND (v_account_created IS NULL OR v_account_created >= (v_now - interval '24 hours')) THEN
    RAISE EXCEPTION 'Account too new for daily rewards';
  END IF;
  
  -- Calculate new streak
  IF v_last_claim IS NULL OR v_last_claim::date < (v_now - interval '1 day')::date THEN
    -- Streak reset: also require 24h since last claim
    IF v_last_claim IS NOT NULL AND v_last_claim >= (v_now - interval '24 hours') THEN
      RAISE EXCEPTION 'Must wait 24 hours after streak reset';
    END IF;
    v_streak := 1;  -- Reset if missed a day or first time
  ELSIF v_last_claim::date = (v_now - interval '1 day')::date THEN
    v_streak := COALESCE(v_streak, 0) + 1;  -- Continue streak
  END IF;
  
  -- 1. Calculate Base Reward
  IF v_streak <= 7 THEN
    IF v_streak = 7 THEN
       v_base_reward := 60; -- Special bump for day 7
    ELSE
       v_base_reward := 25 + (v_streak - 1) * 5;
    END IF;
  ELSIF v_streak <= 30 THEN
    v_base_reward := 60 + (v_streak - 7) * 3;
  ELSIF v_streak <= 100 THEN
    v_base_reward := least(130 + floor((v_streak - 30) / 2), 200);
  ELSE
    v_base_reward := 200;
  END IF;

  -- 2. Calculate Milestone Bonus
  IF v_streak = 3 THEN v_milestone_bonus := 50;
  ELSIF v_streak = 7 THEN v_milestone_bonus := 100;
  ELSIF v_streak = 14 THEN v_milestone_bonus := 200;
  ELSIF v_streak = 30 THEN v_milestone_bonus := 500;
  ELSIF v_streak = 60 THEN v_milestone_bonus := 1000;
  ELSIF v_streak = 100 THEN v_milestone_bonus := 2500;
  ELSIF v_streak = 365 THEN v_milestone_bonus := 10000;
  END IF;
  
  -- Update streak info in DB
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
  IF v_streak < 3 THEN v_next_milestone_day := 3; v_next_milestone_bonus := 50;
  ELSIF v_streak < 7 THEN v_next_milestone_day := 7; v_next_milestone_bonus := 100;
  ELSIF v_streak < 14 THEN v_next_milestone_day := 14; v_next_milestone_bonus := 200;
  ELSIF v_streak < 30 THEN v_next_milestone_day := 30; v_next_milestone_bonus := 500;
  ELSIF v_streak < 60 THEN v_next_milestone_day := 60; v_next_milestone_bonus := 1000;
  ELSIF v_streak < 100 THEN v_next_milestone_day := 100; v_next_milestone_bonus := 2500;
  ELSIF v_streak < 365 THEN v_next_milestone_day := 365; v_next_milestone_bonus := 10000;
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
