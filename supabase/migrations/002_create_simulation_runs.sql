-- One row per simulation session / experiment run
CREATE TABLE simulation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    policy_type TEXT NOT NULL,
    config JSONB NOT NULL,
    status TEXT DEFAULT 'running',
    total_ticks INTEGER,
    notes TEXT
);
