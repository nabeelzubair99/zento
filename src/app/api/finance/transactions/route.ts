import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionFlag } from "@prisma/client";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

type TransactionType = "EXPENSE" | "INCOME";
const ALLOWED_TYPES = new Set<TransactionType>(["EXPENSE", "INCOME"]);

function parseTransactionType(input: unknown): TransactionType | null {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim().toUpperCase();
  if (ALLOWED_TYPES.has(raw as TransactionType)) return raw as TransactionType;
  return null;
}

function parseMonth(month: string | null) {
  // expects "YYYY-MM"
  if (!month) return { ok: true as const, range: null as null };
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false as const, error: 'Invalid "month". Use YYYY-MM.' };
  }

  const [y, m] = month.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return { ok: false as const, error: 'Invalid "month". Use YYYY-MM.' };
  }

  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { ok: true as const, range: { start, end } };
}

async function getAuthedUserId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

function parseIdFromUrl(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("id")?.trim() || null;
}

function parseCategoryFilter(value: string | null) {
  // categoryId can be:
  // - null/absent => no filter
  // - "uncategorized" => categoryId IS NULL
  // - any other string => categoryId equals that string
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v === "uncategorized") return { isNull: true as const };
  return { equals: v };
}

async function assertCategoryBelongsToUser(userId: string, categoryId: string) {
  const exists = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });

  return !!exists;
}

/**
 * Flags validation (Prisma enum-backed)
 */
const ALLOWED_FLAGS = new Set<TransactionFlag>(Object.values(TransactionFlag));

function parseFlags(
  input: unknown
):
  | { ok: true; value: TransactionFlag[] | undefined }
  | { ok: false; error: string } {
  // Accept:
  // - undefined => no-op (PATCH can omit)
  // - null => clear (becomes [])
  // - [] or ["WORTH_IT", ...]
  if (input === undefined) return { ok: true as const, value: undefined };
  if (input === null) return { ok: true as const, value: [] };

  if (!Array.isArray(input)) {
    return { ok: false as const, error: "flags must be an array of strings" };
  }

  const out: TransactionFlag[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      return {
        ok: false as const,
        error: "flags must be an array of strings",
      };
    }

    const v = raw.trim().toUpperCase();

    if (!ALLOWED_FLAGS.has(v as TransactionFlag)) {
      return { ok: false as const, error: `Invalid flag: ${raw}` };
    }

    const flag = v as TransactionFlag;
    if (!out.includes(flag)) out.push(flag);
  }

  return { ok: true as const, value: out };
}

export async function GET(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);

  // Month filter
  const parsedMonth = parseMonth(url.searchParams.get("month"));
  if (!parsedMonth.ok)
    return json({ error: parsedMonth.error }, { status: 400 });

  // Optional search filter
  const q = (url.searchParams.get("q") ?? "").trim();

  // Optional category filter
  const categoryFilter = parseCategoryFilter(url.searchParams.get("categoryId"));

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      ...(parsedMonth.range
        ? { date: { gte: parsedMonth.range.start, lt: parsedMonth.range.end } }
        : {}),
      ...(q
        ? {
            description: {
              contains: q,
              mode: "insensitive",
            },
          }
        : {}),
      ...(categoryFilter
        ? categoryFilter.isNull
          ? { categoryId: null }
          : { categoryId: categoryFilter.equals }
        : {}),
    },
    orderBy: { date: "desc" },
    include: { category: true },
  });

  return json(transactions);
}

