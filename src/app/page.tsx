import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);

  // Signed-in users always land on Transactions
  if (session) {
    redirect("/finance/transactions");
  }

  return (
    <main className="card card--raised">
      <div className="card-header" style={{ flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <h1 className="h1">Welcome to Zento</h1>
          <p className="subtle" style={{ fontSize: 14, maxWidth: 560 }}>
            Track spending with a little less friction—and build better money habits over time.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
          }}
        >
          <Link className="btn btn-primary" href="/api/auth/signin">
            Continue with Google
          </Link>

          <span className="pill">
            Private by default
          </span>
          <span className="pill">
            Simple categories
          </span>
          <span className="pill">
            Fast search
          </span>
        </div>
      </div>

      <div className="card-body">
        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <div className="h2">What you can do</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              Keep it lightweight—log things in seconds, stay organized automatically.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div
              style={{
                border: "1px solid rgb(var(--border))",
                background: "rgba(255,255,255,0.55)",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: 4 }}>Add transactions fast</div>
              <div className="subtle">Log spending as it happens—without a bunch of steps.</div>
            </div>

            <div
              style={{
                border: "1px solid rgb(var(--border))",
                background: "rgba(255,255,255,0.55)",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: 4 }}>Stay organized</div>
              <div className="subtle">Use categories to spot patterns and cut the noise.</div>
            </div>

            <div
              style={{
                border: "1px solid rgb(var(--border))",
                background: "rgba(255,255,255,0.55)",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: 4 }}>Find anything</div>
              <div className="subtle">Filter by month, search, and category in seconds.</div>
            </div>

            <div
              style={{
                border: "1px solid rgb(var(--border))",
                background: "rgba(255,255,255,0.55)",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: 4 }}>Edit confidently</div>
              <div className="subtle">Fix mistakes easily, and undo deletes when needed.</div>
            </div>
          </div>

          <div
            className="subtle"
            style={{
              paddingTop: 6,
              borderTop: "1px solid rgb(var(--border))",
            }}
          >
            Your data is tied securely to your Google account.
          </div>
        </div>
      </div>
    </main>
  );
}
