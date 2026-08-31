const fs = require('fs');
const { atomicWriteJSON } = require('../utils/atomicWrite.cjs');

/** Connection + KPI-definition config and KPI history, file-backed. */
function createConfigStore({ configPath, historyPath }) {
  function loadConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch { return { connections: [], kpiDefinitions: [], pollIntervalMs: 900000 }; }
  }

  function saveConfig(config) {
    atomicWriteJSON(configPath, config);
  }

  function loadHistory() {
    try { return JSON.parse(fs.readFileSync(historyPath, 'utf8')); }
    catch { return {}; }
  }

  function saveHistory(history) {
    atomicWriteJSON(historyPath, history);
  }

  return { loadConfig, saveConfig, loadHistory, saveHistory };
}

module.exports = { createConfigStore };
