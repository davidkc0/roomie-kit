-- Create check_daily_reward function to check eligibility and preview reward WITHOUT claiming
create or replace function check_daily_reward(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_last_claim timestamp;
  v_streak int;
  v_pending_streak int;
  v_base_reward int;
  v_milestone_bonus int := 0;
  v_now timestamp := now();
  v_eligible boolean := false;
begin
  -- Get current streak info
  select last_daily_claim, streak_days
  into v_last_claim, v_streak
  from user_coins
  where user_id = p_user_id;
  
  -- If no record exists, user is eligible (first time)
  if v_last_claim is null then
    v_eligible := true;
    v_pending_streak := 1;
  -- If already claimed today, not eligible
  elsif v_last_claim::date = v_now::date then
    v_eligible := false;
    v_pending_streak := v_streak; -- Current streak (already claimed)
  -- If claimed yesterday, continue streak
  elsif v_last_claim::date = (v_now - interval '1 day')::date then
    v_eligible := true;
    v_pending_streak := v_streak + 1;
  -- If more than 1 day ago, streak resets
  else
    v_eligible := true;
    v_pending_streak := 1;
  end if;
  
  -- If not eligible, return early
  if not v_eligible then
    return jsonb_build_object(
      'eligible', false,
      'streak', v_streak,
      'pending_streak', v_pending_streak,
      'reward', 0
    );
  end if;
  
  -- Calculate reward for pending_streak (same logic as claim_daily_coins)
  if v_pending_streak <= 7 then
    if v_pending_streak = 7 then
       v_base_reward := 60;
    else
       v_base_reward := 25 + (v_pending_streak - 1) * 5;
    end if;
  elsif v_pending_streak <= 30 then
    v_base_reward := 60 + (v_pending_streak - 7) * 3;
  elsif v_pending_streak <= 100 then
    v_base_reward := least(130 + floor((v_pending_streak - 30) / 2), 200);
  else
    v_base_reward := 200;
  end if;

  -- Calculate milestone bonus
  if v_pending_streak = 3 then v_milestone_bonus := 50;
  elsif v_pending_streak = 7 then v_milestone_bonus := 100;
  elsif v_pending_streak = 14 then v_milestone_bonus := 200;
  elsif v_pending_streak = 30 then v_milestone_bonus := 500;
  elsif v_pending_streak = 60 then v_milestone_bonus := 1000;
  elsif v_pending_streak = 100 then v_milestone_bonus := 2500;
  elsif v_pending_streak = 365 then v_milestone_bonus := 10000;
  end if;
  
  return jsonb_build_object(
    'eligible', true,
    'streak', coalesce(v_streak, 0),
    'pending_streak', v_pending_streak,
    'base_reward', v_base_reward,
    'milestone_bonus', v_milestone_bonus,
    'reward', v_base_reward + v_milestone_bonus
  );
end;
$$;
