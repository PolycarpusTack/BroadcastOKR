import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie
} from "recharts";

// ─── BROADCAST SAMPLE DATA ───────────────────────────────────────────────────

const DATA = {
  transmissions: [
    { title: "The Crown S5",          channel: "CH4",    runs_used: 8,  runs_licensed: 12, cost: 240000, genre: "Drama",        territory: "UK" },
    { title: "Planet Earth III",      channel: "BBC1",   runs_used: 3,  runs_licensed: 6,  cost: 180000, genre: "Documentary",  territory: "UK" },
    { title: "Succession S4",         channel: "Sky A",  runs_used: 11, runs_licensed: 12, cost: 320000, genre: "Drama",        territory: "UK" },
    { title: "The Bear S3",           channel: "Disney", runs_used: 4,  runs_licensed: 8,  cost: 150000, genre: "Drama",        territory: "UK" },
    { title: "Clarkson's Farm S3",    channel: "ITV1",   runs_used: 6,  runs_licensed: 6,  cost: 95000,  genre: "Factual",      territory: "UK" },
    { title: "House of the Dragon S2",channel: "Sky A",  runs_used: 9,  runs_licensed: 10, cost: 410000, genre: "Drama",        territory: "UK" },
    { title: "Slow Horses S4",        channel: "ATV",    runs_used: 2,  runs_licensed: 8,  cost: 130000, genre: "Thriller",     territory: "UK" },
    { title: "The Diplomat S2",       channel: "ITV1",   runs_used: 5,  runs_licensed: 6,  cost: 200000, genre: "Drama",        territory: "UK" },
    { title: "Blue Lights S3",        channel: "BBC1",   runs_used: 7,  runs_licensed: 8,  cost: 88000,  genre: "Drama",        territory: "UK" },
    { title: "Race Across World S5",  channel: "CH4",    runs_used: 3,  runs_licensed: 4,  cost: 65000,  genre: "Entertainment",territory: "UK" },
  ],
  schedule_fill: [
    { channel: "BBC1",   prime: 94, daytime: 88, overnight: 71 },
    { channel: "CH4",    prime: 89, daytime: 76, overnight: 65 },
    { channel: "ITV1",   prime: 97, daytime: 91, overnight: 78 },
    { channel: "Sky A",  prime: 82, daytime: 69, overnight: 54 },
    { channel: "Disney", prime: 78, daytime: 72, overnight: 61 },
  ],
  monthly_tx: [
    { month: "Nov", transmissions: 38 },
    { month: "Dec", transmissions: 52 },
    { month: "Jan", transmissions: 44 },
    { month: "Feb", transmissions: 41 },
    { month: "Mar", transmissions: 57 },
    { month: "Apr", transmissions: 63 },
    { month: "May", transmissions: 48 },
  ],
  okr: [
    { objective: "Content Utilisation",   kr: "Drama run utilisation ≥ 85%",           target: 85,  actual: 79,  unit: "%",      lower_better: false },
    { objective: "Content Utilisation",   kr: "Expired unused runs < 5%",              target: 5,   actual: 8,   unit: "%",      lower_better: true  },
    { objective: "Rights Management",     kr: "Zero lapsed rights in active schedule", target: 0,   actual: 2,   unit: " titles",lower_better: true  },
    { objective: "Rights Management",     kr: "90-day expiry warnings actioned ≥ 100%",target: 100, actual: 67,  unit: "%",      lower_better: false },
    { objective: "Schedule Performance",  kr: "Prime time fill ≥ 90% all channels",    target: 90,  actual: 88,  unit: "%",      lower_better: false },
    { objective: "Schedule Performance",  kr: "Acquisition-to-air ≤ 45 days avg",      target: 45,  actual: 38,  unit: " days",  lower_better: true  },
  ],
};

// ─── THEME ────────────────────────────────────────────────────────────────────

const C = {
  bg:       "#070B14",
  surface:  "#0D1420",
  surface2: "#111B2E",
  border:   "#1A2540",
  amber:    "#F5A623",
  amberLow: "#7A5212",
  cyan:     "#22D3EE",
  green:    "#10B981",
  red:      "#EF4444",
  purple:   "#A78BFA",
  pink:     "#F472B6",
  txt:      "#E2E8F0",
  muted:    "#4E6080",
  dim:      "#141E30",
};

const PALETTE = [C.amber, C.cyan, C.green, C.purple, C.pink, "#FB923C"];

