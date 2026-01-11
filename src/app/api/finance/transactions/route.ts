import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionFlag } from "@prisma/client";
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

function parseLocalDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  // Create a local-time date (prevents UTC shift)
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
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

  prisma.anonSession
    .update({
      where: { id: sess.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  return sess.userId;
}

async function getUserIdOrNull(): Promise<{ userId: string | null }> {
  const authed = await getUserIdFromNextAuth();
  if (authed) return { userId: authed };

  const anon = await getUserIdFromAnonCookie();
  if (anon) return { userId: anon };

  return { userId: null };
}

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

/** ----------------------------
 * Existing route logic below
 * ---------------------------- */

type TransactionType = "EXPENSE" | "INCOME";
const ALLOWED_TYPES = new Set<TransactionType>(["EXPENSE", "INCOME"]);

function parseTransactionType(input: unknown): TransactionType | null {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim().toUpperCase();
  if (ALLOWED_TYPES.has(raw as TransactionType)) return raw as TransactionType;
  return null;
}

function parseMonth(month: string | null) {
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

function parseIdFromUrl(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("id")?.trim() || null;
}

function parseCategoryFilter(value: string | null) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v === "uncategorized") return { isNull: true as const };
  return { equals: v };
}

function parsePaymentSourceFilter(value: string | null) {
  if (!value) return null;
  const v = value.trim();
  if (!v || v === "all") return null;
  if (v === "unassigned") return { isNull: true as const };
  return { equals: v };
}

function parseLimit(value: string | null) {
  if (!value) return { ok: true as const, value: null as number | null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      ok: false as const,
      error: 'Invalid "limit". Must be a positive integer.',
    };
  }
  return { ok: true as const, value: Math.min(n, 200) };
}

async function assertCategoryBelongsToUser(userId: string, categoryId: string) {
  const exists = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  return !!exists;
}

async function assertPaymentSourceBelongsToUser(
  userId: string,
  paymentSourceId: string
) {
  const exists = await prisma.paymentSource.findFirst({
    where: { id: paymentSourceId, userId },
    select: { id: true },
  });
  return !!exists;
}

const ALLOWED_FLAGS = new Set<TransactionFlag>(Object.values(TransactionFlag));

function parseFlags(
  input: unknown
):
  | { ok: true; value: TransactionFlag[] | undefined }
  | { ok: false; error: string } {
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
  const { userId } = await getUserIdOrNull();

  // ✅ Smooth UX: no user context yet => empty list
  if (!userId) return json([]);

  const url = new URL(req.url);

  const parsedMonth = parseMonth(url.searchParams.get("month"));
  if (!parsedMonth.ok)
    return json({ error: parsedMonth.error }, { status: 400 });

  const q = (url.searchParams.get("q") ?? "").trim();

  const categoryFilter = parseCategoryFilter(
    url.searchParams.get("categoryId")
  );

  const paymentSourceFilter = parsePaymentSourceFilter(
    url.searchParams.get("paymentSourceId")
  );

  const parsedLimit = parseLimit(url.searchParams.get("limit"));
  if (!parsedLimit.ok)
    return json({ error: parsedLimit.error }, { status: 400 });

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
      ...(paymentSourceFilter
        ? paymentSourceFilter.isNull
          ? { paymentSourceId: null }
          : { paymentSourceId: paymentSourceFilter.equals }
        : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: parsedLimit.value ?? undefined,
    include: { category: true, paymentSource: true },
  });

  return json(transactions);
}

