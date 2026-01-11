import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// NOTE: This import path assumes TransactionRow lives here (based on your project structure)
import { TransactionRow } from "@/app/finance/transactions/TransactionRow";

import { cookies } from "next/headers";
import crypto from "crypto";
import { ReportsFilters } from "./ReportsFilters";

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

/** ----------------------------
 * Payment source (account) filter helpers
 * ---------------------------- */
type PaymentSourceFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "id"; id: string };

function parsePaymentSourceFilter(raw?: string): PaymentSourceFilter {
  const v = (raw ?? "").trim();
  if (!v) return { kind: "all" };
  if (v === "unassigned") return { kind: "unassigned" };
  return { kind: "id", id: v };
}

function filterToValue(f: PaymentSourceFilter): string {
  if (f.kind === "all") return "";
  if (f.kind === "unassigned") return "unassigned";
  return f.id;
}

type PageProps = {
  searchParams?: Promise<{
    month?: string;
    q?: string;
    categoryId?: string; // "" | "uncategorized" | real id
    paymentSourceId?: string; // "" | "unassigned" | real id
  }>;
};

type TxItem = {
  id: string;
  description: string;
  amountCents: number; // stored positive
  type: TransactionType;
  date: Date;
  categoryId: string | null;

  paymentSourceId: string | null;

  notes: string | null;
  flags?: unknown;
  category: { name: string } | null;

  paymentSource: { name: string } | null;
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
    return { userId: sessionUserId, label: `Signed in as ${email}`, isAuthed: true };
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

  // cookies() is NOT async in Next App Router
  const jar = await cookies();
  const raw = jar.get(ANON_COOKIE)?.value;

  if (!raw) return { userId: null, label: "Using Zento on this device", isAuthed: false };

  const tokenHash = hashToken(raw);

  const sess = await prisma.anonSession.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!sess) return { userId: null, label: "Using Zento on this device", isAuthed: false };
  if (sess.expiresAt && sess.expiresAt.getTime() < Date.now()) {
    return { userId: null, label: "Using Zento on this device", isAuthed: false };
  }

  // Touch lastSeenAt (best-effort)
  prisma.anonSession
    .update({ where: { id: sess.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return { userId: sess.userId, label: "Using Zento on this device", isAuthed: false };
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const { userId, label, isAuthed } = await getUserContext();

  const q = (params?.q ?? "").trim();
  const month = parseMonthParam(params?.month) || currentMonthYYYYMM();
  const categoryId = (params?.categoryId ?? "").trim();

  // account filter from query param
  const paymentSourceFilterFromParam = parsePaymentSourceFilter(params?.paymentSourceId);

  // Month range (UTC)
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const emptyState = !userId;

  // Fetch categories + payment sources (if we have a user)
  const [categories, paymentSources, userDefault] = emptyState
    ? [[], [], null as { defaultTransactionsPaymentSourceId: string | null } | null]
    : await Promise.all([
        prisma.category.findMany({
          where: { userId: userId! },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.paymentSource.findMany({
          where: { userId: userId! },
          orderBy: [{ name: "asc" }],
          select: { id: true, name: true, type: true },
        }),
        isAuthed
          ? prisma.user.findUnique({
              where: { id: userId! },
              select: { defaultTransactionsPaymentSourceId: true },
            })
          : Promise.resolve(null),
      ]);

  // default selection behavior
  const hasExplicitPaymentSourceParam =
    typeof params?.paymentSourceId === "string" && params.paymentSourceId.trim() !== "";

  const defaultPaymentSourceId = userDefault?.defaultTransactionsPaymentSourceId ?? null;

  const effectivePaymentSourceFilter: PaymentSourceFilter = hasExplicitPaymentSourceParam
    ? paymentSourceFilterFromParam
    : defaultPaymentSourceId
      ? { kind: "id", id: defaultPaymentSourceId }
      : { kind: "all" };

  // If default points to missing payment source, fall back to all
  const safePaymentSourceFilter: PaymentSourceFilter =
    effectivePaymentSourceFilter.kind === "id" &&
    !paymentSources.some((p) => p.id === effectivePaymentSourceFilter.id)
      ? { kind: "all" }
      : effectivePaymentSourceFilter;

  const searchWhere = buildSearchWhere(q);

  const categoryWhere =
    categoryId && categoryId !== ""
      ? categoryId === "uncategorized"
        ? { categoryId: null as any }
        : { categoryId }
      : {};

  // Account filter -> Prisma where
  const paymentSourceWhere =
    safePaymentSourceFilter.kind === "unassigned"
      ? { paymentSourceId: null as any }
      : safePaymentSourceFilter.kind === "id"
        ? { paymentSourceId: safePaymentSourceFilter.id }
        : {};

  const items: TxItem[] = emptyState
    ? []
    : await prisma.transaction.findMany({
        where: {
          userId: userId!,
          date: { gte: start, lt: end },
          ...searchWhere,
          ...categoryWhere,
          ...paymentSourceWhere,
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: {
          category: { select: { name: true } },
          paymentSource: { select: { name: true } },
        },
      });

  const paymentSourceLabel =
    safePaymentSourceFilter.kind === "all"
      ? "All accounts"
      : safePaymentSourceFilter.kind === "unassigned"
        ? "Unassigned"
        : paymentSources.find((p) => p.id === safePaymentSourceFilter.id)?.name ?? "Selected account";

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <section className="card card--raised">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              Reports
            </h1>
            <div className="subtle">Filter & review transactions.</div>

            <div className="subtle" style={{ fontSize: 12 }}>
              {label}
              {!isAuthed ? (
                <>
                  {" • "}
                  <Link href="/api/auth/signin" className="subtle" style={{ textDecoration: "underline" }}>
                    Sign in to sync
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          <div className="subtle" style={{ textAlign: "right" }}>
            {isAuthed ? "Synced" : "Guest mode"}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="card">
        <div className="card-header">
          <div style={{ display: "grid", gap: 6 }}>
            <div className="h2">Filters</div>
            <div className="subtle">Pick a month, search, category, or account.</div>
          </div>
        </div>

        <div className="card-body">
          <ReportsFilters
            month={month}
            q={q}
            categoryId={categoryId}
            paymentSourceId={filterToValue(safePaymentSourceFilter)}
            categories={categories}
            paymentSources={paymentSources.map((p) => ({ id: p.id, name: p.name }))}
            emptyState={emptyState}
          />

          <div className="subtle" style={{ marginTop: 12 }}>
            Showing {items.length} result{items.length === 1 ? "" : "s"}
          </div>
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
              {` • ${paymentSourceLabel}`}
            </div>
          </div>
        </div>

        <div className="card-body">
          {emptyState ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 650 }}>Nothing to report yet.</div>
              <div className="subtle">Add your first transaction and your reports will populate.</div>
              <Link className="btn btn-primary" href="/finance/transactions" style={{ width: "fit-content" }}>
                Add a transaction
              </Link>
            </div>
          ) : items.length === 0 ? (
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
                    amountCents={t.amountCents}
                    type={t.type}
                    dateISO={t.date.toISOString()}
                    formattedDate={formatDate(t.date)}
                    categoryId={t.categoryId}
                    categoryName={t.category?.name ?? null}
                    paymentSourceId={t.paymentSourceId}
                    paymentSourceName={t.paymentSource?.name ?? null}
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
