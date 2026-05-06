-- Add desk and table furniture items
-- Models and thumbnails are in the furniture folder in R2

INSERT INTO items (name, description, category, model_url, thumbnail_url, price_coins, dimensions, placement_type)
VALUES
    ('White Coffee Table',
     'A clean white coffee table',
     'furniture',
     'white_coffee_table.glb',
     'https://example.com/roomie-assets/furniture/white_coffee_table_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 1}',
     'floor'),

    ('Simple Table',
     'A simple everyday table',
     'furniture',
     'simple_table.glb',
     'https://example.com/roomie-assets/furniture/simple_table_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 1}',
     'floor'),

    ('Simple Desk',
     'A straightforward desk for any room',
     'furniture',
     'simple_desk.glb',
     'https://example.com/roomie-assets/furniture/simple_desk_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 1}',
     'floor'),

    ('Plank Table',
     'A rustic plank-style table',
     'furniture',
     'plank_table.glb',
     'https://example.com/roomie-assets/furniture/plank_table_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 1}',
     'floor'),

    ('Minimalist Corner Desk',
     'A sleek minimalist corner desk',
     'furniture',
     'minimalist_corner_desk.glb',
     'https://example.com/roomie-assets/furniture/minimalist_corner_desk_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 2}',
     'floor'),

    ('Hipster Desk',
     'A trendy desk with character',
     'furniture',
     'hipster_desk.glb',
     'https://example.com/roomie-assets/furniture/hipster_table_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 1}',
     'floor'),

    ('Dope Desk',
     'A stylish modern desk',
     'furniture',
     'dope_desk.glb',
     'https://example.com/roomie-assets/furniture/dope_desk_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 1}',
     'floor'),

    ('Black Corner Desk',
     'A sleek black corner desk',
     'furniture',
     'black_corner_desk.glb',
     'https://example.com/roomie-assets/furniture/black_corner_desk_icon.png',
     0,
     '{"width": 2, "height": 1, "depth": 2}',
     'floor')

ON CONFLICT DO NOTHING;
