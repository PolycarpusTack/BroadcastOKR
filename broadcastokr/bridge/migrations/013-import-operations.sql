-- Receipts make a transport retry replay-safe for both append and replace.
CREATE TABLE import_operations (
  operation_id TEXT PRIMARY KEY,
  principal TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
