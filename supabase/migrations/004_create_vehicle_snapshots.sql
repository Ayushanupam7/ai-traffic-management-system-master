-- Vehicle positions, sampled every N ticks
CREATE TABLE vehicle_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    vehicle_id TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    speed FLOAT NOT NULL,
    lane_id TEXT,
    accumulated_wait_s FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vehicle_snapshots_run_tick ON vehicle_snapshots(run_id, tick);
