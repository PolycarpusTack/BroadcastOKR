const fs = require('fs');
const path = require('path');

/**
 * Run pending SQL migrations from a migrations directory.
 * Tracks applied migrations in a _migrations table.
 * Returns the number of newly applied migrations.
 */
function runMigrations(db, migrationsDir) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map(r => r.name)
  );

  if (!fs.existsSync(migrationsDir)) return 0;
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    console.log(`  [migration] Applied: ${file}`);
    count++;
  }

  return count;
}

module.exports = { runMigrations };
