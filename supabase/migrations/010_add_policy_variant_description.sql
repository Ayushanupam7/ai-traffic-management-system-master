-- Add a human-readable description to saved policy variants so the
-- /policy page list can show what each variant is for at a glance.
ALTER TABLE policy_variants ADD COLUMN IF NOT EXISTS description TEXT;
