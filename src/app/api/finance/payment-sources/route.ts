import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentSourceType } from "@prisma/client";
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
 * Anonymous session support (read)
 * ---------------------------- */
const ANON_COOKIE = "zento_anon";

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function getUserIdFromNextAuth(): Promise<string | null> {
  const session = await getServerSession(authOptions);

  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id;

  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function getUserIdFromAnonCookie(): Promise<string | null> {
  // ✅ cookies() is synchronous in Next App Router
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
async function getUserIdOrNull(): Promise<{
  userId: string | null;
  isAuthed: boolean;
}> {
  const authed = await getUserIdFromNextAuth();
  if (authed) return { userId: authed, isAuthed: true };

  const anon = await getUserIdFromAnonCookie();
  if (anon) return { userId: anon, isAuthed: false };

  return { userId: null, isAuthed: false };
}

/**
 * Logged-in only for writes (Profile customization).
 */
async function requireAuthedUserId(): Promise<string | null> {
  const authed = await getUserIdFromNextAuth();
  return authed ?? null;
}

function parseIdFromUrl(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("id")?.trim() || null;
}

const ALLOWED_TYPES = new Set<string>(Object.values(PaymentSourceType));

function parsePaymentSourceType(input: unknown): PaymentSourceType | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toUpperCase();
  if (!ALLOWED_TYPES.has(v)) return null;
  return v as PaymentSourceType;
}

async function assertPaymentSourceBelongsToUser(userId: string, id: string) {
  const exists = await prisma.paymentSource.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return !!exists;
}

export async function GET() {
  const { userId } = await getUserIdOrNull();

  // If no user context, return empty list (keeps UI smooth)
  if (!userId) return json([]);

  const items = await prisma.paymentSource.findMany({
    where: { userId },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json(items);
}

/**
 * POST /api/finance/payment-sources
 * Logged-in only.
 * body: { name: string, type: "BANK" | "CARD" | "CASH" }
 */
export async function POST(req: Request) {
  const userId = await requireAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body?.name ?? "").trim();
  if (!name) return json({ error: "name is required" }, { status: 400 });
  if (name.length > 60)
    return json({ error: "name is too long (max 60)" }, { status: 400 });

  const type = parsePaymentSourceType(body?.type);
  if (!type) {
    return json(
      { error: 'type must be "BANK", "CARD", or "CASH"' },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.paymentSource.create({
      data: { userId, name, type },
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(created, { status: 201 });
  } catch {
    return json(
      { error: "Payment method already exists (same name)." },
      { status: 409 }
    );
  }
}

/**
 * PATCH /api/finance/payment-sources?id=PAYMENT_SOURCE_ID
 * Logged-in only.
 * body: { name?: string, type?: "BANK" | "CARD" | "CASH" }
 */
export async function PATCH(req: Request) {
  const userId = await requireAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  const ok = await assertPaymentSourceBelongsToUser(userId, id);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: any = {};

  if (body?.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return json({ error: "name cannot be empty" }, { status: 400 });
    if (name.length > 60)
      return json({ error: "name is too long (max 60)" }, { status: 400 });
    data.name = name;
  }

  if (body?.type !== undefined) {
    const type = parsePaymentSourceType(body.type);
    if (!type) {
      return json(
        { error: 'type must be "BANK", "CARD", or "CASH"' },
        { status: 400 }
      );
    }
    data.type = type;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.paymentSource.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return json(updated);
  } catch {
    return json({ error: "Update failed." }, { status: 400 });
  }
}

/**
 * DELETE /api/finance/payment-sources?id=PAYMENT_SOURCE_ID
 * Logged-in only.
 *
 * Behavior:
 * - Unassign all transactions that referenced this payment source
 * - Clear user's default if it referenced this payment source
 * - Delete payment source
 */
export async function DELETE(req: Request) {
  const userId = await requireAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  const ok = await assertPaymentSourceBelongsToUser(userId, id);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // Unassign transactions (so history stays)
    await tx.transaction.updateMany({
      where: { userId, paymentSourceId: id },
      data: { paymentSourceId: null },
    });

    // If this was user's default, clear it to "All accounts"
    await tx.user.updateMany({
      where: { id: userId, defaultTransactionsPaymentSourceId: id },
      data: { defaultTransactionsPaymentSourceId: null },
    });

    // Delete payment source
    await tx.paymentSource.delete({
      where: { id },
    });
  });

  return json({ ok: true });
}
