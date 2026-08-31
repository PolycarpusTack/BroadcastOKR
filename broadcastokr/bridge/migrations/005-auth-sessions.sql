-- Cloud-edition identity: SSO-linked users and server-side sessions.
-- Additive; desktop ignores all of it.
ALTER TABLE users ADD COLUMN issuer TEXT;
ALTER TABLE users ADD COLUMN sub TEXT;
CREATE UNIQUE INDEX idx_users_issuer_sub ON users(issuer, sub) WHERE issuer IS NOT NULL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);
