"""Fill brokr_usage_lab with FICTIONAL WHATS'ON usage data for three client profiles.

a = actief      : steady, broad use of many modules, recent upgrade
b = dalend      : users and activity decline over the period, crashes rise, old version
c = een module  : steady but only planning + content; a third of the licensed accounts never used

Everything here is invented. Column semantics that are unknown in real WHATS'ON
(application/action ids, duration unit) get plausible placeholders; the metrics
must not depend on them.
"""
import io
import math
import random
from datetime import datetime, timedelta, date

import psycopg2

TODAY = datetime(2026, 10, 1, 9, 0)
DAYS = 180
START = (TODAY - timedelta(days=DAYS)).replace(hour=0, minute=0)

MODULE_TABLES = {
    "planning": ["PSITRANSMISSION", "PSITXBLOCK", "PSISCHEDULE"],
    "content": ["PSIPRODUCTPART"],
    "media": ["MM2MEDIAASSET", "MM2VIDEOCOMPONENT"],
    "contracts": ["CM2CONTRACT", "CM2BROADCASTRIGHT"],
    "finance": ["FSMFINANCIALSTOCKCHANGE", "CM2AMORTIZATION"],
    "trailers": ["TMTRAILERPROTOTYPE", "TMTRAILERCAMPAIGN"],
    "epg": ["PGPROGRAMGUIDERECORD"],
    "asrun": ["ARLASRUNLOGRECORD"],
}

PROFILES = {
    "a": dict(humans=40, disabled=3, never=2, services=4,
              active=lambda f: 0.85, txs=lambda f: 30,
              modules={"planning": .30, "content": .18, "media": .15, "contracts": .12,
                       "finance": .07, "trailers": .07, "epg": .06, "asrun": .05},
              drop_contracts_after=None, crash=lambda f: 0.3, perf=lambda f: 1.0,
              installs=[("2025-09-15", "2025r3"), ("2026-02-10", "2026r1"), ("2026-08-04", "2026r3")],
              channels=6),
    "b": dict(humans=30, disabled=2, never=1, services=3,
              active=lambda f: 0.80 - 0.60 * f, txs=lambda f: 25 - 15 * f,
              modules={"planning": .45, "content": .25, "media": .18, "contracts": .12},
              drop_contracts_after=0.65, crash=lambda f: 0.2 + 1.8 * f, perf=lambda f: 1.0 + 1.5 * f,
              installs=[("2024-11-20", "2024r4"), ("2025-08-12", "2025r1")],
              channels=4),
    "c": dict(humans=15, disabled=0, never=5, services=1,
              active=lambda f: 0.70, txs=lambda f: 22,
              modules={"planning": .75, "content": .25},
              drop_contracts_after=None, crash=lambda f: 0.1, perf=lambda f: 1.0,
              installs=[("2025-04-02", "2025r1"), ("2026-04-01", "2026r1")],
              channels=2),
}

FIRST = ["An", "Bart", "Cleo", "Dirk", "Els", "Filip", "Greet", "Hans", "Ines", "Jan", "Katrien", "Luc",
         "Mira", "Nick", "Olga", "Pieter", "Quinten", "Ruth", "Sam", "Tine", "Ulrike", "Vera", "Wim", "Xavier",
         "Yasmine", "Zeno"]
LAST = ["Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens", "Wouters", "Dubois"]


def copy(cur, table, cols, rows):
    buf = io.StringIO()
    for r in rows:
        buf.write("\t".join("\\N" if v is None else str(v) for v in r) + "\n")
    buf.seek(0)
    cur.copy_expert(f"COPY {table} ({', '.join(cols)}) FROM STDIN", buf)


