import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs";

const ANON_COOKIE = "zento_anon";

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function clearAnonCookieHeader() {
  // Clears cookie in browser
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${ANON_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure}`;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const authedUserId = (session?.user as any)?.id as string | undefined;

  if (!authedUserId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const jar = await cookies();
  const raw = jar.get(ANON_COOKIE)?.value;

  // No guest data cookie -> nothing to import
  if (!raw) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/finance/transactions" },
    });
  }

  const tokenHash = hashToken(raw);

  const anonSess = await prisma.anonSession.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true },
  });

  if (!anonSess?.userId) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/finance/transactions",
        "Set-Cookie": clearAnonCookieHeader(),
      },
    });
  }

  if (anonSess.expiresAt && anonSess.expiresAt.getTime() < Date.now()) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/finance/transactions",
        "Set-Cookie": clearAnonCookieHeader(),
      },
    });
  }

  const anonUserId = anonSess.userId;

  // If already same user, just clear cookie + continue
  if (anonUserId === authedUserId) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/finance/transactions",
        "Set-Cookie": clearAnonCookieHeader(),
      },
    });
  }

  // Merge inside a transaction
  await prisma.$transaction(async (tx) => {
    // Ensure authed user exists
    const authedUser = await tx.user.findUnique({
      where: { id: authedUserId },
      select: { id: true },
    });
    if (!authedUser) throw new Error(`Authed user not found: ${authedUserId}`);

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
        // Move anon transactions to existing authed category
        await tx.transaction.updateMany({
          where: { userId: anonUserId, categoryId: anonCat.id },
          data: { categoryId: existingId },
        });

        // Delete anon category
        await tx.category.delete({ where: { id: anonCat.id } });
      } else {
        // Reassign category to authed user
        await tx.category.update({
          where: { id: anonCat.id },
          data: { userId: finalAuthedUserId },
        });
        authedByName.set(key, anonCat.id);
      }
    }

    // Move all anon transactions to authed user
    await tx.transaction.updateMany({
      where: { userId: anonUserId },
      data: { userId: finalAuthedUserId },
    });

    // Remove anon sessions for anon user
    await tx.anonSession.deleteMany({ where: { userId: anonUserId } });

    // Delete the anon user if truly anonymous
    await tx.user.deleteMany({
      where: { id: anonUserId, isAnonymous: true },
    });
  });

  // Clear cookie so user doesn't keep being prompted
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/finance/transactions",
      "Set-Cookie": clearAnonCookieHeader(),
    },
  });
}
