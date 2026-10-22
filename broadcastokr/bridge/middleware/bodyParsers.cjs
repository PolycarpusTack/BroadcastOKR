const express = require('express');

/** Bulk state uploads: an import or first-connect migration carries KR history. */
const BULK_JSON_PATHS = ['/api/sync/import', '/api/sync/migrate-from-local'];
const BULK_JSON_LIMIT = '20mb';

/**
 * JSON body parsing. Bulk uploads outgrow body-parser's 100 KB default (an
 * export with history is megabytes); every other route keeps it. A body parsed
 * by the bulk parser is skipped by the default one.
 */
function mountJsonParsers(app) {
  app.use(BULK_JSON_PATHS, express.json({ limit: BULK_JSON_LIMIT }));
  app.use(express.json());
}

module.exports = { mountJsonParsers, BULK_JSON_PATHS, BULK_JSON_LIMIT };
