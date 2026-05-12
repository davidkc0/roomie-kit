-- supabase/migrations/20260125_game_play_tracking.sql
-- Pay-to-play system for games: 1 free play per game per day, then 5 coins

-- RPC: Check game play cost (query only - for UI display)
CREATE OR REPLACE FUNCTION check_game_play_cost(p_user_id uuid, p_game text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plays_today int;
  v_balance int;
BEGIN
  -- Count today's plays for this specific game
  SELECT COUNT(*) INTO v_plays_today
  FROM transactions
  WHERE user_id = p_user_id
    AND transaction_type = 'game_play'
    AND metadata->>'game' = p_game
    AND created_at::date = CURRENT_DATE;
  
  -- Get current balance
  SELECT COALESCE(balance, 0) INTO v_balance 
  FROM user_coins 
  WHERE user_id = p_user_id;
  
  IF v_plays_today = 0 THEN
    RETURN jsonb_build_object('is_free', true, 'cost', 0, 'balance', COALESCE(v_balance, 0), 'plays_today', 0);
  ELSE
    RETURN jsonb_build_object('is_free', false, 'cost', 5, 'balance', COALESCE(v_balance, 0), 'plays_today', v_plays_today);
  END IF;
END;
$$;

-- RPC: Start game play (deducts coins if needed, logs transaction)
CREATE OR REPLACE FUNCTION start_game_play(p_user_id uuid, p_game text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plays_today int;
  v_cost int := 5;
  v_balance int;
  v_new_balance int;
BEGIN
  -- Ensure user_coins row exists first (for all cases)
  INSERT INTO user_coins (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current balance (row now guaranteed to exist)
  SELECT balance INTO v_balance FROM user_coins WHERE user_id = p_user_id;
  
  -- Count today's plays for this game
  SELECT COUNT(*) INTO v_plays_today
  FROM transactions
  WHERE user_id = p_user_id
    AND transaction_type = 'game_play'
    AND metadata->>'game' = p_game
    AND created_at::date = CURRENT_DATE;
  
  -- First play is free
  IF v_plays_today = 0 THEN
    -- Log free play (0 cost transaction)
    INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
    VALUES (p_user_id, 'coins', 0, v_balance, 'game_play', jsonb_build_object('game', p_game, 'free', true));
    
    RETURN jsonb_build_object('allowed', true, 'free', true, 'cost', 0, 'balance', v_balance);
  END IF;
  
  -- Subsequent plays cost 5 coins - check balance BEFORE deducting
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('allowed', false, 'free', false, 'cost', v_cost, 'balance', v_balance, 'reason', 'insufficient_coins');
  END IF;
  
  -- Deduct coins directly (avoid modify_coins INSERT issue)
  UPDATE user_coins 
  SET balance = balance - v_cost, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  -- Log paid play transaction
  INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  VALUES (p_user_id, 'coins', -v_cost, v_new_balance, 'game_play', jsonb_build_object('game', p_game, 'free', false));
  
  RETURN jsonb_build_object('allowed', true, 'free', false, 'cost', v_cost, 'balance', v_new_balance);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_game_play_cost TO authenticated;
GRANT EXECUTE ON FUNCTION start_game_play TO authenticated;
