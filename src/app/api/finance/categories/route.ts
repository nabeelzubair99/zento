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
  // ✅ cookies() is synchronous in route handlers
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

export async function GET() {
  const { userId } = await getUserIdOrNull();

  // ✅ If no user context yet, return empty list (keeps UI smooth)
  if (!userId) return json([]);

  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json(categories);
}

export async function POST(req: Request) {
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

  try {
    const created = await prisma.category.create({
      data: { userId, name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return json(created, {
      status: 201,
      headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
    });
  } catch {
    // Handles unique constraint: @@unique([userId, name])
    return json({ error: "Category already exists (same name)." }, { status: 409 });
  }
}
