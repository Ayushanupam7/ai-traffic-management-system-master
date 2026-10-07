-- Named ActuatedPolicyParams, tunable from the dashboard, comparable in /comparison.
CREATE TABLE policy_variants (
    name        TEXT PRIMARY KEY,
    params      JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
