"""Write remote_check_oracle.sql: one read-only script support can run on a client's
WHATS'ON Oracle (DBeaver: Alt+X, or sqlplus). It returns counts and the metric values only —
no user names, no business rows. Regenerate after changing metrics.py."""
from pathlib import Path

from metrics import METRICS

HERE = Path(__file__).parent

PROFILE = [
    ("1 · Is usage logged, and how far back?", """SELECT 'T3TMETRIC' AS tabel, COUNT(*) AS rijen, MIN(T3M_TIMESTAMP) AS oudste, MAX(T3M_TIMESTAMP) AS nieuwste FROM PSI.T3TMETRIC
UNION ALL SELECT 'T3TTABLEMETRIC', COUNT(*), NULL, NULL FROM PSI.T3TTABLEMETRIC
UNION ALL SELECT 'PSIUSER', COUNT(*), MIN(USR_LASTLOGONTIME), MAX(USR_LASTLOGONTIME) FROM PSI.PSIUSER
UNION ALL SELECT 'PSIPRDSTATLOG', COUNT(*), MIN(PRSTAT_DATECHANGED), MAX(PRSTAT_DATECHANGED) FROM PSI.PSIPRDSTATLOG
UNION ALL SELECT 'CM2CONTRACTSTATUSLOG', COUNT(*), MIN(CAST(CSL_DATE AS TIMESTAMP)), MAX(CAST(CSL_DATE AS TIMESTAMP)) FROM PSI.CM2CONTRACTSTATUSLOG
UNION ALL SELECT 'WONDAYSTATUSLOGENTRY', COUNT(*), MIN(DSL_TIMESTAMP), MAX(DSL_TIMESTAMP) FROM PSI.WONDAYSTATUSLOGENTRY
UNION ALL SELECT 'MGXINSTALLATIONHISTORY', COUNT(*), MIN(IH_INSTALLATIONTIMESTAMP), MAX(IH_INSTALLATIONTIMESTAMP) FROM PSI.MGXINSTALLATIONHISTORY
UNION ALL SELECT 'AMUSERACTION', COUNT(*), NULL, NULL FROM PSI.AMUSERACTION
UNION ALL SELECT 'MGXPERFORMANCETRACELOG', COUNT(*), NULL, NULL FROM PSI.MGXPERFORMANCETRACELOG"""),
    ("2 · People vs services (counts only)", """SELECT T3M_ISSERVICE AS is_service, COUNT(*) AS transacties, COUNT(DISTINCT T3M_USERNAME) AS gebruikers
FROM PSI.T3TMETRIC WHERE T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30 GROUP BY T3M_ISSERVICE"""),
    ("3 · Application ids (last 30 days)", """SELECT T3M_APPLICATIONID AS application_id, COUNT(*) AS transacties FROM PSI.T3TMETRIC
WHERE T3M_TIMESTAMP >= TRUNC(SYSDATE) - 30 GROUP BY T3M_APPLICATIONID ORDER BY 2 DESC FETCH FIRST 25 ROWS ONLY"""),
    ("4 · Tables touched (last 7 days) — checks the module map", """SELECT tm.T3MT_TABLENAME AS tabel, COUNT(*) AS keer FROM PSI.T3TTABLEMETRIC tm JOIN PSI.T3TMETRIC m ON m.OID = tm.T3MT_ID_T3METRIC
WHERE m.T3M_TIMESTAMP >= TRUNC(SYSDATE) - 7 GROUP BY tm.T3MT_TABLENAME ORDER BY 2 DESC FETCH FIRST 40 ROWS ONLY"""),
    ("5 · Duration magnitude (unit check)", """SELECT MIN(T3M_DUR_TOTAL) AS min_dur, MEDIAN(T3M_DUR_TOTAL) AS mediaan_dur, MAX(T3M_DUR_TOTAL) AS max_dur
FROM PSI.T3TMETRIC WHERE T3M_TIMESTAMP >= TRUNC(SYSDATE) - 7"""),
]


def as_row(m):
    return f"SELECT '{m['id']}' AS meting, value FROM (\n{m['ora']}\n)"


psi = [m for m in METRICS if "PSILOGGING." not in m["ora"]]
log = [m for m in METRICS if "PSILOGGING." in m["ora"]]

parts = ["-- WHATS'ON usage check for BrOKR — READ-ONLY. Generated from metrics.py; do not edit by hand.",
         "-- Returns counts and metric values only: no user names, no business data.",
         "-- Run each statement in DBeaver (Alt+X runs all) or sqlplus. A failure in one statement",
         "-- (missing table or grant) is itself a finding — note it and continue.", ""]
for title, sql in PROFILE:
    parts += [f"-- PROFILE {title}", sql + ";", ""]
parts += ["-- METRICS (PSI schema)", "\nUNION ALL\n".join(as_row(m) for m in psi) + ";", ""]
parts += ["-- METRICS (PSILOGGING schema — needs a separate grant)", "\nUNION ALL\n".join(as_row(m) for m in log) + ";", ""]
(HERE / "remote_check_oracle.sql").write_text("\n".join(parts), encoding="utf-8")
print("written", len(psi) + len(log), "metrics")
