import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { Prisma } from "@prisma/client";

type TxType = "EXPENSE" | "INCOME";

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function formatMonthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(d);
}

function currentMonthYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function prevMonthYYYYMM(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function parseMonthParam(month?: string) {
  if (!month) return "";
  if (!/^\d{4}-\d{2}$/.test(month)) return "";
  const [, mm] = month.split("-");
  const m = Number(mm);
  if (!Number.isInteger(m) || m < 1 || m > 12) return "";
  return month;
}

function monthRangeUTC(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function dayKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type PageProps = {
  searchParams?: Promise<{
    range?: string; // "this" | "last" | "all" | "month"
    month?: string; // YYYY-MM when range=month
  }>;
};

type GroupedSum = {
  type: TxType;
  _sum: { amountCents: number | null };
};

type GroupedByCategory = {
  categoryId: string | null;
  _sum: { amountCents: number | null };
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <main className="card">
        <div className="card-header">
          <div>
            <h1 className="h1">Dashboard</h1>
            <p className="subtle">Sign in to view your dashboard.</p>
          </div>
          <Link className="btn btn-primary" href="/api/auth/signin">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const email = session.user?.email;
  if (!email) {
    return (
      <main className="card">
        <div className="card-header">
          <div>
            <h1 className="h1">Unauthorized</h1>
            <p className="subtle">Please sign in again.</p>
          </div>
          <Link className="btn btn-primary" href="/api/auth/signin">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return (
      <main className="card">
        <div className="card-header">
          <div>
            <h1 className="h1">User not found</h1>
            <p className="subtle">Try signing out and back in.</p>
          </div>
          <Link className="btn btn-primary" href="/api/auth/signin">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  // --- Range selection ---
  const range = (params?.range ?? "this").toLowerCase();
  const thisMonth = currentMonthYYYYMM();
  const lastMonth = prevMonthYYYYMM(thisMonth);

  const selectedMonth =
    range === "last"
      ? lastMonth
      : range === "month"
        ? parseMonthParam(params?.month) || thisMonth
        : thisMonth;

  const useAllTime = range === "all";
  const titleLabel = useAllTime ? "All time" : formatMonthLabel(selectedMonth);

  const whereBase: any = {
    userId: user.id,
    ...(useAllTime
      ? {}
      : (() => {
          const r = monthRangeUTC(selectedMonth);
          return { date: { gte: r.start, lt: r.end } };
        })()),
  };

  // --- KPI totals (income, expense, net) ---
  const totalsGrouped = (await prisma.transaction.groupBy({
    by: [Prisma.TransactionScalarFieldEnum.type],
    where: whereBase,
    _sum: { amountCents: true },
  })) as unknown as GroupedSum[];

  const incomeCents =
    totalsGrouped.find((g) => g.type === "INCOME")?._sum.amountCents ?? 0;

  const expenseCents =
    totalsGrouped.find((g) => g.type === "EXPENSE")?._sum.amountCents ?? 0;

  const netCents = incomeCents - expenseCents;

  // --- Category spend (expenses only) ---
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  });

  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  const byCategory = (await prisma.transaction.groupBy({
    by: [Prisma.TransactionScalarFieldEnum.categoryId],
    where: { ...whereBase, type: "EXPENSE" },
    _sum: { amountCents: true },
  })) as unknown as GroupedByCategory[];

  const categoryRows = byCategory
    .map((g) => {
      const cents = g._sum.amountCents ?? 0;
      const name = g.categoryId
        ? catNameById.get(g.categoryId) ?? "Unknown"
        : "Uncategorized";
      return { name, cents };
    })
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  // --- Daily expense trend (month-only) ---
  let dailySeries: Array<{ day: string; cents: number }> = [];
  if (!useAllTime) {
    const dailyTx = await prisma.transaction.findMany({
      where: { ...whereBase, type: "EXPENSE" },
      select: { date: true, amountCents: true },
      orderBy: { date: "asc" },
    });

    const dailyMap = new Map<string, number>();
    for (const t of dailyTx) {
      const k = dayKeyUTC(t.date);
      dailyMap.set(k, (dailyMap.get(k) ?? 0) + t.amountCents);
    }

    dailySeries = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, cents]) => ({ day, cents }));
  }

  // --- Navigation links ---
  const hrefThis = "/dashboard?range=this";
  const hrefLast = "/dashboard?range=last";
  const hrefAll = "/dashboard?range=all";
  const isActive = (k: "this" | "last" | "all" | "month") => range === k;

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <section className="card card--raised">
        <div
          className="card-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Dashboard
            </h1>
            <div className="subtle">{titleLabel}</div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              className={`btn ${isActive("this") ? "btn-secondary" : ""}`}
              href={hrefThis}
            >
              This month
            </Link>
            <Link
              className={`btn ${isActive("last") ? "btn-secondary" : ""}`}
              href={hrefLast}
            >
              Last month
            </Link>
            <Link
              className={`btn ${isActive("all") ? "btn-secondary" : ""}`}
              href={hrefAll}
            >
              All time
            </Link>

            <form
              method="GET"
              action="/dashboard"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input type="hidden" name="range" value="month" />
              <input
                className="input"
                type="month"
                name="month"
                defaultValue={selectedMonth}
                style={{ width: "fit-content" }}
              />
              <button className="btn btn-primary" type="submit">
                Go
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* KPI row */}
      <section className="card">
        <div className="card-header">
          <div className="h2">Summary</div>
        </div>

        <div
          className="card-body"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 14,
              background: "rgba(255,255,255,0.55)",
            }}
          >
            <div className="subtle">Income</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>
              {formatMoney(incomeCents)}
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 14,
              background: "rgba(255,255,255,0.55)",
            }}
          >
            <div className="subtle">Expenses</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>
              {formatMoney(expenseCents)}
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 14,
              background: "rgba(255,255,255,0.55)",
            }}
          >
            <div className="subtle">Net</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>
              {formatMoney(netCents)}
            </div>
          </div>
        </div>
      </section>

      {/* Charts */}
      {useAllTime ? (
        <>
          <DashboardCharts categoryRows={categoryRows} dailySeries={[]} />
          <section className="card">
            <div className="card-header">
              <div>
                <div className="h2">Daily trend</div>
                <div className="subtle">Pick a month to see a daily trend.</div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <DashboardCharts categoryRows={categoryRows} dailySeries={dailySeries} />
      )}
    </main>
  );
}
