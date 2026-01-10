import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AddTransactionForm } from "./AddTransactionForm";
import { TransactionRow } from "./TransactionRow";

type TransactionType = "EXPENSE" | "INCOME";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: PageProps) {
  await searchParams;

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

  const totalCountEver = await prisma.transaction.count({
    where: { userId: user.id },
  });

  return (
    <main className="z-page">
      {/* Page header row */}
      <section className="card card--raised shrink-0">
        <div className="card-header z-txHeader">
          <h1 className="h1" style={{ margin: 0 }}>
            Transactions
          </h1>

          <div className="subtle z-txSignedIn">Signed in as {email}</div>
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

      {/* Recent list */}
      <section className="card flex-1 min-h-0 flex flex-col">
        <div className="card-header shrink-0">
          <div>
            <div className="h2">Recent transactions</div>
            <div className="subtle">Your last 5 entries.</div>
          </div>
        </div>

        <div className="card-body flex-1 min-h-0 overflow-y-auto z-scrollArea">
          <TransactionsList userId={user.id} totalCountEver={totalCountEver} />
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
  totalCountEver,
}: {
  userId: string;
  totalCountEver: number;
}) {
  if (totalCountEver === 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>You’re all set.</div>
        <div className="subtle">Add your first transaction and it’ll show up here.</div>
      </div>
    );
  }

  const items: TxItem[] = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      description: true,
      amountCents: true,
      type: true,
      date: true,
      categoryId: true,
      notes: true,
      flags: true,
      category: { select: { name: true } },
    },
  });

  if (items.length === 0) {
    return <div className="subtle">No transactions yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Desktop-only list header row */}
      <div className="z-txListHeader">
        <span className="subtle">Showing {items.length} (last 5 entries)</span>
        <span className="subtle">Amount</span>
      </div>

      <ul
        style={{
          display: "grid",
          gap: 10,
          listStyle: "none",
          padding: 0,
          margin: 0,
        }}
      >
        {items.map((t) => (
          <li key={t.id} className="z-txCard">
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
