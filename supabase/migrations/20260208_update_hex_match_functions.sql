-- Update create_hex_match to allow 2 players (for testing)
-- and update close_hex_match (no changes, just ensure latest version)

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
BEGIN
  -- Validate at least 2 entries (TODO: revert to 3 for production)
  IF (SELECT COUNT(*) FROM jsonb_each(p_entries)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'minimum_2_players_required');
  END IF;

  -- Phase 1: Validate all balances BEFORE deducting anything
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_entries)
  LOOP
    v_user_id := v_entry.key::uuid;
    v_amount := (v_entry.value)::integer;

    IF v_amount < 5 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'entry_below_minimum', 'player_id', v_user_id);
    END IF;

    INSERT INTO user_coins (user_id, balance) VALUES (v_user_id, 0) ON CONFLICT (user_id) DO NOTHING;

    SELECT balance INTO v_balance FROM user_coins WHERE user_id = v_user_id;
    IF v_balance < v_amount THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_coins', 'player_id', v_user_id, 'balance', v_balance, 'required', v_amount);
    END IF;
  END LOOP;

  -- Phase 2: All balances valid → deduct atomically
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_entries)
  LOOP
    v_user_id := v_entry.key::uuid;
    v_amount := (v_entry.value)::integer;

    UPDATE user_coins
    SET balance = balance - v_amount, updated_at = NOW()
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
    VALUES (v_user_id, 'coins', -v_amount, v_new_balance, 'hex_arena_entry',
      jsonb_build_object('room', p_room_slug, 'entry_amount', v_amount));

    v_total_coins := v_total_coins + v_amount;
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

CREATE OR REPLACE FUNCTION close_hex_match(p_pot_id UUID, p_winner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pot RECORD;
  v_gems_awarded INTEGER;
  v_platform_fee INTEGER;
BEGIN
  SELECT * INTO v_pot FROM hex_match_pots WHERE id = p_pot_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'pot_not_found_or_closed');
  END IF;

  IF NOT (v_pot.player_entries ? p_winner_id::text) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'winner_not_participant');
  END IF;

  v_gems_awarded := FLOOR(v_pot.total_coins * 0.85);
  v_platform_fee := v_pot.total_coins - v_gems_awarded;

  PERFORM modify_gems(p_winner_id, v_gems_awarded, 'hex_arena_win',
    jsonb_build_object('pot_id', p_pot_id, 'total_coins', v_pot.total_coins, 'room', v_pot.room_slug));

  UPDATE hex_match_pots SET
    status = 'closed',
    winner_id = p_winner_id,
    gems_awarded = v_gems_awarded,
    platform_fee = v_platform_fee,
    closed_at = NOW()
  WHERE id = p_pot_id;

  RETURN jsonb_build_object(
    'success', true,
    'gems_awarded', v_gems_awarded,
    'platform_fee', v_platform_fee,
    'total_coins', v_pot.total_coins
  );
END;
$$;
