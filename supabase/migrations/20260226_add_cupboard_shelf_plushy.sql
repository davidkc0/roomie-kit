-- Add cupboard, shelf, and plushy items
-- Models and thumbnails are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES
    ('Wooden Cupboard',
     'A sturdy wooden cupboard',
     'furniture',
     'wooden_cupboard.glb',
     'https://example.com/roomie-assets/furniture/wodden_cupboard_icon.png',
     0,
     '{"width": 2, "height": 2, "depth": 1}',
     'floor'),

    ('Basic Shelf',
     'A simple shelf for storage',
     'furniture',
     'basic_shelf.glb',
     'https://example.com/roomie-assets/furniture/basic_shelf_icon.png',
     0,
     '{"width": 2, "height": 2, "depth": 1}',
     'floor'),

    ('Chick Plushy',
     'An adorable chick plushy decoration',
     'decoration',
     'chick_plushy.glb',
     'https://example.com/roomie-assets/furniture/chick_plushy_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor')

ON CONFLICT DO NOTHING;
