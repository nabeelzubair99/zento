import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PaymentSourcesSection from "./PaymentSourcesSection";
import CategoriesSection from "./CategoriesSection";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  const userId = (session?.user as any)?.id as string | undefined;
  const email = session?.user?.email ?? null;
  const name = session?.user?.name ?? null;
  const isAuthed = Boolean(userId);

  // Fetch data for authed users only
  const [{ paymentSources, categories, defaultPaymentSourceId } = {
    paymentSources: [],
    categories: [],
    defaultPaymentSourceId: null as string | null,
  }] = isAuthed
    ? await Promise.all([
        (async () => {
          const [paymentSources, categories, user] = await Promise.all([
            prisma.paymentSource.findMany({
              where: { userId: userId! },
              orderBy: [{ name: "asc" }],
              select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
            }),
            prisma.category.findMany({
              where: { userId: userId! },
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              select: { id: true, name: true, sortOrder: true, createdAt: true, updatedAt: true },
            }),
            prisma.user.findUnique({
              where: { id: userId! },
              select: { defaultTransactionsPaymentSourceId: true },
            }),
          ]);

          return {
            paymentSources,
            categories,
            defaultPaymentSourceId: user?.defaultTransactionsPaymentSourceId ?? null,
          };
        })(),
      ])
    : [];

  return (
    <main className="z-page">
      <section className="card card--raised shrink-0">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 className="h1" style={{ margin: 0 }}>
              Profile
            </h1>
            <div className="subtle" style={{ marginTop: 6 }}>
              Manage your settings.
            </div>
          </div>

          {!isAuthed ? (
            <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
              <div className="subtle" style={{ fontSize: 12 }}>
                Guest mode
              </div>
              <Link
                href="/api/auth/signin"
                className="subtle"
                style={{ textDecoration: "underline", fontSize: 12 }}
              >
                Sign in to customize
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
              <div className="subtle" style={{ fontSize: 12 }}>
                Signed in{name || email ? ` as ${name ?? email}` : ""}
              </div>
              <Link
                href="/api/auth/signout"
                className="subtle"
                style={{ textDecoration: "underline", fontSize: 12 }}
              >
                Sign out
              </Link>
            </div>
          )}
        </div>
      </section>

      {!isAuthed ? (
        <section className="card shrink-0">
          <div className="card-body" style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 650 }}>You’re in Guest mode.</div>
            <div className="subtle">
              To add payment methods and manage categories, you’ll need to sign in.
            </div>
            <div>
              <Link className="btn btn-primary" href="/api/auth/signin">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* Payment methods */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Payment methods</div>
            <div className="subtle">Banks, cards, and cash (used on the Transactions page).</div>
          </div>
        </div>
        <div className="card-body">
          <PaymentSourcesSection
            isAuthed={isAuthed}
            initialItems={paymentSources}
            initialDefaultId={defaultPaymentSourceId}
          />
        </div>
      </section>

      {/* Categories */}
      <section className="card">
        <div className="card-header">
          <div>
            <div className="h2">Categories</div>
            <div className="subtle">Rename, delete, and reorder your categories.</div>
          </div>
        </div>
        <div className="card-body">
          <CategoriesSection isAuthed={isAuthed} initialItems={categories} />
        </div>
      </section>
    </main>
  );
}
