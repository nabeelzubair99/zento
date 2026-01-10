import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// NOTE: This import path assumes TransactionRow lives here (based on your project structure)
import { TransactionRow } from "@/app/finance/transactions/TransactionRow";

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
    month?: string;
    q?: string;
    categoryId?: string; // "" | "uncategorized" | real id
  }>;
};

type TxItem = {
  id: string;
  description: string;
  amountCents: number; // stored positive
  type: TransactionType;
  date: Date;
  categoryId: string | null;
  notes: string | null;
  flags?: unknown;
  category: { name: string } | null;
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <main className="card">
        <div className="card-header">
          <div>
            <h1 className="h1">Reports</h1>
            <p className="subtle">Sign in to view your reports.</p>
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
  const categoryId = (params?.categoryId ?? "").trim();

  // Month range (UTC)
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const searchWhere = buildSearchWhere(q);

  const categoryWhere =
    categoryId && categoryId !== ""
      ? categoryId === "uncategorized"
        ? { categoryId: null }
        : { categoryId }
      : {};

  const items: TxItem[] = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      date: { gte: start, lt: end },
      ...searchWhere,
      ...categoryWhere,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { category: { select: { name: true } } },
  });

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <section className="card card--raised">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Reports
            </h1>
            <div className="subtle">Filter & review transactions.</div>
          </div>

          <div className="subtle" style={{ textAlign: "right" }}>
            Signed in as {email}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="card">
        <div className="card-header">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="h2">Filters</div>
            <div className="subtle">Pick a month, search, or category.</div>
          </div>
        </div>

        <div className="card-body">
          <form method="GET" style={{ display: "grid", gap: 14 }}>
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
              <select className="select" name="categoryId" defaultValue={categoryId} style={{ minWidth: 260 }}>
                <option value="">All categories</option>
                <option value="uncategorized">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-primary" type="submit">
                Apply
              </button>

              <Link className="btn" href={`/reports?month=${currentMonthYYYYMM()}`}>
                Reset
              </Link>

              <div className="subtle" style={{ marginLeft: "auto" }}>
                Showing {items.length} result{items.length === 1 ? "" : "s"}
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Results */}
      <section className="card">
        <div className="card-header">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="h2">Results</div>
            <div className="subtle">
              {month}
              {q ? ` • search: “${q}”` : ""}
              {categoryId ? ` • ${categoryId === "uncategorized" ? "Uncategorized" : "Category filter"}` : ""}
            </div>
          </div>
        </div>

        <div className="card-body">
          {items.length === 0 ? (
            <div className="subtle">No matches. Try adjusting filters.</div>
          ) : (
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
                    amountCents={t.amountCents} // already positive in DB
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
          )}
        </div>
      </section>
    </main>
  );
}
