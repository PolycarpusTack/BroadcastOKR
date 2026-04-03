/**
 * Global Express error handler.
 * Catches unhandled errors in route handlers, logs the full error,
 * and returns a sanitized 500 response.
 */
function globalErrorHandler(err, req, res, _next) {
  console.error(`[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { globalErrorHandler };
