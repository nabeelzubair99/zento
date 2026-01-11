import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import crypto from "crypto";

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

/** ----------------------------
 * Anonymous session support
 * ---------------------------- */
const ANON_COOKIE = "zento_anon";

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function getUserContext(): Promise<{
  userId: string | null;
  label: string;
  isAuthed: boolean;
}> {
  const session = await getServerSession(authOptions);

  // Prefer id if present (via callbacks.session)
  const sessionUserId = (session?.user as any)?.id as string | undefined;
  if (sessionUserId) {
    const email = session?.user?.email ?? "your account";
    return {
      userId: sessionUserId,
      label: `Signed in as ${email}`,
      isAuthed: true,
    };
  }

  // Fallback: email lookup
  const email = session?.user?.email;
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user?.id) {
      return { userId: user.id, label: `Signed in as ${email}`, isAuthed: true };
    }
  }

  // ✅ cookies() is NOT async in Next App Router
  const jar = await cookies();
  const raw = jar.get(ANON_COOKIE)?.value;

  if (!raw) {
    return { userId: null, label: "Using Zento on this device", isAuthed: false };
  }

  const tokenHash = hashToken(raw);

  const sess = await prisma.anonSession.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!sess) {
    return { userId: null, label: "Using Zento on this device", isAuthed: false };
  }

  if (sess.expiresAt && sess.expiresAt.getTime() < Date.now()) {
    return { userId: null, label: "Using Zento on this device", isAuthed: false };
  }

  // Touch lastSeenAt (best-effort)
  prisma.anonSession
    .update({ where: { id: sess.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return { userId: sess.userId, label: "Using Zento on this device", isAuthed: false };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const { userId, label, isAuthed } = await getUserContext();

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

  // If we don't have a user yet (no login, no anon cookie), show empty dashboard shell.
  const emptyState = !userId;

  const whereBase: any = {
    ...(userId ? { userId } : {}),
    ...(useAllTime
      ? {}
      : (() => {
          const r = monthRangeUTC(selectedMonth);
          return { date: { gte: r.start, lt: r.end } };
        })()),
  };

  let incomeCents = 0;
  let expenseCents = 0;
  let netCents = 0;

  let categoryRows: Array<{ name: string; cents: number }> = [];
  let dailySeries: Array<{ day: string; cents: number; incomeCents?: number }> = [];

  if (!emptyState) {
    // --- KPI totals ---
    const totalsGrouped = (await prisma.transaction.groupBy({
      by: [Prisma.TransactionScalarFieldEnum.type],
      where: whereBase,
      _sum: { amountCents: true },
    })) as unknown as GroupedSum[];

    incomeCents =
      totalsGrouped.find((g) => g.type === "INCOME")?._sum.amountCents ?? 0;
    expenseCents =
      totalsGrouped.find((g) => g.type === "EXPENSE")?._sum.amountCents ?? 0;
    netCents = incomeCents - expenseCents;

    // --- Category spend (expenses only) ---
    const categories = await prisma.category.findMany({
      where: { userId: userId! },
      select: { id: true, name: true },
    });

    const catNameById = new Map(categories.map((c) => [c.id, c.name]));

    const byCategory = (await prisma.transaction.groupBy({
      by: [Prisma.TransactionScalarFieldEnum.categoryId],
      where: { ...whereBase, type: "EXPENSE" },
      _sum: { amountCents: true },
    })) as unknown as GroupedByCategory[];

    categoryRows = byCategory
      .map((g) => {
        const cents = g._sum.amountCents ?? 0;
        const name = g.categoryId
          ? catNameById.get(g.categoryId) ?? "Unknown"
          : "Uncategorized";
        return { name, cents };
      })
      .filter((r) => r.cents > 0)
      .sort((a, b) => b.cents - a.cents);

    // --- Daily trend (month-only): expenses + income ---
    if (!useAllTime) {
      const dailyTx = await prisma.transaction.findMany({
        where: { ...whereBase, type: { in: ["EXPENSE", "INCOME"] } },
        select: { date: true, amountCents: true, type: true },
        orderBy: { date: "asc" },
      });

      const dailyMap = new Map<string, { expense: number; income: number }>();

      for (const t of dailyTx) {
        const k = dayKeyUTC(t.date);
        const cur = dailyMap.get(k) ?? { expense: 0, income: 0 };
        if (t.type === "EXPENSE") cur.expense += t.amountCents;
        if (t.type === "INCOME") cur.income += t.amountCents;
        dailyMap.set(k, cur);
      }

      dailySeries = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({
          day,
          cents: v.expense,
          incomeCents: v.income,
        }));
    }
  }

  // --- Navigation links ---
  const hrefThis = "/dashboard?range=this";
  const hrefLast = "/dashboard?range=last";
  const hrefAll = "/dashboard?range=all";
  const isActive = (k: "this" | "last" | "all" | "month") => range === k;

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <section className="card card--raised">
        <div className="card-header dashHeader">
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Dashboard
            </h1>
            <div className="subtle">{titleLabel}</div>

            <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
              {label}
              {!isAuthed ? (
                <>
                  {" • "}
                  <Link
                    href="/api/auth/signin"
                    className="subtle"
                    style={{ textDecoration: "underline" }}
                  >
                    Sign in to sync
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          <div className="dashControls">
            <div className="dashRangeBtns">
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
            </div>

            <form method="GET" action="/dashboard" className="dashMonthForm">
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

        <div className="card-body dashKpis">
          <div className="dashKpiCard">
            <div className="subtle">Income</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>
              {formatMoney(incomeCents)}
            </div>
          </div>

          <div className="dashKpiCard">
            <div className="subtle">Expenses</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>
              {formatMoney(expenseCents)}
            </div>
          </div>

          <div className="dashKpiCard">
            <div className="subtle">Net</div>
            <div style={{ fontSize: 20, fontWeight: 750 }}>
              {formatMoney(netCents)}
            </div>
          </div>
        </div>

        {emptyState ? (
          <div className="subtle" style={{ padding: "0 22px 22px" }}>
            Add your first transaction and your dashboard will populate.
          </div>
        ) : null}
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
        <DashboardCharts categoryRows={categoryRows} dailySeries={dailySeries as any} />
      )}
    </main>
  );
}