export async function POST(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const description = String(body?.description ?? "").trim();
  const notes = body?.notes ? String(body.notes) : null;

  const parsedFlags = parseFlags(body?.flags);
  if (!parsedFlags.ok)
    return json({ error: parsedFlags.error }, { status: 400 });

  // POST always sets flags (default empty)
  const flags: TransactionFlag[] = parsedFlags.value ?? [];

  // allow null/undefined/"" to mean "no category"
  const categoryIdRaw = body?.categoryId;
  const categoryId =
    categoryIdRaw === null || categoryIdRaw === undefined || categoryIdRaw === ""
      ? null
      : String(categoryIdRaw);

  const date = new Date(body?.date);
  if (Number.isNaN(date.getTime())) {
    return json({ error: "Invalid date" }, { status: 400 });
  }

  const amountCentsRaw = body?.amountCents;
  const amountCentsInput =
    typeof amountCentsRaw === "string" ? Number(amountCentsRaw) : amountCentsRaw;

  if (!Number.isInteger(amountCentsInput)) {
    return json({ error: "amountCents must be an integer" }, { status: 400 });
  }

  if (Math.abs(amountCentsInput) > 10_000_000_00) {
    return json({ error: "amountCents is out of bounds" }, { status: 400 });
  }

  if (amountCentsInput === 0) {
    return json({ error: "amountCents cannot be 0" }, { status: 400 });
  }

  if (!description) {
    return json({ error: "description is required" }, { status: 400 });
  }

  // Validate category belongs to user (if provided)
  if (categoryId) {
    const ok = await assertCategoryBelongsToUser(userId, categoryId);
    if (!ok) return json({ error: "Invalid categoryId" }, { status: 400 });
  }

  // Accept explicit type, otherwise infer from sign for backward compatibility.
  // Convention: negative => EXPENSE, positive => INCOME
  const typeFromBody = parseTransactionType(body?.type);
  if (body?.type !== undefined && !typeFromBody) {
    return json(
      { error: 'type must be "EXPENSE" or "INCOME"' },
      { status: 400 }
    );
  }

  const inferredType: TransactionType =
    amountCentsInput < 0 ? "EXPENSE" : "INCOME";
  const type: TransactionType = typeFromBody ?? inferredType;

  // Canonical: store positive cents in DB
  const amountCents = Math.abs(amountCentsInput);

  const created = await prisma.transaction.create({
    data: {
      userId,
      date,
      amountCents,
      type, // <-- requires schema update (next step)
      description,
      notes,
      flags,
      categoryId,
    },
    include: { category: true },
  });

  return json(created, { status: 201 });
}

/**
 * PATCH /api/finance/transactions?id=TRANSACTION_ID
 * Body supports partial updates:
 * { description?, amountCents?, type?, date?, notes?, flags?, categoryId? (string|null) }
 */
export async function PATCH(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Ensure the transaction belongs to this user
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true, type: true, amountCents: true },
  });

  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const data: any = {};

  if (body?.description !== undefined) {
    const description = String(body.description ?? "").trim();
    if (!description)
      return json(
        { error: "description cannot be empty" },
        { status: 400 }
      );
    data.description = description;
  }

  // type can be updated
  if (body?.type !== undefined) {
    const t = parseTransactionType(body.type);
    if (!t)
      return json({ error: 'type must be "EXPENSE" or "INCOME"' }, { status: 400 });
    data.type = t;
  }

  if (body?.amountCents !== undefined) {
    const raw = body.amountCents;
    const amountCentsInput = typeof raw === "string" ? Number(raw) : raw;

    if (!Number.isInteger(amountCentsInput)) {
      return json({ error: "amountCents must be an integer" }, { status: 400 });
    }
    if (Math.abs(amountCentsInput) > 10_000_000_00) {
      return json({ error: "amountCents is out of bounds" }, { status: 400 });
    }
    if (amountCentsInput === 0) {
      return json({ error: "amountCents cannot be 0" }, { status: 400 });
    }

    // Backward compatible behavior:
    // - if client sends negative amount and no explicit type in this PATCH, infer type from sign
    // Convention: negative => EXPENSE, positive => INCOME
    // - always store absolute cents
    if (body?.type === undefined) {
      data.type = amountCentsInput < 0 ? "EXPENSE" : "INCOME";
    }
    data.amountCents = Math.abs(amountCentsInput);
  }

  if (body?.date !== undefined) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return json({ error: "Invalid date" }, { status: 400 });
    }
    data.date = date;
  }

  if (body?.notes !== undefined) {
    data.notes = body.notes === null || body.notes === "" ? null : String(body.notes);
  }

  if (body?.flags !== undefined) {
    const parsed = parseFlags(body.flags);
    if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });

    data.flags = parsed.value ?? [];
  }

  if (body?.categoryId !== undefined) {
    const raw = body.categoryId;

    // allow null/"" to clear category
    const categoryId =
      raw === null || raw === "" || raw === undefined ? null : String(raw);

    if (categoryId) {
      const ok = await assertCategoryBelongsToUser(userId, categoryId);
      if (!ok) return json({ error: "Invalid categoryId" }, { status: 400 });
    }

    data.categoryId = categoryId;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data,
    include: { category: true },
  });

  return json(updated);
}

/**
 * DELETE /api/finance/transactions?id=TRANSACTION_ID
 */
export async function DELETE(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  // Only delete if it belongs to the user
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) return json({ error: "Not found" }, { status: 404 });

  await prisma.transaction.delete({ where: { id } });

  return json({ ok: true });
}
