"""Build brokr_usage_lab: one psi + psilogging schema pair per fictional client,
with the exact usage-table structure copied from wonpoc (FKs dropped)."""
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent  # wonpoc_usage_ddl.sql: pg_dump -s of the 10 usage tables from wonpoc
PSQL = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
CLIENTS = ["a", "b", "c"]  # a = actief, b = dalend, c = een module

ddl = (HERE / "wonpoc_usage_ddl.sql").read_text(encoding="utf-8")
# Split into statements on ';' at line end; drop FK constraints and pg_dump session noise.
stmts = [s.strip() for s in re.split(r";\s*\n", ddl) if s.strip()]
keep = []
for s in stmts:
    body = "\n".join(l for l in s.splitlines() if not l.startswith("--")).strip()
    if not body or "FOREIGN KEY" in body or body.startswith(("SET ", "SELECT pg_catalog", "\\")):
        continue
    keep.append(body)

out = ["DROP SCHEMA IF EXISTS " + ", ".join(f"{c}_psi, {c}_psilogging" for c in CLIENTS) + " CASCADE;"]
for c in CLIENTS:
    out.append(f"CREATE SCHEMA {c}_psi; CREATE SCHEMA {c}_psilogging;")
    for s in keep:
        s = re.sub(r"\bpsilogging\.", f"{c}_psilogging.", s)
        s = re.sub(r"\bpsi\.", f"{c}_psi.", s)
        out.append(s + ";")
sql = "\n".join(out)
(HERE / "lab_schema.sql").write_text(sql, encoding="utf-8")
r = subprocess.run([PSQL, "-h", "localhost", "-p", "5433", "-U", "postgres", "-d", "brokr_usage_lab",
                    "-v", "ON_ERROR_STOP=1", "-q", "-f", str(HERE / "lab_schema.sql")], capture_output=True, text=True)
print(r.returncode, r.stdout[-2000:], r.stderr[-2000:])
