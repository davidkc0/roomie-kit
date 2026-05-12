-- Remove Arcade Machine from Personal Rooms.
-- Older production data sometimes contained the arcade machine as a placed item.
-- Fresh starter databases may have no matching item, so this is intentionally safe.

DELETE FROM room_items ri
USING items i, rooms r
WHERE ri.item_id = i.id
AND ri.room_id = r.id
AND i.model_url = 'arcade_machine.glb'
AND COALESCE(r.slug, '') NOT IN ('lounge', 'theater', 'default', 'theater2');
