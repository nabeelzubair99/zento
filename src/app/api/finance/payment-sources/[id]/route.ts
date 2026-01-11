import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentSourceType } from "@prisma/client";

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

async function getAuthedUserId(): Promise<string | null> {
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

function getIdFromReq(req: Request): string | null {
  // Works reliably in App Router route handlers
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1];
  return id ? decodeURIComponent(id) : null;
}

const ALLOWED_TYPES = new Set<string>(Object.values(PaymentSourceType));

function parsePaymentSourceType(input: unknown): PaymentSourceType | null {
  if (input === undefined) return null;
  if (input === null) return null;
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

/**
 * PATCH /api/finance/payment-sources/:id
 * body: { name?: string, type?: "BANK" | "CARD" | "CASH" }
 */
export async function PATCH(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = getIdFromReq(req);
  if (!id) return json({ error: "Missing id" }, { status: 400 });

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
    const name = String(body?.name ?? "").trim();
    if (!name) return json({ error: "name cannot be empty" }, { status: 400 });
    if (name.length > 60)
      return json({ error: "name is too long (max 60)" }, { status: 400 });
    data.name = name;
  }

  if (body?.type !== undefined) {
    const type = parsePaymentSourceType(body?.type);
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
    // likely @@unique([userId, name]) conflict
    return json(
      { error: "Payment method already exists (same name)." },
      { status: 409 }
    );
  }
}

/**
 * DELETE /api/finance/payment-sources/:id
 * Logged-in only.
 *
 * Behavior:
 * - Transactions referencing it become unassigned (paymentSourceId = null)
 * - User default filter cleared if it pointed to this payment source
 * - Payment source deleted
 */
export async function DELETE(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = getIdFromReq(req);
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const ok = await assertPaymentSourceBelongsToUser(userId, id);
  if (!ok) return json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // Unassign transactions
    await tx.transaction.updateMany({
      where: { userId, paymentSourceId: id },
      data: { paymentSourceId: null },
    });

    // Clear saved default if it points here
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
