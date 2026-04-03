const fs = require('fs');

/**
 * Write JSON data to a file atomically.
 * Writes to a .tmp file first, then renames (atomic on same filesystem).
 */
function atomicWriteJSON(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

module.exports = { atomicWriteJSON };
