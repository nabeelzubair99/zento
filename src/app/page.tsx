import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { signIn, signOut } from "next-auth/react";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Zento</h1>

      {!session ? (
        <a href="/api/auth/signin">Sign in with Google</a>
      ) : (
        <>
          <p>Signed in as {session.user?.email}</p>
          <a href="/api/auth/signout">Sign out</a>
        </>
      )}
    </main>
  );
}
