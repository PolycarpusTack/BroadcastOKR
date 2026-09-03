-- R6-1: the operator channel. The cockpit keeps, per tenant, where the
-- instance lives and the per-instance operator token it presents there
-- (enc:v1: ciphertext under the cockpit's credential key). Additive (FF-6).
-- ADR: docs/gpm/state/r6-backlog-2026-09-03.md (ST0)

ALTER TABLE cockpit_tenants ADD COLUMN instance_url TEXT NOT NULL DEFAULT '';
ALTER TABLE cockpit_tenants ADD COLUMN operator_token TEXT NOT NULL DEFAULT '';
ALTER TABLE cockpit_tenants ADD COLUMN share_minted_at TEXT;