const TT = {
  contentStyle: {
    backgroundColor: C.surface2, border: `1px solid ${C.border}`,
    color: C.txt, fontSize: 12, fontFamily: "monospace", borderRadius: 6,
  },
  labelStyle: { color: C.muted },
};

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const SYSTEM = `You are an AI data analyst embedded in WHATS'ON — a broadcast rights and scheduling management platform. You have deep expertise in broadcast operations:

DOMAIN KNOWLEDGE:
- Transmissions / runs: individual airings of licensed content
- Runs licensed: total airings permitted under the rights contract
- Runs used: how many times the title has actually aired
- Runs remaining: runs_licensed minus runs_used
- Amortization: spreading acquisition cost across licensed runs; cost_per_run = total_cost / runs_licensed; residual_value = (runs_remaining / runs_licensed) * total_cost
- Rights window: the contractual period during which content may be aired
- Schedule fill %: percentage of available schedule slots that are programmed
- Dayparts: Prime Time (18:00–23:00), Daytime (06:00–18:00), Overnight (23:00–06:00)

AVAILABLE DATA:
${JSON.stringify(DATA, null, 2)}

When the user asks a question, analyse the data and return ONLY a valid JSON object — no markdown, no explanation, no code fences. Use this exact shape:
{
  "chartType": "bar" | "horizontal_bar" | "line" | "area" | "pie",
  "title": "concise broadcast-language chart title",
  "insight": "1-2 sentence insight highlighting the key finding for a rights/scheduling manager",
  "xKey": "field name for X axis or category",
  "yKey": "field name for Y axis or value",
  "data": [ array of plain objects with at minimum xKey and yKey properties ],
  "highlights": [ "2-4 short callout strings e.g. 'Succession S4 · 92% utilised'" ]
}

Choose horizontal_bar when category labels are long. Choose area or line for time series. Choose pie for proportional breakdowns.`;

// ─── SUGGESTIONS ──────────────────────────────────────────────────────────────

const PILLS = [
  "Which titles are within 2 runs of their limit?",
  "Show amortization residual value by title",
  "Transmission volume trend over last 7 months",
  "Schedule fill comparison by daypart",
  "Cost per run across all drama titles",
  "Which OKRs are currently off track?",
];

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 2, color: C.muted,
      textTransform: "uppercase", marginBottom: 10, fontFamily: "monospace",
    }}>{children}</div>
  );
}

