-- Migration: Gifting System for Theater Livestreaming
-- Created: 2024-12-28

-- ============================================
-- 1. GIFTS TABLE (Catalog of available gifts)
-- ============================================
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost > 0),
  gem_value INTEGER NOT NULL CHECK (gem_value > 0),
  icon_url TEXT,
  animation_type TEXT DEFAULT 'particle',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

-- Anyone can read gifts (public catalog)
CREATE POLICY "Gifts are viewable by everyone"
  ON gifts FOR SELECT
  USING (true);

-- ============================================
-- 2. GIFT TRANSACTIONS TABLE (History log)
-- ============================================
CREATE TABLE IF NOT EXISTS gift_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  recipient_id UUID REFERENCES profiles(id) NOT NULL,
  gift_id UUID REFERENCES gifts(id) NOT NULL,
  coins_spent INTEGER NOT NULL,
  gems_earned INTEGER NOT NULL,
  room_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE gift_transactions ENABLE ROW LEVEL SECURITY;

-- Users can see their own sent/received gifts
CREATE POLICY "Users can view their own gift transactions"
  ON gift_transactions FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- ============================================
-- 3. SEND_GIFT RPC FUNCTION (Atomic transfer)
-- ============================================
CREATE OR REPLACE FUNCTION send_gift(
  p_sender_id UUID,
  p_recipient_id UUID,
  p_gift_id UUID,
  p_room_slug TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gift RECORD;
  v_sender_balance INTEGER;
BEGIN
  -- Prevent self-gifting
  IF p_sender_id = p_recipient_id THEN
    RAISE EXCEPTION 'Cannot send gift to yourself';
  END IF;

  -- Get gift details
  SELECT * INTO v_gift FROM gifts WHERE id = p_gift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift not found';
  END IF;

  -- Check sender balance (lock row for update)
  SELECT coin_balance INTO v_sender_balance 
  FROM profiles 
  WHERE id = p_sender_id 
  FOR UPDATE;
  
  IF v_sender_balance IS NULL THEN
    RAISE EXCEPTION 'Sender profile not found';
  END IF;
  
  IF v_sender_balance < v_gift.cost THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;

  -- Deduct coins from sender
  UPDATE profiles 
  SET coin_balance = coin_balance - v_gift.cost,
      updated_at = NOW()
  WHERE id = p_sender_id;

  -- Add gems to recipient
  UPDATE profiles 
  SET gem_balance = COALESCE(gem_balance, 0) + v_gift.gem_value,
      updated_at = NOW()
  WHERE id = p_recipient_id;

  -- Log transaction
  INSERT INTO gift_transactions (sender_id, recipient_id, gift_id, coins_spent, gems_earned, room_slug)
  VALUES (p_sender_id, p_recipient_id, p_gift_id, v_gift.cost, v_gift.gem_value, p_room_slug);

  RETURN json_build_object(
    'success', true, 
    'gift_name', v_gift.name,
    'coins_spent', v_gift.cost,
    'gems_earned', v_gift.gem_value
  );
END;
$$;

-- ============================================
-- 4. SEED DATA (Initial gift catalog)
-- ============================================
INSERT INTO gifts (name, cost, gem_value, icon_url, animation_type, sort_order) VALUES
  ('Heart', 10, 1, '/gifts/heart.png', 'particle', 1),
  ('Star', 50, 5, '/gifts/star.png', 'particle', 2),
  ('Crown', 100, 10, '/gifts/crown.png', 'confetti', 3),
  ('Rocket', 500, 50, '/gifts/rocket.png', 'particle', 4),
  ('Diamond', 1000, 100, '/gifts/diamond.png', 'rive', 5)
ON CONFLICT DO NOTHING;
