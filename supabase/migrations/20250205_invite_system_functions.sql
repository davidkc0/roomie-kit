-- Run this SQL in the Supabase SQL Editor to create/recreate all invite system functions.
-- This is safe to run multiple times (CREATE OR REPLACE).

---------------------------------------------------
-- Drop policies if they already exist (makes migration re-runnable)
---------------------------------------------------
DROP POLICY IF EXISTS "Users can view own invite codes" ON invite_codes;
DROP POLICY IF EXISTS "Users can view own waitlist entry" ON waitlist;

CREATE POLICY "Users can view own invite codes"
  ON invite_codes FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can view own waitlist entry"
  ON waitlist FOR SELECT
  USING (auth.uid() = user_id);

---------------------------------------------------
-- RPC: Add to waitlist (with inflated position)
---------------------------------------------------
CREATE OR REPLACE FUNCTION add_to_waitlist(
  p_user_id UUID,
  p_username TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_position INT;
  v_new_position INT;
  v_random_increment INT;
BEGIN
  -- Get current max position (starts at 69 if empty)
  SELECT COALESCE(MAX(display_position), 69)
  INTO v_max_position
  FROM waitlist;

  -- Random increment between 2 and 9
  v_random_increment := 2 + FLOOR(RANDOM() * 8)::INT;
  v_new_position := v_max_position + v_random_increment;

  -- Insert (ignore if already exists)
  INSERT INTO waitlist (user_id, username, display_position)
  VALUES (p_user_id, p_username, v_new_position)
  ON CONFLICT (user_id) DO NOTHING;

  -- Return the position (either new or existing)
  SELECT display_position INTO v_new_position
  FROM waitlist WHERE user_id = p_user_id;

  RETURN v_new_position;
END;
$$;

---------------------------------------------------
-- RPC: Generate invite codes for a user
---------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invite_codes(
  p_user_id UUID,
  p_count INT DEFAULT 1
)
RETURNS SETOF invite_codes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT;
  v_remaining INT;
  v_code TEXT;
  v_prefix TEXT;
  v_suffix TEXT;
  v_i INT;
BEGIN
  SELECT username, invites_remaining
  INTO v_username, v_remaining
  FROM profiles WHERE id = p_user_id;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_remaining < p_count THEN
    RAISE EXCEPTION 'Not enough invites remaining (have %, need %)', v_remaining, p_count;
  END IF;

  v_prefix := UPPER(LEFT(COALESCE(v_username, 'USER'), 4));

  FOR v_i IN 1..p_count LOOP
    LOOP
      v_suffix := UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 4));
      v_code := v_prefix || '-' || v_suffix;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = v_code);
    END LOOP;

    INSERT INTO invite_codes (code, owner_id)
    VALUES (v_code, p_user_id);

    UPDATE profiles SET invites_remaining = invites_remaining - 1
    WHERE id = p_user_id;
  END LOOP;

  RETURN QUERY
    SELECT * FROM invite_codes
    WHERE owner_id = p_user_id AND is_active = true AND used_at IS NULL
    ORDER BY created_at DESC;
END;
$$;

---------------------------------------------------
-- RPC: Redeem an invite code
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
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND account_status = 'active') THEN
    RAISE EXCEPTION 'User is already active';
  END IF;

  SELECT * INTO v_invite
  FROM invite_codes
  WHERE code = UPPER(p_code) AND is_active = true AND used_at IS NULL
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used invite code';
  END IF;

  SELECT username INTO v_inviter_username FROM profiles WHERE id = v_invite.owner_id;
  SELECT username INTO v_invitee_username FROM profiles WHERE id = p_user_id;

  -- Mark code as used
  UPDATE invite_codes SET
    used_at = now(),
    used_by = p_user_id,
    is_active = false
  WHERE id = v_invite.id;

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

---------------------------------------------------
-- RPC: Admin activate user
---------------------------------------------------
CREATE OR REPLACE FUNCTION activate_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles SET
    account_status = 'active',
    activated_at = now()
  WHERE id = p_user_id;

  DELETE FROM waitlist WHERE user_id = p_user_id;
END;
$$;

---------------------------------------------------
-- RPC: Admin grant invites
---------------------------------------------------
CREATE OR REPLACE FUNCTION grant_invites(
  p_user_id UUID,
  p_count INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_remaining INT;
BEGIN
  UPDATE profiles SET
    invites_remaining = invites_remaining + p_count
  WHERE id = p_user_id
  RETURNING invites_remaining INTO v_new_remaining;

  RETURN v_new_remaining;
END;
$$;

---------------------------------------------------
-- RPC: Validate invite code (public, for login page)
---------------------------------------------------
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM invite_codes
    WHERE code = UPPER(p_code) AND is_active = true AND used_at IS NULL
  );
END;
$$;

-- Allow anonymous users to call this validation function
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO anon;
