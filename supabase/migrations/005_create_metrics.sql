-- End-of-cycle aggregates (one row per intersection per ~116s cycle)
CREATE TABLE intersection_metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    sim_time FLOAT NOT NULL,
    intersection_id TEXT REFERENCES intersections(id),
    queue_length_n INTEGER,
    queue_length_s INTEGER,
    queue_length_e INTEGER,
    queue_length_w INTEGER,
    total_vehicles INTEGER,
    avg_wait_s FLOAT,
    phase_index INTEGER,
    phase_remaining_s FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_intersection_metrics_run ON intersection_metrics(run_id, tick);
CREATE INDEX idx_intersection_metrics_inter ON intersection_metrics(intersection_id, run_id);

-- System-wide end-of-cycle aggregates (one row per cycle, anchored on B0)
CREATE TABLE global_metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    sim_time FLOAT NOT NULL,
    total_vehicles INTEGER,
    total_completed INTEGER,
    completed_trips INTEGER,
    avg_delay_s FLOAT,
    avg_trip_time_s FLOAT,
    avg_control_delay_s FLOAT,
    control_delay_samples INTEGER,
    throughput_veh_per_min FLOAT,
    total_halting INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_global_metrics_run ON global_metrics(run_id, tick);
