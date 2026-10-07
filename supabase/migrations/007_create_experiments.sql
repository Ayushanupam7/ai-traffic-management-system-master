-- N-way policy/config comparisons. Each experiment owns N experiment_runs,
-- each linked to a row in simulation_runs.

CREATE TABLE experiments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT,
    seed          INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'running',  -- running | completed | cancelled | failed
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_experiments_created ON experiments(created_at DESC);

CREATE TABLE experiment_runs (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id            UUID REFERENCES experiments(id) ON DELETE CASCADE,
    run_index                INTEGER NOT NULL,
    run_id                   UUID REFERENCES simulation_runs(id),
    config                   JSONB NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed | cancelled
    error                    TEXT,
    clearance_s              FLOAT,
    avg_trip_time_s          FLOAT,
    completed_trips          INTEGER,
    avg_control_delay_s      FLOAT,
    throughput_veh_per_min   FLOAT,
    UNIQUE(experiment_id, run_index)
);

CREATE INDEX idx_experiment_runs_exp ON experiment_runs(experiment_id);
