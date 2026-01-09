import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AddTransactionForm } from "./AddTransactionForm";
import { prisma } from "@/lib/prisma";
import { TransactionRow } from "./TransactionRow";

type TransactionType = "EXPENSE" | "INCOME";

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function formatMonthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
}

function currentMonthYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthParam(month?: string) {
  if (!month) return "";
  if (!/^\d{4}-\d{2}$/.test(month)) return "";
  const [, mm] = month.split("-");
  const m = Number(mm);
  if (!Number.isInteger(m) || m < 1 || m > 12) return "";
  return month;
}

function buildQueryString(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v.trim() !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function buildSearchWhere(q: string) {
  const query = q.trim();
  if (!query) return {};
  // Search description OR notes (calm: users often remember context, not merchant text)
  return {
    OR: [
      { description: { contains: query, mode: "insensitive" as const } },
      { notes: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

/**
 * Compute a "net" total using the canonical model:
 * - amountCents is always positive
 * - EXPENSE subtracts, INCOME adds
 */
function netFromGroupedSums(grouped: Array<{ type: TransactionType; _sum: { amountCents: number | null } }>) {
  const income = grouped.find((g) => g.type === "INCOME")?._sum.amountCents ?? 0;
  const expense = grouped.find((g) => g.type === "EXPENSE")?._sum.amountCents ?? 0;
  return income - expense;
}

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    month?: string;
    categoryId?: string;
    filters?: string; // "1" to show filters
  }>;
};

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main className="card">
        <div className="card-header">
          <div>
            <h1 className="h1">Welcome back</h1>
            <p className="subtle">Sign in to view your transactions.</p>
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

  const q = (params?.q ?? "").trim();
  const month = parseMonthParam(params?.month) || currentMonthYYYYMM();
  const categoryId = (params?.categoryId ?? "").trim(); // "" | "uncategorized" | real id
  const showFilters = params?.filters === "1";

  const baseParams = {
    month,
    q: q || undefined,
    categoryId: categoryId || undefined,
  };

  const showFiltersHref = `/finance/transactions${buildQueryString({
    ...baseParams,
    filters: "1",
  })}`;

  const hideFiltersHref = `/finance/transactions${buildQueryString({
    ...baseParams,
    // omit filters
  })}`;

  const resetHref = `/finance/transactions${buildQueryString({
    month: currentMonthYYYYMM(),
    // keep filters hidden on reset
  })}`;

  // For dropdown (only needed when filters shown, but cheap enough)
  const categories: { id: string; name: string }[] = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Count total transactions ever (for first-time empty state)
  const totalCountEver = await prisma.transaction.count({
    where: { userId: user.id },
  });

  const searchWhere = buildSearchWhere(q);

  const categoryWhere =
    categoryId && categoryId !== ""
      ? categoryId === "uncategorized"
        ? { categoryId: null }
        : { categoryId }
      : {};

  // ✅ ALL-TIME net total (respects q/category filters, but NOT month)
  const totalGrouped = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId: user.id,
      ...searchWhere,
      ...categoryWhere,
    },
    _sum: { amountCents: true },
  });

  const allTimeTotalCents = netFromGroupedSums(totalGrouped as any);
  const totalIsPositive = allTimeTotalCents >= 0;

  // Month range (UTC)
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  // Gentle month summary (respects current month + filters)
  const monthGrouped = await prisma.transaction.groupBy({
    by: ["type"],
    where: {
      userId: user.id,
      date: { gte: start, lt: end },
      ...searchWhere,
      ...categoryWhere,
    },
    _sum: { amountCents: true },
  });

  const monthCount = await prisma.transaction.count({
    where: {
      userId: user.id,
      date: { gte: start, lt: end },
      ...searchWhere,
      ...categoryWhere,
    },
  });

  const monthTotalCents = netFromGroupedSums(monthGrouped as any);

  const monthLabel = formatMonthLabel(month);
  const filtersActive = !!(q || categoryId);

  return (
    <main style={{ display: "grid", gap: 20 }}>
      {/* Header / summary */}
      <section className="card card--raised">
        <div className="card-header" style={{ alignItems: "flex-end" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Transactions
            </h1>

            <div className="subtle">Signed in as {email}</div>

            <div
              className={`amount ${totalIsPositive ? "amount-positive" : "amount-negative"}`}
              style={{ fontSize: 26, fontWeight: 700 }}
            >
              {formatMoney(allTimeTotalCents)}
            </div>

            <div className="subtle">
              All-time total
              {filtersActive ? " (respects current filters)" : " across your entire history."}
            </div>

            {filtersActive ? (
              <div className="subtle">
                {q ? `Search: “${q}”` : ""}
                {q && categoryId ? " • " : ""}
                {categoryId
                  ? categoryId === "uncategorized"
                    ? "Category: Uncategorized"
                    : "Category filter applied"
                  : ""}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" href="/">
              Home
            </Link>

            {showFilters ? (
              <Link className="btn btn-secondary" href={hideFiltersHref}>
                Hide filters
              </Link>
            ) : (
              <Link className="btn btn-secondary" href={showFiltersHref}>
                Show filters
              </Link>
            )}

            <Link className="btn" href="/api/auth/signout">
              Sign out
            </Link>
          </div>
        </div>
      </section>

      {/* Gentle monthly summary (no charts) */}
      <section className="card">
        <div className="card-header">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="h2">This month</div>
            <div className="subtle">
              In {monthLabel}, you logged <b>{monthCount}</b>{" "}
              {monthCount === 1 ? "transaction" : "transactions"} totaling{" "}
              <b>{formatMoney(monthTotalCents)}</b>.
              {filtersActive ? " (With your current filters.)" : ""}
            </div>
            <div className="subtle">A quiet check-in: does this month feel aligned with what you care about?</div>
          </div>
        </div>
      </section>

      {/* Add */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Add a transaction</div>
            <div className="subtle">Log spending in a few seconds.</div>
          </div>
        </div>
        <div className="card-body">
          <AddTransactionForm />
        </div>
      </section>

      {/* Filters (hidden by default) */}
      {showFilters ? (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="h2">Filters</div>
              <div className="subtle">Narrow down by month, keyword, or category.</div>
            </div>
          </div>

          <div className="card-body">
            <form method="GET" style={{ display: "grid", gap: 14 }}>
              {/* keep filters open after applying */}
              <input type="hidden" name="filters" value="1" />

              <div style={{ display: "grid", gap: 6 }}>
                <label className="subtle">Month</label>
                <input className="input" type="month" name="month" defaultValue={month} style={{ width: "fit-content" }} />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label className="subtle">Search</label>
                <input className="input" name="q" defaultValue={q} placeholder="Search description or notes…" />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label className="subtle">Category</label>
                <select className="select" name="categoryId" defaultValue={categoryId} style={{ minWidth: 240 }}>
                  <option value="">All categories</option>
                  <option value="uncategorized">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary" type="submit">
                  Apply
                </button>

                <Link className="btn" href={`${resetHref}&filters=1`}>
                  Reset
                </Link>

                <div className="subtle" style={{ marginLeft: "auto" }}>
                  Tip: Use month + category to see patterns.
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {/* List */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Recent transactions</div>
            <div className="subtle">Latest items for {month} (up to 50).</div>
          </div>
        </div>

        <div className="card-body">
          <TransactionsList
            userId={user.id}
            q={q}
            month={month}
            categoryId={categoryId}
            totalCountEver={totalCountEver}
            resetHref={resetHref}
            showFiltersHref={showFiltersHref}
          />
        </div>
      </section>
    </main>
  );
}

type TxItem = {
  id: string;
  description: string;
  amountCents: number;
  type: TransactionType;
  date: Date;
  categoryId: string | null;
  notes: string | null;
  category: { name: string } | null;
  flags?: unknown;
};

async function TransactionsList({
  userId,
  q,
  month,
  categoryId,
  totalCountEver,
  resetHref,
  showFiltersHref,
}: {
  userId: string;
  q: string;
  month: string;
  categoryId: string;
  totalCountEver: number;
  resetHref: string;
  showFiltersHref: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const searchWhere = buildSearchWhere(q);

  const categoryWhere =
    categoryId && categoryId !== ""
      ? categoryId === "uncategorized"
        ? { categoryId: null }
        : { categoryId }
      : {};

  const items: TxItem[] = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      ...searchWhere,
      ...categoryWhere,
    },
    orderBy: { date: "desc" },
    take: 50,
    include: { category: { select: { name: true } } },
  });

  // Empty state: brand new user (no transactions ever)
  if (totalCountEver === 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>You’re all set.</div>
        <div className="subtle">
          When you add your first transaction, it’ll show up here. Keep it simple — one entry is enough to start.
        </div>
        <div className="subtle">
          If you’d like, you can also{" "}
          <Link className="btn btn-ghost" href={showFiltersHref} style={{ padding: 0 }}>
            open filters
          </Link>{" "}
          later to explore patterns by month and category.
        </div>
      </div>
    );
  }

  // Empty state: no matches for current filters/month
  if (items.length === 0) {
    const hasFilters = !!(q || categoryId);
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>No matches</div>
        <div className="subtle">
          {hasFilters ? "Try adjusting month, search, or category." : "There aren’t any transactions for this month yet."}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link className="btn btn-secondary" href={showFiltersHref}>
            Show filters
          </Link>

          <Link className="btn" href={resetHref}>
            Go to current month
          </Link>

          {hasFilters ? (
            <div className="subtle">Tip: clearing search is often the fastest reset.</div>
          ) : (
            <div className="subtle">Tip: add one entry and the month will start taking shape.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <span className="subtle">
            Showing {items.length} (last 50) • {month}
            {q ? ` • search: “${q}”` : ""}
            {categoryId ? ` • ${categoryId === "uncategorized" ? "Uncategorized" : "Category filter"}` : ""}
          </span>
        </div>

        <span className="subtle">Amount</span>
      </div>

      <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((t) => (
          <li
            key={t.id}
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 14,
              background: "rgba(255,255,255,0.6)",
            }}
          >
            <TransactionRow
              id={t.id}
              description={t.description}
              amountCents={t.amountCents}
              type={t.type}
              dateISO={t.date.toISOString()}
              formattedDate={formatDate(t.date)}
              categoryId={t.categoryId}
              categoryName={t.category?.name ?? null}
              notes={t.notes ?? null}
              flags={(t as any).flags ?? []}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
