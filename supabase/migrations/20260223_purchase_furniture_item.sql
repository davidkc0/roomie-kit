-- =====================================================================
-- Furniture Purchase System
-- Adds purchase gating for room furniture items with price_coins > 0
-- Mirrors the avatar purchase pattern from 20260219_avatar_expansion.sql
-- =====================================================================

-- 1. PURCHASE FURNITURE ITEM RPC
-- Atomically: validate → check ownership → check balance → deduct → log → grant
CREATE OR REPLACE FUNCTION purchase_furniture_item(
  p_user_id UUID,
  p_item_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_balance INT;
  v_already_owned BOOLEAN;
  v_new_balance INT;
BEGIN
  -- Validate item exists in the furniture catalog
  SELECT * INTO v_item
  FROM items
  WHERE id = p_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item not found');
  END IF;

  -- Free items don't need purchasing
  IF v_item.price_coins <= 0 THEN
    RETURN jsonb_build_object('success', true, 'free', true);
  END IF;

  -- Check if already owned
  SELECT EXISTS(
    SELECT 1 FROM user_inventory
    WHERE user_id = p_user_id AND item_id = p_item_id
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', true, 'already_owned', true);
  END IF;

  -- Ensure user_coins row exists
  INSERT INTO user_coins (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Check balance
  SELECT balance INTO v_balance
  FROM user_coins WHERE user_id = p_user_id;

  IF v_balance < v_item.price_coins THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient coins',
      'balance', v_balance,
      'price', v_item.price_coins
    );
  END IF;

  -- Deduct coins
  UPDATE user_coins
  SET balance = balance - v_item.price_coins,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Log transaction
  INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  VALUES (
    p_user_id,
    'coins',
    -v_item.price_coins,
    v_new_balance,
    'purchase',
    jsonb_build_object('furniture_item', v_item.name, 'item_id', p_item_id)
  );

  -- Grant item via user_inventory
  INSERT INTO user_inventory (user_id, item_id, source)
  VALUES (p_user_id, p_item_id, 'purchase')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'item_name', v_item.name
  );
END;
$$;

-- 2. GET USER OWNED FURNITURE RPC
-- Returns array of item_ids the user owns (for palette gating)
CREATE OR REPLACE FUNCTION get_user_owned_furniture(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT jsonb_agg(item_id)
     FROM user_inventory
     WHERE user_id = p_user_id AND item_id IS NOT NULL),
    '[]'::jsonb
  );
END;
$$;
