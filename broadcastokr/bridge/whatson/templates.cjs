/** Preset KPI SQL templates, per dialect. */

const oracleTemplates = [
  {
    name: 'Transmissions This Month',
    description: 'Count of transmissions scheduled in the current month',
    sql: `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_TXDATE >= TRUNC(SYSDATE, 'MM') AND TX_TXDATE < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)`,
    unit: 'tx', direction: 'hi', target: 100, dbType: 'oracle',
  },
  {
    name: 'Transmissions with Live Subtitling',
    description: 'Count of transmissions with live subtitling enabled',
    sql: `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_LIVESUBTITLING = 1 AND TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
    unit: 'tx', direction: 'hi', target: 50, timeframeDays: 30, dbType: 'oracle',
  },
  {
    name: 'Materials Ready for Playout',
    description: 'Count of materials marked ready for replication',
    sql: `SELECT COUNT(*) AS value FROM PSI.PSIMATERIALPART WHERE MAT_READYFORREP = 1`,
    unit: 'items', direction: 'hi', target: 100, dbType: 'oracle',
  },
  {
    name: 'Schedule Fill Rate',
    description: 'Percentage of active schedules vs total',
    sql: `SELECT ROUND(SUM(CASE WHEN SCH_ISACTIVE = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS value FROM PSI.PSISCHEDULE`,
    unit: '%', direction: 'hi', target: 95, dbType: 'oracle',
  },
  {
    name: 'Transmissions per Channel',
    description: 'Count of transmissions for a specific channel',
    sql: `SELECT COUNT(*) AS value FROM PSI.PSITRANSMISSION WHERE TX_ID_CHANNEL = :channel_id AND TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
    unit: 'tx', direction: 'hi', target: 30, timeframeDays: 30, dbType: 'oracle',
  },
  {
    name: 'Average Transmission Duration',
    description: 'Average duration of transmissions in seconds',
    sql: `SELECT ROUND(AVG(TX_ICDURATION), 0) AS value FROM PSI.PSITRANSMISSION WHERE TX_ICDURATION > 0 AND TX_TXDATE >= :start_date AND TX_TXDATE <= :end_date`,
    unit: 's', direction: 'hi', target: 1800, timeframeDays: 30, dbType: 'oracle',
  },
];

const postgresTemplates = [
  {
    name: 'Transmissions This Month',
    description: 'Count of transmissions scheduled in the current month',
    sql: `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_txdate >= date_trunc('month', CURRENT_DATE) AND tx_txdate < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
    unit: 'tx', direction: 'hi', target: 100, dbType: 'postgres',
  },
  {
    name: 'Transmissions with Live Subtitling',
    description: 'Count of transmissions with live subtitling enabled',
    sql: `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_livesubtitling = 1 AND tx_txdate >= :start_date AND tx_txdate <= :end_date`,
    unit: 'tx', direction: 'hi', target: 50, timeframeDays: 30, dbType: 'postgres',
  },
  {
    name: 'Materials Ready for Playout',
    description: 'Count of materials marked ready for replication',
    sql: `SELECT COUNT(*) AS value FROM psi.psimaterialpart WHERE mat_readyforrep = 1`,
    unit: 'items', direction: 'hi', target: 100, dbType: 'postgres',
  },
  {
    name: 'Schedule Fill Rate',
    description: 'Percentage of active schedules vs total',
    sql: `SELECT ROUND(SUM(CASE WHEN sch_isactive = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1) AS value FROM psi.psischedule`,
    unit: '%', direction: 'hi', target: 95, dbType: 'postgres',
  },
  {
    name: 'Transmissions per Channel',
    description: 'Count of transmissions for a specific channel',
    sql: `SELECT COUNT(*) AS value FROM psi.psitransmission WHERE tx_id_channel = :channel_id AND tx_txdate >= :start_date AND tx_txdate <= :end_date`,
    unit: 'tx', direction: 'hi', target: 30, timeframeDays: 30, dbType: 'postgres',
  },
  {
    name: 'Average Transmission Duration',
    description: 'Average duration of transmissions in seconds',
    sql: `SELECT ROUND(AVG(tx_icduration), 0) AS value FROM psi.psitransmission WHERE tx_icduration > 0 AND tx_txdate >= :start_date AND tx_txdate <= :end_date`,
    unit: 's', direction: 'hi', target: 1800, timeframeDays: 30, dbType: 'postgres',
  },
];

/** Templates for the dialects the config actually has (Oracle when nothing is configured). */
function getKpiTemplates(config) {
  const hasOracle = config.connections.some(c => c.type === 'oracle');
  const hasPostgres = config.connections.some(c => c.type === 'postgres');

  const templates = [];
  if (hasOracle || !hasPostgres) templates.push(...oracleTemplates);
  if (hasPostgres) templates.push(...postgresTemplates);
  return templates;
}

module.exports = { getKpiTemplates };
