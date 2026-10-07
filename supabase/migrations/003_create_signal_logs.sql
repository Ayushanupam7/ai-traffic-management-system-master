-- Signal state per intersection per tick
CREATE TABLE signal_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    sim_time FLOAT NOT NULL,
    intersection_id TEXT REFERENCES intersections(id),
    phase_index INTEGER NOT NULL,
    state_string TEXT NOT NULL,
    phase_duration_s FLOAT,
    is_preempted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signal_logs_run_tick ON signal_logs(run_id, tick);
CREATE INDEX idx_signal_logs_intersection ON signal_logs(intersection_id, run_id);
