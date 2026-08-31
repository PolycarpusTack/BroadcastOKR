-- Per-KR "shared with Mediagenix" opt-in (Client Edition). Additive; egress
-- enforcement (allowlist projector + FF-4) arrives with the cockpit channel.
ALTER TABLE key_results ADD COLUMN shared_with_mediagenix INTEGER NOT NULL DEFAULT 0;
