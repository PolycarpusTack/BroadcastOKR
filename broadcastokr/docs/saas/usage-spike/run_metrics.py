"""Run every candidate metric: bridge envelope check (pg + oracle text), then the
PostgreSQL text read-only against the three lab clients and the real wonpoc structure."""
import json
import re
import subprocess
import time
from pathlib import Path

import psycopg2

from metrics import METRICS

HERE = Path(__file__).parent
BRIDGE = Path(r"C:\Projects\Other\BroadcastOKR\broadcastokr\bridge\whatson\sqlEnvelope.cjs")

# 1. The bridge's own read-only gate must accept every text, both dialects.
texts = [s for m in METRICS for s in (m["pg"], m["ora"])]
js = ("const {assertReadOnlySelect}=require(process.argv[1]);const t=JSON.parse(require('fs').readFileSync(0,'utf8'));"
      "t.forEach((s,i)=>{try{assertReadOnlySelect(s)}catch(e){console.log('REJECT',i,e.message)}});console.log('envelope checked',t.length)")
r = subprocess.run(["node", "-e", js, str(BRIDGE)], input=json.dumps(texts), capture_output=True, text=True)
print(r.stdout.strip(), r.stderr.strip())


def for_schema(sql, key):
    if key is None:
        return sql
    return re.sub(r"\bpsi\.", f"{key}_psi.", re.sub(r"\bpsilogging\.", f"{key}_psilogging.", sql))


def run(db, key):
    con = psycopg2.connect(host="localhost", port=5433, user="postgres", dbname=db)
    con.set_session(readonly=True, autocommit=False)
    out = {}
    with con.cursor() as cur:
        for m in METRICS:
            t = time.perf_counter()
            try:
                cur.execute(for_schema(m["pg"], key))
                rows = cur.fetchall()
                assert len(rows) == 1 and len(rows[0]) == 1 and cur.description[0].name == "value", "not one value"
                v = rows[0][0]
                out[m["id"]] = (None if v is None else float(v), round((time.perf_counter() - t) * 1000))
            except Exception as e:  # noqa: BLE001 - report and continue
                con.rollback()
                out[m["id"]] = ("ERR " + str(e).splitlines()[0], 0)
    con.close()
    return out


results = {"A actief": run("brokr_usage_lab", "a"), "B dalend": run("brokr_usage_lab", "b"),
           "C 1 module": run("brokr_usage_lab", "c"), "wonpoc": run("wonpoc", None)}
cols = list(results)
print(f"\n{'meting':52}" + "".join(f"{c:>12}" for c in cols) + "   max ms")
for m in METRICS:
    vals = [results[c][m["id"]] for c in cols]
    cells = "".join(f"{('-' if v is None else v if isinstance(v, str) else f'{v:g}')[:11]:>12}" for v, _ in vals)
    print(f"{m['name'][:52]:52}{cells}   {max(ms for _, ms in vals)}")
(HERE / "results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
