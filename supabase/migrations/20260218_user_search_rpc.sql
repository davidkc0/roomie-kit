-- Search Users RPC
-- efficiently searches users by username and returns their friendship status relative to the caller

CREATE OR REPLACE FUNCTION search_users(
  p_search_text text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  username text,
  profile_image_url text,
  avatar_headshot_url text,
  bio text,
  friend_status text -- 'none', 'pending_sent', 'pending_received', 'accepted'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
BEGIN
  v_current_user_id := auth.uid();

  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.profile_image_url,
    p.avatar_headshot_url,
    p.bio,
    -- Calculate friendship status
    CASE 
      WHEN f.status = 'accepted' THEN 'accepted'
      WHEN f.status = 'pending' AND f.user_id_1 = v_current_user_id THEN 'pending_sent'
      WHEN f.status = 'pending' AND f.user_id_2 = v_current_user_id THEN 'pending_received'
      ELSE 'none'
    END as friend_status
  FROM profiles p
  LEFT JOIN friendships f ON 
    (f.user_id_1 = v_current_user_id AND f.user_id_2 = p.id) OR 
    (f.user_id_1 = p.id AND f.user_id_2 = v_current_user_id)
  WHERE 
    p.id != v_current_user_id -- Exclude self
    AND (
      p.username ILIKE p_search_text || '%' -- Prefix match is faster than %text%
      OR p.username ILIKE '%' || p_search_text || '%' -- Fallback to fuzzy match if needed
    )
  ORDER BY 
    CASE WHEN p.username ILIKE p_search_text || '%' THEN 0 ELSE 1 END, -- Prioritize exact prefix matches
    p.username ASC
  LIMIT p_limit;
END;
$$;