function StatBadge({ label, value, sub, color = C.amber }) {
  return (
    <div style={{
      background: C.surface2, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "14px 20px", flex: 1,
    }}>
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── CHART RENDERER ───────────────────────────────────────────────────────────

function ChartRenderer({ result }) {
  const { chartType, title, insight, data, xKey, yKey, highlights } = result;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 24, animation: "fadeIn 0.3s ease",
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.amber, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
          ✦ AI INSIGHT
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.txt, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{insight}</div>
      </div>

      {highlights?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {highlights.map((h, i) => (
            <span key={i} style={{
              background: `${C.amber}15`, border: `1px solid ${C.amberLow}`,
              color: C.amber, fontSize: 11, padding: "3px 12px",
              borderRadius: 20, fontFamily: "monospace",
            }}>{h}</span>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        {chartType === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey={xKey} stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <YAxis stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <Tooltip {...TT} />
            <Line type="monotone" dataKey={yKey} stroke={C.amber} strokeWidth={2.5} dot={{ fill: C.amber, r: 4 }} />
          </LineChart>
        ) : chartType === "area" ? (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.amber} stopOpacity={0.25} />
                <stop offset="95%" stopColor={C.amber} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey={xKey} stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <YAxis stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <Tooltip {...TT} />
            <Area type="monotone" dataKey={yKey} stroke={C.amber} fill="url(#ag)" strokeWidth={2.5} />
          </AreaChart>
        ) : chartType === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%"
              outerRadius={110} labelLine={{ stroke: C.border }}
              label={({ name, value }) => `${name}: ${value}`}
            >
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...TT} />
          </PieChart>
        ) : chartType === "horizontal_bar" ? (
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis type="number" stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <YAxis dataKey={xKey} type="category" stroke={C.border} tick={{ fill: C.muted, fontSize: 10 }} width={140} />
            <Tooltip {...TT} />
            <Bar dataKey={yKey} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey={xKey} stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <YAxis stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
            <Tooltip {...TT} />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────

function DashboardView() {
  const enriched = DATA.transmissions.map(t => ({
    ...t,
    short:          t.title.length > 22 ? t.title.slice(0, 20) + "…" : t.title,
    runs_remaining: t.runs_licensed - t.runs_used,
    utilisation:    Math.round((t.runs_used / t.runs_licensed) * 100),
    cost_per_run:   Math.round(t.cost / t.runs_licensed),
    residual:       Math.round(((t.runs_licensed - t.runs_used) / t.runs_licensed) * t.cost),
  }));

  const atRisk    = enriched.filter(t => t.runs_remaining <= 2);
  const totalTx   = enriched.reduce((s, t) => s + t.runs_used, 0);
  const avgUtil   = Math.round(enriched.reduce((s, t) => s + t.utilisation, 0) / enriched.length);
  const totalRes  = enriched.reduce((s, t) => s + t.residual, 0);

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <StatBadge label="Total Transmissions" value={totalTx} sub="this contract period" />
        <StatBadge label="Avg Run Utilisation" value={`${avgUtil}%`} sub="across all titles" color={avgUtil >= 80 ? C.green : C.amber} />
        <StatBadge label="Residual Value" value={`£${(totalRes / 1000).toFixed(0)}k`} sub="uncommitted rights" color={C.cyan} />
        <StatBadge label="At-Risk Titles" value={atRisk.length} sub="≤ 2 runs remaining" color={atRisk.length > 0 ? C.red : C.green} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Monthly transmissions */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
          <SectionLabel>Monthly Transmissions — Rolling 7 Months</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={DATA.monthly_tx}>
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
              <Tooltip {...TT} />
              <Area type="monotone" dataKey="transmissions" stroke={C.cyan} fill="url(#tg)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Run utilisation */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
          <SectionLabel>Run Utilisation % by Title</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={enriched} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" domain={[0, 100]} stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} unit="%" />
              <YAxis dataKey="short" type="category" stroke={C.border} tick={{ fill: C.muted, fontSize: 9 }} width={118} />
              <Tooltip {...TT} formatter={v => `${v}%`} />
              <Bar dataKey="utilisation" radius={[0, 4, 4, 0]}>
                {enriched.map((t, i) => (
                  <Cell key={i} fill={t.utilisation >= 90 ? C.red : t.utilisation >= 70 ? C.amber : C.green} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Schedule fill */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
          <SectionLabel>Schedule Fill % — Channel × Daypart</SectionLabel>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={DATA.schedule_fill}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="channel" stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis domain={[0, 100]} stroke={C.border} tick={{ fill: C.muted, fontSize: 11 }} unit="%" />
              <Tooltip {...TT} formatter={v => `${v}%`} />
              <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
              <Bar dataKey="prime"     name="Prime"     fill={C.amber}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="daytime"   name="Daytime"   fill={C.cyan}   radius={[3, 3, 0, 0]} />
              <Bar dataKey="overnight" name="Overnight" fill={C.purple} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* At-risk panel */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
          <SectionLabel>⚠ At-Risk Titles — ≤ 2 Runs Remaining</SectionLabel>
          {atRisk.length === 0 ? (
            <div style={{ color: C.green, fontSize: 13, fontFamily: "monospace", paddingTop: 8 }}>
              ✓ No titles at risk currently
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {atRisk.map((t, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", background: `${C.red}10`,
                  border: `1px solid ${C.red}30`, borderRadius: 6, marginBottom: 6,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.txt, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginTop: 2 }}>
                      {t.channel} · {t.genre} · £{t.residual.toLocaleString()} residual
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.red, fontFamily: "monospace", lineHeight: 1 }}>
                      {t.runs_remaining}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>runs left</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── OKR VIEW ─────────────────────────────────────────────────────────────────

function OKRView() {
  const groups = DATA.okr.reduce((acc, kr) => {
    (acc[kr.objective] = acc[kr.objective] || []).push(kr);
    return acc;
  }, {});

  const getStatus = (kr) => {
    if (kr.lower_better) {
      const ratio = kr.target === 0 ? (kr.actual === 0 ? 1 : 0) : kr.target / Math.max(kr.actual, 0.01);
      return { pct: Math.min(100, Math.round(ratio * 100)), on: kr.actual <= kr.target };
    }
    const pct = Math.min(100, Math.round((kr.actual / kr.target) * 100));
    return { pct, on: pct >= 85 };
  };

  const onTrack  = DATA.okr.filter(kr => getStatus(kr).on).length;
  const offTrack = DATA.okr.length - onTrack;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <StatBadge label="Key Results Total" value={DATA.okr.length} sub="across 3 objectives" color={C.txt} />
        <StatBadge label="On Track" value={onTrack} sub="≥ 85% progress" color={C.green} />
        <StatBadge label="Off Track" value={offTrack} sub="needs attention" color={offTrack > 0 ? C.red : C.green} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.entries(groups).map(([obj, krs]) => (
          <div key={obj} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 3, height: 22, background: C.amber, borderRadius: 2 }} />
              <div>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>Objective</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.txt }}>{obj}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {krs.map((kr, i) => {
                const { pct, on } = getStatus(kr);
                const barColor = on ? C.green : pct >= 60 ? C.amber : C.red;
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, gap: 12 }}>
                      <div style={{ fontSize: 13, color: C.txt, lineHeight: 1.4 }}>{kr.kr}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, fontFamily: "monospace", color: barColor }}>
                          {kr.actual}{kr.unit}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted }}>/ {kr.target}{kr.unit}</span>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 20, fontFamily: "monospace",
                          background: `${barColor}20`, color: barColor,
                          border: `1px solid ${barColor}50`,
                        }}>{on ? "ON TRACK" : "OFF TRACK"}</span>
                      </div>
                    </div>
                    <div style={{ background: C.dim, borderRadius: 4, height: 7, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`, borderRadius: 4,
                        background: barColor, transition: "width 1s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function WhatsonInsights() {
  const [tab,     setTab]     = useState("query");
  const [query,   setQuery]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const runQuery = async (q) => {
    const final = (q || query).trim();
    if (!final) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM,
          messages: [{ role: "user", content: final }],
        }),
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      setResult(JSON.parse(clean));
    } catch {
      setError("Could not parse a chart from that query — try rephrasing.");
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: "query",     label: "AI Query" },
    { id: "dashboard", label: "Live Dashboard" },
    { id: "okr",       label: "OKR Tracker" },
  ];

  const sources = ["Rights Manager", "Schedule Grid", "Contract Engine"];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.txt }}>

      {/* ── Header ── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "0 28px", display: "flex", alignItems: "center", height: 54,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: C.amber, color: "#000", fontWeight: 900,
            fontSize: 10, letterSpacing: 2, padding: "4px 8px", borderRadius: 4,
          }}>WO</div>
          <div style={{ fontSize: 15 }}>
            <span style={{ fontWeight: 700, color: C.txt }}>WHATS'ON</span>
            <span style={{ color: C.amber, fontWeight: 300 }}> Insights</span>
          </div>
          <div style={{
            marginLeft: 6, fontSize: 10, color: C.muted, background: C.dim,
            border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace",
          }}>BETA</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 18, alignItems: "center" }}>
          {sources.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, boxShadow: `0 0 5px ${C.green}` }} />
              {s}
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── Tab bar ── */}
        <div style={{
          display: "inline-flex", gap: 2, marginBottom: 24,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4,
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "7px 22px", borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 13, background: tab === t.id ? C.amber : "transparent",
              color: tab === t.id ? "#000" : C.muted,
              fontWeight: tab === t.id ? 700 : 400, transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── AI Query tab ── */}
        {tab === "query" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Quick queries</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PILLS.map((p, i) => (
                  <button key={i} onClick={() => { setQuery(p); runQuery(p); }} style={{
                    background: C.dim, border: `1px solid ${C.border}`, color: C.muted,
                    fontSize: 12, padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                    transition: "all 0.15s", fontFamily: "monospace",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.amber; e.currentTarget.style.color = C.amber; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
                  >{p}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runQuery()}
                placeholder="Ask anything about transmissions, amortizations, rights, schedule…"
                style={{
                  flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "12px 18px", color: C.txt, fontSize: 14,
                  outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = C.amber}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              <button onClick={() => runQuery()} disabled={loading} style={{
                background: loading ? C.dim : C.amber, color: loading ? C.muted : "#000",
                border: "none", borderRadius: 8, padding: "12px 26px", cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 13, transition: "all 0.15s", minWidth: 110,
              }}>
                {loading ? "Thinking…" : "Query →"}
              </button>
            </div>

            {error && (
              <div style={{
                background: `${C.red}12`, border: `1px solid ${C.red}44`,
                borderRadius: 8, padding: 14, color: C.red, fontSize: 13, marginBottom: 16,
              }}>{error}</div>
            )}

            {loading && !result && (
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: 48, textAlign: "center",
              }}>
                <div style={{ color: C.amber, fontSize: 12, fontFamily: "monospace", letterSpacing: 3 }}>
                  ANALYSING BROADCAST DATA…
                </div>
              </div>
            )}

            {result && !loading && <ChartRenderer result={result} />}

            {!result && !loading && !error && (
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: 48, textAlign: "center",
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>📡</div>
                <div style={{ color: C.muted, fontSize: 13, fontFamily: "monospace" }}>
                  Select a quick query above or type your own
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "dashboard" && <DashboardView />}
        {tab === "okr"       && <OKRView />}

      </div>
    </div>
  );
}
