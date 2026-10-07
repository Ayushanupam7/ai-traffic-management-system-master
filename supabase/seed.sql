-- Seed data for the 3x2 arterial grid (matches SUMO netgenerate IDs)
-- Grid layout (2 east-west arterials x 3 cross streets):
--   A1  B1  C1   <- north arterial
--   A0  B0  C0   <- south arterial
INSERT INTO intersections (id, label, grid_row, grid_col, x_coord, y_coord, num_phases) VALUES
    ('A0', 'Intersection A0', 1, 0,   0.0,   0.0, 4),
    ('A1', 'Intersection A1', 0, 0,   0.0, 500.0, 4),
    ('B0', 'Intersection B0', 1, 1, 700.0,   0.0, 4),
    ('B1', 'Intersection B1', 0, 1, 700.0, 500.0, 4),
    ('C0', 'Intersection C0', 1, 2, 1400.0,  0.0, 4),
    ('C1', 'Intersection C1', 0, 2, 1400.0, 500.0, 4)
ON CONFLICT (id) DO NOTHING;
