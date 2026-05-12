-- Add Long Shade Floor Lamp furniture item
-- Model and thumbnail are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES (
    'Long Shade Floor Lamp', 
    'A tall floor lamp with a long shade', 
    'decoration', 
    'lmap.glb', 
    'https://example.com/roomie-assets/furniture/lamp2_icon.png', 
    0, 
    '{"width": 1, "height": 2, "depth": 1}', 
    'floor'
)
ON CONFLICT DO NOTHING;
