import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AddTransactionForm } from "./AddTransactionForm";
import { prisma } from "@/lib/prisma";
import { TransactionRow } from "./TransactionRow";

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

  // For dropdown (only needed when filters shown, but cheap enough)
  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // ✅ ALL-TIME total (matches q/category filters, but NOT month)
  const totalAgg = await prisma.transaction.aggregate({
    where: {
      userId: user.id,
      ...(q
        ? {
            description: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
      ...(categoryId
        ? categoryId === "uncategorized"
          ? { categoryId: null }
          : { categoryId }
        : {}),
    },
    _sum: { amountCents: true },
  });

  const allTimeTotalCents = totalAgg._sum.amountCents ?? 0;
  const totalIsPositive = allTimeTotalCents >= 0;

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
              className={`amount ${
                totalIsPositive ? "amount-positive" : "amount-negative"
              }`}
              style={{ fontSize: 26, fontWeight: 700 }}
            >
              {formatMoney(allTimeTotalCents)}
            </div>

            <div className="subtle">
              All-time total
              {(q || categoryId) ? " (respects current filters)" : " across your entire history."}
            </div>

            {(q || categoryId) ? (
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
                <input
                  className="input"
                  type="month"
                  name="month"
                  defaultValue={month}
                  style={{ width: "fit-content" }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label className="subtle">Search</label>
                <input
                  className="input"
                  name="q"
                  defaultValue={q}
                  placeholder="Search description…"
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label className="subtle">Category</label>
                <select
                  className="select"
                  name="categoryId"
                  defaultValue={categoryId}
                  style={{ minWidth: 240 }}
                >
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
          <TransactionsList userId={user.id} q={q} month={month} categoryId={categoryId} />
        </div>
      </section>
    </main>
  );
}

async function TransactionsList({
  userId,
  q,
  month,
  categoryId,
}: {
  userId: string;
  q: string;
  month: string;
  categoryId: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const items = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      ...(q
        ? {
            description: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
      ...(categoryId
        ? categoryId === "uncategorized"
          ? { categoryId: null }
          : { categoryId }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 50,
    include: { category: true },
  });

  if (items.length === 0) {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 650 }}>No matches</div>
        <div className="subtle">Try showing filters and adjusting month/search/category.</div>
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
              dateISO={t.date.toISOString()}
              formattedDate={formatDate(t.date)}
              formattedAmount={formatMoney(t.amountCents)}
              categoryId={t.categoryId}
              categoryName={t.category?.name ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
