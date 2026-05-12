-- Fix Daily Reward Timing
-- New users must wait 24 hours after account creation before claiming Day 1 reward
-- This ensures welcome bonus (Day 0) is distinct from daily rewards (Day 1+)

-- Update check_daily_reward to require 24h after account creation for new users
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
  -- Get account creation date
  SELECT created_at INTO v_account_created FROM profiles WHERE id = p_user_id;

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
      -- Too new, must wait 24 hours after signup
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
  ELSE
    v_eligible := true;
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
