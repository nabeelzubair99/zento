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
} from "recharts";

type CategoryRow = { name: string; cents: number };
type DailyRow = { day: string; cents: number };

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Keep labels compact: "2026-01-09" -> "Jan 9"
function formatDayLabel(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dt);
}

function TooltipMoney({ active, payload, label }: any) {
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

  // Show up to last 31 points with activity (already pre-aggregated)
  const lineData = React.useMemo(() => dailySeries.slice(-31), [dailySeries]);

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
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `$${Math.round(v / 100)}`}
                />
                <Tooltip content={<TooltipMoney />} />
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

      {/* Daily spending trend */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Daily spending trend</div>
            <div className="subtle">Expenses per day.</div>
          </div>
        </div>

        <div className="card-body" style={{ height: 320 }}>
          {lineData.length === 0 ? (
            <div className="subtle">No expenses yet for this period.</div>
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
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `$${Math.round(v / 100)}`}
                />
                <Tooltip
                  content={
                    <TooltipMoney
                      // label formatter runs before tooltip content sometimes; keep simple
                    />
                  }
                  labelFormatter={(l: string) => formatDayLabel(l)}
                />
                <Line
                  type="monotone"
                  dataKey="cents"
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
