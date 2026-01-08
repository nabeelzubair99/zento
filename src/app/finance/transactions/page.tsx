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

type PageProps = {
  searchParams?: { q?: string; month?: string; categoryId?: string };
};

export default async function TransactionsPage({ searchParams }: PageProps) {
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

  const q = (searchParams?.q ?? "").trim();
  const month = parseMonthParam(searchParams?.month) || currentMonthYYYYMM();
  const categoryId = (searchParams?.categoryId ?? "").trim(); // "" | "uncategorized" | real id

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <section className="card">
        <div className="card-header">
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Transactions
            </h1>
            <div className="subtle">Signed in as {email}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" href="/">
              Home
            </Link>
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
            <div style={{ fontWeight: 650 }}>Add a transaction</div>
            <div className="subtle">Quickly log spending as it happens.</div>
          </div>
        </div>
        <div className="card-body">
          <AddTransactionForm />
        </div>
      </section>

      {/* Filters */}
      <section className="card">
        <div className="card-header">
          <div>
            <div style={{ fontWeight: 650 }}>Filters</div>
            <div className="subtle">Narrow down by month, keyword, or category.</div>
          </div>
        </div>

        <div className="card-body">
          <form method="GET" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="subtle">Month</label>
              <input className="input" type="month" name="month" defaultValue={month} style={{ width: "fit-content" }} />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="subtle">Search</label>
              <input className="input" name="q" defaultValue={q} placeholder="Search description…" />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="subtle">Category</label>
              <select className="select" name="categoryId" defaultValue={categoryId} style={{ width: "fit-content", minWidth: 240 }}>
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
              <Link className="btn" href={`/finance/transactions?month=${encodeURIComponent(currentMonthYYYYMM())}`}>
                Reset
              </Link>

              <div className="subtle" style={{ marginLeft: "auto" }}>
                Tip: Use month + category to see patterns.
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* List */}
      <section className="card">
        <div className="card-header">
          <div>
            <div style={{ fontWeight: 650 }}>Recent transactions</div>
            <div className="subtle">Your latest items for the selected month.</div>
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
        <div className="subtle">Try clearing filters or selecting a different month.</div>
      </div>
    );
  }

  const totalCents = items.reduce((sum, t) => sum + t.amountCents, 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <span className="subtle">
            Showing {items.length} (last 50) • {month}
            {q ? ` • search: “${q}”` : ""}
            {categoryId ? ` • ${categoryId === "uncategorized" ? "Uncategorized" : "Category filter"}` : ""}
          </span>
          <span style={{ fontWeight: 750, fontSize: 16 }}>Total: {formatMoney(totalCents)}</span>
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
