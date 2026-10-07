-- CV pipeline detection output
CREATE TABLE cv_detections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID REFERENCES simulation_runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    intersection_id TEXT REFERENCES intersections(id),
    detections JSONB NOT NULL,
    inference_time_ms FLOAT,
    frame_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
