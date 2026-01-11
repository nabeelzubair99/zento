import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AddTransactionForm } from "./AddTransactionForm";
import { TransactionRow } from "./TransactionRow";
import { cookies } from "next/headers";
import crypto from "crypto";

type TransactionType = "EXPENSE" | "INCOME";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

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

  // Prefer session.user.id (we added it via callbacks.session)
  const sessionUserId = (session?.user as any)?.id as string | undefined;
  if (sessionUserId) {
    const email = session?.user?.email ?? "your account";
    return {
      userId: sessionUserId,
      label: `Signed in as ${email}`,
      isAuthed: true,
    };
  }

  // Fallback: if session has email but not id, resolve user id
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
    .update({
      where: { id: sess.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  return { userId: sess.userId, label: "Using Zento on this device", isAuthed: false };
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: PageProps) {
  await searchParams;

  const { userId, label, isAuthed } = await getUserContext();

  // If we have a userId (authed or anon), we can count and list transactions.
  // If not, still render the page and let the first POST create the anon cookie.
  const totalCountEver = userId
    ? await prisma.transaction.count({ where: { userId } })
    : 0;

  return (
    <main className="z-page">
      {/* Page header row */}
      <section className="card card--raised shrink-0">
        <div className="card-header z-txHeader">
          <h1 className="h1" style={{ margin: 0 }}>
            Transactions
          </h1>

          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
            <div className="subtle z-txSignedIn">{label}</div>

            {!isAuthed ? (
              <div className="subtle" style={{ fontSize: 12 }}>
                Want to sync across devices?{" "}
                <Link
                  href="/api/auth/signin"
                  className="subtle"
                  style={{ textDecoration: "underline" }}
                >
                  Sign in
                </Link>
              </div>
            ) : null}
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

      {/* Recent list */}
      <section className="card flex-1 min-h-0 flex flex-col">
        <div className="card-header shrink-0">
          <div>
            <div className="h2">Recent transactions</div>
            <div className="subtle">Your last 5 entries.</div>
          </div>
        </div>

        <div className="card-body flex-1 min-h-0 overflow-y-auto z-scrollArea">
          {!userId ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 650 }}>You’re all set.</div>
              <div className="subtle">
                Add your first transaction and it’ll show up here.
              </div>
            </div>
          ) : (
            <TransactionsList userId={userId} totalCountEver={totalCountEver} />
          )}
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
        <div className="subtle">
          Add your first transaction and it’ll show up here.
        </div>
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