def poisson(rng, lam):
    if lam <= 0:
        return 0
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def build(cur, key, prof):
    rng = random.Random(f"lab-{key}")
    psi, log = f"{key}_psi", f"{key}_psilogging"
    oid = iter(range(1, 10**9))

    # --- users: psiuseridentification <-> psiuser -----------------------------------------
    users = []  # (usi_oid, usr_oid, username, kind) kind: human/never/disabled/service
    for i in range(prof["humans"] + prof["services"]):
        if i < prof["services"]:
            kind, uname, fn, ln = "service", f"svc_{['publish', 'import', 'asrun', 'sync'][i % 4]}{i}", None, None
        else:
            fn, ln = rng.choice(FIRST), rng.choice(LAST)
            uname = f"{fn[0]}{ln}{i}".lower()
            h = i - prof["services"]
            kind = "disabled" if h < prof["disabled"] else "never" if h < prof["disabled"] + prof["never"] else "human"
        users.append([next(oid), next(oid), uname, kind, fn, ln])

    # --- activity: t3tmetric + t3ttablemetric -----------------------------------------------
    t3, t3t, last_seen = [], [], {}
    mods, weights = zip(*prof["modules"].items())
    # People churn individually in the declining profile: each human gets a personal "leave" point.
    leave = {u[2]: (rng.random() if key == "b" else 2.0) for u in users}
    for d in range(DAYS):
        day = START + timedelta(days=d)
        f = d / (DAYS - 1)
        weekend = day.weekday() >= 5
        for usi, _, uname, kind, _, _ in users:
            if kind in ("never", "disabled"):
                continue
            service = kind == "service"
            if service:
                n = poisson(rng, 60)
            else:
                if f > leave[uname] + 0.15 or rng.random() > prof["active"](f) * (0.08 if weekend else 1):
                    continue
                n = max(1, poisson(rng, prof["txs"](f)))
            for _ in range(n):
                ts = day + timedelta(seconds=rng.randint(0, 86399) if service else rng.randint(7 * 3600, 18 * 3600))
                if service:
                    mod = "planning" if rng.random() < .6 else "asrun" if "asrun" in prof["modules"] else "content"
                else:
                    mod = rng.choices(mods, weights)[0]
                    if mod == "contracts" and prof["drop_contracts_after"] and f > prof["drop_contracts_after"]:
                        mod = "planning"
                tables = rng.sample(MODULE_TABLES[mod], k=min(len(MODULE_TABLES[mod]), rng.choice([1, 1, 2])))
                ins, upd, dele = rng.choice([0, 0, 1, 2]), rng.randint(1, 6), rng.choice([0] * 8 + [1])
                total = int(rng.lognormvariate(math.log(150), 0.6) * prof["perf"](f))
                m = next(oid)
                t3.append((m, int(service), 0, rng.choice([0, 1]), ins + upd + dele, ins, upd, dele,
                           f"{mod.capitalize()}App", f"{mod}.save", f"S{usi}-{d}", ts,
                           ts.replace(hour=0, minute=0, second=0), ts.replace(minute=0, second=0),
                           ts.replace(second=0), total, int(total * .7), int(total * .2), uname, "fictief-build"))
                for t in tables:
                    t3t.append((next(oid), m, t, ins, upd, dele))
                if not service:
                    last_seen[uname] = max(last_seen.get(uname, ts), ts)

    copy(cur, f"{psi}.t3tmetric",
         ["oid", "t3m_isservice", "t3m_ismultiuserupdate", "t3m_dialogwasopened", "t3m_nrofchanges",
          "t3m_nrofinserts", "t3m_nrofupdates", "t3m_nrofdeletes", "t3m_applicationid", "t3m_actionid",
          "t3m_sessionid", "t3m_timestamp", "t3m_timestamp_day", "t3m_timestamp_hour", "t3m_timestamp_minute",
          "t3m_dur_total", "t3m_dur_transaction", "t3m_dur_commit", "t3m_username", "t3m_buildversion"], t3)
    copy(cur, f"{psi}.t3ttablemetric",
         ["oid", "t3mt_id_t3metric", "t3mt_tablename", "t3mt_nrofinserts", "t3mt_nrofupdates", "t3mt_nrofdeletes"], t3t)

    copy(cur, f"{psi}.psiuseridentification",
         ["oid", "obj_datecreated", "usi_firstname", "usi_lastname", "usi_id_user", "usi_username"],
         [(usi, START - timedelta(days=400), fn, ln, usr, uname) for usi, usr, uname, _, fn, ln in users])
    copy(cur, f"{psi}.psiuser",
         ["oid", "obj_datecreated", "usr_id_useridentification", "usr_isdisabled", "usr_isserveruser",
          "usr_lastlogontime", "usr_accesstype", "usr_external_reference"],
         [(usr, START - timedelta(days=400), usi, int(kind == "disabled"), int(kind == "service"),
           (TODAY - timedelta(minutes=5)) if kind == "service" else last_seen.get(uname)
           if kind == "human" else (START - timedelta(days=300)) if kind == "disabled" else None,
           "server" if kind == "service" else "full", f"ext-{key}-{usr}")
          for usi, usr, uname, kind, _, _ in users])

    # --- workflow logs --------------------------------------------------------------------
    humans = [u for u in users if u[3] == "human"]
    prd, csl, dsl = [], [], []
    for d in range(DAYS):
        day = START + timedelta(days=d)
        f = d / (DAYS - 1)
        if day.weekday() >= 5:
            continue
        scale = prof["active"](f) / 0.85
        for _ in range(poisson(rng, 12 * scale)):
            u = rng.choice(humans)
            prd.append((next(oid), day + timedelta(hours=rng.uniform(8, 18)), rng.randint(1, 400), rng.randint(1, 5), u[0]))
        if "contracts" in prof["modules"] and not (prof["drop_contracts_after"] and f > prof["drop_contracts_after"]):
            for _ in range(poisson(rng, 2 * scale)):
                u = rng.choice(humans)
                csl.append((next(oid), (day + timedelta(days=0)).date(), rng.randint(1, 80), rng.randint(1, 4), u[0]))
        # day status: each channel's broadcast day (~10 days ahead) gets finalised; the declining client skips more
        for ch in range(1, prof["channels"] + 1):
            if rng.random() < 0.95 * scale:
                dsl.append((next(oid), ch, rng.randint(1, 3), day + timedelta(hours=rng.uniform(9, 17)),
                            (day + timedelta(days=10)).date()))
    copy(cur, f"{psi}.psiprdstatlog", ["oid", "prstat_datechanged", "product_ref", "prstat_productstat", "prstat_userchanged"], prd)
    copy(cur, f"{psi}.cm2contractstatuslog", ["oid", "csl_date", "csl_id_contract", "csl_id_contractstatus", "csl_id_user"], csl)
    copy(cur, f"{psi}.wondaystatuslogentry", ["oid", "dsl_id_channel", "dsl_id_daystatus", "dsl_timestamp", "dsl_txdate"], dsl)

    # --- platform: installs + crashes -----------------------------------------------------------
    copy(cur, f"{psi}.mgxinstallationhistory",
         ["oid", "ih_installationtimestamp", "ih_installationtype", "ih_installationversion"],
         [(next(oid), datetime.fromisoformat(dt), "upgrade", v) for dt, v in prof["installs"]])
    current = prof["installs"][-1][1]
    crashes = []
    for d in range(DAYS):
        for _ in range(poisson(rng, prof["crash"](d / (DAYS - 1)))):
            ts = START + timedelta(days=d, seconds=rng.randint(7 * 3600, 19 * 3600))
            crashes.append((next(oid), ts, ts, rng.choice(humans)[2], current,
                            rng.choice(["MessageNotUnderstood", "SubscriptOutOfBounds", "ZeroDivide", "OracleError"])))
    copy(cur, f"{log}.woncrashreportlog",
         ["oid", "wcr_timestamp", "wcr_utctimestamp", "wcr_wonusername", "wcr_versionstring", "wcr_errorstring"], crashes)
    return len(users), len(t3), len(t3t), len(prd), len(csl), len(dsl), len(crashes)


def main():
    con = psycopg2.connect(host="localhost", port=5433, user="postgres", dbname="brokr_usage_lab")
    with con, con.cursor() as cur:
        for key, prof in PROFILES.items():
            for t in ["t3tmetric", "t3ttablemetric", "psiuser", "psiuseridentification", "psiprdstatlog",
                      "cm2contractstatuslog", "wondaystatuslogentry", "mgxinstallationhistory"]:
                cur.execute(f"TRUNCATE {key}_psi.{t}")
            cur.execute(f"TRUNCATE {key}_psilogging.woncrashreportlog")
            print(key, "users/t3m/t3mt/prd/csl/dsl/crash =", build(cur, key, prof))
        cur.execute("ANALYZE")
    con.close()


if __name__ == "__main__":
    main()
