-- Fix modify_coins INSERT/CHECK constraint bug
-- Problem: When spending coins (negative p_amount), the INSERT branch sets
-- balance = p_amount (e.g. -5), which violates CHECK (balance >= 0) BEFORE
-- the ON CONFLICT DO UPDATE can fire. The user has 7150 coins but the function
-- tries to INSERT a new row with balance=-5 instead of updating the existing one.
--
-- Root cause: PostgreSQL evaluates CHECK constraints on the INSERT tuple even
-- when ON CONFLICT will redirect to UPDATE. If the row doesn't exist yet AND
-- we're spending, the INSERT fails.
--
-- Fix: Use GREATEST(p_amount, 0) for the INSERT balance so new rows start at 0
-- for spend operations. The ON CONFLICT UPDATE branch (which adds to existing
-- balance) is unchanged and works correctly.

CREATE OR REPLACE FUNCTION modify_coins(
  p_user_id uuid,
  p_amount int,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance int;
  v_lifetime_purchased int;
BEGIN
  -- Update or insert user_coins
  -- Use GREATEST for INSERT balance to avoid CHECK constraint on negative amounts
  INSERT INTO user_coins (user_id, balance, lifetime_purchased)
  VALUES (
    p_user_id,
    GREATEST(p_amount, 0),
    CASE WHEN p_amount > 0 AND p_type = 'purchase' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    balance = user_coins.balance + p_amount,
    lifetime_purchased = user_coins.lifetime_purchased +
      CASE WHEN p_amount > 0 AND p_type = 'purchase' THEN p_amount ELSE 0 END,
    updated_at = now()
  RETURNING balance, lifetime_purchased INTO v_new_balance, v_lifetime_purchased;

  -- Prevent negative balance
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Log transaction
  INSERT INTO transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  VALUES (p_user_id, 'coins', p_amount, v_new_balance, p_type, p_metadata);

  RETURN jsonb_build_object(
    'balance', v_new_balance,
    'lifetime_purchased', v_lifetime_purchased
  );
END;
$$;
