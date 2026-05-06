-- Add chair furniture items
-- Models and thumbnails are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES
    ('Simple Chair',
     'A simple everyday chair',
     'furniture',
     'simle_chair.glb',
     'https://example.com/roomie-assets/furniture/simple_chair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Purple Beanbag Chair',
     'A comfy purple beanbag chair',
     'furniture',
     'purple_bean_bag_chair.glb',
     'https://example.com/roomie-assets/furniture/purple_bean_bag_chair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Pink Armchair',
     'A stylish pink armchair',
     'furniture',
     'pink_armchair.glb',
     'https://example.com/roomie-assets/furniture/pink_armchair.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Lounge Chair',
     'A relaxing lounge chair',
     'furniture',
     'lounge_chair.glb',
     'https://example.com/roomie-assets/furniture/lounge_chair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Goofy Ahh Chair',
     'A uniquely quirky chair',
     'furniture',
     'goofy_ahh_chair.glb',
     'https://example.com/roomie-assets/furniture/goofy_ahh_chair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Desk Chair',
     'A practical desk chair',
     'furniture',
     'desk_chair.glb',
     'https://example.com/roomie-assets/furniture/desk_chair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Black Armchair',
     'A sleek black armchair',
     'furniture',
     'black_armchair.glb',
     'https://example.com/roomie-assets/furniture/black_armchair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor'),

    ('Armchair',
     'A classic comfortable armchair',
     'furniture',
     'armchair.glb',
     'https://example.com/roomie-assets/furniture/armchair_icon.png',
     0,
     '{"width": 1, "height": 1, "depth": 1}',
     'floor')

ON CONFLICT DO NOTHING;
