import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Zento</h1>
        <p>You’re signed out.</p>
        <Link href="/api/auth/signin">Sign in with Google</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Zento</h1>
      <p>Signed in as {session.user?.email}</p>

      <div style={{ marginTop: 12 }}>
        <Link href="/api/auth/signout">Sign out</Link>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <p>Next: Transactions</p>
    </main>
  );
}
