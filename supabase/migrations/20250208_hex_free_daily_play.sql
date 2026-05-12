-- Update check_game_play_cost to also detect hex_arena_entry transactions
-- (previously it only looked for 'game_play' type, missing hex arena entries)
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
  -- Check both 'game_play' (snake/chess/match3) and 'hex_arena_entry' (hex arena)
  SELECT COUNT(*) INTO v_plays_today
  FROM transactions
  WHERE user_id = p_user_id
    AND transaction_type IN ('game_play', 'hex_arena_entry')
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

-- Update create_hex_match to support free daily play
-- Each player gets 1 free hex_arena play per UTC day.
-- If they haven't played today, their entry is 0 (free).
-- This aligns with the check_game_play_cost / start_game_play pattern
-- used by Snake, Chess, and Match3.

CREATE OR REPLACE FUNCTION create_hex_match(p_room_slug TEXT, p_entries JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
  v_total_coins INTEGER := 0;
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_pot_id UUID;
  v_user_id UUID;
  v_amount INTEGER;
  v_plays_today INTEGER;
  v_is_free BOOLEAN;
  v_actual_amount INTEGER;
BEGIN
  -- Validate at least 2 entries
  IF (SELECT COUNT(*) FROM jsonb_each(p_entries)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'minimum_2_players_required');
  END IF;

  -- Phase 1: Validate all balances BEFORE deducting anything
  -- Also check free daily play eligibility for each player
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_entries)
  LOOP
    v_user_id := v_entry.key::uuid;
    v_amount := (v_entry.value)::integer;

    IF v_amount < 5 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'entry_below_minimum', 'player_id', v_user_id);
    END IF;

    -- Ensure user_coins row exists
    INSERT INTO user_coins (user_id, balance) VALUES (v_user_id, 0) ON CONFLICT (user_id) DO NOTHING;

    -- Check if this player has already played hex_arena today (UTC)
    SELECT COUNT(*) INTO v_plays_today
    FROM transactions
    WHERE user_id = v_user_id
      AND transaction_type IN ('game_play', 'hex_arena_entry')
      AND metadata->>'game' = 'hex_arena'
      AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

    v_is_free := (v_plays_today = 0);

    -- If not free, validate balance
    IF NOT v_is_free THEN
      SELECT balance INTO v_balance FROM user_coins WHERE user_id = v_user_id;
      IF v_balance < v_amount THEN
        RETURN jsonb_build_object('success', false, 'reason', 'insufficient_coins', 'player_id', v_user_id, 'balance', v_balance, 'required', v_amount);
      END IF;
    END IF;
  END LOOP;

  -- Phase 2: All validations passed → deduct atomically
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_entries)
  LOOP
    v_user_id := v_entry.key::uuid;
    v_amount := (v_entry.value)::integer;

    -- Re-check free eligibility (same logic as Phase 1)
    SELECT COUNT(*) INTO v_plays_today
    FROM transactions
    WHERE user_id = v_user_id
      AND transaction_type IN ('game_play', 'hex_arena_entry')
      AND metadata->>'game' = 'hex_arena'
      AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

    v_is_free := (v_plays_today = 0);
    v_actual_amount := CASE WHEN v_is_free THEN 0 ELSE v_amount END;

    IF v_actual_amount > 0 THEN
      -- Paid play: deduct coins
      UPDATE user_coins
      SET balance = balance - v_actual_amount, updated_at = NOW()
      WHERE user_id = v_user_id
      RETURNING balance INTO v_new_balance;
    ELSE
      -- Free play: just get current balance for the transaction log
      SELECT balance INTO v_new_balance FROM user_coins WHERE user_id = v_user_id;
    END IF;

    -- Log the transaction (both free and paid)
    INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
    VALUES (v_user_id, 'coins', -v_actual_amount, v_new_balance, 'hex_arena_entry',
      jsonb_build_object('room', p_room_slug, 'entry_amount', v_actual_amount, 'game', 'hex_arena', 'free', v_is_free));

    v_total_coins := v_total_coins + v_actual_amount;
  END LOOP;

  -- Phase 3: Create the pot record
  INSERT INTO hex_match_pots (room_slug, player_entries, total_coins)
  VALUES (p_room_slug, p_entries, v_total_coins)
  RETURNING id INTO v_pot_id;

  RETURN jsonb_build_object(
    'success', true,
    'pot_id', v_pot_id,
    'total_coins', v_total_coins,
    'gems_potential', FLOOR(v_total_coins * 0.85)
  );
END;
$$;
