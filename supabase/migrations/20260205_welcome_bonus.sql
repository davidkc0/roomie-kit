-- Welcome Bonus Migration
-- Adds one-time 20-coin welcome bonus for new users during onboarding

-- Add welcome bonus tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_bonus_claimed boolean DEFAULT false;

-- RPC: Claim welcome bonus (one-time, 20 coins)
CREATE OR REPLACE FUNCTION claim_welcome_bonus(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_already_claimed boolean;
BEGIN
  -- Check if already claimed
  SELECT welcome_bonus_claimed INTO v_already_claimed
  FROM profiles WHERE id = p_user_id;
  
  IF v_already_claimed = true THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_claimed');
  END IF;
  
  -- Add 20 coins with 'welcome_bonus' transaction type
  PERFORM modify_coins(p_user_id, 20, 'welcome_bonus', '{"source": "onboarding"}'::jsonb);
  
  -- Mark as claimed
  UPDATE profiles SET welcome_bonus_claimed = true WHERE id = p_user_id;
  
  RETURN jsonb_build_object('success', true, 'coins_awarded', 20);
END;
$$;
