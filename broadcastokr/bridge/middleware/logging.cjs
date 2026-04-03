const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const fs = require('fs');
const path = require('path');

/**
 * Creates morgan request logging middleware.
 * Logs to rotating file in LOG_DIR and to stdout in dev mode.
 */
function createLoggingMiddleware() {
  const LOG_DIR = process.env.BRIDGE_LOG_DIR || path.join(__dirname, '..', 'logs');

  // Ensure log directory exists
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // Rotating file stream: daily rotation, keep 30 days
  const accessLogStream = rfs.createStream('bridge.log', {
    interval: '1d',
    path: LOG_DIR,
    maxFiles: 30,
  });

  // Custom format: [ISO timestamp] METHOD /path STATUS duration_ms
  const format = '[:date[iso]] :method :url :status :response-time ms';

  // Log to file always
  const fileLogger = morgan(format, { stream: accessLogStream });

  // Log to stdout in dev mode (when no API key — same heuristic as auth)
  const isDev = !process.env.BRIDGE_API_KEY;
  const consoleLogger = isDev ? morgan(format) : null;

  return function loggingMiddleware(req, res, next) {
    fileLogger(req, res, () => {});
    if (consoleLogger) consoleLogger(req, res, () => {});
    next();
  };
}

module.exports = { createLoggingMiddleware };
