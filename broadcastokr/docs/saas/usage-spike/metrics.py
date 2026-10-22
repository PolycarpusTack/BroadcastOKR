"""Candidate WHATS'ON usage metrics — one number each (`AS value`), the live-KR shape.

Every metric has a PostgreSQL and an Oracle text. Only the PostgreSQL text has been
run (brokr_usage_lab + the wonpoc structure); the Oracle text is a reviewed draft.
`basis` records how sure we are of the column meaning: observed (structure seen)
or inferred (meaning guessed from the name, needs Mediagenix confirmation).
"""

# Module from the table a transaction touched (T3TTABLEMETRIC.T3MT_TABLENAME). Prefix map, inferred.
MODULE_CASE = """CASE
      WHEN UPPER(tm.t3mt_tablename) LIKE 'FSM%' OR UPPER(tm.t3mt_tablename) LIKE 'CM2AMORTIZ%' OR UPPER(tm.t3mt_tablename) LIKE 'CM2PAYMENT%' THEN 'finance'
      WHEN UPPER(tm.t3mt_tablename) LIKE 'CM%'  THEN 'contracts'
      WHEN UPPER(tm.t3mt_tablename) LIKE 'MM2%' THEN 'media'
      WHEN UPPER(tm.t3mt_tablename) LIKE 'TM%'  THEN 'trailers'
      WHEN UPPER(tm.t3mt_tablename) LIKE 'PG%'  THEN 'epg'
      WHEN UPPER(tm.t3mt_tablename) LIKE 'ARL%' THEN 'asrun'
      WHEN UPPER(tm.t3mt_tablename) LIKE 'PSIPRODUCT%' THEN 'content'
      WHEN UPPER(tm.t3mt_tablename) IN ('PSITRANSMISSION','PSITXBLOCK','PSISCHEDULE') OR UPPER(tm.t3mt_tablename) LIKE 'PL%' THEN 'planning'
      ELSE 'other' END"""

