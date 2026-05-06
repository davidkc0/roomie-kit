-- Rebalanced Daily Rewards — Economy-aware values
-- 
-- Previous rewards were too generous (Day 1=25, Week 1 total=435 coins ≈ $4.30).
-- This diluted coin value vs the $0.99=100 coin purchase tier.
-- 
-- New values: Day 1=5 coins (≈1 game play), scaling modestly.
-- Week 1 total: ~64 coins ($0.64). Month total: ~440 coins ($4.40).
-- This preserves purchase incentive while still rewarding daily engagement.

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
  v_hours_since_claim double precision;
BEGIN
  -- Get account creation date from auth.users (profiles doesn't have created_at)
  SELECT created_at INTO v_account_created FROM auth.users WHERE id = p_user_id;

  -- Get current streak info
  SELECT last_daily_claim, streak_days
  INTO v_last_claim, v_streak
  FROM user_coins
  WHERE user_id = p_user_id;

  -- CASE 1: Never claimed before (new user)
  IF v_last_claim IS NULL THEN
    -- Must wait 24h after account creation
    IF v_account_created IS NOT NULL AND v_account_created < (v_now - interval '24 hours') THEN
      v_eligible := true;
      v_pending_streak := 1;
    ELSE
      v_eligible := false;
      v_pending_streak := 0;
    END IF;
  ELSE
    -- Calculate hours since last claim
    v_hours_since_claim := EXTRACT(EPOCH FROM (v_now - v_last_claim)) / 3600.0;

    -- UNIVERSAL GUARD: Must wait at least 24 hours since last claim
    IF v_hours_since_claim < 24 THEN
      v_eligible := false;
      v_pending_streak := v_streak;
    -- Claimed 24-48 hours ago → continue streak
    ELSIF v_hours_since_claim < 48 THEN
      v_eligible := true;
      v_pending_streak := v_streak + 1;
    -- More than 48 hours → streak resets
    ELSE
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
  -- Day 1-2: 5 coins  |  Day 3-4: 8 coins  |  Day 5-6: 10 coins
  -- Day 7:  15 coins   |  Day 8-30: 15 coins |  Day 31-100: 20 coins  |  Day 100+: 25 coins
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
-- claim_daily_coins (write — actually claims the reward)
-- Same reward logic as check_daily_reward
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
  v_hours_since_claim double precision;
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

  -- CASE 1: Never claimed before — enforce 24h after account creation
  IF v_last_claim IS NULL THEN
    IF v_account_created IS NULL OR v_account_created >= (v_now - interval '24 hours') THEN
      RAISE EXCEPTION 'Account too new for daily rewards';
    END IF;
    v_streak := 1;
  ELSE
    -- Calculate hours since last claim
    v_hours_since_claim := EXTRACT(EPOCH FROM (v_now - v_last_claim)) / 3600.0;

    -- UNIVERSAL GUARD: Must wait at least 24 hours
    IF v_hours_since_claim < 24 THEN
      RAISE EXCEPTION 'Already claimed today';
    -- 24-48 hours → continue streak
    ELSIF v_hours_since_claim < 48 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
    -- More than 48 hours → streak resets
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
