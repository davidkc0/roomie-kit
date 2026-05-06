-- Migration: Add wall_texture_url to get_room_by_slug_rpc
-- This fixes wall textures not persisting when re-entering a room

CREATE OR REPLACE FUNCTION get_room_by_slug_rpc(slug_input text)
RETURNS TABLE (
  room_id bigint,
  name text,
  owner_id uuid,
  room_type text,
  floor_texture_url text,
  wall_texture_url text,
  wall_color text,
  items jsonb
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.name,
    r.owner_id,
    r.room_type,
    r.floor_texture_url,
    r.wall_texture_url,
    r.wall_color,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'instance_id', ri.instance_id,
          'item_id', ri.item_id,
          'position', ri.position,
          'rotation', ri.rotation,
          'scale', ri.scale,
          'model_url', i.model_url
        )
      ) FILTER (WHERE ri.id IS NOT NULL),
      '[]'::jsonb
    ) as items
  FROM rooms r
  LEFT JOIN room_items ri ON r.id = ri.room_id
  LEFT JOIN items i ON ri.item_id = i.id
  WHERE r.slug = slug_input OR (r.room_type = 'personal' AND r.slug = slug_input)
  GROUP BY r.id;
END;
$$;
