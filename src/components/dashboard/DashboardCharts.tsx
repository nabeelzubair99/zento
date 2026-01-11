"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type CategoryRow = { name: string; cents: number };

// cents = expense cents; incomeCents = income cents
type DailyRow = { day: string; cents: number; incomeCents?: number };

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// Keep labels compact: "2026-01-09" -> "Jan 9"
function formatDayLabel(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(dt);
}

function TooltipMoneyMulti({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  // payload contains one entry per Line in the chart
  const byKey = new Map<string, number>();
  for (const p of payload) {
    if (p?.dataKey) byKey.set(String(p.dataKey), Number(p.value ?? 0));
  }

  const expense = byKey.get("cents") ?? 0;
  const income = byKey.get("incomeCents") ?? 0;

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 12,
        border: "1px solid rgb(var(--border))",
        background: "rgb(var(--surface))",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        fontSize: 13,
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>

      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span className="subtle">Expenses</span>
          <span style={{ fontWeight: 700 }}>{formatMoney(expense)}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span className="subtle">Income</span>
          <span style={{ fontWeight: 700 }}>{formatMoney(income)}</span>
        </div>

        <div
          style={{
            height: 1,
            background: "rgba(0,0,0,0.06)",
            margin: "6px 0",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span className="subtle">Net</span>
          <span style={{ fontWeight: 800 }}>{formatMoney(income - expense)}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardCharts({
  categoryRows,
  dailySeries,
}: {
  categoryRows: CategoryRow[];
  dailySeries: DailyRow[];
}) {
  // Bar chart wants short labels; we’ll show top 10 for clarity
  const barData = React.useMemo(() => categoryRows.slice(0, 10), [categoryRows]);

  // Show up to last 31 points (already pre-aggregated)
  const lineData = React.useMemo(() => dailySeries.slice(-31), [dailySeries]);

  // Mobile polish: reduce tick density on small screens
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // ✅ use a number to avoid any typing weirdness
  // 0 = show all ticks, 2 = show every 3rd tick
  const xInterval = isMobile ? 2 : 0;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Spending by category */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Spending by category</div>
            <div className="subtle">Top categories (expenses only).</div>
          </div>
        </div>

        <div className="card-body" style={{ height: 320 }}>
          {barData.length === 0 ? (
            <div className="subtle">No expenses found for this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 12, left: 0, bottom: 10 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />

                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={70}
                  tick={{ fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  tickFormatter={(v) => {
                    const s = String(v ?? "");
                    return s.length > 10 ? `${s.slice(0, 10)}…` : s;
                  }}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `$${Math.round(v / 100)}`}
                />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const cents = payload[0]?.value ?? 0;
                    return (
                      <div
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid rgb(var(--border))",
                          background: "rgb(var(--surface))",
                          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                        <div className="subtle">{formatMoney(cents)}</div>
                      </div>
                    );
                  }}
                />

                <Bar dataKey="cents" fill="rgb(var(--accent))" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {categoryRows.length > 10 ? (
          <div className="subtle" style={{ padding: "0 16px 16px" }}>
            Showing top 10 categories.
          </div>
        ) : null}
      </section>

      {/* Daily trend */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Daily trend</div>
            <div className="subtle">Expenses and income per day.</div>
          </div>
        </div>

        <div className="card-body" style={{ height: 320 }}>
          {lineData.length === 0 ? (
            <div className="subtle">No activity yet for this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 10, right: 12, left: 0, bottom: 10 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />

                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatDayLabel}
                  interval={xInterval}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `$${Math.round(v / 100)}`}
                />

                <Tooltip content={<TooltipMoneyMulti />} labelFormatter={(l: string) => formatDayLabel(l)} />

                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12 }} />

                {/* Expenses */}
                <Line
                  type="monotone"
                  dataKey="cents"
                  name="Expenses"
                  stroke="rgb(var(--danger))"
                  strokeWidth={3}
                  dot={false}
                />

                {/* Income */}
                <Line
                  type="monotone"
                  dataKey="incomeCents"
                  name="Income"
                  stroke="rgb(var(--accent))"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