export async function POST(req: Request) {
  const { userId, setCookie } = await getUserIdOrCreateAnonForWrite();

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

  const flags: TransactionFlag[] = parsedFlags.value ?? [];

  const categoryIdRaw = body?.categoryId;
  const categoryId =
    categoryIdRaw === null ||
    categoryIdRaw === undefined ||
    categoryIdRaw === ""
      ? null
      : String(categoryIdRaw);

  const paymentSourceIdRaw = body?.paymentSourceId;
  const paymentSourceId =
    paymentSourceIdRaw === null ||
    paymentSourceIdRaw === undefined ||
    paymentSourceIdRaw === ""
      ? null
      : String(paymentSourceIdRaw);

  const date = parseLocalDateOnly(body?.date);
  if (!date) return json({ error: "Invalid date" }, { status: 400 });

  const amountCentsRaw = body?.amountCents;
  const amountCentsInput =
    typeof amountCentsRaw === "string"
      ? Number(amountCentsRaw)
      : amountCentsRaw;

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

  if (categoryId) {
    const ok = await assertCategoryBelongsToUser(userId, categoryId);
    if (!ok) return json({ error: "Invalid categoryId" }, { status: 400 });
  }

  if (paymentSourceId) {
    const ok = await assertPaymentSourceBelongsToUser(userId, paymentSourceId);
    if (!ok) return json({ error: "Invalid paymentSourceId" }, { status: 400 });
  }

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

  const amountCents = Math.abs(amountCentsInput);

  const created = await prisma.transaction.create({
    data: {
      userId,
      date,
      amountCents,
      type,
      description,
      notes,
      flags,
      categoryId,
      paymentSourceId,
    },
    include: { category: true, paymentSource: true },
  });

  return json(created, {
    status: 201,
    headers: setCookie ? { "Set-Cookie": setCookie } : undefined,
  });
}

export async function PATCH(req: Request) {
  const { userId } = await getUserIdOrNull();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const data: any = {};

  if (body?.description !== undefined) {
    const description = String(body.description ?? "").trim();
    if (!description)
      return json({ error: "description cannot be empty" }, { status: 400 });
    data.description = description;
  }

  if (body?.type !== undefined) {
    const t = parseTransactionType(body.type);
    if (!t)
      return json(
        { error: 'type must be "EXPENSE" or "INCOME"' },
        { status: 400 }
      );
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

    if (body?.type === undefined) {
      data.type = amountCentsInput < 0 ? "EXPENSE" : "INCOME";
    }
    data.amountCents = Math.abs(amountCentsInput);
  }

  if (body?.date !== undefined) {
    const date = parseLocalDateOnly(body?.date);
    if (!date) return json({ error: "Invalid date" }, { status: 400 });
    data.date = date;
  }

  if (body?.notes !== undefined) {
    data.notes =
      body.notes === null || body.notes === "" ? null : String(body.notes);
  }

  if (body?.flags !== undefined) {
    const parsed = parseFlags(body.flags);
    if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });
    data.flags = parsed.value ?? [];
  }

  if (body?.categoryId !== undefined) {
    const raw = body.categoryId;
    const categoryId =
      raw === null || raw === "" || raw === undefined ? null : String(raw);

    if (categoryId) {
      const ok = await assertCategoryBelongsToUser(userId, categoryId);
      if (!ok) return json({ error: "Invalid categoryId" }, { status: 400 });
    }

    data.categoryId = categoryId;
  }

  if (body?.paymentSourceId !== undefined) {
    const raw = body.paymentSourceId;
    const paymentSourceId =
      raw === null || raw === "" || raw === undefined ? null : String(raw);

    if (paymentSourceId) {
      const ok = await assertPaymentSourceBelongsToUser(
        userId,
        paymentSourceId
      );
      if (!ok)
        return json({ error: "Invalid paymentSourceId" }, { status: 400 });
    }

    data.paymentSourceId = paymentSourceId;
  }

  if (Object.keys(data).length === 0) {
    return json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data,
    include: { category: true, paymentSource: true },
  });

  return json(updated);
}

export async function DELETE(req: Request) {
  const { userId } = await getUserIdOrNull();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const id = parseIdFromUrl(req);
  if (!id) return json({ error: 'Missing "id" query param' }, { status: 400 });

  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) return json({ error: "Not found" }, { status: 404 });

  await prisma.transaction.delete({ where: { id } });

  return json({ ok: true });
}
