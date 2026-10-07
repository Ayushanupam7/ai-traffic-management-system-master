-- Reference data for the 3x2 arterial grid (6 intersections: A0, A1, B0, B1, C0, C1)
CREATE TABLE intersections (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    grid_row INTEGER NOT NULL,
    grid_col INTEGER NOT NULL,
    x_coord FLOAT NOT NULL,
    y_coord FLOAT NOT NULL,
    num_phases INTEGER NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
