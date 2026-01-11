import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** ----------------------------
 * Anonymous session support
 * ---------------------------- */
const ANON_COOKIE = "zento_anon";
const ANON_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function makeCookieHeader(token: string) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${ANON_COOKIE}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ANON_MAX_AGE_SECONDS};${secure}`;
}

function parseIdFromUrl(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("id")?.trim() || null;
}

async function getUserIdFromNextAuth(): Promise<string | null> {
  const session = await getServerSession(authOptions);

  // Prefer id if present (we added it via callbacks.session)
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id;

  // Fallback: email lookup
  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function getUserIdFromAnonCookie(): Promise<string | null> {
  // ✅ cookies() is synchronous in Next App Router route handlers
  const jar = await cookies();
  const raw = jar.get(ANON_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = hashToken(raw);

  const sess = await prisma.anonSession.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!sess) return null;
  if (sess.expiresAt && sess.expiresAt.getTime() < Date.now()) return null;

  // Touch lastSeenAt (best-effort)
  prisma.anonSession
    .update({
      where: { id: sess.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  return sess.userId;
}

/**
 * Returns userId if authenticated OR has valid anon cookie.
 * Otherwise returns null.
 */
async function getUserIdOrNull(): Promise<{ userId: string | null }> {
  const authed = await getUserIdFromNextAuth();
  if (authed) return { userId: authed };

  const anon = await getUserIdFromAnonCookie();
  if (anon) return { userId: anon };

  return { userId: null };
}

/**
 * Logged-in only (NOT anon cookie).
 * Use this for Profile editing actions.
 */
async function requireAuthedUserId(): Promise<string | null> {
  const authed = await getUserIdFromNextAuth();
  return authed ?? null;
}

/**
 * For POST: if no session and no anon cookie, create anon user + cookie.
 * Always returns a non-null userId.
 */
async function getUserIdOrCreateAnonForWrite(): Promise<{
  userId: string;
  setCookie: string | null;
}> {
  const existing = await getUserIdOrNull();
  if (existing.userId) return { userId: existing.userId, setCookie: null };

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ANON_MAX_AGE_SECONDS * 1000);

  const created = await prisma.user.create({
    data: {
      isAnonymous: true,
      anonSessions: {
        create: {
          tokenHash,
          expiresAt,
        },
      },
    },
    select: { id: true },
  });

  return { userId: created.id, setCookie: makeCookieHeader(token) };
}

async function assertCategoryBelongsToUser(userId: string, categoryId: string) {
  const exists = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  return !!exists;
}

async function getNextSortOrder(userId: string): Promise<number> {
  const max = await prisma.category.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? 0) + 1;
}

export async function GET() {
  const { userId } = await getUserIdOrNull();

  // ✅ If no user context yet, return empty list (keeps UI smooth)
  if (!userId) return json([]);

  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json(categories);
}

export async function POST(req: Request) {
  // Keep existing behavior (guest flow): allow anon creation
  const { userId, setCookie } = await getUserIdOrCreateAnonForWrite();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body?.name ?? "").trim();
  if (!name) return json({ error: "name is required" }, { status: 400 });
  if (name.length > 40) {
    return json({ error: "name is too long (max 40)" }, { status: 400 });
  }

  // Append to end by default
  const sortOrder = await getNextSortOrder(userId);

  try {
    const created = await prisma.category.create({
      data: { userId, name, sortOrder },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(created, {
      status: 201,
      headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
    });
  } catch {
    // Handles unique constraint: @@unique([userId, name])
    return json(
      { error: "Category already exists (same name)." },
      { status: 409 }
    );
  }
}

/**
 * PATCH supports:
 *
 * 1) Rename (and/or set sortOrder):
 *    PATCH /api/finance/categories?id=CATEGORY_ID
 *    body: { name?: string, sortOrder?: number }
 *
 * 2) Reorder (bulk):
 *    PATCH /api/finance/categories
 *    body: { order: string[] }  // array of category ids in desired order
 *
 * Note: Editing/reordering is logged-in only (guests can view, but cannot customize).
 */
export async function PATCH(req: Request) {
  const userId = await requireAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // -------- Bulk reorder --------
  if (!id) {
    const order = body?.order;

    if (
      !Array.isArray(order) ||
      order.some((x: any) => typeof x !== "string")
    ) {
      return json(
        { error: "For reorder, body must be: { order: string[] }" },
        { status: 400 }
      );
    }

    // De-dupe while preserving order
    const ids: string[] = [];
    for (const raw of order) {
      const v = raw.trim();
      if (v && !ids.includes(v)) ids.push(v);
    }

    if (ids.length === 0) {
      return json({ error: "order cannot be empty" }, { status: 400 });
    }

    // Ensure all ids belong to user
    const found = await prisma.category.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true },
    });

    if (found.length !== ids.length) {
      return json(
        { error: "One or more category ids are invalid" },
        { status: 400 }
      );
    }

    // Apply sortOrder atomically
    await prisma.$transaction(async (tx) => {
      for (let idx = 0; idx < ids.length; idx++) {
        await tx.category.update({
          where: { id: ids[idx] },
          data: { sortOrder: idx },
        });
      }
    });

    const updated = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(updated);
  }

  // -------- Single category update (rename/sortOrder) --------
  const data: any = {};

  if (body?.name !== undefined) {
    const name = String(body?.name ?? "").trim();
    if (!name) return json({ error: "name cannot be empty" }, { status: 400 });
    if (name.length > 40)
      return json({ error: "name is too long (max 40)" }, { status: 400 });
    data.name = name;
  }

  if (body?.sortOrder !== undefined) {
    const n = body.sortOrder;
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      return json(
        { error: "sortOrder must be an integer between 0 and 100000" },
        { status: 400 }
      );
    }
    data.sortOrder = n;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Ensure category belongs to user
  const ok = await assertCategoryBelongsToUser(userId, id);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  try {
    const updated = await prisma.category.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(updated);
  } catch {
    // likely unique violation (same name)
    return json(
      { error: "Category already exists (same name)." },
      { status: 409 }
    );
  }
}

/**
 * DELETE /api/finance/categories?id=CATEGORY_ID
 * body (optional): { reassignToCategoryId?: string | null }
 *
 * Logged-in only (guests cannot customize categories).
 */
export async function DELETE(req: Request) {
  const userId = await requireAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json().catch(() => null);
  } catch {
    body = null;
  }

  const reassignRaw = body?.reassignToCategoryId;
  const reassignToCategoryId =
    reassignRaw === undefined || reassignRaw === ""
      ? undefined
      : reassignRaw === null
      ? null
      : String(reassignRaw);

  // Ensure category belongs to user
  const ok = await assertCategoryBelongsToUser(userId, id);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  // If reassign target is provided and non-null, validate it belongs to user and isn't same as id
  if (reassignToCategoryId !== undefined && reassignToCategoryId !== null) {
    if (reassignToCategoryId === id) {
      return json(
        { error: "reassignToCategoryId cannot be the same category" },
        { status: 400 }
      );
    }
    const okTarget = await assertCategoryBelongsToUser(
      userId,
      reassignToCategoryId
    );
    if (!okTarget)
      return json({ error: "Invalid reassignToCategoryId" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // Move transactions off this category first
    if (reassignToCategoryId !== undefined) {
      await tx.transaction.updateMany({
        where: { userId, categoryId: id },
        data: { categoryId: reassignToCategoryId ?? null },
      });
    } else {
      // Default behavior: set to null ("Uncategorized")
      await tx.transaction.updateMany({
        where: { userId, categoryId: id },
        data: { categoryId: null },
      });
    }

    await tx.category.delete({
      where: { id },
    });
  });

  return json({ ok: true });
}
