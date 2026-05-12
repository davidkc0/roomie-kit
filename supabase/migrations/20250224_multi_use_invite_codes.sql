-- Multi-Use Invite Codes
-- Adds a `multi_use` boolean to invite_codes (default false).
-- When true, the code stays active after redemption.
-- Toggle any code to multi_use from the Supabase Table Editor.

---------------------------------------------------
-- 1. Add multi_use column
---------------------------------------------------
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS multi_use BOOLEAN DEFAULT false;

---------------------------------------------------
-- 2. Update validate_invite_code to accept multi-use codes
--    (multi-use codes are always valid as long as is_active = true)
---------------------------------------------------
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM invite_codes
    WHERE code = UPPER(p_code)
      AND is_active = true
      AND (used_at IS NULL OR multi_use = true)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO authenticated;

---------------------------------------------------
-- 3. Update redeem_invite_code to keep multi-use codes active
---------------------------------------------------
CREATE OR REPLACE FUNCTION redeem_invite_code(
  p_user_id UUID,
  p_code TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite invite_codes%ROWTYPE;
  v_inviter_username TEXT;
  v_invitee_username TEXT;
BEGIN
  -- Check user isn't already active
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND account_status = 'active') THEN
    RAISE EXCEPTION 'User is already active';
  END IF;

  -- Find and lock the invite code
  -- For multi-use codes: allow even if used_at is set
  SELECT * INTO v_invite
  FROM invite_codes
  WHERE code = UPPER(p_code)
    AND is_active = true
    AND (used_at IS NULL OR multi_use = true)
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used invite code';
  END IF;

  -- Get usernames for transaction metadata
  SELECT username INTO v_inviter_username FROM profiles WHERE id = v_invite.owner_id;
  SELECT username INTO v_invitee_username FROM profiles WHERE id = p_user_id;

  -- Mark code as used (for single-use codes, deactivate; for multi-use, just update timestamp)
  IF v_invite.multi_use THEN
    -- Multi-use: update last_used timestamp but keep active
    UPDATE invite_codes SET
      used_at = now(),
      used_by = p_user_id
    WHERE id = v_invite.id;
  ELSE
    -- Single-use: deactivate as before
    UPDATE invite_codes SET
      used_at = now(),
      used_by = p_user_id,
      is_active = false
    WHERE id = v_invite.id;
  END IF;

  -- Update inviter stats
  UPDATE profiles SET
    invites_used = invites_used + 1
  WHERE id = v_invite.owner_id;

  -- Activate the new user
  UPDATE profiles SET
    account_status = 'active',
    invited_by = v_invite.owner_id,
    activated_at = now()
  WHERE id = p_user_id;

  -- Remove from waitlist
  DELETE FROM waitlist WHERE user_id = p_user_id;

  -- Reward inviter: 100 coins
  PERFORM modify_coins(
    v_invite.owner_id,
    100,
    'invite_bonus',
    jsonb_build_object('invited_user', v_invitee_username)
  );

  -- Reward invitee: 100 coins
  PERFORM modify_coins(
    p_user_id,
    100,
    'invite_bonus',
    jsonb_build_object('invited_by', v_inviter_username)
  );

  RETURN jsonb_build_object(
    'success', true,
    'inviter_username', v_inviter_username,
    'reward', 100
  );
END;
$$;
