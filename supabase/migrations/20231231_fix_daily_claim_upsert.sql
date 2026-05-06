-- Fix: Add upsert for missing user_coins row before claiming
-- This ensures new users can claim daily rewards without errors

create or replace function claim_daily_coins(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_last_claim timestamp;
  v_streak int;
  v_base_reward int;
  v_milestone_bonus int := 0;
  v_now timestamp := now();
  v_next_milestone_day int;
  v_next_milestone_bonus int;
begin
  -- Ensure user has a row in user_coins (upsert)
  INSERT INTO user_coins (user_id, balance, streak_days, last_daily_claim)
  VALUES (p_user_id, 0, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current streak info
  select last_daily_claim, streak_days
  into v_last_claim, v_streak
  from user_coins
  where user_id = p_user_id;
  
  -- Check if already claimed today
  if v_last_claim is not null and v_last_claim::date = v_now::date then
    raise exception 'Already claimed today';
  end if;
  
  -- Calculate new streak
  if v_last_claim is null or v_last_claim::date < (v_now - interval '1 day')::date then
    v_streak := 1;  -- Reset if missed a day or first time
  elsif v_last_claim::date = (v_now - interval '1 day')::date then
    v_streak := coalesce(v_streak, 0) + 1;  -- Continue streak
  end if;
  
  -- 1. Calculate Base Reward
  if v_streak <= 7 then
    if v_streak = 7 then
       v_base_reward := 60; -- Special bump for day 7
    else
       v_base_reward := 25 + (v_streak - 1) * 5;
    end if;
  elsif v_streak <= 30 then
    v_base_reward := 60 + (v_streak - 7) * 3;
  elsif v_streak <= 100 then
    v_base_reward := least(130 + floor((v_streak - 30) / 2), 200);
  else
    v_base_reward := 200;
  end if;

  -- 2. Calculate Milestone Bonus
  -- Milestones: 3, 7, 14, 30, 60, 100, 365
  if v_streak = 3 then v_milestone_bonus := 50;
  elsif v_streak = 7 then v_milestone_bonus := 100;
  elsif v_streak = 14 then v_milestone_bonus := 200;
  elsif v_streak = 30 then v_milestone_bonus := 500;
  elsif v_streak = 60 then v_milestone_bonus := 1000;
  elsif v_streak = 100 then v_milestone_bonus := 2500;
  elsif v_streak = 365 then v_milestone_bonus := 10000;
  end if;
  
  -- Update streak info in DB
  update user_coins
  set 
    last_daily_claim = v_now,
    streak_days = v_streak,
    updated_at = v_now
  where user_id = p_user_id;
  
  -- Add coins (Base + Bonus)
  perform modify_coins(
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
  if v_streak < 3 then v_next_milestone_day := 3; v_next_milestone_bonus := 50;
  elsif v_streak < 7 then v_next_milestone_day := 7; v_next_milestone_bonus := 100;
  elsif v_streak < 14 then v_next_milestone_day := 14; v_next_milestone_bonus := 200;
  elsif v_streak < 30 then v_next_milestone_day := 30; v_next_milestone_bonus := 500;
  elsif v_streak < 60 then v_next_milestone_day := 60; v_next_milestone_bonus := 1000;
  elsif v_streak < 100 then v_next_milestone_day := 100; v_next_milestone_bonus := 2500;
  elsif v_streak < 365 then v_next_milestone_day := 365; v_next_milestone_bonus := 10000;
  end if;

  return jsonb_build_object(
    'reward', v_base_reward + v_milestone_bonus,
    'base_reward', v_base_reward,
    'milestone_bonus', v_milestone_bonus,
    'streak', v_streak,
    'next_milestone_day', v_next_milestone_day,
    'next_milestone_bonus', v_next_milestone_bonus
  );
end;
$$;
