import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AddTransactionForm } from "./AddTransactionForm";
import { prisma } from "@/lib/prisma";
import { TransactionRow } from "./TransactionRow";

type TransactionType = "EXPENSE" | "INCOME";

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

function buildSearchWhere(q: string) {
  const query = q.trim();
  if (!query) return {};
  return {
    OR: [
      { description: { contains: query, mode: "insensitive" as const } },
      { notes: { contains: query, mode: "insensitive" as const } },
    ],
  };
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

  const showFilters = params?.filters === "1";

  // Filters are only meaningful when showFilters is true.
  const q = showFilters ? (params?.q ?? "").trim() : "";
  const month = showFilters ? (parseMonthParam(params?.month) || currentMonthYYYYMM()) : "";
  const categoryId = showFilters ? (params?.categoryId ?? "").trim() : "";

  const baseParams = {
    month: month || undefined,
    q: q || undefined,
    categoryId: categoryId || undefined,
  };

  const showFiltersHref = `/finance/transactions${buildQueryString({
    ...baseParams,
    filters: "1",
  })}`;

  const hideFiltersHref = `/finance/transactions${buildQueryString({
    // when hiding filters, we intentionally drop q/month/category
  })}`;

  const resetHref = `/finance/transactions${buildQueryString({
    month: currentMonthYYYYMM(),
  })}`;

  const categories: { id: string; name: string }[] = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const totalCountEver = await prisma.transaction.count({
    where: { userId: user.id },
  });

  const filtersActive = showFilters && !!(q || categoryId || month);

  return (
    <main className="min-h-screen flex flex-col gap-5">
      {/* Header */}
      <section className="card card--raised shrink-0">
        <div className="card-header" style={{ alignItems: "flex-end" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Transactions
            </h1>
            <div className="subtle">Signed in as {email}</div>

            {filtersActive ? (
              <div className="subtle">
                {month ? `Month: ${month}` : ""}
                {month && (q || categoryId) ? " • " : ""}
                {q ? `Search: “${q}”` : ""}
                {q && categoryId ? " • " : ""}
                {categoryId
                  ? categoryId === "uncategorized"
                    ? "Category: Uncategorized"
                    : "Category filter applied"
                  : ""}
              </div>
            ) : (
              <div className="subtle">Showing your last 5 entries.</div>
            )}
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
      <section className="card shrink-0">
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

      {/* Filters (only when explicitly shown) */}
      {showFilters ? (
        <section className="card shrink-0">
          <div className="card-header">
            <div>
              <div className="h2">Filters</div>
              <div className="subtle">When filters are on, we show all matching transactions.</div>
            </div>
          </div>

          <div className="card-body">
            <form method="GET" style={{ display: "grid", gap: 14 }}>
              <input type="hidden" name="filters" value="1" />

              <div style={{ display: "grid", gap: 6 }}>
                <label className="subtle">Month</label>
                <input className="input" type="month" name="month" defaultValue={month || currentMonthYYYYMM()} style={{ width: "fit-content" }} />
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
                  Tip: Hide filters to go back to “last 5 entries”.
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {/* List (scrolls if needed) */}
      <section className="card flex-1 min-h-0 flex flex-col">
        <div className="card-header shrink-0">
          <div>
            <div className="h2">{showFilters ? "Transactions" : "Recent transactions"}</div>
            <div className="subtle">
              {showFilters ? "Showing all matches." : "Showing your last 5 entries."}
            </div>
          </div>
        </div>

        <div className="card-body flex-1 min-h-0 overflow-y-auto">
          <TransactionsList
            userId={user.id}
            showFilters={showFilters}
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
  showFilters,
  q,
  month,
  categoryId,
  totalCountEver,
  resetHref,
  showFiltersHref,
}: {
  userId: string;
  showFilters: boolean;
  q: string;
  month: string; // only meaningful when showFilters === true
  categoryId: string;
  totalCountEver: number;
  resetHref: string;
  showFiltersHref: string;
}) {
  // Brand new user (no transactions ever)
  if (totalCountEver === 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>You’re all set.</div>
        <div className="subtle">Add your first transaction and it’ll show up here.</div>
      </div>
    );
  }

  let items: TxItem[] = [];

  if (!showFilters) {
    // ✅ MODE A: ignore ALL filters, show last 5 entries (most recently created)
    items = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }, // requires Transaction.createdAt in Prisma schema
      take: 5,
      include: { category: { select: { name: true } } },
    });
  } else {
    // ✅ MODE B: filters are ON -> show ALL matches
    const searchWhere = buildSearchWhere(q);

    const categoryWhere =
      categoryId && categoryId !== ""
        ? categoryId === "uncategorized"
          ? { categoryId: null }
          : { categoryId }
        : {};

    const monthValue = parseMonthParam(month) || currentMonthYYYYMM();
    const [y, m] = monthValue.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));

    items = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: start, lt: end },
        ...searchWhere,
        ...categoryWhere,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }], // stable ordering
      // no `take` => show all matches
      include: { category: { select: { name: true } } },
    });
  }

  if (items.length === 0) {
    if (!showFilters) {
      return <div className="subtle">No transactions yet.</div>;
    }
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>No matches</div>
        <div className="subtle">Try adjusting month, search, or category.</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link className="btn btn-secondary" href={showFiltersHref}>
            Adjust filters
          </Link>
          <Link className="btn" href={resetHref}>
            Go to current month
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span className="subtle">
          {showFilters ? `Showing ${items.length}` : `Showing ${items.length} (last 5 entries)`}
        </span>
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
