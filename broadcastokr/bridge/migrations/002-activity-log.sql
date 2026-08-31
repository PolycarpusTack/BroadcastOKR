-- Persistent activity log (previously in-memory only, lost on every reload)
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL,
  text TEXT NOT NULL,
  color TEXT
);

CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp);
