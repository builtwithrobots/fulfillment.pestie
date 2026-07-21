-- Persist the latest AI analysis (plain-English summary + recommendations) for a
-- study so it survives a refresh, shows on the results screen, and prints in the
-- PDF export. Stored as JSON: { summary, recommendations: [{title, detail}], generatedAt }.
-- Nullable; null = no analysis has been generated yet. Re-running overwrites it.
alter table studies add column ai_analysis jsonb;
