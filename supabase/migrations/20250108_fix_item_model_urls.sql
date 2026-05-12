-- Fix model_url case to match actual file names in /assets/
-- The files are PascalCase (Chair.glb) but the original seed was lowercase (chair.glb)

UPDATE items SET model_url = 'Chair.glb' WHERE model_url = 'chair.glb';
UPDATE items SET model_url = 'Table.glb' WHERE model_url = 'table.glb';
UPDATE items SET model_url = 'Couch.glb' WHERE model_url = 'couch.glb';
UPDATE items SET model_url = 'Lamp.glb' WHERE model_url = 'lamp.glb';

-- Also insert Couch if it doesn't exist (original seed had 'bed' not 'couch')
INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES ('Cozy Couch', 'A comfortable couch', 'furniture', 'Couch.glb', 'couch_thumb.png', 0, '{"width": 2, "height": 1, "depth": 3}', 'floor')
ON CONFLICT DO NOTHING;
