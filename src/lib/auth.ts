import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";

const ANON_COOKIE = "zento_anon";

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function mergeAnonIntoAuthedUser(params: {
  authedUserId: string;
  authedEmail?: string | null;
}) {
  const jar = await cookies();
  const raw = jar.get(ANON_COOKIE)?.value;
  if (!raw) return;

  const tokenHash = hashToken(raw);

  const anonSess = await prisma.anonSession.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!anonSess) return;
  if (anonSess.expiresAt && anonSess.expiresAt.getTime() < Date.now()) return;

  const anonUserId = anonSess.userId;
  const authedUserId = params.authedUserId;

  // Nothing to do if cookie already belongs to this same user
  if (!anonUserId || anonUserId === authedUserId) return;

  await prisma.$transaction(async (tx) => {
    // ✅ Ensure the authed user row exists in DB before re-pointing FKs
    let authedUser = await tx.user.findUnique({
      where: { id: authedUserId },
      select: { id: true, email: true },
    });

    // If not found by id (rare timing/adapter edge), try by email
    if (!authedUser && params.authedEmail) {
      authedUser = await tx.user.findUnique({
        where: { email: params.authedEmail },
        select: { id: true, email: true },
      });
    }

    if (!authedUser) {
      // Don't fail login; just skip merge.
      // The user can still use the app; merge can be retried later.
      throw new Error(
        `Authed user not found in DB (id=${authedUserId}, email=${params.authedEmail ?? "n/a"})`
      );
    }

    const finalAuthedUserId = authedUser.id;

    // Pull categories for both users
    const [anonCategories, authedCategories] = await Promise.all([
      tx.category.findMany({
        where: { userId: anonUserId },
        select: { id: true, name: true },
      }),
      tx.category.findMany({
        where: { userId: finalAuthedUserId },
        select: { id: true, name: true },
      }),
    ]);

    const authedByName = new Map(
      authedCategories.map((c) => [c.name.toLowerCase(), c.id])
    );

    // Merge categories with collision handling
    for (const anonCat of anonCategories) {
      const key = anonCat.name.toLowerCase();
      const existingId = authedByName.get(key);

      if (existingId) {
        // Point anon transactions to existing authed category
        await tx.transaction.updateMany({
          where: { userId: anonUserId, categoryId: anonCat.id },
          data: { categoryId: existingId },
        });

        // Remove the anon category
        await tx.category.delete({ where: { id: anonCat.id } });
      } else {
        // Move the category to the authed user
        await tx.category.update({
          where: { id: anonCat.id },
          data: { userId: finalAuthedUserId },
        });

        authedByName.set(key, anonCat.id);
      }
    }

    // Move all anon transactions to the authed user
    await tx.transaction.updateMany({
      where: { userId: anonUserId },
      data: { userId: finalAuthedUserId },
    });

    // Remove anon sessions for the anon user (invalidates cookie->db mapping)
    await tx.anonSession.deleteMany({ where: { userId: anonUserId } });

    // Delete the anon user record if it truly was anonymous
    await tx.user.deleteMany({
      where: { id: anonUserId, isAnonymous: true },
    });
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  /**
   * ✅ Use events.signIn for the merge.
   * This runs after sign-in completes (and after adapter writes),
   * avoiding FK violations caused by timing.
   */
  events: {
    async signIn({ user }) {
      try {
        await mergeAnonIntoAuthedUser({
          authedUserId: user.id,
          authedEmail: user.email,
        });
      } catch (err) {
        // Never block login if merge fails
        console.error("Anon→Authed merge failed:", err);
      }
    },
  },

  callbacks: {
    /**
     * ✅ Keep signIn callback lightweight; always allow sign-in.
     * (Do NOT merge here.)
     */
    async signIn() {
      return true;
    },

    // ✅ Ensure session.user.id is available everywhere
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
};