METRICS = [
    # ---------------------------------------------------------------- Adoptie
    dict(id="usage-active-users-30d", group="Adoptie", name="Actieve gebruikers (30 d)", unit="users", direction="higher",
         basis="inferred: T3M_ISSERVICE=0 means a person, not a background service",
         pg="SELECT COUNT(DISTINCT t3m_username) AS value FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30",
         ora="SELECT COUNT(DISTINCT T3M_USERNAME) AS value FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30"),
    dict(id="usage-active-users-7d", group="Adoptie", name="Actieve gebruikers (7 d)", unit="users", direction="higher",
         basis="inferred: as above",
         pg="SELECT COUNT(DISTINCT t3m_username) AS value FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 7",
         ora="SELECT COUNT(DISTINCT T3M_USERNAME) AS value FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 7"),
    dict(id="usage-seat-utilisation", group="Adoptie", name="Benutting accounts (%)", unit="%", direction="higher",
         basis="inferred: enabled person accounts = PSIUSER not disabled and not server user",
         pg="""SELECT ROUND(100.0 * (SELECT COUNT(DISTINCT t3m_username) FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30)
       / NULLIF((SELECT COUNT(*) FROM psi.psiuser WHERE COALESCE(usr_isdisabled, 0) = 0 AND COALESCE(usr_isserveruser, 0) = 0), 0), 1) AS value""",
         ora="""SELECT ROUND(100 * (SELECT COUNT(DISTINCT T3M_USERNAME) FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30)
       / NULLIF((SELECT COUNT(*) FROM PSI.PSIUSER WHERE NVL(USR_ISDISABLED, 0) = 0 AND NVL(USR_ISSERVERUSER, 0) = 0), 0), 1) AS value FROM DUAL"""),
    dict(id="usage-dormant-accounts", group="Adoptie", name="Slapende accounts (> 60 d niet ingelogd)", unit="accounts", direction="lower",
         basis="observed: USR_LASTLOGONTIME exists; that it is updated at every logon is inferred",
         pg="SELECT COUNT(*) AS value FROM psi.psiuser WHERE COALESCE(usr_isdisabled, 0) = 0 AND COALESCE(usr_isserveruser, 0) = 0 AND (usr_lastlogontime IS NULL OR usr_lastlogontime < CURRENT_DATE - 60)",
         ora="SELECT COUNT(*) AS value FROM PSI.PSIUSER WHERE NVL(USR_ISDISABLED, 0) = 0 AND NVL(USR_ISSERVERUSER, 0) = 0 AND (USR_LASTLOGONTIME IS NULL OR USR_LASTLOGONTIME < TRUNC(SYSDATE) - 60)"),
    dict(id="usage-stickiness", group="Adoptie", name="Dagelijks gebruik t.o.v. maandelijks (%)", unit="%", direction="higher",
         basis="inferred: average distinct people per weekday / distinct people in 30 d",
         pg="""SELECT ROUND(100.0 * AVG(d.users) / NULLIF((SELECT COUNT(DISTINCT t3m_username) FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30), 0), 1) AS value
FROM (SELECT t3m_timestamp_day, COUNT(DISTINCT t3m_username) AS users FROM psi.t3tmetric
      WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30 AND EXTRACT(ISODOW FROM t3m_timestamp_day) < 6
      GROUP BY t3m_timestamp_day) d""",
         ora="""SELECT ROUND(100 * AVG(d.users) / NULLIF((SELECT COUNT(DISTINCT T3M_USERNAME) FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30), 0), 1) AS value
FROM (SELECT T3M_TIMESTAMP_DAY, COUNT(DISTINCT T3M_USERNAME) AS users FROM PSI.T3TMETRIC
      WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30 AND TO_CHAR(T3M_TIMESTAMP_DAY, 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') NOT IN ('SAT', 'SUN')
      GROUP BY T3M_TIMESTAMP_DAY) d"""),
    dict(id="usage-active-users-trend", group="Adoptie", name="Trend actieve gebruikers (30 d vs 30 d ervoor, %)", unit="%", direction="higher",
         basis="inferred: as usage-active-users-30d; early-warning signal for churn",
         pg="""SELECT ROUND(100.0 * (cur.n - prev.n) / NULLIF(prev.n, 0), 1) AS value FROM
 (SELECT COUNT(DISTINCT t3m_username) AS n FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30) cur,
 (SELECT COUNT(DISTINCT t3m_username) AS n FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 60 AND t3m_timestamp < CURRENT_DATE - 30) prev""",
         ora="""SELECT ROUND(100 * (cur.n - prev.n) / NULLIF(prev.n, 0), 1) AS value FROM
 (SELECT COUNT(DISTINCT T3M_USERNAME) AS n FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30) cur,
 (SELECT COUNT(DISTINCT T3M_USERNAME) AS n FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 60 AND T3M_TIMESTAMP < TRUNC(SYSDATE) - 30) prev"""),
    # ---------------------------------------------------------------- Intensiteit
    dict(id="usage-tx-per-weekday", group="Intensiteit", name="Opslagacties door mensen per werkdag (30 d)", unit="tx/day", direction="higher",
         basis="observed: one T3TMETRIC row per transaction (commit)",
         pg="""SELECT ROUND(COUNT(*) / 22.0, 0) AS value FROM psi.t3tmetric
WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30 AND EXTRACT(ISODOW FROM t3m_timestamp) < 6""",
         ora="""SELECT ROUND(COUNT(*) / 22, 0) AS value FROM PSI.T3TMETRIC
WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30 AND TO_CHAR(T3M_TIMESTAMP, 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') NOT IN ('SAT', 'SUN')"""),
    dict(id="usage-changes-30d", group="Intensiteit", name="Gewijzigde records door mensen (30 d)", unit="changes", direction="higher",
         basis="observed: T3M_NROFCHANGES",
         pg="SELECT COALESCE(SUM(t3m_nrofchanges), 0) AS value FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30",
         ora="SELECT NVL(SUM(T3M_NROFCHANGES), 0) AS value FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30"),
    dict(id="usage-automation-share", group="Intensiteit", name="Aandeel automatische verwerking (%)", unit="%", direction="higher",
         basis="inferred: T3M_ISSERVICE=1 means a background service",
         pg="SELECT ROUND(100.0 * SUM(CASE WHEN t3m_isservice = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS value FROM psi.t3tmetric WHERE t3m_timestamp >= CURRENT_DATE - 30",
         ora="SELECT ROUND(100 * SUM(CASE WHEN T3M_ISSERVICE = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS value FROM PSI.T3TMETRIC WHERE T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30"),
    # ---------------------------------------------------------------- Breedte
    dict(id="usage-modules-in-use", group="Breedte", name="Modules in gebruik (30 d, min. 50 acties)", unit="modules", direction="higher",
         basis="inferred: table-name prefix identifies the module",
         pg=f"""SELECT COUNT(*) AS value FROM (
  SELECT {MODULE_CASE} AS module
  FROM psi.t3tmetric m JOIN psi.t3ttablemetric tm ON tm.t3mt_id_t3metric = m.oid
  WHERE m.t3m_isservice = 0 AND m.t3m_timestamp >= CURRENT_DATE - 30
  GROUP BY 1 HAVING COUNT(DISTINCT m.oid) >= 50) x WHERE x.module <> 'other'""",
         ora=f"""SELECT COUNT(*) AS value FROM (
  SELECT {MODULE_CASE.replace('tm.t3mt_tablename', 'tm.T3MT_TABLENAME')} AS module, COUNT(DISTINCT m.OID) AS n
  FROM PSI.T3TMETRIC m JOIN PSI.T3TTABLEMETRIC tm ON tm.T3MT_ID_T3METRIC = m.OID
  WHERE m.T3M_ISSERVICE = 0 AND m.T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30
  GROUP BY {MODULE_CASE.replace('tm.t3mt_tablename', 'tm.T3MT_TABLENAME')}) x WHERE x.n >= 50 AND x.module <> 'other'"""),
    dict(id="usage-contract-users-30d", group="Breedte", name="Gebruikers in contracten & rechten (30 d)", unit="users", direction="higher",
         basis="inferred: CM2 tables = contracts/rights module (example of a per-module metric)",
         pg="""SELECT COUNT(DISTINCT m.t3m_username) AS value FROM psi.t3tmetric m JOIN psi.t3ttablemetric tm ON tm.t3mt_id_t3metric = m.oid
WHERE m.t3m_isservice = 0 AND m.t3m_timestamp >= CURRENT_DATE - 30 AND UPPER(tm.t3mt_tablename) LIKE 'CM%'
  AND UPPER(tm.t3mt_tablename) NOT LIKE 'CM2AMORTIZ%' AND UPPER(tm.t3mt_tablename) NOT LIKE 'CM2PAYMENT%'""",
         ora="""SELECT COUNT(DISTINCT m.T3M_USERNAME) AS value FROM PSI.T3TMETRIC m JOIN PSI.T3TTABLEMETRIC tm ON tm.T3MT_ID_T3METRIC = m.OID
WHERE m.T3M_ISSERVICE = 0 AND m.T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30 AND tm.T3MT_TABLENAME LIKE 'CM%'
  AND tm.T3MT_TABLENAME NOT LIKE 'CM2AMORTIZ%' AND tm.T3MT_TABLENAME NOT LIKE 'CM2PAYMENT%'"""),
    # ---------------------------------------------------------------- Werkprocessen
    dict(id="usage-product-status-changes", group="Werkprocessen", name="Productstatuswijzigingen (30 d)", unit="changes", direction="higher",
         basis="observed: PSIPRDSTATLOG with change timestamp",
         pg="SELECT COUNT(*) AS value FROM psi.psiprdstatlog WHERE prstat_datechanged >= CURRENT_DATE - 30",
         ora="SELECT COUNT(*) AS value FROM PSI.PSIPRDSTATLOG WHERE PRSTAT_DATECHANGED >= TRUNC(SYSDATE) - 30"),
    dict(id="usage-contract-status-changes", group="Werkprocessen", name="Contractstatuswijzigingen (30 d)", unit="changes", direction="higher",
         basis="observed: CM2CONTRACTSTATUSLOG with date",
         pg="SELECT COUNT(*) AS value FROM psi.cm2contractstatuslog WHERE csl_date >= CURRENT_DATE - 30",
         ora="SELECT COUNT(*) AS value FROM PSI.CM2CONTRACTSTATUSLOG WHERE CSL_DATE >= TRUNC(SYSDATE) - 30"),
    dict(id="usage-day-status-changes", group="Werkprocessen", name="Dagstatuswijzigingen planning (30 d)", unit="changes", direction="higher",
         basis="observed: WONDAYSTATUSLOGENTRY; which status means 'final' is unknown",
         pg="SELECT COUNT(*) AS value FROM psi.wondaystatuslogentry WHERE dsl_timestamp >= CURRENT_DATE - 30",
         ora="SELECT COUNT(*) AS value FROM PSI.WONDAYSTATUSLOGENTRY WHERE DSL_TIMESTAMP >= TRUNC(SYSDATE) - 30"),
    # ---------------------------------------------------------------- Platform
    dict(id="platform-days-since-upgrade", group="Platform", name="Dagen sinds laatste installatie/upgrade", unit="days", direction="lower",
         basis="observed: MGXINSTALLATIONHISTORY; whether patches also count is unknown",
         pg="SELECT (CURRENT_DATE - MAX(ih_installationtimestamp)::date) AS value FROM psi.mgxinstallationhistory",
         ora="SELECT TRUNC(SYSDATE - MAX(CAST(IH_INSTALLATIONTIMESTAMP AS DATE))) AS value FROM PSI.MGXINSTALLATIONHISTORY"),
    dict(id="platform-crashes-30d", group="Platform", name="Crashes (30 d)", unit="crashes", direction="lower",
         basis="observed: PSILOGGING.WONCRASHREPORTLOG; needs a grant on the PSILOGGING schema",
         pg="SELECT COUNT(*) AS value FROM psilogging.woncrashreportlog WHERE wcr_timestamp >= CURRENT_DATE - 30",
         ora="SELECT COUNT(*) AS value FROM PSILOGGING.WONCRASHREPORTLOG WHERE WCR_TIMESTAMP >= TRUNC(SYSDATE) - 30"),
    dict(id="platform-median-save-ms", group="Platform", name="Mediane opslagduur (30 d)", unit="ms", direction="lower",
         basis="inferred: T3M_DUR_TOTAL unit assumed milliseconds",
         pg="SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t3m_dur_total)::numeric, 0) AS value FROM psi.t3tmetric WHERE t3m_isservice = 0 AND t3m_timestamp >= CURRENT_DATE - 30",
         ora="SELECT ROUND(MEDIAN(T3M_DUR_TOTAL), 0) AS value FROM PSI.T3TMETRIC WHERE T3M_ISSERVICE = 0 AND T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30"),
]
