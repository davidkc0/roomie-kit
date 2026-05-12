-- Hex Arena Match Pots
-- Migration: 20260206_hex_match_pots.sql
-- Tracks per-match coin entries and gem payouts for Hex Arena

-- ============================================
-- 1. HEX MATCH POTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS hex_match_pots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug TEXT NOT NULL,
  player_entries JSONB NOT NULL DEFAULT '{}',  -- {"user_id": amount, ...}
  total_coins INTEGER NOT NULL DEFAULT 0,
  gems_awarded INTEGER DEFAULT 0,
  platform_fee INTEGER DEFAULT 0,
  winner_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE hex_match_pots ENABLE ROW LEVEL SECURITY;

-- Players can view their own match pots
CREATE POLICY "Users can view match pots they participated in"
  ON hex_match_pots FOR SELECT
  USING (player_entries ? auth.uid()::text OR winner_id = auth.uid());

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_hex_match_pots_status
  ON hex_match_pots(status, created_at DESC);

-- ============================================
-- 2. CREATE HEX MATCH (atomic coin deduction)
-- ============================================
-- Called when all players are ready and game starts.
-- Deducts coins from ALL participants atomically.
-- p_entries: JSONB object mapping user_id → entry amount, e.g. {"uuid1": 5, "uuid2": 10, "uuid3": 20}
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

    -- Ensure minimum entry
    IF v_amount < 5 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'entry_below_minimum', 'player_id', v_user_id);
    END IF;

    -- Ensure user_coins row exists
    INSERT INTO user_coins (user_id, balance) VALUES (v_user_id, 0) ON CONFLICT (user_id) DO NOTHING;

    -- Check balance
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

    -- Deduct coins
    UPDATE user_coins
    SET balance = balance - v_amount, updated_at = NOW()
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_balance;

    -- Log transaction
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

GRANT EXECUTE ON FUNCTION create_hex_match TO authenticated;

-- ============================================
-- 3. CLOSE HEX MATCH (award gems to winner)
-- ============================================
-- Called when game ends and winner is determined.
-- Awards 85% of total coins as gems to the winner.
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
  -- Get the pot
  SELECT * INTO v_pot FROM hex_match_pots WHERE id = p_pot_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'pot_not_found_or_closed');
  END IF;

  -- Verify winner was a participant
  IF NOT (v_pot.player_entries ? p_winner_id::text) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'winner_not_participant');
  END IF;

  -- Calculate payout (85% to winner, 15% platform)
  v_gems_awarded := FLOOR(v_pot.total_coins * 0.85);
  v_platform_fee := v_pot.total_coins - v_gems_awarded;

  -- Award gems to winner
  PERFORM modify_gems(p_winner_id, v_gems_awarded, 'hex_arena_win',
    jsonb_build_object('pot_id', p_pot_id, 'total_coins', v_pot.total_coins, 'room', v_pot.room_slug));

  -- Close the pot
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

GRANT EXECUTE ON FUNCTION close_hex_match TO authenticated;
