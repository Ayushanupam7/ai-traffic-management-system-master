-- Emergency vehicle events
CREATE TABLE emergency_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL,
    injected_at_tick INTEGER NOT NULL,
    route TEXT NOT NULL,
    preempted_intersections TEXT[],
    total_preemption_time_s FLOAT,
    response_time_s FLOAT,
    compensation_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
