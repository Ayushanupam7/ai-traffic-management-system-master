-- Variants now span two policy families: arterial-grid (ActuatedPolicyParams)
-- and highway ramp metering (AlineaPolicyParams). The family column tags
-- which schema the JSONB `params` follows so the /policy editor and the
-- LLM suggester can route correctly.
ALTER TABLE policy_variants
    ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'arterial';

-- Backfill any pre-existing rows (created when only arterial existed)
-- so legacy variants keep showing up under the arterial family.
UPDATE policy_variants SET family = 'arterial' WHERE family IS NULL;
