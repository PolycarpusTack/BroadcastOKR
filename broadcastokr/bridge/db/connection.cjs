const Database = require('better-sqlite3');

/**
 * Create and configure a SQLite database connection.
 * Enables WAL mode for better concurrency and foreign keys for referential integrity.
 */
function createDB(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

module.exports = { createDB };
