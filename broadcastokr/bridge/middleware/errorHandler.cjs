/**
 * Global Express error handler.
 * Catches unhandled errors in route handlers, logs the full error, and answers
 * with a sanitized status. A SQLite constraint failure (foreign key, unique,
 * not-null, check) is the caller's payload being wrong — a goal whose owner is
 * a name instead of a user id (R1 rig, finding 19) — so it is a 400 that names
 * the constraint, not an opaque 500.
 */
function constraintDetail(err) {
  const code = String(err?.code || '');
  if (!code.startsWith('SQLITE_CONSTRAINT')) return null;
  const kind = code.replace('SQLITE_CONSTRAINT_', '').replace('SQLITE_CONSTRAINT', 'CONSTRAINT').toLowerCase();
  return { error: 'constraint_violation', constraint: kind, detail: String(err.message || '') };
}

function globalErrorHandler(err, req, res, _next) {
  const constraint = constraintDetail(err);
  if (constraint) {
    console.warn(`[${new Date().toISOString()}] Rejected ${req.method} ${req.path}: ${constraint.detail}`);
    return res.status(400).json(constraint);
  }
  console.error(`[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { globalErrorHandler, constraintDetail };
